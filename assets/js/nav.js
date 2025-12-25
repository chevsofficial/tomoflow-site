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

  headerMount.innerHTML = `
    <header class="site-header">
      <div class="container site-header-inner">
        <a href="/" class="brand">
          <img src="/assets/img/logo.svg" alt="TomoFlow logo" class="brand-logo" />
          <span class="brand-text">TomoFlow</span>
        </a>

        <!-- ✅ Icon-based hamburger -->
        <button class="nav-toggle" id="navToggle" aria-label="Toggle navigation" aria-expanded="false" aria-controls="siteNav">
          ☰
        </button>

        <nav class="nav" id="siteNav">
          ${links.map(l => `<a href="${l.href}">${l.label}</a>`).join("")}
        </nav>
      </div>
    </header>
  `;

  const navToggle = document.getElementById("navToggle");
  const nav = document.getElementById("siteNav");
  if (!navToggle || !nav) return;

  function setOpen(open) {
    nav.classList.toggle("nav-open", open);
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  navToggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = nav.classList.contains("nav-open");
    setOpen(!isOpen);
  });

  // Close nav if user taps outside
  document.addEventListener("click", (e) => {
    if (!nav.classList.contains("nav-open")) return;
    const target = e.target;
    const clickedInside = nav.contains(target) || navToggle.contains(target);
    if (!clickedInside) setOpen(false);
  });

  // Close on any link click (nice mobile UX)
  nav.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => setOpen(false));
  });

  // Active link style
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  nav.querySelectorAll("a").forEach((a) => {
    const href = (a.getAttribute("href") || "").replace(/\/$/, "") || "/";
    if (href === path) {
      a.style.color = "var(--textPrimary)";
      a.style.fontWeight = "900";
    }
  });
})();
