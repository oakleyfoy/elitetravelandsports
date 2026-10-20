const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  TripDataError,
  currentClock,
  dayNumber,
  featuredTrip,
  isBookable,
  isInProgress,
  loadTrips,
  localDate,
  pastTrips,
  tripStatus,
  upcomingTrips,
} = require("../lib/trips");
const { renderPage } = require("../lib/upcoming");
const { renderListPage, renderTripPage } = require("../lib/past-experiences");

const ROOT_DIR = path.join(__dirname, "..");
const FALLBACK = "New experiences are on the horizon. Explore our past journeys or contact us to plan your next adventure.";
const MOROCCO_FALLBACK =
  "There are currently no scheduled Morocco departures. Contact our team to explore future opportunities.";

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

function loadError(rawTrips) {
  try {
    load(rawTrips);
  } catch (error) {
    return error;
  }
  assert.fail("expected the trip data to be rejected");
}

function at(isoInstant) {
  return { now: new Date(isoInstant), today: null };
}

function on(day) {
  return { now: new Date(`${day}T12:00:00Z`), today: day };
}

function realTrips() {
  return loadTrips({ sources: [{ file: path.join(ROOT_DIR, "data", "trips.json"), name: "data/trips.json", sample: false }] });
}

function realRawTrips() {
  return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "data", "trips.json"), "utf8")).trips;
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function withEnv(values, fn) {
  const saved = {};
  for (const key of Object.keys(values)) {
    saved[key] = process.env[key];
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

function startServer(cwd, extraEnv = {}) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const env = { ...process.env, PORT: String(port), ...extraEnv };
  delete env.RENDER;
  delete env.PAST_EXPERIENCES_SAMPLE;
  const child = spawn(process.execPath, ["server.js"], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const ready = new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => String(chunk).includes("listening") && resolve());
    child.on("exit", (code) => reject(new Error(`server exited with ${code}`)));
  });
  return { child, ready, base: `http://127.0.0.1:${port}`, stderr: () => stderr };
}

describe("trip status by destination-local date", () => {
  const [spain] = load([trip()]);

  test("before the trip starts it is upcoming and bookable", () => {
    assert.equal(tripStatus(spain, on("2026-12-01")), "upcoming");
    assert.equal(isBookable(spain, on("2027-01-26")), true);
  });

  test("from the start date it stays upcoming but stops taking bookings", () => {
    for (const day of ["2027-01-27", "2027-01-30", "2027-02-03"]) {
      assert.equal(tripStatus(spain, on(day)), "upcoming", day);
      assert.equal(isBookable(spain, on(day)), false, day);
      assert.equal(isInProgress(spain, on(day)), true, day);
    }
  });

  test("bookings close at midnight in the destination on the start date", () => {
    assert.equal(isBookable(spain, at("2027-01-26T22:59:59Z")), true);
    assert.equal(isBookable(spain, at("2027-01-26T23:00:00Z")), false);
  });

  test("the day after the end date it is past", () => {
    assert.equal(tripStatus(spain, on("2027-02-04")), "past");
    assert.equal(isInProgress(spain, on("2027-02-04")), false);
  });

  test("moves at midnight in the destination, not UTC or US time", () => {
    // Madrid is UTC+1 in February.
    assert.equal(tripStatus(spain, at("2027-02-03T22:59:59Z")), "upcoming");
    assert.equal(tripStatus(spain, at("2027-02-03T23:00:00Z")), "past");
  });

  test("Tokyo moves while it is still the end date in the United States", () => {
    const [tokyo] = load([trip({ timeZone: "Asia/Tokyo", startDate: "2027-04-14", endDate: "2027-04-21" })]);
    const instant = at("2027-04-21T15:00:00Z");
    assert.equal(localDate("America/New_York", instant.now), "2027-04-21");
    assert.equal(localDate("Asia/Tokyo", instant.now), "2027-04-22");
    assert.equal(tripStatus(tokyo, instant), "past");
    assert.equal(tripStatus(tokyo, at("2027-04-21T14:59:59Z")), "upcoming");
  });

  test("Casablanca daylight rules are applied", () => {
    const [morocco] = load([trip({ timeZone: "Africa/Casablanca", startDate: "2027-03-13", endDate: "2027-03-20" })]);
    assert.equal(tripStatus(morocco, at("2027-03-20T22:59:59Z")), "upcoming");
    assert.equal(tripStatus(morocco, at("2027-03-20T23:00:00Z")), "past");
  });

  test("a trip that crosses the new year moves on the day after it ends", () => {
    const [newYear] = load([trip({ timeZone: "Europe/Rome", startDate: "2026-12-28", endDate: "2027-01-03" })]);
    assert.equal(newYear.dates, "December 28, 2026 – January 3, 2027");
    assert.equal(tripStatus(newYear, on("2026-12-31")), "upcoming");
    assert.equal(tripStatus(newYear, on("2027-01-01")), "upcoming");
    assert.equal(tripStatus(newYear, on("2027-01-03")), "upcoming");
    assert.equal(tripStatus(newYear, on("2027-01-04")), "past");
    assert.equal(tripStatus(newYear, at("2027-01-03T22:59:59Z")), "upcoming");
    assert.equal(tripStatus(newYear, at("2027-01-03T23:00:00Z")), "past");
  });

  test("a trip ending on December 31 moves on January 1", () => {
    const [yearEnd] = load([trip({ startDate: "2027-12-24", endDate: "2027-12-31" })]);
    assert.equal(tripStatus(yearEnd, on("2027-12-31")), "upcoming");
    assert.equal(tripStatus(yearEnd, on("2028-01-01")), "past");
  });

  test("cancelled trips are neither upcoming, bookable, nor past", () => {
    const trips = load([trip({ status: "cancelled" })]);
    assert.equal(tripStatus(trips[0], on("2026-01-01")), "cancelled");
    assert.equal(isBookable(trips[0], on("2026-01-01")), false);
    assert.equal(upcomingTrips(trips, on("2026-01-01")).length, 0);
    assert.equal(pastTrips(trips, on("2030-01-01")).length, 0);
  });
});

