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
HOST=0.0.0.0 ALLOWED_HOSTS=attendance.office.lan PORT=3000 npm start   # share on your office network
npm run reset-pin -- EMP-101                # someone forgot their PIN: clear it, they set a new one
OFFICE_TZ=Asia/Kolkata npm start            # timezone that defines "today" (default: Asia/Kolkata)
```

Everyone opens the server's address, picks their name in **Signed in as**, sets a personal PIN the
first time (6+ characters), and punches in. All browsers see the same data (refreshes every 10 s). Data is stored in `data/store.json`
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
| Privacy | The shared board shows leave **type and dates only**. Reasons and contact notes are never sent to other users — only to their author (after PIN sign-in). |

## Tests

```bash
npm test      # 48 tests: business rules, DST/timezone maths, privacy, HTTP API, security headers
```

All rules live in `core.js` (pure functions, shared by browser, server and tests).

## Layout

```
index.html  style.css  app.js   browser UI
core.js                         business rules (browser + Node)
server.js                       static files + JSON API + persistence
test/                           node:test suites
```

## Security

- **Per-person PINs.** Each employee claims their own profile; PINs are stored only as salted
  scrypt hashes. Sign-in returns a random token (only its SHA-256 is stored; 14-day expiry, 5 sessions per person).
  The server always acts as the signed-in person; an `empId` sent by a browser is ignored.
- **Brute-force and abuse limits:** 5 wrong PINs lock a profile for 15 minutes; per-address request
  limits; caps on punches per day, breaks, leave records, body size (16 KB).
- **Browser hardening:** strict CSP (scripts only from this origin), `frame-ancestors 'none'`,
  `nosniff`, no-store caching, JSON-only POSTs, cross-site `Origin` refused, `Host` allow-list
  (DNS-rebinding defence — set `ALLOWED_HOSTS` when sharing), static-file whitelist.
- **Data at rest:** `data/store.json` and `data/auth.json` are written owner-only (0600) and ignored by git.
- All user text is HTML-escaped on render; CSV export neutralises spreadsheet formulas.

## Known limits (be aware before rollout)

- **Plain HTTP.** The server speaks HTTP; PINs and tokens are visible to anyone who can sniff the
  network. Put it behind your office VPN or a reverse proxy that terminates HTTPS (e.g. Caddy, nginx).
- **First sign-in claims a profile.** Whoever signs in first as a person sets that person's PIN, so
  have people claim their profile at rollout (and use `reset-pin` if someone else did).
- The board (names, work emails, phones, attendance and leave *types*) is readable without signing in by
  anyone who can reach the server. Keep it on the office network.
- Leave is auto-approved (no manager workflow). Single process with JSON files: fine for an office, not thousands.
- The public-holiday list (India, 2026–2027) in `core.js` only has dates that are fixed or widely agreed.
  Moon-dependent festivals (Eid, Muharram, state-specific days) must be confirmed by HR against the
  official notification and added there.

## License

MIT — see `LICENSE`.
