"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../core.js");

const TZ = "Asia/Kolkata";
const MON_0930 = Date.UTC(2026, 9, 26, 4, 0); // Mon 26 Oct 2026, 09:30 IST
const MIN = 60000, HOUR = 3600000, DAY = 86400000;

function office() {
  const s = C.emptyState();
  s.employees.push(
    { id: "EMP-101", name: "Aarav Sharma", role: "Engineer", department: "Engineering", email: "aarav@example.com", phone: "", quota: { holiday: 12, medical: 14, emergency: 7 } },
    { id: "EMP-102", name: "Ananya Iyer", role: "Designer", department: "Product", email: "ananya@example.com", phone: "", quota: { holiday: 12, medical: 14, emergency: 7 } }
  );
  return s;
}
const act = (s, a, now = MON_0930) => C.applyAction(s, a, now, TZ);

test("parseDate is strict about impossible and malformed dates", () => {
  assert.equal(C.parseDate("2026-02-30"), null);
  assert.equal(C.parseDate("2026-13-01"), null);
  assert.equal(C.parseDate("26-1-1"), null);
  assert.equal(C.parseDate(null), null);
  assert.ok(C.parseDate("2028-02-29"));
});

test("dateKey uses the office timezone, not UTC", () => {
  const instant = Date.UTC(2026, 9, 23, 20, 0); // 23 Oct 20:00 UTC = 24 Oct 01:30 IST
  assert.equal(C.dateKey(instant, "Asia/Kolkata"), "2026-10-24");
  assert.equal(C.dateKey(instant, "UTC"), "2026-10-23");
  assert.equal(C.dateKey(instant, "America/Los_Angeles"), "2026-10-23");
});

test("zonedMs round-trips wall-clock time, including across DST", () => {
  for (const tz of ["Asia/Kolkata", "America/New_York", "Europe/London"]) {
    for (const date of ["2026-01-15", "2026-03-08", "2026-03-29", "2026-11-01", "2026-10-25"]) {
      const ms = C.zonedMs(date, 9, 30, tz);
      assert.equal(C.dateKey(ms, tz), date, `${tz} ${date}`);
      assert.equal(C.formatTime(ms, tz), "09:30 AM", `${tz} ${date}`);
    }
  }
});

test("countWorkdays skips weekends and public holidays", () => {
  assert.equal(C.countWorkdays("2026-10-26", "2026-10-30"), 5);
  assert.equal(C.countWorkdays("2026-10-24", "2026-10-25"), 0);       // Sat–Sun
  assert.equal(C.countWorkdays("2026-09-28", "2026-10-02"), 4);       // Gandhi Jayanti Fri 2 Oct
  assert.equal(C.countWorkdays("2026-10-30", "2026-10-26"), 0);       // reversed
  assert.equal(C.countWorkdays("garbage", "2026-10-26"), 0);
});

test("holiday calendar is well-formed: valid, unique, sorted dates and known weekdays", () => {
  const dates = C.PUBLIC_HOLIDAYS.map(h => h.date);
  assert.equal(new Set(dates).size, dates.length);
  assert.deepEqual(dates, [...dates].sort());
  for (const h of C.PUBLIC_HOLIDAYS) assert.ok(C.parseDate(h.date), h.date);
  assert.equal(C.weekday("2026-01-26"), 1);  // Republic Day 2026 is a Monday
  assert.equal(C.weekday("2026-10-02"), 5);  // Gandhi Jayanti 2026 is a Friday
  assert.equal(C.weekday("2026-08-15"), 6);  // Independence Day 2026 is a Saturday
});

test("check-in → break → check-out records true durations", () => {
  const s = office();
  assert.equal(act(s, { type: "checkin", empId: "EMP-101", mode: "Office" }).ok, true);
  assert.equal(C.statusFor(s, "EMP-101", MON_0930, TZ).code, "CHECKED_IN");

  const t1 = MON_0930 + 2 * HOUR;
  assert.equal(act(s, { type: "break", empId: "EMP-101" }, t1).onBreak, true);
  assert.equal(C.statusFor(s, "EMP-101", t1 + MIN, TZ).onBreak, true);
  const t2 = t1 + 40 * MIN;
  assert.equal(act(s, { type: "break", empId: "EMP-101" }, t2).onBreak, false);

  const t3 = MON_0930 + 8 * HOUR;
  const out = act(s, { type: "checkout", empId: "EMP-101" }, t3);
  assert.equal(out.ok, true);
  const rec = s.attendance[0];
  assert.equal(C.breakMinutes(rec, t3), 40);
  assert.equal(C.workedMinutes(rec, t3), 8 * 60 - 40);
  assert.equal(C.statusFor(s, "EMP-101", t3, TZ).code, "CHECKED_OUT");
});

