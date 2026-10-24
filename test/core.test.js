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
    { id: "EMP-101", name: "Aarav Sharma", role: "Engineer", email: "aarav@example.com", phone: "", isAdmin: true, joinDate: "2026-01-01", quota: { holiday: 12, medical: 14, emergency: 7 } },
    { id: "EMP-102", name: "Ananya Iyer", role: "Designer", email: "ananya@example.com", phone: "", isAdmin: false, joinDate: "2026-01-01", quota: { holiday: 12, medical: 14, emergency: 7 } }
  );
  s.holidays = [{ date: "2026-10-02", name: "Gandhi Jayanti" }, ...C.DEFAULT_HOLIDAYS];
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
  const H = C.holidayMap(office());
  assert.equal(C.countWorkdays("2026-10-26", "2026-10-30", H), 5);
  assert.equal(C.countWorkdays("2026-10-24", "2026-10-25", H), 0);       // Sat–Sun
  assert.equal(C.countWorkdays("2026-09-28", "2026-10-02", H), 4);       // Gandhi Jayanti Fri 2 Oct
  assert.equal(C.countWorkdays("2026-10-30", "2026-10-26", H), 0);       // reversed
  assert.equal(C.countWorkdays("garbage", "2026-10-26", H), 0);
  assert.equal(C.countWorkdays("2026-09-28", "2026-10-02"), 5, "no holiday list means no holidays");
});

