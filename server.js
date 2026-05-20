const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = process.env.PORT || 10000;
const ROOT_DIR = __dirname;
const DEFAULT_TO_EMAIL = "info@elitetravelsportsusa.com";
const DEFAULT_FROM_EMAIL = "info@elitetravelsportsusa.com";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

const FIELD_LABELS = {
  name: "Name",
  email: "Email",
  phone: "Phone",
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

const INTERNAL_FIELDS = new Set(["_gotcha", "_replyto", "_subject"]);

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

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  res.end(JSON.stringify(body));
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

function getMicrosoftConfig() {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) return null;

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
    throw new Error("Microsoft token request failed.");
  }

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error("Microsoft token response did not include an access token.");
  }

  return tokenData.access_token;
}

async function sendMicrosoftEmail({ config, subject, replyToEmail, replyToName, html }) {
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
                address: config.to,
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
    throw new Error("Microsoft Graph sendMail failed.");
  }
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
  if (!microsoftConfig) {
    return sendJson(res, 500, { error: "Email service is not configured." });
  }

  try {
    await sendMicrosoftEmail({
      config: microsoftConfig,
      subject: cleanValue(payload._subject) || "New Elite Travel & Sports Inquiry",
      replyToEmail: email,
      replyToName: name,
      html: buildEmailHtml(payload),
    });

    return sendJson(res, 200, { ok: true });
  } catch {
    return sendJson(res, 502, {
      error: "The email service is temporarily unavailable. Please email info@elitetravelsportsusa.com directly.",
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

function serveStatic(req, res, pathname) {
  const filePath = resolveStaticPath(pathname);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
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

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Elite Travel & Sports server listening on ${PORT}`);
});
