/**
 * PulseAttend server — zero dependencies (Node >= 18).
 *
 * Serves the static app and a small JSON API so every employee sees the same,
 * live attendance data. Business rules live in core.js; this file does HTTP,
 * authentication, abuse limits and persistence.
 *
 *   PORT=3000 HOST=0.0.0.0 OFFICE_TZ=Asia/Kolkata DATA_FILE=data/store.json node server.js
 *   node server.js --reset-pin EMP-101        # let someone who forgot their PIN set a new one
 *
 * Auth model: each employee claims their own profile with a personal PIN (first
 * sign-in sets it; stored only as a salted scrypt hash). A successful sign-in returns
 * a random session token; only its SHA-256 is stored. The server always acts as the
 * session's employee — an `empId` sent by the client is ignored.
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const core = require("./core.js");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, "data", "store.json"));
const AUTH_FILE = path.join(path.dirname(DATA_FILE), "auth.json");
const TZ = core.validTimeZone(process.env.OFFICE_TZ) ? process.env.OFFICE_TZ : "Asia/Kolkata";

const MAX_BODY = 16 * 1024;
const PIN_MIN = 6, PIN_MAX = 64;
const SESSION_MS = 14 * 24 * 3600 * 1000;
const MAX_SESSIONS_PER_EMPLOYEE = 5;
const LOGIN_FAILS_PER_ACCOUNT = 5;
const LOGIN_FAILS_PER_IP = 20;
const LOCKOUT_MS = 15 * 60 * 1000;
const POST_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_POST) || 60;
const READ_LIMIT_PER_MIN = 300;

const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];
const ALLOWED_HOSTS = process.env.ALLOWED_HOSTS
  ? process.env.ALLOWED_HOSTS.split(",").map(h => h.trim().toLowerCase()).filter(Boolean)
  : (["127.0.0.1", "localhost", "::1", "[::1]"].includes(HOST) ? LOOPBACK_HOSTS : null);

const STATIC_FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/style.css": ["style.css", "text/css; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/core.js": ["core.js", "text/javascript; charset=utf-8"]
};

const CSP = [
  "default-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "style-src-attr 'unsafe-inline'", // style="" attributes only; scripts stay locked to 'self'
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "script-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

// ---------------------------------------------------------------------------
// Persistence: atomic writes, owner-only permissions
// ---------------------------------------------------------------------------
function writePrivate(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function quarantine(file, err) {
  const backup = `${file}.corrupt-${Date.now()}`;
  try { fs.renameSync(file, backup); console.error(`${path.basename(file)} unreadable (${err.message}); moved to ${backup}`); } catch (e) { /* ignore */ }
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (parsed && Array.isArray(parsed.employees) && Array.isArray(parsed.attendance) && Array.isArray(parsed.leaves)) return core.migrate(parsed);
    throw new Error("unexpected shape");
  } catch (err) {
    if (err.code !== "ENOENT") quarantine(DATA_FILE, err);
    const seeded = core.seedState();
    writePrivate(DATA_FILE, JSON.stringify(seeded));
    return seeded;
  }
}

function loadAuth() {
  try {
    const parsed = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8"));
    if (parsed && typeof parsed.pins === "object" && typeof parsed.sessions === "object") return parsed;
    throw new Error("unexpected shape");
  } catch (err) {
    if (err.code !== "ENOENT") quarantine(AUTH_FILE, err);
    return { pins: {}, sessions: {} };
  }
}

let state = loadState();
let auth = loadAuth();
let authStamp = statStamp(AUTH_FILE);

function statStamp(file) {
  try { return fs.statSync(file).mtimeMs; } catch (e) { return 0; }
}

/** Pick up out-of-band edits (e.g. `--reset-pin` run while the server is up). */
function syncAuth() {
  const stamp = statStamp(AUTH_FILE);
  if (stamp !== authStamp) { auth = loadAuth(); authStamp = stamp; }
}

