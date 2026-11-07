// assets/js/nav.js — thin header/footer, no accounts
(() => {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const headerMount = document.getElementById("siteHeader");
  if (!headerMount) return;

  const primaryLinks = [
    { href: "/", label: "Timer" },
    { href: "/#pro", label: "Pro" },
    { href: "/support", label: "Support" },
  ];

  const legalLinks = [
    { href: "/privacy", label: "Privacy" },
    { href: "/support", label: "Support" },
    { href: "/terms", label: "Terms" },
  ];

  const linkHtml = (links) =>
    links.map((l) => `<a href="${l.href}">${l.label}</a>`).join("");

  headerMount.innerHTML = `
    <header class="site-header">
      <div class="container site-header-inner">
        <a href="/" class="brand" aria-label="TomoFlow Home">
          <img src="/assets/img/logo.svg" alt="TomoFlow logo" class="brand-logo" />
          <span class="brand-text">TomoFlow</span>
        </a>

        <nav class="nav nav-desktop" aria-label="Primary">
          ${linkHtml(primaryLinks)}
        </nav>

        <button
          class="nav-toggle"
          id="navToggle"
          type="button"
          aria-label="Open menu"
          aria-expanded="false"
          aria-controls="drawer"
        >☰</button>
      </div>

      <div class="drawer-backdrop" id="drawerBackdrop" hidden></div>

      <aside class="drawer" id="drawer" aria-hidden="true">
        <div class="drawer-header">
          <span class="drawer-title">Menu</span>
          <button class="drawer-close" id="drawerClose" type="button" aria-label="Close menu">✕</button>
        </div>
        <nav class="drawer-nav" id="drawerNav" aria-label="Mobile">
          ${linkHtml(primaryLinks)}
          ${linkHtml(legalLinks)}
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
    backdrop.hidden = !open;
    document.documentElement.classList.toggle("drawer-lock", open);
    document.body.classList.toggle("drawer-lock", open);
  };

  navToggle.addEventListener("click", (e) => {
    e.preventDefault();
    setOpen(!drawer.classList.contains("is-open"));
  });
  closeBtn.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("is-open")) setOpen(false);
  });
  drawerNav.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => setOpen(false))
  );

  const footerContainer = document.querySelector(".site-footer .container");
  if (footerContainer && !footerContainer.querySelector(".footer-links")) {
    const links = document.createElement("div");
    links.className = "footer-links";
    links.innerHTML = legalLinks
      .map((l) => `<a href="${l.href}">${l.label}</a>`)
      .join(" · ");
    footerContainer.appendChild(links);
  }
})();
