import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/rebrand.js", import.meta.url), "utf8");
function load() {
  const fetchCalls = [];
  const xhrCalls = [];
  const events = [];
  class XHR {
    open(...args) { xhrCalls.push(args); }
  }
  const document = {
    readyState: "loading",
    currentScript: { dataset: { upstreamOrigin: "https://exam.example" } },
    addEventListener: (...args) => events.push(args),
  };
  const window = {
    location: { href: "https://hexa.example/tests", origin: "https://hexa.example" },
    fetch: async (input, init) => {
      fetchCalls.push({ input, init });
      return new Response("ok");
    },
  };
  const context = vm.createContext({
    window, document, URL, Request, XMLHttpRequest: XHR,
    MutationObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame() { throw new Error("DOM must not run before DOMContentLoaded"); },
  }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(source, context);
  return { window, context, fetchCalls, xhrCalls, events, XHR };
}

test("network hooks install before DOMContentLoaded with string evaluation disabled", async () => {
  const { window, fetchCalls, events } = load();
  assert.equal(window.__HEXA_REBRAND__.version, "3.0");
  assert.equal(window.__HEXA_REBRAND__.ready, false);
  assert.equal(events[0][0], "DOMContentLoaded");
  await window.fetch("https://exam.example/api?attempt=1");
  assert.equal(fetchCalls[0].input, "https://hexa.example/api?attempt=1");
});

test("string, URL and protocol-relative fetch inputs all use the proxy", async () => {
  const { window, fetchCalls } = load();
  for (const input of ["https://exam.example/api", new URL("https://exam.example/api"), "//exam.example/api"]) {
    await window.fetch(input);
    assert.equal(fetchCalls.at(-1).input, "https://hexa.example/api");
  }
});

test("Request rewriting retains POST body, headers, credentials, abort and init overrides", async () => {
  const { window, fetchCalls } = load();
  const controller = new AbortController();
  const input = new Request("https://exam.example/answers", {
    method: "POST", body: "answer=42", credentials: "include",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-attempt": "2" },
    signal: controller.signal,
  });
  const init = { cache: "no-store" };
  await window.fetch(input, init);
  const rewritten = fetchCalls[0].input;
  assert.equal(rewritten.url, "https://hexa.example/answers");
  assert.equal(rewritten.method, "POST");
  assert.equal(rewritten.credentials, "include");
  assert.equal(rewritten.headers.get("x-attempt"), "2");
  assert.equal(await rewritten.text(), "answer=42");
  assert.equal(fetchCalls[0].init, init);
  controller.abort();
  assert.equal(rewritten.signal.aborted, true);
});

test("relative paths, unrelated domains and lookalike domains remain unchanged", async () => {
  const { window, fetchCalls } = load();
  for (const input of ["/api", "https://exam.example.evil.test/api", "https://cdn.exam.example/audio", "https://other.example/?next=https://exam.example/api"]) {
    await window.fetch(input);
    assert.equal(fetchCalls.at(-1).input, input);
  }
});

test("XHR rewriting preserves method, async flag and credentials arguments", () => {
  const { XHR, xhrCalls } = load();
  const xhr = new XHR();
  xhr.open("POST", new URL("https://exam.example/submit"), true, "student", "test-password");
  assert.deepEqual(xhrCalls[0], ["POST", "https://hexa.example/submit", true, "student", "test-password"]);
  xhr.open("GET", "https://other.example/audio", false);
  assert.equal(xhrCalls[1][1], "https://other.example/audio");
});

test("loading the branding script twice does not wrap fetch twice", () => {
  const { context, window, events } = load();
  const firstHook = window.fetch;
  vm.runInContext(source, context);
  assert.equal(window.fetch, firstHook);
  assert.equal(events.length, 1);
});
