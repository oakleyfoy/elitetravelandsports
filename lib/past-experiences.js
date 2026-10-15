const fs = require("node:fs");
const path = require("node:path");
const {
  SITE_URL,
  absoluteUrl,
  allowReadOnly,
  escapeHtml,
  fillTemplate,
  indent,
  redirect,
  sendHtml,
  sendServerError,
  sendText,
} = require("./html");
const { currentClock, loadTrips, pastTrips } = require("./trips");

const ROOT_DIR = path.join(__dirname, "..");
const LIST_TEMPLATE_FILE = path.join(ROOT_DIR, "past-experiences", "index.html");
const TRIP_TEMPLATE_FILE = path.join(ROOT_DIR, "past-experiences", "_trip.html");
const SITEMAP_FILE = path.join(ROOT_DIR, "sitemap.xml");

const BASE_PATH = "/past-experiences/";
const DEFAULT_SHARE_IMAGE = "/assets/destinations/destinations-hero-primary.jpg";

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

function renderCoverPlaceholder(trip) {
  return `<div class="past-cover-placeholder" role="img" aria-label="${escapeHtml(`${trip.title}: photos coming soon`)}">
  <img src="/assets/elite-icon-transparent.png" alt="" width="58" height="58" decoding="async" />
  <span class="past-cover-placeholder-label">Photos coming soon</span>
  <span class="past-cover-placeholder-destination">${escapeHtml(trip.destination)}</span>
</div>`;
}

function pastSummary(trip) {
  return trip.pastSummary || (trip.itinerary ? trip.summary : "");
}

function renderTripCard(trip) {
  const badge = trip.sample ? '<span class="past-sample-badge">Sample</span>' : "";
  const media = trip.cover
    ? `<img src="${escapeHtml(trip.cover.thumbnail)}" alt="${escapeHtml(trip.cover.alt)}" loading="lazy" decoding="async" />`
    : indent(renderCoverPlaceholder(trip), 18);
  return `<li>
              <article class="past-trip-card" data-trip="${escapeHtml(trip.slug)}">
                <div class="past-trip-card-media">
                  ${media}
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
            <p>Select a trip to see its itinerary, photos, and videos.</p>
          </div>
          <ul class="past-trip-grid" role="list">
            ${trips.map(renderTripCard).join("\n            ")}
          </ul>`;
}

function sectionClass(alt) {
  return alt ? "interior-section alt" : "interior-section";
}

function renderStorySection(trip, alt) {
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
  return `<section class="${sectionClass(alt)}">
        <div class="interior-section-inner ${layout}">
          ${story}
          ${highlights}
        </div>
      </section>`;
}

