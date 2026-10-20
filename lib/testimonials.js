/**
 * Past Experiences testimonials — file-backed, no CMS/database.
 *
 * Add an approved entry to data/testimonials.json:
 * {
 *   "id": "unique-kebab-id",
 *   "quote": "The exact approved traveler quote.",
 *   "displayName": "Approved display name",
 *   "experienceSlug": "morocco-marrakech-2026",
 *   "published": true,
 *   "featured": true,
 *   "excerpt": false
 * }
 *
 * - published: shown on the matching past-experience detail page
 * - featured: also shown on the main Past Experiences listing
 * - excerpt: quote is a verified excerpt from a longer review (ellipsis + label)
 *
 * Only published entries with quote, displayName, and a known past-trip slug are shown.
 * Unpublished or incomplete entries never appear on the site.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.join(__dirname, "..");
const DATA_FILE = path.join(ROOT_DIR, "data", "testimonials.json");
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const QUOTE_MAX = 1200;
const NAME_MAX = 80;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function loadTestimonialsFile() {
  if (!fs.existsSync(DATA_FILE)) return [];
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  if (!raw || !Array.isArray(raw.testimonials)) {
    throw new Error("data/testimonials.json must contain a testimonials array");
  }
  return raw.testimonials;
}

function normalizeTestimonial(raw, index, problems) {
  const label = text(raw && raw.id) || `entry ${index + 1}`;
  const id = text(raw && raw.id);
  const quote = text(raw && raw.quote);
  const displayName = text(raw && raw.displayName);
  const experienceSlug = text(raw && raw.experienceSlug);
  const published = raw && raw.published === true;
  const featured = raw && raw.featured === true;
  const excerpt = raw && raw.excerpt === true;

  if (!id || !ID_PATTERN.test(id)) {
    problems.push(`"${label}": id must be a kebab-case slug`);
    return null;
  }
  if (!quote || quote.length > QUOTE_MAX) {
    problems.push(`"${id}": quote is required and must be at most ${QUOTE_MAX} characters`);
    return null;
  }
  if (!displayName || displayName.length > NAME_MAX) {
    problems.push(`"${id}": displayName is required and must be at most ${NAME_MAX} characters`);
    return null;
  }
  if (!experienceSlug || !SLUG_PATTERN.test(experienceSlug)) {
    problems.push(`"${id}": experienceSlug must match a trip slug`);
    return null;
  }

  return { id, quote, displayName, experienceSlug, published, featured, excerpt };
}

function loadTestimonials({ file = DATA_FILE } = {}) {
  const source = file === DATA_FILE ? loadTestimonialsFile() : JSON.parse(fs.readFileSync(file, "utf8")).testimonials;
  const problems = [];
  const seen = new Set();
  const items = [];

  (Array.isArray(source) ? source : []).forEach((raw, index) => {
    const item = normalizeTestimonial(raw, index, problems);
    if (!item) return;
    if (seen.has(item.id)) {
      problems.push(`"${item.id}": duplicate id`);
      return;
    }
    seen.add(item.id);
    items.push(item);
  });

  if (problems.length) {
    const error = new Error(`testimonials data has ${problems.length} problem(s):\n  - ${problems.join("\n  - ")}`);
    error.problems = problems;
    throw error;
  }

  return items;
}

function publishedTestimonials(items, tripSlugs) {
  const allowed = tripSlugs instanceof Set ? tripSlugs : new Set(tripSlugs || []);
  return items.filter(
    (item) => item.published && allowed.has(item.experienceSlug) && item.quote && item.displayName,
  );
}

function featuredTestimonials(items, tripSlugs) {
  return publishedTestimonials(items, tripSlugs).filter((item) => item.featured);
}

function testimonialsForExperience(items, experienceSlug, tripSlugs) {
  const slug = text(experienceSlug);
  return publishedTestimonials(items, tripSlugs).filter((item) => item.experienceSlug === slug);
}

module.exports = {
  DATA_FILE,
  loadTestimonials,
  publishedTestimonials,
  featuredTestimonials,
  testimonialsForExperience,
};