describe("loading and validating trips", () => {
  test("the real data file loads every trip", () => {
    assert.equal(realTrips().length, 10);
  });

  test("every itinerary file belongs to a trip and none mention prices or PDFs", () => {
    const slugs = new Set(realTrips().map((item) => item.slug));
    for (const file of fs.readdirSync(path.join(ROOT_DIR, "data", "itineraries"))) {
      assert.ok(slugs.has(file.replace(/\.html$/, "")), `${file} has no matching trip`);
      const html = fs.readFileSync(path.join(ROOT_DIR, "data", "itineraries", file), "utf8");
      assert.doesNotMatch(html, /\$|USD|\.pdf|per person|<a\s/i, file);
    }
  });

  test("every image referenced by the trip data exists", () => {
    for (const item of realTrips()) {
      const images = [item.homeImage, item.featured && item.featured.image, item.cover && item.cover.src, item.cover && item.cover.thumbnail];
      for (const photo of item.gallery) images.push(photo.src, photo.thumbnail);
      for (const src of images.filter((value) => value && value.startsWith("/"))) {
        assert.ok(fs.existsSync(path.join(ROOT_DIR, src)), `${item.slug}: ${src}`);
      }
      if (item.printableItinerary) {
        assert.ok(fs.existsSync(path.join(ROOT_DIR, decodeURIComponent(item.printableItinerary))), item.printableItinerary);
      }
    }
  });

  test("Greece keeps its cover, 17-photo gallery, and restored itinerary", () => {
    const greece = realTrips().find((item) => item.slug === "greece-crete-2026");
    assert.equal(greece.cover.src, "/assets/past-experiences/greece-crete-2026/13-sailboat.jpg");
    assert.equal(greece.gallery.length, 17);
    assert.equal((greece.itinerary.match(/<section>/g) || []).length, 8);
    assert.match(greece.itinerary, /Day 1: Arrival in Heraklion/);
    assert.equal(greece.price, "");
    assert.equal(greece.printableItinerary, "");
  });

  test("duplicate slugs and duplicate departures are rejected with clear reasons", () => {
    const error = loadError([trip({ slug: "first" }), trip({ slug: "first", title: "Another Title" }), trip({ slug: "second" })]);
    assert.ok(error instanceof TripDataError);
    assert.equal(error.problems.length, 2);
    assert.match(error.message, /duplicate slug "first"/);
    assert.match(error.message, /"second" has the same title and start date/);
  });

  test("every invalid field is reported, not just the first", () => {
    const error = loadError([
      trip({ slug: "bad-date", startDate: "2027-02-30" }),
      trip({ slug: "bad-zone", title: "Zone", timeZone: "Mars/Base" }),
      trip({ slug: "backwards", title: "Backwards", startDate: "2027-02-10", endDate: "2027-02-01" }),
      trip({ slug: "us-format", title: "US", endDate: "02/03/2027" }),
      trip({ slug: "bad-status", title: "Status", status: "postponed" }),
      trip({ slug: "no-country", title: "Country", country: "" }),
      trip({ slug: "bad-photo", title: "Photo", gallery: [{ src: "/a.jpg" }] }),
      trip({ slug: "valid", title: "Valid" }),
    ]);
    assert.equal(error.problems.length, 7);
    for (const slug of ["bad-date", "bad-zone", "backwards", "us-format", "bad-status", "no-country", "bad-photo"]) {
      assert.match(error.message, new RegExp(slug));
    }
    assert.doesNotMatch(error.message, /"valid"/);
  });

  test("a data file without a trips list is rejected", () => {
    assert.throws(
      () => loadTrips({ sources: [{ data: { notTrips: true }, name: "broken", sample: false }] }),
      (error) => error instanceof TripDataError && /could not be read/.test(error.message),
    );
  });

  test("problems in the local sample file only skip that trip", () => {
    const trips = loadTrips({
      sources: [
        { data: { trips: [trip()] }, name: "real", sample: false },
        { data: { trips: [{ slug: "broken" }] }, name: "sample", sample: true },
      ],
    });
    assert.deepEqual(
      trips.map((item) => item.slug),
      ["test-trip"],
    );
  });

  test("adding media later does not change a trip's status", () => {
    const [before] = load([trip()]);
    const [after] = load([trip({ gallery: [{ src: "/assets/a.jpg", alt: "A photo" }] })]);
    for (const day of ["2027-01-01", "2027-01-27", "2027-02-03", "2027-02-04"]) {
      assert.equal(tripStatus(before, on(day)), tripStatus(after, on(day)));
      assert.equal(isBookable(before, on(day)), isBookable(after, on(day)));
    }
  });
});

