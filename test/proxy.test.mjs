import test from "node:test";
import assert from "node:assert/strict";
import { createProxy, DEFAULT_LANDING_PATH } from "../lib/proxy.mjs";

const upstreamOrigin = "https://exam.example";
const proxyOrigin = "https://hexa.example";
const request = (path = "/tests", init) => new Request(proxyOrigin + path, init);
function setup(response, upstream = upstreamOrigin) {
  const calls = [];
  const proxy = createProxy({
    upstreamOrigin: upstream,
    diagnosticLogger: () => {},
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), ...options });
      return typeof response === "function" ? response() : response;
    },
  });
  return { proxy, calls };
}

test("landing redirect only affects GET/HEAD, preserves root form submissions", async () => {
  const { proxy, calls } = setup(new Response("submitted"));
  const root = await proxy(request("/"));
  assert.equal(root.headers.get("location"), proxyOrigin + DEFAULT_LANDING_PATH);
  assert.doesNotThrow(() => root.headers.set("x-next-adapter", "ok"));
  assert.equal((await proxy(request("/", { method: "HEAD" }))).status, 307);
  assert.equal(calls.length, 0);
  assert.equal(await (await proxy(request("/", { method: "POST", body: "answer=42" }))).text(), "submitted");
  assert.equal(new TextDecoder().decode(calls[0].body), "answer=42");
});

