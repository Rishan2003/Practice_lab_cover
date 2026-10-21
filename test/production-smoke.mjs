// Run after `npm run build`. No real platform/account is contacted.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const upstream = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/answers") {
    const parts = [];
    for await (const part of req) parts.push(part);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ body: Buffer.concat(parts).toString(), cookie: req.headers.cookie, origin: req.headers.origin }));
    return;
  }
  if (url.pathname === "/audio.mp3") {
    res.writeHead(206, { "content-type": "audio/mpeg", "content-range": "bytes 0-3/10", "accept-ranges": "bytes" });
    res.end(Buffer.from([0, 1, 2, 255]));
    return;
  }
  if (url.pathname === "/redirect") {
    res.writeHead(302, { location: "/login?next=exam" });
    res.end();
    return;
  }
  res.setHeader("content-type", "text/html");
  res.setHeader("content-security-policy", "script-src 'none'");
  res.setHeader("set-cookie", [
    "session=fixture; Domain=localhost; Path=/; HttpOnly; Secure; SameSite=None",
    "attempt=2; Domain=localhost; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT",
  ]);
  res.end('<!doctype html><html><head><title>Original</title><script src="/app.js"></script></head><body><div class="logo">Original</div><div class="col-md-12">Question</div></body></html>');
});
upstream.listen(0, "127.0.0.1");
await once(upstream, "listening");
const upstreamOrigin = `http://127.0.0.1:${upstream.address().port}`;
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, UPSTREAM_ORIGIN: upstreamOrigin, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", (data) => { logs += data; });
child.stderr.on("data", (data) => { logs += data; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(origin + "/rebrand.js");
      ready = response.ok;
      await response.body?.cancel();
      if (ready) break;
    } catch { /* Wait for Next's listener. */ }
    if (child.exitCode !== null) throw new Error("Next exited before startup");
    await delay(200);
  }
  assert.ok(ready, "production server starts");
  const home = await fetch(origin, { redirect: "manual" });
  assert.equal(home.status, 307);
  assert.ok(home.headers.get("location").startsWith(origin + "/"));
  const page = await fetch(origin + "/ielts-exam-library");
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("x-hexa-proxy"), "3.0");
  assert.equal(page.headers.get("content-security-policy"), null);
  assert.equal(page.headers.get("cache-control"), "private, no-store");
  assert.equal(page.headers.getSetCookie().length, 2);
  assert.doesNotMatch(page.headers.getSetCookie().join(";"), /domain=/i);
  assert.ok(html.includes(`data-upstream-origin="${upstreamOrigin}"`));
  assert.ok(html.indexOf("rebrand.js") < html.indexOf("/app.js"));
  for (const file of ["rebrand.js", "rebrand.css"]) {
    const response = await fetch(origin + "/" + file + "?v=3.0");
    assert.equal(response.status, 200);
    assert.doesNotMatch(response.headers.get("content-type"), /text\/html/);
    await response.body?.cancel();
  }
  const submitted = await fetch(origin + "/api/answers", {
    method: "POST", body: "answer=42", headers: { cookie: "session=fixture", origin },
  });
  assert.deepEqual(await submitted.json(), { body: "answer=42", cookie: "session=fixture", origin: upstreamOrigin });
  const audio = await fetch(origin + "/audio.mp3", { headers: { range: "bytes=0-3" } });
  assert.equal(audio.status, 206);
  assert.deepEqual(new Uint8Array(await audio.arrayBuffer()), new Uint8Array([0, 1, 2, 255]));
  const redirect = await fetch(origin + "/redirect", { redirect: "manual" });
  assert.equal(redirect.headers.get("location"), origin + "/login?next=exam");
  console.log("Production smoke passed: root redirect, HTML injection, static assets, separate cookies, POST, audio range and login redirect.");
} catch (error) {
  console.error(logs.slice(-5000));
  throw error;
} finally {
  child.kill("SIGTERM");
  upstream.closeAllConnections();
  await new Promise((resolve) => upstream.close(resolve));
  if (child.exitCode === null) await once(child, "exit");
}
