const { test, expect } = require("@playwright/test");
const { createServer, signIn } = require("./helpers");

// One browser profile for the whole file, like one person using the app over a day:
// sign-in, theme and data must carry over between steps.
let server, context, page;
test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }, info) => {
  server = createServer(info.project.name === "mobile" ? 3302 : 3301);
  await server.start();
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = info.project.use;
  context = await browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
  page = await context.newPage();
});
test.afterAll(async () => { await context.close(); await server.stop(); });

const noPageErrors = () => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  return errors;
};

test("fresh install opens Bibhu's set-up, and the PIN rules are explained", async () => {
  const errors = noPageErrors();
  await page.goto(server.url);
  await expect(page.locator("#auth-modal")).toHaveClass(/open/);
  await expect(page.locator("#auth-title")).toHaveText("Set up Bibhu's profile");
  await page.fill("#auth-pin", "abc");
  await page.fill("#auth-pin2", "abc");
  await page.click("#auth-submit");
  await expect(page.locator("#auth-error")).toHaveText("Use at least 6 characters.");
  await page.fill("#auth-pin", "bibhu-pin-2026");
  await page.fill("#auth-pin2", "something-else");
  await page.click("#auth-submit");
  await expect(page.locator("#auth-error")).toHaveText("The two PINs do not match.");
  await page.fill("#auth-pin2", "bibhu-pin-2026");
  await page.click("#auth-submit");
  await expect(page.locator("#current-user-name")).toHaveText("Bibhu");
  expect(errors).toEqual([]);
});

test("check in, break, check out — and the team board shows it", async () => {
  await page.goto(server.url);
  await expect(page.locator("#current-user-name")).toHaveText("Bibhu"); // remembered sign-in
  await page.click("#btn-check-in");
  await expect(page.locator("#punch-status-text")).toHaveText("Working — in the office");
  await page.click("#btn-break-toggle");
  await expect(page.locator("#punch-status-text")).toHaveText("On a break");
  await page.click("#btn-break-toggle");
  await page.click("#tab-btn-team-directory");
  const row = page.locator("#team-directory-tbody tr", { hasText: "Bibhu" });
  await expect(row).toContainText("In office");
  await page.click("#tab-btn-my-desk");
  await page.click("#btn-check-out");
  await expect(page.locator("#punch-status-text")).toHaveText("Checked out for the day");
  await expect(page.locator("#today-exit-time")).not.toHaveText("--:--");
});