test("HTML receives early branding, title, config and no stale validators", async () => {
  const html = `<!doctype html><HTML><HEAD><meta charset="utf-8">
    <META content="script-src 'none'" HTTP-EQUIV='Content-Security-Policy'>
    <meta http-equiv=content-security-policy content="default-src 'self'">
    <title>Original\nTitle</title><script src="/app.js"></script></HEAD>
    <body><a href="https://exam.example/test">Start</a></body></HTML>`;
  const { proxy } = setup(new Response(html, { headers: {
    "content-type": "text/html", "content-security-policy": "script-src 'none'",
    "content-security-policy-report-only": "default-src 'self'", "etag": "old",
    "last-modified": "Wed, 21 Oct 2026 00:00:00 GMT", "content-length": "999",
    "x-frame-options": "SAMEORIGIN", "strict-transport-security": "max-age=31536000",
  } }));
  const result = await proxy(request());
  const text = await result.text();
  assert.match(text, /<title>HEXA'S MAJORTILA PRACTICE LAB<\/title>/);
  assert.match(text, /data-upstream-origin="https:\/\/exam.example"/);
  assert.ok(text.indexOf("rebrand.js") < text.indexOf("/app.js"));
  assert.ok(text.indexOf('charset="utf-8"') < text.indexOf("rebrand.js"));
  assert.doesNotMatch(text, /content-security-policy/i);
  assert.doesNotMatch(text, /rebrand\.js[^>]*defer/);
  assert.match(text, /https:\/\/hexa.example\/test/);
  for (const name of ["content-security-policy", "content-security-policy-report-only", "content-length", "etag", "last-modified"]) {
    assert.equal(result.headers.get(name), null);
  }
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(result.headers.get("x-hexa-proxy"), "3.1");
  assert.equal(result.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(result.headers.get("strict-transport-security"), "max-age=31536000");
});

test("meta-looking JavaScript strings and HTML comments remain untouched", async () => {
  const literal = `<meta http-equiv="Content-Security-Policy" content="script-src 'none'">`;
  const html = `<html><head><script>const template = '${literal}';</script><!--${literal}--></head><body></body></html>`;
  const { proxy } = setup(new Response(html, { headers: { "content-type": "text/html" } }));
  const body = await (await proxy(request())).text();
  assert.ok(body.includes(`const template = '${literal}';`));
  assert.ok(body.includes(`<!--${literal}-->`));
});

test("rewrites absolute, protocol-relative and JSON-escaped URLs, not similar hosts", async () => {
  const html = String.raw`<html><head></head><body>
    https://exam.example/a http://exam.example/b //exam.example/c
    https:\/\/exam.example\/api //exam.example.evil.test/leave
    https://exam.example.evil.test/leave https://cdn.exam.example/audio
    </body></html>`;
  const { proxy } = setup(new Response(html, { headers: { "content-type": "text/html" } }));
  const body = await (await proxy(request())).text();
  for (const p of ["/a", "/b", "/c"]) assert.ok(body.includes(proxyOrigin + p));
  assert.ok(body.includes(String.raw`https:\/\/hexa.example\/api`));
  assert.ok(body.includes("//exam.example.evil.test/leave"));
  assert.ok(body.includes("https://cdn.exam.example/audio"));
});

test("headless documents get branding without moving the doctype into the body", async () => {
  const { proxy } = setup(new Response("<!doctype html><html><body>Test</body></html>", {
    headers: { "content-type": "text/html" },
  }));
  const body = await (await proxy(request())).text();
  assert.ok(body.startsWith("<!doctype html><html><head>"));
  assert.ok(body.indexOf("rebrand.js") < body.indexOf("<body>"));
});

test("POST bytes, cookies, credentials, query and same-origin request metadata survive", async () => {
  const { proxy, calls } = setup(new Response("ok"));
  const bytes = new Uint8Array([0, 255, 1, 10, 13]);
  await proxy(request("/answers?attempt=2", { method: "POST", body: bytes, headers: {
    "content-type": "application/octet-stream", "origin": proxyOrigin,
    "referer": proxyOrigin + "/writing?part=2", "cookie": "session=abc",
    "authorization": "Bearer example-token", "accept-encoding": "gzip",
    "x-forwarded-host": "internal.example", "if-none-match": "old",
  } }));
  const call = calls[0];
  assert.equal(call.url, upstreamOrigin + "/answers?attempt=2");
  assert.deepEqual(new Uint8Array(call.body), bytes);
  assert.equal(call.headers.get("origin"), upstreamOrigin);
  assert.equal(call.headers.get("referer"), upstreamOrigin + "/writing?part=2");
  assert.equal(call.headers.get("cookie"), "session=abc");
  assert.equal(call.headers.get("authorization"), "Bearer example-token");
  assert.equal(call.headers.get("accept-encoding"), "identity");
  assert.equal(call.headers.get("x-forwarded-host"), null);
  assert.equal(call.headers.get("if-none-match"), null);
  assert.equal(call.redirect, "manual");
  assert.equal(call.cache, "no-store");
});

test("cross-site Origin is preserved instead of being disguised as same-origin", async () => {
  const { proxy, calls } = setup(new Response("ok"));
  await proxy(request("/answers", { method: "POST", headers: { origin: "https://other.example" } }));
  assert.equal(calls[0].headers.get("origin"), "https://other.example");
});

test("Next's normalized loopback URL uses the original Host for redirects and POST Origin", async () => {
  const { proxy, calls } = setup(new Response("ok"));
  const root = await proxy(new Request("http://localhost:3000/", {
    headers: { host: "127.0.0.1:3000" },
  }));
  assert.equal(root.headers.get("location"), "http://127.0.0.1:3000" + DEFAULT_LANDING_PATH);
  await proxy(new Request("http://localhost:3000/answers", {
    method: "POST", headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
  }));
  assert.equal(calls[0].headers.get("origin"), upstreamOrigin);
  assert.equal(calls[0].headers.get("host"), null);
});

test("a double-slash request path cannot turn this into an open proxy", async () => {
  const { proxy, calls } = setup(new Response("ok"));
  await proxy(request("//unrelated.example/path?test=1"));
  assert.equal(new URL(calls[0].url).origin, upstreamOrigin);
  assert.equal(new URL(calls[0].url).pathname, "//unrelated.example/path");
});

test("same-upstream relative/absolute redirects stay local; external sign-in stays external", async () => {
  for (const [input, expected] of [
    ["https://exam.example/login?q=1#tab", proxyOrigin + "/login?q=1#tab"],
    ["//exam.example/login", proxyOrigin + "/login"],
    ["../login", proxyOrigin + "/login"],
    ["?step=2", proxyOrigin + "/tests?step=2"],
    ["https://auth.example/sign-in?return=exam.example", "https://auth.example/sign-in?return=exam.example"],
  ]) {
    const { proxy } = setup(new Response(null, { status: 302, headers: { location: input } }));
    assert.equal((await proxy(request())).headers.get("location"), expected);
  }
});

test("multiple cookies remain separate and retain their authentication attributes", async () => {
  const headers = new Headers();
  headers.append("set-cookie", "session=a; Domain=.exam.example; Path=/; Secure; HttpOnly; SameSite=None");
  headers.append("set-cookie", "test=b; Domain=exam.example; Path=/tests; Expires=Wed, 21 Oct 2026 07:28:00 GMT");
  const { proxy } = setup(new Response("ok", { headers }));
  const result = await proxy(request());
  const cookies = result.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.equal(cookies[0], "session=a; Path=/; Secure; HttpOnly; SameSite=None");
  assert.match(cookies[1], /Expires=Wed, 21 Oct 2026 07:28:00 GMT/);
  assert.doesNotMatch(cookies.join(";"), /domain=/i);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
});

test("edge Set-Cookie fallback handles Expires commas", async () => {
  const response = new Response("ok", { headers: { "set-cookie":
    "a=1; Domain=exam.example; Expires=Wed, 21 Oct 2026 07:28:00 GMT, b=2; Domain=.exam.example; HttpOnly",
  } });
  Object.defineProperty(response.headers, "getSetCookie", { value: undefined });
  const { proxy } = setup(response);
  const cookies = (await proxy(request())).headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.match(cookies[0], /Expires=Wed, 21 Oct 2026 07:28:00 GMT/);
  assert.equal(cookies[1], "b=2; HttpOnly");
});

test("audio byte ranges and non-HTML bytes stream through unchanged", async () => {
  const data = new Uint8Array([0, 1, 2, 255]);
  const { proxy, calls } = setup(new Response(data, { status: 206, headers: {
    "content-type": "audio/mpeg", "content-range": "bytes 0-3/100", "accept-ranges": "bytes",
  } }));
  const response = await proxy(request("/audio.mp3", { headers: { range: "bytes=0-3" } }));
  assert.equal(response.status, 206);
  assert.equal(calls[0].headers.get("range"), "bytes=0-3");
  assert.equal(response.headers.get("content-range"), "bytes 0-3/100");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), data);
});

