// assets/js/nav.js
(() => {
  const headerMount = document.getElementById("siteHeader");
  if (!headerMount) return;

  // Single source of truth for nav links
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
        <a href="/" class="brand" aria-label="TomoFlow Home">
          <img src="/assets/img/logo.svg" alt="TomoFlow logo" class="brand-logo" />
          <span class="brand-text">TomoFlow</span>
        </a>

        <!-- Hamburger (button) -->
        <button
          class="nav-toggle"
          id="navToggle"
          type="button"
          aria-label="Open menu"
          aria-expanded="false"
          aria-controls="drawerNav"
        >
          ☰
        </button>
      </div>

      <!-- Backdrop -->
      <div class="drawer-backdrop" id="drawerBackdrop" hidden></div>

      <!-- Side drawer -->
      <aside class="drawer" id="drawer" aria-hidden="true">
        <div class="drawer-header">
          <span class="drawer-title">Menu</span>
          <button class="drawer-close" id="drawerClose" type="button" aria-label="Close menu">✕</button>
        </div>

        <nav class="drawer-nav" id="drawerNav" aria-label="Site navigation">
          ${links.map(l => `<a href="${l.href}">${l.label}</a>`).join("")}
        </nav>
      </aside>
    </header>
  `;

  const navToggle = document.getElementById("navToggle");
  const drawer = document.getElementById("drawer");
  const drawerNav = document.getElementById("drawerNav");
  const backdrop = document.getElementById("drawerBackdrop");
  const closeBtn = document.getElementById("drawerClose");

  if (!navToggle || !drawer || !backdrop || !drawerNav || !closeBtn) return;

  const setOpen = (open) => {
    drawer.classList.toggle("is-open", open);
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");

    // Backdrop
    backdrop.hidden = !open;

    // Prevent background scroll when drawer is open
    document.documentElement.classList.toggle("drawer-lock", open);
    document.body.classList.toggle("drawer-lock", open);

    if (open) {
      // focus the first link for accessibility
      const firstLink = drawerNav.querySelector("a");
      if (firstLink) firstLink.focus({ preventScroll: true });
    } else {
      navToggle.focus({ preventScroll: true });
    }
  };

  const toggle = () => setOpen(!drawer.classList.contains("is-open"));

  navToggle.addEventListener("click", (e) => {
    e.preventDefault();
    toggle();
  });

  closeBtn.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", () => setOpen(false));

  // Close on ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("is-open")) {
      setOpen(false);
    }
  });

  // Close on link click
  drawerNav.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => setOpen(false));
  });

  // Active link styling
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  drawerNav.querySelectorAll("a").forEach((a) => {
    const href = (a.getAttribute("href") || "").replace(/\/$/, "") || "/";
    if (href === path) {
      a.style.color = "var(--textPrimary)";
      a.style.fontWeight = "900";
    }
  });
})();
