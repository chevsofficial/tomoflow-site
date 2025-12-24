// assets/js/nav.js
(() => {
  const headerMount = document.getElementById("siteHeader");
  if (!headerMount) return;

  // ✅ Single source of truth for nav links
  const links = [
    { href: "/", label: "Home" },
    { href: "/app", label: "Web App" },
    { href: "/support", label: "Support" },
    { href: "/faq", label: "FAQ" },
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
  ];

  // ✅ Match your existing live pages: logo path is /assets/img/logo.svg
  const headerHtml = `
    <header class="site-header">
      <div class="container site-header-inner">
        <a href="/" class="brand">
          <img src="/assets/img/logo.svg" alt="TomoFlow logo" class="brand-logo" />
          <span class="brand-text">TomoFlow</span>
        </a>

        <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation">
          <span class="nav-toggle-bar"></span>
          <span class="nav-toggle-bar"></span>
        </button>

        <nav class="nav" id="siteNav">
          ${links.map(l => `<a href="${l.href}">${l.label}</a>`).join("")}
        </nav>
      </div>
    </header>
  `;

  headerMount.innerHTML = headerHtml;

  // Mobile burger toggle
  const navToggle = document.getElementById("navToggle");
  const nav = document.getElementById("siteNav");
  if (navToggle && nav) {
    navToggle.addEventListener("click", () => nav.classList.toggle("nav-open"));
  }

  // Optional: mark active link (nice UX)
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const anchors = nav ? nav.querySelectorAll("a") : [];
  anchors.forEach((a) => {
    const href = (a.getAttribute("href") || "").replace(/\/$/, "") || "/";
    if (href === path) {
      a.style.color = "#111827";
      a.style.fontWeight = "600";
    }
  });
})();
