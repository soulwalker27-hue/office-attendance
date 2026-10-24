# PulseAttend — Office Attendance & Leave Tracker

A shared attendance board for an office. Everyone can see, live:

- who has **checked in / out** and at what time (office or remote), including breaks
- who is on **medical leave**, **emergency leave** or **holiday**
- how many leave days each person has taken this year against their quota
- the company holiday calendar and who is away soon

Zero dependencies: plain HTML/CSS/JS in the browser and a ~150-line Node server (Node 18+).

## Run it for the whole office

```bash
npm start                                   # http://127.0.0.1:3000, this machine only
HOST=0.0.0.0 PORT=3000 npm start            # share on your office network
OFFICE_TZ=Asia/Kolkata npm start            # timezone that defines "today" (default: server's zone)
```

Everyone opens the server's address, picks their name in **You are**, and punches in. All
browsers see the same data (refreshes every 10 s). Data is stored in `data/store.json`
(override with `DATA_FILE`). First start creates demo employees — add real ones with **Add colleague**.

Opening `index.html` directly (or any static host) still works in **local demo mode**: data
stays in that browser only, and a banner says so.

## Rules the app enforces

| Area | Rule |
| --- | --- |
| Punching | One open session at a time; breaks are timed for real and deducted from worked time; several sessions a day add up. A check-out forgotten on a previous day is shown as "Missed check-out" and never blocks the next day. |
| Today's status | Derived from punches + leave + calendar, never stored, so it rolls over at midnight in the office timezone. A real check-in beats a scheduled leave (after a confirmation). |
| Leave days | Working days only — weekends and public holidays are excluded. |
| Quotas | Holiday 12, Medical 14, Emergency 7 per calendar year. Requests over quota are rejected (not silently approved). Cancelling an unstarted request returns the days. |
| Dates | Holiday leave must start today or later; medical/emergency may be back-dated 7 days. No overlaps, no requests spanning two years or longer than 90 days. |
| Privacy | The shared board shows leave **type and dates only**. Reasons and contact notes are never sent to other users — only to their author. |

## Tests

```bash
npm test      # 34 tests: business rules, DST/timezone maths, privacy, HTTP API, security headers
```

All rules live in `core.js` (pure functions, shared by browser, server and tests).

## Layout

```
index.html  style.css  app.js   browser UI
core.js                         business rules (browser + Node)
server.js                       static files + JSON API + persistence
test/                           node:test suites
```

## Known limits (be aware before rollout)

- **No login.** "You are" is a picker, so anyone on the network can act as anyone, and
  the private-reason endpoint trusts the picked identity. Put it behind your VPN / office
  network, or add SSO before exposing it more widely. Leave is auto-approved (no manager flow).
- Single server process with a JSON file — fine for an office, not for thousands of users.
- Public-holiday list (US, 2026–2027) is in `core.js`; edit it for your country.

## License

MIT — see `LICENSE`.
