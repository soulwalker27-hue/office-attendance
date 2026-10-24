/**
 * PulseAttend - Enterprise Office Attendance & Leave Management
 * Core Application Logic, State Controller & Automated QA Test Oracle
 */

// ============================================================================
// Initial Mock Data (Saved & Loaded from LocalStorage)
// ============================================================================
const DEFAULT_EMPLOYEES = [
  {
    id: "EMP-101",
    name: "Alex Morgan",
    role: "Senior Fullstack Engineer",
    department: "Engineering",
    email: "alex.morgan@pulseoffice.corp",
    phone: "+1 (555) 234-8901",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80",
    quota: { holiday: 12, medical: 14, emergency: 7 },
    used: { holiday: 3, medical: 2, emergency: 1 },
    today: {
      status: "CHECKED_IN",
      checkInTime: "08:52 AM",
      checkOutTime: null,
      workMode: "Office",
      onBreak: false,
      breakMinutes: 15,
      startTimestamp: Date.now() - (3 * 3600 + 42 * 60) * 1000 // 3h 42m ago
    },
    history: [
      { date: "2026-10-23", checkIn: "08:55 AM", checkOut: "05:32 PM", hours: "8h 37m", status: "Office", mode: "In-Office" },
      { date: "2026-10-22", checkIn: "09:02 AM", checkOut: "05:45 PM", hours: "8h 43m", status: "Office", mode: "In-Office" },
      { date: "2026-10-21", checkIn: "08:48 AM", checkOut: "05:15 PM", hours: "8h 27m", status: "Remote", mode: "Remote" },
      { date: "2026-10-20", checkIn: "09:10 AM", checkOut: "06:00 PM", hours: "8h 50m", status: "Office", mode: "In-Office" },
      { date: "2026-10-19", checkIn: "08:50 AM", checkOut: "05:25 PM", hours: "8h 35m", status: "Office", mode: "In-Office" }
    ]
  },
  {
    id: "EMP-102",
    name: "Sarah Jenkins",
    role: "Lead Product Designer",
    department: "Design",
    email: "sarah.j@pulseoffice.corp",
    phone: "+1 (555) 345-6712",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80",
    quota: { holiday: 12, medical: 14, emergency: 7 },
    used: { holiday: 4, medical: 0, emergency: 0 },
    today: {
      status: "REMOTE",
      checkInTime: "09:04 AM",
      checkOutTime: null,
      workMode: "Remote",
      onBreak: false,
      breakMinutes: 20,
      startTimestamp: Date.now() - (2 * 3600 + 15 * 60) * 1000
    },
    history: [
      { date: "2026-10-23", checkIn: "09:00 AM", checkOut: "05:30 PM", hours: "8h 30m", status: "Remote", mode: "Remote" },
      { date: "2026-10-22", checkIn: "09:15 AM", checkOut: "05:45 PM", hours: "8h 30m", status: "Office", mode: "In-Office" },
      { date: "2026-10-21", checkIn: "09:00 AM", checkOut: "05:00 PM", hours: "8h 00m", status: "Remote", mode: "Remote" }
    ]
  },
  {
    id: "EMP-103",
    name: "Michael Chen",
    role: "HR Operations Lead",
    department: "Human Resources",
    email: "m.chen@pulseoffice.corp",
    phone: "+1 (555) 456-7890",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80",
    quota: { holiday: 12, medical: 14, emergency: 7 },
    used: { holiday: 2, medical: 3, emergency: 0 },
    today: {
      status: "CHECKED_IN",
      checkInTime: "08:30 AM",
      checkOutTime: null,
      workMode: "Office",
      onBreak: false,
      breakMinutes: 10,
      startTimestamp: Date.now() - (4 * 3600 + 5 * 60) * 1000
    },
    history: [
      { date: "2026-10-23", checkIn: "08:35 AM", checkOut: "05:10 PM", hours: "8h 35m", status: "Office", mode: "In-Office" },
      { date: "2026-10-22", checkIn: "08:40 AM", checkOut: "05:20 PM", hours: "8h 40m", status: "Office", mode: "In-Office" }
    ]
  },
  {
    id: "EMP-104",
    name: "Elena Rostova",
    role: "Cloud DevOps Architect",
    department: "Engineering",
    email: "elena.r@pulseoffice.corp",
    phone: "+1 (555) 567-8901",
    avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=150&q=80",
    quota: { holiday: 12, medical: 14, emergency: 7 },
    used: { holiday: 1, medical: 4, emergency: 1 },
    today: {
      status: "MEDICAL_LEAVE",
      checkInTime: null,
      checkOutTime: null,
      workMode: "Office",
      onBreak: false,
      breakMinutes: 0,
      startTimestamp: null,
      leaveReason: "Seasonal viral fever & physician rest order"
    },
    history: [
      { date: "2026-10-23", checkIn: "09:05 AM", checkOut: "05:15 PM", hours: "8h 10m", status: "Office", mode: "In-Office" }
    ]
  },
  {
    id: "EMP-105",
    name: "David Kim",
    role: "Senior Growth Marketing Manager",
    department: "Marketing",
    email: "david.kim@pulseoffice.corp",
    phone: "+1 (555) 678-9012",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80",
    quota: { holiday: 12, medical: 14, emergency: 7 },
    used: { holiday: 5, medical: 1, emergency: 0 },
    today: {
      status: "HOLIDAY",
      checkInTime: null,
      checkOutTime: null,
      workMode: "Office",
      onBreak: false,
      breakMinutes: 0,
      startTimestamp: null,
      leaveReason: "Annual autumn vacation travel"
    },
    history: [
      { date: "2026-10-21", checkIn: "09:12 AM", checkOut: "05:40 PM", hours: "8h 28m", status: "Office", mode: "In-Office" }
    ]
  },
  {
    id: "EMP-106",
    name: "Priya Patel",
    role: "VP of Product Strategy",
    department: "Product",
    email: "priya.patel@pulseoffice.corp",
    phone: "+1 (555) 789-0123",
    avatar: "https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&w=150&q=80",
    quota: { holiday: 12, medical: 14, emergency: 7 },
    used: { holiday: 2, medical: 0, emergency: 2 },
    today: {
      status: "EMERGENCY_LEAVE",
      checkInTime: null,
      checkOutTime: null,
      workMode: "Office",
      onBreak: false,
      breakMinutes: 0,
      startTimestamp: null,
      leaveReason: "Immediate family domestic water emergency"
    },
    history: [
      { date: "2026-10-23", checkIn: "08:45 AM", checkOut: "05:30 PM", hours: "8h 45m", status: "Office", mode: "In-Office" }
    ]
  },
  {
    id: "EMP-107",
    name: "James O'Connor",
    role: "Operations & Logistics Manager",
    department: "Sales & Ops",
    email: "james.o@pulseoffice.corp",
    phone: "+1 (555) 890-1234",
    avatar: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=150&q=80",
    quota: { holiday: 12, medical: 14, emergency: 7 },
    used: { holiday: 2, medical: 1, emergency: 0 },
    today: {
      status: "CHECKED_IN",
      checkInTime: "07:55 AM",
      checkOutTime: null,
      workMode: "Office",
      onBreak: false,
      breakMinutes: 30,
      startTimestamp: Date.now() - (4 * 3600 + 40 * 60) * 1000
    },
    history: [
      { date: "2026-10-23", checkIn: "08:00 AM", checkOut: "04:45 PM", hours: "8h 45m", status: "Office", mode: "In-Office" }
    ]
  },
  {
    id: "EMP-108",
    name: "Sophia Hernandez",
    role: "Enterprise Support Specialist",
    department: "Sales & Ops",
    email: "sophia.h@pulseoffice.corp",
    phone: "+1 (555) 901-2345",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=150&q=80",
    quota: { holiday: 12, medical: 14, emergency: 7 },
    used: { holiday: 1, medical: 0, emergency: 0 },
    today: {
      status: "CHECKED_OUT",
      checkInTime: "07:30 AM",
      checkOutTime: "03:45 PM",
      workMode: "Office",
      onBreak: false,
      breakMinutes: 45,
      startTimestamp: null
    },
    history: [
      { date: "2026-10-23", checkIn: "07:30 AM", checkOut: "03:30 PM", hours: "8h 00m", status: "Office", mode: "In-Office" }
    ]
  }
];