test("HEAD and bodyless status codes do not construct an invalid Response", async () => {
  for (const status of [204, 205, 304]) {
    const { proxy } = setup(new Response(null, { status }));
    const response = await proxy(request());
    assert.equal(response.status, status);
    assert.equal(await response.text(), "");
  }
  const { proxy } = setup(new Response(null, { headers: { "content-type": "text/html" } }));
  assert.equal((await proxy(request("/tests", { method: "HEAD" }))).body, null);
});

test("authenticated API responses override upstream shared-cache directives", async () => {
  const { proxy } = setup(new Response('{"score":6}', { headers: {
    "content-type": "application/json", "cache-control": "public, max-age=3600",
    "vercel-cdn-cache-control": "public, s-maxage=3600", "surrogate-control": "max-age=3600",
  } }));
  const response = await proxy(request("/api/score", { headers: { cookie: "session=a" } }));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
  assert.equal(response.headers.get("surrogate-control"), null);
  assert.equal(await response.text(), '{"score":6}');
});

test("upstream errors retain their HTTP status; network failures give 502", async () => {
  const { proxy } = setup(new Response("Access denied", { status: 403 }));
  assert.equal((await proxy(request())).status, 403);
  const failing = setup(() => { throw new Error("network failure"); }).proxy;
  assert.equal((await failing(request())).status, 502);
});

test("invalid origins and a self-proxy loop are rejected before fetching", async () => {
  for (const upstream of ["invalid", "ftp://exam.example", "https://exam.example/path", "https://user:pass@exam.example", proxyOrigin]) {
    const { proxy, calls } = setup(new Response("unexpected"), upstream);
    assert.equal((await proxy(request())).status, 500);
    assert.equal(calls.length, 0);
  }
});

