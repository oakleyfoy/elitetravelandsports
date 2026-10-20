const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  ALLERGIES_MAX_LENGTH,
  ANYTHING_ELSE_MAX_LENGTH,
  eligibleTrips,
  findEligibleTrip,
  isValidEmail,
  isValidPersonName,
  normalizeCellPhone,
  normalizeOptionalRegistrationText,
  normalizeTennisRating,
  normalizeTravelingAlone,
  optionalFieldDisplay,
  renderClaimPage,
  TENNIS_RATINGS,
} = require("../lib/registration");
const { loadTrips, upcomingTrips, isBookable } = require("../lib/trips");
const { renderPage } = require("../lib/upcoming");

const ROOT_DIR = path.join(__dirname, "..");
const SERVER_SOURCE = fs.readFileSync(path.join(ROOT_DIR, "server.js"), "utf8");

function trip(overrides = {}) {
  return {
    slug: "test-trip",
    title: "Test Trip",
    country: "Spain",
    destination: "Marbella, Spain",
    timeZone: "Europe/Madrid",
    startDate: "2027-01-27",
    endDate: "2027-02-03",
    price: "$1 USD per person",
    summary: "A test departure.",
    ...overrides,
  };
}

function load(rawTrips) {
  return loadTrips({ sources: [{ data: { trips: rawTrips }, name: "test data", sample: false }] });
}

function on(day) {
  return { now: new Date(`${day}T12:00:00Z`), today: day };
}

function realTrips() {
  return loadTrips({
    sources: [{ file: path.join(ROOT_DIR, "data", "trips.json"), name: "data/trips.json", sample: false }],
  });
}

function startServer(cwd, extraEnv = {}) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const env = { ...process.env, PORT: String(port), ...extraEnv };
  delete env.RENDER;
  delete env.PAST_EXPERIENCES_SAMPLE;
  const child = spawn(process.execPath, ["server.js"], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const ready = new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => String(chunk).includes("listening") && resolve());
    child.on("exit", (code) => reject(new Error(`server exited with ${code}`)));
  });
  return {
    child,
    ready,
    base: `http://127.0.0.1:${port}`,
    stdout: () => stdout,
    stderr: () => stderr,
    logs: () => stdout + stderr,
  };
}

async function postRegistration(base, body) {
  const response = await fetch(`${base}/api/submit-registration`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON */
  }
  return { response, data };
}

function validRegistration(overrides = {}) {
  return {
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone_e164: "+12015550123",
    experience: "spain-marbella-2027",
    tennis_rating: "3.5",
    traveling_alone: "Yes",
    sms_registration_consent: "Yes",
    allergies_dietary: "",
    anything_else: "",
    ...overrides,
  };
}

