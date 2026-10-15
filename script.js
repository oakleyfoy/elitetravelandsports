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
