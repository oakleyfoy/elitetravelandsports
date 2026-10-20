const fs = require("node:fs");
const path = require("node:path");
const { escapeHtml, fillTemplate, indent, sendHtml, sendServerError, redirect, allowReadOnly } = require("./html");
const {
  currentClock,
  featuredTrip,
  formatMonthYear,
  formatShortRange,
  isBookable,
  isInProgress,
  loadTrips,
  upcomingTrips,
} = require("./trips");

const ROOT_DIR = path.join(__dirname, "..");
const INTERNATIONAL_PATH = "/destinations/international/";
const COMING_SOON_PRICE = "More info coming soon";
const IN_PROGRESS = "Departure in progress";
const MOROCCO_FUTURE_OPTION = "Future Morocco departures";

const FALLBACK_HEADING = "New experiences are on the horizon.";
const FALLBACK_TEXT = "Explore our past journeys or contact us to plan your next adventure.";
const MOROCCO_FALLBACK_INVITE = "Contact our team to explore future opportunities.";
const MOROCCO_FALLBACK = `There are currently no scheduled Morocco departures. ${MOROCCO_FALLBACK_INVITE}`;

const PAGES = {
  "/": { template: "index.html", render: renderHomeValues },
  "/index.html": { template: "index.html", render: renderHomeValues },
  [INTERNATIONAL_PATH]: { template: "destinations/international/index.html", render: renderInternationalValues },
  [`${INTERNATIONAL_PATH}index.html`]: {
    template: "destinations/international/index.html",
    render: renderInternationalValues,
  },
  "/destinations/morocco/": { template: "destinations/morocco/index.html", render: renderMoroccoValues },
  "/destinations/morocco/index.html": { template: "destinations/morocco/index.html", render: renderMoroccoValues },
};
const REDIRECTS = {
  "/destinations/international": INTERNATIONAL_PATH,
  "/destinations/morocco": "/destinations/morocco/",
};
const TEMPLATE_FILES = new Set(Object.values(PAGES).map((page) => page.template));

function tripLink(trip) {
  return `${INTERNATIONAL_PATH}#${trip.anchor}`;
}

function cssImage(src) {
  return escapeHtml(`url("${src}")`);
}