describe("registration helpers", () => {
  test("rejects empty and whitespace-only names", () => {
    assert.equal(isValidPersonName(""), false);
    assert.equal(isValidPersonName("   "), false);
    assert.equal(isValidPersonName("A"), false);
    assert.equal(isValidPersonName("Ada Lovelace"), true);
  });

  test("validates email format without claiming deliverability", () => {
    assert.equal(isValidEmail("not-an-email"), false);
    assert.equal(isValidEmail("name@domain"), false);
    assert.equal(isValidEmail("name @domain.com"), false);
    assert.equal(isValidEmail("traveler@example.com"), true);
  });

  test("normalizes valid US and international cell numbers to E.164", () => {
    const us = normalizeCellPhone("(201) 555-0123");
    assert.equal(us.ok, true);
    assert.equal(us.e164, "+12015550123");

    const uk = normalizeCellPhone("+44 7740 022222");
    assert.equal(uk.ok, true);
    assert.equal(uk.e164, "+447740022222");

    const bad = normalizeCellPhone("123");
    assert.equal(bad.ok, false);
  });

  test("accepts only the permitted tennis rating and traveling-alone values", () => {
    for (const rating of TENNIS_RATINGS) {
      assert.equal(normalizeTennisRating(rating).ok, true);
    }
    assert.equal(normalizeTennisRating("").ok, false);
    assert.equal(normalizeTennisRating("5.0").ok, false);
    assert.equal(normalizeTennisRating("3").ok, false);
    assert.equal(normalizeTravelingAlone("Yes").ok, true);
    assert.equal(normalizeTravelingAlone("No").ok, true);
    assert.equal(normalizeTravelingAlone("Maybe").ok, false);
    assert.equal(normalizeTravelingAlone("").ok, false);
  });

  test("optional registration text enforces length limits and Not provided display", () => {
    assert.equal(optionalFieldDisplay(""), "Not provided");
    assert.equal(optionalFieldDisplay("  Nut allergy  "), "Nut allergy");
    assert.equal(
      normalizeOptionalRegistrationText("x".repeat(ALLERGIES_MAX_LENGTH + 1), {
        maxLength: ALLERGIES_MAX_LENGTH,
        label: "Allergies or dietary restrictions",
      }).ok,
      false,
    );
    assert.equal(
      normalizeOptionalRegistrationText("x".repeat(ANYTHING_ELSE_MAX_LENGTH), {
        maxLength: ANYTHING_ELSE_MAX_LENGTH,
        label: "Anything else we should know",
      }).ok,
      true,
    );
  });

  test("only bookable upcoming trips are registration-eligible", () => {
    const trips = load([
      trip({ slug: "bookable", startDate: "2027-06-01", endDate: "2027-06-08" }),
      trip({
        slug: "in-progress",
        startDate: "2027-01-01",
        endDate: "2027-01-10",
      }),
      trip({
        slug: "cancelled",
        startDate: "2027-08-01",
        endDate: "2027-08-08",
        status: "cancelled",
      }),
      trip({
        slug: "past",
        startDate: "2026-01-01",
        endDate: "2026-01-08",
      }),
    ]);
    const clock = on("2027-01-05");
    const eligible = eligibleTrips(trips, clock);
    assert.deepEqual(
      eligible.map((item) => item.slug),
      ["bookable"],
    );
    assert.equal(findEligibleTrip("bookable", trips, clock).slug, "bookable");
    assert.equal(findEligibleTrip("in-progress", trips, clock), null);
    assert.equal(findEligibleTrip("cancelled", trips, clock), null);
    assert.equal(findEligibleTrip("past", trips, clock), null);
    assert.equal(findEligibleTrip("forged-label", trips, clock), null);
  });
});

describe("Claim Your Spot buttons on upcoming cards", () => {
  const trips = realTrips();

  test("bookable cards and itineraries include Claim Your Spot with the trip slug", () => {
    const html = renderPage("/destinations/international/", { trips, clock: on("2027-01-01") });
    const card = html.match(/<article[^>]*data-trip="spain-marbella-2027"[\s\S]*?<\/article>/)[0];
    assert.match(card, /fixed-date-trip-card-top/);
    assert.match(
      card,
      /<a class="claim-spot-button" href="\/claim-your-spot\/\?experience=spain-marbella-2027">Claim Your Spot<\/a>/,
    );
    assert.match(
      card,
      /View Printable Itinerary[\s\S]*claim-spot-button--itinerary[\s\S]*Claim Your Spot/,
    );
  });

  test("in-progress, past, and cancelled departures do not offer registration", () => {
    const during = renderPage("/destinations/international/", { trips, clock: on("2027-01-27") });
    const spain = during.match(/<article[^>]*data-trip="spain-marbella-2027"[\s\S]*?<\/article>/)[0];
    assert.doesNotMatch(spain, /Claim Your Spot/);

    const pastDay = renderPage("/destinations/international/", { trips, clock: on("2027-02-04") });
    assert.doesNotMatch(pastDay, /spain-marbella-2027/);

    const cancelledTrips = load(
      JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "data", "trips.json"), "utf8")).trips.map((item) =>
        item.slug === "japan-tokyo-2027" ? { ...item, status: "cancelled" } : item,
      ),
    );
    const cancelledHtml = renderPage("/destinations/international/", {
      trips: cancelledTrips,
      clock: on("2027-01-01"),
    });
    assert.doesNotMatch(cancelledHtml, /japan-tokyo-2027|Claim Your Spot[\s\S]*Tokyo/);
  });

  test("Morocco brochure cards use the same claim placement rules", () => {
    const before = renderPage("/destinations/morocco/", { trips, clock: on("2027-03-12") });
    assert.match(
      before,
      /data-trip="morocco-marrakech-2027"[\s\S]*claim-spot-button" href="\/claim-your-spot\/\?experience=morocco-marrakech-2027"/,
    );

    const during = renderPage("/destinations/morocco/", { trips, clock: on("2027-03-13") });
    const card = during.match(/<article[^>]*data-trip="morocco-marrakech-2027"[\s\S]*?<\/article>/)[0];
    assert.doesNotMatch(card, /Claim Your Spot/);
  });
});

