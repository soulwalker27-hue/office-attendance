"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-"));
process.env.DATA_FILE = path.join(dir, "store.json");
process.env.OFFICE_TZ = "Asia/Kolkata";
process.env.RATE_LIMIT_POST = "120"; // generous for the suite; the flood test still exceeds it
const { server } = require("../server.js");

let base, port;
test.before(() => new Promise(resolve => server.listen(0, "127.0.0.1", () => {
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
  resolve();
})));
test.after(() => new Promise(resolve => server.close(resolve)));

const api = (p, opts) => fetch(base + p, opts);
const json = (token, body, extra) => ({
  method: "POST",
  headers: Object.assign({ "Content-Type": "application/json" }, token ? { Authorization: "Bearer " + token } : {}, extra),
  body: JSON.stringify(body)
});
const login = (empId, pin) => api("/api/login", json(null, { empId, pin }));
const act = (token, body) => api("/api/action", json(token, body));
const state = async token => (await api("/api/state", token ? { headers: { Authorization: "Bearer " + token } } : undefined)).json();

async function signIn(empId, pin = "correct-horse") {
  const r = await login(empId, pin);
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  return j.token;
}

test("seeds a store on first run and serves the board without needing a login", async () => {
  const j = await state();
  assert.equal(j.tz, "Asia/Kolkata");
  assert.equal(j.state.employees.length, 7);
  assert.equal(j.state.employees[0].name, "Bibhu P. Dash");
  assert.equal(j.state.holidays.length, 6);
  assert.equal(j.me, null);
  assert.deepEqual(j.mine, {});
  assert.ok(Math.abs(j.now - Date.now()) < 5000);
  assert.ok(fs.existsSync(process.env.DATA_FILE));
});

test("data and credential files are owner-only", { skip: process.platform === "win32" }, async () => {
  await signIn("EMP-101");
  for (const f of [process.env.DATA_FILE, path.join(dir, "auth.json")]) assert.equal(fs.statSync(f).mode & 0o077, 0, f);
});

test("actions need a session; the session, not the request body, decides who acts", async () => {
  assert.equal((await act(null, { type: "checkin", empId: "EMP-101" })).status, 401);
  assert.equal((await act("x".repeat(43), { type: "checkin", empId: "EMP-101" })).status, 401);

  const token = await signIn("EMP-101");
  const r = await act(token, { type: "checkin", mode: "Office", empId: "EMP-102" }); // tries to punch for someone else
  assert.equal(r.status, 200);
  const board = await state();
  assert.ok(board.state.attendance.some(a => a.empId === "EMP-101" && a.checkOut == null));
  assert.ok(!board.state.attendance.some(a => a.empId === "EMP-102" && a.checkOut == null));
  assert.equal((await (await act(token, { type: "checkin" })).json()).code, "ALREADY_IN");
  assert.equal((await act(token, { type: "checkout" })).status, 200);
});

test("punches are shared: one person's check-in is visible to everyone", async () => {
  const token = await signIn("EMP-103");
  await act(token, { type: "checkin", mode: "Remote" });
  const anonymous = await state();
  assert.ok(anonymous.state.attendance.some(a => a.empId === "EMP-103" && a.mode === "Remote"));
});

test("first sign-in claims a profile; later sign-ins need that PIN; PINs are stored hashed", async () => {
  const first = await login("EMP-104", "my-secret-pin");
  assert.equal((await first.json()).created, true);
  assert.ok((await state()).claimed.includes("EMP-104"));
  const wrong = await login("EMP-104", "not-my-pin!");
  assert.equal(wrong.status, 401);
  assert.equal((await login("EMP-104", "my-secret-pin")).status, 200);
  const authFile = fs.readFileSync(path.join(dir, "auth.json"), "utf8");
  assert.ok(!authFile.includes("my-secret-pin"));
  assert.ok(!authFile.includes("Bearer"));
});

test("PIN rules and unknown accounts", async () => {
  assert.equal((await login("EMP-105", "12345")).status, 422);
  assert.equal((await login("EMP-105", "x".repeat(65))).status, 422);
  assert.equal((await login("EMP-999", "long-enough-pin")).status, 404);
  assert.equal((await api("/api/login", json(null, { empId: { $ne: 1 }, pin: ["a"] }))).status, 404);
  for (const bad of ["__proto__", "constructor"]) assert.equal((await login(bad, "long-enough-pin")).status, 404);
});

test("wrong PINs lock the account for 15 minutes, even for the right PIN", async () => {
  await signIn("EMP-106", "right-pin-106");
  for (let i = 0; i < 5; i++) assert.equal((await login("EMP-106", "wrong-pin-" + i)).status, 401);
  const locked = await login("EMP-106", "right-pin-106");
  assert.equal(locked.status, 429);
  assert.equal((await locked.json()).code, "LOCKED");
});

test("sessions end on logout and cannot be reused", async () => {
  const token = await signIn("EMP-107");
  assert.equal((await state(token)).me, "EMP-107");
  await api("/api/logout", json(token, {}));
  assert.equal((await state(token)).me, null);
  assert.equal((await act(token, { type: "checkin" })).status, 401);
});