describe("ELITE_TODAY preview override", () => {
  test("sets today's date for local previews", () => {
    withEnv({ ELITE_TODAY: "2027-02-04", RENDER: undefined }, () => {
      assert.equal(currentClock().today, "2027-02-04");
    });
  });

  test("is ignored on Render", () => {
    withEnv({ ELITE_TODAY: "2027-02-04", RENDER: "true" }, () => {
      assert.equal(currentClock().today, null);
    });
  });

  test("is ignored when it is not a real YYYY-MM-DD date", () => {
    withEnv({ ELITE_TODAY: "02/04/2027", RENDER: undefined }, () => {
      assert.equal(currentClock().today, null);
    });
  });
});

describe("homepage rotation", () => {
  const trips = realTrips();

  test("rotates one featured trip per day in date order", () => {
    const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
    const picks = days.map((day) => featuredTrip(trips, on(day)).slug);
    assert.equal(new Set(picks.slice(0, 5)).size, 5);
    assert.equal(picks[5], picks[0]);
  });

  test("matches the previous browser rotation on the same UTC date", () => {
    const order = [
      "spain-marbella-2027",
      "morocco-marrakech-2027",
      "japan-tokyo-2027",
      "portugal-algarve-2027",
      "croatia-dubrovnik-split-2027",
    ];
    for (const day of ["2026-10-14", "2026-10-15", "2026-12-31", "2027-01-01"]) {
      assert.equal(featuredTrip(trips, on(day)).slug, order[dayNumber(on(day)) % 5], day);
    }
  });

  test("day numbers stay consecutive across the year boundary", () => {
    assert.equal(dayNumber(on("2027-01-01")) - dayNumber(on("2026-12-31")), 1);
  });

  test("a trip leaves the rotation on its start date", () => {
    for (let offset = 0; offset < 20; offset += 1) {
      const day = new Date(Date.UTC(2027, 0, 27 + offset)).toISOString().slice(0, 10);
      assert.notEqual(featuredTrip(trips, on(day)).slug, "spain-marbella-2027", day);
    }
  });

  test("returns nothing once no featured trip is open for booking", () => {
    assert.equal(featuredTrip(trips, on("2027-06-02")), null);
    assert.equal(featuredTrip(trips, on("2027-06-10")), null);
  });
});

