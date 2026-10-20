const fs = require("node:fs");
const path = require("node:path");
const { parsePhoneNumberFromString } = require("libphonenumber-js");
const { escapeHtml, fillTemplate, indent, sendHtml, sendServerError, redirect, allowReadOnly } = require("./html");
const { currentClock, isBookable, loadTrips, upcomingTrips } = require("./trips");

const ROOT_DIR = path.join(__dirname, "..");
const CLAIM_PATH = "/claim-your-spot/";
const TEMPLATE_FILE = path.join(ROOT_DIR, "claim-your-spot", "index.html");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_TYPES = new Set(["MOBILE", "FIXED_LINE_OR_MOBILE"]);
const TENNIS_RATINGS = Object.freeze(["2.5", "3.0", "3.5", "4.0", "4.5+"]);
const TENNIS_RATING_SET = new Set(TENNIS_RATINGS);
const TRAVELING_ALONE_VALUES = Object.freeze(["Yes", "No"]);
const TRAVELING_ALONE_SET = new Set(TRAVELING_ALONE_VALUES);
const ALLERGIES_MAX_LENGTH = 500;
const ANYTHING_ELSE_MAX_LENGTH = 2000;
const OPTIONAL_NOT_PROVIDED = "Not provided";

const REDIRECTS = {
  "/claim-your-spot": CLAIM_PATH,
};

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function eligibleTrips(trips = loadTrips(), clock = currentClock()) {
  return upcomingTrips(trips, clock).filter((trip) => isBookable(trip, clock));
}

function findEligibleTrip(slug, trips, clock) {
  const clean = text(slug);
  if (!clean) return null;
  return eligibleTrips(trips, clock).find((trip) => trip.slug === clean) || null;
}

function isValidEmail(value) {
  const email = text(value);
  return Boolean(email) && EMAIL_PATTERN.test(email) && !/\s/.test(email);
}

function isValidPersonName(value) {
  const name = text(value);
  return name.length >= 2 && /\S/.test(name);
}

function normalizeCellPhone(value, defaultCountry = "US") {
  const raw = text(value);
  if (!raw) return { ok: false, error: "Please enter a cell phone number." };

  const phone = parsePhoneNumberFromString(raw, defaultCountry);
  if (!phone || !phone.isValid()) {
    return {
      ok: false,
      error: "Please enter a valid international cell phone number.",
    };
  }

  const type = phone.getType();
  if (type && !MOBILE_TYPES.has(type)) {
    return {
      ok: false,
      error: "Please enter a cell phone number that can receive text messages.",
    };
  }

  return { ok: true, e164: phone.format("E.164"), national: phone.formatNational() };
}

function normalizeTennisRating(value) {
  const rating = text(value);
  if (!TENNIS_RATING_SET.has(rating)) {
    return { ok: false, error: "Please select a tennis rating." };
  }
  return { ok: true, value: rating };
}

function normalizeTravelingAlone(value) {
  const answer = text(value);
  if (!TRAVELING_ALONE_SET.has(answer)) {
    return { ok: false, error: "Please indicate whether you are traveling alone." };
  }
  return { ok: true, value: answer };
}

function normalizeOptionalRegistrationText(value, { maxLength, label }) {
  const cleaned = text(value);
  if (cleaned.length > maxLength) {
    return {
      ok: false,
      error: `${label} is too long. Please keep it under ${maxLength} characters.`,
    };
  }
  return { ok: true, value: cleaned };
}

function optionalFieldDisplay(value) {
  return text(value) || OPTIONAL_NOT_PROVIDED;
}

function formatSubmissionDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(now) + " UTC";
}

function renderExperienceOptions(trips, selectedSlug) {
  if (!trips.length) {
    return `<option value="">No registration-open departures are available right now</option>`;
  }

  return trips
    .map((trip) => {
      const selected = trip.slug === selectedSlug ? " selected" : "";
      // Readable closed-select label; full title + dates stay available via title tooltip.
      const label = `${trip.title} (${trip.dates})`;
      return `<option value="${escapeHtml(trip.slug)}"${selected} title="${escapeHtml(label)}">${escapeHtml(label)}</option>`;
    })
    .join("\n                ");
}

function renderClaimPage({ trips = loadTrips(), clock = currentClock(), selectedSlug = "" } = {}) {
  const eligible = eligibleTrips(trips, clock);
  const selected = findEligibleTrip(selectedSlug, trips, clock);
  const template = fs.readFileSync(TEMPLATE_FILE, "utf8");
  return fillTemplate(template, {
    EXPERIENCE_OPTIONS: indent(renderExperienceOptions(eligible, selected ? selected.slug : ""), 16),
    HAS_ELIGIBLE_TRIPS: eligible.length ? "true" : "false",
  });
}

function handleClaimPage(req, res, pathname, searchParams) {
  try {
    if (!allowReadOnly(req, res)) return;
    if (pathname in REDIRECTS) {
      const experience = text(searchParams && searchParams.get("experience"));
      const target = experience
        ? `${CLAIM_PATH}?experience=${encodeURIComponent(experience)}`
        : CLAIM_PATH;
      redirect(res, target);
      return;
    }
    if (pathname !== CLAIM_PATH && pathname !== `${CLAIM_PATH}index.html`) {
      sendServerError(req, res, "claim-your-spot", new Error(`Unexpected claim path: ${pathname}`));
      return;
    }
    const selectedSlug = text(searchParams && searchParams.get("experience"));
    sendHtml(req, res, 200, renderClaimPage({ selectedSlug }));
  } catch (error) {
    sendServerError(req, res, "claim-your-spot", error);
  }
}

function isClaimPage(pathname) {
  return pathname === CLAIM_PATH || pathname === `${CLAIM_PATH}index.html` || pathname in REDIRECTS;
}

module.exports = {
  ALLERGIES_MAX_LENGTH,
  ANYTHING_ELSE_MAX_LENGTH,
  CLAIM_PATH,
  OPTIONAL_NOT_PROVIDED,
  TENNIS_RATINGS,
  TRAVELING_ALONE_VALUES,
  eligibleTrips,
  findEligibleTrip,
  formatSubmissionDate,
  handleClaimPage,
  isClaimPage,
  isValidEmail,
  isValidPersonName,
  normalizeCellPhone,
  normalizeOptionalRegistrationText,
  normalizeTennisRating,
  normalizeTravelingAlone,
  optionalFieldDisplay,
  renderClaimPage,
};
