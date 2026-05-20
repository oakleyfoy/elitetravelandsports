const { test, expect } = require("@playwright/test");

const viewports = [
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "mobile-390", width: 390, height: 844 },
];

async function attachConsoleGuards(page, report) {
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      report.push(`[console.error] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    report.push(`[pageerror] ${err.message}`);
  });
}

async function openMobileNavIfNeeded(page) {
  const toggle = page.locator("[data-nav-toggle]");
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(page.locator("[data-nav]").first()).toHaveClass(/is-open/);
  }
}

async function closeMobileNavIfNeeded(page) {
  const toggle = page.locator("[data-nav-toggle]");
  if (await toggle.isVisible()) {
    const nav = page.locator("[data-nav]").first();
    if (await nav.evaluate((el) => el.classList.contains("is-open"))) {
      await toggle.click();
    }
  }
}

async function openDestinationsMenu(page) {
  await openMobileNavIfNeeded(page);
  const mobileToggle = page.locator("[data-nav-toggle]");
  if (!(await mobileToggle.isVisible())) {
    await page.locator("header .primary-nav .nav-dropdown-toggle").hover();
  }
}

test.describe("viewport + nav + form QA", () => {
  for (const vp of viewports) {
    test(`no console errors — ${vp.name} (${vp.width}px)`, async ({ page }) => {
      const errors = [];
      await attachConsoleGuards(page, errors);

      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.locator("main")).toBeVisible();

      // ----- Home: hero CTAs -----
      await page.locator('.hero-actions .button.button-primary[href="/plan-a-journey/"]').click();
      await expect(page).toHaveURL(/\/plan-a-journey\/?$/);
      await page.goBack({ waitUntil: "domcontentloaded" });

      await page.locator('.hero-actions .button.button-secondary[href="/destinations/"]').click();
      await expect(page).toHaveURL(/\/destinations\/?$/);
      await page.goBack({ waitUntil: "domcontentloaded" });

      // ----- Header nav: every link -----
      const navHrefs = [
        "/about/",
        "/team/",
        "/experiences/",
        "/process/",
        "/concierge/",
        "/plan-a-journey/",
      ];

      for (const href of navHrefs) {
        await openMobileNavIfNeeded(page);
        await page.locator(`header .primary-nav a[href="${href}"]`).click();
        await page.waitForLoadState("domcontentloaded");
        await expect(page).toHaveURL(new RegExp(`${href.replace(/\//g, "\\/")}\\/?$`));
        await closeMobileNavIfNeeded(page);
      }

      const destinationNavHrefs = ["/destinations/morocco/", "/destinations/international/"];
      for (const href of destinationNavHrefs) {
        await openDestinationsMenu(page);
        await page.locator(`header .primary-nav .nav-dropdown-menu a[href="${href}"]`).click();
        await page.waitForLoadState("domcontentloaded");
        await expect(page).toHaveURL(new RegExp(`${href.replace(/\//g, "\\/")}\\/?$`));
        await closeMobileNavIfNeeded(page);
      }

      // ----- Footer navigation + contact CTA -----
      await page.goto("/about/", { waitUntil: "domcontentloaded" });
      const footerNavHrefs = [
        "/about/",
        "/team/",
        "/experiences/",
        "/destinations/morocco/",
        "/destinations/international/",
        "/process/",
        "/concierge/",
      ];
      for (const href of footerNavHrefs) {
        await page.locator(`footer.site-footer nav a[href="${href}"]`).first().click();
        await page.waitForLoadState("domcontentloaded");
        await expect(page).toHaveURL(new RegExp(`${href.replace(/\//g, "\\/")}\\/?$`));
      }
      await page.locator('footer.site-footer .footer-contact a[href="/plan-a-journey/"]').click();
      await expect(page).toHaveURL(/\/plan-a-journey\/?$/);

      // ----- Plan a Journey: mock inquiry endpoint, submit AJAX (no full navigation) -----
      await page.goto("/plan-a-journey/", { waitUntil: "domcontentloaded" });

      await page.route("**/api/submit-inquiry", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      });

      await page.locator('.inquiry-form input[name="name"]').fill("QA Test Guest");
      await page.locator('.inquiry-form input[name="email"]').fill("qa+viewport@example.test");
      await page.locator('.inquiry-form input[name="phone"]').fill("+1 5550100199");
      await page.locator('.inquiry-form select[name="preferred_sport"]').selectOption({ index: 0 });
      await page.locator('.inquiry-form select[name="travel_type"]').selectOption({ index: 1 });
      await page.locator('.inquiry-form input[name="destination_interest"]').fill("Spain");
      await page.locator('.inquiry-form input[name="estimated_group_size"]').fill("4");
      await page.locator('.inquiry-form input[name="preferred_travel_window"]').fill("June");
      await page.locator('.inquiry-form input[name="desired_hotel_travel_style"]').fill("Boutique hotel");
      await page.locator('.inquiry-form textarea[name="notes"]').fill("Playwright viewport QA submit — no backend.");

      await page.locator('.inquiry-form button[type="submit"]').click();
      await expect(page.locator(".inquiry-form-feedback--success")).toBeVisible({
        timeout: 15000,
      });
      await expect(page).toHaveURL(/\/plan-a-journey\/?/);

      expect(errors, `Console/page errors at ${vp.name}:\n${errors.join("\n")}`).toEqual([]);
    });
  }

  test("interior CTA strip: Plan + Explore (tablet sample)", async ({ page }) => {
    const errors = [];
    await attachConsoleGuards(page, errors);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/about/", { waitUntil: "domcontentloaded" });
    await page.locator(".interior-actions .button.button-primary").click();
    await expect(page).toHaveURL(/\/plan-a-journey\/?/);
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.locator(".interior-actions .button.button-secondary").click();
    await expect(page).toHaveURL(/\/experiences\/?/);
    expect(errors).toEqual([]);
  });
});
