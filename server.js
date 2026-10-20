const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const { handlePastExperiences, handleSitemap } = require("./lib/past-experiences");
const {
  findEligibleTrip,
  formatSubmissionDate,
  handleClaimPage,
  isClaimPage,
  isValidEmail,
  isValidPersonName,
  normalizeCellPhone,
} = require("./lib/registration");
const { handleUpcomingPage, isTemplateFile, isUpcomingPage } = require("./lib/upcoming");
const { currentClock, loadTrips } = require("./lib/trips");

const PORT = process.env.PORT || 10000;
const ROOT_DIR = __dirname;
const DEFAULT_TO_EMAIL = "info@elitetravelsportsusa.com";
const DEFAULT_FROM_EMAIL = "info@elitetravelsportsusa.com";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const RECAPTCHA_ACTION = "submit_inquiry";
const DEFAULT_RECAPTCHA_MIN_SCORE = 0.5;

const FIELD_LABELS = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  sms_marketing: "Marketing Messages",
  sms_transactional: "Transactional Messages",
  inquiry_source: "Inquiry Source",
  morocco_program: "Morocco Program",
  optional_extension: "Optional Extension",
  arrival_date: "Arrival Date",
  departure_date: "Departure Date",
  worldwide_experience: "Worldwide Experience",
  preferred_sport: "Preferred Sport",
  travel_type: "Travel Type",
  destination_interest: "Destination Interest",
  estimated_group_size: "Estimated Group Size",
  preferred_travel_window: "Preferred Travel Window",
  desired_hotel_travel_style: "Desired Hotel / Travel Style",
  notes: "Notes",
  blackout_window_checked: "Blackout Window Checked",
  pricing_note: "Pricing Note",
};

const INTERNAL_FIELDS = new Set(["_gotcha", "_replyto", "_subject", "recaptcha_token"]);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

// The site is served from the repository root, so project files beside it must be kept private.
const PRIVATE_DIRS = new Set(["data", "lib", "mobile-screenshots", "node_modules", "tests"]);
const PRIVATE_ROOT_FILES = new Set([
  "master_cleanup_list.md",
  "package-lock.json",
  "package.json",
  "playwright.config.js",
  "readme.md",
  "render.yaml",
  "server.js",
]);

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
}

function handlePublicConfig(req, res) {
  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  return sendJson(res, 200, {
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || "",
    recaptchaAction: RECAPTCHA_ACTION,
  });
}