describe("rendered pages move trips automatically", () => {
  const trips = realTrips();
  const pages = ["/", "/destinations/international/", "/destinations/morocco/"];

  function render(day, data = trips) {
    const clock = on(day);
    const html = Object.fromEntries(pages.map((page) => [page, renderPage(page, { trips: data, clock })]));
    html.past = renderListPage(pastTrips(data, clock));
    return html;
  }

  test("no template tokens are left on any page or date", () => {
    for (const day of ["2026-10-14", "2027-01-27", "2027-02-04", "2027-03-13", "2027-03-21", "2027-06-10", "2028-01-01"]) {
      for (const [page, html] of Object.entries(render(day))) {
        assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/, `${page} on ${day}`);
      }
    }
  });

  test("before its start date Spain is advertised with its price", () => {
    const html = render("2027-01-26");
    assert.match(html["/"], /January 27 – February 3, 2027 · \$6,800 USD per person/);
    assert.doesNotMatch(html["/destinations/international/"], /Departure in progress/);
  });

  test("from its start date Spain stays listed but is no longer promoted for booking", () => {
    const html = render("2027-01-27");
    assert.match(html["/"], /data-trip="spain-marbella-2027"/);
    assert.match(html["/"], /January 27 – February 3, 2027 · Departure in progress/);
    assert.doesNotMatch(html["/"], /data-featured-departure="spain-marbella-2027"/);
    const card = html["/destinations/international/"].match(/<article[^>]*data-trip="spain-marbella-2027"[\s\S]*?<\/article>/)[0];
    assert.match(card, /Departure in progress/);
    assert.match(card, /Day 1: Arrival &amp; Welcome Dinner/);
    assert.doesNotMatch(card, /Claim Your Spot/);
    assert.doesNotMatch(html.past, /spain-marbella-2027/);
  });

  test("on its end date Spain is still listed as upcoming", () => {
    const html = render("2027-02-03");
    assert.match(html["/"], /data-trip="spain-marbella-2027"/);
    assert.match(html["/destinations/international/"], /id="international-trip-spain"/);
    assert.doesNotMatch(html.past, /spain-marbella-2027/);
  });

  test("the day after, Spain moves to Past Experiences only", () => {
    const html = render("2027-02-04");
    assert.doesNotMatch(html["/"], /spain-marbella-2027|Marbella/);
    assert.doesNotMatch(html["/destinations/international/"], /spain-marbella-2027|Marbella|departures to Spain/);
    assert.match(html.past, /href="\/past-experiences\/spain-marbella-2027\/"/);
    assert.equal(html.past.match(/data-trip="spain-marbella-2027"/g).length, 1);
  });

  test("future trips never move early", () => {
    const html = render("2027-02-04");
    for (const slug of ["morocco-marrakech-2027", "japan-tokyo-2027", "italy-sicily-2027"]) {
      assert.match(html["/destinations/international/"], new RegExp(`data-trip="${slug}"`));
      assert.doesNotMatch(html.past, new RegExp(slug));
    }
  });

  test("search descriptions and the homepage destination line follow the open trips", () => {
    const today = render("2026-10-14");
    assert.match(today["/destinations/international/"], /content="Fixed-date international tennis departures to Spain, Morocco, Japan, Portugal, Croatia, Italy, and France/);
    assert.match(today["/"], /<p class="footer-prelude-destinations">Spain • Morocco • Japan • Portugal • Croatia • Italy • France<\/p>/);

    const later = render("2027-06-10");
    assert.match(later["/destinations/international/"], /departures to Italy and France with/);
    assert.match(later["/"], /<p class="footer-prelude-destinations">Italy • France<\/p>/);

    const none = render("2028-01-01");
    assert.doesNotMatch(none["/"], /footer-prelude-destinations/);
  });

  test("a past trip page shows its itinerary without price, PDF, or booking prompts", () => {
    const spain = pastTrips(trips, on("2027-02-04")).find((item) => item.slug === "spain-marbella-2027");
    const html = renderTripPage(spain);
    assert.match(html, /Day 1: Arrival &amp; Welcome Dinner at the Hotel/);
    assert.match(html, /Photos and videos coming soon/);
    assert.match(html, /past-cover-placeholder/);
    assert.doesNotMatch(html, /\$6,800|USD per person|\.pdf|Printable Itinerary|Departure in progress/);
  });

  test("Greece's page keeps its gallery and shows the restored itinerary", () => {
    const greece = pastTrips(trips, on("2026-10-15")).find((item) => item.slug === "greece-crete-2026");
    const html = renderTripPage(greece);
    assert.equal((html.match(/data-gallery-item/g) || []).length, 17);
    assert.match(html, /13-sailboat\.jpg/);
    assert.match(html, /Day 1: Arrival in Heraklion/);
    assert.doesNotMatch(html, /Photos and videos coming soon|past-cover-placeholder|\$|\.pdf/);
  });

  test("Marrakech 2026 past trip appears before Greece despite an earlier end date", () => {
    const past = pastTrips(trips, on("2026-10-15"));
    assert.equal(past[0].slug, "morocco-marrakech-2026");
    assert.equal(past[0].pastDisplayOrder, 1);
    assert.equal(past[1].slug, "greece-crete-2026");
    assert.equal(past[1].pastDisplayOrder, null);
    const list = renderListPage(past);
    assert.match(list, /Wish You Were Here\?/);
    assert.match(list, /data-trip="morocco-marrakech-2026"[\s\S]*data-trip="greece-crete-2026"/);
    assert.doesNotMatch(list, /data-trip="greece-crete-2026"[\s\S]*data-trip="morocco-marrakech-2026"/);
  });

  test("Marrakech 2026 gallery shows photos without inventing an itinerary", () => {
    const morocco = pastTrips(trips, on("2026-10-15")).find((item) => item.slug === "morocco-marrakech-2026");
    const html = renderTripPage(morocco);
    assert.equal((html.match(/data-gallery-item/g) || []).length, 31);
    assert.match(html, /01-team-on-clay-court\.jpg/);
    assert.match(html, /January 30 – February 7, 2026/);
    assert.doesNotMatch(html, /Day 1:|past-itinerary|Photos and videos coming soon|past-cover-placeholder/);
  });

  test("upcoming Morocco 2027 stays separate from the historical Marrakech gallery", () => {
    const html = render("2027-01-01");
    assert.match(html["/destinations/international/"], /data-trip="morocco-marrakech-2027"/);
    assert.match(html["/destinations/morocco/"], /March 13–20, 2027/);
    assert.match(html["/destinations/morocco/"], /\$6,800 USD per person/);
    assert.doesNotMatch(html["/destinations/international/"], /morocco-marrakech-2026/);
    assert.doesNotMatch(html.past, /morocco-marrakech-2027/);
    assert.match(html.past, /morocco-marrakech-2026/);
  });

  test("pastDisplayOrder pins listed trips; others stay newest first", () => {
    const ordered = load([
      trip({ slug: "older", title: "Older", startDate: "2025-01-01", endDate: "2025-01-08", pastDisplayOrder: 2 }),
      trip({ slug: "newer", title: "Newer", startDate: "2026-06-01", endDate: "2026-06-08" }),
      trip({ slug: "pinned", title: "Pinned", startDate: "2024-01-01", endDate: "2024-01-08", pastDisplayOrder: 1 }),
      trip({ slug: "mid", title: "Mid", startDate: "2025-06-01", endDate: "2025-06-08" }),
    ]);
    assert.deepEqual(
      pastTrips(ordered, on("2027-01-01")).map((item) => item.slug),
      ["pinned", "older", "newer", "mid"],
    );
  });

  test("Morocco page and form offer the departure only until it starts", () => {
    const before = render("2027-03-12")["/destinations/morocco/"];
    assert.match(before, /id="morocco-program-mar-2027"/);
    assert.match(before, /<option value="Marrakech Discovery &amp; Tennis Experience — March 13–20, 2027">March 13–20, 2027<\/option>/);
    assert.match(before, /<p>A Marrakech Discovery &amp; Tennis Experience departure with the published itinerary/);
    assert.match(before, /Ask about availability for a fixed-date departure\./);
    assert.match(before, /<h2 id="morocco-yearround-heading">Fixed-date Morocco tennis departures\.<\/h2>/);

    const during = render("2027-03-13")["/destinations/morocco/"];
    assert.match(during, /data-trip="morocco-marrakech-2027"/);
    assert.match(during, /Departure in progress/);
    assert.match(during, /The Marrakech Discovery &amp; Tennis Experience departure is in progress\. Contact our team/);
    assert.doesNotMatch(during, /no scheduled Morocco departures/);
    assert.match(during, /<h2 id="morocco-yearround-heading">Morocco tennis journeys\.<\/h2>/);
    assert.doesNotMatch(during, /<option value="Marrakech/);
    assert.match(during, /<option value="Future Morocco departures">/);
    assert.match(during, /data-morocco-program-form/);
  });

  test("an expired Morocco departure is not advertised anywhere on the Morocco page", () => {
    const after = render("2027-03-21")["/destinations/morocco/"];
    assert.doesNotMatch(after, /Marrakech|March 13|\$6,800|morocco-brochure-grid|Fixed-date Morocco/);
    assert.match(visibleText(after), new RegExp(MOROCCO_FALLBACK.replace(/\./g, "\\.")));
    assert.match(after, /<h3>Ask about future Morocco departures\.<\/h3>/);
    assert.match(after, /<option value="Future Morocco departures">Future Morocco departures<\/option>/);
    assert.match(after, /data-morocco-program-form/);
    assert.match(after, /<form[\s\S]*action="\/api\/submit-inquiry"/);
  });

  test("with nothing upcoming every page shows the approved fallback message", () => {
    const html = render("2028-01-01");
    assert.ok(visibleText(html["/"]).includes(FALLBACK), "homepage");
    assert.ok(visibleText(html["/destinations/international/"]).includes(FALLBACK), "international");
    assert.match(html["/"], /href="\/past-experiences\/"/);
    assert.match(html["/destinations/international/"], /href="\/past-experiences\/"/);
    assert.doesNotMatch(html["/destinations/international/"], /scheduled departures|remaining space/);
    assert.match(render("2027-06-10")["/destinations/international/"], /contact Elite to confirm remaining space/);
    assert.equal((html.past.match(/class="past-trip-card"/g) || []).length, 10);
  });

  test("cancelled trips disappear from upcoming and never reach Past Experiences", () => {
    const withCancelled = load(
      realRawTrips().map((item) => (item.slug === "japan-tokyo-2027" ? { ...item, status: "cancelled" } : item)),
    );
    for (const day of ["2027-01-01", "2027-04-15", "2027-04-22", "2028-01-01"]) {
      const html = render(day, withCancelled);
      for (const page of pages) assert.doesNotMatch(html[page], /japan-tokyo-2027|Tokyo/, `${page} on ${day}`);
      assert.doesNotMatch(html.past, /japan-tokyo-2027/);
    }
  });

  test("a cancelled Morocco departure leaves the Morocco page and form", () => {
    const withCancelled = load(
      realRawTrips().map((item) => (item.slug === "morocco-marrakech-2027" ? { ...item, status: "cancelled" } : item)),
    );
    const html = render("2027-01-01", withCancelled)["/destinations/morocco/"];
    assert.doesNotMatch(html, /Marrakech|morocco-brochure-grid/);
    assert.match(html, /<option value="Future Morocco departures">/);
  });

  test("the footer and War Experiences LLC line are unchanged on rendered pages", () => {
    const html = render("2027-02-04");
    for (const page of [...pages, "past"]) {
      assert.match(
        html[page],
        /<strong>War Experiences LLC<\/strong> operates Elite Travel &amp; Sports Tours USA \(Elite Travel Sports USA\)\./,
      );
    }
  });
});

describe("server", () => {
  const server = startServer(ROOT_DIR, { ELITE_TODAY: "2027-02-04" });
  const { base } = server;

  before(() => server.ready);
  after(() => server.child.kill());

  test("rendered pages are served without caching and without tokens", async () => {
    for (const page of ["/", "/index.html", "/destinations/international/", "/destinations/morocco/index.html"]) {
      const response = await fetch(base + page);
      assert.equal(response.status, 200, page);
      assert.equal(response.headers.get("cache-control"), "no-cache", page);
      assert.doesNotMatch(await response.text(), /\{\{/, page);
    }
  });

  test("trip pages move on the day after the end date", async () => {
    assert.equal((await fetch(`${base}/past-experiences/spain-marbella-2027/`)).status, 200);
    assert.equal((await fetch(`${base}/past-experiences/morocco-marrakech-2027/`)).status, 404);
    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.match(sitemap, /past-experiences\/spain-marbella-2027\//);
    assert.doesNotMatch(sitemap, /morocco-marrakech-2027/);
  });

  test("raw templates and project files are not served", async () => {
    for (const page of ["/destinations/International/index.html", "/Index.html", "/data/trips.json", "/lib/trips.js"]) {
      assert.equal((await fetch(base + page)).status, 404, page);
    }
  });

  test("directory URLs without a trailing slash redirect", async () => {
    const response = await fetch(`${base}/destinations/morocco`, { redirect: "manual" });
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "/destinations/morocco/");
  });

  test("existing static pages and the inquiry API still respond", async () => {
    for (const page of ["/about/", "/plan-a-journey/", "/styles.css", "/script.js", "/morocco-programs.js", "/claim-registration.js"]) {
      assert.equal((await fetch(base + page)).status, 200, page);
    }
    assert.equal((await fetch(`${base}/api/public-config`)).status, 200);
    assert.equal((await fetch(`${base}/api/submit-inquiry`, { method: "GET" })).status, 405);
    assert.equal((await fetch(`${base}/api/submit-registration`, { method: "GET" })).status, 405);
  });
});

describe("server with malformed trip data", () => {
  const siteCopy = fs.mkdtempSync(path.join(os.tmpdir(), "elite-bad-data-"));
  for (const entry of ["server.js", "lib", "index.html", "destinations", "past-experiences", "about", "sitemap.xml", "styles.css"]) {
    fs.cpSync(path.join(ROOT_DIR, entry), path.join(siteCopy, entry), { recursive: true });
  }
  // registration.js depends on libphonenumber-js; keep the temp site bootable without a full install.
  fs.mkdirSync(path.join(siteCopy, "node_modules"), { recursive: true });
  fs.cpSync(
    path.join(ROOT_DIR, "node_modules", "libphonenumber-js"),
    path.join(siteCopy, "node_modules", "libphonenumber-js"),
    { recursive: true },
  );
  fs.mkdirSync(path.join(siteCopy, "data"));
  fs.writeFileSync(path.join(siteCopy, "data", "trips.json"), '{ "trips": [ { "slug": "oops", } ] }');
  const server = startServer(siteCopy);

  before(() => server.ready);
  after(() => {
    server.child.kill();
    fs.rmSync(siteCopy, { recursive: true, force: true });
  });

  test("trip pages return a generic 500 instead of an empty schedule", async () => {
    for (const page of ["/", "/destinations/international/", "/destinations/morocco/", "/past-experiences/", "/sitemap.xml"]) {
      const response = await fetch(server.base + page);
      assert.equal(response.status, 500, page);
      const body = await response.text();
      assert.match(body, /This page is temporarily unavailable/, page);
      assert.doesNotMatch(body, /trips\.json|JSON|Unexpected|at .*\.js|oops/, page);
      assert.doesNotMatch(body, /New experiences are on the horizon/, page);
    }
  });

  test("the server log names the file and the problem", async () => {
    await fetch(`${server.base}/`);
    assert.match(server.stderr(), /trip data is invalid/);
    assert.match(server.stderr(), /data\/trips\.json has 1 problem/);
  });

  test("pages that do not use trip data keep working", async () => {
    assert.equal((await fetch(`${server.base}/about/`)).status, 200);
  });
});