test("open break is closed at check-out and time freezes while on break", () => {
  const s = office();
  act(s, { type: "checkin", empId: "EMP-101", mode: "Remote" });
  act(s, { type: "break", empId: "EMP-101" }, MON_0930 + HOUR);
  const rec = s.attendance[0];
  assert.equal(C.workedMinutes(rec, MON_0930 + 3 * HOUR), 60); // paused at 1h
  act(s, { type: "checkout", empId: "EMP-101" }, MON_0930 + 3 * HOUR);
  assert.equal(rec.breaks[0].end, MON_0930 + 3 * HOUR);
  assert.equal(C.workedMinutes(rec, MON_0930 + 9 * HOUR), 60);
});

test("invalid punch transitions are rejected", () => {
  const s = office();
  assert.equal(act(s, { type: "checkout", empId: "EMP-101" }).code, "NOT_IN");
  assert.equal(act(s, { type: "break", empId: "EMP-101" }).code, "NOT_IN");
  assert.equal(act(s, { type: "checkin", empId: "NOPE" }).code, "NO_EMPLOYEE");
  act(s, { type: "checkin", empId: "EMP-101" });
  assert.equal(act(s, { type: "checkin", empId: "EMP-101" }).code, "ALREADY_IN");
  assert.equal(act(s, { type: "bogus", empId: "EMP-101" }).code, "BAD_ACTION");
  assert.equal(C.applyAction(s, null, MON_0930, TZ).code, "BAD_ACTION");
  assert.equal(s.attendance.length, 1);
});

test("re-check-in after check-out adds to the same day total", () => {
  const s = office();
  act(s, { type: "checkin", empId: "EMP-101" });
  act(s, { type: "checkout", empId: "EMP-101" }, MON_0930 + 2 * HOUR);
  act(s, { type: "checkin", empId: "EMP-101" }, MON_0930 + 3 * HOUR);
  act(s, { type: "checkout", empId: "EMP-101" }, MON_0930 + 5 * HOUR);
  const agg = C.dayAggregate(s, "EMP-101", "2026-10-26", MON_0930 + 6 * HOUR);
  assert.equal(agg.workedMin, 240);
  assert.equal(agg.checkIn, MON_0930);
  assert.equal(agg.checkOut, MON_0930 + 5 * HOUR);
});

test("a forgotten check-out is flagged as missed, not counted, and does not block tomorrow", () => {
  const s = office();
  act(s, { type: "checkin", empId: "EMP-101" });
  const tomorrow = MON_0930 + DAY;
  assert.equal(C.statusFor(s, "EMP-101", tomorrow, TZ).code, "NOT_CHECKED_IN");
  assert.equal(act(s, { type: "checkout", empId: "EMP-101" }, tomorrow).code, "NOT_IN");
  assert.equal(act(s, { type: "checkin", empId: "EMP-101" }, tomorrow).ok, true);
  assert.equal(s.attendance[0].missed, true);
  const hist = C.history(s, "EMP-101", tomorrow + HOUR, TZ);
  assert.equal(hist[1].missed, true);
  assert.equal(hist[1].workedMin, 0);
});

test("status is derived, so it rolls over at office midnight with no stored 'today'", () => {
  const s = office();
  act(s, { type: "checkin", empId: "EMP-101" });
  act(s, { type: "checkout", empId: "EMP-101" }, MON_0930 + HOUR);
  assert.equal(C.statusFor(s, "EMP-101", MON_0930 + HOUR, TZ).code, "CHECKED_OUT");
  assert.equal(C.statusFor(s, "EMP-101", MON_0930 + DAY, TZ).code, "NOT_CHECKED_IN");
});

test("weekends and public holidays show as day off", () => {
  const s = office();
  const sat = Date.UTC(2026, 9, 24, 6, 0);
  assert.deepEqual(C.statusFor(s, "EMP-101", sat, TZ).code, "DAY_OFF");
  assert.equal(C.statusFor(s, "EMP-101", sat, TZ).note, "Weekend");
  const gandhi = Date.UTC(2026, 9, 2, 6, 0);
  assert.equal(C.statusFor(s, "EMP-101", gandhi, TZ).note, "Gandhi Jayanti");
});

