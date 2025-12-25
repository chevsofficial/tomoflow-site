// assets/js/nav.js
(() => {
  const headerMount = document.getElementById("siteHeader");
  if (!headerMount) return;

  const links = [
    { href: "/", label: "Home" },
    { href: "/app", label: "Web App" },
    { href: "/support", label: "Support" },
    { href: "/faq", label: "FAQ" },
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
  ];

  const headerHtml = `
    <header class="site-header">
      <div class="container site-header-inner">
        <a href="/" class="brand">
          <img src="/assets/img/logo.svg" alt="TomoFlow logo" class="brand-logo" />
          <span class="brand-text">TomoFlow</span>
        </a>

        <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation" aria-expanded="false" aria-controls="siteNav">
          <span class="nav-toggle-bar"></span>
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

  const navToggle = document.getElementById("navToggle");
  const nav = document.getElementById("siteNav");

  if (navToggle && nav) {
    navToggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("nav-open");
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }

  // Active link styling (uses dark theme)
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  nav?.querySelectorAll("a").forEach((a) => {
    const href = (a.getAttribute("href") || "").replace(/\/$/, "") || "/";
    if (href === path) {
      a.style.color = "var(--textPrimary)";
      a.style.fontWeight = "800";
    }
  });
})();
