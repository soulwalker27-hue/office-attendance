# PulseAttend — Office Attendance & Leave Management System

![PulseAttend Banner](https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80)

> A modern, zero-dependency enterprise employee attendance tracking web application built with vanilla web technologies, featuring real-time punch stations, cross-department visibility, leave quota ledgers, and an autonomous QA test harness.

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

---

## 🌟 Key Features

### 1. Daily Time Clock & Punch Station
- **Check-In & Check-Out**: Real-time timestamps with In-Office (`🏢 Desk Floor 3`) and Remote (`🏡 WFH`) mode toggles.
- **Live Session Timer**: Real-time counter of hours worked during the active shift.
- **Break Tracker**: Dedicated pause button for lunch and coffee breaks with automated work duration deduction.
- **History Ledger**: Rolling 5-day punch log with exact check-in, check-out, and total hours worked.

### 2. Multi-Tier Leave Accounting
- **Medical Leave (Quota: 14 Days)**: Complete wellness policy tracking with reason logging and physician contact notes.
- **Emergency Leave (Quota: 7 Days)**: Fast-track logging for urgent domestic or personal emergencies.
- **Paid Annual Holidays (Quota: 12 Days)**: Planned vacation booking integrated with the company holiday calendar.
- **Active Leave Protection**: Submitting an approved leave that covers today automatically updates the employee's status and excuses them from active check-in.

### 3. Team Visibility ("Viewed by Others")
- **"Who's in Today" Live Directory**: Instant visibility into coworkers' statuses (`🟢 In-Office`, `🏡 Remote`, `🩺 Medical Leave`, `🚨 Emergency Leave`, `🏖️ On Holiday`, `🔴 Checked Out`).
- **Live Search & Multi-Filters**: Filter by department (Engineering, Design, HR, Product, Marketing, Sales & Ops) or status.
- **Colleague Profile Inspector**: Click any colleague to view their full timesheet, leaves taken breakdown, and contact details.
- **Switch Role Simulator**: Instantly switch the active viewpoint to experience the system from any coworker's perspective.

### 4. Aesthetics & Theming
- **Minimalist Light Blue Palette (Default)**: Soft, calming powder-blue backdrop (`#edf4fa`) with crisp elevated cards and high-contrast slate-navy typography.
- **Obsidian Dark Mode**: Deep slate-navy palette with luminous status pills.
- **1-Click Theme Switcher**: Persistent toggle saved in `localStorage`.

### 5. Autonomous QA Test Suite
- Integrated in-browser test harness (`🧪 Test Suite`) running 15 invariant assertions against date math, XSS sanitization, quota limits, and state machines with 100% pass rate.

---

## 🚀 Quick Start

PulseAttend is a zero-dependency web application. No Node.js, Python, or build step required.

1. **Clone or Download** the repository:
   ```bash
   git clone https://github.com/soulwalker27-hue/pulse-attend.git
   ```
2. **Open directly in any modern browser**:
   - Double-click `index.html` or open it with Google Chrome, Microsoft Edge, Firefox, or Safari.

---

## 📁 Repository Structure

```text
├── index.html                       # Application markup, navigation, and modal dialogues
├── style.css                        # CSS variable-driven dual design system
├── app.js                           # State controller, logic, security filters & QA test harness
├── PROJECT_SPEC_AND_TEST_PLAN.md    # Master architecture & engineering verification audit
├── README.md                        # Project documentation
└── .vscode/
    └── launch.json                  # VS Code launch configuration
```

---

## 🔒 Security & Data Integrity

- **XSS Sanitization**: Dynamic user input is encoded through entity escaping before DOM interpolation.
- **UTC Date Calculations**: Leave duration arithmetic is computed in UTC to prevent local DST skews.
- **RFC-4180 CSV Export**: Generates compliant timesheet export files.

---

## 📄 License

This project is licensed under the MIT License.