function listJoin(items) {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function unique(values) {
  return [...new Set(values)];
}

function bookableTrips(trips, clock) {
  return upcomingTrips(trips, clock).filter((trip) => isBookable(trip, clock));
}

function claimSpotHref(trip) {
  return `/claim-your-spot/?experience=${encodeURIComponent(trip.slug)}`;
}

function claimSpotButton(trip, clock, className) {
  if (!isBookable(trip, clock)) return "";
  return `<a class="${className}" href="${escapeHtml(claimSpotHref(trip))}">Claim Your Spot</a>`;
}

function printLink(trip, className) {
  if (!trip.printableItinerary) return "";
  return `<a
  class="${className}"
  href="${escapeHtml(trip.printableItinerary)}"
  target="_blank"
  rel="noopener noreferrer"
  type="application/pdf"
  >View Printable Itinerary &amp; Photos</a>`;
}

function itineraryDetails(trip, clock, { className, id, linkClass, claimClass }) {
  if (!trip.itinerary) return "";
  const idAttr = id ? ` id="${escapeHtml(id)}"` : "";
  const print = printLink(trip, linkClass);
  const claim = claimSpotButton(trip, clock, claimClass || "claim-spot-button claim-spot-button--itinerary");
  // Claim Your Spot sits immediately after the printable itinerary link when both exist.
  const body = [trip.itinerary, print, claim].filter(Boolean).join("\n");
  return `<details class="${className}"${idAttr}>
  <summary>View full itinerary</summary>
  <div class="morocco-itinerary">
    ${indent(body, 4)}
  </div>
</details>`;
}

function renderFeatured(trip) {
  if (!trip) {
    return `<article class="morocco-feature" data-featured-departure>
  <div class="morocco-feature-content">
    <span>Worldwide Experiences</span>
    <h3>${FALLBACK_HEADING}</h3>
    <small>${FALLBACK_TEXT}</small>
  </div>

  <div class="morocco-destination-capsules" aria-label="Explore Elite">
    <a href="/past-experiences/">
      <strong>Past Experiences</strong>
      <span>Explore past journeys</span>
    </a>
    <a href="/plan-a-journey/">
      <strong>Plan a Journey</strong>
      <span>Contact us</span>
    </a>
  </div>
</article>`;
  }

  const summary = trip.price ? `${trip.featured.summary}—${trip.dates} at ${trip.price}.` : `${trip.featured.summary}—${trip.dates}.`;
  return `<article class="morocco-feature" data-featured-departure="${escapeHtml(trip.slug)}" style="--feature-image: ${cssImage(trip.featured.image)}">
  <div class="morocco-feature-content">
    <span>${escapeHtml(trip.featured.kicker)}</span>
    <h3>${escapeHtml(trip.featured.title)}</h3>
    <p>${escapeHtml(trip.title)}</p>
    <small>${escapeHtml(summary)}</small>
    <ul>
      <li>Fixed departure date</li>
      <li>Limited availability</li>
      <li>Hosted on the ground</li>
    </ul>
  </div>

  <div class="morocco-destination-capsules" aria-label="Featured departure">
    <a href="${escapeHtml(tripLink(trip))}">
      <strong>${escapeHtml(formatMonthYear(trip.start))}</strong>
      <span>${escapeHtml(formatShortRange(trip.start, trip.end))}</span>
    </a>
  </div>
</article>`;
}

function renderDepartureItem(trip, clock) {
  const priced = Boolean(trip.price);
  const className = priced ? "departure-item" : "departure-seasonal";
  const style = priced && trip.homeImage ? ` style="background-image: ${cssImage(trip.homeImage)}"` : "";
  const detail = isInProgress(trip, clock) ? IN_PROGRESS : trip.price || COMING_SOON_PRICE;
  return `<a class="${className}" href="${escapeHtml(tripLink(trip))}" data-trip="${escapeHtml(trip.slug)}"${style}>
  <span>${escapeHtml(trip.country)}</span>
  <h3>${escapeHtml(trip.title)}</h3>
  <p>${escapeHtml(trip.dates)} · ${escapeHtml(detail)}</p>
</a>`;
}

function renderDepartureStrip(trips, clock) {
  if (!trips.length) {
    return `<a class="departure-seasonal" href="/past-experiences/">
  <span>Past Experiences</span>
  <h3>Explore our past journeys</h3>
</a>

<a class="departure-seasonal" href="/plan-a-journey/">
  <span>Plan a Journey</span>
  <h3>Contact us to plan your next adventure</h3>
</a>`;
  }
  return trips.map((trip) => renderDepartureItem(trip, clock)).join("\n\n");
}

function renderFooterDestinations(trips, clock) {
  const countries = unique(bookableTrips(trips, clock).map((trip) => trip.country));
  if (!countries.length) return "";
  return `<p class="footer-prelude-destinations">${escapeHtml(countries.join(" • "))}</p>`;
}

function renderHomeValues(trips, clock) {
  return {
    FEATURED_DEPARTURE: indent(renderFeatured(featuredTrip(trips, clock)), 12),
    DEPARTURE_STRIP: indent(renderDepartureStrip(upcomingTrips(trips, clock), clock), 16),
    FOOTER_DESTINATIONS: renderFooterDestinations(trips, clock),
  };
}

function renderTripCard(trip, clock) {
  const soon = !trip.price;
  const cardId = trip.anchorTarget === "card" ? ` id="${escapeHtml(trip.anchor)}"` : "";
  const details = itineraryDetails(trip, clock, {
    className: "morocco-program-details fixed-date-trip-details",
    id: trip.anchorTarget === "itinerary" ? trip.anchor : "",
    linkClass: "morocco-print-link fixed-date-trip-link",
  });
  let status = "";
  if (isInProgress(trip, clock)) status = `<span class="fixed-date-trip-status">${IN_PROGRESS}</span>`;
  else if (soon && !details) status = '<span class="fixed-date-trip-status">Details coming soon</span>';
  const claim = claimSpotButton(trip, clock, "claim-spot-button");

  return `<article class="fixed-date-trip-card${soon ? " fixed-date-trip-card--soon" : ""}"${cardId} data-trip="${escapeHtml(trip.slug)}">
  <div class="fixed-date-trip-card-top">
    <span class="fixed-date-trip-kicker">${escapeHtml(trip.country)}</span>
    ${claim}
  </div>
  <h3>${escapeHtml(trip.title)}</h3>
  <p class="fixed-date-trip-date">${escapeHtml(trip.dates)}</p>
  <p class="fixed-date-trip-price">${escapeHtml(trip.price || COMING_SOON_PRICE)}</p>
  <p>${escapeHtml(trip.summary)}</p>
  ${indent([status, details].filter(Boolean).join("\n"), 2)}
</article>`;
}

function renderInternationalValues(trips, clock) {
  const upcoming = upcomingTrips(trips, clock);
  const cards = upcoming.length
    ? upcoming.map((trip) => renderTripCard(trip, clock)).join("\n\n")
    : `<article class="fixed-date-trip-card fixed-date-trip-card--soon fixed-date-trip-card--empty">
  <span class="fixed-date-trip-kicker">Worldwide Experiences</span>
  <h3>${FALLBACK_HEADING}</h3>
  <p>${FALLBACK_TEXT}</p>
  <div class="interior-actions">
    <a class="button button-primary" href="/past-experiences/">Past Experiences</a>
    <a class="button button-secondary" href="/plan-a-journey/">Plan a Journey</a>
  </div>
</article>`;

  const countries = unique(bookableTrips(trips, clock).map((trip) => trip.country));
  const meta = countries.length
    ? `Fixed-date international tennis departures to ${listJoin(countries)} with hosted itineraries and program details.`
    : `International tennis journeys from Elite Travel & Sports Tours USA. ${FALLBACK_HEADING}`;
  const intro = countries.length
    ? `<p>
              These international programs are scheduled departures with set dates and limited availability. Review the
              listed departure, pricing, and itinerary details, then contact Elite to confirm remaining space.
            </p>`
    : "";

  return { TRIP_CARDS: indent(cards, 12), META_DESCRIPTION: escapeHtml(meta), TRIPS_INTRO: intro };
}

function renderMoroccoCard(trip, clock) {
  const details = itineraryDetails(trip, clock, {
    className: "morocco-program-details",
    id: trip.moroccoPageAnchor,
    linkClass: "morocco-print-link",
  });
  const status = isInProgress(trip, clock) ? `<span class="fixed-date-trip-status">${IN_PROGRESS}</span>` : "";
  const claim = claimSpotButton(trip, clock, "claim-spot-button");
  return `<article class="morocco-brochure-card" data-trip="${escapeHtml(trip.slug)}">
  <div class="fixed-date-trip-card-top">
    <span class="fixed-date-trip-kicker">${escapeHtml(trip.country)}</span>
    ${claim}
  </div>
  <h3>${escapeHtml(trip.title)}</h3>
  <p class="fixed-date-trip-date">${escapeHtml(trip.dates)}</p>
  <p class="morocco-program-price">${escapeHtml(trip.price || COMING_SOON_PRICE)}</p>
  <p>${escapeHtml(trip.summary)}</p>
  ${indent([status, details].filter(Boolean).join("\n"), 2)}
</article>`;
}

function renderMoroccoValues(trips, clock) {
  const listed = upcomingTrips(trips, clock).filter((trip) => trip.country === "Morocco");
  const bookable = listed.filter((trip) => isBookable(trip, clock));
  const only = bookable.length === 1 ? bookable[0] : null;

  const programs = listed.length
    ? `<div class="morocco-brochure-grid">
  ${indent(listed.map((trip) => renderMoroccoCard(trip, clock)).join("\n\n"), 2)}
</div>`
    : "";

  let hero = "Morocco tennis journeys with local hosts and a dedicated planning desk.";
  let meta = `${hero} ${MOROCCO_FALLBACK}`;
  let lede = MOROCCO_FALLBACK;
  let inquiryCopy = "";
  if (listed.length && !bookable.length) {
    const titles = unique(listed.map((trip) => trip.title));
    const verb = listed.length === 1 ? "departure is" : "departures are";
    lede = `The ${listJoin(titles)} ${verb} in progress. ${MOROCCO_FALLBACK_INVITE}`;
    meta = `${hero} ${lede}`;
  }
  if (only) {
    hero = `A ${only.title} departure with the published itinerary, local hosts, and a dedicated planning desk.`;
    lede = `Morocco is offered on a scheduled departure with a set date and limited availability—the ${only.title}. Review the departure, pricing, and day-by-day program, then contact Elite to confirm remaining space.`;
    inquiryCopy = `The ${only.dates} departure follows the ${only.title} itinerary. Select it below and the Elite planning desk will confirm remaining space and next steps.`;
  } else if (bookable.length) {
    hero = "Fixed-date Morocco departures with published itineraries, local hosts, and a dedicated planning desk.";
    lede =
      "Morocco is offered on scheduled departures with set dates and limited availability. Review each departure, pricing, and day-by-day program, then contact Elite to confirm remaining space.";
    inquiryCopy = "Select a departure below and the Elite planning desk will confirm remaining space and next steps.";
  }
  if (bookable.length) {
    const titles = unique(bookable.map((trip) => trip.title));
    meta = `Fixed-date ${listJoin(titles)} departures with published pricing, full itineraries, and limited availability.`;
  }

  const options = bookable.length
    ? bookable.map((trip) => `<option value="${escapeHtml(`${trip.title} — ${trip.dates}`)}">${escapeHtml(trip.dates)}</option>`)
    : [`<option value="${MOROCCO_FUTURE_OPTION}">${MOROCCO_FUTURE_OPTION}</option>`];

  return {
    META_DESCRIPTION: escapeHtml(meta),
    HERO_SUMMARY: escapeHtml(hero),
    MOROCCO_HEADING: bookable.length ? "Fixed-date Morocco tennis departures." : "Morocco tennis journeys.",
    MOROCCO_LEDE: escapeHtml(lede),
    MOROCCO_PROGRAMS: indent(programs, 10),
    MOROCCO_INQUIRY_HEADING: bookable.length
      ? "Ask about availability for a fixed-date departure."
      : "Ask about future Morocco departures.",
    MOROCCO_INQUIRY_COPY: inquiryCopy
      ? `<p>
                ${escapeHtml(inquiryCopy)}
              </p>`
      : "",
    MOROCCO_DEPARTURE_OPTIONS: indent(options.join("\n"), 18),
  };
}

function renderPage(pathname, { trips = loadTrips(), clock = currentClock() } = {}) {
  const page = PAGES[pathname];
  const template = fs.readFileSync(path.join(ROOT_DIR, page.template), "utf8");
  return fillTemplate(template, page.render(trips, clock));
}

function isUpcomingPage(pathname) {
  return pathname in PAGES || pathname in REDIRECTS;
}

function isTemplateFile(relativePath) {
  return TEMPLATE_FILES.has(relativePath.split(path.sep).join("/"));
}

function handleUpcomingPage(req, res, pathname) {
  try {
    if (!allowReadOnly(req, res)) return;
    if (pathname in REDIRECTS) {
      redirect(res, REDIRECTS[pathname]);
      return;
    }
    sendHtml(req, res, 200, renderPage(pathname));
  } catch (error) {
    sendServerError(req, res, "upcoming-trips", error);
  }
}

module.exports = { handleUpcomingPage, isTemplateFile, isUpcomingPage, renderPage };
