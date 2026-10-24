/**
 * BKR Attendance Register — browser UI.
 *
 * All business rules live in core.js. This file only renders state and sends
 * actions to a store. Two stores share one interface:
 *   RemoteStore — talks to server.js so the whole office sees the same data.
 *   LocalStore  — falls back to this browser's localStorage (demo / offline).
 */
(function () {
  "use strict";

  const C = window.AttendanceCore;
  const esc = C.escapeHtml;
  const $ = id => document.getElementById(id);

  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* private mode */ } },
    del(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  };

  // ==========================================================================
  // Stores
  // ==========================================================================
  class RemoteStore {
    constructor() {
      this.mode = "shared";
      this.token = storage.get("pulse_token") || "";
    }

    headers() {
      return Object.assign({ "Content-Type": "application/json" }, this.token ? { Authorization: "Bearer " + this.token } : {});
    }

    pack(j) {
      if (this.token && !j.me) this.setToken(""); // the server no longer knows this session
      return { state: j.state, mine: j.mine || {}, tz: j.tz, skew: j.now - Date.now(), me: j.me || "", claimed: j.claimed || [] };
    }

    setToken(token) {
      this.token = token;
      if (token) storage.set("pulse_token", token); else storage.del("pulse_token");
    }

    async load() {
      const r = await fetch("/api/state", { cache: "no-store", headers: this.token ? { Authorization: "Bearer " + this.token } : {} });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return this.pack(await r.json());
    }

    /** Retries network failures with backoff; the request id lets the server ignore duplicates. */
    async send(url, init) {
      const delays = [400, 1200, 2500];
      for (let attempt = 0; ; attempt++) {
        try {
          return await fetch(url, init);
        } catch (err) {
          if (attempt >= delays.length) throw err;
          await new Promise(r => setTimeout(r, delays[attempt]));
        }
      }
    }

    async act(action) {
      const requestId = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");
      const r = await this.send("/api/action", { method: "POST", headers: this.headers(), body: JSON.stringify(Object.assign({}, action, { requestId })) });
      const j = await r.json().catch(() => ({ ok: false, error: "Unexpected server response." }));
      if (r.status === 401) this.setToken("");
      return { result: j, view: j.view ? this.pack(j.view) : null };
    }

    async login(empId, pin) {
      const r = await this.send("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empId, pin }) });
      const j = await r.json().catch(() => ({ ok: false, error: "Unexpected server response." }));
      if (j.ok) this.setToken(j.token);
      return j;
    }

    async resetPin(targetId) {
      const r = await this.send("/api/reset-pin", { method: "POST", headers: this.headers(), body: JSON.stringify({ targetId }) });
      return r.json().catch(() => ({ ok: false, error: "Unexpected server response." }));
    }

    async logout() {
      try { await fetch("/api/logout", { method: "POST", headers: this.headers(), body: "{}" }); } catch (e) { /* offline: still forget the token */ }
      this.setToken("");
    }
  }

  class LocalStore {
    constructor() {
      this.mode = "local";
      this.tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      this.data = this.read() || this.seed();
    }

    read() {
      try {
        const d = JSON.parse(storage.get("pulse_v2"));
        if (d && Array.isArray(d.employees) && Array.isArray(d.attendance) && Array.isArray(d.leaves)) return C.migrate(d);
      } catch (e) { /* fall through to seed */ }
      return null;
    }

    seed() {
      const d = C.seedState();
      storage.set("pulse_v2", JSON.stringify(d));
      return d;
    }

    view(me) {
      return {
        state: C.publicView(this.data, { now: Date.now(), tz: this.tz }),
        mine: me && C.getEmployee(this.data, me) ? C.privateDetails(this.data, me) : {},
        tz: this.tz,
        skew: 0,
        me: me && C.getEmployee(this.data, me) ? me : "",
        claimed: []
      };
    }

    async load() {
      this.data = this.read() || this.data; // pick up edits from other tabs
      return this.view(storage.get("pulse_me") || "");
    }

    async act(action) {
      this.data = this.read() || this.data;
      const result = C.applyAction(this.data, action, Date.now(), this.tz);
      if (result.ok) storage.set("pulse_v2", JSON.stringify(this.data));
      return { result, view: this.view(action.empId) };
    }

    reset() {
      storage.del("pulse_v2");
      this.data = this.seed();
    }
  }

  async function chooseStore() {
    if (location.protocol !== "file:") {
      try {
        const r = await fetch("/api/state", { cache: "no-store" });
        if (r.ok && (r.headers.get("content-type") || "").includes("json")) return new RemoteStore();
      } catch (e) { /* no server: use local mode */ }
    }
    return new LocalStore();
  }

  // ==========================================================================
  // Presentation helpers
  // ==========================================================================
  function avatarFor(emp) {
    const words = emp.name.trim().split(/\s+/).filter(Boolean);
    const firstGrapheme = w => (window.Intl && Intl.Segmenter ? [...new Intl.Segmenter().segment(w)][0].segment : [...w][0]) || "";
    const initials = (words.length > 1 ? [words[0], words[words.length - 1]] : words).map(w => firstGrapheme(w).toUpperCase()).join("") || "?";
    let h = 0;
    for (const ch of emp.id) h = (h * 31 + ch.charCodeAt(0)) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${h},55%,38%)"/>` +
      `<text x="32" y="40" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#fff" text-anchor="middle">${esc(initials)}</text></svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  const STATUS_UI = {
    CHECKED_IN: { cls: "badge-in-office", label: "In office" },
    REMOTE: { cls: "badge-remote", label: "Remote" },
    CHECKED_OUT: { cls: "badge-checked-out", label: "Checked out" },
    MEDICAL_LEAVE: { cls: "badge-medical", label: "Medical leave" },
    EMERGENCY_LEAVE: { cls: "badge-emergency", label: "Emergency leave" },
    HOLIDAY: { cls: "badge-holiday", label: "On holiday" },
    DAY_OFF: { cls: "badge-not-checked", label: "Day off" },
    NOT_CHECKED_IN: { cls: "badge-not-checked", label: "Not checked in" }
  };

  const TYPE_UI = {
    Medical: { cls: "badge-medical" },
    Emergency: { cls: "badge-emergency" },
    Holiday: { cls: "badge-holiday" }
  };

  const isPresent = code => code === "CHECKED_IN" || code === "REMOTE";

  // ==========================================================================
  // Application
  // ==========================================================================
  class App {
    constructor() {
      this.store = null;
      this.view = { state: C.emptyState(), mine: {}, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, skew: 0 };
      this.me = "";
      this.theme = "light";
      this.sound = storage.get("pulse_sound") !== "off";
      this.audio = null;
      this.leaveFilter = "ALL";
      this.ticks = 0;
      this.busy = false;
      this.offline = false;
      this.lastFocus = null;
      this.employeeSignature = "";
    }

    // ---- bootstrap ---------------------------------------------------------
    async init() {
      this.initTheme();
      this.populateStaticSelects();
      this.bindEvents();
      this.tick();
      this.store = await chooseStore();
      $("reset-data-btn").hidden = this.store.mode !== "local";
      await this.refresh();
      this.offerFirstLogin();
      setInterval(() => this.tick(), 1000);
      setInterval(() => this.refresh(), 10000);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) this.refresh(); });
      window.addEventListener("storage", e => { if (e.key === "pulse_v2") this.refresh(); });
    }

    /** Fresh install: nobody has signed in yet, so start with the first account (Bibhu). */
    offerFirstLogin() {
      const first = this.state.employees[0];
      if (!first || this.me) return;
      if (this.store.mode === "local") {
        if (!storage.get("pulse_me")) { storage.set("pulse_me", first.id); this.refresh(); }
      } else if (this.view.claimed.length === 0) {
        this.openAuth(first.id);
      }
    }

    get state() { return this.view.state; }
    get tz() { return this.view.tz; }
    now() { return Date.now() + (this.view.skew || 0); }
    today() { return C.dateKey(this.now(), this.tz); }
    staff() { return C.activeEmployees(this.state, this.today()); }
    isAdmin() { const e = this.currentEmployee(); return Boolean(e && e.isAdmin); }
    holidays() { return C.holidayMap(this.state); }

    currentEmployee() { return this.me ? C.getEmployee(this.state, this.me) : null; }

    async refresh() {
      try {
        this.view = await this.store.load();
        this.me = this.view.me || "";
        this.offline = false;
        this.lastSync = Date.now();
      } catch (e) {
        this.offline = true;
      }
      this.renderAll();
    }

    async perform(action) {
      if (this.busy) return { ok: false, error: "Please wait…" };
      if (!this.me) {
        this.toast("Select who you are in the header first.", "warning");
        return { ok: false, error: "No identity selected." };
      }
      this.busy = true;
      try {
        action.empId = this.me; // advisory only: a shared server acts as the signed-in session
        const { result, view } = await this.store.act(action);
        if (view) { this.view = view; this.me = view.me || ""; }
        this.offline = false;
        if (result.code === "AUTH") { this.me = ""; this.toast("Your session ended. Please sign in again.", "warning"); }
        this.renderAll();
        return result;
      } catch (e) {
        this.offline = true;
        this.renderAll();
        const result = { ok: false, error: "Can't reach the server. Check that it is still running (npm start), then try again. Your entries are kept." };
        this.toast(result.error, "danger");
        return result;
      } finally {
        this.busy = false;
      }
    }

    // ---- theme / sound -----------------------------------------------------
    initTheme() {
      const stored = storage.get("pulse_theme");
      const prefersDark = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
      this.applyTheme(stored || (prefersDark ? "dark" : "light"), false);
      this.renderSoundButton();
    }

    applyTheme(theme, remember) {
      this.theme = theme;
      document.documentElement.setAttribute("data-theme", theme);
      if (remember) storage.set("pulse_theme", theme);
      $("theme-label").textContent = theme === "dark" ? "Light mode" : "Dark mode";
    }

    renderSoundButton() {
      $("sound-icon").textContent = this.sound ? "Sound on" : "Sound off";
      $("sound-toggle-btn").setAttribute("aria-pressed", String(this.sound));
      $("sound-toggle-btn").setAttribute("aria-label", this.sound ? "Sound on" : "Sound off");
    }

    chime(kind) {
      if (!this.sound) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!this.audio) this.audio = new Ctx();
        if (this.audio.state === "suspended") this.audio.resume();
        const t = this.audio.currentTime;
        const osc = this.audio.createOscillator();
        const gain = this.audio.createGain();
        osc.connect(gain); gain.connect(this.audio.destination);
        const notes = kind === "out" ? [659.25, 523.25, 392] : [523.25, 659.25, 783.99];
        notes.forEach((f, i) => osc.frequency.setValueAtTime(f, t + i * 0.1));
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
        osc.start(t); osc.stop(t + 0.4);
      } catch (e) { /* audio is optional */ }
    }

    // ---- events ------------------------------------------------------------
    bindEvents() {
      const tabs = [...document.querySelectorAll(".nav-tab")];
      tabs.forEach((btn, i) => {
        btn.addEventListener("click", () => this.showTab(btn.dataset.tab));
        btn.addEventListener("keydown", e => {
          const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          const next = tabs[(i + dir + tabs.length) % tabs.length];
          next.focus();
          this.showTab(next.dataset.tab);
        });
      });
      $("link-view-all-leaves").addEventListener("click", () => this.showTab("leave-tracker"));

      $("employee-switcher-select").addEventListener("change", e => this.chooseIdentity(e.target.value));
      $("auth-form").addEventListener("submit", e => this.submitAuth(e));
      $("auth-cancel-btn").addEventListener("click", () => this.closeModal($("auth-modal")));
      $("auth-modal-close").addEventListener("click", () => this.closeModal($("auth-modal")));

      $("theme-toggle-btn").addEventListener("click", () => this.applyTheme(this.theme === "light" ? "dark" : "light", true));
      $("sound-toggle-btn").addEventListener("click", () => {
        this.sound = !this.sound;
        storage.set("pulse_sound", this.sound ? "on" : "off");
        this.renderSoundButton();
      });

      $("reset-data-btn").addEventListener("click", async () => {
        if (!this.store || this.store.mode !== "local") return;
        if (!confirm("Reset the demo data stored in this browser?")) return;
        this.store.reset();
        await this.refresh();
        this.toast("Demo data reset.", "success");
      });

      $("btn-check-in").addEventListener("click", () => this.checkIn());
      $("btn-check-out").addEventListener("click", async () => {
        const r = await this.perform({ type: "checkout" });
        this.report(r, "out");
      });
      $("btn-break-toggle").addEventListener("click", async () => {
        const r = await this.perform({ type: "break" });
        this.report(r, "break");
      });

      $("btn-quick-apply-leave").addEventListener("click", () => this.openLeaveModal());
      $("btn-plan-holiday-btn").addEventListener("click", () => this.openLeaveModal("Holiday"));
      document.querySelectorAll(".btn-apply-specific").forEach(btn =>
        btn.addEventListener("click", () => this.openLeaveModal(btn.dataset.type)));

      ["leave-start-date", "leave-end-date", "leave-type-select"].forEach(id =>
        $(id).addEventListener("change", () => this.updateLeavePreview()));
      $("leave-application-form").addEventListener("submit", e => this.submitLeave(e));
      $("modal-close-btn").addEventListener("click", () => this.closeModal($("leave-modal")));
      $("modal-cancel-btn").addEventListener("click", () => this.closeModal($("leave-modal")));

      const redrawBoard = () => { this.renderTeamDirectory(); this.labelTableCells(); };
      $("directory-search-input").addEventListener("input", redrawBoard);
      $("status-filter").addEventListener("change", redrawBoard);
      $("btn-export-attendance").addEventListener("click", () => this.exportCsv());
      $("btn-add-employee").addEventListener("click", () => this.openEmployeeModal());
      $("employee-form").addEventListener("submit", e => this.submitEmployee(e));
      $("leaver-form").addEventListener("submit", e => this.submitLeaver(e));
      $("leaver-modal-close").addEventListener("click", () => this.closeModal($("leaver-modal")));
      $("leaver-cancel-btn").addEventListener("click", () => this.closeModal($("leaver-modal")));
      $("holiday-form").addEventListener("submit", e => this.submitHoliday(e));
      $("register-month").addEventListener("change", e => { this.registerMonth = e.target.value; this.renderRegister(); });
      $("btn-export-register").addEventListener("click", () => this.exportRegister());
      $("employee-modal-close").addEventListener("click", () => this.closeModal($("employee-modal")));
      $("employee-cancel-btn").addEventListener("click", () => this.closeModal($("employee-modal")));

      document.querySelectorAll(".filter-chip").forEach(chip => chip.addEventListener("click", () => {
        this.leaveFilter = chip.dataset.leaveFilter;
        document.querySelectorAll(".filter-chip").forEach(c => {
          c.classList.toggle("active", c === chip);
          c.setAttribute("aria-pressed", String(c === chip));
        });
        this.renderLeaveLog();
        this.labelTableCells();
      }));

      // Delegated row actions (no inline handlers, so a strict CSP works).
      document.addEventListener("click", async e => {
        const inspect = e.target.closest("[data-inspect]");
        if (inspect) { this.inspectColleague(inspect.dataset.inspect); return; }
        const adminBtn = e.target.closest("[data-admin]");
        if (adminBtn) { this.adminPersonAction(adminBtn.dataset.admin, adminBtn.dataset.id); return; }
        const rmHoliday = e.target.closest("[data-remove-holiday]");
        if (rmHoliday) {
          if (!confirm(`Remove the holiday on ${rmHoliday.dataset.removeHoliday}?`)) return;
          this.report(await this.perform({ type: "removeHoliday", date: rmHoliday.dataset.removeHoliday }), "break");
          return;
        }
        const cancel = e.target.closest("[data-cancel-leave]");
        if (cancel) {
          if (!confirm("Cancel this leave request? The days return to your balance.")) return;
          this.report(await this.perform({ type: "cancelLeave", leaveId: cancel.dataset.cancelLeave }), "break");
        }
      });

      const colModal = $("colleague-modal");
      $("colleague-modal-close").addEventListener("click", () => this.closeModal(colModal));
      $("colleague-modal-close-btn").addEventListener("click", () => this.closeModal(colModal));
      document.querySelectorAll(".modal-backdrop").forEach(m =>
        m.addEventListener("mousedown", e => { if (e.target === m) this.closeModal(m); }));

      document.addEventListener("keydown", e => this.onKeydown(e));
    }

    // ---- identity ----------------------------------------------------------
    async chooseIdentity(empId) {
      const sel = $("employee-switcher-select");
      if (!empId) {                       // "sign out"
        if (this.store.mode === "shared") await this.store.logout(); else storage.del("pulse_me");
        this.me = "";
        await this.refresh();
        return;
      }
      if (this.store.mode === "local") {  // demo mode: no accounts, just a picker
        storage.set("pulse_me", empId);
        await this.refresh();
        const emp = this.currentEmployee();
        if (emp) this.toast(`Viewing as ${emp.name}.`, "success");
        return;
      }
      sel.value = this.me;                // stay on the current user until the PIN is accepted
      this.openAuth(empId);
    }

    openAuth(empId) {
      const emp = C.getEmployee(this.state, empId);
      if (!emp) return;
      const claimed = this.view.claimed.includes(empId);
      this.authTarget = empId;
      $("auth-title").textContent = claimed ? `Sign in as ${emp.name}` : `Set up ${emp.name}'s profile`;
      $("auth-help").textContent = claimed
        ? "Enter your PIN."
        : "Choose a PIN of 6 or more characters. Only you will be able to punch in and see your private leave notes with it.";
      $("auth-confirm-group").hidden = claimed;
      $("auth-pin").autocomplete = claimed ? "current-password" : "new-password";
      $("auth-submit").textContent = claimed ? "Sign in" : "Save PIN and sign in";
      $("auth-forgot").hidden = !claimed;
      $("auth-forgot-cmd").textContent = `npm run reset-pin -- ${empId}`;
      $("auth-form").reset();
      $("auth-error").hidden = true;
      this.openModal($("auth-modal"), $("auth-pin"));
    }

    async submitAuth(e) {
      e.preventDefault();
      const empId = this.authTarget;
      const claimed = this.view.claimed.includes(empId);
      const pin = $("auth-pin").value;
      const err = $("auth-error");
      const fail = msg => { err.textContent = msg; err.hidden = false; };
      if (pin.length < 6) return fail("Use at least 6 characters.");
      if (!claimed && pin !== $("auth-pin2").value) return fail("The two PINs do not match.");
      $("auth-submit").disabled = true;
      try {
        const r = await this.store.login(empId, pin);
        if (!r.ok) return fail(r.error || "Could not sign in.");
        this.closeModal($("auth-modal"));
        await this.refresh();
        const emp = this.currentEmployee();
        if (emp) this.toast(r.created ? `Welcome, ${emp.name}. Your PIN is saved.` : `Signed in as ${emp.name}.`, "success");
      } catch (e2) {
        fail("Can't reach the server. Check that it is still running, then try again.");
      } finally {
        $("auth-submit").disabled = false;
        $("auth-form").reset();
      }
    }

    showTab(name) {
      document.querySelectorAll(".nav-tab").forEach(b => {
        const active = b.dataset.tab === name;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", String(active));
        b.tabIndex = active ? 0 : -1;
      });
      document.querySelectorAll(".tab-panel").forEach(p => {
        const active = p.id === "tab-" + name;
        p.classList.toggle("active", active);
        p.hidden = !active;
      });
    }

    // ---- modals ------------------------------------------------------------
    openModal(modal, focusEl) {
      this.lastFocus = document.activeElement;
      modal.classList.add("open");
      document.body.classList.add("modal-open");
      const target = focusEl || modal.querySelector("input, select, textarea, button:not(.modal-close-btn)");
      if (target) target.focus();
    }

    closeModal(modal) {
      modal.classList.remove("open");
      if (!document.querySelector(".modal-backdrop.open")) document.body.classList.remove("modal-open");
      if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
    }

    onKeydown(e) {
      const open = [...document.querySelectorAll(".modal-backdrop.open")].pop();
      if (!open) return;
      if (e.key === "Escape") { e.preventDefault(); this.closeModal(open); return; }
      if (e.key !== "Tab") return;
      const focusables = [...open.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select, textarea")]
        .filter(el => el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    // ---- punch actions -----------------------------------------------------
    async checkIn() {
      const mode = (document.querySelector('input[name="workMode"]:checked') || {}).value || "Office";
      let r = await this.perform({ type: "checkin", mode });
      if (!r.ok && r.code === "LEAVE_CONFLICT" && confirm(r.error)) {
        r = await this.perform({ type: "checkin", mode, override: true });
      } else if (!r.ok && r.code === "LEAVE_CONFLICT") {
        return;
      }
      this.report(r, "in");
    }

    report(result, sound) {
      if (!result) return;
      if (result.ok) { this.toast(result.message, "success"); this.chime(sound); }
      else if (result.error && result.error !== "No identity selected.") this.toast(result.error, "danger");
    }

    // ---- leave modal -------------------------------------------------------
    openLeaveModal(presetType) {
      const emp = this.currentEmployee();
      if (!emp) { this.toast("Select who you are in the header first.", "warning"); return; }
      const today = C.dateKey(this.now(), this.tz);
      const type = presetType || $("leave-type-select").value || "Medical";
      $("leave-type-select").value = type;
      $("modal-applicant-display").innerHTML =
        `<img src="${avatarFor(emp)}" alt="" class="avatar-sm" width="38" height="38">` +
        `<div><div style="font-weight:700; color:var(--text-heading);">${esc(emp.name)}</div>` +
        `<div style="font-size:0.75rem; color:var(--text-muted);">${esc(emp.role)}</div></div>`;
      const start = C.nextWorkday(today, this.holidays()); // today if it is a working day, else the next one
      $("leave-start-date").value = start;
      $("leave-end-date").value = start;
      $("leave-reason").value = "";
      $("leave-contact").value = "";
      $("leave-form-error").hidden = true;
      this.updateLeavePreview();
      this.openModal($("leave-modal"), $("leave-type-select"));
    }

    updateLeavePreview() {
      const type = $("leave-type-select").value;
      const today = C.dateKey(this.now(), this.tz);
      const back = C.LEAVE_TYPES[type].backdateDays;
      const min = C.addDays(today, -back);
      $("leave-start-date").min = min;
      $("leave-end-date").min = min;
      const check = C.validateLeave(this.state, {
        empId: this.me, type, start: $("leave-start-date").value, end: $("leave-end-date").value
      }, this.now(), this.tz);
      const days = $("modal-calculated-days"), note = $("modal-balance-check");
      if (check.ok) {
        days.textContent = `${check.days} day${check.days === 1 ? "" : "s"}`;
        note.textContent = `(${check.remaining} of ${check.quota} will remain this year)`;
        note.style.color = "var(--emerald-500)";
      } else {
        days.textContent = "—";
        note.textContent = check.error;
        note.style.color = "var(--rose-500)";
      }
      $("leave-form-error").hidden = true;
    }

    async submitLeave(e) {
      e.preventDefault();
      const err = $("leave-form-error");
      const result = await this.perform({
        type: "leave",
        leaveType: $("leave-type-select").value,
        start: $("leave-start-date").value,
        end: $("leave-end-date").value,
        reason: $("leave-reason").value,
        contact: $("leave-contact").value
      });
      if (result.ok) {
        this.closeModal($("leave-modal"));
        this.report(result, "in");
        this.refresh(); // pull the private reason for the new request
      } else if (result.error && result.error !== "No identity selected.") {
        err.textContent = result.error;
        err.hidden = false;
      }
    }

    // ---- employee modal ----------------------------------------------------
    openEmployeeModal() {
      $("employee-form").reset();
      $("emp-join").value = this.today();
      $("employee-form-error").hidden = true;
      this.openModal($("employee-modal"), $("emp-name"));
    }

    async submitEmployee(e) {
      e.preventDefault();
      const result = await this.perform({
        type: "addEmployee",
        name: $("emp-name").value, role: $("emp-role").value, joinDate: $("emp-join").value,
        email: $("emp-email").value, phone: $("emp-phone").value, isAdmin: $("emp-admin").checked
      });
      if (result.ok) { this.closeModal($("employee-modal")); this.report(result, "in"); }
      else if (result.error) { $("employee-form-error").textContent = result.error; $("employee-form-error").hidden = false; }
    }

    // ---- admin: people ------------------------------------------------------
    openLeaverModal(empId) {
      const emp = C.getEmployee(this.state, empId);
      if (!emp) return;
      this.leaverTarget = empId;
      $("leaver-sub").textContent = `${emp.name} \u00b7 ${emp.role}`;
      $("leaver-date").value = this.today();
      $("leaver-error").hidden = true;
      this.openModal($("leaver-modal"), $("leaver-date"));
    }

    async submitLeaver(e) {
      e.preventDefault();
      const result = await this.perform({ type: "removeEmployee", targetId: this.leaverTarget, lastDay: $("leaver-date").value });
      if (result.ok) { this.closeModal($("leaver-modal")); this.report(result, "out"); }
      else if (result.error) { $("leaver-error").textContent = result.error; $("leaver-error").hidden = false; }
    }

    async adminPersonAction(kind, empId) {
      if (kind === "leave") return this.openLeaverModal(empId);
      if (kind === "reset-pin") {
        const emp = C.getEmployee(this.state, empId);
        if (!emp || !confirm(`Clear ${emp.name}'s PIN? They will set a new one the next time they sign in.`)) return;
        if (this.store.mode !== "shared") { this.toast("PINs only exist when the shared server is running.", "warning"); return; }
        const r = await this.store.resetPin(empId);
        if (r.view) this.view = this.store.pack(r.view);
        this.report(r, "break");
        this.renderAll();
        return;
      }
      const action = kind === "reinstate" ? { type: "reinstateEmployee", targetId: empId }
        : { type: "setAdmin", targetId: empId, isAdmin: kind === "make-admin" };
      this.report(await this.perform(action), "break");
    }

    renderAdmin() {
      const adminTab = $("tab-btn-admin");
      const admin = this.isAdmin();
      adminTab.hidden = !admin;
      if (!admin) {
        if (adminTab.classList.contains("active")) this.showTab("my-desk");
        return;
      }
      const today = this.today();
      const claimed = new Set(this.view.claimed || []);
      const rows = [...this.state.employees].sort((x, y) => Number(C.isActive(y, today)) - Number(C.isActive(x, today)));
      $("admin-people-tbody").innerHTML = rows.map(e => {
        const active = C.isActive(e, today);
        const upcoming = e.joinDate && e.joinDate > today;
        const gone = e.leftOn && e.leftOn < today;
        const status = gone ? `<span class="status-badge badge-checked-out">Left ${esc(e.leftOn)}</span>`
          : upcoming ? `<span class="status-badge badge-remote">Joins ${esc(e.joinDate)}</span>`
            : e.leftOn ? `<span class="status-badge badge-medical">Leaving ${esc(e.leftOn)}</span>`
              : `<span class="status-badge badge-in-office">Active</span>`;
        const btn = (kind, label) => `<button type="button" class="view-profile-btn" data-admin="${kind}" data-id="${esc(e.id)}">${label}</button>`;
        const actions = [
          e.leftOn ? btn("reinstate", "Reinstate") : btn("leave", "Mark as left"),
          !gone && !e.leftOn ? (e.isAdmin ? btn("remove-admin", "Remove admin") : btn("make-admin", "Make admin")) : "",
          active && claimed.has(e.id) && this.store.mode === "shared" ? btn("reset-pin", "Reset PIN") : ""
        ].join(" ");
        return `<tr>
          <td><div class="emp-name">${esc(e.name)}${e.isAdmin ? ` <span class="you-tag">admin</span>` : ""}${e.id === this.me ? ` <span class="you-tag">(you)</span>` : ""}</div><div class="emp-dept">${esc(e.id)}</div></td>
          <td>${esc(e.role)}</td>
          <td class="mono-time">${esc(e.joinDate || "")}</td>
          <td>${status}</td>
          <td class="admin-actions">${actions}</td>
        </tr>`;
      }).join("");

      const hol = [...this.state.holidays].sort((x, y) => x.date.localeCompare(y.date));
      $("admin-holidays-tbody").innerHTML = hol.length ? hol.map(h => `<tr>
          <td class="mono-time">${esc(h.date)}</td>
          <td>${esc(h.name)}</td>
          <td>${esc(C.parseDate(h.date).toLocaleString("en-US", { weekday: "long", timeZone: "UTC" }))}</td>
          <td class="admin-actions"><button type="button" class="view-profile-btn" data-remove-holiday="${esc(h.date)}">Remove</button></td>
        </tr>`).join("") : `<tr><td colspan="4" class="empty-cell">No holidays yet. Add the first one above.</td></tr>`;
    }

    async submitHoliday(e) {
      e.preventDefault();
      const err = $("holiday-form-error");
      const result = await this.perform({ type: "addHoliday", date: $("holiday-date").value, name: $("holiday-name").value });
      if (result.ok) { err.hidden = true; $("holiday-form").reset(); this.report(result, "in"); }
      else if (result.error) { err.textContent = result.error; err.hidden = false; }
    }

    // ---- register ------------------------------------------------------------
    renderRegister() {
      const sel = $("register-month");
      if (!this.registerMonth) {
        const month = this.today().slice(0, 7);
        this.registerMonth = C.REGISTER.months.includes(month) ? month : C.REGISTER.months[0];
      }
      sel.value = this.registerMonth;
      const reg = C.registerMonth(this.state, this.registerMonth, this.now(), this.tz);
      if (!reg) return;
      $("register-subtext").textContent = `${this.monthLabel(this.registerMonth)}. Holidays and weekly offs are marked for everyone.`;
      const head = reg.days.map(d => `<th class="rg-day ${d.off ? "rg-off" : ""}" scope="col" title="${esc(d.holiday || C.formatDay(d.date))}"><span>${d.day}</span><small>${"SMTWTFS"[d.dow]}</small></th>`).join("");
      const body = reg.rows.map(({ emp, cells, totals }) => `<tr>
          <th scope="row" class="rg-name"><span class="rg-n">${esc(emp.name)}</span><small>${esc(emp.role)}</small></th>
          ${cells.map((c, i) => `<td class="rg-cell${c ? " rc rc-" + c : ""}${reg.days[i].off && !c ? "" : ""}" title="${esc(reg.days[i].date)}">${esc(c)}</td>`).join("")}
          <td class="rg-total"><b>${totals.P + totals.R}</b></td>
          <td class="rg-total">${totals.ML + totals.EL + totals.HL}</td>
          <td class="rg-total">${totals.A}</td>
        </tr>`).join("");
      $("register-scroll").innerHTML = reg.rows.length
        ? `<table class="register-table"><thead><tr><th class="rg-name" scope="col">Employee</th>${head}<th class="rg-total" scope="col" title="Days present">Pres.</th><th class="rg-total" scope="col" title="Days on leave">Leave</th><th class="rg-total" scope="col" title="Days absent">Abs.</th></tr></thead><tbody>${body}</tbody></table>`
        : `<div class="empty-cell">Nobody was employed in this month.</div>`;
    }

    exportRegister() {
      const reg = C.registerMonth(this.state, this.registerMonth, this.now(), this.tz);
      if (!reg) return;
      const header = ["Employee", "Designation", ...reg.days.map(d => d.day), "Present", "Leave", "Absent"];
      const lines = reg.rows.map(({ emp, cells, totals }) =>
        [emp.name, emp.role, ...cells, totals.P + totals.R, totals.ML + totals.EL + totals.HL, totals.A].map(C.csvField).join(","));
      this.download(`BKR_Attendance_Register_${this.registerMonth}.csv`, [header.map(C.csvField).join(","), ...lines].join("\r\n"));
      this.toast(`Exported ${this.monthLabel(this.registerMonth)}.`, "success");
    }

    download(name, text) {
      const blob = new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = name;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ---- rendering ---------------------------------------------------------
    populateStaticSelects() {
      const months = C.REGISTER.months;
      $("register-month").innerHTML = months.map(m => `<option value="${m}">${esc(this.monthLabel(m))}</option>`).join("");
    }

    monthLabel(m) {
      return new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    }

    renderAll() {
      this.renderBanner();
      this.renderIdentity();
      this.renderMetrics();
      this.renderDesk();
      this.renderTeamDirectory();
      this.renderLeaveTab();
      this.renderHolidays();
      this.renderRegister();
      this.renderAdmin();
      this.renderSync();
      this.labelTableCells();
    }

    /** Copies column headings onto cells so tables can stack into cards on phones. */
    labelTableCells(root) {
      (root || document).querySelectorAll("table.data-table").forEach(table => {
        const heads = [...table.querySelectorAll("thead th")].map(th => th.textContent.trim());
        table.querySelectorAll("tbody tr").forEach(tr => {
          [...tr.children].forEach((td, i) => { if (heads[i] && td.colSpan === 1) td.setAttribute("data-label", heads[i]); });
        });
      });
    }

    renderBanner() {
      const el = $("mode-banner");
      let text = "";
      if (this.offline) text = "Can't reach the server — showing the last data received. Reconnecting automatically…";
      else if (this.store && this.store.mode === "local") text = "Local demo mode: data lives only in this browser. Run “npm start” to share one live board with the whole office.";
      el.hidden = !text;
      el.textContent = text;
      el.classList.toggle("mode-banner-warn", this.offline);
    }

    renderSync() {
      const mode = this.store ? (this.store.mode === "shared" ? "Live shared data" : "Local demo data") : "Connecting…";
      const when = this.lastSync ? ` • updated ${C.formatClock(this.lastSync, this.tz)}` : "";
      $("footer-sync").textContent = mode + when;
    }

    renderIdentity() {
      const sel = $("employee-switcher-select");
      const staff = this.staff();
      const sig = staff.map(e => e.id + e.name).join("|") + "#" + this.me;
      if (sig !== this.employeeSignature) {
        this.employeeSignature = sig;
        sel.innerHTML = `<option value="">${this.me ? "— Sign out —" : "— Select yourself —"}</option>` +
          staff.map(e => `<option value="${esc(e.id)}"${e.id === this.me ? " selected" : ""}>${esc(e.name)} (${esc(e.role)})</option>`).join("");
      }
      sel.value = this.me;
    }

    statusOf(emp) {
      return C.statusFor(this.state, emp.id, this.now(), this.tz);
    }

    renderMetrics() {
      const counts = { present: 0, MEDICAL_LEAVE: 0, EMERGENCY_LEAVE: 0, HOLIDAY: 0 };
      const staff = this.staff();
      staff.forEach(emp => {
        const code = this.statusOf(emp).code;
        if (isPresent(code)) counts.present++;
        else if (counts[code] !== undefined) counts[code]++;
      });
      const total = staff.length;
      $("metric-present-count").textContent = counts.present;
      $("metric-present-total").textContent = `/ ${total} staff`;
      $("metric-present-percent").textContent = `${total ? Math.round(counts.present / total * 100) : 0}% in right now`;
      const plural = (n, one, many) => (n === 1 ? one : many);
      $("metric-medical-sub").textContent = plural(counts.MEDICAL_LEAVE, "colleague", "colleagues");
      $("metric-emergency-sub").textContent = plural(counts.EMERGENCY_LEAVE, "absence", "absences");
      $("metric-holiday-sub").textContent = plural(counts.HOLIDAY, "person", "people");
      $("metric-medical-count").textContent = counts.MEDICAL_LEAVE;
      $("metric-emergency-count").textContent = counts.EMERGENCY_LEAVE;
      $("metric-holiday-count").textContent = counts.HOLIDAY;
      $("active-in-office-count").textContent = counts.present;

      const today = C.dateKey(this.now(), this.tz);
      const next = C.nextHoliday(this.state, today);
      $("metric-next-holiday").textContent = !next ? "No upcoming company holiday"
        : next.date === today ? `Today: ${next.name}`
          : `Next: ${next.name}, ${C.formatDay(next.date)} (in ${C.diffDays(today, next.date)} days)`;
    }

    renderDesk() {
      const emp = this.currentEmployee();
      const now = this.now();
      const gate = $("desk-gate");
      gate.hidden = Boolean(emp);
      $("current-user-avatar").src = emp ? avatarFor(emp) : "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>";
      $("current-user-avatar").hidden = !emp;
      $("current-user-name").textContent = emp ? emp.name : "Nobody selected";
      $("current-user-name").title = emp ? emp.name : "";
      $("current-user-role").textContent = emp ? emp.role : "Pick your name in the header";
      $("punch-timezone").textContent = `Office time (${this.tz})`;

      const dot = $("punch-status-dot");
      dot.className = "status-indicator-dot";
      const btnIn = $("btn-check-in"), btnOut = $("btn-check-out"), btnBreak = $("btn-break-toggle");

      if (!emp) {
        [btnIn, btnOut, btnBreak, $("btn-quick-apply-leave")].forEach(b => { b.disabled = true; });
        $("punch-status-text").textContent = "No employee selected";
        ["today-entry-time", "today-exit-time"].forEach(id => { $(id).textContent = "--:--"; });
        $("today-total-hours").textContent = "0h 00m";
        $("today-break-duration").textContent = "0m";
        this.renderBalanceBars(null);
        $("my-punch-history-tbody").innerHTML = `<tr><td colspan="5" class="empty-cell">Select your name to see your attendance.</td></tr>`;
        return;
      }

      $("btn-quick-apply-leave").disabled = false;
      const status = this.statusOf(emp);
      const present = isPresent(status.code);
      btnIn.disabled = present;
      btnOut.disabled = !present;
      btnBreak.disabled = !present;
      $("break-btn-text").textContent = status.onBreak ? "End break" : "Start break";

      const labels = {
        CHECKED_IN: status.onBreak ? "On a break" : "Working — in the office",
        REMOTE: status.onBreak ? "On a break" : "Working — from home",
        CHECKED_OUT: "Checked out for the day",
        MEDICAL_LEAVE: "On medical leave",
        EMERGENCY_LEAVE: "On emergency leave",
        HOLIDAY: "On holiday",
        DAY_OFF: `Day off (${status.note})`,
        NOT_CHECKED_IN: "Not checked in yet"
      };
      $("punch-status-text").textContent = labels[status.code];
      if (present) dot.classList.add(status.onBreak ? "break" : "active");
      else if (/LEAVE|HOLIDAY/.test(status.code)) dot.classList.add("leave");

      const today = C.dateKey(now, this.tz);
      const agg = C.dayAggregate(this.state, emp.id, today, now);
      $("today-entry-time").textContent = agg ? C.formatTime(agg.checkIn, this.tz) : "--:--";
      $("today-exit-time").textContent = agg && !agg.open ? C.formatTime(agg.checkOut, this.tz) : "--:--";
      $("today-total-hours").textContent = agg ? C.formatDuration(agg.workedMin) + (agg.open ? " …" : "") : "0h 00m";
      $("today-break-duration").textContent = `${agg ? agg.breakMin : 0}m`;

      if (status.rec) {
        const radio = $(status.rec.mode === "Remote" ? "mode-remote" : "mode-office");
        if (radio && present) radio.checked = true;
      }

      this.renderBalanceBars(emp);
      this.renderMyHistory(emp);
    }

    renderBalanceBars(emp) {
      const year = Number(C.dateKey(this.now(), this.tz).slice(0, 4));
      $("balance-year").textContent = year;
      const bal = emp ? C.balances(this.state, emp.id, year) : null;
      [["holiday", "Holiday"], ["medical", "Medical"], ["emergency", "Emergency"]].forEach(([key, type]) => {
        const b = bal ? bal[type] : { used: 0, quota: C.LEAVE_TYPES[type].quota, remaining: C.LEAVE_TYPES[type].quota };
        $(`user-${key}-ratio`).textContent = `${b.used} / ${b.quota} days taken`;
        $(`user-${key}-progress`).style.width = `${b.quota ? Math.min(100, Math.round(b.used / b.quota * 100)) : 0}%`;
        $(`user-${key}-remaining`).textContent = `${b.remaining} day${b.remaining === 1 ? "" : "s"} available`;
      });
    }

    historyRows(empId) {
      const rows = C.history(this.state, empId, this.now(), this.tz, 7);
      if (!rows.length) return null;
      return rows.map(r => {
        const worked = r.missed ? `<span class="text-amber">Missed check-out</span>`
          : r.open ? "In progress" : esc(C.formatDuration(r.workedMin));
        return `<tr>
          <td class="mono-time">${esc(r.date)}</td>
          <td class="mono-time">${esc(C.formatTime(r.checkIn, this.tz))}</td>
          <td class="mono-time">${r.open || r.missed ? "--:--" : esc(C.formatTime(r.checkOut, this.tz))}</td>
          <td style="font-weight:700; color:var(--emerald-500);">${worked}</td>
          <td><span class="status-badge ${r.mode === "Remote" ? "badge-remote" : "badge-in-office"}">${r.mode === "Remote" ? "Remote" : "Office"}</span></td>
        </tr>`;
      }).join("");
    }

    renderMyHistory(emp) {
      $("my-punch-history-tbody").innerHTML = this.historyRows(emp.id) ||
        `<tr><td colspan="5" class="empty-cell">No attendance recorded yet.</td></tr>`;
    }

    // ---- live ticking ------------------------------------------------------
    tick() {
      const now = this.now();
      const tz = this.tz;
      $("header-live-clock").textContent = C.formatClock(now, tz);
      $("header-live-date").textContent = C.formatDateShort(now, tz);
      $("punch-live-clock").textContent = C.formatClock(now, tz);
      $("punch-live-date").textContent = C.formatDateLong(now, tz);

      const emp = this.currentEmployee();
      const el = $("punch-session-duration");
      if (emp) {
        const status = this.statusOf(emp);
        if (isPresent(status.code)) {
          const s = Math.floor(C.workedMs(status.rec, now) / 1000);
          const hms = `${String(Math.floor(s / 3600)).padStart(2, "0")}h ${String(Math.floor(s % 3600 / 60)).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`;
          el.textContent = status.onBreak ? `${hms} (paused)` : hms;
        } else {
          el.textContent = status.code === "CHECKED_OUT" ? "Shift completed" : "00h 00m 00s";
        }
      } else {
        el.textContent = "00h 00m 00s";
      }

      if (++this.ticks % 15 === 0 && this.store) {
        this.renderMetrics();
        this.renderTeamDirectory();
        if (emp) this.renderDesk();
        this.labelTableCells();
      }
    }

    // ---- team board --------------------------------------------------------
    boardRows() {
      const q = $("directory-search-input").value.toLowerCase().trim();
      const wanted = $("status-filter").value;
      const now = this.now();
      return this.staff().map(emp => ({ emp, status: this.statusOf(emp) })).filter(({ emp, status }) => {
        if (q && !(`${emp.name} ${emp.role}`).toLowerCase().includes(q)) return false;
        if (wanted === "PRESENT") return isPresent(status.code);
        return wanted === "ALL" || status.code === wanted;
      }).map(row => {
        const agg = C.dayAggregate(this.state, row.emp.id, C.dateKey(now, this.tz), now);
        return Object.assign(row, { agg });
      });
    }

    renderTeamDirectory() {
      const tbody = $("team-directory-tbody");
      const rows = this.boardRows();
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">${this.state.employees.length ? "No one matches those filters." : "No employees yet — add a colleague to get started."}</td></tr>`;
        return;
      }
      tbody.innerHTML = rows.map(({ emp, status, agg }) => {
        const ui = STATUS_UI[status.code];
        const badge = status.onBreak ? `<span class="status-badge badge-break">On break</span>` : `<span class="status-badge ${ui.cls}">${ui.label}</span>`;
        let leaveInfo = `<span class="text-muted">—</span>`;
        if (status.leave) leaveInfo = `<strong>${esc(status.leave.type)}</strong> <span class="text-muted">until ${esc(C.formatDay(status.leave.end))}</span>`;
        else if (status.code === "DAY_OFF") leaveInfo = `<span class="text-muted">${esc(status.note)}</span>`;
        const worked = agg ? esc(C.formatDuration(agg.workedMin)) + (agg.open ? " …" : "") : "--";
        return `<tr>
          <td><div class="emp-cell">
            <img src="${avatarFor(emp)}" alt="" class="emp-avatar" width="38" height="38">
            <div><div class="emp-name">${esc(emp.name)}${emp.id === this.me ? ` <span class="you-tag">(you)</span>` : ""}</div><div class="emp-dept">${esc(emp.id)}</div></div>
          </div></td>
          <td><div style="font-weight:500; color:var(--text-heading);">${esc(emp.role)}</div></td>
          <td>${badge}</td>
          <td class="mono-time">${agg ? esc(C.formatTime(agg.checkIn, this.tz)) : "--:--"}</td>
          <td class="mono-time">${agg && !agg.open ? esc(C.formatTime(agg.checkOut, this.tz)) : "--:--"}</td>
          <td style="font-weight:700; color:var(--emerald-500);">${worked}</td>
          <td>${leaveInfo}</td>
          <td><button class="view-profile-btn" type="button" data-inspect="${esc(emp.id)}" aria-label="View profile of ${esc(emp.name)}">View profile</button></td>
        </tr>`;
      }).join("");
    }

    exportCsv() {
      const rows = this.boardRows();
      const year = Number(C.dateKey(this.now(), this.tz).slice(0, 4));
      const today = C.dateKey(this.now(), this.tz);
      const header = ["Employee ID", "Name", "Designation", "Date", "Status", "Check-In", "Check-Out", "Worked (min)",
        "Holiday used", "Medical used", "Emergency used"];
      const lines = rows.map(({ emp, status, agg }) => {
        const bal = C.balances(this.state, emp.id, year);
        return [emp.id, emp.name, emp.role, today, status.code,
          agg ? C.formatTime(agg.checkIn, this.tz) : "", agg && !agg.open ? C.formatTime(agg.checkOut, this.tz) : "",
          agg ? agg.workedMin : "", bal.Holiday.used, bal.Medical.used, bal.Emergency.used].map(C.csvField).join(",");
      });
      const blob = new Blob(["﻿" + [header.map(C.csvField).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `BKR_Attendance_${today}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.toast(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}.`, "success");
    }

    // ---- colleague modal ---------------------------------------------------
    inspectColleague(empId) {
      const emp = C.getEmployee(this.state, empId);
      if (!emp) return;
      const now = this.now();
      const status = this.statusOf(emp);
      const ui = STATUS_UI[status.code];
      const badge = $("colleague-status-badge");
      badge.className = `status-badge ${status.onBreak ? "badge-break" : ui.cls}`;
      badge.textContent = status.onBreak ? "On break" : ui.label;
      $("colleague-avatar").src = avatarFor(emp);
      $("colleague-modal-title").textContent = emp.name;
      $("colleague-role-dept").textContent = `${emp.role} (${emp.id})`;
      $("colleague-email").textContent = [emp.email, emp.phone].filter(Boolean).join(" • ");

      const agg = C.dayAggregate(this.state, emp.id, C.dateKey(now, this.tz), now);
      $("colleague-checkin-time").textContent = agg ? C.formatTime(agg.checkIn, this.tz) : "--:--";
      $("colleague-checkout-time").textContent = agg && !agg.open ? C.formatTime(agg.checkOut, this.tz) : "--:--";
      $("colleague-total-duration").textContent = agg ? C.formatDuration(agg.workedMin) : "--";
      $("colleague-work-mode").textContent = agg ? agg.mode : "--";

      const year = Number(C.dateKey(now, this.tz).slice(0, 4));
      const bal = C.balances(this.state, emp.id, year);
      $("colleague-holidays-took").textContent = `${bal.Holiday.used} / ${bal.Holiday.quota} days`;
      $("colleague-medical-took").textContent = `${bal.Medical.used} / ${bal.Medical.quota} days`;
      $("colleague-emergency-took").textContent = `${bal.Emergency.used} / ${bal.Emergency.quota} days`;

      $("colleague-history-tbody").innerHTML = this.historyRows(emp.id) ||
        `<tr><td colspan="5" class="empty-cell">No attendance recorded yet.</td></tr>`;

      const leaves = this.state.leaves.filter(l => l.empId === emp.id).sort((a, b) => b.start.localeCompare(a.start));
      $("colleague-leaves-list").innerHTML = leaves.length ? leaves.map(l => {
        const t = TYPE_UI[l.type];
        const private_ = this.view.mine[l.id];
        return `<div class="colleague-leave-row">
          <div>
            <strong style="color:var(--text-heading);">${esc(l.type)} leave — ${esc(l.days)} working day${l.days === 1 ? "" : "s"}</strong>
            <div style="font-size:0.75rem; color:var(--text-muted);">${esc(l.start)} to ${esc(l.end)}${private_ && private_.reason ? ` • “${esc(private_.reason)}”` : ""}</div>
          </div>
          <span class="status-badge ${t.cls}">${esc(l.status)}</span>
        </div>`;
      }).join("") : `<div class="empty-cell">No leave on record.</div>`;

      this.labelTableCells($("colleague-modal"));
      this.openModal($("colleague-modal"), $("colleague-modal-close-btn"));
    }

    // ---- leave tab ---------------------------------------------------------
    renderLeaveTab() {
      const emp = this.currentEmployee();
      const year = Number(C.dateKey(this.now(), this.tz).slice(0, 4));
      const bal = emp ? C.balances(this.state, emp.id, year) : null;
      [["medical", "Medical"], ["emergency", "Emergency"], ["holiday", "Holiday"]].forEach(([key, type]) => {
        const quota = bal ? bal[type].quota : C.LEAVE_TYPES[type].quota;
        $(`card-${key}-allocated`).textContent = quota;
        $(`card-${key}-used`).textContent = bal ? bal[type].used : "–";
        $(`card-${key}-available`).textContent = bal ? bal[type].remaining : "–";
      });
      document.querySelectorAll(".btn-apply-specific").forEach(b => { b.disabled = !emp; });
      $("btn-plan-holiday-btn").disabled = !emp;

      $("balances-subtext").textContent = `Working days taken in ${year} against each person's yearly quota.`;
      $("team-balances-tbody").innerHTML = this.staff().length ? this.staff().map(e => {
        const b = C.balances(this.state, e.id, year);
        const cell = x => `<td style="font-family:var(--font-mono); font-weight:700;">${x.used} / ${x.quota}</td>`;
        return `<tr><td><div style="font-weight:700; color:var(--text-heading);">${esc(e.name)}</div><div style="font-size:0.75rem; color:var(--text-muted);">${esc(e.role)}</div></td>${cell(b.Holiday)}${cell(b.Medical)}${cell(b.Emergency)}</tr>`;
      }).join("") : `<tr><td colspan="4" class="empty-cell">No employees yet.</td></tr>`;

      this.renderLeaveLog();
    }

    renderLeaveLog() {
      const today = C.dateKey(this.now(), this.tz);
      const names = new Map(this.state.employees.map(e => [e.id, e]));
      const leaves = this.state.leaves
        .filter(l => this.leaveFilter === "ALL" || l.type === this.leaveFilter)
        .sort((a, b) => b.start.localeCompare(a.start));
      $("all-leaves-tbody").innerHTML = leaves.length ? leaves.map(l => {
        const t = TYPE_UI[l.type];
        const owner = names.get(l.empId);
        const mine = this.view.mine[l.id];
        const details = mine
          ? `<div style="max-width:260px; font-size:0.85rem; color:var(--text-secondary);">${esc(mine.reason)}</div>${mine.contact ? `<div style="font-size:0.72rem; color:var(--text-muted);">Contact: ${esc(mine.contact)}</div>` : ""}`
          : `<span class="text-muted">Private</span>`;
        const cancellable = l.empId === this.me && l.status === "Approved" && l.start >= today;
        const statusBadge = l.status === "Approved" ? `<span class="status-badge badge-in-office">Approved</span>` : `<span class="status-badge badge-checked-out">Cancelled</span>`;
        return `<tr>
          <td><div style="font-weight:700; color:var(--text-heading);">${esc(owner ? owner.name : l.empId)}</div><div style="font-size:0.75rem; color:var(--text-muted);">${esc(l.empId)}</div></td>
          <td><span class="status-badge ${t.cls}">${esc(l.type)}</span></td>
          <td class="mono-time">${esc(l.start)}</td>
          <td class="mono-time">${esc(l.end)}</td>
          <td style="font-family:var(--font-mono); font-weight:700;">${esc(l.days)}</td>
          <td>${details}</td>
          <td class="mono-time" style="color:var(--text-muted); font-size:0.78rem;">${esc(l.appliedOn)}</td>
          <td>${statusBadge}${cancellable ? ` <button type="button" class="link-btn" data-cancel-leave="${esc(l.id)}">Cancel</button>` : ""}</td>
        </tr>`;
      }).join("") : `<tr><td colspan="8" class="empty-cell">No leave records in this category.</td></tr>`;
    }

    // ---- holidays tab ------------------------------------------------------
    renderHolidays() {
      const today = this.today();
      const list = [...this.state.holidays].sort((x, y) => x.date.localeCompare(y.date));
      $("public-holidays-title").textContent = `Holidays ${C.REGISTER.year}`;
      $("public-holidays-count").textContent = `${list.length} listed`;
      $("public-holidays-list").innerHTML = list.length ? list.map(h => {
        const d = C.parseDate(h.date);
        const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
        const weekday = d.toLocaleString("en-US", { weekday: "long", timeZone: "UTC" });
        const diff = C.diffDays(today, h.date);
        const label = diff < 0 ? "Past" : diff === 0 ? "Today" : `In ${diff} day${diff === 1 ? "" : "s"}`;
        return `<div class="holiday-item">
          <div class="holiday-date-badge"><span class="holiday-day">${esc(h.date.slice(8))}</span><span class="holiday-month">${esc(month)}</span></div>
          <div class="holiday-info"><div class="holiday-name">${esc(h.name)}</div><div class="holiday-weekday">${esc(weekday)}${[0, 6].includes(C.weekday(h.date)) ? " (weekly off)" : ""}</div></div>
          <span class="status-badge ${diff >= 0 ? "badge-remote" : "badge-checked-out"}">${esc(label)}</span>
        </div>`;
      }).join("") : `<div class="empty-cell">No holidays listed yet.</div>`;

      const names = new Map(this.state.employees.map(e => [e.id, e]));
      const away = this.state.leaves
        .filter(l => l.type === "Holiday" && l.status === "Approved" && l.end >= today)
        .sort((a, b) => a.start.localeCompare(b.start));
      $("team-vacations-feed").innerHTML = away.length ? away.map(l => {
        const emp = names.get(l.empId);
        const diff = C.diffDays(today, l.start);
        const when = diff <= 0 ? "Away now" : `Starts in ${diff} day${diff === 1 ? "" : "s"}`;
        return `<div class="feed-item">
          <img src="${emp ? avatarFor(emp) : ""}" alt="" class="feed-avatar" width="40" height="40">
          <div class="feed-body">
            <div class="feed-name">${esc(emp ? emp.name : l.empId)}</div>
            <div class="feed-detail">${esc(l.start)} to ${esc(l.end)} (${esc(l.days)} working day${l.days === 1 ? "" : "s"})</div>
          </div>
          <span class="feed-tag badge-holiday">${esc(when)}</span>
        </div>`;
      }).join("") : `<div class="empty-cell">No upcoming team vacations scheduled.</div>`;
    }

    // ---- toast -------------------------------------------------------------
    toast(message, type) {
      const container = $("toast-container");
      const el = document.createElement("div");
      el.className = `toast toast-${type || "info"}`;
      el.innerHTML = `<span>${esc(message)}</span>`;
      container.appendChild(el);
      el.setAttribute("role", type === "danger" ? "alert" : "status");
      setTimeout(() => {
        el.classList.add("leaving");
        setTimeout(() => el.remove(), 180);
      }, 4500);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const app = new App();
    window.pulseApp = app; // handy for debugging in the console
    app.init();
  });
})();
