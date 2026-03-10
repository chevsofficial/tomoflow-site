// assets/js/nav.js
(() => {
  const headerMount = document.getElementById('siteHeader');
  if (!headerMount) return;

  const primaryLinks = [
    { href: '/', label: 'Home' },
    { href: '/app', label: 'Web App' },
  ];

  const legalLinks = [
    { href: '/faq', label: 'FAQ' },
    { href: '/privacy', label: 'Privacy' },
    { href: '/support', label: 'Support' },
    { href: '/terms', label: 'Terms' },
  ];

  const linkHtml = (links) => links.map((l) => `<a href="${l.href}">${l.label}</a>`).join('');

  const authButtons = `
    <div class="auth-actions" id="authActions">
      <a class="btn btn-secondary btn-sm" data-auth="login" href="/app/auth">Login</a>
      <a class="btn btn-primary btn-sm" data-auth="signup" href="/app/auth?mode=signup">Sign up</a>
      <button class="btn btn-secondary btn-sm" data-auth="logout" id="logoutBtn" style="display:none;">Logout</button>
    </div>
  `;

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

        ${authButtons}

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
          <a href="/app/auth" data-auth="login">Login</a>
          <a href="/app/auth?mode=signup" data-auth="signup">Sign up</a>
          <a href="#" id="drawerLogout" data-auth="logout" style="display:none;">Logout</a>
        </nav>
      </aside>
    </header>
  `;

  const navToggle = document.getElementById('navToggle');
  const drawer = document.getElementById('drawer');
  const drawerNav = document.getElementById('drawerNav');
  const backdrop = document.getElementById('drawerBackdrop');
  const closeBtn = document.getElementById('drawerClose');

  if (!navToggle || !drawer || !backdrop || !drawerNav || !closeBtn) return;

  const setOpen = (open) => {
    drawer.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    backdrop.hidden = !open;
    document.documentElement.classList.toggle('drawer-lock', open);
    document.body.classList.toggle('drawer-lock', open);
  };

  navToggle.addEventListener('click', (e) => {
    e.preventDefault();
    setOpen(!drawer.classList.contains('is-open'));
  });

  closeBtn.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) setOpen(false);
  });
  drawerNav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setOpen(false)));

  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const markActive = (root) => {
    root.querySelectorAll('a').forEach((a) => {
      const href = (a.getAttribute('href') || '').replace(/\/$/, '') || '/';
      if (href === path) {
        a.style.color = 'var(--textPrimary)';
        a.style.fontWeight = '900';
      }
    });
  };

  const desktopNav = headerMount.querySelector('.nav-desktop');
  if (desktopNav) markActive(desktopNav);
  markActive(drawerNav);

  const footerContainer = document.querySelector('.site-footer .container');
  if (footerContainer && !footerContainer.querySelector('.footer-links')) {
    const links = document.createElement('div');
    links.className = 'footer-links';
    links.innerHTML = legalLinks.map((l) => `<a href="${l.href}">${l.label}</a>`).join(' · ');
    footerContainer.appendChild(links);
  }

  const setAuthUi = (loggedIn) => {
    document.querySelectorAll('[data-auth="login"],[data-auth="signup"]').forEach((el) => {
      el.style.display = loggedIn ? 'none' : '';
    });
    document.querySelectorAll('[data-auth="logout"]').forEach((el) => {
      el.style.display = loggedIn ? '' : 'none';
    });
  };

  const loadSupabase = () =>
    new Promise((resolve, reject) => {
      if (window.supabase?.createClient) return resolve(window.supabase);
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.async = true;
      script.onload = () => resolve(window.supabase);
      script.onerror = reject;
      document.head.appendChild(script);
    });

  const SUPABASE_URL = 'https://zkstcywertzzooxefwuh.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inprc3RjeXdlcnR6em9veGVmd3VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxOTcwMjYsImV4cCI6MjA3OTc3MzAyNn0.ippeFJsR93VTUxgEA4wSrYxAlhKS4NzUPoDHd4VSbCk';

  let supabaseClient;
  const initAuth = async () => {
    try {
      const supabase = await loadSupabase();
      supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data } = await supabaseClient.auth.getSession();
      setAuthUi(Boolean(data?.session?.user));
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        setAuthUi(Boolean(session?.user));
      });
    } catch {
      setAuthUi(false);
    }
  };

  const logout = async (ev) => {
    ev.preventDefault();
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
    setAuthUi(false);
    window.location.href = '/';
  };

  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  document.getElementById('drawerLogout')?.addEventListener('click', logout);

  initAuth();
})();
