// app/[[...slug]]/route.js
export const runtime = "edge";
export const dynamic = "force-dynamic";

const TARGET_DOMAIN = "ieltsonlinetests.com";
const TARGET_ORIGIN = `https://${TARGET_DOMAIN}`;
const DEFAULT_LANDING_PATH =
  "/ielts-exam-library?tab&search&sort=high_ranking&skill=listening";

async function handleProxy(request) {
  const incomingUrl = new URL(request.url);
  const proxyOrigin = incomingUrl.origin;

  // 1. Automatically redirect root "/" to the IELTS Exam Library page
  if (incomingUrl.pathname === "/" && !incomingUrl.search) {
    return Response.redirect(`${proxyOrigin}${DEFAULT_LANDING_PATH}`, 307);
  }

  // 2. Build the target URL on ieltsonlinetests.com
  const targetUrl = new URL(
    incomingUrl.pathname + incomingUrl.search,
    TARGET_ORIGIN
  );

  // 3. Spoof headers so ieltsonlinetests.com serves the page normally
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("host", TARGET_DOMAIN);
  requestHeaders.set("origin", TARGET_ORIGIN);
  requestHeaders.set("referer", `${TARGET_ORIGIN}${incomingUrl.pathname}`);
  requestHeaders.delete("accept-encoding");
  requestHeaders.delete("x-forwarded-host");

  const isBodyMethod = !["GET", "HEAD"].includes(request.method);
  const fetchOptions = {
    method: request.method,
    headers: requestHeaders,
    body: isBodyMethod ? request.body : undefined,
    redirect: "manual",
  };

  let response;
  try {
    response = await fetch(targetUrl.toString(), fetchOptions);
  } catch (err) {
    return new Response("Proxy Error: Unable to reach exam server.", {
      status: 502,
    });
  }

  // 4. Clean security and compression headers
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("content-security-policy");
  responseHeaders.delete("content-security-policy-report-only");
  responseHeaders.delete("x-frame-options");
  responseHeaders.delete("strict-transport-security");

  // 5. Keep all 301/302 redirects on your .vercel.app domain
  const location = responseHeaders.get("location");
  if (location) {
    const rewrittenLocation = location
      .replace(TARGET_ORIGIN, proxyOrigin)
      .replace(`http://${TARGET_DOMAIN}`, proxyOrigin)
      .replace(TARGET_DOMAIN, incomingUrl.host);
    responseHeaders.set("location", rewrittenLocation);
  }

  // 6. Rewrite cookies so login/test sessions stay on your .vercel.app link
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];

  if (cookies.length > 0) {
    responseHeaders.delete("set-cookie");
    for (const cookie of cookies) {
      let cleaned = cookie
        .replace(/Domain=[^;]+;?/gi, "")
        .replace(/SameSite=None/gi, "SameSite=Lax");

      if (incomingUrl.protocol === "http:") {
        cleaned = cleaned.replace(/;\s*Secure/gi, "");
      }
      responseHeaders.append("set-cookie", cleaned);
    }
  }

  // 7. Modify HTML pages on the fly before sending to the browser
  const contentType = responseHeaders.get("content-type") || "";
  if (contentType.includes("text/html")) {
    let html = await response.text();

    // Rewrite hardcoded domain links to your .vercel.app origin
    html = html.replaceAll(TARGET_ORIGIN, proxyOrigin);
    html = html.replaceAll(`http://${TARGET_DOMAIN}`, proxyOrigin);

    // Replace page <title> immediately at the server level
    html = html.replace(
      /<title>.*?<\/title>/is,
      "<title>HEXA'S MAJORTILA PRACTICE LAB</title>"
    );

    const injectedTags = `
      <link rel="icon" type="image/png" href="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT6mu5DrAMRkonoOCdbuJBIbnIfJ47KwxumRA&s=1" />
      <link rel="stylesheet" href="/rebrand.css?v=2.0" />
      <script src="/rebrand.js?v=2.0" defer></script>
    `;

    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `${injectedTags}</head>`);
    } else {
      html = injectedTags + html;
    }

    return new Response(html, {
      status: response.status,
      headers: responseHeaders,
    });
  }

  // 8. Stream Listening audio, images, and API responses directly through
  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const OPTIONS = handleProxy;
export const HEAD = handleProxy;