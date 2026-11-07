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

  const drawerLinks = [...primaryLinks, ...legalLinks.filter(link => !primaryLinks.some(primary => primary.href === link.href))];

  const linkHtml = (links) =>
    links.map((l) => `<a href="${l.href}">${l.label}</a>`).join("");

  headerMount.innerHTML = `
    <header class="site-header">
      <div class="container site-header-inner">
        <a href="/" class="brand" aria-label="TomoFlow Home">
          <img src="/assets/img/logo.webp" width="34" height="34" alt="TomoFlow logo" class="brand-logo" />
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

      <aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="Navigation menu" aria-hidden="true" inert>
        <div class="drawer-header">
          <span class="drawer-title">Menu</span>
          <button class="drawer-close" id="drawerClose" type="button" aria-label="Close menu">✕</button>
        </div>
        <nav class="drawer-nav" id="drawerNav" aria-label="Mobile">
          ${linkHtml(drawerLinks)}
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

  let previousFocus = null;
  const setOpen = (open) => {
    if (open) previousFocus = document.activeElement;
    drawer.inert = !open;
    const main = document.querySelector("main");
    const footer = document.querySelector(".site-footer");
    if (main) main.inert = open;
    if (footer) footer.inert = open;
    drawer.classList.toggle("is-open", open);
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    backdrop.hidden = !open;
    document.documentElement.classList.toggle("drawer-lock", open);
    document.body.classList.toggle("drawer-lock", open);
    if (open) closeBtn.focus();
    else {
      const target = navToggle.getClientRects().length ? previousFocus : headerMount.querySelector(".brand");
      target?.focus();
    }
  };

  navToggle.addEventListener("click", (e) => {
    e.preventDefault();
    setOpen(!drawer.classList.contains("is-open"));
  });
  closeBtn.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (e) => {
    if (!drawer.classList.contains("is-open")) return;
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
    if (e.key !== "Tab") return;
    const targets = Array.from(drawer.querySelectorAll("button, a[href]"));
    const first = targets[0], last = targets[targets.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  window.matchMedia("(min-width: 641px)").addEventListener("change", event => {
    if (event.matches && drawer.classList.contains("is-open")) setOpen(false);
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