function renderGallerySection(trip, alt) {
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

  return `<section class="${sectionClass(alt)}" aria-labelledby="past-gallery-heading">
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

function renderVideoSection(trip, alt) {
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

  return `<section class="${sectionClass(alt)}" aria-labelledby="past-videos-heading">
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

function renderMediaComingSoon(trip, alt) {
  if (trip.gallery.length || trip.videos.length) return "";
  return `<section class="${sectionClass(alt)}" aria-labelledby="past-media-heading">
        <div class="interior-section-inner">
          <div class="past-media-soon">
            <img src="/assets/elite-icon-transparent.png" alt="" width="52" height="52" decoding="async" />
            <p class="eyebrow">Photo Gallery &amp; Video</p>
            <h2 id="past-media-heading">Photos and videos coming soon</h2>
            <p>Moments from this journey are being gathered and will be shared here soon.</p>
          </div>
        </div>
      </section>`;
}

function renderItinerarySection(trip, alt) {
  if (!trip.itinerary) return "";
  return `<section class="${sectionClass(alt)}" aria-labelledby="past-itinerary-heading">
        <div class="interior-section-inner">
          <div class="section-heading">
            <p class="eyebrow">The Itinerary</p>
            <h2 id="past-itinerary-heading">Day by day</h2>
          </div>
          <div class="past-itinerary">
            ${indent(trip.itinerary, 12)}
          </div>
        </div>
      </section>`;
}

function renderTripSections(trip) {
  const renderers = [
    renderStorySection,
    renderGallerySection,
    renderVideoSection,
    renderMediaComingSoon,
    renderItinerarySection,
  ];
  const sections = [];
  let alt = !(trip.description.length || trip.highlights.length);
  for (const render of renderers) {
    const html = render(trip, alt);
    if (!html) continue;
    sections.push(html);
    alt = !alt;
  }
  return sections.join("\n\n      ");
}

function renderListPage(trips) {
  const template = fs.readFileSync(LIST_TEMPLATE_FILE, "utf8");
  const hasSample = trips.some((trip) => trip.sample);
  const withCover = trips.find((trip) => trip.cover);
  const shareImage = withCover ? withCover.cover.src : DEFAULT_SHARE_IMAGE;

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
  const summary = pastSummary(trip);
  const cover = trip.cover
    ? `<figure class="past-trip-hero-photo">
            <img src="${escapeHtml(trip.cover.src)}" alt="${escapeHtml(trip.cover.alt)}" decoding="async" fetchpriority="high" />
          </figure>`
    : `<figure class="past-trip-hero-photo">
            ${indent(renderCoverPlaceholder(trip), 12)}
          </figure>`;

  return fillTemplate(template, {
    PAGE_TITLE: escapeHtml(pageTitle),
    META_DESCRIPTION: escapeHtml(summary || `${trip.title} in ${trip.destination}, ${trip.dates}.`),
    CANONICAL_URL: escapeHtml(`${SITE_URL}${BASE_PATH}${trip.slug}/`),
    SHARE_IMAGE: escapeHtml(absoluteUrl(trip.cover ? trip.cover.src : DEFAULT_SHARE_IMAGE)),
    ROBOTS_META: robotsMeta(trip.sample),
    SAMPLE_NOTICE: trip.sample ? renderSampleNotice() : "",
    TRIP_TITLE: escapeHtml(trip.title),
    TRIP_DESTINATION: escapeHtml(trip.destination),
    TRIP_DATES: escapeHtml(trip.dates),
    TRIP_SUMMARY: summary ? `<p>${escapeHtml(summary)}</p>` : "",
    TRIP_COVER: cover,
    TRIP_SECTIONS: renderTripSections(trip),
  });
}

function handlePastExperiences(req, res, pathname) {
  try {
    if (!allowReadOnly(req, res)) return;

    if (pathname === "/past-experiences") {
      redirect(res, BASE_PATH);
      return;
    }

    const past = pastTrips(loadTrips(), currentClock());

    if (pathname === BASE_PATH || pathname === `${BASE_PATH}index.html`) {
      sendHtml(req, res, 200, renderListPage(past));
      return;
    }

    const match = pathname.slice(BASE_PATH.length).match(/^([a-z0-9-]+)(\/)?$/);
    const trip = match ? past.find((item) => item.slug === match[1]) : null;
    if (!trip) {
      sendText(res, 404, "Not found");
      return;
    }

    if (!match[2]) {
      redirect(res, `${BASE_PATH}${trip.slug}/`);
      return;
    }

    sendHtml(req, res, 200, renderTripPage(trip));
  } catch (error) {
    sendServerError(req, res, "past-experiences", error);
  }
}

function handleSitemap(req, res) {
  try {
    const sitemap = fs.readFileSync(SITEMAP_FILE, "utf8");
    const entries = pastTrips(loadTrips(), currentClock())
      .filter((trip) => !trip.sample)
      .map((trip) => `  <url>\n    <loc>${SITE_URL}${BASE_PATH}${trip.slug}/</loc>\n  </url>\n`)
      .join("");
    const body = sitemap.replace("</urlset>", `${entries}</urlset>`);
    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-cache" });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (error) {
    sendServerError(req, res, "sitemap", error);
  }
}

module.exports = { handlePastExperiences, handleSitemap, renderListPage, renderTripPage };
