// public/rebrand.js
(function () {
  const OLD_DOMAIN = "ieltsonlinetests.com";
  const HEXA_ICON_URL =
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT6mu5DrAMRkonoOCdbuJBIbnIfJ47KwxumRA&s";

  // 1. Route any hardcoded client-side fetch/XHR requests through our Vercel proxy
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === "string" && input.includes(OLD_DOMAIN)) {
      input = input
        .replace(`https://${OLD_DOMAIN}`, window.location.origin)
        .replace(`http://${OLD_DOMAIN}`, window.location.origin);
    }
    return originalFetch.call(this, input, init);
  };

  const originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (typeof url === "string" && url.includes(OLD_DOMAIN)) {
      url = url
        .replace(`https://${OLD_DOMAIN}`, window.location.origin)
        .replace(`http://${OLD_DOMAIN}`, window.location.origin);
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
      firstMenuLink.removeAttribute("href");
      const span = firstMenuLink.querySelector("span");
      if (span && span.textContent !== "New Text") {
        span.textContent = "New Text";
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

    // First .col-md-12 & .col-md-4 hiding (matches your exact querySelector behavior)
    const firstCol12 = document.querySelector(".col-md-12");
    if (firstCol12) firstCol12.style.display = "none";

    const firstCol4 = document.querySelector(".col-md-4");
    if (firstCol4) firstCol4.style.display = "none";

    // ==================== WRITING SECTION ====================
    const evalTitle = document.querySelector(".evaluation-widget__title");
    if (evalTitle && evalTitle.innerHTML !== "Evaluation") {
      evalTitle.innerHTML = "Evaluation";
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

    document.querySelectorAll(".section-image").forEach((el) => el.remove());

    const studentScore = document.querySelector(".student-score");
    if (studentScore) {
      const scoreImg = studentScore.querySelector("img");
      const scoreDiv = studentScore.querySelector("div");
      if (scoreImg) scoreImg.style.display = "none";
      if (scoreDiv) scoreDiv.style.display = "none";
    }
  }

  // Run immediately and observe dynamic DOM updates
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyHexaBranding);
  } else {
    applyHexaBranding();
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        applyHexaBranding();
        scheduled = false;
      });
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();