const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.join(__dirname, "..");
const DATA_FILE = path.join(ROOT_DIR, "data", "trips.json");
const SAMPLE_DATA_FILE = path.join(ROOT_DIR, "data", "past-experiences.sample.json");
const ITINERARY_DIR = path.join(ROOT_DIR, "data", "itineraries");

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const STATUSES = new Set(["scheduled", "cancelled"]);
const ANCHOR_TARGETS = new Set(["card", "itinerary"]);
const DAY_MS = 86400000;

// Render sets RENDER=true on every service, so these local preview switches can never apply in production.
function sampleModeEnabled() {
  return process.env.PAST_EXPERIENCES_SAMPLE === "1" && !process.env.RENDER;
}

function todayOverride() {
  const value = (process.env.ELITE_TODAY || "").trim();
  if (!value || process.env.RENDER) return null;
  if (!parseDate(value)) {
    console.warn(`trips: ignored ELITE_TODAY="${value}" because it is not a real date written as YYYY-MM-DD`);
    return null;
  }
  return value;
}

function currentClock(now = new Date()) {
  return { now, today: todayOverride() };
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function textList(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function parseDate(value) {
  if (!DATE_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

function isValidTimeZone(timeZone) {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function localDate(timeZone, now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function tripToday(trip, clock) {
  return clock.today || localDate(trip.timeZone, clock.now);
}

function tripStatus(trip, clock) {
  if (trip.cancelled) return "cancelled";
  return tripToday(trip, clock) > trip.endDate ? "past" : "upcoming";
}

// Upcoming trips stay listed through their end date, but stop taking bookings once they start.
function isBookable(trip, clock) {
  return !trip.cancelled && tripToday(trip, clock) < trip.startDate;
}

function isInProgress(trip, clock) {
  return tripStatus(trip, clock) === "upcoming" && !isBookable(trip, clock);
}

function dayNumber(clock) {
  const today = clock.today || clock.now.toISOString().slice(0, 10);
  return Math.floor(parseDate(today).getTime() / DAY_MS);
}

function formatDateRange(start, end) {
  const startMonth = MONTHS[start.getUTCMonth()];
  const endMonth = MONTHS[end.getUTCMonth()];
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  const startYear = start.getUTCFullYear();
  const endYear = end.getUTCFullYear();

  if (start.getTime() === end.getTime()) return `${startMonth} ${startDay}, ${startYear}`;
  if (startYear === endYear && startMonth === endMonth) {
    return `${startMonth} ${startDay}–${endDay}, ${startYear}`;
  }
  if (startYear === endYear) return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${startYear}`;
  return `${startMonth} ${startDay}, ${startYear} – ${endMonth} ${endDay}, ${endYear}`;
}

function formatShortRange(start, end) {
  const startMonth = MONTHS[start.getUTCMonth()].slice(0, 3);
  const endMonth = MONTHS[end.getUTCMonth()].slice(0, 3);
  if (start.getTime() === end.getTime()) return `${startMonth} ${start.getUTCDate()}`;
  if (startMonth === endMonth && start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${startMonth} ${start.getUTCDate()}–${end.getUTCDate()}`;
  }
  return `${startMonth} ${start.getUTCDate()}–${endMonth} ${end.getUTCDate()}`;
}

function formatMonthYear(date) {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function isSafeImageSrc(src) {
  return /^\/(?!\/)[^\s"'<>()\\]+$/.test(src) || /^https:\/\/[^\s"'<>()\\]+$/.test(src);
}

function isSafeLink(href) {
  return /^\/(?!\/)[^\s"'<>]+$/.test(href);
}

function normalizeImage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const src = text(raw.src);
  const alt = text(raw.alt);
  const thumbnail = text(raw.thumbnail);
  if (!isSafeImageSrc(src) || !alt) return null;
  if (thumbnail && !isSafeImageSrc(thumbnail)) return null;
  return { src, alt, caption: text(raw.caption), thumbnail: thumbnail || src };
}

function toVideoEmbed(raw) {
  if (!raw || typeof raw !== "object") return null;
  const url = text(raw.url);
  const title = text(raw.title);
  if (!title) return null;

  const youtube =
    url.match(/^https:\/\/(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/) ||
    url.match(/^https:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (youtube) {
    return { provider: "YouTube", title, src: `https://www.youtube-nocookie.com/embed/${youtube[1]}?rel=0` };
  }

  const vimeo =
    url.match(/^https:\/\/(?:www\.)?vimeo\.com\/(\d+)(?:\/([a-f0-9]+))?/) ||
    url.match(/^https:\/\/player\.vimeo\.com\/video\/(\d+)(?:\?(?:[^#]*&)?h=([a-f0-9]+))?/);
  if (vimeo) {
    const hash = vimeo[2] ? `&h=${vimeo[2]}` : "";
    return { provider: "Vimeo", title, src: `https://player.vimeo.com/video/${vimeo[1]}?dnt=1${hash}` };
  }

  return null;
}

function readItinerary(slug, report) {
  try {
    return fs.readFileSync(path.join(ITINERARY_DIR, `${slug}.html`), "utf8").trim();
  } catch (error) {
    if (error.code !== "ENOENT") report(`"${slug}" itinerary could not be read: ${error.message}`);
    return "";
  }
}

function normalizeFeatured(raw, slug, report) {
  if (raw === undefined) return null;
  const featured = {
    kicker: text(raw && raw.kicker),
    title: text(raw && raw.title),
    summary: text(raw && raw.summary),
    image: text(raw && raw.image),
  };
  if (!featured.kicker || !featured.title || !featured.summary || !isSafeImageSrc(featured.image)) {
    report(`"${slug}" featured needs a kicker, title, summary, and image`);
    return null;
  }
  return featured;
}

function normalizeTrip(raw, source, report) {
  const label = text(raw.slug) || text(raw.title) || "untitled trip";
  const problems = [];

  const slug = text(raw.slug);
  if (!SLUG_PATTERN.test(slug)) problems.push("slug must use lowercase letters, numbers, and hyphens");
  const title = text(raw.title);
  if (!title) problems.push("title is required");
  const destination = text(raw.destination);
  if (!destination) problems.push("destination is required");
  const summary = text(raw.summary);
  if (!summary) problems.push("summary is required");
  const country = text(raw.country) || (source.sample ? "Sample" : "");
  if (!country) problems.push("country is required");
  const timeZone = text(raw.timeZone) || (source.sample ? "UTC" : "");
  if (!isValidTimeZone(timeZone)) problems.push("timeZone must be an IANA time zone such as Europe/Madrid");
  const startDate = text(raw.startDate);
  const start = parseDate(startDate);
  if (!start) problems.push("startDate must be a real date written as YYYY-MM-DD");
  const endDate = text(raw.endDate);
  const end = parseDate(endDate);
  if (!end) problems.push("endDate must be a real date written as YYYY-MM-DD");
  if (start && end && end < start) problems.push("endDate is before startDate");
  const status = raw.status === undefined ? "scheduled" : text(raw.status);
  if (!STATUSES.has(status)) problems.push('status must be "scheduled" or "cancelled"');
  const anchorTarget = raw.anchorTarget === undefined ? "card" : text(raw.anchorTarget);
  if (!ANCHOR_TARGETS.has(anchorTarget)) problems.push('anchorTarget must be "card" or "itinerary"');
  const anchor = text(raw.anchor) || `trip-${slug}`;
  if (!SLUG_PATTERN.test(anchor)) problems.push("anchor must use lowercase letters, numbers, and hyphens");
  const moroccoPageAnchor = text(raw.moroccoPageAnchor) || `morocco-program-${slug}`;
  if (!SLUG_PATTERN.test(moroccoPageAnchor)) problems.push("moroccoPageAnchor must use lowercase letters, numbers, and hyphens");
  const printableItinerary = text(raw.printableItinerary);
  if (printableItinerary && !isSafeLink(printableItinerary)) problems.push("printableItinerary must be a site path starting with /");
  const homeImage = text(raw.homeImage);
  if (homeImage && !isSafeImageSrc(homeImage)) problems.push("homeImage must be a site path or https:// URL");

  if (problems.length) {
    report(`"${label}": ${problems.join("; ")}`);
    return null;
  }

  let cover = null;
  if (raw.coverImage !== undefined) {
    cover = normalizeImage(raw.coverImage);
    if (!cover) report(`"${slug}" coverImage needs a valid src and alt text`);
  }

  const gallery = [];
  (Array.isArray(raw.gallery) ? raw.gallery : []).forEach((item, index) => {
    const image = normalizeImage(item);
    if (image) gallery.push(image);
    else report(`"${slug}" gallery photo ${index + 1} needs a valid src and alt text`);
  });

  const videos = [];
  (Array.isArray(raw.videos) ? raw.videos : []).forEach((item, index) => {
    const video = toVideoEmbed(item);
    if (video) videos.push(video);
    else report(`"${slug}" video ${index + 1} needs a YouTube or Vimeo url and a title`);
  });

  const itinerary = source.sample ? "" : readItinerary(slug, report);
  if (anchorTarget === "itinerary" && !itinerary && !source.sample) {
    report(`"${slug}" has anchorTarget "itinerary" but no data/itineraries/${slug}.html`);
  }

  return {
    slug,
    title,
    country,
    destination,
    timeZone,
    startDate,
    endDate,
    start,
    end,
    dates: formatDateRange(start, end),
    cancelled: status === "cancelled",
    price: text(raw.price),
    summary,
    pastSummary: text(raw.pastSummary) || (source.sample ? summary : ""),
    itinerary,
    printableItinerary,
    anchor,
    anchorTarget: itinerary ? anchorTarget : "card",
    moroccoPageAnchor,
    homeImage,
    featured: normalizeFeatured(raw.featured, slug, report),
    cover,
    description: textList(raw.description),
    highlights: textList(raw.highlights),
    gallery,
    videos,
    sample: source.sample,
  };
}

class TripDataError extends Error {
  constructor(sourceName, problems) {
    super(`${sourceName} has ${problems.length} problem(s):\n  - ${problems.join("\n  - ")}`);
    this.name = "TripDataError";
    this.problems = problems;
  }
}

function defaultSources() {
  const sources = [{ file: DATA_FILE, name: "data/trips.json", sample: false }];
  if (sampleModeEnabled()) {
    sources.push({ file: SAMPLE_DATA_FILE, name: "data/past-experiences.sample.json", sample: true });
  }
  return sources;
}

// Problems in the real trip file throw a TripDataError so pages fail loudly instead of quietly dropping departures.
// Problems in the local-only sample file are logged and that trip is skipped.
function loadTrips({ sources = defaultSources() } = {}) {
  const trips = [];
  const seenSlugs = new Set();
  const seenDepartures = new Set();

  for (const source of sources) {
    const problems = [];
    const report = (message) => problems.push(message);

    let rawTrips = [];
    try {
      const parsed = source.data !== undefined ? source.data : JSON.parse(fs.readFileSync(source.file, "utf8"));
      if (!parsed || !Array.isArray(parsed.trips)) throw new Error('expected an object with a "trips" list');
      rawTrips = parsed.trips;
    } catch (error) {
      report(`could not be read: ${error.message}`);
    }

    for (const raw of rawTrips) {
      const trip = normalizeTrip(raw && typeof raw === "object" ? raw : {}, source, report);
      if (!trip) continue;
      const departureKey = `${trip.title.toLowerCase()}|${trip.startDate}`;
      if (seenSlugs.has(trip.slug)) {
        report(`duplicate slug "${trip.slug}"`);
        continue;
      }
      if (seenDepartures.has(departureKey)) {
        report(`"${trip.slug}" has the same title and start date as another trip`);
        continue;
      }
      seenSlugs.add(trip.slug);
      seenDepartures.add(departureKey);
      trips.push(trip);
    }

    if (problems.length && !source.sample) throw new TripDataError(source.name, problems);
    problems.forEach((message) => console.warn(`trips: skipped in ${source.name}: ${message}`));
  }

  return trips;
}

function upcomingTrips(trips, clock) {
  return trips
    .filter((trip) => !trip.sample && tripStatus(trip, clock) === "upcoming")
    .sort((a, b) => a.start - b.start || a.end - b.end || a.slug.localeCompare(b.slug));
}

function pastTrips(trips, clock) {
  return trips
    .filter((trip) => tripStatus(trip, clock) === "past")
    .sort((a, b) => b.end - a.end || b.start - a.start || a.slug.localeCompare(b.slug));
}

function featuredTrip(trips, clock) {
  const candidates = upcomingTrips(trips, clock).filter((trip) => trip.featured && isBookable(trip, clock));
  if (!candidates.length) return null;
  return candidates[dayNumber(clock) % candidates.length];
}

module.exports = {
  TripDataError,
  currentClock,
  dayNumber,
  featuredTrip,
  formatMonthYear,
  formatShortRange,
  isBookable,
  isInProgress,
  isSafeImageSrc,
  loadTrips,
  localDate,
  parseDate,
  pastTrips,
  tripStatus,
  upcomingTrips,
};