test("leave reasons are private: never in the shared board, only for the signed-in author", async () => {
  const token = await signIn("EMP-102");
  const other = await signIn("EMP-103");
  let start = new Date(Date.now() + 40 * 86400000);
  while ([0, 6].includes(start.getUTCDay())) start = new Date(start.getTime() + 86400000);
  const day = start.toISOString().slice(0, 10);
  const r = await act(token, { type: "leave", leaveType: "Medical", start: day, end: day, reason: "SECRET-DIAGNOSIS", contact: "555-SECRET" });
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  assert.ok(!JSON.stringify(await state()).includes("SECRET-DIAGNOSIS"));
  assert.ok(!JSON.stringify(body.view.state).includes("SECRET"));
  assert.ok(JSON.stringify((await state(token)).mine).includes("SECRET-DIAGNOSIS"));
  assert.ok(!JSON.stringify((await state(other)).mine).includes("SECRET-DIAGNOSIS"));
  assert.ok(!JSON.stringify((await state(other)).state).includes("SECRET-DIAGNOSIS"));
});

test("hostile leave and punch payloads are rejected cleanly (no crashes, no prototype tricks)", async () => {
  const token = await signIn("EMP-101");
  for (const leaveType of ["constructor", "__proto__", "toString", "hasOwnProperty", 5, null, { a: 1 }]) {
    const r = await act(token, { type: "leave", leaveType, start: "2026-12-01", end: "2026-12-01", reason: "abc" });
    assert.equal(r.status, 422, String(leaveType));
  }
  for (const type of ["__proto__", "constructor", "", 7, null]) {
    assert.equal((await act(token, { type })).status, 422, String(type));
  }
  assert.equal((await act(token, { type: "leave", leaveType: "Holiday", start: { x: 1 }, end: [1], reason: {} })).status, 422);
  assert.ok((await state()).state.employees.length >= 7);
});

test("only admins can add people and holidays, and the change is shared with everyone", async () => {
  const joiner = { type: "addEmployee", name: "Test Person", role: "Field Assistant", joinDate: "2026-11-02" };
  assert.equal((await act(null, joiner)).status, 401);
  const staff = await signIn("EMP-102");
  assert.equal((await act(staff, joiner)).status, 422);
  assert.equal((await (await act(staff, joiner)).json()).code, "FORBIDDEN");
  assert.equal((await (await act(staff, { type: "addHoliday", date: "2026-12-01", name: "X" })).json()).code, "FORBIDDEN");

  const admin = await signIn("EMP-101");
  assert.equal((await act(admin, joiner)).status, 200);
  assert.equal((await act(admin, { type: "addHoliday", date: "2026-12-01", name: "Rath Yatra" })).status, 200);
  const board = await state();
  assert.ok(board.state.employees.some(e => e.name === "Test Person" && e.joinDate === "2026-11-02"));
  assert.ok(board.state.holidays.some(h => h.date === "2026-12-01" && h.name === "Rath Yatra"));
  assert.equal(board.state.holidays.length, 7);
  assert.equal((await act(admin, { type: "removeHoliday", date: "2026-12-01" })).status, 200);
  assert.equal((await state()).state.holidays.length, 6);
});

test("an employee marked as left is signed out and cannot sign back in", async () => {
  const leaver = await signIn("EMP-107");
  assert.equal((await state(leaver)).me, "EMP-107");
  const admin = await signIn("EMP-101");
  const today = (await state()).tz && new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const r = await act(admin, { type: "removeEmployee", targetId: "EMP-107", lastDay: yesterday });
  assert.equal(r.status, 200, today);
  assert.equal((await state(leaver)).me, null, "their session no longer works");
  assert.equal((await act(leaver, { type: "checkin" })).status, 401);
  const again = await login("EMP-107", "correct-horse");
  assert.equal(again.status, 200);
  assert.equal((await act((await again.json()).token, { type: "checkin" })).status, 401, "a signed-in token for a former employee is refused");
  assert.equal((await act(admin, { type: "reinstateEmployee", targetId: "EMP-107" })).status, 200);
  assert.equal((await act(await signIn("EMP-107"), { type: "checkin" })).status, 200);
});

test("admins can clear a colleague's PIN; other people cannot", async () => {
  const post = (token, body) => api("/api/reset-pin", json(token, body));
  const staff = await signIn("EMP-102");
  assert.equal((await post(staff, { targetId: "EMP-105" })).status, 403);
  assert.equal((await post(null, { targetId: "EMP-105" })).status, 401);
  await signIn("EMP-105", "pin-105-a");
  const admin = await signIn("EMP-101");
  assert.equal((await post(admin, { targetId: "NOPE" })).status, 404);
  assert.equal((await post(admin, { targetId: "EMP-105" })).status, 200);
  const fresh = await login("EMP-105", "brand-new-pin-105");
  assert.equal((await fresh.json()).created, true, "a new PIN was set, not the old one checked");
});