test("BKR's starting holidays are well-formed and on the right weekdays", () => {
  const dates = C.DEFAULT_HOLIDAYS.map(h => h.date);
  assert.equal(dates.length, 6);
  assert.equal(new Set(dates).size, dates.length);
  assert.deepEqual(dates, [...dates].sort());
  const day = d => C.weekday(d);
  assert.equal(C.DEFAULT_HOLIDAYS[0].name, "Kartika Purnima");  assert.equal(day("2026-11-24"), 2);
  assert.equal(day("2026-12-25"), 5);
  assert.equal(day("2027-01-14"), 4);
  assert.equal(day("2027-01-26"), 2);
  assert.equal(day("2027-03-06"), 6);  // Maha Shivaratri falls on a Saturday
  assert.equal(day("2027-03-22"), 1);
  assert.deepEqual(C.REGISTER.months, ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]);
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

test("admin actions are refused for everyone except admins", () => {
  const s = office();
  const body = { type: "addEmployee", name: "Linus T", role: "Maintainer" };
  assert.equal(act(s, Object.assign({ empId: "EMP-102" }, body)).code, "FORBIDDEN");
  for (const type of ["removeEmployee", "reinstateEmployee", "setAdmin", "addHoliday", "removeHoliday"]) {
    assert.equal(act(s, { type, empId: "EMP-102", targetId: "EMP-101", date: "2026-12-01", name: "x" }).code, "FORBIDDEN", type);
  }
  assert.equal(s.employees.length, 2);
  assert.equal(s.holidays.length, 7);
});

test("a new joiner is added with their own record, from their joining date", () => {
  const s = office();
  const add = o => act(s, Object.assign({ type: "addEmployee", empId: "EMP-101", name: "Linus T", role: "Maintainer", joinDate: "2026-11-02" }, o));
  const r = add({});
  assert.equal(r.ok, true);
  assert.equal(r.empId, "EMP-103");
  const linus = s.employees[2];
  assert.equal(linus.joinDate, "2026-11-02");
  assert.equal(linus.isAdmin, false);
  assert.deepEqual(linus.quota, { holiday: 12, medical: 14, emergency: 7 });
  assert.equal(C.isActive(linus, "2026-10-30"), false, "not yet joined");
  assert.equal(C.isActive(linus, "2026-11-02"), true);
  assert.equal(add({ email: "not-an-email" }).code, "BAD_EMAIL");
  assert.equal(add({ name: "x" }).code, "BAD_NAME");
  assert.equal(add({ role: "" }).code, "BAD_ROLE");
  assert.equal(add({ joinDate: "2026-02-31", name: "Other Person" }).code, "BAD_DATE");
  assert.equal(add({}).code, "DUP_NAME");
  assert.equal(add({ name: "Has Email", email: "he@example.com" }).ok, true);
  assert.equal(add({ name: "Same Email", email: "HE@example.com" }).code, "DUP_EMAIL");
  assert.equal(add({ name: "No Email Needed" }).ok, true, "email is optional");
  assert.equal(add({ name: "New Admin", isAdmin: true }).ok, true);
  assert.equal(s.employees.at(-1).isAdmin, true);
});

test("someone who leaves drops off the board, keeps their history, and cannot act", () => {
  const s = office();
  act(s, { type: "addEmployee", empId: "EMP-101", name: "Leaver One", role: "Driver", joinDate: "2026-01-01" });
  const id = "EMP-103";
  act(s, { type: "checkin", empId: id }, MON_0930);
  act(s, { type: "checkout", empId: id }, MON_0930 + 8 * HOUR);
  act(s, { type: "leave", empId: id, leaveType: "Holiday", start: "2026-11-09", end: "2026-11-10", reason: "Trip" });
  assert.equal(act(s, { type: "leave", empId: id, leaveType: "Holiday", start: "2026-10-27", end: "2026-10-27", reason: "Before" }).ok, true);
  const out = act(s, { type: "removeEmployee", empId: "EMP-101", targetId: id, lastDay: "2026-10-28" });
  assert.equal(out.ok, true);
  assert.match(out.message, /1 later leave request/);
  assert.equal(s.employees.find(e => e.id === id).leftOn, "2026-10-28");
  assert.equal(C.isActive(s.employees[2], "2026-10-28"), true, "still active on the last day");
  assert.equal(C.isActive(s.employees[2], "2026-10-29"), false);
  assert.equal(act(s, { type: "checkin", empId: id }, MON_0930 + 3 * DAY).code, "INACTIVE");
  assert.equal(C.activeEmployees(s, "2026-10-29").length, 2);
  assert.equal(s.attendance.filter(a => a.empId === id).length, 1, "history kept");
  assert.equal(s.leaves.find(l => l.start === "2026-11-09").status, "Cancelled");
  assert.equal(s.leaves.find(l => l.start === "2026-10-27").status, "Approved");
  assert.equal(act(s, { type: "reinstateEmployee", empId: "EMP-101", targetId: id }).ok, true);
  assert.equal(C.isActive(s.employees[2], "2026-12-01"), true);
  assert.equal(act(s, { type: "reinstateEmployee", empId: "EMP-101", targetId: id }).code, "NOT_LEFT");
});

test("the last admin cannot be removed or demoted; admin rights can be handed over", () => {
  const s = office();
  assert.equal(act(s, { type: "removeEmployee", empId: "EMP-101", targetId: "EMP-101" }).code, "LAST_ADMIN");
  assert.equal(act(s, { type: "setAdmin", empId: "EMP-101", targetId: "EMP-101", isAdmin: false }).code, "LAST_ADMIN");
  assert.equal(act(s, { type: "setAdmin", empId: "EMP-101", targetId: "EMP-102", isAdmin: true }).ok, true);
  assert.equal(act(s, { type: "removeEmployee", empId: "EMP-102", targetId: "EMP-101", lastDay: "2026-10-26" }).ok, true);
  assert.equal(act(s, { type: "removeEmployee", empId: "EMP-102", targetId: "EMP-102" }, MON_0930 + DAY).code, "LAST_ADMIN");
  assert.equal(act(s, { type: "removeEmployee", empId: "EMP-102", targetId: "NOPE" }).code, "NOT_FOUND");
});

test("admins add and remove holidays; they change leave counting and the day's status", () => {
  const s = office();
  const add = (date, name) => act(s, { type: "addHoliday", empId: "EMP-101", date, name });
  assert.equal(C.countWorkdays("2026-11-02", "2026-11-06", C.holidayMap(s)), 5);
  assert.equal(add("2026-11-04", "Founders' Day").ok, true);
  assert.equal(C.countWorkdays("2026-11-02", "2026-11-06", C.holidayMap(s)), 4);
  const wed = Date.UTC(2026, 10, 4, 5, 0);
  assert.equal(C.statusFor(s, "EMP-102", wed, TZ).note, "Founders' Day");
  assert.equal(add("2026-11-04", "Again").code, "DUP_HOLIDAY");
  assert.equal(add("2026-02-31", "Bad").code, "BAD_DATE");
  assert.equal(add("2026-11-05", "x").code, "BAD_NAME");
  assert.deepEqual(s.holidays.map(h => h.date), [...s.holidays.map(h => h.date)].sort());
  assert.equal(act(s, { type: "removeHoliday", empId: "EMP-101", date: "2026-11-04" }).ok, true);
  assert.equal(C.countWorkdays("2026-11-02", "2026-11-06", C.holidayMap(s)), 5);
  assert.equal(act(s, { type: "removeHoliday", empId: "EMP-101", date: "2026-11-04" }).code, "NOT_FOUND");
  assert.equal(s.holidays.length, 7);
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

test("a fresh install holds BKR's seven people, Bibhu as admin, and the six holidays", () => {
  const s = C.seedState();
  assert.deepEqual(s.employees.map(e => [e.id, e.name, e.role]), [
    ["EMP-101", "Bibhu P. Dash", "Admin"],
    ["EMP-102", "Pradyumna Sahoo", "Co-Ordinator \u2013 Programs"],
    ["EMP-103", "Abhijit Nayak", "Research Assistant"],
    ["EMP-104", "Poonam Das", "Associate Scientist"],
    ["EMP-105", "Priyadarsani Barik", "Research Assistant"],
    ["EMP-106", "Dinabandhu Behera", "Driver"],
    ["EMP-107", "Baidyanath Sing", "Field Coordinator"]
  ]);
  assert.deepEqual(s.employees.map(e => e.isAdmin), [true, false, false, false, false, false, false]);
  assert.deepEqual(s.holidays.map(h => [h.date, h.name]), [
    ["2026-11-24", "Kartika Purnima"], ["2026-12-25", "Christmas"], ["2027-01-14", "Makar Sankranti"],
    ["2027-01-26", "Republic Day"], ["2027-03-06", "Maha Shivaratri"], ["2027-03-22", "Holi"]
  ]);
  assert.deepEqual([s.attendance.length, s.leaves.length], [0, 0], "a real register starts empty");
  assert.equal(C.migrate(JSON.parse(JSON.stringify(s))).holidays.length, 6);
});

test("older saved data is upgraded without losing anything", () => {
  const old = { version: 2, employees: [{ id: "EMP-101", name: "Old Timer", role: "Clerk" }], attendance: [{ id: "A1" }], leaves: [] };
  const up = C.migrate(old);
  assert.equal(up.version, 3);
  assert.equal(up.holidays.length, 6);
  assert.equal(up.employees[0].isAdmin, true, "someone must be able to administer");
  assert.equal(up.attendance.length, 1);
});

test("the monthly register marks present, absent, leave, holidays and weekly offs", () => {
  const s = C.seedState();
  const now = Date.UTC(2026, 11, 29, 6, 0); // Tue 29 Dec 2026 11:30 IST
  const book = (empId, leaveType, start, end) => act(s, { type: "leave", empId, leaveType, start, end, reason: "Because" }, Date.UTC(2026, 11, 1, 6, 0));
  assert.equal(book("EMP-103", "Medical", "2026-12-08", "2026-12-09").ok, true);
  assert.equal(book("EMP-102", "Holiday", "2026-12-14", "2026-12-14").ok, true);
  for (const day of [1, 2, 3, 4, 7]) {
    const t = Date.UTC(2026, 11, day, 4, 0);
    act(s, { type: "checkin", empId: "EMP-101", mode: day === 7 ? "Remote" : "Office" }, t);
    act(s, { type: "checkout", empId: "EMP-101" }, t + 8 * HOUR);
  }
  const reg = C.registerMonth(s, "2026-12", now, TZ);
  assert.equal(reg.days.length, 31);
  const bibhu = reg.rows[0];
  assert.deepEqual(bibhu.cells.slice(0, 8), ["P", "P", "P", "P", "W", "W", "R", "A"]);
  assert.equal(bibhu.cells[24], "H", "25 Dec is a holiday");
  assert.equal(bibhu.cells[28], "", "today has no punch yet, so it is not marked absent");
  assert.equal(bibhu.cells[29], "", "the future is blank");
  assert.deepEqual([bibhu.totals.P, bibhu.totals.R, bibhu.totals.A], [4, 1, 14]);
  const abhijit = reg.rows[2];
  assert.deepEqual([abhijit.cells[7], abhijit.cells[8], abhijit.totals.ML], ["ML", "ML", 2]);
  assert.equal(reg.rows[1].cells[13], "HL");
  assert.equal(C.registerMonth(s, "2027-02", now, TZ).days.length, 28);
  assert.equal(C.registerMonth(s, "nonsense", now, TZ), null);
  // someone who joined mid-month is blank before joining; someone who left is blank afterwards
  act(s, { type: "addEmployee", empId: "EMP-101", name: "Late Joiner", role: "Clerk", joinDate: "2026-12-10" }, now);
  act(s, { type: "removeEmployee", empId: "EMP-101", targetId: "EMP-106", lastDay: "2026-12-15" }, now);
  const reg2 = C.registerMonth(s, "2026-12", now, TZ);
  const joiner = reg2.rows.find(r => r.emp.name === "Late Joiner");
  assert.deepEqual(joiner.cells.slice(7, 10), ["", "", "A"]);
  const leaver = reg2.rows.find(r => r.emp.id === "EMP-106");
  assert.equal(leaver.cells[16], "", "after the last working day");
  assert.equal(C.registerMonth(s, "2027-01", now, TZ).rows.some(r => r.emp.id === "EMP-106"), false, "left before the month began");
});

test("nextHoliday finds the upcoming holiday from the saved list", () => {
  const s = C.seedState();
  assert.equal(C.nextHoliday(s, "2026-10-24").name, "Kartika Purnima");
  assert.equal(C.nextHoliday(s, "2026-11-24").date, "2026-11-24");
  assert.equal(C.nextHoliday(s, "2026-12-26").date, "2027-01-14");
  assert.equal(C.nextHoliday(s, "2027-03-23"), null);
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
  for (let i = 0; i < 250; i++) {
    const day = MON_0930 - i * DAY;
    s.attendance.push({ id: "A" + i, empId: "EMP-101", date: C.dateKey(day, TZ), checkIn: day, checkOut: day + HOUR, mode: "Office", breaks: [] });
  }
  const windowed = C.publicView(s, { now: MON_0930, tz: TZ });
  assert.equal(windowed.attendance.length, 201);
  assert.equal(C.publicView(s).attendance.length, 250);
  assert.equal(s.attendance.length, 250);
});

test("hostile input cannot reach Object.prototype members or crash validation", () => {
  const s = office();
  for (const leaveType of ["constructor", "__proto__", "toString", "hasOwnProperty", 5, null, undefined, {}, []]) {
    const r = act(s, { type: "leave", empId: "EMP-101", leaveType, start: "2026-11-02", end: "2026-11-02", reason: "abc" });
    assert.equal(r.ok, false, String(leaveType));
  }
  assert.equal(act(s, { type: "leave", empId: "EMP-101", leaveType: "Holiday", start: { a: 1 }, end: [], reason: "abc" }).ok, false);
  assert.equal(s.leaves.length, 0);
});

test("abuse caps: punches per day, breaks per session, leaves per employee", () => {
  const s = office();
  let t = MON_0930;
  for (let i = 0; i < 20; i++) {
    assert.equal(act(s, { type: "checkin", empId: "EMP-101" }, t).ok, true, "check-in " + i);
    t += MIN;
    assert.equal(act(s, { type: "checkout", empId: "EMP-101" }, t).ok, true);
    t += MIN;
  }
  assert.equal(act(s, { type: "checkin", empId: "EMP-101" }, t).code, "TOO_MANY");

  const s2 = office();
  act(s2, { type: "checkin", empId: "EMP-101" });
  let r;
  for (let i = 0; i < 101; i++) r = act(s2, { type: "break", empId: "EMP-101" }, MON_0930 + (i + 1) * MIN);
  assert.equal(s2.attendance[0].breaks.length, 50);
  assert.equal(r.code, "TOO_MANY"); // the 101st toggle would open break #51
});