test("forwarding excludes hosting/client-IP metadata but preserves platform authentication headers", async () => {
  const { proxy, calls } = setup(new Response("ok"));
  await proxy(request("/answers", { method: "POST", body: "answer=42", headers: {
    host: "hexa.example", cookie: "session=example", authorization: "Bearer example",
    "x-csrf-token": "csrf-example", "x-xsrf-token": "xsrf-example", "x-requested-with": "XMLHttpRequest",
    "x-vercel-id": "hosting-metadata", "x-now-route-matches": "private-routing-data",
    "x-matched-path": "/[[...slug]]", "x-real-ip": "192.0.2.1",
    forwarded: "host=proxy.example", "x-forwarded-for": "192.0.2.2",
    "next-router-state-tree": "internal", "x-unknown-secret": "do-not-forward",
  } }));
  const sent = calls[0].headers;
  for (const name of ["host", "x-vercel-id", "x-now-route-matches", "x-matched-path", "x-real-ip", "forwarded", "x-forwarded-for", "next-router-state-tree", "x-unknown-secret"]) {
    assert.equal(sent.get(name), null, name + " must not reach the platform");
  }
  assert.equal(sent.get("cookie"), "session=example");
  assert.equal(sent.get("authorization"), "Bearer example");
  assert.equal(sent.get("x-csrf-token"), "csrf-example");
  assert.equal(sent.get("x-xsrf-token"), "xsrf-example");
  assert.equal(sent.get("x-requested-with"), "XMLHttpRequest");
});

test("upstream 500 is attributed and logged without session data or query parameters", async () => {
  const logs = [];
  const proxy = createProxy({ upstreamOrigin, diagnosticLogger: (record) => logs.push(record),
    fetchImpl: async () => new Response("The website encountered an unexpected error. Please try again later.", {
      status: 500, headers: { "content-type": "text/html" },
    }),
  });
  const result = await proxy(request("/exam?token=query-secret", { headers: {
    cookie: "session=cookie-secret", authorization: "Bearer auth-secret",
  } }));
  assert.equal(result.status, 500);
  assert.equal(result.headers.get("x-hexa-upstream-status"), "500");
  assert.equal(result.headers.get("x-hexa-error-source"), "upstream");
  assert.equal(result.headers.get("x-hexa-runtime"), "nodejs");
  assert.equal(logs[0].requestId, result.headers.get("x-hexa-request-id"));
  assert.equal(logs[0].stage, "upstream-http");
  assert.equal(logs[0].hasCookie, true);
  assert.equal(logs[0].hasAuthorization, true);
  assert.doesNotMatch(JSON.stringify(logs), /query-secret|cookie-secret|auth-secret/);
  assert.match(await result.text(), /unexpected error/);
});

test("fetch failures have a different diagnostic source and omit exception messages", async () => {
  const logs = [];
  const proxy = createProxy({ upstreamOrigin, diagnosticLogger: (record) => logs.push(record),
    fetchImpl: async () => { throw new TypeError("Fetch failed at https://example.test/?token=private"); },
  });
  const result = await proxy(request());
  assert.equal(result.status, 502);
  assert.equal(result.headers.get("x-hexa-upstream-status"), null);
  assert.equal(result.headers.get("x-hexa-error-source"), "upstream-fetch");
  assert.equal(logs[0].errorName, "TypeError");
  assert.doesNotMatch(JSON.stringify(logs), /token=private/);
});


test("Vercel preview access stays out of upstream cookies, URLs and referers", async () => {
  const { proxy, calls } = setup(() => new Response("ok"));
  await proxy(request("/tests?skill=listening&_vercel_share=share-secret&x-vercel-protection-bypass=bypass-secret&x-vercel-set-bypass-cookie=true", { headers: {
    cookie: "_vercel_jwt=hosting-secret; session=platform-session; _vercel_other=hosting-data",
    referer: proxyOrigin + "/library?skill=reading&_vercel_share=referer-secret",
    "x-vercel-protection-bypass": "header-secret",
    "x-vercel-trusted-oidc-idp-token": "oidc-secret",
  } }));
  assert.equal(calls[0].url, upstreamOrigin + "/tests?skill=listening");
  assert.equal(calls[0].headers.get("cookie"), "session=platform-session");
  assert.equal(calls[0].headers.get("referer"), upstreamOrigin + "/library?skill=reading");
  assert.doesNotMatch(JSON.stringify([...calls[0].headers]), /hosting|secret/);
  await proxy(request("/tests", { headers: { cookie: "_vercel_jwt=hosting-only" } }));
  assert.equal(calls[1].headers.get("cookie"), null);
  const root = await proxy(request("/?_vercel_share=share-secret"));
  assert.equal(root.status, 307);
  assert.equal(root.headers.get("location"), proxyOrigin + DEFAULT_LANDING_PATH);
  assert.equal(calls.length, 2);
});
