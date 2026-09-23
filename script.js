const featuredDepartures = [
  {
    kicker: "Greece",
    title: "A Crete departure",
    name: "Greece Creta & Tennis Experience",
    summary:
      "Crete tennis academy play, Heraklion culture, a boat excursion, padel discovery, and Cretan dining—October 7-14, 2026 at $5,800 USD per person.",
    href: "/destinations/international/#international-trip-greece",
    month: "October 2026",
    dates: "Oct 7–14",
    image: "/assets/editorial/departure-crete.jpg",
  },
  {
    kicker: "Spain",
    title: "A Marbella departure",
    name: "Marbella Spain & Tennis Experience",
    summary:
      "Marbella tennis, tapas, Malaga discovery, padel, coastal touring, and a farewell flamenco evening—January 27 – February 3, 2027 at $5,800 USD per person.",
    href: "/destinations/international/#international-trip-spain",
    month: "January 2027",
    dates: "Jan 27–Feb 3",
    image: "https://images.unsplash.com/photo-1583422409516-2895a77efded?auto=format&fit=crop&w=1600&q=84",
  },
  {
    kicker: "Morocco Experiences",
    title: "A Marrakech departure",
    name: "Marrakech Discovery & Tennis Experience",
    summary:
      "Scheduled Morocco week with the Marrakech-centered itinerary—daily tennis, guided cultural visits, refined dining, and transfers—on March 6–13, 2027 at $5,800 USD per person.",
    href: "/destinations/international/#international-trip-morocco",
    month: "March 2027",
    dates: "Mar 6–13",
    image: "/assets/destinations/hero-panel.jpg",
  },
  {
    kicker: "Japan",
    title: "A Tokyo departure",
    name: "Tokyo Tennis Experience",
    summary:
      "Hotel New Otani Tokyo, morning tennis, TeamLab Planets, Asakusa, Shibuya, Mt. Fuji and Hakone, Yokohama, and a hot-spring day—April 14-21, 2027 at $6,800 USD per person.",
    href: "/destinations/international/#international-trip-tokyo",
    month: "April 2027",
    dates: "Apr 14–21",
    image: "/assets/editorial/departure-tokyo-shibuya.jpg",
  },
  {
    kicker: "Portugal",
    title: "An Algarve departure",
    name: "Algarve Portugal & Tennis Experience",
    summary:
      "Algarve tennis, Faro Old Town, a catamaran coastline, Benagil Cave, padel, wine tasting, and Albufeira—May 12–19, 2027 at $5,800 USD per person.",
    href: "/destinations/international/#international-trip-portugal",
    month: "May 2027",
    dates: "May 12–19",
    image: "/assets/destinations/portfolio-portugal.jpg",
  },
  {
    kicker: "Croatia",
    title: "An Adriatic departure",
    name: "Dubrovnik & Split Croatia & Tennis Experience",
    summary:
      "Dubrovnik, Split, tennis sessions, coastal dining, guided old-town discovery, and an island excursion—June 2–9, 2027 at $6,800 USD per person.",
    href: "/destinations/international/#international-trip-croatia",
    month: "June 2027",
    dates: "Jun 2–9",
    image: "/assets/destinations/portfolio-uk.jpg",
  },
];

function initFeaturedDeparture() {
  const panel = document.querySelector("[data-featured-departure]");
  if (!panel) return;

  const now = new Date();
  const dayNumber = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
  const departure = featuredDepartures[dayNumber % featuredDepartures.length];
  const setText = (selector, value) => {
    const node = panel.querySelector(selector);
    if (node) node.textContent = value;
  };

  setText("[data-feature-kicker]", departure.kicker);
  setText("[data-feature-title]", departure.title);
  setText("[data-feature-name]", departure.name);
  setText("[data-feature-summary]", departure.summary);
  setText("[data-feature-month]", departure.month);
  setText("[data-feature-dates]", departure.dates);

  const link = panel.querySelector("[data-feature-link]");
  if (link) link.href = departure.href;

  panel.style.setProperty("--feature-image", `url("${departure.image}")`);
}

initFeaturedDeparture();

const header = document.querySelector("[data-header]");
const nav = document.querySelector("[data-nav]");
const navToggle = document.querySelector("[data-nav-toggle]");
const year = document.querySelector("[data-year]");

if (year) {
  year.textContent = new Date().getFullYear();
}

const reduceMotionMq = window.matchMedia("(prefers-reduced-motion: reduce)");

function initRevealMotion() {
  if (reduceMotionMq.matches || !("IntersectionObserver" in window)) {
    document.documentElement.classList.remove("motion-enhanced");
    return;
  }

  document.documentElement.classList.add("motion-enhanced");

  /** @type {HTMLElement[]} */
  const targets = [...document.querySelectorAll("main > section:nth-of-type(n+2)")];

  targets.forEach((el, idx) => {
    el.style.setProperty("--reveal-delay", `${Math.min(idx * 48, 400)}ms`);
    el.classList.add("motion-reveal-pending");
  });

  const io = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("motion-reveal-in");
        obs.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
  );

  targets.forEach((el) => io.observe(el));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initRevealMotion);
} else {
  initRevealMotion();
}

const setHeaderState = () => {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 12);
};

setHeaderState();
window.addEventListener("scroll", setHeaderState, { passive: true });

if (nav && navToggle) {
  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    document.body.classList.toggle("nav-open", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
    navToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  });

  nav.addEventListener("click", (event) => {
    if (!(event.target instanceof HTMLAnchorElement)) return;

    nav.classList.remove("is-open");
    document.body.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Open navigation");
  });
}
