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
    Medical: { key: "medical", quota: 14, status: "MEDICAL_LEAVE", backdateDays: 7 },
    Emergency: { key: "emergency", quota: 7, status: "EMERGENCY_LEAVE", backdateDays: 7 },
    Holiday: { key: "holiday", quota: 12, status: "HOLIDAY", backdateDays: 0 }
  };

  const WORK_MODES = ["Office", "Remote"];
  const MAX_LEAVE_SPAN_DAYS = 90;
  const MAX_EMPLOYEES = 500;
const MAX_PUNCHES_PER_DAY = 20;
const MAX_BREAKS_PER_SESSION = 50;
const MAX_LEAVES_PER_EMPLOYEE = 200;

  // Holidays live in the data (state.holidays) so an admin can add or remove them.
  // These are the BKR holidays for November 2026 to March 2027 that a fresh install starts with.
  const DEFAULT_HOLIDAYS = [
    { date: "2026-11-24", name: "Kartika Purnima" },
    { date: "2026-12-25", name: "Christmas" },
    { date: "2027-01-14", name: "Makar Sankranti" },
    { date: "2027-01-26", name: "Republic Day" },
    { date: "2027-03-06", name: "Maha Shivaratri" },
    { date: "2027-03-22", name: "Holi" }
  ];

  // The register the app keeps: months shown in the monthly register view.
  const REGISTER = {
    title: "BKR Attendance Register",
    year: "2026-27",
    months: ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]
  };
  const MAX_HOLIDAYS = 120;

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

  /** Date -> name lookup for a state's holidays (or a plain array of {date,name}). */
  function holidayMap(source) {
    const list = Array.isArray(source) ? source : (source && source.holidays) || [];
    return new Map(list.map(h => [h.date, h.name]));
  }

  function holidayName(str, hol) {
    return (hol && hol.get(str)) || null;
  }

  function isWorkday(str, hol) {
    const wd = weekday(str);
    return wd !== 0 && wd !== 6 && !(hol && hol.has(str));
  }

  /** Working days (Mon-Fri, excluding holidays) in [start, end]. */
  function countWorkdays(start, end, hol) {
    const s = parseDate(start), e = parseDate(end);
    if (!s || !e || s > e) return 0;
    let n = 0;
    for (let cur = start; cur <= end; cur = addDays(cur, 1)) if (isWorkday(cur, hol)) n++;
    return n;
  }

  function nextWorkday(str, hol) {
    let cur = str;
    while (!isWorkday(cur, hol)) cur = addDays(cur, 1);
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
    return { version: 3, employees: [], attendance: [], leaves: [], holidays: [] };
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
    const hol = holidayMap(state);
    if (!isWorkday(today, hol)) {
      return { code: "DAY_OFF", onBreak: false, note: holidayName(today, hol) || "Weekend" };
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

  function nextHoliday(state, today) {
    return [...(state.holidays || [])].sort((a, b) => a.date.localeCompare(b.date)).find(h => h.date >= today) || null;
  }

  /** Active on `date`: joined on or before it and not yet past the last working day. */
  function isActive(emp, date) {
    return Boolean(emp) && (!emp.joinDate || emp.joinDate <= date) && (!emp.leftOn || date <= emp.leftOn);
  }

  function activeEmployees(state, date) {
    return state.employees.filter(e => isActive(e, date));
  }

  function adminsOn(state, date) {
    return state.employees.filter(e => e.isAdmin && isActive(e, date));
  }

  // --------------------------------------------------------------------------
  // Leave validation (shared by UI preview and the real mutation)
  // --------------------------------------------------------------------------
  function validateLeave(state, input, now, tz) {
    const emp = getEmployee(state, input.empId);
    if (!emp) return fail("NO_EMPLOYEE", "Unknown employee.");
    const meta = Object.prototype.hasOwnProperty.call(LEAVE_TYPES, input.type) ? LEAVE_TYPES[input.type] : null;
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
    const days = countWorkdays(input.start, input.end, holidayMap(state));
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
  const ADMIN_ACTIONS = new Set(["addEmployee", "removeEmployee", "reinstateEmployee", "setAdmin", "addHoliday", "removeHoliday"]);

  function applyAction(state, action, now, tz) {
    if (!action || typeof action !== "object") return fail("BAD_ACTION", "Malformed request.");
    const actor = getEmployee(state, action.empId);
    if (!actor) return fail("NO_EMPLOYEE", "Select who you are first.");
    const today = dateKey(now, tz);
    if (!isActive(actor, today)) return fail("INACTIVE", "This profile is not active.");
    if (typeof action.type === "string" && ADMIN_ACTIONS.has(action.type) && !actor.isAdmin) {
      return fail("FORBIDDEN", "Only an admin can do that.");
    }
    switch (action.type) {
      case "checkin": return checkIn(state, action, now, tz);
      case "checkout": return checkOut(state, action, now, tz);
      case "break": return toggleBreak(state, action, now, tz);
      case "leave": return requestLeave(state, action, now, tz);
      case "cancelLeave": return cancelLeave(state, action, now, tz);
      case "addEmployee": return addEmployee(state, action, today);
      case "removeEmployee": return removeEmployee(state, action, today);
      case "reinstateEmployee": return reinstateEmployee(state, action);
      case "setAdmin": return setAdmin(state, action, today);
      case "addHoliday": return addHoliday(state, action);
      case "removeHoliday": return removeHoliday(state, action);
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
    if (state.attendance.filter(r => r.empId === emp.id && r.date === today).length >= MAX_PUNCHES_PER_DAY) {
      return fail("TOO_MANY", `At most ${MAX_PUNCHES_PER_DAY} check-ins are recorded per day.`);
    }
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
    if (open.breaks.length >= MAX_BREAKS_PER_SESSION) return fail("TOO_MANY", "Too many breaks in one session.");
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
    if (state.leaves.filter(l => l.empId === a.empId).length >= MAX_LEAVES_PER_EMPLOYEE) {
      return fail("TOO_MANY", "Leave history limit reached for this employee.");
    }
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

  function addEmployee(state, a, today) {
    const name = cleanText(a.name, 60);
    const role = cleanText(a.role, 60);
    const email = cleanText(a.email, 80).toLowerCase();
    const phone = cleanText(a.phone, 30);
    const joinDate = a.joinDate ? String(a.joinDate) : today;
    if (name.length < 2) return fail("BAD_NAME", "Enter the employee's full name.");
    if (role.length < 2) return fail("BAD_ROLE", "Enter a designation.");
    if (!parseDate(joinDate)) return fail("BAD_DATE", "Enter a valid joining date.");
    if (joinDate > addDays(today, 366) || joinDate < "2000-01-01") return fail("BAD_DATE", "Joining date is out of range.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("BAD_EMAIL", "Enter a valid email address, or leave it empty.");
    if (email && state.employees.some(e => (e.email || "").toLowerCase() === email)) return fail("DUP_EMAIL", "An employee with that email already exists.");
    if (state.employees.some(e => e.name.toLowerCase() === name.toLowerCase() && (!e.leftOn || e.leftOn >= today))) return fail("DUP_NAME", "An active employee with that name already exists.");
    if (state.employees.length >= MAX_EMPLOYEES) return fail("FULL", "Employee limit reached.");
    const next = state.employees.reduce((m, e) => Math.max(m, Number(e.id.replace(/\D/g, "")) || 0), 100) + 1;
    state.employees.push({
      id: `EMP-${next}`, name, role, email, phone, joinDate, isAdmin: a.isAdmin === true,
      quota: { holiday: 12, medical: 14, emergency: 7 }
    });
    return ok({ message: `${name} added to the register (joined ${joinDate}).`, empId: `EMP-${next}` });
  }

  function removeEmployee(state, a, today) {
    const target = getEmployee(state, a.targetId);
    if (!target) return fail("NOT_FOUND", "Employee not found.");
    if (target.leftOn && target.leftOn <= today) return fail("ALREADY_LEFT", `${target.name} has already left.`);
    const lastDay = a.lastDay ? String(a.lastDay) : today;
    if (!parseDate(lastDay)) return fail("BAD_DATE", "Enter a valid last working day.");
    if (target.joinDate && lastDay < target.joinDate) return fail("BAD_DATE", "Last working day is before the joining date.");
    if (lastDay > addDays(today, 366)) return fail("BAD_DATE", "Last working day is too far ahead.");
    if (target.isAdmin && adminsOn(state, today).filter(e => e.id !== target.id).length === 0) {
      return fail("LAST_ADMIN", "Make someone else an admin before removing the last admin.");
    }
    target.leftOn = lastDay;
    // Leave booked for after the last day no longer applies.
    let cancelled = 0;
    state.leaves.forEach(l => {
      if (l.empId === target.id && l.status === "Approved" && l.start > lastDay) { l.status = "Cancelled"; cancelled++; }
    });
    return ok({ message: `${target.name} marked as left (last working day ${lastDay}).${cancelled ? ` ${cancelled} later leave request(s) cancelled.` : ""}` });
  }

  function reinstateEmployee(state, a) {
    const target = getEmployee(state, a.targetId);
    if (!target) return fail("NOT_FOUND", "Employee not found.");
    if (!target.leftOn) return fail("NOT_LEFT", `${target.name} is already active.`);
    delete target.leftOn;
    return ok({ message: `${target.name} is active again.` });
  }

  function setAdmin(state, a, today) {
    const target = getEmployee(state, a.targetId);
    if (!target) return fail("NOT_FOUND", "Employee not found.");
    const makeAdmin = a.isAdmin === true;
    if (!makeAdmin && target.isAdmin && adminsOn(state, today).filter(e => e.id !== target.id).length === 0) {
      return fail("LAST_ADMIN", "There must be at least one admin.");
    }
    target.isAdmin = makeAdmin;
    return ok({ message: makeAdmin ? `${target.name} is now an admin.` : `${target.name} is no longer an admin.` });
  }

  function addHoliday(state, a) {
    const name = cleanText(a.name, 60);
    const date = String(a.date || "");
    state.holidays = state.holidays || [];
    if (!parseDate(date) || date < "2000-01-01" || date > "2100-12-31") return fail("BAD_DATE", "Enter a valid date.");
    if (name.length < 2) return fail("BAD_NAME", "Enter the holiday's name.");
    if (state.holidays.some(h => h.date === date)) return fail("DUP_HOLIDAY", `${date} is already a holiday (${holidayName(date, holidayMap(state))}).`);
    if (state.holidays.length >= MAX_HOLIDAYS) return fail("FULL", "Holiday limit reached.");
    state.holidays.push({ date, name });
    state.holidays.sort((x, y) => x.date.localeCompare(y.date));
    return ok({ message: `${name} added on ${date}.` });
  }

  function removeHoliday(state, a) {
    const date = String(a.date || "");
    const i = (state.holidays || []).findIndex(h => h.date === date);
    if (i === -1) return fail("NOT_FOUND", "That holiday is not in the list.");
    const [gone] = state.holidays.splice(i, 1);
    return ok({ message: `${gone.name} (${date}) removed.` });
  }

  // --------------------------------------------------------------------------
  // Views — what is safe to broadcast to every viewer
  // --------------------------------------------------------------------------
  /**
   * Everything except free-text leave reasons / contacts (health & family data).
   * Pass {now, tz} to also window attendance to the last `ATTENDANCE_WINDOW_DAYS`,
   * so the payload (and per-render work) stays bounded as history accumulates.
   */
  const ATTENDANCE_WINDOW_DAYS = 200;
  function publicView(state, opts) {
    let attendance = state.attendance;
    if (opts && opts.now != null) {
      const cutoff = addDays(dateKey(opts.now, opts.tz), -ATTENDANCE_WINDOW_DAYS);
      attendance = attendance.filter(r => r.date >= cutoff);
    }
    return {
      version: state.version,
      employees: state.employees,
      holidays: state.holidays || [],
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
  // Monthly register
  // --------------------------------------------------------------------------
  /**
   * One month of the register. Cell codes:
   *   P present (office)  R present (remote)  A absent  ML/EL/HL medical/emergency/holiday leave
   *   H public holiday    W weekly off        ""  not yet / not employed
   */
  function registerMonth(state, month, now, tz) {
    const first = `${month}-01`;
    if (!/^\d{4}-\d{2}$/.test(month) || !parseDate(first)) return null;
    const last = isoOf(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)));
    const today = dateKey(now, tz);
    const hol = holidayMap(state);
    const days = [];
    for (let d = first; d <= last; d = addDays(d, 1)) {
      days.push({ date: d, day: Number(d.slice(8)), dow: weekday(d), off: hol.has(d) ? "H" : (weekday(d) === 0 || weekday(d) === 6 ? "W" : null), holiday: hol.get(d) || null });
    }
    const rows = state.employees
      .filter(e => (!e.joinDate || e.joinDate <= last) && (!e.leftOn || e.leftOn >= first))
      .map(emp => {
        const totals = { P: 0, R: 0, A: 0, ML: 0, EL: 0, HL: 0 };
        const cells = days.map(day => {
          if (!isActive(emp, day.date)) return "";
          const recs = state.attendance.filter(r => r.empId === emp.id && r.date === day.date); // a forgotten check-out still counts as present
          if (recs.length) {
            const code = recs.every(r => r.mode === "Remote") ? "R" : "P";
            totals[code]++;
            return code;
          }
          if (day.off) return day.off;
          const leave = leaveOn(state, emp.id, day.date);
          if (leave) {
            const code = { Medical: "ML", Emergency: "EL", Holiday: "HL" }[leave.type];
            totals[code]++;
            return code;
          }
          if (day.date < today) { totals.A++; return "A"; }
          return "";
        });
        return { emp, cells, totals };
      });
    return { month, first, last, days, rows };
  }

  // --------------------------------------------------------------------------
  // Fresh install and upgrades
  // --------------------------------------------------------------------------
  /** The BKR roster. Bibhu is the first admin. */
  function seedState() {
    const state = emptyState();
    const people = [
      ["Bibhu P. Dash", "Admin", true],
      ["Pradyumna Sahoo", "Co-Ordinator \u2013 Programs", false],
      ["Abhijit Nayak", "Research Assistant", false],
      ["Poonam Das", "Associate Scientist", false],
      ["Priyadarsani Barik", "Research Assistant", false],
      ["Dinabandhu Behera", "Driver", false],
      ["Baidyanath Sing", "Field Coordinator", false]
    ];
    people.forEach(([name, role, isAdmin], i) => {
      state.employees.push({
        id: `EMP-${101 + i}`, name, role, email: "", phone: "", joinDate: "2026-04-01", isAdmin,
        quota: { holiday: 12, medical: 14, emergency: 7 }
      });
    });
    state.holidays = DEFAULT_HOLIDAYS.map(h => Object.assign({}, h));
    return state;
  }

  /** Brings older saved data up to the current shape (safe to call on every load). */
  function migrate(state) {
    state.version = 3;
    state.holidays = Array.isArray(state.holidays) ? state.holidays : DEFAULT_HOLIDAYS.map(h => Object.assign({}, h));
    if (!state.employees.some(e => e.isAdmin) && state.employees.length) state.employees[0].isAdmin = true;
    return state;
  }

  return {
    LEAVE_TYPES, WORK_MODES, REGISTER, DEFAULT_HOLIDAYS, MAX_LEAVE_SPAN_DAYS,
    dateKey, zonedMs, parseDate, addDays, diffDays, weekday, isWorkday, holidayName, holidayMap,
    countWorkdays, nextWorkday, formatTime, formatClock, formatDateLong, formatDateShort,
    formatDay, formatDuration, validTimeZone,
    cleanText, escapeHtml, csvField,
    emptyState, getEmployee, isActive, activeEmployees, adminsOn, openSession, breakMinutes, workedMinutes, workedMs,
    leaveOn, usedDays, balances, statusFor, dayAggregate, history, nextHoliday, registerMonth,
    validateLeave, applyAction, publicView, privateDetails, seedState, migrate
  };
});