const DEFAULT_LEAVE_REQUESTS = [
  {
    id: "LR-501",
    employeeId: "EMP-104",
    employeeName: "Elena Rostova",
    type: "Medical",
    startDate: "2026-10-24",
    endDate: "2026-10-25",
    days: 2,
    reason: "Seasonal viral fever & acute throat infection",
    contact: "Dr. Miller (Metro General Clinic) +1 555-0199",
    appliedOn: "2026-10-23",
    status: "Approved"
  },
  {
    id: "LR-502",
    employeeId: "EMP-106",
    employeeName: "Priya Patel",
    type: "Emergency",
    startDate: "2026-10-24",
    endDate: "2026-10-24",
    days: 1,
    reason: "Severe domestic plumbing flood requiring contractor",
    contact: "+1 555-789-0123",
    appliedOn: "2026-10-24",
    status: "Approved"
  },
  {
    id: "LR-503",
    employeeId: "EMP-105",
    employeeName: "David Kim",
    type: "Holiday",
    startDate: "2026-10-24",
    endDate: "2026-10-28",
    days: 5,
    reason: "Annual fall family road trip across national parks",
    contact: "david.kim@pulseoffice.corp",
    appliedOn: "2026-10-15",
    status: "Approved"
  },
  {
    id: "LR-504",
    employeeId: "EMP-101",
    employeeName: "Alex Morgan",
    type: "Medical",
    startDate: "2026-10-12",
    endDate: "2026-10-13",
    days: 2,
    reason: "Wisdom tooth extraction surgery and resting",
    contact: "SmileCare Dental Center",
    appliedOn: "2026-10-10",
    status: "Completed"
  },
  {
    id: "LR-505",
    employeeId: "EMP-102",
    employeeName: "Sarah Jenkins",
    type: "Holiday",
    startDate: "2026-09-18",
    endDate: "2026-09-22",
    days: 4,
    reason: "Design conference & extended personal retreat",
    contact: "sarah.j@pulseoffice.corp",
    appliedOn: "2026-09-01",
    status: "Completed"
  }
];

const PUBLIC_HOLIDAYS_2026 = [
  { name: "New Year's Day", day: "01", month: "Jan", weekday: "Thursday", status: "Past" },
  { name: "Martin Luther King Jr. Day", day: "19", month: "Jan", weekday: "Monday", status: "Past" },
  { name: "Presidents' Day", day: "16", month: "Feb", weekday: "Monday", status: "Past" },
  { name: "Memorial Day", day: "25", month: "May", weekday: "Monday", status: "Past" },
  { name: "Juneteenth National Freedom Day", day: "19", month: "Jun", weekday: "Friday", status: "Past" },
  { name: "Independence Day", day: "04", month: "Jul", weekday: "Saturday", status: "Past" },
  { name: "Labor Day", day: "07", month: "Sep", weekday: "Monday", status: "Past" },
  { name: "Veterans Day", day: "11", month: "Nov", weekday: "Wednesday", status: "Upcoming" },
  { name: "Thanksgiving Day", day: "26", month: "Nov", weekday: "Thursday", status: "Upcoming" },
  { name: "Christmas Day", day: "25", month: "Dec", weekday: "Friday", status: "Upcoming" }
];

// ============================================================================
// Core State Management & Application Controller
// ============================================================================
class AttendanceApp {
  constructor() {
    this.employees = [];
    this.leaveRequests = [];
    this.currentEmployeeId = "EMP-101";
    this.currentTheme = "light";
    this.soundEnabled = true;
    this.timerInterval = null;
    this.audioCtx = null;

    this.init();
  }

  init() {
    this.loadState();
    this.initAudio();
    this.bindEvents();
    this.startGlobalClock();
    this.renderAll();
  }

