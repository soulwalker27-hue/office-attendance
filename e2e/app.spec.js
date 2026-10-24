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
  await expect(page.locator("#auth-title")).toHaveText("Set up Bibhu P. Dash's profile");
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
  await expect(page.locator("#current-user-name")).toHaveText("Bibhu P. Dash");
  expect(errors).toEqual([]);
});

test("check in, break, check out — and the team board shows it", async () => {
  await page.goto(server.url);
  await expect(page.locator("#current-user-name")).toHaveText("Bibhu P. Dash"); // remembered sign-in
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
  await signIn(page, "EMP-103", "abhijit-pin-2026");
  await expect(page.locator("#tab-btn-admin")).toBeHidden(); // staff never see the admin area
  await page.click("#tab-btn-leave-tracker");
  const row = page.locator("#all-leaves-tbody tr", { hasText: "Bibhu" }).first();
  await expect(row).toContainText("Emergency");
  await expect(row).toContainText("Private");
  await expect(page.locator("body")).not.toContainText("Family function in Cuttack");
  await ctx.close();
});

test("admin: add a joiner, record a leaver, add a holiday — and the register follows", async () => {
  await page.goto(server.url);
  await expect(page.locator("#tab-btn-admin")).toBeVisible();
  await page.click("#tab-btn-admin");

  // new joiner
  await page.click("#btn-add-employee");
  await page.fill("#emp-name", "Sunita Rout");
  await page.fill("#emp-role", "Field Assistant");
  await page.fill("#emp-join", "2026-11-09");
  await page.click('#employee-form button[type="submit"]');
  await expect(page.locator("#employee-modal")).not.toHaveClass(/open/);
  const sunita = page.locator("#admin-people-tbody tr", { hasText: "Sunita Rout" });
  await expect(sunita).toContainText("Field Assistant");
  await expect(sunita).toContainText("2026-11-09");
  await page.click("#btn-add-employee");
  await page.fill("#emp-name", "Sunita Rout");
  await page.fill("#emp-role", "Duplicate");
  await page.click('#employee-form button[type="submit"]');
  await expect(page.locator("#employee-form-error")).toContainText("already exists");
  await page.click("#employee-cancel-btn");

  // she appears in the register from her joining date, not before
  await page.click("#tab-btn-register");
  await page.selectOption("#register-month", "2026-11");
  const row = page.locator(".register-table tbody tr", { hasText: "Sunita Rout" });
  await expect(row).toBeVisible();
  const cells = await row.locator("td.rg-cell").allTextContents();
  expect(cells.slice(0, 8).every(c => c === "")).toBe(true); // before 9 Nov
  await expect(page.locator(".register-table thead")).toContainText("30");

  // holiday
  await page.click("#tab-btn-admin");
  await page.fill("#holiday-date", "2026-12-14");
  await page.fill("#holiday-name", "Founders Day");
  await page.click('#holiday-form button[type="submit"]');
  await expect(page.locator("#admin-holidays-tbody")).toContainText("Founders Day");
  await page.fill("#holiday-date", "2026-12-14");
  await page.fill("#holiday-name", "Again");
  await page.click('#holiday-form button[type="submit"]');
  await expect(page.locator("#holiday-form-error")).toContainText("already a holiday");
  await page.click("#tab-btn-holiday-calendar");
  await expect(page.locator("#public-holidays-list")).toContainText("Founders Day");
  await expect(page.locator("#public-holidays-list")).toContainText("Kartika Purnima");
  await expect(page.locator("#public-holidays-list")).toContainText("Maha Shivaratri");
  await page.click("#tab-btn-register");
  await page.selectOption("#register-month", "2026-12");
  const dec14 = page.locator('.register-table tbody tr', { hasText: "Bibhu P. Dash" }).locator("td.rg-cell").nth(13);
  await expect(dec14).toHaveText("H");

  // leaver: gone from the board and the sign-in list, still in the register
  await page.click("#tab-btn-admin");
  await page.locator("#admin-people-tbody tr", { hasText: "Sunita Rout" }).getByRole("button", { name: "Mark as left" }).click();
  await page.fill("#leaver-date", "2026-11-20");
  await page.click('#leaver-form button[type="submit"]');
  await expect(page.locator("#admin-people-tbody tr", { hasText: "Sunita Rout" })).toContainText("Joins 2026-11-09");
  await page.click("#tab-btn-team-directory");
  await expect(page.locator("#team-directory-tbody")).not.toContainText("Sunita Rout"); // has not started yet
  await expect(page.locator("#employee-switcher-select option", { hasText: "Sunita Rout" })).toHaveCount(0);
});

test("admin: someone who left in the past leaves the board and the sign-in list but stays in the register", async () => {
  await page.goto(server.url);
  const token = await page.evaluate(() => localStorage.getItem("pulse_token"));
  const post = data => page.request.post(server.url + "/api/action", { headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, data });
  await post({ type: "addEmployee", name: "Past Employee", role: "Driver", joinDate: "2026-04-01" });
  const id = (await (await page.request.get(server.url + "/api/state")).json()).state.employees.find(e => e.name === "Past Employee").id;
  const yesterday = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  expect((await post({ type: "removeEmployee", targetId: id, lastDay: yesterday })).ok()).toBeTruthy();
  await page.reload();
  await page.click("#tab-btn-team-directory");
  await expect(page.locator("#team-directory-tbody")).not.toContainText("Past Employee");
  await expect(page.locator("#employee-switcher-select option", { hasText: "Past Employee" })).toHaveCount(0);
  await page.click("#tab-btn-admin");
  const row = page.locator("#admin-people-tbody tr", { hasText: "Past Employee" });
  await expect(row).toContainText("Left");
  await row.getByRole("button", { name: "Reinstate" }).click();
  await expect(row).toContainText("Active");
});

test("register: months Nov to Mar only, CSV export, holidays marked", async () => {
  await page.goto(server.url);
  await page.click("#tab-btn-register");
  const months = await page.locator("#register-month option").allTextContents();
  expect(months).toEqual(["November 2026", "December 2026", "January 2027", "February 2027", "March 2027"]);
  await page.selectOption("#register-month", "2027-03");
  await expect(page.locator(".register-table tbody tr").first().locator("td.rg-cell").nth(5)).toHaveText("H"); // 6 Mar Maha Shivaratri
  await expect(page.locator(".register-table tbody tr").first().locator("td.rg-cell").nth(21)).toHaveText("H"); // 22 Mar Holi
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#btn-export-register")]);
  expect(download.suggestedFilename()).toBe("BKR_Attendance_Register_2027-03.csv");
});

test("everything is remembered after the server restarts", async () => {
  await server.restart();
  await page.goto(server.url);
  await expect(page.locator("#current-user-name")).toHaveText("Bibhu P. Dash");
  await expect(page.locator("#punch-status-text")).toHaveText("Checked out for the day");
  await expect(page.locator("#card-emergency-used")).toHaveText("2");
  await page.click("#tab-btn-leave-tracker");
  await expect(page.locator("#all-leaves-tbody")).toContainText("Family function in Cuttack");
  await page.click("#tab-btn-admin");
  await expect(page.locator("#admin-holidays-tbody")).toContainText("Founders Day");
  await expect(page.locator("#admin-people-tbody")).toContainText("Sunita Rout");
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
    data: Object.assign({ type: "addEmployee", joinDate: "2026-04-01" }, data)
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
  for (const tab of ["my-desk", "team-directory", "register", "leave-tracker", "holiday-calendar", "admin"]) {
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