test("request leave: over-quota is refused in place, a valid request is booked", async () => {
  await page.goto(server.url);
  await page.click("#tab-btn-leave-tracker");
  await page.click('.btn-apply-specific[data-type="Emergency"]');
  const monday = await page.evaluate(() => {
    const d = new Date(Date.now() + 21 * 864e5);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const plus = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
  await page.fill("#leave-start-date", monday);
  await page.fill("#leave-end-date", plus(monday, 11));
  await page.locator("#leave-end-date").dispatchEvent("change");
  await page.fill("#leave-reason", "Family function in Cuttack");
  await page.click("#modal-submit-btn");
  await expect(page.locator("#leave-form-error")).toContainText("but you have 7 of 7 left");
  await page.fill("#leave-end-date", plus(monday, 1));
  await page.locator("#leave-end-date").dispatchEvent("change");
  await expect(page.locator("#modal-calculated-days")).toHaveText("2 days");
  await page.click("#modal-submit-btn");
  await expect(page.locator("#leave-modal")).not.toHaveClass(/open/);
  await expect(page.locator("#card-emergency-used")).toHaveText("2");
  await expect(page.locator("#all-leaves-tbody")).toContainText("Family function in Cuttack");
});

test("privacy: a colleague sees the leave but not the reason", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(server.url);
  await page.locator("#auth-modal").evaluate(m => m.classList.remove("open")); // dismiss nothing-to-claim prompt if any
  await signIn(page, "EMP-103", "rohan-pin-2026");
  await page.click("#tab-btn-leave-tracker");
  const row = page.locator("#all-leaves-tbody tr", { hasText: "Bibhu" }).first();
  await expect(row).toContainText("Emergency");
  await expect(row).toContainText("Private");
  await expect(page.locator("body")).not.toContainText("Family function in Cuttack");
  await ctx.close();
});

test("everything is remembered after the server restarts", async () => {
  await server.restart();
  await page.goto(server.url);
  await expect(page.locator("#current-user-name")).toHaveText("Bibhu");
  await expect(page.locator("#punch-status-text")).toHaveText("Checked out for the day");
  await expect(page.locator("#card-emergency-used")).toHaveText("2");
  await page.click("#tab-btn-leave-tracker");
  await expect(page.locator("#all-leaves-tbody")).toContainText("Family function in Cuttack");
  await page.click("#theme-toggle-btn");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("server outage: banner appears, then the app recovers by itself", async () => {
  await page.goto(server.url);
  await server.stop();
  await page.evaluate(() => window.pulseApp.refresh());
  await expect(page.locator("#mode-banner")).toContainText("Can't reach the server");
  await server.start();
  await page.evaluate(() => window.pulseApp.refresh());
  await expect(page.locator("#mode-banner")).toBeHidden();
  await page.click("#btn-check-in");
  await expect(page.locator("#punch-status-text")).toHaveText("Working — in the office");
});

test("a punch survives a blip: the request is retried and applied once", async () => {
  await page.goto(server.url);
  let failed = 0;
  await page.route("**/api/action", route => (failed++ === 0 ? route.abort("connectionreset") : route.continue()));
  await page.click("#btn-break-toggle");
  await expect(page.locator("#punch-status-text")).toHaveText("On a break");
  expect(failed).toBe(2); // one dropped, one retried
  await page.unroute("**/api/action");
  await page.click("#btn-break-toggle");
  await expect(page.locator("#punch-status-text")).toHaveText("Working — in the office");
});

test("worst-case data: long names, emails and roles do not break the layout", async () => {
  await page.goto(server.url);
  const token = await page.evaluate(() => localStorage.getItem("pulse_token"));
  const add = data => page.request.post(server.url + "/api/action", {
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    data: Object.assign({ type: "addEmployee", department: "Sales & Ops" }, data)
  });
  expect((await add({ name: "Aleksandra Wiśniewska-Kowalczyk Venkataraghavan", role: "Senior Regional Partnerships & Channel Enablement Manager", email: "aleksandra.wisniewska-kowalczyk@northwind-industries-holdings.example.com" })).ok()).toBeTruthy();
  expect((await add({ name: "Jo", role: "Intern", email: "jo@pulseoffice.example" })).ok()).toBeTruthy();
  expect((await add({ name: "<img src=x onerror=alert(1)> Eve", role: "<b>Tester</b>", email: "eve@pulseoffice.example" })).ok()).toBeTruthy();
  await page.reload();
  await page.click("#tab-btn-team-directory");
  const tbody = page.locator("#team-directory-tbody");
  await expect(tbody).toContainText("Aleksandra Wiśniewska-Kowalczyk");
  await expect(tbody).toContainText("<img src=x onerror=alert(1)> Eve"); // shown as text, never run
  expect(await page.locator('#team-directory-tbody img[src="x"]').count()).toBe(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const avatars = await page.locator("#team-directory-tbody .emp-avatar").evaluateAll(els => els.map(e => [e.clientWidth, e.clientHeight]));
  for (const [w, h] of avatars) expect(Math.abs(w - h)).toBeLessThanOrEqual(1); // never squished
});

test("every screen fits the viewport and has no console errors", async () => {
  const errors = noPageErrors();
  await page.goto(server.url);
  for (const tab of ["my-desk", "team-directory", "leave-tracker", "holiday-calendar"]) {
    await page.click(`#tab-btn-${tab}`);
    await expect(page.locator(`#tab-${tab}`)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, tab).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `e2e/screens/${test.info().project.name}-${tab}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("keyboard: tabs move with arrows and dialogs close on Escape", async () => {
  await page.goto(server.url);
  await page.focus("#tab-btn-my-desk");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#tab-btn-team-directory")).toHaveAttribute("aria-selected", "true");
  await page.click("#tab-btn-my-desk");
  await page.click("#btn-quick-apply-leave");
  await expect(page.locator("#leave-modal")).toHaveClass(/open/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#leave-modal")).not.toHaveClass(/open/);
});