function persistState() { writePrivate(DATA_FILE, JSON.stringify(state)); }
function persistAuth() { writePrivate(AUTH_FILE, JSON.stringify(auth)); authStamp = statStamp(AUTH_FILE); }

function pruneSessions(now) {
  for (const [key, s] of Object.entries(auth.sessions)) if (s.exp <= now) delete auth.sessions[key];
}

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

function hashPin(pin, saltHex) {
  return crypto.scryptSync(pin, Buffer.from(saltHex, "hex"), 32).toString("hex");
}

function pinMatches(pin, record) {
  const a = Buffer.from(hashPin(pin, record.salt), "hex");
  const b = Buffer.from(record.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sessionFrom(req) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization || "");
  if (!m) return null;
  const key = sha256(m[1]);
  const s = own(auth.sessions, key) ? auth.sessions[key] : null;
  if (!s || s.exp <= Date.now()) return null;
  const emp = core.getEmployee(state, s.empId);
  if (!emp || !core.isActive(emp, core.dateKey(Date.now(), TZ))) return null; // someone who has left is signed out
  return { key, empId: s.empId };
}

// ---------------------------------------------------------------------------
// Abuse limits (in memory; per process)
// ---------------------------------------------------------------------------
const windows = new Map();

/** Fixed-window counter. Returns false once `limit` is exceeded within `windowMs`. */
function allow(key, limit, windowMs) {
  const now = Date.now();
  let w = windows.get(key);
  if (!w || w.reset <= now) { w = { count: 0, reset: now + windowMs }; windows.set(key, w); }
  w.count += 1;
  return w.count <= limit;
}

function peek(key) {
  const w = windows.get(key);
  return w && w.reset > Date.now() ? w : null;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, w] of windows) if (w.reset <= now) windows.delete(k);
}, 60 * 1000).unref();

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": CSP,
    "Cache-Control": "no-store"
  }, headers));
  res.end(body);
}