function cleanValue(value) {
  if (Array.isArray(value)) {
    return value.map(cleanValue).filter(Boolean).join(", ");
  }
  if (typeof value !== "string") return "";
  return value.trim();
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEntries(payload) {
  return Object.entries(payload)
    .filter(([key]) => !INTERNAL_FIELDS.has(key))
    .map(([key, value]) => [FIELD_LABELS[key] || key, cleanValue(value)])
    .filter(([, value]) => value);
}

function buildEmailHtml(payload) {
  const rows = buildEntries(payload)
    .map(
      ([label, value]) => `
        <tr>
          <th align="left" style="padding:8px 12px;border-bottom:1px solid #ececec;width:220px;">${escapeHtml(label)}</th>
          <td style="padding:8px 12px;border-bottom:1px solid #ececec;">${escapeHtml(value).replace(/\n/g, "<br>")}</td>
        </tr>`,
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#1f2933;line-height:1.5;">
      <h2 style="margin:0 0 16px;">New Elite Travel & Sports Inquiry</h2>
      <table style="border-collapse:collapse;width:100%;max-width:760px;">${rows}</table>
    </div>`;
}

function buildAutoResponseHtml(payload) {
  const name = cleanValue(payload.name);
  const firstName = name ? name.split(/\s+/)[0] : "there";
  const diagnostics = getSubmissionDiagnostics(payload);
  const programLine = diagnostics.program
    ? `<p><strong>Experience noted:</strong> ${escapeHtml(diagnostics.program)}</p>`
    : "";
  const sourceLine = diagnostics.page
    ? `<p><strong>Inquiry type:</strong> ${escapeHtml(diagnostics.page)}</p>`
    : "";

  return `
    <div style="font-family:Arial,sans-serif;color:#1f2933;line-height:1.6;max-width:680px;">
      <h2 style="margin:0 0 16px;">We received your Elite Travel & Sports inquiry</h2>
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>
        Thank you for reaching out to Elite Travel & Sports. Your inquiry has been received, and our planning team
        will review your details personally before replying with the most relevant next steps.
      </p>
      ${sourceLine}
      ${programLine}
      <p>
        If you need to add anything in the meantime, you can reply directly to this email or reach us at
        info@elitetravelsportsusa.com.
      </p>
      <p style="margin-top:24px;">
        Warmly,<br />
        Elite Travel & Sports
      </p>
    </div>`;
}

function getSubmissionDiagnostics(payload) {
  return {
    name: cleanValue(payload.name),
    email: cleanValue(payload.email),
    page: cleanValue(payload.inquiry_source),
    program:
      cleanValue(payload.morocco_program) ||
      cleanValue(payload.worldwide_experience) ||
      cleanValue(payload.destination_interest),
  };
}

function getSafeErrorDetails(error) {
  if (!error || typeof error !== "object") {
    return error;
  }

  return {
    name: error.name,
    message: error.message,
    status: error.status,
    statusCode: error.statusCode,
    response: error.response
      ? {
          status: error.response.status,
          data: error.response.data,
        }
      : undefined,
    stack: error.stack,
  };
}

// Local/CI only. Never enabled on Render. Does not accept live traffic without real secrets.
function isSafeTestMode() {
  return process.env.ELITE_SAFE_TEST_MODE === "1" && !process.env.RENDER;
}

function getMicrosoftConfig() {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    if (isSafeTestMode() && process.env.ELITE_TEST_MAIL_SINK) {
      return {
        tenantId: "elite-test-tenant",
        clientId: "elite-test-client",
        clientSecret: "elite-test-client-secret",
        from: process.env.MAIL_FROM_EMAIL || DEFAULT_FROM_EMAIL,
        to: process.env.INQUIRY_TO_EMAIL || DEFAULT_TO_EMAIL,
        safeTestMode: true,
      };
    }
    return null;
  }

  return {
    tenantId,
    clientId,
    clientSecret,
    from: process.env.MAIL_FROM_EMAIL || DEFAULT_FROM_EMAIL,
    to: process.env.INQUIRY_TO_EMAIL || DEFAULT_TO_EMAIL,
  };
}

async function getMicrosoftAccessToken(config) {
  const tokenResponse = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "client_credentials",
        scope: GRAPH_SCOPE,
      }),
    },
  );

  if (!tokenResponse.ok) {
    const error = new Error("Microsoft token request failed.");
    error.status = tokenResponse.status;
    error.response = {
      status: tokenResponse.status,
      data: await tokenResponse.text(),
    };
    throw error;
  }

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error("Microsoft token response did not include an access token.");
  }

  return tokenData.access_token;
}

async function sendMicrosoftEmail({ config, toEmail, subject, replyToEmail, replyToName, html }) {
  // Safe local/CI sink: records the same payload Graph would send, without network or live delivery.
  if (isSafeTestMode() && process.env.ELITE_TEST_MAIL_SINK) {
    if (process.env.ELITE_TEST_MAIL_FAIL === "1") {
      const error = new Error("Microsoft Graph sendMail failed.");
      error.status = 500;
      error.response = { status: 500, data: "elite-test mail fail" };
      throw error;
    }
    const record = {
      toEmail: toEmail || config.to,
      fromEmail: config.from,
      subject,
      replyToEmail,
      replyToName,
      html,
      at: new Date().toISOString(),
    };
    fs.appendFileSync(process.env.ELITE_TEST_MAIL_SINK, `${JSON.stringify(record)}\n`, "utf8");
    console.log("microsoft-mail safe-test sink", {
      toEmail: record.toEmail,
      fromEmail: record.fromEmail,
      subject: record.subject,
    });
    return;
  }

  const accessToken = await getMicrosoftAccessToken(config);
  const graphResponse = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.from)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: "HTML",
            content: html,
          },
          toRecipients: [
            {
              emailAddress: {
                address: toEmail || config.to,
              },
            },
          ],
          replyTo: [
            {
              emailAddress: {
                address: replyToEmail,
                name: replyToName,
              },
            },
          ],
        },
        saveToSentItems: false,
      }),
    },
  );

  if (!graphResponse.ok) {
    const error = new Error("Microsoft Graph sendMail failed.");
    error.status = graphResponse.status;
    error.response = {
      status: graphResponse.status,
      data: await graphResponse.text(),
    };
    throw error;
  }
}

function getRecaptchaMinScore() {
  const score = Number(process.env.RECAPTCHA_MIN_SCORE);
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    return DEFAULT_RECAPTCHA_MIN_SCORE;
  }
  return score;
}

async function verifyRecaptcha(payload, req) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  const token = cleanValue(payload.recaptcha_token);

  if (!secret) {
    return {
      ok: false,
      error:
        "This form is temporarily unavailable. Please try again shortly, or email info@elitetravelsportsusa.com.",
      log: "RECAPTCHA_SECRET_KEY is missing.",
    };
  }

  if (!token) {
    return {
      ok: false,
      error: "Spam protection failed. Please refresh the page and try again.",
      log: "Missing reCAPTCHA token.",
    };
  }

  // Local/CI only. Production always calls Google siteverify — never skipped on Render.
  if (isSafeTestMode() && secret === "elite-test-secret" && token === "elite-test-token") {
    return {
      ok: true,
      log: { action: RECAPTCHA_ACTION, score: 1, minScore: getRecaptchaMinScore(), safeTestMode: true },
    };
  }

  let data;
  if (isSafeTestMode() && process.env.ELITE_MOCK_EXTERNAL_APIS === "1") {
    // Simulated Google siteverify payloads for automated tests (no network).
    if (token === "elite-mock-recaptcha-pass") {
      data = { success: true, action: RECAPTCHA_ACTION, score: 0.9 };
    } else if (token === "elite-mock-recaptcha-fail") {
      data = { success: false, action: RECAPTCHA_ACTION, score: 0.1, "error-codes": ["invalid-input-response"] };
    } else {
      data = { success: false, "error-codes": ["timeout-or-duplicate"] };
    }
    console.log("submit-recaptcha safe-test mock siteverify", {
      success: data.success,
      action: data.action,
      score: data.score,
    });
  } else {
    const verifyResponse = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "",
      }),
    });
    data = await verifyResponse.json();
  }

  const minScore = getRecaptchaMinScore();
  const ok =
    data.success === true &&
    data.action === RECAPTCHA_ACTION &&
    typeof data.score === "number" &&
    data.score >= minScore;

  if (!ok) {
    return {
      ok: false,
      error: "Spam protection failed. Please refresh the page and try again.",
      log: {
        success: data.success,
        action: data.action,
        score: data.score,
        minScore,
        errorCodes: data["error-codes"],
      },
    };
  }

  return { ok: true, log: { action: data.action, score: data.score, minScore } };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });

    req.on("error", reject);
  });
}

function buildRegistrationEmailHtml({ name, email, phoneE164, trip, smsConsent, submittedAt }) {
  const rows = [
    ["Full Name", name],
    ["Email Address", email],
    ["Cell Phone Number", phoneE164],
    ["Experience", trip.title],
    ["Trip Date", trip.dates],
    ["Submission Date", submittedAt],
    ["SMS Consent", smsConsent],
  ]
    .map(
      ([label, value]) => `
        <tr>
          <th align="left" style="padding:10px 12px;border-bottom:1px solid #ececec;width:220px;vertical-align:top;">${escapeHtml(label)}</th>
          <td style="padding:10px 12px;border-bottom:1px solid #ececec;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#1f2933;line-height:1.55;">
      <h2 style="margin:0 0 8px;">New Elite Registration Request</h2>
      <p style="margin:0 0 18px;color:#52606d;">
        A traveler requested a place on <strong>${escapeHtml(trip.title)}</strong>. Follow up manually with secure
        deposit instructions for this experience. No payment was collected on the website.
      </p>
      <table style="border-collapse:collapse;width:100%;max-width:760px;background:#fff;border:1px solid #e4e7eb;border-radius:8px;">
        ${rows}
      </table>
    </div>`;
}

async function handleInquiry(req, res) {
  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid request." });
  }

  if (cleanValue(payload._gotcha)) {
    return sendJson(res, 200, { ok: true });
  }

  const name = cleanValue(payload.name);
  const email = cleanValue(payload.email);
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 400, { error: "Please provide a valid name and email address." });
  }

  const microsoftConfig = getMicrosoftConfig();
  console.log("submit-inquiry received", getSubmissionDiagnostics(payload));
  console.log("submit-inquiry mail config", {
    MAIL_FROM_EMAIL: process.env.MAIL_FROM_EMAIL || DEFAULT_FROM_EMAIL,
    INQUIRY_TO_EMAIL: process.env.INQUIRY_TO_EMAIL || DEFAULT_TO_EMAIL,
    hasMicrosoftTenantId: Boolean(process.env.MICROSOFT_TENANT_ID),
    hasMicrosoftClientId: Boolean(process.env.MICROSOFT_CLIENT_ID),
    hasMicrosoftClientSecret: Boolean(process.env.MICROSOFT_CLIENT_SECRET),
  });

  let recaptchaResult;
  try {
    recaptchaResult = await verifyRecaptcha(payload, req);
  } catch (error) {
    console.error("submit-inquiry recaptcha verification failed");
    console.error(getSafeErrorDetails(error));
    return sendJson(res, 500, {
      error: "Spam protection could not be verified. Please try again shortly.",
    });
  }

  console.log("submit-inquiry recaptcha result", recaptchaResult.log);
  if (!recaptchaResult.ok) {
    return sendJson(res, 400, { error: recaptchaResult.error });
  }

  if (!microsoftConfig) {
    return sendJson(res, 500, { error: "Email service is not configured." });
  }

  try {
    await sendMicrosoftEmail({
      config: microsoftConfig,
      toEmail: microsoftConfig.to,
      subject: cleanValue(payload._subject) || "New Elite Travel & Sports Inquiry",
      replyToEmail: email,
      replyToName: name,
      html: buildEmailHtml(payload),
    });

    try {
      await sendMicrosoftEmail({
        config: microsoftConfig,
        toEmail: email,
        subject: "We received your Elite Travel & Sports inquiry",
        replyToEmail: microsoftConfig.to,
        replyToName: "Elite Travel & Sports",
        html: buildAutoResponseHtml(payload),
      });
    } catch (error) {
      console.error("submit-inquiry auto-response failed");
      console.error(error && error.message);
      console.error(error && (error.status || error.statusCode));
      console.error(error && error.response && error.response.data);
      console.error(getSafeErrorDetails(error));
    }

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("submit-inquiry email send failed");
    console.error(error && error.message);
    console.error(error && (error.status || error.statusCode));
    console.error(error && error.response && error.response.data);
    console.error(getSafeErrorDetails(error));

    return sendJson(res, 500, {
      error: "The email service is temporarily unavailable. Please email info@elitetravelsportsusa.com directly.",
    });
  }
}

async function handleRegistration(req, res) {
  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid request." });
  }

  // Honeypot: pretend success without emailing.
  if (cleanValue(payload._gotcha)) {
    return sendJson(res, 200, { ok: true });
  }

  const name = cleanValue(payload.name);
  const email = cleanValue(payload.email);
  const experienceSlug = cleanValue(payload.experience);
  const smsConsentRaw = cleanValue(payload.sms_registration_consent);
  const smsConsent = smsConsentRaw === "Yes" || smsConsentRaw.toLowerCase() === "true";

  if (!isValidPersonName(name)) {
    return sendJson(res, 400, { error: "Please provide your full name." });
  }
  if (!isValidEmail(email)) {
    return sendJson(res, 400, {
      error: "Please provide a valid email address. Format is checked here; mailbox delivery is not verified.",
    });
  }
  if (!smsConsent) {
    return sendJson(res, 400, {
      error: "Please confirm you agree to receive text messages about your registration request.",
    });
  }

  const phoneResult = normalizeCellPhone(cleanValue(payload.phone_e164) || cleanValue(payload.phone));
  if (!phoneResult.ok) {
    return sendJson(res, 400, { error: phoneResult.error });
  }

  let trips;
  try {
    trips = loadTrips();
  } catch (error) {
    console.error("submit-registration trip load failed");
    console.error(getSafeErrorDetails(error));
    return sendJson(res, 500, {
      error: "Registration is temporarily unavailable. Please email info@elitetravelsportsusa.com directly.",
    });
  }

  const clock = currentClock();
  const trip = findEligibleTrip(experienceSlug, trips, clock);
  if (!trip) {
    return sendJson(res, 400, {
      error: "Please select a current Elite experience that is open for registration.",
    });
  }

  const microsoftConfig = getMicrosoftConfig();
  console.log("submit-registration received", {
    name,
    email,
    experience: trip.slug,
    phoneE164: phoneResult.e164,
    smsConsent: smsConsent ? "Yes" : "No",
  });
  console.log("submit-registration mail config", {
    MAIL_FROM_EMAIL: process.env.MAIL_FROM_EMAIL || DEFAULT_FROM_EMAIL,
    // Intended Elite inquiry inbox (no secrets logged).
    INQUIRY_TO_EMAIL: process.env.INQUIRY_TO_EMAIL || DEFAULT_TO_EMAIL,
    inquiryInboxIsDefaultInfoAddress:
      (process.env.INQUIRY_TO_EMAIL || DEFAULT_TO_EMAIL).toLowerCase() === DEFAULT_TO_EMAIL,
    hasMicrosoftTenantId: Boolean(process.env.MICROSOFT_TENANT_ID),
    hasMicrosoftClientId: Boolean(process.env.MICROSOFT_CLIENT_ID),
    hasMicrosoftClientSecret: Boolean(process.env.MICROSOFT_CLIENT_SECRET),
  });

  let recaptchaResult;
  try {
    recaptchaResult = await verifyRecaptcha(payload, req);
  } catch (error) {
    console.error("submit-registration recaptcha verification failed");
    console.error(getSafeErrorDetails(error));
    return sendJson(res, 500, {
      error: "Spam protection could not be verified. Please try again shortly.",
    });
  }

  console.log("submit-registration recaptcha result", recaptchaResult.log);
  if (!recaptchaResult.ok) {
    return sendJson(res, 400, { error: recaptchaResult.error });
  }

  if (!microsoftConfig) {
    console.error("submit-registration mail config missing Microsoft Graph credentials");
    return sendJson(res, 500, {
      error:
        "Registration is temporarily unavailable. Please try again shortly, or email info@elitetravelsportsusa.com.",
    });
  }

  const submittedAt = formatSubmissionDate();
  const subject = `New Elite Registration Request — ${trip.title}`;

  try {
    // Same Graph sender/recipient path as Plan a Journey /api/submit-inquiry (INQUIRY_TO_EMAIL || info@).
    await sendMicrosoftEmail({
      config: microsoftConfig,
      toEmail: microsoftConfig.to,
      subject,
      replyToEmail: email,
      replyToName: name,
      html: buildRegistrationEmailHtml({
        name,
        email,
        phoneE164: phoneResult.e164,
        trip,
        smsConsent: "Yes",
        submittedAt,
      }),
    });

    // Confirmation shown only after Graph (or safe-test sink) accepts. No automatic deposit link is emailed.
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("submit-registration email send failed");
    console.error(error && error.message);
    console.error(error && (error.status || error.statusCode));
    console.error(error && error.response && error.response.data);
    console.error(getSafeErrorDetails(error));

    return sendJson(res, 500, {
      error:
        "Registration is temporarily unavailable. Please try again shortly, or email info@elitetravelsportsusa.com.",
    });
  }
}

function resolveStaticPath(pathname) {
  const decodedPath = decodeURIComponent(pathname);
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(ROOT_DIR, normalizedPath);

  if (!filePath.startsWith(ROOT_DIR)) return null;

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  return filePath;
}

function isPrivatePath(filePath) {
  const relativePath = path.relative(ROOT_DIR, filePath).toLowerCase();
  // Trip page templates contain {{TOKENS}} and must only be reached through the rendered routes.
  if (isTemplateFile(relativePath)) return true;
  if (relativePath === path.join("claim-your-spot", "index.html") || relativePath === "claim-your-spot/index.html") {
    return true;
  }
  const segments = relativePath.split(path.sep);
  if (segments.some((segment) => segment.startsWith("."))) return true;
  if (PRIVATE_DIRS.has(segments[0])) return true;
  return segments.length === 1 && PRIVATE_ROOT_FILES.has(segments[0]);
}

function serveStatic(req, res, pathname) {
  const filePath = resolveStaticPath(pathname);
  if (!filePath || isPrivatePath(filePath) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/submit-inquiry") {
    handleInquiry(req, res);
    return;
  }

  if (url.pathname === "/api/submit-registration") {
    handleRegistration(req, res);
    return;
  }

  if (url.pathname === "/api/public-config") {
    handlePublicConfig(req, res);
    return;
  }

  if (isClaimPage(url.pathname)) {
    handleClaimPage(req, res, url.pathname, url.searchParams);
    return;
  }

  if (url.pathname === "/past-experiences" || url.pathname.startsWith("/past-experiences/")) {
    handlePastExperiences(req, res, url.pathname);
    return;
  }

  if (url.pathname === "/sitemap.xml") {
    handleSitemap(req, res);
    return;
  }

  if (isUpcomingPage(url.pathname)) {
    handleUpcomingPage(req, res, url.pathname);
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Elite Travel & Sports server listening on ${PORT}`);
});
