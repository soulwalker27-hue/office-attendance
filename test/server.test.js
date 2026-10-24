"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-"));
process.env.DATA_FILE = path.join(dir, "store.json");
process.env.OFFICE_TZ = "Asia/Kolkata";
const { server } = require("../server.js");

let base;
test.before(() => new Promise(resolve => server.listen(0, "127.0.0.1", () => {
  base = `http://127.0.0.1:${server.address().port}`;
  resolve();
})));
test.after(() => new Promise(resolve => server.close(resolve)));

const api = (p, opts) => fetch(base + p, opts);
const post = body => api("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("seeds a store on first run and serves state", async () => {
  const r = await api("/api/state");
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.tz, "Asia/Kolkata");
  assert.equal(j.state.employees.length, 8);
  assert.ok(Math.abs(j.now - Date.now()) < 5000);
  assert.ok(fs.existsSync(process.env.DATA_FILE));
});

test("punches are shared: one client's check-in is visible to another", async () => {
  const before = await (await api("/api/state")).json();
  const emp = before.state.employees[0].id;
  const r = await post({ type: "checkin", empId: emp, mode: "Office" });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  const other = await (await api("/api/state?me=")).json();
  assert.ok(other.state.attendance.some(a => a.empId === emp && a.checkOut == null));
  const dup = await post({ type: "checkin", empId: emp });
  assert.equal(dup.status, 422);
  assert.equal((await dup.json()).code, "ALREADY_IN");
  const out = await post({ type: "checkout", empId: emp });
  assert.equal(out.status, 200);
});

test("data survives a restart (persisted atomically to disk)", async () => {
  const onDisk = JSON.parse(fs.readFileSync(process.env.DATA_FILE, "utf8"));
  assert.ok(onDisk.attendance.length > 0);
  assert.ok(!fs.existsSync(process.env.DATA_FILE + ".tmp"));
});

test("leave reasons are private: absent from /api/state, present only in the owner's 'mine'", async () => {
  const state = await (await api("/api/state")).json();
  const emp = state.state.employees[1].id;
  const start = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  const r = await post({ type: "leave", empId: emp, leaveType: "Medical", start: start, end: start, reason: "SECRET-DIAGNOSIS", contact: "555-SECRET" });
  const body = await r.json();
  if (!body.ok) assert.ok(["NO_WORKDAYS", "OVERLAP"].includes(body.code), JSON.stringify(body)); // weekend landing is fine
  const everyone = JSON.stringify(await (await api("/api/state")).json());
  assert.ok(!everyone.includes("SECRET-DIAGNOSIS"));
  assert.ok(!everyone.includes("555-SECRET"));
  assert.ok(!JSON.stringify(body.view.state).includes("SECRET-DIAGNOSIS"));
  if (body.ok) {
    const mine = await (await api("/api/state?me=" + emp)).json();
    assert.ok(JSON.stringify(mine.mine).includes("SECRET-DIAGNOSIS"));
  }
});

test("rejects non-JSON, malformed and oversized bodies", async () => {
  const form = await api("/api/action", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
  assert.equal(form.status, 415);
  const bad = await api("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{nope" });
  assert.equal(bad.status, 400);
  const huge = await api("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "x", pad: "a".repeat(40000) }) });
  assert.equal(huge.status, 413);
});

test("serves only the whitelisted static files, with security headers", async () => {
  const page = await api("/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.match(await page.text(), /PulseAttend/);
  for (const p of ["/core.js", "/app.js", "/style.css"]) assert.equal((await api(p)).status, 200, p);
  for (const p of ["/package.json", "/server.js", "/data/store.json", "/../server.js", "/%2e%2e/server.js", "/test/core.test.js"]) {
    assert.equal((await api(p)).status, 404, p);
  }
  assert.equal((await api("/api/nope")).status, 404);
});

test("HTML has no inline scripts or handlers (strict CSP stays valid)", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.ok(!/\son[a-z]+\s*=/.test(html), "inline event handler found");
  assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/.test(html), "inline script found");
});
