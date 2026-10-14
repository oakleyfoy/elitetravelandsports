const fs = require("node:fs");
const path = require("node:path");

const ROOT_DIR = path.join(__dirname, "..");
const DATA_FILE = path.join(ROOT_DIR, "data", "past-experiences.json");
const SAMPLE_DATA_FILE = path.join(ROOT_DIR, "data", "past-experiences.sample.json");
const LIST_TEMPLATE_FILE = path.join(ROOT_DIR, "past-experiences", "index.html");
const TRIP_TEMPLATE_FILE = path.join(ROOT_DIR, "past-experiences", "_trip.html");
const SITEMAP_FILE = path.join(ROOT_DIR, "sitemap.xml");

const SITE_URL = "https://elitetravelsportsusa.com";
const BASE_PATH = "/past-experiences/";
const DEFAULT_SHARE_IMAGE = "/assets/destinations/destinations-hero-primary.jpg";

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

function sampleModeEnabled() {
  // Render sets RENDER=true on every service, so sample trips can never load in production.
  return process.env.PAST_EXPERIENCES_SAMPLE === "1" && !process.env.RENDER;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function isSafeImageSrc(src) {
  return /^\/(?!\/)[^\s"'<>]+$/.test(src) || /^https:\/\/[^\s"'<>]+$/.test(src);
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

function normalizeTrip(raw, source) {
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
  const start = parseDate(text(raw.startDate));
  if (!start) problems.push("startDate must be a real date written as YYYY-MM-DD");
  const end = parseDate(text(raw.endDate));
  if (!end) problems.push("endDate must be a real date written as YYYY-MM-DD");
  if (start && end && end < start) problems.push("endDate is before startDate");
  const cover = normalizeImage(raw.coverImage);
  if (!cover) problems.push("coverImage needs a src and alt text");

  if (problems.length) {
    console.warn(`past-experiences: skipped "${label}" in ${source.name}: ${problems.join("; ")}`);
    return null;
  }

  const gallery = [];
  (Array.isArray(raw.gallery) ? raw.gallery : []).forEach((item, index) => {
    const image = normalizeImage(item);
    if (image) gallery.push(image);
    else console.warn(`past-experiences: "${slug}" gallery photo ${index + 1} needs a valid src and alt text`);
  });

  const videos = [];
  (Array.isArray(raw.videos) ? raw.videos : []).forEach((item, index) => {
    const video = toVideoEmbed(item);
    if (video) videos.push(video);
    else console.warn(`past-experiences: "${slug}" video ${index + 1} needs a YouTube or Vimeo url and a title`);
  });

  return {
    slug,
    title,
    destination,
    summary,
    start,
    end,
    dates: formatDateRange(start, end),
    cover,
    description: textList(raw.description),
    highlights: textList(raw.highlights),
    gallery,
    videos,
    sample: source.sample,
  };
}

function loadTrips() {
  const sources = [{ file: DATA_FILE, name: "data/past-experiences.json", sample: false }];
  if (sampleModeEnabled()) {
    sources.push({ file: SAMPLE_DATA_FILE, name: "data/past-experiences.sample.json", sample: true });
  }

  const trips = [];
  const seen = new Set();

  for (const source of sources) {
    let rawTrips;
    try {
      const parsed = JSON.parse(fs.readFileSync(source.file, "utf8"));
      rawTrips = Array.isArray(parsed.trips) ? parsed.trips : [];
    } catch (error) {
      console.error(`past-experiences: could not read ${source.name}: ${error.message}`);
      continue;
    }

    for (const raw of rawTrips) {
      const trip = normalizeTrip(raw && typeof raw === "object" ? raw : {}, source);
      if (!trip) continue;
      if (seen.has(trip.slug)) {
        console.warn(`past-experiences: skipped duplicate slug "${trip.slug}" in ${source.name}`);
        continue;
      }
      seen.add(trip.slug);
      trips.push(trip);
    }
  }

  return trips.sort((a, b) => b.end - a.end || b.start - a.start);
}

function absoluteUrl(src) {
  return src.startsWith("https://") ? src : `${SITE_URL}${src}`;
}

function fillTemplate(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (token, key) => (key in values ? values[key] : ""));
}

function robotsMeta(isSample) {
  return isSample ? '<meta name="robots" content="noindex, nofollow" />' : "";
}

function renderSampleNotice() {
  return `<div class="past-sample-notice" role="note">
              <strong>Sample content &middot; local preview only</strong>
              <p>
                These trips, dates, photos, and videos are placeholders for previewing the layout. They are not real
                Elite Travel &amp; Sports events and are never shown on the live site.
              </p>
            </div>`;
}

function renderTripCard(trip) {
  const badge = trip.sample ? '<span class="past-sample-badge">Sample</span>' : "";
  return `<li>
              <article class="past-trip-card">
                <div class="past-trip-card-media">
                  <img src="${escapeHtml(trip.cover.thumbnail)}" alt="${escapeHtml(trip.cover.alt)}" loading="lazy" decoding="async" />
                  ${badge}
                </div>
                <div class="past-trip-card-body">
                  <p class="past-trip-card-destination">${escapeHtml(trip.destination)}</p>
                  <h3><a href="${BASE_PATH}${trip.slug}/">${escapeHtml(trip.title)}</a></h3>
                  <p class="past-trip-card-dates">${escapeHtml(trip.dates)}</p>
                </div>
              </article>
            </li>`;
}

function renderTripList(trips) {
  if (!trips.length) {
    return `<div class="past-empty-state">
            <p class="eyebrow">Coming Soon</p>
            <h2>Stories from completed journeys will appear here.</h2>
            <p>
              Photo galleries, videos, and highlights are added after each departure returns home. In the meantime,
              explore the upcoming calendar.
            </p>
            <div class="interior-actions">
              <a class="button button-primary" href="/destinations/international/">View Upcoming Departures</a>
              <a class="button button-secondary" href="/plan-a-journey/">Plan a Journey</a>
            </div>
          </div>`;
  }

  return `<div class="section-heading">
            <p class="eyebrow">Completed Journeys</p>
            <h2>Where Elite travelers have been.</h2>
            <p>Select a trip to see its photo gallery, videos, and highlights.</p>
          </div>
          <ul class="past-trip-grid" role="list">
            ${trips.map(renderTripCard).join("\n            ")}
          </ul>`;
}

function renderStorySection(trip) {
  if (!trip.description.length && !trip.highlights.length) return "";

  const story = trip.description.length
    ? `<div class="editorial-copy">
            <p class="eyebrow">The Journey</p>
            <h2>Trip overview</h2>
            ${trip.description.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n            ")}
          </div>`
    : "";

  const highlights = trip.highlights.length
    ? `<aside class="past-trip-highlights" aria-labelledby="past-highlights-heading">
            <p class="eyebrow">Highlights</p>
            <h2 id="past-highlights-heading">Trip highlights</h2>
            <ul>
              ${trip.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n              ")}
            </ul>
          </aside>`
    : "";

  const layout = story && highlights ? "past-trip-story" : "past-trip-story single";
  return `<section class="interior-section">
        <div class="interior-section-inner ${layout}">
          ${story}
          ${highlights}
        </div>
      </section>`;
}

function renderGallerySection(trip) {
  if (!trip.gallery.length) return "";

  const items = trip.gallery
    .map((photo) => {
      const caption = photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : "";
      return `<li>
              <figure>
                <a class="past-gallery-item" href="${escapeHtml(photo.src)}" data-gallery-item data-caption="${escapeHtml(photo.caption)}">
                  <img src="${escapeHtml(photo.thumbnail)}" alt="${escapeHtml(photo.alt)}" loading="lazy" decoding="async" />
                  <span class="past-visually-hidden">(opens larger view)</span>
                </a>
                ${caption}
              </figure>
            </li>`;
    })
    .join("\n            ");

  return `<section class="interior-section alt" aria-labelledby="past-gallery-heading">
        <div class="interior-section-inner">
          <div class="section-heading">
            <p class="eyebrow">Photo Gallery</p>
            <h2 id="past-gallery-heading">Moments from the trip</h2>
            <p>Select any photo to view it larger.</p>
          </div>
          <ul class="past-gallery" role="list">
            ${items}
          </ul>
        </div>
      </section>`;
}

function renderVideoSection(trip) {
  if (!trip.videos.length) return "";

  const videos = trip.videos
    .map(
      (video) => `<figure class="past-video">
              <div class="past-video-frame">
                <iframe
                  src="${escapeHtml(video.src)}"
                  title="${escapeHtml(video.title)}"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerpolicy="strict-origin-when-cross-origin"
                  allowfullscreen
                ></iframe>
              </div>
              <figcaption>${escapeHtml(video.title)} <span>&middot; ${video.provider}</span></figcaption>
            </figure>`,
    )
    .join("\n            ");

  return `<section class="interior-section" aria-labelledby="past-videos-heading">
        <div class="interior-section-inner">
          <div class="section-heading">
            <p class="eyebrow">Video</p>
            <h2 id="past-videos-heading">Watch the experience</h2>
          </div>
          <div class="past-video-grid${trip.videos.length === 1 ? " single" : ""}">
            ${videos}
          </div>
        </div>
      </section>`;
}

function renderListPage(trips) {
  const template = fs.readFileSync(LIST_TEMPLATE_FILE, "utf8");
  const hasSample = trips.some((trip) => trip.sample);
  const shareImage = trips.length ? trips[0].cover.src : DEFAULT_SHARE_IMAGE;

  return fillTemplate(template, {
    ROBOTS_META: robotsMeta(hasSample),
    SHARE_IMAGE: escapeHtml(absoluteUrl(shareImage)),
    SAMPLE_NOTICE: hasSample ? renderSampleNotice() : "",
    TRIP_LIST: renderTripList(trips),
  });
}

function renderTripPage(trip) {
  const template = fs.readFileSync(TRIP_TEMPLATE_FILE, "utf8");
  const pageTitle = `${trip.title} | Past Experiences | Elite Travel & Sports Tours USA`;

  return fillTemplate(template, {
    PAGE_TITLE: escapeHtml(pageTitle),
    META_DESCRIPTION: escapeHtml(trip.summary),
    CANONICAL_URL: escapeHtml(`${SITE_URL}${BASE_PATH}${trip.slug}/`),
    SHARE_IMAGE: escapeHtml(absoluteUrl(trip.cover.src)),
    ROBOTS_META: robotsMeta(trip.sample),
    SAMPLE_NOTICE: trip.sample ? renderSampleNotice() : "",
    TRIP_TITLE: escapeHtml(trip.title),
    TRIP_DESTINATION: escapeHtml(trip.destination),
    TRIP_DATES: escapeHtml(trip.dates),
    TRIP_SUMMARY: escapeHtml(trip.summary),
    COVER_SRC: escapeHtml(trip.cover.src),
    COVER_ALT: escapeHtml(trip.cover.alt),
    TRIP_SECTIONS: [renderStorySection(trip), renderGallerySection(trip), renderVideoSection(trip)]
      .filter(Boolean)
      .join("\n\n      "),
  });
}

function sendHtml(req, res, statusCode, html) {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(req.method === "HEAD" ? undefined : html);
}

function sendNotFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function redirect(res, location) {
  res.writeHead(301, { Location: location });
  res.end();
}

function handlePastExperiences(req, res, pathname) {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" });
      res.end("Method not allowed");
      return;
    }

    if (pathname === "/past-experiences") {
      redirect(res, BASE_PATH);
      return;
    }

    if (pathname === BASE_PATH || pathname === `${BASE_PATH}index.html`) {
      sendHtml(req, res, 200, renderListPage(loadTrips()));
      return;
    }

    const match = pathname.slice(BASE_PATH.length).match(/^([a-z0-9-]+)(\/)?$/);
    const trip = match ? loadTrips().find((item) => item.slug === match[1]) : null;
    if (!trip) {
      sendNotFound(res);
      return;
    }

    if (!match[2]) {
      redirect(res, `${BASE_PATH}${trip.slug}/`);
      return;
    }

    sendHtml(req, res, 200, renderTripPage(trip));
  } catch (error) {
    console.error("past-experiences: page render failed");
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("Server error");
  }
}

function handleSitemap(req, res) {
  try {
    const sitemap = fs.readFileSync(SITEMAP_FILE, "utf8");
    const entries = loadTrips()
      .filter((trip) => !trip.sample)
      .map((trip) => `  <url>\n    <loc>${SITE_URL}${BASE_PATH}${trip.slug}/</loc>\n  </url>\n`)
      .join("");
    const body = sitemap.replace("</urlset>", `${entries}</urlset>`);
    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (error) {
    console.error("past-experiences: sitemap render failed");
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    }
    res.end("Server error");
  }
}

module.exports = { handlePastExperiences, handleSitemap };