test("leave: books working days, shows on the board, consumes balance", () => {
  const s = office();
  const r = act(s, { type: "leave", empId: "EMP-101", leaveType: "Medical", start: "2026-10-26", end: "2026-10-28", reason: "Flu", contact: "" });
  assert.equal(r.ok, true);
  assert.equal(s.leaves[0].days, 3);
  assert.equal(C.statusFor(s, "EMP-101", MON_0930, TZ).code, "MEDICAL_LEAVE");
  assert.equal(C.balances(s, "EMP-101", 2026).Medical.used, 3);
  assert.equal(C.balances(s, "EMP-101", 2026).Medical.remaining, 11);
  assert.equal(C.balances(s, "EMP-102", 2026).Medical.used, 0);
});

test("leave: quota is enforced (not silently over-approved)", () => {
  const s = office();
  const tooMany = act(s, { type: "leave", empId: "EMP-101", leaveType: "Emergency", start: "2026-10-26", end: "2026-11-10", reason: "Family" });
  assert.equal(tooMany.code, "QUOTA");
  assert.match(tooMany.error, /needs 12 working day\(s\) but you have 7 of 7 left/);
  assert.equal(s.leaves.length, 0);
  assert.equal(act(s, { type: "leave", empId: "EMP-101", leaveType: "Emergency", start: "2026-10-26", end: "2026-10-30", reason: "Family" }).ok, true);
  const second = act(s, { type: "leave", empId: "EMP-101", leaveType: "Emergency", start: "2026-11-02", end: "2026-11-04", reason: "More" });
  assert.equal(second.code, "QUOTA");
  assert.match(second.error, /but you have 2 of 7 left/);
});

test("leave: overlap, bad ranges, weekends-only, cross-year and over-long are rejected", () => {
  const s = office();
  const book = (o) => act(s, Object.assign({ type: "leave", empId: "EMP-101", leaveType: "Holiday", reason: "Trip" }, o));
  assert.equal(book({ start: "2026-10-28", end: "2026-10-30" }).ok, true);
  assert.equal(book({ start: "2026-10-30", end: "2026-11-02" }).code, "OVERLAP");
  assert.equal(book({ start: "2026-11-05", end: "2026-11-04" }).code, "BAD_RANGE");
  assert.equal(book({ start: "2026-11-30", end: "2026-02-31" }).code, "BAD_DATE");
  assert.equal(book({ start: "2026-10-31", end: "2026-11-01" }).code, "NO_WORKDAYS");
  assert.equal(book({ start: "2026-12-28", end: "2027-01-05" }).code, "CROSS_YEAR");
  assert.equal(book({ start: "2026-11-02", end: "2027-03-01" }).code, "CROSS_YEAR");
  assert.equal(book({ start: "2026-01-02", end: "2026-04-30" }).code, "TOO_LONG");
  assert.equal(book({ start: "2026-11-02", end: "2026-11-03", reason: " " }).code, "NO_REASON");
  assert.equal(book({ leaveType: "Sabbatical", start: "2026-11-02", end: "2026-11-03" }).code, "BAD_TYPE");
  assert.equal(s.leaves.length, 1);
});

test("leave: back-dating rules differ by type", () => {
  const s = office();
  const book = (leaveType, start, end) => act(s, { type: "leave", empId: "EMP-101", leaveType, start, end, reason: "Because" });
  assert.equal(book("Holiday", "2026-10-23", "2026-10-23").code, "PAST_DATE");
  assert.equal(book("Medical", "2026-10-15", "2026-10-15").code, "PAST_DATE");   // 11 days back
  assert.equal(book("Medical", "2026-10-22", "2026-10-23").ok, true);             // 4 days back
});

