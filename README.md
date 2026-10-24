# BKR Attendance Register (2026-27)

Attendance and leave register for BKR's team, visible to everyone and kept by an admin.

- **Daily:** check in and out (office or work from home), breaks, who is in right now.
- **Leave:** medical (14 days), emergency (7) and holiday (12) a year, booked by the employee, counted in working days.
- **Monthly register:** November 2026 to March 2027, one row per person, with P, R, A, ML, EL, HL, H and W marks and totals. Export any month as CSV.
- **Admin (Bibhu P. Dash to start with):** add new joiners with their joining date, mark someone as left on their last working day (history is kept), add or remove holidays, make others admins, clear a forgotten PIN.

Starting team: Bibhu P. Dash (Admin), Pradyumna Sahoo, Abhijit Nayak, Poonam Das, Priyadarsani Barik, Dinabandhu Behera, Baidyanath Sing.
Starting holidays: Kartika Purnima (24 Nov 2026), Christmas (25 Dec), Makar Sankranti (14 Jan 2027), Republic Day (26 Jan), Maha Shivaratri (6 Mar), Holi (22 Mar). Saturday and Sunday are weekly offs.

No runtime dependencies: plain HTML/CSS/JS and a small Node server (Node 18+).

## Run it for the whole office

```bash
npm start                                   # http://127.0.0.1:3000, this machine only
HOST=0.0.0.0 ALLOWED_HOSTS=attendance.office.lan PORT=3000 npm start   # share on your office network
npm run reset-pin -- EMP-101                # someone forgot their PIN: clear it, they set a new one
OFFICE_TZ=Asia/Kolkata npm start            # timezone that defines "today" (default: Asia/Kolkata)
```

Everyone opens the server's address, picks their name in **Signed in as**, sets a personal PIN the
first time (6+ characters), and punches in. Bibhu signs in first and then manages everything from the **Admin** tab. All browsers see the same data (refreshes every 10 s). Data is stored in `data/store.json`
(override with `DATA_FILE`). A first start creates the BKR team and holidays above. Everything is saved in `data/` and survives restarts.

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
npm test          # 56 unit + API tests (node:test): rules, timezones, privacy, auth, security headers
npm run test:e2e  # 26 browser tests (Playwright, desktop + phone): sign-in, punches, leave, privacy,
                  # restart persistence, server outage recovery, retry safety, worst-case data, layout
```

First time only: `npm install && npx playwright install chromium`.

All rules live in `core.js` (pure functions, shared by browser, server and tests).

## Layout

```
index.html  style.css  app.js   browser UI
core.js                         business rules (browser + Node)
server.js                       static files, JSON API, sign-in, persistence
test/                           node:test unit + API suites
e2e/                            Playwright browser tests
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
