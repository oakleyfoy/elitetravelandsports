const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  loadTestimonials,
  publishedTestimonials,
  featuredTestimonials,
  testimonialsForExperience,
} = require("../lib/testimonials");
const { loadTrips, pastTrips, currentClock } = require("../lib/trips");
const { renderListPage, renderTripPage } = require("../lib/past-experiences");

const DATA_FILE = path.join(__dirname, "..", "data", "testimonials.json");

function writeTempTestimonials(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "elite-testimonials-"));
  const file = path.join(dir, "testimonials.json");
  fs.writeFileSync(file, JSON.stringify({ testimonials: entries }, null, 2));
  return file;
}

function withTestimonialsFile(entries, fn) {
  const original = fs.readFileSync(DATA_FILE, "utf8");
  fs.writeFileSync(DATA_FILE, JSON.stringify({ testimonials: entries }, null, 2));
  try {
    return fn();
  } finally {
    fs.writeFileSync(DATA_FILE, original);
  }
}

test("Marrakech 2026 testimonials load uniquely under morocco-marrakech-2026", () => {
  const items = loadTestimonials();
  assert.equal(items.length, 6);
  assert.equal(new Set(items.map((item) => item.id)).size, 6);
  assert.ok(items.every((item) => item.experienceSlug === "morocco-marrakech-2026"));
  assert.ok(items.every((item) => item.published));

  const names = items.map((item) => item.displayName);
  assert.deepEqual(names, [
    "Claire Fripp",
    "Orest Hrabowych",
    "Indu Tursa",
    "Margaret",
    "Margaret DePiore Neiheisel",
    "Kaaren Shaefler",
  ]);

  const indu = items.find((item) => item.id === "marrakech-2026-indu-tursa");
  assert.equal(
    indu.quote,
    "I cannot speak highly enough about our experience and the owners of this tour group.",
  );
  assert.equal(indu.excerpt, true);
});

test("publishedTestimonials ignores unpublished and unknown trip slugs", () => {
  const file = writeTempTestimonials([
    {
      id: "published-greece",
      quote: "An approved quote.",
      displayName: "Jordan A.",
      experienceSlug: "greece-crete-2026",
      published: true,
      featured: true,
    },
    {
      id: "draft-greece",
      quote: "Should stay hidden.",
      displayName: "Hidden Name",
      experienceSlug: "greece-crete-2026",
      published: false,
      featured: true,
    },
    {
      id: "unknown-trip",
      quote: "Wrong trip.",
      displayName: "Someone",
      experienceSlug: "not-a-real-trip",
      published: true,
      featured: true,
    },
  ]);

  const items = loadTestimonials({ file });
  const published = publishedTestimonials(items, new Set(["greece-crete-2026"]));
  assert.deepEqual(
    published.map((item) => item.id),
    ["published-greece"],
  );
  assert.equal(testimonialsForExperience(items, "greece-crete-2026", ["greece-crete-2026"]).length, 1);
  assert.equal(testimonialsForExperience(items, "morocco-marrakech-2026", ["morocco-marrakech-2026"]).length, 0);
});

test("featuredTestimonials only returns featured published entries", () => {
  const items = loadTestimonials();
  const past = pastTrips(loadTrips(), currentClock());
  const slugs = new Set(past.map((trip) => trip.slug));
  const featured = featuredTestimonials(items, slugs);
  assert.deepEqual(
    featured.map((item) => item.displayName),
    ["Claire Fripp", "Orest Hrabowych", "Indu Tursa", "Margaret"],
  );
});

test("list page features Claire, Orest, Indu, and Margaret only", () => {
  const previous = process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW;
  delete process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW;

  try {
    const past = pastTrips(loadTrips(), currentClock());
    const list = renderListPage(past);
    assert.match(list, /past-testimonials-heading/);
    assert.match(list, /Claire Fripp/);
    assert.match(list, /Orest Hrabowych/);
    assert.match(list, /Indu Tursa/);
    assert.match(list, />Margaret</);
    assert.doesNotMatch(list, /Margaret DePiore Neiheisel/);
    assert.doesNotMatch(list, /Kaaren Shaefler/);
    assert.match(list, /data-excerpt="true"/);
    assert.match(list, /Excerpt from a longer review/);
    assert.match(list, /href="\/past-experiences\/morocco-marrakech-2026\/"/);
    assert.equal((list.match(/class="past-testimonial-card"/g) || []).length, 4);
  } finally {
    if (previous === undefined) delete process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW;
    else process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW = previous;
  }
});

test("Marrakech detail shows all six; Greece detail shows none", () => {
  const previous = process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW;
  delete process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW;

  try {
    const past = pastTrips(loadTrips(), currentClock());
    const marrakech = past.find((item) => item.slug === "morocco-marrakech-2026");
    const greece = past.find((item) => item.slug === "greece-crete-2026");
    assert.ok(marrakech);
    assert.ok(greece);

    const marrakechPage = renderTripPage(marrakech, past);
    assert.equal((marrakechPage.match(/class="past-testimonial-card"/g) || []).length, 6);
    assert.match(marrakechPage, /Claire Fripp/);
    assert.match(marrakechPage, /Orest Hrabowych/);
    assert.match(marrakechPage, /Indu Tursa/);
    assert.match(marrakechPage, />Margaret</);
    assert.match(marrakechPage, /Margaret DePiore Neiheisel/);
    assert.match(marrakechPage, /Kaaren Shaefler/);
    assert.match(marrakechPage, /it was a wonderful experience! thank you/);

    const greecePage = renderTripPage(greece, past);
    assert.doesNotMatch(greecePage, /past-testimonials-heading/);
    assert.doesNotMatch(greecePage, /Claire Fripp/);
  } finally {
    if (previous === undefined) delete process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW;
    else process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW = previous;
  }
});

test("quotes are HTML-escaped in rendered output", () => {
  const previous = process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW;
  delete process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW;

  withTestimonialsFile(
    [
      {
        id: "escape-check",
        quote: '<script>alert("x")</script> & "quoted"',
        displayName: 'Name <b>Bold</b>',
        experienceSlug: "morocco-marrakech-2026",
        published: true,
        featured: true,
      },
    ],
    () => {
      const past = pastTrips(loadTrips(), currentClock());
      const list = renderListPage(past);
      assert.match(list, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &quot;quoted&quot;/);
      assert.match(list, /Name &lt;b&gt;Bold&lt;\/b&gt;/);
      assert.doesNotMatch(list, /<script>alert/);
    },
  );

  if (previous === undefined) delete process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW;
  else process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW = previous;
});

test("list and trip pages omit testimonials section when none are published", () => {
  const previous = process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW;
  delete process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW;

  withTestimonialsFile([], () => {
    const past = pastTrips(loadTrips(), currentClock());
    const list = renderListPage(past);
    assert.doesNotMatch(list, /past-testimonials-heading/);

    const trip = past.find((item) => item.slug === "greece-crete-2026") || past[0];
    const detail = renderTripPage(trip, past);
    assert.doesNotMatch(detail, /past-testimonials-heading/);
  });

  if (previous === undefined) delete process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW;
  else process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW = previous;
});

test("layout preview renders labeled structure only when no published testimonials exist", () => {
  const previous = process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW;
  process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW = "1";

  withTestimonialsFile([], () => {
    const past = pastTrips(loadTrips(), currentClock());
    const list = renderListPage(past);
    assert.match(list, /past-testimonials-heading/);
    assert.match(list, /Layout preview · not a published quote/);
    assert.match(list, /Layout preview — an approved traveler quote will appear here/);
  });

  if (previous === undefined) delete process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW;
  else process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW = previous;
});
