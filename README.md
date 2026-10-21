# HEXA'S IELTS Practice Lab proxy

This is a Next.js 15 reverse proxy with a CSS/JavaScript branding layer. It forwards
HTTP requests to the configured platform. It does not copy that platform's
database or guarantee that every third-party login or integration works through
a different domain.

## The reported `unsafe-eval` error

The policy in the reported error contains:

```text
script-src 'self' 'wasm-unsafe-eval' 'inline-speculation-rules' chrome-extension://...
```

That matches Chrome's isolated extension content-script CSP. It strongly points
to an installed browser extension evaluating a JavaScript string. Neither the
uploaded application's source nor this correction uses `eval()`, `new Function()`
or string timers. The error alone does not prove the proxy request failed.

1. Open the Vercel URL in a Chrome Guest profile with no extensions. Alternatively,
   use Incognito and ensure no extension has **Allow in Incognito** enabled.
2. If the error disappears, click its source filename/stack in your normal
   profile's Console to identify the extension. Disable it for this site or update
   the extension. Students do not need a branding extension for this project.
3. If it is your own extension, ship its JavaScript as a script file and execute
   functions directly. Remove string evaluation from the extension and its
   dependencies. The extension's source/manifest is not included in this archive.
4. Do not add `unsafe-eval` to this site's headers to fix an extension error.
   A page response cannot relax the extension's separate CSP.

Official references:
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#content-security-policy
- https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy

## Run locally

Use a supported Node.js version (Node 22 or newer is suitable for this project).
Keep the included lockfile; the dependencies have not been upgraded by this fix.

```bash
npm ci
cp .env.example .env.local
```

Edit `.env.local`:

```dotenv
UPSTREAM_ORIGIN=https://your-actual-platform.example
```

Replace the example hostname with the real origin of the acquired platform. The
original archive hardcodes `https://ieltsonlinetests.com`; this remains the
compatibility default if the variable is omitted. Do not set it to your Vercel
URL, and do not include a page path or login credentials.

```bash
npm test
npm run dev
```

Open `http://localhost:3000`. The root redirects to the original IELTS library
path. For a platform with a different landing page, edit `DEFAULT_LANDING_PATH`
in `lib/proxy.mjs`. Secure/prefixed authentication cookies may require HTTPS;
verify authentication on your HTTPS Vercel deployment.

For a local production check:

```bash
npm run build
npm run test:production
npm start
```

## Update the existing Vercel project

1. Copy the corrected source files from this folder into your existing repository.
   Keep your existing `.git` folder and Vercel project association. This source
   archive intentionally excludes `.git`, `node_modules`, build output and secrets.
2. In the existing Vercel project's environment variables, set `UPSTREAM_ORIGIN`
   for Production (and Preview if needed). Use the original platform origin.
3. Use the **Next.js** framework preset and the standard `npm run build` command.
   If this folder is nested in your repository, select it as the Root Directory.
4. Commit/push the source changes or redeploy through your existing Vercel workflow.
   Environment variable changes require a new deployment.
5. Open the deployed URL in an extension-free profile and hard-refresh it.

## Confirm what is failing

In DevTools **Network**, inspect the main document response:

- `x-hexa-proxy: 3.0` confirms the request reached the updated HTML handler.
- `/rebrand.js?v=3.0` must return JavaScript with status 200.
- `/rebrand.css?v=3.0` must return CSS with status 200.
- View Source should show those tags near the start of `<head>`, before the
  platform's scripts. The branding script must not have `defer` or `async`.

In Console, select the page's **top** execution context and enter:

```js
window.__HEXA_REBRAND__
```

After DOMContentLoaded it should report `version: "3.0"`, `ready: true` and the
configured upstream origin. An extension's isolated execution context cannot see
this page variable.

| Observation | Next check |
| --- | --- |
| Error source begins with `chrome-extension://` | Identify/disable the extension; compare with Guest mode. |
| Branding files are 404 or return HTML | Confirm the Vercel Root Directory and that `public/` was deployed. |
| Document is 502 | Verify the upstream hostname, availability and server-side reachability. |
| Document is 403/429 or contains an access challenge | The upstream rejected the request. Use its supported custom-domain/proxy configuration; this code does not bypass access challenges. |
| Login redirects leave the proxy | External OAuth/SSO callback URLs and allowed domains must be configured with the provider. |
| Script reports ready but a logo remains | The upstream DOM selectors have changed; inspect that page and adjust the branding rules. |
| A fresh page-level CSP error remains | Inspect the document's response headers/meta tags and any CSP added by Vercel config or another proxy. |

Do not paste passwords, session cookies or authorization headers when sharing a
failed request. The URL, method, status, error text and script filename are enough
to start diagnosis.

## Corrections included

- The request hooks load before upstream scripts and accept string, URL and
  Request inputs. POST bodies, credentials, headers and abort signals survive.
- URL matching uses the configured hostname. Similar-looking and unrelated
  domains are not routed through the proxy; dynamic links/forms are updated.
- Relative and same-upstream redirects remain on the proxy. External sign-in
  destinations remain external.
- Multiple Set-Cookie values work with and without `Headers.getSetCookie()`;
  only Domain is removed. Secure, HttpOnly, SameSite, expiry and Path are retained.
- HTML and authenticated responses are not cached for reuse across students.
  Modified HTML does not retain stale upstream ETags or lengths.
- HEAD, 204/205/304 and audio Range responses are handled without illegal bodies.
- The root redirect uses mutable response headers. The original
  `Response.redirect()` caused a 500 (`TypeError: immutable`) in the production
  Next.js Edge adapter during the local integration check.
- Root POSTs reach the platform instead of being redirected. Request paths cannot
  replace the configured upstream host.
- Redirects and same-origin POST checks retain the browser's Host even when Next
  normalizes a local `127.0.0.1` URL to `localhost` internally.
- Branding no longer hides arbitrary Bootstrap columns, generic menus, right
  columns, exam cards or question images. The first menu link now says
  **Practice Library** and works. Other original branding rules remain editable.
- The DOM observer disconnects during its own edits, and duplicate script loads
  do not repeatedly wrap fetch/XHR.

## Scope and validation

Validation completed with Node.js 24.19.0 and the archive's locked dependencies:
23 automated tests passed, the Next.js production build completed, and the
production server smoke test passed for root/login redirects, HTML injection,
static branding files, separate cookies, POST forwarding and audio byte ranges.
No live account or real-browser visual exam flow was tested.

The original design removes the upstream document's CSP. This version keeps that
behavior and handles CSP meta tags too; it does not add `unsafe-eval`. Removing a
document's CSP removes its browser script restrictions. For production, configure
a policy appropriate to the branded application with the platform owner. The
original frame protection and HTTPS security headers are preserved.

This is a single-origin HTTP proxy, not a universal website rewriter. Separate
API/CDN origins, WebSockets, service workers, signed URLs and OAuth callbacks may
need upstream changes. JavaScript/CSS response bodies are streamed unchanged;
hardcoded navigation in those files is not universally rewritten. Existing DOM
skinning selectors can also need adjustment after platform updates.

Automated checks use mock responses and a JavaScript VM with string code
generation disabled. They cover the forwarding/injection behavior and early
client request hooks, not the provider's real student accounts or complete exam
flows. Check login, test navigation, a listening audio seek and answer submission
on your actual HTTPS deployment before using it with students.