function sendJson(res, status, obj, headers) {
  send(res, status, JSON.stringify(obj), Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooBig = false;
    const chunks = [];
    req.on("data", chunk => {
      if (tooBig) return; // keep draining so the 413 response can be delivered
      size += chunk.length;
      if (size > MAX_BODY) {
        tooBig = true;
        chunks.length = 0;
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => { if (!tooBig) resolve(Buffer.concat(chunks).toString("utf8")); });
    req.on("error", reject);
  });
}

async function readJson(req, res) {
  if (!/^application\/json\b/i.test(req.headers["content-type"] || "")) {
    sendJson(res, 415, { ok: false, code: "BAD_TYPE", error: "Content-Type must be application/json." });
    return undefined;
  }
  try {
    const parsed = JSON.parse(await readBody(req));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch (e) {
    if (e.status === 413) { sendJson(res, 413, { ok: false, code: "TOO_LARGE", error: "Request too large." }); return undefined; }
  }
  sendJson(res, 400, { ok: false, code: "BAD_JSON", error: "Malformed JSON." });
  return undefined;
}

function view(session) {
  const now = Date.now();
  return {
    ok: true, now, tz: TZ,
    state: core.publicView(state, { now, tz: TZ }),
    claimed: Object.keys(auth.pins),
    me: session ? session.empId : null,
    mine: session ? core.privateDetails(state, session.empId) : {}
  };
}

const clientIp = req => req.socket.remoteAddress || "unknown";

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
async function login(req, res) {
  const ip = clientIp(req);
  const body = await readJson(req, res);
  if (!body) return;
  const empId = typeof body.empId === "string" ? body.empId : "";
  const pin = typeof body.pin === "string" ? body.pin : "";
  const emp = core.getEmployee(state, empId);
  if (!emp) return sendJson(res, 404, { ok: false, code: "NO_EMPLOYEE", error: "Unknown employee." });
  if (pin.length < PIN_MIN || pin.length > PIN_MAX) {
    return sendJson(res, 422, { ok: false, code: "BAD_PIN", error: `Use a PIN of ${PIN_MIN}–${PIN_MAX} characters.` });
  }

  const accountKey = `fail:acct:${empId}`, ipKey = `fail:ip:${ip}`;
  const acct = peek(accountKey), byIp = peek(ipKey);
  if ((acct && acct.count >= LOGIN_FAILS_PER_ACCOUNT) || (byIp && byIp.count >= LOGIN_FAILS_PER_IP)) {
    return sendJson(res, 429, { ok: false, code: "LOCKED", error: "Too many wrong PINs. Try again in 15 minutes." });
  }

  const record = own(auth.pins, empId) ? auth.pins[empId] : null;
  let created = false;
  if (record) {
    if (!pinMatches(pin, record)) {
      allow(accountKey, LOGIN_FAILS_PER_ACCOUNT, LOCKOUT_MS);
      allow(ipKey, LOGIN_FAILS_PER_IP, LOCKOUT_MS);
      return sendJson(res, 401, { ok: false, code: "BAD_CREDENTIALS", error: "That PIN is not correct." });
    }
  } else {
    const salt = crypto.randomBytes(16).toString("hex");
    auth.pins[empId] = { salt, hash: hashPin(pin, salt) };
    created = true;
  }

  const now = Date.now();
  pruneSessions(now);
  const mine = Object.entries(auth.sessions).filter(([, s]) => s.empId === empId).sort((a, b) => a[1].exp - b[1].exp);
  while (mine.length >= MAX_SESSIONS_PER_EMPLOYEE) delete auth.sessions[mine.shift()[0]];
  const token = crypto.randomBytes(32).toString("base64url");
  auth.sessions[sha256(token)] = { empId, exp: now + SESSION_MS };
  persistAuth();
  windows.delete(accountKey);
  return sendJson(res, 200, { ok: true, token, empId, created });
}

/** Admin: clear a colleague's PIN (they choose a new one at their next sign-in). */
async function resetPinFor(req, res) {
  const session = sessionFrom(req);
  if (!session) return sendJson(res, 401, { ok: false, code: "AUTH", error: "Please sign in again." });
  const admin = core.getEmployee(state, session.empId);
  if (!admin || !admin.isAdmin) return sendJson(res, 403, { ok: false, code: "FORBIDDEN", error: "Only an admin can do that." });
  const body = await readJson(req, res);
  if (!body) return;
  const target = core.getEmployee(state, typeof body.targetId === "string" ? body.targetId : "");
  if (!target) return sendJson(res, 404, { ok: false, code: "NOT_FOUND", error: "Employee not found." });
  delete auth.pins[target.id];
  for (const [key, s] of Object.entries(auth.sessions)) if (s.empId === target.id) delete auth.sessions[key];
  persistAuth();
  return sendJson(res, 200, { ok: true, message: `${target.name}'s PIN was cleared. They set a new one at their next sign-in.`, view: view(sessionFrom(req)) });
}

function logout(req, res) {
  const session = sessionFrom(req);
  if (session) { delete auth.sessions[session.key]; persistAuth(); }
  return sendJson(res, 200, { ok: true });
}

// Replay cache: a client retrying after a dropped response gets the original answer
// instead of the action running twice (e.g. a break toggling on and straight off again).
const replies = new Map();
const REPLY_TTL_MS = 10 * 60 * 1000, MAX_REPLIES = 2000;

async function action(req, res) {
  const session = sessionFrom(req);
  if (!session) return sendJson(res, 401, { ok: false, code: "AUTH", error: "Please sign in again." });
  const body = await readJson(req, res);
  if (!body) return;
  const replayKey = typeof body.requestId === "string" && /^[a-f0-9]{16,64}$/.test(body.requestId) ? `${session.empId}:${body.requestId}` : null;
  const seen = replayKey && replies.get(replayKey);
  if (seen && seen.exp > Date.now()) return sendJson(res, seen.status, Object.assign({}, seen.result, { view: view(session) }));

  body.empId = session.empId; // the session decides who acts, never the request body
  const result = core.applyAction(state, body, Date.now(), TZ);
  if (result.ok) persistState();
  const status = result.ok ? 200 : 422;
  if (replayKey) {
    if (replies.size >= MAX_REPLIES) replies.delete(replies.keys().next().value);
    replies.set(replayKey, { status, result, exp: Date.now() + REPLY_TTL_MS });
  }
  return sendJson(res, status, Object.assign({}, result, { view: view(session) }));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function hostAllowed(req) {
  if (!ALLOWED_HOSTS) return true;
  const raw = String(req.headers.host || "").toLowerCase();
  const name = raw.startsWith("[") ? raw.slice(0, raw.indexOf("]") + 1) : raw.split(":")[0];
  return ALLOWED_HOSTS.includes(name);
}

function crossSite(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try { return new URL(origin).host !== req.headers.host; } catch (e) { return true; }
}

const server = http.createServer(async (req, res) => {
  try {
    // Defends against DNS-rebinding: only answer for hostnames we expect.
    if (!hostAllowed(req)) return send(res, 421, "Unexpected host", { "Content-Type": "text/plain; charset=utf-8" });

    syncAuth();
    const url = new URL(req.url, "http://localhost");
    const isPost = req.method === "POST";
    const ip = clientIp(req);

    if (url.pathname.startsWith("/api/")) {
      if (isPost && crossSite(req)) {
        return sendJson(res, 403, { ok: false, code: "BAD_ORIGIN", error: "Cross-site request refused." });
      }
      const within = isPost ? allow(`post:${ip}`, POST_LIMIT_PER_MIN, 60 * 1000) : allow(`read:${ip}`, READ_LIMIT_PER_MIN, 60 * 1000);
      if (!within) return sendJson(res, 429, { ok: false, code: "RATE", error: "Too many requests. Slow down." }, { "Retry-After": "60" });

      if (req.method === "GET" && url.pathname === "/api/state") return sendJson(res, 200, view(sessionFrom(req)));
      if (isPost && url.pathname === "/api/login") return await login(req, res);
      if (isPost && url.pathname === "/api/logout") return logout(req, res);
      if (isPost && url.pathname === "/api/reset-pin") return await resetPinFor(req, res);
      if (isPost && url.pathname === "/api/action") return await action(req, res);
      return sendJson(res, 404, { ok: false, code: "NOT_FOUND", error: "No such endpoint." });
    }

    if ((req.method === "GET" || req.method === "HEAD") && own(STATIC_FILES, url.pathname)) {
      const [file, type] = STATIC_FILES[url.pathname];
      const content = fs.readFileSync(path.join(__dirname, file));
      return send(res, 200, req.method === "HEAD" ? "" : content, { "Content-Type": type });
    }
    return send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  } catch (err) {
    console.error(err);
    return sendJson(res, err.status || 500, { ok: false, code: "SERVER_ERROR", error: "Something went wrong on the server." });
  }
});

function resetPin(empId) {
  if (!core.getEmployee(state, empId)) { console.error(`No employee ${empId}.`); process.exitCode = 1; return; }
  delete auth.pins[empId];
  for (const [key, s] of Object.entries(auth.sessions)) if (s.empId === empId) delete auth.sessions[key];
  persistAuth();
  console.log(`${empId}: PIN cleared. The next sign-in sets a new one.`);
}

if (require.main === module) {
  const i = process.argv.indexOf("--reset-pin");
  if (i !== -1) {
    resetPin(process.argv[i + 1] || "");
  } else {
    server.listen(PORT, HOST, () => {
      console.log(`PulseAttend running at http://${HOST}:${PORT}  (office timezone ${TZ}, data ${DATA_FILE})`);
      if (HOST === "127.0.0.1") console.log("Only this machine can connect. Use HOST=0.0.0.0 (and ALLOWED_HOSTS=your.host.name) to share on your office network.");
    });
  }
}

module.exports = { server };
