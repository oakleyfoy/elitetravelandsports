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
const {
  loadTestimonials,
  featuredTestimonials,
  testimonialsForExperience,
} = require("./testimonials");

const ROOT_DIR = path.join(__dirname, "..");
const LIST_TEMPLATE_FILE = path.join(ROOT_DIR, "past-experiences", "index.html");
const TRIP_TEMPLATE_FILE = path.join(ROOT_DIR, "past-experiences", "_trip.html");
const SITEMAP_FILE = path.join(ROOT_DIR, "sitemap.xml");

const BASE_PATH = "/past-experiences/";
const DEFAULT_SHARE_IMAGE = "/assets/destinations/destinations-hero-primary.jpg";

function layoutPreviewEnabled() {
  return process.env.ELITE_TESTIMONIALS_LAYOUT_PREVIEW === "1";
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

/**
 * Spread testimonials through a photo gallery (~every 5–6 photos when counts allow).
 * Returns ordered { type: "photo"|"testimonial", ... } entries. Photos keep original order.
 */
function interleaveGalleryWithTestimonials(photos, testimonials) {
  const gallery = Array.isArray(photos) ? photos : [];
  const quotes = Array.isArray(testimonials) ? testimonials : [];
  if (!quotes.length) return gallery.map((photo) => ({ type: "photo", photo }));
  if (!gallery.length) return quotes.map((testimonial) => ({ type: "testimonial", testimonial }));

  const insertAfter = new Map();
  for (let i = 0; i < quotes.length; i += 1) {
    let after = Math.round(((i + 1) * gallery.length) / quotes.length) - 1;
    after = Math.max(0, Math.min(gallery.length - 1, after));
    while (insertAfter.has(after) && after < gallery.length - 1) after += 1;
    while (insertAfter.has(after) && after > 0) after -= 1;
    if (!insertAfter.has(after)) insertAfter.set(after, []);
    insertAfter.get(after).push(quotes[i]);
  }

  const items = [];
  gallery.forEach((photo, index) => {
    items.push({ type: "photo", photo });
    const batch = insertAfter.get(index);
    if (!batch) return;
    batch.forEach((testimonial) => items.push({ type: "testimonial", testimonial }));
  });
  return items;
}

/** Option A: even photo grid + full-width quote banners (available via ?galleryLayout=classic). */
const GALLERY_LAYOUT_CLASSIC = "classic";
/** Option B (site default): editorial collage with mixed tile sizes. */
const GALLERY_LAYOUT_EDITORIAL = "editorial";

// Controlled repeating photo tile sizes for Option B (not random).
const EDITORIAL_PHOTO_PATTERN = ["wide", "single", "tall", "single", "single", "wide", "single", "tall", "single"];
/** Quotes at or under this length use a compact single tile in Option B. */
const EDITORIAL_SHORT_QUOTE_MAX = 72;

function resolveGalleryLayout(searchParams) {
  const fromQuery = searchParams && typeof searchParams.get === "function" ? searchParams.get("galleryLayout") : "";
  const raw = String(fromQuery || process.env.ELITE_GALLERY_LAYOUT || GALLERY_LAYOUT_EDITORIAL)
    .trim()
    .toLowerCase();
  return raw === GALLERY_LAYOUT_CLASSIC ? GALLERY_LAYOUT_CLASSIC : GALLERY_LAYOUT_EDITORIAL;
}

function editorialPhotoSize(photoIndex) {
  return EDITORIAL_PHOTO_PATTERN[photoIndex % EDITORIAL_PHOTO_PATTERN.length];
}

function editorialQuoteSpan(item) {
  const length = textLength(item && item.quote);
  return length <= EDITORIAL_SHORT_QUOTE_MAX ? "single" : "double";
}

function textLength(value) {
  return typeof value === "string" ? value.trim().length : 0;
}

function renderGalleryPhotoItem(photo, { layout = GALLERY_LAYOUT_EDITORIAL, photoIndex = 0 } = {}) {
  const caption = photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : "";
  const size = layout === GALLERY_LAYOUT_EDITORIAL ? editorialPhotoSize(photoIndex) : "single";
  const tileClass =
    layout === GALLERY_LAYOUT_EDITORIAL ? ` class="past-gallery-tile past-gallery-tile--${size}"` : "";
  // Prefer the full photo in the grid for clarity; thumbnail remains a responsive fallback.
  const fullSrc = escapeHtml(photo.src);
  const thumbSrc = escapeHtml(photo.thumbnail || photo.src);
  return `<li${tileClass}>
              <figure>
                <a class="past-gallery-item" href="${fullSrc}" data-gallery-item data-caption="${escapeHtml(photo.caption)}">
                  <img
                    src="${fullSrc}"
                    srcset="${thumbSrc} 600w, ${fullSrc} 1600w"
                    sizes="(max-width: 720px) 92vw, (max-width: 980px) 46vw, 36vw"
                    alt="${escapeHtml(photo.alt)}"
                    loading="lazy"
                    decoding="async"
                  />
                  <span class="past-visually-hidden">(opens larger view)</span>
                </a>
                ${caption}
              </figure>
            </li>`;
}

function renderGalleryTestimonialItem(item, { layout = GALLERY_LAYOUT_CLASSIC } = {}) {
  const excerptAttr = item.excerpt ? ' data-excerpt="true"' : "";
  const span = layout === GALLERY_LAYOUT_EDITORIAL ? editorialQuoteSpan(item) : "banner";
  const quoteClass =
    layout === GALLERY_LAYOUT_EDITORIAL
      ? `past-gallery-quote past-gallery-quote--${span}`
      : "past-gallery-quote";
  return `<li class="${quoteClass}">
              <figure class="past-gallery-testimonial"${excerptAttr} data-gallery-testimonial>
                <blockquote>
                  ${renderTestimonialQuote(item)}
                </blockquote>
                <figcaption>
                  <cite>${escapeHtml(item.displayName)}</cite>
                </figcaption>
              </figure>
            </li>`;
}

function renderGalleryItems(trip, testimonials, layout) {
  let photoIndex = 0;
  return interleaveGalleryWithTestimonials(trip.gallery, testimonials)
    .map((entry) => {
      if (entry.type === "testimonial") {
        return renderGalleryTestimonialItem(entry.testimonial, { layout });
      }
      const html = renderGalleryPhotoItem(entry.photo, { layout, photoIndex });
      photoIndex += 1;
      return html;
    })
    .join("\n            ");
}

function renderGallerySection(trip, alt, testimonials = [], { galleryLayout = GALLERY_LAYOUT_EDITORIAL } = {}) {
  if (!trip.gallery.length) return "";

  // Editorial collage is the default when traveler quotes are mixed into the gallery.
  // Trips without testimonials keep the classic equal photo grid (e.g. Greece).
  const layout =
    galleryLayout === GALLERY_LAYOUT_CLASSIC || !testimonials.length
      ? GALLERY_LAYOUT_CLASSIC
      : GALLERY_LAYOUT_EDITORIAL;
  const items = renderGalleryItems(trip, testimonials, layout);
  const galleryClass = layout === GALLERY_LAYOUT_EDITORIAL ? "past-gallery past-gallery--editorial" : "past-gallery";

  return `<section class="${sectionClass(alt)}" aria-labelledby="past-gallery-heading">
        <div class="interior-section-inner">
          <div class="section-heading">
            <p class="eyebrow">Photo Gallery</p>
            <h2 id="past-gallery-heading">Moments from the trip</h2>
            <p>Select any photo to view it larger.</p>
          </div>
          <ul class="${galleryClass}" role="list">
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

function renderTripSections(trip, testimonials = [], { galleryLayout = GALLERY_LAYOUT_EDITORIAL } = {}) {
  const renderers = [
    (current, alt) => renderStorySection(current, alt),
    (current, alt) => renderGallerySection(current, alt, testimonials, { galleryLayout }),
    (current, alt) => renderVideoSection(current, alt),
    (current, alt) => renderMediaComingSoon(current, alt),
    (current, alt) => renderItinerarySection(current, alt),
  ];
  const sections = [];
  let alt = !(trip.description.length || trip.highlights.length);
  for (const render of renderers) {
    const html = render(trip, alt);
    if (!html) continue;
    sections.push(html);
    alt = !alt;
  }
  return { html: sections.join("\n\n      "), nextAlt: alt };
}

function tripTitleMap(trips) {
  return new Map(trips.map((trip) => [trip.slug, trip.title]));
}

function layoutPreviewTestimonials(trips) {
  const first = trips[0];
  const second = trips[1] || trips[0];
  if (!first) return [];
  return [
    {
      id: "layout-preview-1",
      quote: "Layout preview — an approved traveler quote will appear here.",
      displayName: "Approved display name",
      experienceSlug: first.slug,
      published: true,
      layoutPreview: true,
    },
    {
      id: "layout-preview-2",
      quote: "Layout preview — a second approved quote will appear in this card style.",
      displayName: "Approved display name",
      experienceSlug: second.slug,
      published: true,
      layoutPreview: true,
    },
  ];
}

function resolveTestimonials(trips, { experienceSlug } = {}) {
  const slugs = new Set(trips.map((trip) => trip.slug));
  const loaded = loadTestimonials();
  const selected = experienceSlug
    ? testimonialsForExperience(loaded, experienceSlug, slugs)
    : featuredTestimonials(loaded, slugs);

  if (selected.length) return selected;
  if (layoutPreviewEnabled()) {
    const preview = layoutPreviewTestimonials(trips);
    return experienceSlug ? preview.filter((item) => item.experienceSlug === experienceSlug) : preview;
  }
  return [];
}

function renderTestimonialQuote(item) {
  const body = escapeHtml(item.quote);
  if (!item.excerpt) return `<p>${body}</p>`;

  return `<p>
                    <span class="past-visually-hidden">Excerpt from a longer review: </span>
                    <span class="past-testimonial-ellipsis" aria-hidden="true">&hellip;</span>${body}<span class="past-testimonial-ellipsis" aria-hidden="true">&hellip;</span>
                  </p>
                  <p class="past-testimonial-excerpt-label" aria-hidden="true">Excerpt</p>`;
}

function renderTestimonialCard(item, titles) {
  const experienceTitle = titles.get(item.experienceSlug) || item.experienceSlug;
  const experienceHref = `${BASE_PATH}${item.experienceSlug}/`;
  const previewBadge = item.layoutPreview
    ? '<p class="past-testimonial-preview-badge">Layout preview · not a published quote</p>'
    : "";
  const excerptAttr = item.excerpt ? ' data-excerpt="true"' : "";

  return `<li>
              <figure class="past-testimonial-card"${item.layoutPreview ? ' data-layout-preview="true"' : ""}${excerptAttr}>
                ${previewBadge}
                <blockquote>
                  ${renderTestimonialQuote(item)}
                </blockquote>
                <figcaption>
                  <cite>${escapeHtml(item.displayName)}</cite>
                  <a href="${escapeHtml(experienceHref)}">${escapeHtml(experienceTitle)}</a>
                </figcaption>
              </figure>
            </li>`;
}

function renderTestimonialsSection(items, trips, { alt = true } = {}) {
  if (!items.length) return "";

  const titles = tripTitleMap(trips);
  const cards = items.map((item) => renderTestimonialCard(item, titles)).join("\n            ");
  const previewNote = items.some((item) => item.layoutPreview)
    ? `<p class="past-testimonials-preview-note" role="note">
              Showing card layout only. No traveler testimonials are published until approved quotes and names are supplied.
            </p>`
    : "";

  return `<section class="${sectionClass(alt)}" aria-labelledby="past-testimonials-heading">
        <div class="interior-section-inner">
          <div class="section-heading">
            <p class="eyebrow">Traveler Voices</p>
            <h2 id="past-testimonials-heading">Don&rsquo;t Just Take Our Word for It</h2>
            <p>Reflections from guests who have traveled with Elite.</p>
          </div>
          ${previewNote}
          <ul class="past-testimonials-grid" role="list">
            ${cards}
          </ul>
        </div>
      </section>`;
}

function renderListPage(trips) {
  const template = fs.readFileSync(LIST_TEMPLATE_FILE, "utf8");
  const hasSample = trips.some((trip) => trip.sample);
  const withCover = trips.find((trip) => trip.cover);
  const shareImage = withCover ? withCover.cover.src : DEFAULT_SHARE_IMAGE;
  const testimonials = resolveTestimonials(trips);

  return fillTemplate(template, {
    ROBOTS_META: robotsMeta(hasSample),
    SHARE_IMAGE: escapeHtml(absoluteUrl(shareImage)),
    SAMPLE_NOTICE: hasSample ? renderSampleNotice() : "",
    TRIP_LIST: renderTripList(trips),
    TESTIMONIALS_SECTION: renderTestimonialsSection(testimonials, trips, { alt: true }),
  });
}

function renderTripPage(trip, allPastTrips = null, { galleryLayout = GALLERY_LAYOUT_EDITORIAL } = {}) {
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
  const past = allPastTrips || [trip];
  const testimonials = resolveTestimonials(past, { experienceSlug: trip.slug });
  const galleryHasPhotos = trip.gallery.length > 0;
  const resolvedLayout =
    galleryLayout === GALLERY_LAYOUT_EDITORIAL || galleryLayout === GALLERY_LAYOUT_CLASSIC
      ? galleryLayout
      : resolveGalleryLayout(galleryLayout);

  const { html: tripSections, nextAlt } = renderTripSections(trip, galleryHasPhotos ? testimonials : [], {
    galleryLayout: resolvedLayout,
  });
  // When a gallery exists, quotes are interleaved there. Otherwise keep a standalone section.
  const standaloneTestimonials =
    !galleryHasPhotos && testimonials.length
      ? renderTestimonialsSection(testimonials, past, { alt: nextAlt })
      : "";

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
    TRIP_SECTIONS: tripSections,
    TESTIMONIALS_SECTION: standaloneTestimonials,
  });
}

function handlePastExperiences(req, res, pathname, searchParams) {
  try {
    if (!allowReadOnly(req, res)) return;

    if (pathname === "/past-experiences") {
      redirect(res, BASE_PATH);
      return;
    }

    const past = pastTrips(loadTrips(), currentClock());
    const galleryLayout = resolveGalleryLayout(searchParams);

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

    sendHtml(req, res, 200, renderTripPage(trip, past, { galleryLayout }));
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

module.exports = {
  handlePastExperiences,
  handleSitemap,
  renderListPage,
  renderTripPage,
  renderTestimonialsSection,
  interleaveGalleryWithTestimonials,
  resolveGalleryLayout,
  GALLERY_LAYOUT_CLASSIC,
  GALLERY_LAYOUT_EDITORIAL,
};
