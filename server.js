/**
 * PulseAttend server — zero dependencies (Node >= 18).
 *
 * Serves the static app and a tiny JSON API so every employee sees the same,
 * live attendance data. All business rules live in core.js; this file only
 * does HTTP, validation of transport-level concerns, and persistence.
 *
 *   PORT=3000 HOST=0.0.0.0 OFFICE_TZ=Asia/Kolkata (default) DATA_FILE=data/store.json node server.js
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const core = require("./core.js");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, "data", "store.json"));
const TZ = core.validTimeZone(process.env.OFFICE_TZ) ? process.env.OFFICE_TZ : "Asia/Kolkata";
const MAX_BODY = 16 * 1024;

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
// Persistence: in-memory state, atomically flushed to disk after each change.
// ---------------------------------------------------------------------------
function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (parsed && Array.isArray(parsed.employees) && Array.isArray(parsed.attendance) && Array.isArray(parsed.leaves)) return parsed;
    throw new Error("unexpected shape");
  } catch (err) {
    if (err.code !== "ENOENT") {
      const backup = `${DATA_FILE}.corrupt-${Date.now()}`;
      try { fs.renameSync(DATA_FILE, backup); console.error(`Store unreadable (${err.message}); moved to ${backup}`); } catch (e) { /* ignore */ }
    }
    const seeded = core.seedState(Date.now(), TZ);
    persist(seeded);
    return seeded;
  }
}

function persist(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, DATA_FILE);
}

let state = loadState();

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": CSP,
    "Cache-Control": "no-store"
  }, headers));
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8" });
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

function view(me) {
  const now = Date.now();
  const body = { ok: true, now, tz: TZ, state: core.publicView(state, { now, tz: TZ }), mine: {} };
  if (me && core.getEmployee(state, me)) body.mine = core.privateDetails(state, me);
  return body;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/api/state") {
      return sendJson(res, 200, view(url.searchParams.get("me")));
    }

    if (req.method === "POST" && url.pathname === "/api/action") {
      // Requiring JSON forces a CORS preflight, so other sites can't post blindly.
      if (!/^application\/json\b/i.test(req.headers["content-type"] || "")) {
        return sendJson(res, 415, { ok: false, code: "BAD_TYPE", error: "Content-Type must be application/json." });
      }
      let action;
      try { action = JSON.parse(await readBody(req)); } catch (e) {
        if (e.status === 413) return sendJson(res, 413, { ok: false, code: "TOO_LARGE", error: "Request too large." });
        return sendJson(res, 400, { ok: false, code: "BAD_JSON", error: "Malformed JSON." });
      }
      const result = core.applyAction(state, action, Date.now(), TZ);
      if (result.ok) persist(state);
      const me = action && typeof action.empId === "string" ? action.empId : null;
      return sendJson(res, result.ok ? 200 : 422, Object.assign({}, result, { view: view(me) }));
    }

    if ((req.method === "GET" || req.method === "HEAD") && STATIC_FILES[url.pathname]) {
      const [file, type] = STATIC_FILES[url.pathname];
      const content = fs.readFileSync(path.join(__dirname, file));
      return send(res, 200, req.method === "HEAD" ? "" : content, { "Content-Type": type });
    }

    if (url.pathname.startsWith("/api/")) return sendJson(res, 404, { ok: false, code: "NOT_FOUND", error: "No such endpoint." });
    return send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  } catch (err) {
    console.error(err);
    return sendJson(res, err.status || 500, { ok: false, code: "SERVER_ERROR", error: "Something went wrong on the server." });
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`PulseAttend running at http://${HOST}:${PORT}  (office timezone ${TZ}, data ${DATA_FILE})`);
    if (HOST === "127.0.0.1") console.log("Only this machine can connect. Use HOST=0.0.0.0 to share on your office network.");
  });
}

module.exports = { server };