test("leave: cancelling returns the balance; only owners, only unstarted leave", () => {
  const s = office();
  act(s, { type: "leave", empId: "EMP-101", leaveType: "Holiday", start: "2026-11-02", end: "2026-11-04", reason: "Trip" });
  const id = s.leaves[0].id;
  assert.equal(C.balances(s, "EMP-101", 2026).Holiday.used, 3);
  assert.equal(act(s, { type: "cancelLeave", empId: "EMP-102", leaveId: id }).code, "NOT_FOUND");
  assert.equal(act(s, { type: "cancelLeave", empId: "EMP-101", leaveId: id }).ok, true);
  assert.equal(C.balances(s, "EMP-101", 2026).Holiday.used, 0);
  assert.equal(act(s, { type: "cancelLeave", empId: "EMP-101", leaveId: id }).code, "NOT_ACTIVE");
  assert.equal(act(s, { type: "leave", empId: "EMP-101", leaveType: "Holiday", start: "2026-11-02", end: "2026-11-04", reason: "Trip again" }).ok, true);

  act(s, { type: "leave", empId: "EMP-101", leaveType: "Medical", start: "2026-10-26", end: "2026-10-27", reason: "Flu" });
  const started = s.leaves.find(l => l.type === "Medical").id;
  assert.equal(act(s, { type: "cancelLeave", empId: "EMP-101", leaveId: started }, MON_0930 + DAY).code, "STARTED");
});

test("checking in on an approved leave day needs an explicit override", () => {
  const s = office();
  act(s, { type: "leave", empId: "EMP-101", leaveType: "Holiday", start: "2026-10-26", end: "2026-10-26", reason: "Trip" });
  const first = act(s, { type: "checkin", empId: "EMP-101" });
  assert.equal(first.code, "LEAVE_CONFLICT");
  assert.equal(s.attendance.length, 0);
  assert.equal(act(s, { type: "checkin", empId: "EMP-101", override: true }).ok, true);
  assert.equal(C.statusFor(s, "EMP-101", MON_0930, TZ).code, "CHECKED_IN"); // a real punch beats a scheduled leave
});

test("privacy: broadcast view never contains leave reasons or contacts", () => {
  const s = office();
  act(s, { type: "leave", empId: "EMP-101", leaveType: "Medical", start: "2026-10-26", end: "2026-10-26", reason: "Chemotherapy", contact: "Dr Who 555-0100" });
  const json = JSON.stringify(C.publicView(s));
  assert.ok(!json.includes("Chemotherapy"));
  assert.ok(!json.includes("555-0100"));
  assert.ok(json.includes("Medical"));
  const mine = C.privateDetails(s, "EMP-101")[s.leaves[0].id];
  assert.equal(mine.reason, "Chemotherapy");
  assert.deepEqual(C.privateDetails(s, "EMP-102"), {});
  assert.equal(s.leaves[0].reason, "Chemotherapy"); // original untouched
});

test("addEmployee validates and assigns unique ids", () => {
  const s = office();
  const add = o => act(s, Object.assign({ type: "addEmployee", name: "Linus T", role: "Maintainer", department: "Engineering", email: "linus@example.com" }, o));
  const r = add({});
  assert.equal(r.ok, true);
  assert.equal(r.empId, "EMP-103");
  assert.equal(add({}).code, "DUP_EMAIL");
  assert.equal(add({ email: "LINUS@example.com" }).code, "DUP_EMAIL");
  assert.equal(add({ email: "not-an-email" }).code, "BAD_EMAIL");
  assert.equal(add({ name: "x", email: "x@example.com" }).code, "BAD_NAME");
  assert.equal(add({ department: "Piracy", email: "p@example.com" }).code, "BAD_DEPT");
  assert.equal(s.employees.length, 3);
});

test("text input is stripped of control characters and length-capped", () => {
  const s = office();
  act(s, { type: "leave", empId: "EMP-101", leaveType: "Holiday", start: "2026-11-02", end: "2026-11-02", reason: "a\u0000b\nc" + "x".repeat(500), contact: "\u0007" });
  assert.ok(s.leaves[0].reason.length <= 300);
  assert.ok(!/[\u0000-\u001f]/.test(s.leaves[0].reason));
});

test("escapeHtml and csvField neutralise injection", () => {
  assert.equal(C.escapeHtml(`<img src=x onerror="alert('x')">&`), "&lt;img src=x onerror=&quot;alert(&#039;x&#039;)&quot;&gt;&amp;");
  assert.equal(C.csvField('Hello, "World"'), '"Hello, ""World"""');
  assert.equal(C.csvField("=HYPERLINK(\"http://evil\")"), '"\'=HYPERLINK(""http://evil"")"');
  assert.equal(C.csvField("+1 555"), '"\'+1 555"');
  assert.equal(C.csvField(null), '""');
  assert.equal(C.csvField(42), '"42"');
});

