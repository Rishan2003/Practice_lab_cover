// public/rebrand.js
(function () {
  "use strict";

  if (window.__HEXA_REBRAND__) return;
  const script = document.currentScript;
  const upstream = new URL(
    script?.dataset.upstreamOrigin || "https://ieltsonlinetests.com"
  );
  const status = { version: "3.1", ready: false, upstreamOrigin: upstream.origin };
  window.__HEXA_REBRAND__ = status;
  const HEXA_ICON_URL =
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT6mu5DrAMRkonoOCdbuJBIbnIfJ47KwxumRA&s";

  // 1. Install synchronously in <head>, before upstream scripts execute.
  // Use normal JavaScript: no eval(), Function constructor or string timers.
  function localUrl(value) {
    const original = String(value);
    try {
      const url = new URL(original, window.location.href);
      if (["http:", "https:"].includes(url.protocol) && url.host === upstream.host) {
        return window.location.origin + url.pathname + url.search + url.hash;
      }
    } catch {
      // Let fetch/XHR handle invalid inputs using their normal error behavior.
    }
    return original;
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (input instanceof Request) {
      const rewritten = localUrl(input.url);
      if (rewritten !== input.url) input = new Request(rewritten, input);
    } else if (typeof input === "string" || input instanceof URL) {
      input = localUrl(input);
    }
    return originalFetch(input, init);
  };

  const originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (typeof url === "string" || url instanceof URL) {
      url = localUrl(url);
    }
    return originalXhrOpen.call(this, method, url, ...rest);
  };

  // 2. Set Favicon once per page load
  function setFaviconOnce() {
    if (document.head && !document.head.dataset.faviconSet) {
      document.querySelectorAll('link[rel*="icon"]').forEach((el) => el.remove());
      const link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      link.href = HEXA_ICON_URL + "&v=" + Date.now();
      document.head.appendChild(link);
      document.head.dataset.faviconSet = "true";
    }
  }

  // 3. Main DOM Transformation Function (All your extension rules)
  function applyHexaBranding() {
    // Page Title & Favicon
    if (document.title !== "HEXA'S MAJORTILA PRACTICE LAB") {
      document.title = "HEXA'S MAJORTILA PRACTICE LAB";
    }
    setFaviconOnce();

    // Keep dynamically inserted navigation and form submissions on the proxy.
    document.querySelectorAll("a[href], form[action]").forEach((element) => {
      const attribute = element.tagName === "FORM" ? "action" : "href";
      const current = element.getAttribute(attribute);
      const rewritten = localUrl(current);
      if (rewritten !== current) element.setAttribute(attribute, rewritten);
    });

    // Replace .logo with HEXA'S h1 heading
    const logoElement = document.getElementsByClassName("logo")[0];
    if (logoElement) {
      const newHeading = document.createElement("h1");
      newHeading.textContent = "HEXA'S MAJORTILA EXAM PRACTICE LAB";
      newHeading.className = "site-title";
      newHeading.style.color = "white";
      logoElement.replaceWith(newHeading);
    }

    // Header styling
    const header = document.querySelector(".header");
    if (header) {
      header.style.cssText = "background-color:#C8102E; margin-bottom:10px;";
    }
    const siteTitle = document.querySelector(".site-title");
    if (siteTitle) {
      siteTitle.style.color = "white";
    }

    // Main Menu first link adjustments
    const firstMenuLink = document.querySelector(".main-menu__item a");
    if (firstMenuLink) {
      firstMenuLink.setAttribute("href", "/ielts-exam-library");
      const span = firstMenuLink.querySelector("span");
      if (span && span.textContent !== "Practice Library") {
        span.textContent = "Practice Library";
      }
    }

    // Remove first item inside .skill-nav (guarded so it only removes once!)
    const skillNav = document.querySelector(".skill-nav");
    if (skillNav && !skillNav.dataset.firstRemoved && skillNav.firstElementChild) {
      skillNav.removeChild(skillNav.firstElementChild);
      skillNav.dataset.firstRemoved = "true";
    }

    // Rename Mocktest Pack Titles -> "Practice Test 1, 2, 3..."
    document.querySelectorAll(".mocktest-card__pack-title").forEach((el, i) => {
      const targetText = `Practice Test ${i + 1}`;
      if (el.textContent !== targetText) {
        el.textContent = targetText;
      }
    });

    // Mocktest Wrapper: Remove 3rd child onwards & rename first two card titles
    document
      .querySelectorAll(".mocktest-wrapper > *:nth-child(n+3)")
      .forEach((el) => el.remove());

    const cardTitles = document.querySelectorAll(
      ".mocktest-wrapper .mocktest-card__title"
    );
    if (cardTitles[0] && cardTitles[0].textContent !== "Practice Tests") {
      cardTitles[0].textContent = "Practice Tests";
    }
    if (
      cardTitles[1] &&
      cardTitles[1].textContent !== "IELTS Practice Tests Plus"
    ) {
      cardTitles[1].textContent = "IELTS Practice Tests Plus";
    }

    // ==================== WRITING SECTION ====================
    const evalTitle = document.querySelector(".evaluation-widget__title");
    if (evalTitle && evalTitle.textContent !== "Evaluation") {
      evalTitle.textContent = "Evaluation";
    }

    const congratBody = document.querySelector(".congrat-box__body");
    if (congratBody && !congratBody.dataset.cleaned) {
      if (congratBody.firstElementChild) congratBody.firstElementChild.remove();
      if (congratBody.firstElementChild) congratBody.firstElementChild.remove();
      congratBody.dataset.cleaned = "true";
    }

    const contents = document.querySelector(".congrat-box__body-contents");
    while (contents && contents.children.length > 1) {
      contents.removeChild(contents.lastElementChild);
    }

    const evalWidget = document.querySelector(".evaluation-widget");
    if (evalWidget && !evalWidget.dataset.cleaned) {
      document
        .querySelectorAll(
          ".evaluation-widget > *:not(:nth-child(3)):not(:last-child)"
        )
        .forEach((el) => el.remove());
      evalWidget.dataset.cleaned = "true";
    }

    // ==================== WRITING RESULT SECTION ====================
    const colLeft = document.querySelector(".col-left");
    if (colLeft && !colLeft.dataset.cleaned && colLeft.children[1]) {
      colLeft.children[1].remove();
      colLeft.dataset.cleaned = "true";
    }

    document.querySelectorAll(".user-feedback").forEach((el) => el.remove());

    // ==================== READING & REALTEST RESULTS SECTION ====================
    document.querySelectorAll(".realtest-header__logo").forEach((img) => {
      if (img.src !== HEXA_ICON_URL) {
        img.src = HEXA_ICON_URL;
        img.srcset = "";
      }
    });

    const studentScore = document.querySelector(".student-score");
    if (studentScore) {
      const scoreImg = studentScore.querySelector("img");
      const scoreDiv = studentScore.querySelector("div");
      if (scoreImg) scoreImg.style.display = "none";
      if (scoreDiv) scoreDiv.style.display = "none";
    }
  }

  // Batch upstream changes and disconnect during our own writes to avoid a loop.
  let scheduled = false;
  const observer = new MutationObserver(scheduleBranding);
  function scheduleBranding() {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(runBranding);
    }
  }

  function runBranding() {
    observer.disconnect();
    try {
      applyHexaBranding();
      status.ready = true;
    } finally {
      scheduled = false;
      observer.observe(document.documentElement, {
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "href", "action"],
        subtree: true,
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runBranding, { once: true });
  } else {
    runBranding();
  }
})();
