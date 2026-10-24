// End-to-end tests in a real browser. Each spec file starts its own server
// on a private port and data folder (see e2e/helpers.js).
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "e2e",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ]
});
