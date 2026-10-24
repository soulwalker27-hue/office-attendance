/**
 * PulseAttend core — pure, framework-free domain logic.
 *
 * Runs unchanged in the browser (local mode), in the Node server (shared mode)
 * and in the test suite, so there is exactly one implementation of every rule.
 * All functions take an explicit `now` (epoch ms) and `tz` (IANA zone) so they
 * are deterministic and never depend on the machine's clock or timezone.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AttendanceCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------
  const LEAVE_TYPES = {
    Medical: { key: "medical", quota: 14, status: "MEDICAL_LEAVE", icon: "🩺", backdateDays: 7 },
    Emergency: { key: "emergency", quota: 7, status: "EMERGENCY_LEAVE", icon: "🚨", backdateDays: 7 },
    Holiday: { key: "holiday", quota: 12, status: "HOLIDAY", icon: "🏖️", backdateDays: 0 }
  };

  const DEPARTMENTS = ["Engineering", "Design", "Human Resources", "Marketing", "Product", "Sales & Ops"];
  const WORK_MODES = ["Office", "Remote"];
  const MAX_LEAVE_SPAN_DAYS = 90;
  const MAX_EMPLOYEES = 500;

  // Official office closures (India). `date` is ISO; weekday/status are always derived.
  // Only dates fixed by the calendar or widely agreed are listed. Moon-dependent festival
  // dates (Eid, Muharram, and some Holi/Diwali/Dussehra dates) differ by source and state,
  // so HR should confirm them against the DoPT/office notification and add them here.
  const PUBLIC_HOLIDAYS = [
    { date: "2026-01-26", name: "Republic Day" },
    { date: "2026-03-04", name: "Holi" },
    { date: "2026-04-03", name: "Good Friday" },
    { date: "2026-08-15", name: "Independence Day" },
    { date: "2026-09-04", name: "Janmashtami" },
    { date: "2026-10-02", name: "Gandhi Jayanti" },
    { date: "2026-10-20", name: "Dussehra" },
    { date: "2026-11-08", name: "Diwali" },
    { date: "2026-12-25", name: "Christmas Day" },
    { date: "2027-01-26", name: "Republic Day" },
    { date: "2027-03-26", name: "Good Friday" },
    { date: "2027-08-15", name: "Independence Day" },
    { date: "2027-10-02", name: "Gandhi Jayanti" },
    { date: "2027-12-25", name: "Christmas Day" }
  ];
  const HOLIDAY_BY_DATE = new Map(PUBLIC_HOLIDAYS.map(h => [h.date, h.name]));

  // --------------------------------------------------------------------------
  // Dates & time (timezone-explicit)
  // --------------------------------------------------------------------------
  const fmtCache = new Map();
  function dtf(key, tz, options) {
    const k = key + "|" + tz;
    if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: tz }, options)));
    return fmtCache.get(k);
  }

  function zoneParts(ms, tz) {
    const parts = {};
    dtf("parts", tz, {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }).formatToParts(ms).forEach(p => { parts[p.type] = p.value; });
    return parts;
  }

  /** "YYYY-MM-DD" of an instant as seen in `tz`. */
  function dateKey(ms, tz) {
    const p = zoneParts(ms, tz);
    return `${p.year}-${p.month}-${p.day}`;
  }

  /** Epoch ms for wall-clock `dateStr hh:mm` in `tz` (DST-safe, two-pass). */
  function zonedMs(dateStr, hh, mm, tz) {
    const d = parseDate(dateStr);
    const guess = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mm);
    const offsetOf = ms => {
      const p = zoneParts(ms, tz);
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms;
    };
    let result = guess - offsetOf(guess);
    result = guess - offsetOf(result);
    return result;
  }

  /** Strict ISO date parse (rejects 2026-02-30). Returns a UTC Date or null. */
  function parseDate(str) {
    if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
    const [y, m, d] = str.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    return date;
  }

  function isoOf(date) {
    return date.toISOString().slice(0, 10);
  }

  function addDays(str, n) {
    const d = parseDate(str);
    d.setUTCDate(d.getUTCDate() + n);
    return isoOf(d);
  }

  function diffDays(a, b) {
    return Math.round((parseDate(b) - parseDate(a)) / 86400000);
  }

  function weekday(str) {
    return parseDate(str).getUTCDay(); // 0 = Sunday
  }

  function holidayName(str) {
    return HOLIDAY_BY_DATE.get(str) || null;
  }

  function isWorkday(str) {
    const wd = weekday(str);
    return wd !== 0 && wd !== 6 && !HOLIDAY_BY_DATE.has(str);
  }

  /** Working days (Mon–Fri, excluding public holidays) in [start, end]. */
  function countWorkdays(start, end) {
    const s = parseDate(start), e = parseDate(end);
    if (!s || !e || s > e) return 0;
    let n = 0;
    for (let cur = start; cur <= end; cur = addDays(cur, 1)) if (isWorkday(cur)) n++;
    return n;
  }

  function nextWorkday(str) {
    let cur = str;
    while (!isWorkday(cur)) cur = addDays(cur, 1);
    return cur;
  }

  function formatTime(ms, tz) {
    if (ms == null) return "--:--";
    return dtf("time", tz, { hour: "2-digit", minute: "2-digit", hour12: true }).format(ms);
  }

  function formatClock(ms, tz) {
    return dtf("clock", tz, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(ms);
  }

  function formatDateLong(ms, tz) {
    return dtf("long", tz, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(ms);
  }

  function formatDateShort(ms, tz) {
    return dtf("short", tz, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(ms);
  }

  function formatDay(str) {
    return dtf("day", "UTC", { weekday: "short", month: "short", day: "numeric" }).format(parseDate(str));
  }

  function formatDuration(minutes) {
    const m = Math.max(0, Math.floor(minutes || 0));
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  }

  function validTimeZone(tz) {
    if (typeof tz !== "string" || !tz) return false;
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch (e) { return false; }
  }

  // --------------------------------------------------------------------------
  // Sanitising helpers
  // --------------------------------------------------------------------------
  function cleanText(value, max) {
    // Strip control characters, collapse whitespace, cap length.
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  /** RFC-4180 field, neutralising spreadsheet formula injection (=, +, -, @). */
  function csvField(val) {
    let s = String(val == null ? "" : val);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  let idCounter = 0;
  function genId(prefix, now) {
    idCounter = (idCounter + 1) % 1679616;
    const rand = Math.floor(Math.random() * 1679616);
    return `${prefix}-${now.toString(36)}${idCounter.toString(36)}${rand.toString(36)}`.toUpperCase();
  }

  const fail = (code, error) => ({ ok: false, code, error });
  const ok = (extra) => Object.assign({ ok: true }, extra || {});

  // --------------------------------------------------------------------------
  // State queries
  // --------------------------------------------------------------------------
  function emptyState() {
    return { version: 2, employees: [], attendance: [], leaves: [] };
  }

  function getEmployee(state, empId) {
    return state.employees.find(e => e.id === empId) || null;
  }

  function isOpen(rec) {
    return rec.checkOut == null && !rec.missed;
  }

  function openSession(state, empId) {
    for (let i = state.attendance.length - 1; i >= 0; i--) {
      const r = state.attendance[i];
      if (r.empId === empId && isOpen(r)) return r;
    }
    return null;
  }

  function breakMs(rec, now) {
    const end = rec.checkOut != null ? rec.checkOut : now;
    let ms = 0;
    for (const b of rec.breaks || []) {
      const bs = Math.max(b.start, rec.checkIn);
      const be = Math.min(b.end != null ? b.end : end, end);
      if (be > bs) ms += be - bs;
    }
    return ms;
  }

  function workedMs(rec, now) {
    if (rec.missed) return 0;
    const end = rec.checkOut != null ? rec.checkOut : now;
    return Math.max(0, Math.max(0, end - rec.checkIn) - breakMs(rec, now));
  }

  function breakMinutes(rec, now) {
    return Math.floor(breakMs(rec, now) / 60000);
  }

  function workedMinutes(rec, now) {
    return Math.floor(workedMs(rec, now) / 60000);
  }

  function approvedLeaves(state, empId) {
    return state.leaves.filter(l => l.empId === empId && l.status === "Approved");
  }

  function leaveOn(state, empId, date) {
    return approvedLeaves(state, empId).find(l => l.start <= date && date <= l.end) || null;
  }

  /** Approved leave days of `type` that start in calendar `year`. */
  function usedDays(state, empId, type, year) {
    return approvedLeaves(state, empId)
      .filter(l => l.type === type && l.start.slice(0, 4) === String(year))
      .reduce((sum, l) => sum + l.days, 0);
  }

  function quotaFor(emp, type) {
    const q = emp && emp.quota && emp.quota[LEAVE_TYPES[type].key];
    return Number.isFinite(q) && q >= 0 ? q : LEAVE_TYPES[type].quota;
  }

  function balances(state, empId, year) {
    const emp = getEmployee(state, empId);
    const out = {};
    for (const type of Object.keys(LEAVE_TYPES)) {
      const quota = quotaFor(emp, type);
      const used = usedDays(state, empId, type, year);
      out[type] = { quota, used, remaining: Math.max(0, quota - used) };
    }
    return out;
  }

  /**
   * Today's status for one employee, derived (never stored) so it can't go
   * stale at midnight. Precedence: an actual punch beats a scheduled leave.
   */
  function statusFor(state, empId, now, tz) {
    const today = dateKey(now, tz);
    const open = openSession(state, empId);
    if (open && open.date === today) {
      const onBreak = (open.breaks || []).some(b => b.end == null);
      return { code: open.mode === "Remote" ? "REMOTE" : "CHECKED_IN", onBreak, rec: open };
    }
    const todays = state.attendance.filter(r => r.empId === empId && r.date === today && r.checkOut != null);
    if (todays.length) return { code: "CHECKED_OUT", onBreak: false, rec: todays[todays.length - 1] };
    const leave = leaveOn(state, empId, today);
    if (leave) return { code: LEAVE_TYPES[leave.type].status, onBreak: false, leave };
    if (!isWorkday(today)) {
      return { code: "DAY_OFF", onBreak: false, note: holidayName(today) || "Weekend" };
    }
    return { code: "NOT_CHECKED_IN", onBreak: false };
  }

  /** One row per calendar day: first in, last out, total worked. */
  function dayAggregate(state, empId, date, now) {
    const recs = state.attendance.filter(r => r.empId === empId && r.date === date);
    if (!recs.length) return null;
    const last = recs[recs.length - 1];
    const worked = recs.reduce((s, r) => s + workedMinutes(r, now), 0);
    const brk = recs.reduce((s, r) => s + (r.missed ? 0 : breakMinutes(r, now)), 0);
    return {
      date,
      checkIn: recs[0].checkIn,
      checkOut: last.checkOut,
      mode: last.mode,
      workedMin: worked,
      breakMin: brk,
      missed: recs.some(r => r.missed),
      open: recs.some(isOpen)
    };
  }

  function history(state, empId, now, tz, limit) {
    const today = dateKey(now, tz);
    const dates = [...new Set(state.attendance.filter(r => r.empId === empId).map(r => r.date))]
      .filter(d => d <= today)
      .sort()
      .reverse()
      .slice(0, limit || 7);
    return dates.map(d => dayAggregate(state, empId, d, now));
  }

  function nextHoliday(today) {
    return PUBLIC_HOLIDAYS.find(h => h.date >= today) || null;
  }

  // --------------------------------------------------------------------------
  // Leave validation (shared by UI preview and the real mutation)
  // --------------------------------------------------------------------------
  function validateLeave(state, input, now, tz) {
    const emp = getEmployee(state, input.empId);
    if (!emp) return fail("NO_EMPLOYEE", "Unknown employee.");
    const meta = LEAVE_TYPES[input.type];
    if (!meta) return fail("BAD_TYPE", "Choose Medical, Emergency or Holiday.");
    if (!parseDate(input.start) || !parseDate(input.end)) return fail("BAD_DATE", "Enter valid start and end dates.");
    if (input.start > input.end) return fail("BAD_RANGE", "End date must be on or after the start date.");
    if (input.start.slice(0, 4) !== input.end.slice(0, 4)) {
      return fail("CROSS_YEAR", "A request cannot span two calendar years — please submit it as two requests.");
    }
    if (diffDays(input.start, input.end) + 1 > MAX_LEAVE_SPAN_DAYS) {
      return fail("TOO_LONG", `A single request cannot exceed ${MAX_LEAVE_SPAN_DAYS} calendar days.`);
    }
    const today = dateKey(now, tz);
    const earliest = addDays(today, -meta.backdateDays);
    if (input.start < earliest) {
      return fail("PAST_DATE", meta.backdateDays
        ? `${input.type} leave can be back-dated at most ${meta.backdateDays} days.`
        : `${input.type} leave must start today or later.`);
    }
    const days = countWorkdays(input.start, input.end);
    if (days === 0) return fail("NO_WORKDAYS", "That range has no working days (weekends and public holidays are excluded).");
    const clash = approvedLeaves(state, input.empId).find(l => input.start <= l.end && input.end >= l.start);
    if (clash) return fail("OVERLAP", `You already have ${clash.type} leave from ${clash.start} to ${clash.end}.`);
    const year = Number(input.start.slice(0, 4));
    const bal = balances(state, input.empId, year)[input.type];
    if (days > bal.remaining) {
      return fail("QUOTA", `${input.type} request needs ${days} working day(s) but you have ${bal.remaining} of ${bal.quota} left for ${year}.`);
    }
    return ok({ days, remaining: bal.remaining - days, quota: bal.quota });
  }

  // --------------------------------------------------------------------------
  // Mutations — every one returns {ok} or {ok:false, code, error}
  // --------------------------------------------------------------------------
  function applyAction(state, action, now, tz) {
    if (!action || typeof action !== "object") return fail("BAD_ACTION", "Malformed request.");
    switch (action.type) {
      case "checkin": return checkIn(state, action, now, tz);
      case "checkout": return checkOut(state, action, now, tz);
      case "break": return toggleBreak(state, action, now, tz);
      case "leave": return requestLeave(state, action, now, tz);
      case "cancelLeave": return cancelLeave(state, action, now, tz);
      case "addEmployee": return addEmployee(state, action);
      default: return fail("BAD_ACTION", "Unknown action.");
    }
  }

  function checkIn(state, a, now, tz) {
    const emp = getEmployee(state, a.empId);
    if (!emp) return fail("NO_EMPLOYEE", "Select who you are first.");
    const mode = WORK_MODES.includes(a.mode) ? a.mode : "Office";
    const today = dateKey(now, tz);
    const open = openSession(state, emp.id);
    if (open && open.date === today) return fail("ALREADY_IN", "You are already checked in.");
    const leave = leaveOn(state, emp.id, today);
    if (leave && !a.override) {
      return fail("LEAVE_CONFLICT", `You are on approved ${leave.type} leave today. Check in anyway?`);
    }
    // A session left open on an earlier day was never checked out: flag it.
    state.attendance.forEach(r => {
      if (r.empId === emp.id && isOpen(r) && r.date < today) r.missed = true;
    });
    state.attendance.push({
      id: genId("A", now), empId: emp.id, date: today, checkIn: now, checkOut: null,
      mode, breaks: [], overrodeLeave: Boolean(leave)
    });
    return ok({ message: `Checked in at ${formatTime(now, tz)} (${mode}).` });
  }

  function checkOut(state, a, now, tz) {
    const emp = getEmployee(state, a.empId);
    if (!emp) return fail("NO_EMPLOYEE", "Select who you are first.");
    const today = dateKey(now, tz);
    const open = openSession(state, emp.id);
    if (!open || open.date !== today) return fail("NOT_IN", "You are not checked in.");
    (open.breaks || []).forEach(b => { if (b.end == null) b.end = now; });
    open.checkOut = Math.max(now, open.checkIn);
    return ok({ message: `Checked out at ${formatTime(now, tz)}. Worked ${formatDuration(workedMinutes(open, now))}.` });
  }

  function toggleBreak(state, a, now, tz) {
    const emp = getEmployee(state, a.empId);
    if (!emp) return fail("NO_EMPLOYEE", "Select who you are first.");
    const open = openSession(state, emp.id);
    if (!open || open.date !== dateKey(now, tz)) return fail("NOT_IN", "Check in before taking a break.");
    open.breaks = open.breaks || [];
    const running = open.breaks.find(b => b.end == null);
    if (running) {
      running.end = Math.max(now, running.start);
      return ok({ message: "Welcome back — break ended.", onBreak: false });
    }
    open.breaks.push({ start: now, end: null });
    return ok({ message: "Break started.", onBreak: true });
  }

  function requestLeave(state, a, now, tz) {
    const input = {
      empId: a.empId, type: a.leaveType, start: a.start, end: a.end
    };
    const reason = cleanText(a.reason, 300);
    const contact = cleanText(a.contact, 120);
    if (reason.length < 3) return fail("NO_REASON", "Please give a short reason (at least 3 characters).");
    const check = validateLeave(state, input, now, tz);
    if (!check.ok) return check;
    state.leaves.unshift({
      id: genId("LR", now), empId: a.empId, type: a.leaveType, start: a.start, end: a.end,
      days: check.days, reason, contact, status: "Approved",
      appliedOn: dateKey(now, tz), appliedAt: now
    });
    return ok({ message: `${a.leaveType} leave booked for ${check.days} working day(s). ${check.remaining} remaining.` });
  }

  function cancelLeave(state, a, now, tz) {
    const leave = state.leaves.find(l => l.id === a.leaveId);
    if (!leave || leave.empId !== a.empId) return fail("NOT_FOUND", "Leave request not found.");
    if (leave.status !== "Approved") return fail("NOT_ACTIVE", "That request is already cancelled.");
    if (leave.start < dateKey(now, tz)) return fail("STARTED", "Leave that has already started cannot be cancelled.");
    leave.status = "Cancelled";
    leave.cancelledAt = now;
    return ok({ message: `${leave.type} leave cancelled; ${leave.days} day(s) returned to your balance.` });
  }

  function addEmployee(state, a) {
    const name = cleanText(a.name, 60);
    const role = cleanText(a.role, 60);
    const email = cleanText(a.email, 80).toLowerCase();
    const phone = cleanText(a.phone, 30);
    if (name.length < 2) return fail("BAD_NAME", "Enter the employee's full name.");
    if (role.length < 2) return fail("BAD_ROLE", "Enter a job title.");
    if (!DEPARTMENTS.includes(a.department)) return fail("BAD_DEPT", "Choose a department.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("BAD_EMAIL", "Enter a valid email address.");
    if (state.employees.some(e => e.email.toLowerCase() === email)) return fail("DUP_EMAIL", "An employee with that email already exists.");
    if (state.employees.length >= MAX_EMPLOYEES) return fail("FULL", "Employee limit reached.");
    const next = state.employees.reduce((m, e) => Math.max(m, Number(e.id.replace(/\D/g, "")) || 0), 100) + 1;
    state.employees.push({
      id: `EMP-${next}`, name, role, department: a.department, email, phone,
      quota: { holiday: 12, medical: 14, emergency: 7 }
    });
    return ok({ message: `${name} added to the directory.`, empId: `EMP-${next}` });
  }

  // --------------------------------------------------------------------------
  // Views — what is safe to broadcast to every viewer
  // --------------------------------------------------------------------------
  /**
   * Everything except free-text leave reasons / contacts (health & family data).
   * Pass {now, tz} to also window attendance to the last `ATTENDANCE_WINDOW_DAYS`,
   * so the payload (and per-render work) stays bounded as history accumulates.
   */
  const ATTENDANCE_WINDOW_DAYS = 45;
  function publicView(state, opts) {
    let attendance = state.attendance;
    if (opts && opts.now != null) {
      const cutoff = addDays(dateKey(opts.now, opts.tz), -ATTENDANCE_WINDOW_DAYS);
      attendance = attendance.filter(r => r.date >= cutoff);
    }
    return {
      version: state.version,
      employees: state.employees,
      attendance,
      leaves: state.leaves.map(l => {
        const { reason, contact, ...rest } = l; // eslint-disable-line no-unused-vars
        return rest;
      })
    };
  }

  /** Reason/contact for one employee's own leaves only. */
  function privateDetails(state, empId) {
    const out = {};
    state.leaves.filter(l => l.empId === empId).forEach(l => { out[l.id] = { reason: l.reason, contact: l.contact }; });
    return out;
  }

  // --------------------------------------------------------------------------
  // Demo data (relative to "today", so it never goes stale)
  // --------------------------------------------------------------------------
  function seedState(now, tz) {
    const state = emptyState();
    const people = [
      ["Aarav Sharma", "Senior Full-stack Engineer", "Engineering"],
      ["Ananya Iyer", "Lead Product Designer", "Design"],
      ["Rohan Mehta", "HR Operations Lead", "Human Resources"],
      ["Priya Nair", "Cloud DevOps Architect", "Engineering"],
      ["Vikram Singh", "Senior Growth Marketing Manager", "Marketing"],
      ["Neha Kulkarni", "VP of Product Strategy", "Product"],
      ["Arjun Reddy", "Operations & Logistics Manager", "Sales & Ops"],
      ["Kavya Menon", "Enterprise Support Specialist", "Sales & Ops"],
      ["Imran Qureshi", "QA Engineer", "Engineering"],
      ["Sneha Banerjee", "Content Strategist", "Marketing"]
    ];
    people.forEach(([name, role, department], i) => {
      const [first, last] = name.toLowerCase().split(" ");
      state.employees.push({
        id: `EMP-${101 + i}`, name, role, department,
        email: `${first}.${last}@pulseoffice.example`,
        phone: `+91 98100 ${String(10000 + i * 137).padStart(5, "0")}`,
        quota: { holiday: 12, medical: 14, emergency: 7 }
      });
    });

    const today = dateKey(now, tz);
    const anchor = nextWorkday(today);
    const lastWorkdays = [];
    for (let cur = addDays(today, -1); lastWorkdays.length < 5; cur = addDays(cur, -1)) {
      if (isWorkday(cur)) lastWorkdays.push(cur);
    }
    const addLeave = (empId, type, start, end, reason, contact, appliedOn) => {
      state.leaves.push({
        id: genId("LR", now), empId, type, start, end, days: countWorkdays(start, end),
        reason, contact, status: "Approved", appliedOn, appliedAt: now
      });
    };
    // Leave is placed on working days (n-th working day from a base) so every seeded
    // request is valid whatever today's date and however many holidays fall nearby.
    const wd = (base, n) => {
      let cur = nextWorkday(base);
      for (let i = 0; i < Math.abs(n); i++) {
        cur = addDays(cur, n < 0 ? -1 : 1);
        while (!isWorkday(cur)) cur = addDays(cur, n < 0 ? -1 : 1);
      }
      return cur;
    };
    const span = (from, len) => [from, wd(from, len - 1)];
    const pastStart = lastWorkdays[lastWorkdays.length - 1];
    addLeave("EMP-104", "Medical", ...span(anchor, 2), "Viral fever, rest advised", "", today);
    addLeave("EMP-106", "Emergency", ...span(anchor, 1), "Family emergency", "", today);
    addLeave("EMP-105", "Holiday", ...span(wd(anchor, 5), 5), "Family trip to Goa", "", addDays(today, -9));
    addLeave("EMP-103", "Holiday", ...span(wd(anchor, 15), 2), "Wedding in the family", "", addDays(today, -3));
    addLeave("EMP-109", "Holiday", ...span(wd(anchor, 9), 3), "Visiting family", "", addDays(today, -5));
    addLeave("EMP-101", "Medical", ...span(wd(pastStart, -12), 2), "Dental surgery", "", addDays(pastStart, -16));
    addLeave("EMP-102", "Holiday", ...span(wd(pastStart, -25), 4), "Design conference", "", addDays(pastStart, -45));
    state.leaves.sort((a, b) => b.start.localeCompare(a.start));

    const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
    state.employees.forEach(emp => {
      lastWorkdays.forEach(date => {
        if (leaveOn(state, emp.id, date)) return;
        const h = hash(emp.id + date);
        const inMin = 8 * 60 + 30 + (h % 50);                // 08:30–09:19
        const outMin = 17 * 60 + (h % 70);                   // 17:00–18:09
        const rec = {
          id: genId("A", now), empId: emp.id, date,
          checkIn: zonedMs(date, Math.floor(inMin / 60), inMin % 60, tz),
          checkOut: zonedMs(date, Math.floor(outMin / 60), outMin % 60, tz),
          mode: h % 4 === 0 ? "Remote" : "Office", breaks: []
        };
        const bs = rec.checkIn + 4 * 3600000 + (h % 30) * 60000;
        rec.breaks.push({ start: bs, end: bs + (30 + (h % 25)) * 60000 });
        state.attendance.push(rec);
      });
    });

    // Today: whoever is not on leave has (deterministically) either arrived already or not yet.
    // Only punches that are already in the past are created, so the demo is never "from the future".
    if (isWorkday(today)) {
      state.employees.forEach(emp => {
        const h = hash(emp.id + today);
        if (leaveOn(state, emp.id, today) || h % 5 === 0) return;
        const inMin = 8 * 60 + 30 + (h % 55);
        const checkIn = zonedMs(today, Math.floor(inMin / 60), inMin % 60, tz);
        if (checkIn > now - 5 * 60000) return;
        const outMin = 17 * 60 + 15 + (h % 60);
        const checkOut = zonedMs(today, Math.floor(outMin / 60), outMin % 60, tz);
        state.attendance.push({
          id: genId("A", now), empId: emp.id, date: today, checkIn,
          checkOut: checkOut < now ? checkOut : null,
          mode: h % 4 === 0 ? "Remote" : "Office", breaks: []
        });
      });
    }
    return state;
  }

  return {
    LEAVE_TYPES, DEPARTMENTS, WORK_MODES, PUBLIC_HOLIDAYS, MAX_LEAVE_SPAN_DAYS,
    dateKey, zonedMs, parseDate, addDays, diffDays, weekday, isWorkday, holidayName,
    countWorkdays, nextWorkday, formatTime, formatClock, formatDateLong, formatDateShort,
    formatDay, formatDuration, validTimeZone,
    cleanText, escapeHtml, csvField,
    emptyState, getEmployee, openSession, breakMinutes, workedMinutes, workedMs, leaveOn, usedDays,
    balances, statusFor, dayAggregate, history, nextHoliday,
    validateLeave, applyAction, publicView, privateDetails, seedState
  };
});
