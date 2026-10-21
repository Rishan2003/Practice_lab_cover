export const DEFAULT_LANDING_PATH =
  "/ielts-exam-library?tab&search&sort=high_ranking&skill=listening";

const TITLE = "HEXA'S MAJORTILA PRACTICE LAB";
const BRAND_VERSION = "3.0";
const HOP_BY_HOP = [
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
];

function removeHopByHopHeaders(headers) {
  for (const name of (headers.get("connection") || "").split(",")) {
    if (name.trim()) headers.delete(name.trim());
  }
  for (const name of HOP_BY_HOP) headers.delete(name);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Match a complete upstream host, never a hostname merely containing it.
function rewriteReferences(text, upstream, proxyOrigin) {
  const host = escapeRegExp(upstream.host);
  const plain = new RegExp(`(?:https?:)?//${host}(?=$|[/?#\\s"'<>\\\\])`, "gi");
  let result = text.replace(plain, proxyOrigin);
  const escaped = new RegExp(
    `(?:https?:)?\\\\/\\\\/${host}(?=$|[\\\\/?#\\s"'<>])`, "gi"
  );
  return result.replace(escaped, () => proxyOrigin.replaceAll("/", "\\/"));
}

function getCookies(headers) {
  const cookies = headers.getSetCookie?.();
  if (cookies?.length) return cookies;
  // Some edge implementations combine Set-Cookie. Do not split the comma in Expires.
  return (headers.get("set-cookie") || "")
    .split(/,(?=\s*[^\s;,=]+\s*=)/)
    .map((cookie) => cookie.trim())
    .filter(Boolean);
}

function rewriteLocation(location, target, upstream, proxyOrigin) {
  try {
    const resolved = new URL(location, target);
    if (["http:", "https:"].includes(resolved.protocol) && resolved.host === upstream.host) {
      return `${proxyOrigin}${resolved.pathname}${resolved.search}${resolved.hash}`;
    }
  } catch {
    // Preserve unrecognized destinations rather than inventing a redirect.
  }
  return location;
}

// Skip comments and raw script/style text when locating real HTML tags.
const HTML_TOKEN = /<!--[\s\S]*?-->|<(script|style|textarea|title)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/?[a-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/gi;

function skinHtml(html, upstream, proxyOrigin) {
  let result = rewriteReferences(html, upstream, proxyOrigin);
  // Retain the original project's document-CSP removal behavior, including meta
  // policies. This cannot change a browser extension's separate CSP.
  result = result.replace(HTML_TOKEN, (tag) => {
    if (/^<meta\b/i.test(tag) &&
        /\bhttp-equiv\s*=\s*(?:"content-security-policy(?:-report-only)?"|'content-security-policy(?:-report-only)?'|content-security-policy(?:-report-only)?(?=\s|\/?>))/i.test(tag)) {
      return "";
    }
    if (/^<title\b/i.test(tag)) return `<title>${TITLE}</title>`;
    return tag;
  });

  // A non-deferred external script installs fetch/XHR hooks before upstream code.
  // Keep <meta charset> first when present.
  const config = `data-upstream-origin="${upstream.origin}"`;
  const tags = `\n<link rel="stylesheet" href="/rebrand.css?v=${BRAND_VERSION}">\n` +
    `<script src="/rebrand.js?v=${BRAND_VERSION}" ${config}></script>\n`;
  const head = /<head\b[^>]*>(\s*<meta\b[^>]*charset\s*=[^>]*>)?/i;
  if (head.test(result)) {
    result = result.replace(head, (opening) => opening + tags);
  } else {
    const root = /<html\b[^>]*>/i;
    const newHead = `<head><meta charset="utf-8"><title>${TITLE}</title>${tags}</head>`;
    result = root.test(result)
      ? result.replace(root, (opening) => opening + newHead)
      : `<!doctype html><html>${newHead}<body>${result}</body></html>`;
  }
  return result;
}

export function createProxy({ upstreamOrigin, fetchImpl = fetch }) {
  let upstream;
  try {
    upstream = new URL(upstreamOrigin);
    if (!["https:", "http:"].includes(upstream.protocol) || upstream.username ||
        upstream.password || upstream.pathname !== "/" || upstream.search || upstream.hash) {
      upstream = null;
    }
  } catch {
    upstream = null;
  }

  return async function handleProxy(request) {
    if (!upstream) {
      return new Response("Set UPSTREAM_ORIGIN to an http(s) origin without a path or credentials.", { status: 500 });
    }
    const incoming = new URL(request.url);
    // NextURL normalizes loopback hosts to "localhost". Retain the browser's
    // actual Host for redirects, rewritten URLs and same-origin POST checks.
    const publicHost = request.headers.get("host");
    if (publicHost) {
      try {
        if (/[\s,\\/?#@]/.test(publicHost)) throw new Error("Invalid host");
        const publicUrl = new URL(`${incoming.protocol}//${publicHost}`);
        incoming.host = publicUrl.host;
      } catch {
        return new Response("Invalid request host.", { status: 400 });
      }
    }
    if (incoming.origin === upstream.origin) {
      return new Response("UPSTREAM_ORIGIN must point to the original platform, not this proxy.", { status: 500 });
    }
    if (incoming.pathname === "/" && !incoming.search && ["GET", "HEAD"].includes(request.method)) {
      // Next's Edge adapter may append headers. Response.redirect() has immutable
      // headers in that runtime, so construct a mutable redirect response instead.
      return new Response(null, {
        status: 307,
        headers: { location: `${incoming.origin}${DEFAULT_LANDING_PATH}` },
      });
    }

    // Assign the path instead of resolving it: //another-host must not change origin.
    const target = new URL(upstream.origin);
    target.pathname = incoming.pathname;
    target.search = incoming.search;
    const headers = new Headers(request.headers);
    removeHopByHopHeaders(headers);
    headers.set("host", upstream.host);
    headers.set("accept-encoding", "identity");
    headers.delete("content-length");
    // Modified HTML cannot safely reuse upstream validators or a bodyless 304.
    headers.delete("if-none-match");
    headers.delete("if-modified-since");
    for (const key of [...headers.keys()]) {
      if (/^(?:x-forwarded-|x-vercel-|forwarded$)/i.test(key)) headers.delete(key);
    }
    // Translate same-origin metadata; keep genuinely cross-site origins visible.
    if (headers.get("origin") === incoming.origin) headers.set("origin", upstream.origin);
    const referer = headers.get("referer");
    if (referer) {
      try {
        const url = new URL(referer);
        if (url.origin === incoming.origin) {
          headers.set("referer", `${upstream.origin}${url.pathname}${url.search}`);
        }
      } catch { headers.delete("referer"); }
    }

    let response;
    try {
      response = await fetchImpl(target, {
        method: request.method,
        headers,
        // A byte buffer works in both Node and Edge (no streaming-duplex mismatch).
        body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
        redirect: "manual",
        cache: "no-store",
        signal: request.signal,
      });
    } catch {
      return new Response("Proxy Error: Unable to reach the configured exam server.", {
        status: 502, headers: { "cache-control": "no-store" },
      });
    }

    const outgoing = new Headers(response.headers);
    removeHopByHopHeaders(outgoing);
    outgoing.delete("content-encoding");
    outgoing.delete("content-length");
    const location = outgoing.get("location");
    if (location) outgoing.set("location", rewriteLocation(location, target, upstream, incoming.origin));
    const cookies = getCookies(response.headers);
    outgoing.delete("set-cookie");
    for (const cookie of cookies) {
      // Keep Secure, HttpOnly, SameSite, Path, expiry and cookie prefixes intact.
      outgoing.append("set-cookie", cookie.replace(/;\s*domain\s*=[^;]*/gi, ""));
    }

    const isHtml = /\btext\/html\b/i.test(outgoing.get("content-type") || "");
    if (isHtml) {
      outgoing.delete("content-security-policy");
      outgoing.delete("content-security-policy-report-only");
      outgoing.delete("etag");
      outgoing.delete("last-modified");
      outgoing.delete("content-md5");
      outgoing.delete("digest");
      outgoing.delete("content-digest");
      outgoing.delete("repr-digest");
      outgoing.set("content-type", "text/html; charset=utf-8");
      outgoing.set("x-hexa-proxy", BRAND_VERSION);
    }
    // Never let a CDN reuse one student's authenticated page/API response for another.
    if (isHtml || headers.has("cookie") || headers.has("authorization") || cookies.length) {
      outgoing.set("cache-control", "private, no-store");
      outgoing.set("cdn-cache-control", "no-store");
      outgoing.set("vercel-cdn-cache-control", "no-store");
      outgoing.delete("surrogate-control");
      outgoing.delete("expires");
    }

    const noBody = request.method === "HEAD" || [204, 205, 304].includes(response.status);
    if (noBody) {
      if (response.body) await response.body.cancel();
      return new Response(null, { status: response.status, headers: outgoing });
    }
    if (isHtml) {
      try {
        const html = skinHtml(await response.text(), upstream, incoming.origin);
        return new Response(html, { status: response.status, headers: outgoing });
      } catch {
        return new Response("Proxy Error: Unable to read the exam page.", {
          status: 502, headers: { "cache-control": "no-store" },
        });
      }
    }
    return new Response(response.body, { status: response.status, headers: outgoing });
  };
}