test("rejects non-JSON, malformed and oversized bodies", async () => {
  const token = await signIn("EMP-101");
  const form = await api("/api/action", { method: "POST", headers: { "Content-Type": "text/plain", Authorization: "Bearer " + token }, body: "{}" });
  assert.equal(form.status, 415);
  const bad = await api("/api/action", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: "{nope" });
  assert.equal(bad.status, 400);
  const arr = await api("/api/action", json(token, [1, 2]));
  assert.equal(arr.status, 400);
  const huge = await api("/api/action", json(token, { type: "x", pad: "a".repeat(40000) }));
  assert.equal(huge.status, 413);
});

test("cross-site POSTs and unexpected Host headers are refused", async () => {
  const token = await signIn("EMP-101");
  const evil = await act(token, { type: "checkin" }).then(() => api("/api/action", json(token, { type: "checkin" }, { Origin: "https://evil.example" })));
  assert.equal(evil.status, 403);
  const same = await api("/api/action", json(token, { type: "break" }, { Origin: base }));
  assert.notEqual(same.status, 403);
  // DNS-rebinding: the Host header names an attacker's domain
  const rebinding = await new Promise((resolve, reject) => {
    require("node:http").get({ host: "127.0.0.1", port, path: "/api/state", headers: { Host: "evil.example" } }, res => { res.resume(); resolve(res.statusCode); }).on("error", reject);
  });
  assert.equal(rebinding, 421);
});

test("serves only the whitelisted static files, with security headers", async () => {
  const page = await api("/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  assert.match(page.headers.get("permissions-policy"), /camera=\(\)/);
  assert.match(await page.text(), /BKR Attendance Register/);
  for (const p of ["/core.js", "/app.js", "/style.css"]) assert.equal((await api(p)).status, 200, p);
  for (const p of ["/package.json", "/server.js", "/data/store.json", "/data/auth.json", "/../server.js", "/%2e%2e/server.js", "/test/core.test.js", "/__proto__", "/constructor"]) {
    assert.equal((await api(p)).status, 404, p);
  }
  assert.equal((await api("/api/nope")).status, 404);
});

test("API responses are never cached and never leak stack traces", async () => {
  const r = await api("/api/state");
  assert.equal(r.headers.get("cache-control"), "no-store");
  const broken = await api("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "null" });
  assert.equal(broken.status, 400);
  assert.ok(!(await broken.text()).includes("at "));
});

test("HTML has no inline scripts or handlers (strict CSP stays valid)", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(!/\son[a-z]+\s*=/.test(html), "inline event handler found");
  assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/.test(html), "inline script found");
});

test("reset-pin clears a forgotten PIN while the server keeps running", async () => {
  const old = await signIn("EMP-105", "brand-new-pin-105");
  assert.equal((await login("EMP-105", "new-pin-105")).status, 401);
  const out = require("node:child_process").execFileSync(process.execPath, [path.join(__dirname, "..", "server.js"), "--reset-pin", "EMP-105"],
    { env: Object.assign({}, process.env, { DATA_FILE: process.env.DATA_FILE }), encoding: "utf8" });
  assert.match(out, /PIN cleared/);
  assert.equal((await act(old, { type: "checkin" })).status, 401, "old sessions end");
  const fresh = await login("EMP-105", "new-pin-105");
  assert.equal(fresh.status, 200);
  assert.equal((await fresh.json()).created, true);
});

test("a retried request (same requestId) is applied once, not twice", async () => {
  const token = await signIn("EMP-102");
  await act(token, { type: "checkin" });
  const requestId = "ab".repeat(16);
  const first = await (await act(token, { type: "break", requestId })).json();
  const retry = await (await act(token, { type: "break", requestId })).json();
  assert.equal(first.onBreak, true);
  assert.equal(retry.onBreak, true, "replayed answer, not a second toggle");
  const rec = (await state()).state.attendance.filter(a => a.empId === "EMP-102" && a.checkOut == null).pop();
  assert.equal(rec.breaks.length, 1);
  assert.equal(rec.breaks[0].end, null);
  const other = await signIn("EMP-103"); // already checked in by an earlier test
  const before = (await state()).state.attendance.filter(a => a.empId === "EMP-103" && a.checkOut == null).pop().breaks.length;
  assert.equal((await (await act(other, { type: "break", requestId })).json()).ok, true);
  const after = (await state()).state.attendance.filter(a => a.empId === "EMP-103" && a.checkOut == null).pop().breaks.length;
  assert.equal(after, before + 1, "the same id from another person is a new request");
});

// Keep last: it exhausts this address's request budget.
test("rate limiting: a flood of requests from one address is throttled", async () => {
  let throttled = 0;
  for (let i = 0; i < 130; i++) {
    const r = await api("/api/action", json(null, { type: "checkin" }));
    if (r.status === 429) throttled++;
  }
  assert.ok(throttled > 0, "expected some 429 responses");
});