test("seed data is valid and consistent for any day of the week", () => {
  for (let i = 0; i < 700; i++) {
    const now = Date.UTC(2026, 0, 1 + i, 7, 0);
    const s = C.seedState(now, TZ);
    assert.equal(s.employees.length, 10);
    const ids = new Set(s.leaves.map(l => l.id));
    assert.equal(ids.size, s.leaves.length);
    for (const l of s.leaves) {
      assert.ok(l.days >= 1, `leave has working days (day offset ${i})`);
      assert.equal(l.days, C.countWorkdays(l.start, l.end));
      for (const other of s.leaves) {
        if (other !== l && other.empId === l.empId) assert.ok(l.end < other.start || l.start > other.end, "no overlaps");
      }
    }
    for (const e of s.employees) {
      const b = C.balances(s, e.id, 2026);
      for (const type of Object.keys(b)) assert.ok(b[type].used <= b[type].quota);
    }
    const today = C.dateKey(now, TZ);
    for (const r of s.attendance) {
      assert.ok(r.date <= today);
      assert.ok(r.checkIn < now, "no punches from the future");
      assert.ok(C.isWorkday(r.date));
      if (r.date < today) {
        assert.ok(r.checkOut > r.checkIn);
        assert.ok(C.workedMinutes(r, now) > 6 * 60);
      } else if (r.checkOut != null) {
        assert.ok(r.checkOut > r.checkIn && r.checkOut < now);
      }
      assert.ok(!C.leaveOn(s, r.empId, r.date), "no punches on seeded leave days");
    }
  }
});

test("seed puts leave on the next working day so the board is meaningful", () => {
  const s = C.seedState(MON_0930, TZ);
  const codes = s.employees.map(e => C.statusFor(s, e.id, MON_0930, TZ).code);
  assert.ok(codes.includes("MEDICAL_LEAVE"));
  assert.ok(codes.includes("EMERGENCY_LEAVE"));
});

test("nextHoliday finds the upcoming company holiday", () => {
  assert.equal(C.nextHoliday("2026-10-24").name, "Diwali");
  assert.equal(C.nextHoliday("2026-11-08").date, "2026-11-08");
  assert.equal(C.nextHoliday("2026-12-26").date, "2027-01-26");
});

test("formatDuration is zero-padded and never negative", () => {
  assert.equal(C.formatDuration(5), "0h 05m");
  assert.equal(C.formatDuration(497), "8h 17m");
  assert.equal(C.formatDuration(-3), "0h 00m");
  assert.equal(C.formatDuration(undefined), "0h 00m");
});

test("validTimeZone rejects missing and bogus zones (server falls back to the machine zone)", () => {
  assert.equal(C.validTimeZone(undefined), false);
  assert.equal(C.validTimeZone(""), false);
  assert.equal(C.validTimeZone("Mars/Olympus"), false);
  assert.equal(C.validTimeZone("Asia/Kolkata"), true);
});

test("publicView windows old attendance so payloads stay bounded", () => {
  const s = office();
  for (let i = 0; i < 100; i++) {
    const day = MON_0930 - i * DAY;
    s.attendance.push({ id: "A" + i, empId: "EMP-101", date: C.dateKey(day, TZ), checkIn: day, checkOut: day + HOUR, mode: "Office", breaks: [] });
  }
  const windowed = C.publicView(s, { now: MON_0930, tz: TZ });
  assert.equal(windowed.attendance.length, 46);
  assert.equal(C.publicView(s).attendance.length, 100);
  assert.equal(s.attendance.length, 100);
});

test("seed shows a lived-in office on a working day (some in, some not yet) but never before anyone could have arrived", () => {
  const afternoon = Date.UTC(2026, 9, 26, 8, 30); // Mon 14:00 IST
  const s = C.seedState(afternoon, TZ);
  const codes = s.employees.map(e => C.statusFor(s, e.id, afternoon, TZ).code);
  assert.ok(codes.filter(c => c === "CHECKED_IN" || c === "REMOTE").length >= 3, codes.join());
  const dawn = Date.UTC(2026, 9, 26, 0, 30); // Mon 06:00 IST
  const early = C.seedState(dawn, TZ);
  assert.equal(early.attendance.filter(r => r.date === "2026-10-26").length, 0);
});