  // ============================================================================
  // Security & Data Sanitization Utilities
  // ============================================================================
  escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  escapeCsv(val) {
    if (val === null || val === undefined) return '""';
    const s = String(val);
    return '"' + s.replace(/"/g, '""') + '"';
  }

  parseDateUtc(dateStr) {
    if (!dateStr || typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    const parts = dateStr.split("-").map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  }

  calcInclusiveDays(startStr, endStr) {
    const start = this.parseDateUtc(startStr);
    const end = this.parseDateUtc(endStr);
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return 0;
    }
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
  }

  hasOverlappingLeave(employeeId, startStr, endStr, ignoreId = null) {
    const start = this.parseDateUtc(startStr);
    const end = this.parseDateUtc(endStr);
    if (!start || !end) return false;

    return this.leaveRequests.some(lr => {
      if (lr.employeeId !== employeeId) return false;
      if (ignoreId && lr.id === ignoreId) return false;
      const lrStart = this.parseDateUtc(lr.startDate);
      const lrEnd = this.parseDateUtc(lr.endDate);
      if (!lrStart || !lrEnd) return false;
      return start <= lrEnd && end >= lrStart;
    });
  }

  // ============================================================================
  // Persistence Layer
  // ============================================================================
  loadState() {
    try {
      const storedEmployees = localStorage.getItem("pulse_employees");
      const storedLeaves = localStorage.getItem("pulse_leaves");
      const storedActiveId = localStorage.getItem("pulse_active_user");

      this.employees = storedEmployees ? JSON.parse(storedEmployees) : JSON.parse(JSON.stringify(DEFAULT_EMPLOYEES));
      this.leaveRequests = storedLeaves ? JSON.parse(storedLeaves) : JSON.parse(JSON.stringify(DEFAULT_LEAVE_REQUESTS));
      if (storedActiveId && this.employees.some(e => e.id === storedActiveId)) {
        this.currentEmployeeId = storedActiveId;
      }
      const storedTheme = localStorage.getItem("pulse_theme");
      this.currentTheme = storedTheme || "light";
      this.applyTheme(this.currentTheme, false);
    } catch (e) {
      console.error("Could not load state from localStorage:", e);
      this.employees = JSON.parse(JSON.stringify(DEFAULT_EMPLOYEES));
      this.leaveRequests = JSON.parse(JSON.stringify(DEFAULT_LEAVE_REQUESTS));
    }
  }

  saveState() {
    try {
      localStorage.setItem("pulse_employees", JSON.stringify(this.employees));
      localStorage.setItem("pulse_leaves", JSON.stringify(this.leaveRequests));
      localStorage.setItem("pulse_active_user", this.currentEmployeeId);
    } catch (e) {
      console.warn("Could not save state to localStorage:", e);
    }
  }

  applyTheme(theme, notify = true) {
    this.currentTheme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("pulse_theme", theme);

    const icon = document.getElementById("theme-icon");
    const label = document.getElementById("theme-label");
    if (icon) icon.textContent = theme === "dark" ? "☀️" : "🌙";
    if (label) label.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";

    if (notify) {
      this.playChime("break");
      this.showToast(`Switched to ${theme === "light" ? "Minimalist Light Blue" : "Sleek Dark"} mode`, "success");
    }
  }

  getCurrentEmployee() {
    return this.employees.find(e => e.id === this.currentEmployeeId) || this.employees[0];
  }

  // ============================================================================
  // Audio Feedback (Synthesized using Web Audio API)
  // ============================================================================
  initAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      this.audioCtx = new AudioContextClass();
    }
  }

  playChime(type = "success") {
    if (!this.soundEnabled || !this.audioCtx) return;
    try {
      if (this.audioCtx.state === "suspended") {
        this.audioCtx.resume();
      }
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (type === "success") {
        // High energetic pleasant three-tone chime
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); // E5
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2); // G5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === "checkout") {
        // Soft descending warm tone
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(392.00, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (type === "break") {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(554.37, now + 0.12);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  // ============================================================================
  // Global Live Clock & Timers
  // ============================================================================
  startGlobalClock() {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      const dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      const fullDateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

      const headerClock = document.getElementById("header-live-clock");
      const headerDate = document.getElementById("header-live-date");
      const punchClock = document.getElementById("punch-live-clock");
      const punchDate = document.getElementById("punch-live-date");

      if (headerClock) headerClock.textContent = timeStr;
      if (headerDate) headerDate.textContent = dateStr;
      if (punchClock) punchClock.textContent = timeStr;
      if (punchDate) punchDate.textContent = fullDateStr;

      this.updateActiveSessionTimer();
    };

    updateTime();
    setInterval(updateTime, 1000);
  }

  updateActiveSessionTimer() {
    const emp = this.getCurrentEmployee();
    const durationElem = document.getElementById("punch-session-duration");
    if (!durationElem) return;

    if ((emp.today.status === "CHECKED_IN" || emp.today.status === "REMOTE") && emp.today.startTimestamp) {
      if (emp.today.onBreak) {
        durationElem.textContent = "Paused (On Break ☕)";
        return;
      }
      const elapsedMs = Math.max(0, Date.now() - emp.today.startTimestamp);
      const totalSec = Math.floor(elapsedMs / 1000);
      const hours = Math.floor(totalSec / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;

      durationElem.textContent = `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
    } else if (emp.today.status === "CHECKED_OUT") {
      durationElem.textContent = "Shift Completed";
    } else if (emp.today.status.includes("LEAVE") || emp.today.status === "HOLIDAY") {
      durationElem.textContent = "On Scheduled Leave";
    } else {
      durationElem.textContent = "00h 00m 00s";
    }
  }

  // ============================================================================
  // Event Bindings
  // ============================================================================
  bindEvents() {
    // Tab Switching
    const tabBtns = document.querySelectorAll(".nav-tab");
    tabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        tabBtns.forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));

        btn.classList.add("active");
        const targetId = `tab-${btn.dataset.tab}`;
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) targetPanel.classList.add("active");
      });
    });

    // Link from My Desk to All Leaves tab
    const linkViewLeaves = document.getElementById("link-view-all-leaves");
    if (linkViewLeaves) {
      linkViewLeaves.addEventListener("click", () => {
        const leaveTabBtn = document.getElementById("tab-btn-leave-tracker");
        if (leaveTabBtn) leaveTabBtn.click();
      });
    }

    // Active User Switcher Dropdown
    const userSwitcher = document.getElementById("employee-switcher-select");
    if (userSwitcher) {
      userSwitcher.addEventListener("change", (e) => {
        this.currentEmployeeId = e.target.value;
        this.saveState();
        this.renderAll();
        const emp = this.getCurrentEmployee();
        this.showToast(`Switched active view to ${emp.name} (${emp.role})`, "success");
      });
    }

    // Sound Toggle
    const soundBtn = document.getElementById("sound-toggle-btn");
    const soundIcon = document.getElementById("sound-icon");
    if (soundBtn && soundIcon) {
      soundBtn.addEventListener("click", () => {
        this.soundEnabled = !this.soundEnabled;
        soundIcon.textContent = this.soundEnabled ? "🔊" : "🔇";
        this.showToast(`Audio feedback ${this.soundEnabled ? "Enabled" : "Muted"}`);
      });
    }

    // Theme Toggle Switcher
    const themeBtn = document.getElementById("theme-toggle-btn");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const nextTheme = this.currentTheme === "light" ? "dark" : "light";
        this.applyTheme(nextTheme, true);
      });
    }

    // Automated QA Diagnostics Button
    const diagBtn = document.getElementById("btn-run-diagnostics");
    if (diagBtn) {
      diagBtn.addEventListener("click", () => this.openDiagnosticsModal());
    }

    const diagCloseBtn = document.getElementById("diagnostics-modal-close");
    const diagCloseBtn2 = document.getElementById("diagnostics-modal-close-btn");
    const diagRerunBtn = document.getElementById("diagnostics-rerun-btn");
    const diagModal = document.getElementById("diagnostics-modal");

    const closeDiag = () => { if (diagModal) diagModal.classList.remove("open"); };
    if (diagCloseBtn) diagCloseBtn.addEventListener("click", closeDiag);
    if (diagCloseBtn2) diagCloseBtn2.addEventListener("click", closeDiag);
    if (diagRerunBtn) diagRerunBtn.addEventListener("click", () => this.runAndRenderDiagnostics());
    if (diagModal) {
      diagModal.addEventListener("click", (e) => { if (e.target === diagModal) closeDiag(); });
    }

    // Reset Data
    const resetBtn = document.getElementById("reset-data-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (confirm("Reset all attendance and leave records back to initial mock dataset?")) {
          localStorage.removeItem("pulse_employees");
          localStorage.removeItem("pulse_leaves");
          localStorage.removeItem("pulse_active_user");
          this.loadState();
          this.renderAll();
          this.showToast("Demo dataset successfully reset!", "success");
        }
      });
    }

    // Punch In Button
    const checkInBtn = document.getElementById("btn-check-in");
    if (checkInBtn) {
      checkInBtn.addEventListener("click", () => this.handlePunchCheckIn());
    }

    // Punch Out Button
    const checkOutBtn = document.getElementById("btn-check-out");
    if (checkOutBtn) {
      checkOutBtn.addEventListener("click", () => this.handlePunchCheckOut());
    }

    // Break Toggle Button
    const breakBtn = document.getElementById("btn-break-toggle");
    if (breakBtn) {
      breakBtn.addEventListener("click", () => this.handleBreakToggle());
    }

    // Quick Apply Leave Button
    const quickLeaveBtn = document.getElementById("btn-quick-apply-leave");
    if (quickLeaveBtn) {
      quickLeaveBtn.addEventListener("click", () => this.openLeaveModal());
    }

    // Apply Specific Leave Buttons on Leave Cards
    const specificLeaveBtns = document.querySelectorAll(".btn-apply-specific");
    specificLeaveBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.type;
        this.openLeaveModal(type);
      });
    });

    const planHolidayBtn = document.getElementById("btn-plan-holiday-btn");
    if (planHolidayBtn) {
      planHolidayBtn.addEventListener("click", () => this.openLeaveModal("Holiday"));
    }

    // Leave Modal Form & Controls
    const leaveModal = document.getElementById("leave-modal");
    const modalCloseBtn = document.getElementById("modal-close-btn");
    const modalCancelBtn = document.getElementById("modal-cancel-btn");
    const leaveForm = document.getElementById("leave-application-form");

    if (modalCloseBtn) modalCloseBtn.addEventListener("click", () => this.closeLeaveModal());
    if (modalCancelBtn) modalCancelBtn.addEventListener("click", () => this.closeLeaveModal());
    if (leaveModal) {
      leaveModal.addEventListener("click", (e) => {
        if (e.target === leaveModal) this.closeLeaveModal();
      });
    }

    if (leaveForm) {
      leaveForm.addEventListener("submit", (e) => this.handleLeaveSubmit(e));
    }

    // Date range inputs change preview
    const startDateInput = document.getElementById("leave-start-date");
    const endDateInput = document.getElementById("leave-end-date");
    const leaveTypeSelect = document.getElementById("leave-type-select");

    const updateCalcPreview = () => this.updateLeaveDurationCalculation();
    if (startDateInput) startDateInput.addEventListener("change", updateCalcPreview);
    if (endDateInput) endDateInput.addEventListener("change", updateCalcPreview);
    if (leaveTypeSelect) leaveTypeSelect.addEventListener("change", updateCalcPreview);

    // Directory Search and Filters
    const searchInput = document.getElementById("directory-search-input");
    const deptFilter = document.getElementById("department-filter");
    const statusFilter = document.getElementById("status-filter");

    if (searchInput) searchInput.addEventListener("input", () => this.renderTeamDirectory());
    if (deptFilter) deptFilter.addEventListener("change", () => this.renderTeamDirectory());
    if (statusFilter) statusFilter.addEventListener("change", () => this.renderTeamDirectory());

    // Export CSV
    const exportBtn = document.getElementById("btn-export-attendance");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => this.exportAttendanceCSV());
    }

    // Leave Records Table Filter Chips
    const leaveFilterChips = document.querySelectorAll(".filter-chip");
    leaveFilterChips.forEach(chip => {
      chip.addEventListener("click", () => {
        leaveFilterChips.forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        this.renderAllLeaveRequests(chip.dataset.leaveFilter);
      });
    });

    // Colleague Inspector Modal Close
    const colModal = document.getElementById("colleague-modal");
    const colModalClose = document.getElementById("colleague-modal-close");
    const colModalCloseBtn = document.getElementById("colleague-modal-close-btn");
    const colActAsBtn = document.getElementById("colleague-act-as-btn");

    const closeColModal = () => {
      if (colModal) colModal.classList.remove("open");
    };
    if (colModalClose) colModalClose.addEventListener("click", closeColModal);
    if (colModalCloseBtn) colModalCloseBtn.addEventListener("click", closeColModal);
    if (colModal) {
      colModal.addEventListener("click", (e) => {
        if (e.target === colModal) closeColModal();
      });
    }

    if (colActAsBtn) {
      colActAsBtn.addEventListener("click", () => {
        const inspectedId = colModal.dataset.inspectedId;
        if (inspectedId) {
          this.currentEmployeeId = inspectedId;
          this.saveState();
          closeColModal();
          this.renderAll();
          // switch to desk tab
          const deskTab = document.getElementById("tab-btn-my-desk");
          if (deskTab) deskTab.click();
          const emp = this.getCurrentEmployee();
          this.showToast(`Switched active profile to ${emp.name}`, "success");
        }
      });
    }
  }

  // ============================================================================
  // Punch Actions
  // ============================================================================
  handlePunchCheckIn() {
    const emp = this.getCurrentEmployee();

    // Guard: Check if employee is officially on scheduled leave today
    if (emp.today.status.includes("LEAVE") || emp.today.status === "HOLIDAY") {
      const leaveLabel = emp.today.status === "MEDICAL_LEAVE" ? "Medical Leave" : (emp.today.status === "EMERGENCY_LEAVE" ? "Emergency Leave" : "Holiday");
      if (!confirm(`You are officially scheduled on ${leaveLabel} today. Do you wish to override and record an active Check-In?`)) {
        return;
      }
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    // Read selected location mode
    const modeRadio = document.querySelector('input[name="workMode"]:checked');
    const mode = modeRadio ? modeRadio.value : "Office";

    emp.today.checkInTime = timeStr;
    emp.today.checkOutTime = null;
    emp.today.workMode = mode;
    emp.today.status = mode === "Remote" ? "REMOTE" : "CHECKED_IN";
    emp.today.startTimestamp = Date.now();
    emp.today.onBreak = false;
    emp.today.breakMinutes = 0;

    this.saveState();
    this.playChime("success");
    this.renderAll();
    this.showToast(`Checked in successfully at ${timeStr} (${mode})!`, "success");
  }

  handlePunchCheckOut() {
    const emp = this.getCurrentEmployee();
    if (emp.today.status !== "CHECKED_IN" && emp.today.status !== "REMOTE") {
      this.showToast("You are not currently checked in.", "warning");
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    emp.today.checkOutTime = timeStr;
    emp.today.status = "CHECKED_OUT";
    emp.today.onBreak = false; // Reset break state cleanly

    // Calculate hours worked
    let totalMinutes = 0;
    if (emp.today.startTimestamp) {
      const elapsedMs = Math.max(0, Date.now() - emp.today.startTimestamp);
      totalMinutes = Math.floor(elapsedMs / (1000 * 60)) - (emp.today.breakMinutes || 0);
      if (totalMinutes < 0) totalMinutes = 0;
    }

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const durationFormatted = `${hours}h ${mins}m`;

    // Add to history
    const dateFormatted = now.toISOString().split("T")[0];
    emp.history.unshift({
      date: dateFormatted,
      checkIn: emp.today.checkInTime,
      checkOut: timeStr,
      hours: durationFormatted,
      status: emp.today.workMode,
      mode: emp.today.workMode === "Remote" ? "Remote" : "In-Office"
    });

    emp.today.startTimestamp = null;

    this.saveState();
    this.playChime("checkout");
    this.renderAll();
    this.showToast(`Checked out at ${timeStr}. Total time: ${durationFormatted}. Have a great evening!`, "success");
  }

  handleBreakToggle() {
    const emp = this.getCurrentEmployee();
    if (emp.today.status !== "CHECKED_IN" && emp.today.status !== "REMOTE") {
      return;
    }

    emp.today.onBreak = !emp.today.onBreak;
    if (emp.today.onBreak) {
      emp.today.breakMinutes = (emp.today.breakMinutes || 0) + 15;
      this.playChime("break");
      this.showToast("Break started. Enjoy your pause ☕", "warning");
    } else {
      this.playChime("break");
      this.showToast("Welcome back! Break ended.", "success");
    }

    this.saveState();
    this.renderMyDesk();
    this.renderTeamDirectory();
  }

  // ============================================================================
  // Leave Application Logic
  // ============================================================================
  openLeaveModal(presetType = null) {
    const modal = document.getElementById("leave-modal");
    const applicantDisplay = document.getElementById("modal-applicant-display");
    const typeSelect = document.getElementById("leave-type-select");
    const startDate = document.getElementById("leave-start-date");
    const endDate = document.getElementById("leave-end-date");
    const reasonInput = document.getElementById("leave-reason");
    const contactInput = document.getElementById("leave-contact");

    const emp = this.getCurrentEmployee();

    if (applicantDisplay) {
      applicantDisplay.innerHTML = `
        <img src="${this.escapeHtml(emp.avatar)}" alt="${this.escapeHtml(emp.name)}" class="avatar-sm">
        <div>
          <div style="font-weight:700; color:var(--text-heading);">${this.escapeHtml(emp.name)}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHtml(emp.role)} • ${this.escapeHtml(emp.department)}</div>
        </div>
      `;
    }

    // Set today as default start & end
    const todayStr = new Date().toISOString().split("T")[0];
    if (startDate) startDate.value = todayStr;
    if (endDate) endDate.value = todayStr;
    if (reasonInput) reasonInput.value = "";
    if (contactInput) contactInput.value = "";

    if (typeSelect && presetType) {
      typeSelect.value = presetType;
    }

    this.updateLeaveDurationCalculation();

    if (modal) modal.classList.add("open");
  }

  closeLeaveModal() {
    const modal = document.getElementById("leave-modal");
    if (modal) modal.classList.remove("open");
  }

  updateLeaveDurationCalculation() {
    const startInput = document.getElementById("leave-start-date");
    const endInput = document.getElementById("leave-end-date");
    const typeSelect = document.getElementById("leave-type-select");
    const calcText = document.getElementById("modal-calculated-days");
    const balanceCheck = document.getElementById("modal-balance-check");

    if (!startInput || !endInput || !typeSelect || !calcText || !balanceCheck) return;

    const diffDays = this.calcInclusiveDays(startInput.value, endInput.value);
    const emp = this.getCurrentEmployee();

    if (diffDays <= 0) {
      calcText.textContent = "Invalid date range";
      balanceCheck.textContent = "End date must be after or same as start date";
      balanceCheck.style.color = "var(--rose-500)";
      return;
    }

    calcText.textContent = `${diffDays} Day${diffDays > 1 ? "s" : ""}`;

    const typeKey = typeSelect.value.toLowerCase();
    const allocated = emp.quota[typeKey] || 0;
    const used = emp.used[typeKey] || 0;
    const remaining = Math.max(0, allocated - used);

    // Overlap check preview
    if (this.hasOverlappingLeave(emp.id, startInput.value, endInput.value)) {
      balanceCheck.textContent = "(Warning: You have an existing leave that overlaps with these dates)";
      balanceCheck.style.color = "var(--rose-500)";
      return;
    }

    if (diffDays <= remaining) {
      balanceCheck.textContent = `(Within your remaining quota: ${remaining} days available)`;
      balanceCheck.style.color = "var(--emerald-500)";
    } else {
      balanceCheck.textContent = `(Warning: Exceeds balance! Only ${remaining} days available)`;
      balanceCheck.style.color = "var(--rose-500)";
    }
  }

  handleLeaveSubmit(e) {
    e.preventDefault();

    const typeSelect = document.getElementById("leave-type-select");
    const startDateInput = document.getElementById("leave-start-date");
    const endDateInput = document.getElementById("leave-end-date");
    const reasonInput = document.getElementById("leave-reason");
    const contactInput = document.getElementById("leave-contact");

    const emp = this.getCurrentEmployee();
    const type = typeSelect.value;
    const typeKey = type.toLowerCase();
    const startStr = startDateInput.value;
    const endStr = endDateInput.value;

    const diffDays = this.calcInclusiveDays(startStr, endStr);
    if (diffDays <= 0) {
      this.showToast("Invalid date range. Start date must be before or equal to end date.", "danger");
      return;
    }

    // Check for conflicting overlapping leaves
    if (this.hasOverlappingLeave(emp.id, startStr, endStr)) {
      this.showToast("Conflicting dates: You already have an active leave booked during this interval.", "danger");
      return;
    }

    const remaining = (emp.quota[typeKey] || 0) - (emp.used[typeKey] || 0);
    if (diffDays > remaining) {
      if (!confirm(`This request for ${diffDays} days exceeds your available ${type} quota of ${remaining} days. Proceed as special approval?`)) {
        return;
      }
    }

    // Deduct quota
    emp.used[typeKey] = (emp.used[typeKey] || 0) + diffDays;

    // Create record with robust unique ID and sanitization
    const newRecord = {
      id: "LR-" + Date.now().toString(36).toUpperCase() + "-" + Math.floor(Math.random() * 900 + 100),
      employeeId: emp.id,
      employeeName: emp.name,
      type: type,
      startDate: startStr,
      endDate: endStr,
      days: diffDays,
      reason: reasonInput.value.trim(),
      contact: contactInput.value.trim() || emp.phone,
      appliedOn: new Date().toISOString().split("T")[0],
      status: "Approved"
    };

    this.leaveRequests.unshift(newRecord);

    // If leave covers today, update employee's today status
    const todayStr = new Date().toISOString().split("T")[0];
    if (todayStr >= startStr && todayStr <= endStr) {
      if (type === "Medical") {
        emp.today.status = "MEDICAL_LEAVE";
      } else if (type === "Emergency") {
        emp.today.status = "EMERGENCY_LEAVE";
      } else {
        emp.today.status = "HOLIDAY";
      }
      emp.today.checkInTime = null;
      emp.today.checkOutTime = null;
      emp.today.leaveReason = newRecord.reason;
      emp.today.startTimestamp = null;
    }

    this.saveState();
    this.closeLeaveModal();
    this.playChime("success");
    this.renderAll();
    this.showToast(`${type} Leave applied for ${diffDays} day(s). Approved and balance updated!`, "success");
  }

  // ============================================================================
  // Rendering Methods
  // ============================================================================
  renderAll() {
    this.populateUserDropdown();
    this.renderMetrics();
    this.renderMyDesk();
    this.renderTeamDirectory();
    this.renderLeaveManagementTab();
    this.renderHolidayCalendarTab();
  }

  populateUserDropdown() {
    const dropdown = document.getElementById("employee-switcher-select");
    if (!dropdown) return;

    dropdown.innerHTML = this.employees.map(emp => `
      <option value="${this.escapeHtml(emp.id)}" ${emp.id === this.currentEmployeeId ? "selected" : ""}>
        ${this.escapeHtml(emp.name)} (${this.escapeHtml(emp.department)})
      </option>
    `).join("");
  }

  renderMetrics() {
    let presentCount = 0;
    let medicalCount = 0;
    let emergencyCount = 0;
    let holidayCount = 0;

    this.employees.forEach(e => {
      if (e.today.status === "CHECKED_IN" || e.today.status === "REMOTE") {
        presentCount++;
      } else if (e.today.status === "MEDICAL_LEAVE") {
        medicalCount++;
      } else if (e.today.status === "EMERGENCY_LEAVE") {
        emergencyCount++;
      } else if (e.today.status === "HOLIDAY") {
        holidayCount++;
      }
    });

    const total = this.employees.length;
    const percent = Math.round((presentCount / total) * 100);

    const elemPresent = document.getElementById("metric-present-count");
    const elemPresentTotal = document.getElementById("metric-present-total");
    const elemPresentPct = document.getElementById("metric-present-percent");
    const elemMedical = document.getElementById("metric-medical-count");
    const elemEmergency = document.getElementById("metric-emergency-count");
    const elemHoliday = document.getElementById("metric-holiday-count");
    const navBadgeCount = document.getElementById("active-in-office-count");

    if (elemPresent) elemPresent.textContent = presentCount;
    if (elemPresentTotal) elemPresentTotal.textContent = `/ ${total} active`;
    if (elemPresentPct) elemPresentPct.textContent = `${percent}% active presence`;
    if (elemMedical) elemMedical.textContent = medicalCount;
    if (elemEmergency) elemEmergency.textContent = emergencyCount;
    if (elemHoliday) elemHoliday.textContent = holidayCount;
    if (navBadgeCount) navBadgeCount.textContent = presentCount;
  }

  renderMyDesk() {
    const emp = this.getCurrentEmployee();

    // User tag
    const avatar = document.getElementById("current-user-avatar");
    const nameElem = document.getElementById("current-user-name");
    const roleElem = document.getElementById("current-user-role");

    if (avatar) avatar.src = emp.avatar;
    if (nameElem) nameElem.textContent = emp.name;
    if (roleElem) roleElem.textContent = `${emp.role} • ${emp.department}`;

    // Status Pill & Dot
    const statusDot = document.getElementById("punch-status-dot");
    const statusText = document.getElementById("punch-status-text");
    const checkInBtn = document.getElementById("btn-check-in");
    const checkOutBtn = document.getElementById("btn-check-out");
    const breakBtn = document.getElementById("btn-break-toggle");
    const breakIcon = document.getElementById("break-btn-icon");
    const breakLabel = document.getElementById("break-btn-text");

    const entryTimeElem = document.getElementById("today-entry-time");
    const exitTimeElem = document.getElementById("today-exit-time");
    const totalHoursElem = document.getElementById("today-total-hours");
    const breakDurationElem = document.getElementById("today-break-duration");

    if (entryTimeElem) entryTimeElem.textContent = emp.today.checkInTime || "--:--";
    if (exitTimeElem) exitTimeElem.textContent = emp.today.checkOutTime || "--:--";
    if (breakDurationElem) breakDurationElem.textContent = `${emp.today.breakMinutes || 0}m`;

    if (statusDot) {
      statusDot.className = "status-indicator-dot";
    }

    if (emp.today.status === "CHECKED_IN" || emp.today.status === "REMOTE") {
      if (emp.today.onBreak) {
        if (statusDot) statusDot.classList.add("break");
        if (statusText) statusText.textContent = "On Break ☕";
      } else {
        if (statusDot) statusDot.classList.add("active");
        if (statusText) statusText.textContent = emp.today.status === "REMOTE" ? "Active (Working Remotely)" : "Active (In-Office Desk)";
      }

      if (checkInBtn) checkInBtn.disabled = true;
      if (checkOutBtn) checkOutBtn.disabled = false;
      if (breakBtn) {
        breakBtn.disabled = false;
        if (emp.today.onBreak) {
          if (breakIcon) breakIcon.textContent = "▶";
          if (breakLabel) breakLabel.textContent = "Resume Work (End Break)";
        } else {
          if (breakIcon) breakIcon.textContent = "☕";
          if (breakLabel) breakLabel.textContent = "Take Break (Lunch / Coffee)";
        }
      }
      if (totalHoursElem) totalHoursElem.textContent = "In Progress";
    } else if (emp.today.status === "CHECKED_OUT") {
      if (statusText) statusText.textContent = "Day Completed (Checked Out)";
      if (checkInBtn) checkInBtn.disabled = false;
      if (checkOutBtn) checkOutBtn.disabled = true;
      if (breakBtn) breakBtn.disabled = true;
      if (totalHoursElem) totalHoursElem.textContent = emp.history[0]?.hours || "Completed";
    } else if (emp.today.status === "MEDICAL_LEAVE") {
      if (statusDot) statusDot.classList.add("leave");
      if (statusText) statusText.textContent = "On Medical Leave 🩺";
      if (checkInBtn) checkInBtn.disabled = false;
      if (checkOutBtn) checkOutBtn.disabled = true;
      if (breakBtn) breakBtn.disabled = true;
      if (totalHoursElem) totalHoursElem.textContent = "Medical Excused";
    } else if (emp.today.status === "EMERGENCY_LEAVE") {
      if (statusDot) statusDot.classList.add("leave");
      if (statusText) statusText.textContent = "On Emergency Leave 🚨";
      if (checkInBtn) checkInBtn.disabled = false;
      if (checkOutBtn) checkOutBtn.disabled = true;
      if (breakBtn) breakBtn.disabled = true;
      if (totalHoursElem) totalHoursElem.textContent = "Emergency Excused";
    } else if (emp.today.status === "HOLIDAY") {
      if (statusDot) statusDot.classList.add("leave");
      if (statusText) statusText.textContent = "On Paid Vacation / Holiday 🏖️";
      if (checkInBtn) checkInBtn.disabled = false;
      if (checkOutBtn) checkOutBtn.disabled = true;
      if (breakBtn) breakBtn.disabled = true;
      if (totalHoursElem) totalHoursElem.textContent = "Holiday";
    } else {
      if (statusText) statusText.textContent = "Not Checked In Today";
      if (checkInBtn) checkInBtn.disabled = false;
      if (checkOutBtn) checkOutBtn.disabled = true;
      if (breakBtn) breakBtn.disabled = true;
      if (totalHoursElem) totalHoursElem.textContent = "0h 0m";
    }

    // Set radio buttons according to current workMode
    const officeRadio = document.getElementById("mode-office");
    const remoteRadio = document.getElementById("mode-remote");
    if (emp.today.workMode === "Remote") {
      if (remoteRadio) remoteRadio.checked = true;
    } else {
      if (officeRadio) officeRadio.checked = true;
    }

    // Render Quota Progress Bars
    this.renderLeaveQuotaBars(emp);

    // Render Recent Punch Logs Table
    this.renderRecentHistoryTable(emp);
  }

  renderLeaveQuotaBars(emp) {
    const holidayRatio = document.getElementById("user-holiday-ratio");
    const holidayBar = document.getElementById("user-holiday-progress");
    const holidayRem = document.getElementById("user-holiday-remaining");

    const medicalRatio = document.getElementById("user-medical-ratio");
    const medicalBar = document.getElementById("user-medical-progress");
    const medicalRem = document.getElementById("user-medical-remaining");

    const emergencyRatio = document.getElementById("user-emergency-ratio");
    const emergencyBar = document.getElementById("user-emergency-progress");
    const emergencyRem = document.getElementById("user-emergency-remaining");

    const hUsed = emp.used.holiday || 0;
    const hTotal = emp.quota.holiday || 12;
    const hRem = Math.max(0, hTotal - hUsed);
    if (holidayRatio) holidayRatio.textContent = `${hUsed} / ${hTotal} Days Taken`;
    if (holidayBar) holidayBar.style.width = `${Math.min(100, Math.round((hUsed / hTotal) * 100))}%`;
    if (holidayRem) holidayRem.textContent = `${hRem} days available`;

    const mUsed = emp.used.medical || 0;
    const mTotal = emp.quota.medical || 14;
    const mRem = Math.max(0, mTotal - mUsed);
    if (medicalRatio) medicalRatio.textContent = `${mUsed} / ${mTotal} Days Taken`;
    if (medicalBar) medicalBar.style.width = `${Math.min(100, Math.round((mUsed / mTotal) * 100))}%`;
    if (medicalRem) medicalRem.textContent = `${mRem} days available`;

    const eUsed = emp.used.emergency || 0;
    const eTotal = emp.quota.emergency || 7;
    const eRem = Math.max(0, eTotal - eUsed);
    if (emergencyRatio) emergencyRatio.textContent = `${eUsed} / ${eTotal} Days Taken`;
    if (emergencyBar) emergencyBar.style.width = `${Math.min(100, Math.round((eUsed / eTotal) * 100))}%`;
    if (emergencyRem) emergencyRem.textContent = `${eRem} days available`;
  }

  renderRecentHistoryTable(emp) {
    const tbody = document.getElementById("my-punch-history-tbody");
    if (!tbody) return;

    if (!emp.history || emp.history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:1.5rem;">No recent punch history found.</td></tr>`;
      return;
    }

    tbody.innerHTML = emp.history.map(row => `
      <tr>
        <td class="mono-time">${this.escapeHtml(row.date)}</td>
        <td class="mono-time">${this.escapeHtml(row.checkIn)}</td>
        <td class="mono-time">${this.escapeHtml(row.checkOut || "--:--")}</td>
        <td style="font-weight:700; color:var(--emerald-500);">${this.escapeHtml(row.hours)}</td>
        <td>
          <span class="status-badge ${row.mode === "Remote" ? "badge-remote" : "badge-in-office"}">
            ${row.mode === "Remote" ? "🏡 Remote" : "🏢 Office"}
          </span>
        </td>
      </tr>
    `).join("");
  }

  // ============================================================================
  // Tab 2: Team Attendance Directory ("Who's in Today")
  // ============================================================================
  renderTeamDirectory() {
    const tbody = document.getElementById("team-directory-tbody");
    if (!tbody) return;

    const searchVal = (document.getElementById("directory-search-input")?.value || "").toLowerCase().trim();
    const deptVal = document.getElementById("department-filter")?.value || "ALL";
    const statusVal = document.getElementById("status-filter")?.value || "ALL";

    const filtered = this.employees.filter(emp => {
      // Search text filter
      const matchesSearch = !searchVal ||
        emp.name.toLowerCase().includes(searchVal) ||
        emp.role.toLowerCase().includes(searchVal) ||
        emp.department.toLowerCase().includes(searchVal);

      // Dept filter
      const matchesDept = deptVal === "ALL" || emp.department === deptVal;

      // Status filter
      let matchesStatus = true;
      if (statusVal !== "ALL") {
        matchesStatus = emp.today.status === statusVal;
      }

      return matchesSearch && matchesDept && matchesStatus;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; color:var(--text-muted); padding:2.5rem;">
            No employees found matching the selected filter criteria.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(emp => {
      // Format status badge & text
      let statusBadge = "";
      let durationDisplay = "--";
      let activeLeaveInfo = "None";

      if (emp.today.status === "CHECKED_IN") {
        statusBadge = `<span class="status-badge badge-in-office">🟢 In-Office</span>`;
        durationDisplay = emp.today.startTimestamp ? this.formatElapsed(emp.today.startTimestamp, emp.today.breakMinutes) : "Active";
      } else if (emp.today.status === "REMOTE") {
        statusBadge = `<span class="status-badge badge-remote">🏡 Remote</span>`;
        durationDisplay = emp.today.startTimestamp ? this.formatElapsed(emp.today.startTimestamp, emp.today.breakMinutes) : "Active";
      } else if (emp.today.status === "MEDICAL_LEAVE") {
        statusBadge = `<span class="status-badge badge-medical">🩺 Medical Leave</span>`;
        activeLeaveInfo = `<span style="color:var(--amber-500); font-weight:600;">Medical (${this.escapeHtml(emp.today.leaveReason || "Illness")})</span>`;
      } else if (emp.today.status === "EMERGENCY_LEAVE") {
        statusBadge = `<span class="status-badge badge-emergency">🚨 Emergency Leave</span>`;
        activeLeaveInfo = `<span style="color:var(--rose-500); font-weight:600;">Urgent Absence</span>`;
      } else if (emp.today.status === "HOLIDAY") {
        statusBadge = `<span class="status-badge badge-holiday">🏖️ On Holiday</span>`;
        activeLeaveInfo = `<span style="color:var(--cyan-500); font-weight:600;">Vacation / Paid Time</span>`;
      } else if (emp.today.status === "CHECKED_OUT") {
        statusBadge = `<span class="status-badge badge-checked-out">🔴 Checked Out</span>`;
        durationDisplay = emp.history[0]?.hours || "Completed";
      } else {
        statusBadge = `<span class="status-badge badge-not-checked">⚪ Not Checked In</span>`;
      }

      return `
        <tr>
          <td>
            <div class="emp-cell">
              <img src="${this.escapeHtml(emp.avatar)}" alt="${this.escapeHtml(emp.name)}" class="emp-avatar">
              <div>
                <div class="emp-name">${this.escapeHtml(emp.name)} ${emp.id === this.currentEmployeeId ? "<span style='font-size:0.7rem; color:var(--primary-500);'>(You)</span>" : ""}</div>
                <div class="emp-dept">${this.escapeHtml(emp.id)}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="font-weight:600; color:var(--text-heading);">${this.escapeHtml(emp.department)}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHtml(emp.role)}</div>
          </td>
          <td>${statusBadge}</td>
          <td class="mono-time">${this.escapeHtml(emp.today.checkInTime || "--:--")}</td>
          <td class="mono-time">${this.escapeHtml(emp.today.checkOutTime || "--:--")}</td>
          <td style="font-weight:700; color:var(--emerald-500);">${durationDisplay}</td>
          <td>${activeLeaveInfo}</td>
          <td>
            <button class="view-profile-btn" onclick="window.appInstance.inspectColleague('${this.escapeHtml(emp.id)}')">
              View Profile 👤
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  formatElapsed(startTimestamp, breakMinutes = 0) {
    const elapsedMs = Math.max(0, Date.now() - startTimestamp);
    let totalMins = Math.floor(elapsedMs / (1000 * 60)) - breakMinutes;
    if (totalMins < 0) totalMins = 0;
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `${hours}h ${mins}m`;
  }

  // ============================================================================
  // Colleague Inspector Modal
  // ============================================================================
  inspectColleague(employeeId) {
    const colModal = document.getElementById("colleague-modal");
    const emp = this.employees.find(e => e.id === employeeId);
    if (!colModal || !emp) return;

    colModal.dataset.inspectedId = emp.id;

    const avatar = document.getElementById("colleague-avatar");
    const title = document.getElementById("colleague-modal-title");
    const statusBadge = document.getElementById("colleague-status-badge");
    const roleDept = document.getElementById("colleague-role-dept");
    const emailElem = document.getElementById("colleague-email");

    const checkInElem = document.getElementById("colleague-checkin-time");
    const checkOutElem = document.getElementById("colleague-checkout-time");
    const durationElem = document.getElementById("colleague-total-duration");
    const modeElem = document.getElementById("colleague-work-mode");

    const holidaysTookElem = document.getElementById("colleague-holidays-took");
    const medicalTookElem = document.getElementById("colleague-medical-took");
    const emergencyTookElem = document.getElementById("colleague-emergency-took");

    const historyTbody = document.getElementById("colleague-history-tbody");
    const leavesList = document.getElementById("colleague-leaves-list");

    if (avatar) avatar.src = emp.avatar;
    if (title) title.textContent = emp.name;
    if (roleDept) roleDept.textContent = `${emp.role} • ${emp.department} (${emp.id})`;
    if (emailElem) emailElem.textContent = `${emp.email} • ${emp.phone}`;

    // Status badge
    if (statusBadge) {
      statusBadge.className = "status-badge";
      if (emp.today.status === "CHECKED_IN") {
        statusBadge.classList.add("badge-in-office");
        statusBadge.textContent = "🟢 In-Office Present";
      } else if (emp.today.status === "REMOTE") {
        statusBadge.classList.add("badge-remote");
        statusBadge.textContent = "🏡 Remote Present";
      } else if (emp.today.status === "MEDICAL_LEAVE") {
        statusBadge.classList.add("badge-medical");
        statusBadge.textContent = "🩺 Medical Leave";
      } else if (emp.today.status === "EMERGENCY_LEAVE") {
        statusBadge.classList.add("badge-emergency");
        statusBadge.textContent = "🚨 Emergency Leave";
      } else if (emp.today.status === "HOLIDAY") {
        statusBadge.classList.add("badge-holiday");
        statusBadge.textContent = "🏖️ On Holiday";
      } else if (emp.today.status === "CHECKED_OUT") {
        statusBadge.classList.add("badge-checked-out");
        statusBadge.textContent = "🔴 Checked Out";
      } else {
        statusBadge.classList.add("badge-not-checked");
        statusBadge.textContent = "⚪ Not Checked In";
      }
    }

    if (checkInElem) checkInElem.textContent = emp.today.checkInTime || "--:--";
    if (checkOutElem) checkOutElem.textContent = emp.today.checkOutTime || "--:--";
    if (durationElem) durationElem.textContent = emp.today.startTimestamp ? this.formatElapsed(emp.today.startTimestamp, emp.today.breakMinutes) : (emp.history[0]?.hours || "--");
    if (modeElem) modeElem.textContent = emp.today.workMode || "Office";

    if (holidaysTookElem) holidaysTookElem.textContent = `${emp.used.holiday || 0} / ${emp.quota.holiday || 12} Days`;
    if (medicalTookElem) medicalTookElem.textContent = `${emp.used.medical || 0} / ${emp.quota.medical || 14} Days`;
    if (emergencyTookElem) emergencyTookElem.textContent = `${emp.used.emergency || 0} / ${emp.quota.emergency || 7} Days`;

    // Populate recent history
    if (historyTbody) {
      if (!emp.history || emp.history.length === 0) {
        historyTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:1rem;">No past records available.</td></tr>`;
      } else {
        historyTbody.innerHTML = emp.history.map(row => `
          <tr>
            <td class="mono-time">${this.escapeHtml(row.date)}</td>
            <td class="mono-time">${this.escapeHtml(row.checkIn)}</td>
            <td class="mono-time">${this.escapeHtml(row.checkOut || "--:--")}</td>
            <td style="font-weight:700; color:var(--emerald-500);">${this.escapeHtml(row.hours)}</td>
            <td>
              <span class="status-badge ${row.mode === "Remote" ? "badge-remote" : "badge-in-office"}">
                ${this.escapeHtml(row.mode)}
              </span>
            </td>
          </tr>
        `).join("");
      }
    }

    // Populate specific leaves
    if (leavesList) {
      const empLeaves = this.leaveRequests.filter(l => l.employeeId === emp.id);
      if (empLeaves.length === 0) {
        leavesList.innerHTML = `<div style="font-size:0.85rem; color:var(--text-muted); padding:0.5rem 0;">No leave applications on file.</div>`;
      } else {
        leavesList.innerHTML = empLeaves.map(lr => `
          <div class="colleague-leave-row">
            <div>
              <strong style="color:var(--text-heading);">${this.escapeHtml(lr.type)} Leave (${lr.days} Day${lr.days > 1 ? "s" : ""})</strong>
              <div style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHtml(lr.startDate)} to ${this.escapeHtml(lr.endDate)} • "${this.escapeHtml(lr.reason)}"</div>
            </div>
            <span class="status-badge ${lr.type === "Medical" ? "badge-medical" : (lr.type === "Emergency" ? "badge-emergency" : "badge-holiday")}">
              ${this.escapeHtml(lr.status)}
            </span>
          </div>
        `).join("");
      }
    }

    colModal.classList.add("open");
  }

  // ============================================================================
  // Tab 3: Leave Management & Tracker
  // ============================================================================
  renderLeaveManagementTab() {
    const emp = this.getCurrentEmployee();

    // Update Hero Cards stats for active employee
    const medAlloc = document.getElementById("card-medical-allocated");
    const medUsed = document.getElementById("card-medical-used");
    const medAvail = document.getElementById("card-medical-available");

    const emerAlloc = document.getElementById("card-emergency-allocated");
    const emerUsed = document.getElementById("card-emergency-used");
    const emerAvail = document.getElementById("card-emergency-available");

    const holAlloc = document.getElementById("card-holiday-allocated");
    const holUsed = document.getElementById("card-holiday-used");
    const holAvail = document.getElementById("card-holiday-available");

    if (medAlloc) medAlloc.textContent = emp.quota.medical || 14;
    if (medUsed) medUsed.textContent = emp.used.medical || 0;
    if (medAvail) medAvail.textContent = Math.max(0, (emp.quota.medical || 14) - (emp.used.medical || 0));

    if (emerAlloc) emerAlloc.textContent = emp.quota.emergency || 7;
    if (emerUsed) emerUsed.textContent = emp.used.emergency || 0;
    if (emerAvail) emerAvail.textContent = Math.max(0, (emp.quota.emergency || 7) - (emp.used.emergency || 0));

    if (holAlloc) holAlloc.textContent = emp.quota.holiday || 12;
    if (holUsed) holUsed.textContent = emp.used.holiday || 0;
    if (holAvail) holAvail.textContent = Math.max(0, (emp.quota.holiday || 12) - (emp.used.holiday || 0));

    this.renderAllLeaveRequests("ALL");
  }

  renderAllLeaveRequests(filterType = "ALL") {
    const tbody = document.getElementById("all-leaves-tbody");
    if (!tbody) return;

    const filtered = this.leaveRequests.filter(req => {
      if (filterType === "ALL") return true;
      return req.type.toLowerCase() === filterType.toLowerCase();
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:2rem;">No leave records found for this category.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(req => {
      let badgeClass = "badge-holiday";
      let icon = "🏖️";
      if (req.type === "Medical") {
        badgeClass = "badge-medical";
        icon = "🩺";
      } else if (req.type === "Emergency") {
        badgeClass = "badge-emergency";
        icon = "🚨";
      }

      return `
        <tr>
          <td>
            <div style="font-weight:700; color:var(--text-heading);">${this.escapeHtml(req.employeeName)}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHtml(req.employeeId)}</div>
          </td>
          <td>
            <span class="status-badge ${badgeClass}">${icon} ${this.escapeHtml(req.type)}</span>
          </td>
          <td class="mono-time">${this.escapeHtml(req.startDate)}</td>
          <td class="mono-time">${this.escapeHtml(req.endDate)}</td>
          <td style="font-family:var(--font-mono); font-weight:700;">${req.days} Day${req.days > 1 ? "s" : ""}</td>
          <td>
            <div style="max-width:260px; font-size:0.85rem; color:var(--text-secondary);">${this.escapeHtml(req.reason)}</div>
            ${req.contact ? `<div style="font-size:0.72rem; color:var(--text-muted);">Ref: ${this.escapeHtml(req.contact)}</div>` : ""}
          </td>
          <td class="mono-time" style="color:var(--text-muted); font-size:0.78rem;">${this.escapeHtml(req.appliedOn)}</td>
          <td>
            <span class="status-badge badge-in-office">✓ ${this.escapeHtml(req.status)}</span>
          </td>
        </tr>
      `;
    }).join("");
  }

  // ============================================================================
  // Tab 4: Holidays & Company Calendar
  // ============================================================================
  renderHolidayCalendarTab() {
    const holidaysList = document.getElementById("public-holidays-list");
    const feed = document.getElementById("team-vacations-feed");

    if (holidaysList) {
      holidaysList.innerHTML = PUBLIC_HOLIDAYS_2026.map(h => `
        <div class="holiday-item">
          <div class="holiday-date-badge">
            <span class="holiday-day">${this.escapeHtml(h.day)}</span>
            <span class="holiday-month">${this.escapeHtml(h.month)}</span>
          </div>
          <div class="holiday-info">
            <div class="holiday-name">${this.escapeHtml(h.name)}</div>
            <div class="holiday-weekday">${this.escapeHtml(h.weekday)} • Official Office Closure</div>
          </div>
          <span class="status-badge ${h.status === 'Upcoming' ? 'badge-remote' : 'badge-checked-out'}">
            ${this.escapeHtml(h.status)}
          </span>
        </div>
      `).join("");
    }

    if (feed) {
      const vacationLeaves = this.leaveRequests.filter(l => l.type === "Holiday");
      if (vacationLeaves.length === 0) {
        feed.innerHTML = `<div style="color:var(--text-muted); padding:1rem;">No upcoming team vacations scheduled.</div>`;
      } else {
        feed.innerHTML = vacationLeaves.map(vl => {
          const emp = this.employees.find(e => e.id === vl.employeeId) || { avatar: "", role: "Team Member" };
          return `
            <div class="feed-item">
              <img src="${this.escapeHtml(emp.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100')}" alt="${this.escapeHtml(vl.employeeName)}" class="feed-avatar">
              <div class="feed-body">
                <div class="feed-name">${this.escapeHtml(vl.employeeName)}</div>
                <div class="feed-detail">${this.escapeHtml(vl.startDate)} to ${this.escapeHtml(vl.endDate)} (${vl.days} days) • "${this.escapeHtml(vl.reason)}"</div>
              </div>
              <span class="feed-tag badge-holiday">🏖️ Vacation</span>
            </div>
          `;
        }).join("");
      }
    }
  }

  // ============================================================================
  // Export CSV Feature (RFC-4180 Compliant Escaping)
  // ============================================================================
  exportAttendanceCSV() {
    const headers = ["Employee ID", "Name", "Department", "Role", "Today Status", "Check-In", "Check-Out", "Holidays Used", "Medical Used", "Emergency Used"];
    const rows = this.employees.map(e => [
      this.escapeCsv(e.id),
      this.escapeCsv(e.name),
      this.escapeCsv(e.department),
      this.escapeCsv(e.role),
      this.escapeCsv(e.today.status),
      this.escapeCsv(e.today.checkInTime || ""),
      this.escapeCsv(e.today.checkOutTime || ""),
      e.used.holiday || 0,
      e.used.medical || 0,
      e.used.emergency || 0
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `PulseAttend_Report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.showToast("Attendance CSV report exported successfully!", "success");
  }

  // ============================================================================
  // Autonomous Test Suite & Verification Oracle
  // ============================================================================
  runDiagnosticTestSuite() {
    const results = [];
    const assert = (id, name, category, condition, details = "") => {
      results.push({ id, name, category, passed: Boolean(condition), details: String(details) });
    };

    // Category: Date & Leave Math
    const d1 = this.calcInclusiveDays("2026-10-24", "2026-10-24");
    assert("TS-01", "Single-day leave calculation", "Date Calculations", d1 === 1, `Expected 1, got ${d1}`);

    const d2 = this.calcInclusiveDays("2026-10-24", "2026-10-28");
    assert("TS-02", "Multi-day leave calculation", "Date Calculations", d2 === 5, `Expected 5, got ${d2}`);

    const d3 = this.calcInclusiveDays("2026-10-28", "2026-10-24");
    assert("TS-03", "Reversed date range rejection", "Date Calculations", d3 === 0, `Expected 0, got ${d3}`);

    const d4 = this.calcInclusiveDays("invalid-date", "2026-10-24");
    assert("TS-04", "Malformed date input rejection", "Date Calculations", d4 === 0, `Expected 0, got ${d4}`);

    // Category: Security & Sanitization
    const rawXss = '<script>alert("xss")</script>';
    const sanitized = this.escapeHtml(rawXss);
    assert("TS-05", "Stored XSS tag neutralization", "Security", !sanitized.includes("<script>") && sanitized.includes("&lt;script&gt;"), sanitized);

    const dirtyCsv = 'Hello, "World"';
    const escapedCsv = this.escapeCsv(dirtyCsv);
    assert("TS-06", "RFC-4180 CSV quote escaping", "Security & Data", escapedCsv === '"Hello, ""World"""', escapedCsv);

    // Category: Quota Invariants
    let quotasValid = true;
    this.employees.forEach(e => {
      if (e.quota.medical < 0 || e.quota.emergency < 0 || e.quota.holiday < 0) quotasValid = false;
    });
    assert("TS-07", "Employee quota non-negativity", "Leave Accounting", quotasValid, "All quotas >= 0");

    // Category: Overlap Conflict Prevention
    const hasOverlap = this.hasOverlappingLeave("EMP-104", "2026-10-24", "2026-10-25");
    assert("TS-08", "Existing leave overlap detection", "Leave Accounting", hasOverlap === true, "Detected overlap for EMP-104");

    const noOverlap = this.hasOverlappingLeave("EMP-104", "2026-11-15", "2026-11-16");
    assert("TS-09", "Non-overlapping leave allowance", "Leave Accounting", noOverlap === false, "Permitted valid future window");

    // Category: Attendance State Machine
    const validStatuses = ["CHECKED_IN", "REMOTE", "MEDICAL_LEAVE", "EMERGENCY_LEAVE", "HOLIDAY", "CHECKED_OUT", "NOT_CHECKED_IN"];
    let statusesValid = this.employees.every(e => validStatuses.includes(e.today.status));
    assert("TS-10", "Attendance status domain validity", "Attendance State", statusesValid, "All statuses in valid domain");

    // Category: Theme Consistency
    const domTheme = document.documentElement.getAttribute("data-theme");
    assert("TS-11", "DOM theme attribute validity", "UI & Theming", domTheme === "light" || domTheme === "dark", `Current: ${domTheme}`);

    // Category: Active User Reference
    const currentEmp = this.getCurrentEmployee();
    assert("TS-12", "Active employee entity exists", "State Integrity", currentEmp && currentEmp.id === this.currentEmployeeId, currentEmp?.id);

    // Category: Department Taxonomy
    const allowedDepts = ["Engineering", "Design", "Human Resources", "Marketing", "Product", "Sales & Ops"];
    const deptsValid = this.employees.every(e => allowedDepts.includes(e.department));
    assert("TS-13", "Employee department taxonomy integrity", "Data Schema", deptsValid, "All departments match enum");

    // Category: Break Deductions
    const breaksValid = this.employees.every(e => typeof e.today.breakMinutes === "number" && e.today.breakMinutes >= 0);
    assert("TS-14", "Break duration non-negative invariant", "Attendance State", breaksValid, "All breakMinutes >= 0");

    // Category: Presence Metric Boundedness
    let presentCount = 0;
    this.employees.forEach(e => {
      if (e.today.status === "CHECKED_IN" || e.today.status === "REMOTE") presentCount++;
    });
    const pct = Math.round((presentCount / this.employees.length) * 100);
    assert("TS-15", "Presence percentage bounded [0, 100]", "Calculations", pct >= 0 && pct <= 100, `${pct}%`);

    return results;
  }

  openDiagnosticsModal() {
    const modal = document.getElementById("diagnostics-modal");
    if (!modal) return;
    this.runAndRenderDiagnostics();
    modal.classList.add("open");
  }

  runAndRenderDiagnostics() {
    const modalBody = document.getElementById("diagnostics-modal-body");
    if (!modalBody) return;

    const t0 = performance.now();
    const suiteResults = this.runDiagnosticTestSuite();
    const elapsed = (performance.now() - t0).toFixed(2);

    const total = suiteResults.length;
    const passed = suiteResults.filter(r => r.passed).length;
    const failed = total - passed;

    modalBody.innerHTML = `
      <div class="colleague-stats-grid" style="margin-bottom:1.25rem;">
        <div class="mini-stat-card">
          <span class="mini-label">Total Test Assertions</span>
          <span class="mini-val">${total}</span>
        </div>
        <div class="mini-stat-card">
          <span class="mini-label">Passed Invariants</span>
          <span class="mini-val text-emerald">${passed}</span>
        </div>
        <div class="mini-stat-card">
          <span class="mini-label">Failed Invariants</span>
          <span class="mini-val ${failed > 0 ? 'text-rose' : 'text-emerald'}">${failed}</span>
        </div>
        <div class="mini-stat-card">
          <span class="mini-label">Execution Time</span>
          <span class="mini-val text-cyan">${elapsed}ms</span>
        </div>
      </div>

      <h4>Automated Test Oracle Results</h4>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Assertion Name</th>
              <th>Category</th>
              <th>Status</th>
              <th>Verification Evidence</th>
            </tr>
          </thead>
          <tbody>
            ${suiteResults.map(r => `
              <tr>
                <td class="mono-time" style="font-weight:700;">${r.id}</td>
                <td style="font-weight:600; color:var(--text-heading);">${this.escapeHtml(r.name)}</td>
                <td><span class="sub-pill">${this.escapeHtml(r.category)}</span></td>
                <td>
                  <span class="status-badge ${r.passed ? 'badge-in-office' : 'badge-emergency'}">
                    ${r.passed ? '✓ PASS' : '✗ FAIL'}
                  </span>
                </td>
                <td class="mono-time" style="font-size:0.75rem; color:var(--text-muted);">${this.escapeHtml(r.details)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    console.table(suiteResults);
    this.playChime(failed === 0 ? "success" : "break");
  }

  // ============================================================================
  // Toast Notification System
  // ============================================================================
  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let icon = "ℹ️";
    if (type === "success") icon = "✅";
    if (type === "danger") icon = "⚠️";
    if (type === "warning") icon = "🔔";

    toast.innerHTML = `<span>${icon}</span><span>${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(20px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
}

// Instantiate and expose globally
document.addEventListener("DOMContentLoaded", () => {
  window.appInstance = new AttendanceApp();
  window.runPulseAttendTests = () => window.appInstance.runDiagnosticTestSuite();
});