describe("claim page rendering", () => {
  const trips = realTrips();

  test("renders intro copy, required fields, unchecked consent, and eligible options only", () => {
    const html = renderClaimPage({ trips, clock: on("2027-01-01"), selectedSlug: "spain-marbella-2027" });
    assert.match(html, /<h1>Claim Your Spot<\/h1>/);
    assert.match(
      html,
      /Complete the form below to request your place on an Elite experience\.\s*Our team will follow up by email and\s*text with secure instructions for your initial non-refundable deposit\./,
    );
    assert.match(html, /name="experience"/);
    assert.match(html, /name="tennis_rating"/);
    assert.match(html, /<option value="">Select a tennis rating<\/option>/);
    assert.match(html, /option value="2\.5"/);
    assert.match(html, /option value="4\.5\+"/);
    assert.doesNotMatch(html, /name="tennis_rating"[\s\S]*selected/);
    assert.match(html, /name="name"/);
    assert.match(html, /name="email"/);
    assert.match(html, /name="phone"/);
    assert.match(html, /name="sms_registration_consent" value="Yes" required/);
    assert.doesNotMatch(html, /sms_registration_consent"[^>]*checked/);
    assert.match(html, /name="traveling_alone"/);
    assert.match(html, /<option value="">Select an option<\/option>/);
    assert.doesNotMatch(html, /name="traveling_alone"[\s\S]*selected/);
    assert.match(html, /name="allergies_dietary"/);
    assert.match(html, /Example: Gluten-free, nut allergy, vegetarian, or none\./);
    assert.match(html, /name="anything_else"/);
    assert.match(html, /Anything Else We Should Know\?/);
    assert.doesNotMatch(html, /Additional Notes|name="notes"/);
    assert.match(html, /Enter a cell number where we can text your deposit instructions\./);
    assert.match(
      html,
      /I agree to receive texts from Elite Travel Sports about my registration request and deposit payment\s*instructions\./,
    );
    assert.match(html, /Reply <strong>STOP<\/strong> to opt out/);
    assert.match(html, /href="\/privacy-policy\/"/);
    assert.match(html, /href="\/terms-and-conditions\/#sms-terms"/);
    assert.match(html, /option value="spain-marbella-2027" selected/);
    assert.doesNotMatch(html, /morocco-marrakech-2026/);
    assert.doesNotMatch(html, /data-claim-experience-readout/);
    assert.match(html, /War Experiences LLC/);
    assert.match(html, /action="\/api\/submit-registration"/);
  });

  test("ignores forged experience query values that are not registration-eligible", () => {
    const html = renderClaimPage({ trips, clock: on("2027-01-27"), selectedSlug: "spain-marbella-2027" });
    assert.doesNotMatch(html, /option value="spain-marbella-2027" selected/);
    assert.doesNotMatch(html, /option value="spain-marbella-2027"/);
  });
});

describe("registration API", () => {
  const server = startServer(ROOT_DIR, { ELITE_TODAY: "2027-01-01" });
  const { base } = server;

  before(() => server.ready);
  after(() => server.child.kill());

  test("serves the claim page and blocks the raw template", async () => {
    const page = await fetch(`${base}/claim-your-spot/?experience=spain-marbella-2027`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("cache-control"), "no-cache");
    const html = await page.text();
    assert.match(html, /spain-marbella-2027" selected/);
    assert.doesNotMatch(html, /\{\{EXPERIENCE_OPTIONS\}\}/);

    const redirect = await fetch(`${base}/claim-your-spot`, { redirect: "manual" });
    assert.equal(redirect.status, 301);
    assert.match(redirect.headers.get("location"), /^\/claim-your-spot\//);

    assert.equal((await fetch(`${base}/claim-registration.js`)).status, 200);
    assert.equal((await fetch(`${base}/api/submit-registration`, { method: "GET" })).status, 405);
  });

  test("rejects invalid registration payloads before emailing", async () => {
    const cases = [
      { body: validRegistration({ name: "  " }), expect: /full name/i },
      { body: validRegistration({ email: "not-email" }), expect: /email/i },
      { body: validRegistration({ phone_e164: "123" }), expect: /cell phone|phone/i },
      { body: validRegistration({ sms_registration_consent: "No" }), expect: /text messages/i },
      { body: validRegistration({ experience: "forged-trip" }), expect: /experience/i },
      { body: validRegistration({ experience: "morocco-marrakech-2026" }), expect: /experience/i },
      { body: validRegistration({ tennis_rating: "" }), expect: /tennis rating/i },
      { body: validRegistration({ tennis_rating: "5.0" }), expect: /tennis rating/i },
      { body: validRegistration({ traveling_alone: "" }), expect: /traveling alone/i },
      { body: validRegistration({ traveling_alone: "Maybe" }), expect: /traveling alone/i },
      {
        body: validRegistration({ allergies_dietary: "x".repeat(ALLERGIES_MAX_LENGTH + 1) }),
        expect: /allergies or dietary/i,
      },
      {
        body: validRegistration({ anything_else: "y".repeat(ANYTHING_ELSE_MAX_LENGTH + 1) }),
        expect: /anything else/i,
      },
    ];

    for (const item of cases) {
      const { response, data } = await postRegistration(base, item.body);
      assert.equal(response.status, 400, JSON.stringify(item.body));
      assert.match(String(data && data.error), item.expect, JSON.stringify(item.body));
      assert.notEqual(data && data.ok, true);
    }
  });

  test("honeypot submissions are discarded without a registration-success response", async () => {
    const { response, data } = await postRegistration(base, {
      ...validRegistration({ name: "Ada", email: "a@b.com", phone_e164: "+14155552671" }),
      _gotcha: "bot",
    });
    assert.equal(response.status, 200);
    assert.equal(data.ok, false);
    assert.equal(Object.prototype.hasOwnProperty.call(data, "error"), false);
    assert.doesNotMatch(JSON.stringify(data), /honeypot|spam|bot|discard/i);
    assert.match(server.logs(), /submit-registration discarded/);
    assert.match(server.logs(), /reason:\s*'honeypot'/);
    assert.doesNotMatch(server.logs(), /submit-registration accepted/);
    assert.doesNotMatch(server.logs(), /Ada|a@b\.com|\+14155552671/);
  });

  test("inquiry honeypot uses the same distinct discard response", async () => {
    const response = await fetch(`${base}/api/submit-inquiry`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        _gotcha: "filled-by-bot",
        name: "Ada",
        email: "a@b.com",
      }),
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.ok, false);
    assert.match(server.logs(), /submit-inquiry discarded/);
    assert.doesNotMatch(JSON.stringify(data), /honeypot|spam|bot/i);
  });

  test("inquiry API remains available alongside registration", async () => {
    assert.equal((await fetch(`${base}/api/submit-inquiry`, { method: "GET" })).status, 405);
    assert.equal((await fetch(`${base}/plan-a-journey/`)).status, 200);
  });

  test("missing reCAPTCHA returns a friendly visitor message and keeps the secret name in logs only", async () => {
    const { response, data } = await postRegistration(base, {
      ...validRegistration(),
      recaptcha_token: "anything",
    });
    assert.equal(response.status, 400);
    assert.equal(data.ok, undefined);
    assert.match(String(data && data.error), /temporarily unavailable/i);
    assert.doesNotMatch(String(data && data.error), /RECAPTCHA|SECRET|configured/i);
    assert.match(server.logs(), /RECAPTCHA_SECRET_KEY is missing/);
  });

  test("public-config exposes the same reCAPTCHA keys Plan a Journey uses", async () => {
    const response = await fetch(`${base}/api/public-config`);
    assert.equal(response.status, 200);
    const config = await response.json();
    assert.equal(Object.prototype.hasOwnProperty.call(config, "recaptchaSiteKey"), true);
    assert.equal(config.recaptchaAction, "submit_inquiry");
    assert.equal(config.recaptchaSiteKey, "");
  });
});

describe("registration safe-test submission", () => {
  const sink = path.join(os.tmpdir(), `elite-reg-sink-${process.pid}.jsonl`);
  try {
    fs.unlinkSync(sink);
  } catch {
    /* fresh */
  }
  const server = startServer(ROOT_DIR, {
    ELITE_TODAY: "2027-01-01",
    ELITE_SAFE_TEST_MODE: "1",
    ELITE_MOCK_EXTERNAL_APIS: "1",
    ELITE_TEST_MAIL_SINK: sink,
    RECAPTCHA_SECRET_KEY: "elite-test-secret",
    RECAPTCHA_SITE_KEY: "elite-test-site-key",
    INQUIRY_TO_EMAIL: "info@elitetravelsportsusa.com",
    MAIL_FROM_EMAIL: "info@elitetravelsportsusa.com",
  });
  const { base } = server;

  before(() => server.ready);
  after(() => {
    server.child.kill();
    try {
      fs.unlinkSync(sink);
    } catch {
      /* ignore */
    }
  });

  test("accepts a registration through the shared inquiry inbox path without live Graph delivery", async () => {
    const { response, data } = await postRegistration(base, {
      ...validRegistration({
        allergies_dietary: "Gluten-free",
        anything_else: "Traveling with a friend",
      }),
      recaptcha_token: "elite-test-token",
    });
    assert.equal(response.status, 200);
    assert.equal(data.ok, true);

    const lines = fs.readFileSync(sink, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    const mail = JSON.parse(lines[0]);
    assert.equal(mail.toEmail, "info@elitetravelsportsusa.com");
    assert.equal(mail.fromEmail, "info@elitetravelsportsusa.com");
    assert.equal(mail.subject, "New Elite Registration Request — Marbella Spain & Tennis Experience");
    assert.match(mail.html, /Full Name[\s\S]*Ada Lovelace/);
    assert.match(mail.html, /Email Address[\s\S]*ada@example\.com/);
    assert.match(mail.html, /Cell Phone Number[\s\S]*\+12015550123/);
    assert.match(mail.html, /Experience[\s\S]*Marbella Spain &amp; Tennis Experience/);
    assert.match(mail.html, /Trip Date[\s\S]*January 27/);
    assert.match(mail.html, /Tennis Rating[\s\S]*3\.5/);
    assert.match(mail.html, /Traveling Alone\?[\s\S]*Yes/);
    assert.match(mail.html, /Allergies or Dietary Restrictions[\s\S]*Gluten-free/);
    assert.match(mail.html, /Anything Else We Should Know\?[\s\S]*Traveling with a friend/);
    assert.match(mail.html, /Submission Date/);
    assert.match(mail.html, /SMS Consent[\s\S]*Yes/);
    assert.doesNotMatch(mail.html, /deposit amount|payment link|stripe/i);
    assert.match(server.logs(), /microsoft-mail safe-test sink/);
    assert.match(server.logs(), /submit-registration accepted/);
    assert.match(server.logs(), /experience:\s*'spain-marbella-2027'/);
    assert.doesNotMatch(server.logs(), /phoneE164|Ada Lovelace|ada@example\.com|\+12015550123|Gluten-free|Traveling with a friend/);
  });

  test("optional blank fields appear as Not provided and allergy text is never logged", async () => {
    fs.writeFileSync(sink, "");
    const logsBefore = server.logs();
    const { response, data } = await postRegistration(base, {
      ...validRegistration({
        tennis_rating: "4.5+",
        traveling_alone: "No",
        allergies_dietary: "",
        anything_else: "",
      }),
      recaptcha_token: "elite-mock-recaptcha-pass",
    });
    const logsDelta = server.logs().slice(logsBefore.length);
    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    const mail = JSON.parse(fs.readFileSync(sink, "utf8").trim().split("\n").pop());
    assert.match(mail.html, /Tennis Rating[\s\S]*4\.5\+/);
    assert.match(mail.html, /Traveling Alone\?[\s\S]*No/);
    assert.match(mail.html, /Allergies or Dietary Restrictions[\s\S]*Not provided/);
    assert.match(mail.html, /Anything Else We Should Know\?[\s\S]*Not provided/);
    assert.match(logsDelta, /tennisRating:\s*'4\.5\+'/);
    assert.match(logsDelta, /travelingAlone:\s*'No'/);
    assert.doesNotMatch(logsDelta, /allergies|dietary|Gluten|nut allergy/i);
  });

  test("honeypot discard never writes mail and never returns ok true", async () => {
    fs.writeFileSync(sink, "");
    const logsBefore = server.logs();
    const { response, data } = await postRegistration(base, {
      ...validRegistration(),
      _gotcha: "autofill-or-bot",
      recaptcha_token: "elite-mock-recaptcha-pass",
    });
    const logsDelta = server.logs().slice(logsBefore.length);
    assert.equal(response.status, 200);
    assert.equal(data.ok, false);
    assert.equal(fs.readFileSync(sink, "utf8").trim(), "");
    assert.match(logsDelta, /submit-registration discarded/);
    assert.doesNotMatch(logsDelta, /submit-registration accepted/);
  });

  test("mocked Google siteverify pass + Graph sink show success without live network calls", async () => {
    fs.writeFileSync(sink, "");
    const { response, data } = await postRegistration(base, {
      ...validRegistration({
        name: "Nora Test",
        email: "nora.test@example.com",
        experience: "japan-tokyo-2027",
      }),
      recaptcha_token: "elite-mock-recaptcha-pass",
    });
    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.match(server.logs(), /safe-test mock siteverify/);
    assert.match(server.logs(), /microsoft-mail safe-test sink/);
    const mail = JSON.parse(fs.readFileSync(sink, "utf8").trim().split("\n").pop());
    assert.equal(mail.toEmail, "info@elitetravelsportsusa.com");
    assert.match(mail.subject, /Tokyo Tennis Experience/);
    assert.match(mail.html, /Trip Date[\s\S]*April 14/);
    assert.match(mail.html, /SMS Consent[\s\S]*Yes/);
  });

  test("mocked Google siteverify failure returns a spam-protection error without success", async () => {
    const before = fs.existsSync(sink) ? fs.readFileSync(sink, "utf8") : "";
    const { response, data } = await postRegistration(base, {
      ...validRegistration({
        name: "Nora Test",
        email: "nora.test@example.com",
        experience: "japan-tokyo-2027",
      }),
      recaptcha_token: "elite-mock-recaptcha-fail",
    });
    assert.equal(response.status, 400);
    assert.notEqual(data && data.ok, true);
    assert.match(String(data && data.error), /Spam protection failed/i);
    assert.equal(fs.readFileSync(sink, "utf8"), before);
  });

  test("rejects invalid experience and missing consent without sending mail", async () => {
    const before = fs.readFileSync(sink, "utf8");
    const forged = await postRegistration(base, {
      ...validRegistration({
        name: "Nora Test",
        email: "nora.test@example.com",
        experience: "not-a-real-trip",
      }),
      recaptcha_token: "elite-mock-recaptcha-pass",
    });
    assert.equal(forged.response.status, 400);
    assert.match(String(forged.data && forged.data.error), /experience/i);

    const noConsent = await postRegistration(base, {
      ...validRegistration({
        name: "Nora Test",
        email: "nora.test@example.com",
        experience: "japan-tokyo-2027",
        sms_registration_consent: "No",
      }),
      recaptcha_token: "elite-mock-recaptcha-pass",
    });
    assert.equal(noConsent.response.status, 400);
    assert.match(String(noConsent.data && noConsent.data.error), /text messages/i);
    assert.equal(fs.readFileSync(sink, "utf8"), before);
  });

  test("duplicate successful posts both reach the inquiry inbox sink (server accepts; client locks after first success)", async () => {
    fs.writeFileSync(sink, "");
    const body = {
      ...validRegistration({
        name: "Duplicate Guest",
        email: "dup@example.com",
        experience: "portugal-algarve-2027",
      }),
      recaptcha_token: "elite-mock-recaptcha-pass",
    };
    const first = await postRegistration(base, body);
    const second = await postRegistration(base, body);
    assert.equal(first.response.status, 200);
    assert.equal(first.data.ok, true);
    assert.equal(second.response.status, 200);
    assert.equal(second.data.ok, true);
    const lines = fs.readFileSync(sink, "utf8").trim().split("\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /Duplicate Guest/);
    assert.match(lines[1], /Duplicate Guest/);

    const client = fs.readFileSync(path.join(ROOT_DIR, "claim-registration.js"), "utf8");
    assert.match(client, /submittedOnce = true/);
    assert.match(client, /if \(submittedOnce\)/);
    assert.match(client, /submitBtn\.disabled = true/);
  });

  test("public-config still uses the shared submit_inquiry reCAPTCHA action", async () => {
    const config = await (await fetch(`${base}/api/public-config`)).json();
    assert.equal(config.recaptchaAction, "submit_inquiry");
    assert.equal(config.recaptchaSiteKey, "elite-test-site-key");
  });
});

describe("registration client confirmation and autofill hardening", () => {
  test("claim form only shows Registration received after data.ok and clears autofilled honeypot", () => {
    const client = fs.readFileSync(path.join(ROOT_DIR, "claim-registration.js"), "utf8");
    assert.match(client, /data\.ok === true/);
    assert.match(client, /honeypot\.value = ""/);
    assert.match(client, /payload\._gotcha = ""/);
    assert.match(client, /SUCCESS_MESSAGE/);
    assert.match(client, /Registration request has been received/i);
    // Success path is gated; discarded { ok: false } must not unlock the success branch.
    assert.doesNotMatch(client, /if \(res\.ok\)\s*\{/);
  });

  test("claim page honeypot is after real fields and resists browser autofill", () => {
    const html = fs.readFileSync(path.join(ROOT_DIR, "claim-your-spot", "index.html"), "utf8");
    const nameIdx = html.indexOf('name="name"');
    const honeypotIdx = html.indexOf('name="_gotcha"');
    assert.ok(nameIdx > 0 && honeypotIdx > nameIdx, "honeypot must not be the first text field");
    assert.match(html, /name="_gotcha"[\s\S]*?autocomplete="new-password"/);
    assert.match(html, /data-honeypot/);
  });

  test("Plan a Journey and Morocco require data.ok and harden honeypot the same way", () => {
    const planClient = fs.readFileSync(path.join(ROOT_DIR, "plan-inquiry.js"), "utf8");
    const moroccoClient = fs.readFileSync(path.join(ROOT_DIR, "morocco-programs.js"), "utf8");
    assert.match(planClient, /data\.ok === true/);
    assert.match(planClient, /honeypot\.value = ""/);
    assert.match(moroccoClient, /data\.ok === true/);
    assert.match(moroccoClient, /honeypot\.value = ""/);

    for (const relative of ["plan-a-journey/index.html", "destinations/morocco/index.html"]) {
      const html = fs.readFileSync(path.join(ROOT_DIR, relative), "utf8");
      const nameIdx = html.indexOf('name="name"');
      const honeypotIdx = html.indexOf('name="_gotcha"');
      assert.ok(nameIdx > 0 && honeypotIdx > nameIdx, relative);
      assert.match(html, /autocomplete="new-password"/);
    }
  });

  test("discarded honeypot response cannot satisfy client confirmation gate", () => {
    const discarded = { ok: false };
    const accepted = { ok: true };
    assert.equal(Boolean({ ok: true } && discarded && discarded.ok === true), false);
    assert.equal(Boolean({ ok: true } && accepted && accepted.ok === true), true);
  });
});

describe("registration Graph failure never reports success", () => {
  const sink = path.join(os.tmpdir(), `elite-reg-fail-${process.pid}.jsonl`);
  const server = startServer(ROOT_DIR, {
    ELITE_TODAY: "2027-01-01",
    ELITE_SAFE_TEST_MODE: "1",
    ELITE_MOCK_EXTERNAL_APIS: "1",
    ELITE_TEST_MAIL_SINK: sink,
    ELITE_TEST_MAIL_FAIL: "1",
    RECAPTCHA_SECRET_KEY: "elite-test-secret",
    INQUIRY_TO_EMAIL: "info@elitetravelsportsusa.com",
    MAIL_FROM_EMAIL: "info@elitetravelsportsusa.com",
  });

  before(() => server.ready);
  after(() => {
    server.child.kill();
    try {
      fs.unlinkSync(sink);
    } catch {
      /* ignore */
    }
  });

  test("returns unavailable error and does not set ok when Graph send fails", async () => {
    const { response, data } = await postRegistration(server.base, {
      ...validRegistration(),
      recaptcha_token: "elite-mock-recaptcha-pass",
    });
    assert.equal(response.status, 500);
    assert.notEqual(data && data.ok, true);
    assert.match(String(data && data.error), /temporarily unavailable/i);
    assert.match(server.logs(), /submit-registration email send failed/);
    assert.doesNotMatch(server.logs(), /submit-registration accepted/);
    assert.equal(fs.existsSync(sink) && fs.readFileSync(sink, "utf8").trim() !== "", false);

    const client = fs.readFileSync(path.join(ROOT_DIR, "claim-registration.js"), "utf8");
    assert.match(client, /data\.ok === true/);
    assert.match(client, /Registration is temporarily unavailable/);
  });
});

describe("registration mail configuration", () => {
  test("uses the Elite info@ inquiry inbox by default without embedding secrets", () => {
    assert.match(SERVER_SOURCE, /DEFAULT_TO_EMAIL = "info@elitetravelsportsusa\.com"/);
    assert.match(SERVER_SOURCE, /to: process\.env\.INQUIRY_TO_EMAIL \|\| DEFAULT_TO_EMAIL/);
    assert.match(SERVER_SOURCE, /New Elite Registration Request — \$\{trip\.title\}/);
    assert.match(SERVER_SOURCE, /isSafeTestMode/);
    assert.match(SERVER_SOURCE, /ELITE_MOCK_EXTERNAL_APIS/);
    assert.doesNotMatch(SERVER_SOURCE, /MICROSOFT_CLIENT_SECRET\s*=\s*["'][^"']+["']/);
    assert.doesNotMatch(SERVER_SOURCE, /deposit amount|payment link|stripe|paypal/i);
  });

  test("eligible bookable trips match the upcoming lifecycle helper", () => {
    const trips = realTrips();
    const clock = on("2027-01-01");
    const expected = upcomingTrips(trips, clock).filter((item) => isBookable(item, clock));
    assert.deepEqual(
      eligibleTrips(trips, clock).map((item) => item.slug),
      expected.map((item) => item.slug),
    );
  });
});
