const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/** Starts server.js on `port` with an isolated data folder. Restartable, so tests can prove persistence. */
function createServer(port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-e2e-"));
  let child = null;
  const url = `http://127.0.0.1:${port}`;

  async function start() {
    child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
      env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DATA_FILE: path.join(dir, "store.json"), RATE_LIMIT_POST: "1000" },
      stdio: "ignore"
    });
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(url + "/api/state")).ok) return; } catch (e) { /* not up yet */ }
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error("server did not start");
  }

  async function stop() {
    if (!child) return;
    const exited = new Promise(r => child.once("exit", r));
    child.kill("SIGTERM");
    await exited;
    child = null;
  }

  return { url, dir, start, stop, restart: async () => { await stop(); await start(); } };
}

/** Picks a person in the header, then sets (first time) or enters their PIN. */
async function signIn(page, empId, pin) {
  await page.selectOption("#employee-switcher-select", empId);
  await page.locator("#auth-modal.open").waitFor();
  await page.fill("#auth-pin", pin);
  if (await page.locator("#auth-confirm-group").isVisible()) await page.fill("#auth-pin2", pin);
  await page.click("#auth-submit");
  await page.locator("#auth-modal.open").waitFor({ state: "detached" }).catch(() => {});
  await page.locator("#auth-modal").evaluate(m => m.classList.contains("open")).then(open => { if (open) throw new Error("sign-in failed"); });
}

module.exports = { createServer, signIn };
