const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests",
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:8765",
    trace: "off",
  },
  webServer: {
    command: "npx serve -l 8765 .",
    url: "http://127.0.0.1:8765",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
