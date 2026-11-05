(() => {
  const STORAGE_KEY = "tomoflow_web_v1";
  const PRO_KEY = "tomoflow_pro";
  const cfg = window.TOMOFLOW_CONFIG || {};

  const THEMES = [
    { id: "classic", name: "Classic", free: true, vars: { primary: "#FF5A5F", accent: "#00A896", bg: "#121417", surface: "#1E2126", surfaceAlt: "#2A2E35" } },
    { id: "midnight", name: "Midnight", free: true, vars: { primary: "#7C9CFF", accent: "#5EEAD4", bg: "#0B1020", surface: "#151B2E", surfaceAlt: "#1F2740" } },
    { id: "forest", name: "Forest", free: true, vars: { primary: "#3DDC97", accent: "#F4A261", bg: "#0F1612", surface: "#18241C", surfaceAlt: "#24332A" } },
    { id: "sunset", name: "Sunset", free: false, vars: { primary: "#FF7A59", accent: "#FFD166", bg: "#1A1210", surface: "#2A1B17", surfaceAlt: "#3A2620" } },
    { id: "ocean", name: "Ocean", free: false, vars: { primary: "#38BDF8", accent: "#A78BFA", bg: "#07131C", surface: "#0E1F2C", surfaceAlt: "#163244" } },
    { id: "lavender", name: "Lavender", free: false, vars: { primary: "#C084FC", accent: "#F9A8D4", bg: "#140F1A", surface: "#21182A", surfaceAlt: "#2E223A" } },
    { id: "mono", name: "Mono", free: false, vars: { primary: "#E5E7EB", accent: "#9CA3AF", bg: "#0A0A0A", surface: "#171717", surfaceAlt: "#262626" } },
    { id: "neon", name: "Neon", free: false, vars: { primary: "#39FF14", accent: "#FF00E5", bg: "#050805", surface: "#0D140E", surfaceAlt: "#152016" } },
  ];

  const defaults = {
    workMin: 25,
    breakMin: 5,
    longBreakMin: 15,
    rounds: 4,
    themeId: "classic",
  };

  const $ = (id) => document.getElementById(id);

  const loadState = () => {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
    } catch {
      return { ...defaults };
    }
  };

  const saveState = (partial) => {
    const next = { ...loadState(), ...partial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  };

  const isPro = () => localStorage.getItem(PRO_KEY) === "1";

  const setPro = (on) => {
    if (on) localStorage.setItem(PRO_KEY, "1");
    else localStorage.removeItem(PRO_KEY);
  };

  const consumeUnlockFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    const keys = cfg.proUnlockParams || ["pro", "unlocked"];
    const hit = keys.some((k) => {
      const v = params.get(k);
      return v === "1" || v === "true" || v === "yes";
    });
    if (hit) {
      setPro(true);
      params.delete("pro");
      params.delete("unlocked");
      const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", clean);
    }
  };

  let settings = loadState();
  let mode = "work"; // work | break | long
  let remainingMs = settings.workMin * 60 * 1000;
  let running = false;
  let completedRounds = 0;
  let raf = null;
  let lastTick = 0;

  const display = $("timerDisplay");
  const modeLabel = $("modeLabel");
  const roundLabel = $("roundLabel");
  const tomatoImg = $("tomatoImg");
  const startBtn = $("btnStart");
  const pauseBtn = $("btnPause");
  const resetBtn = $("btnReset");
  const skipBtn = $("btnSkip");
  const proBadge = $("proBadge");
  const toast = $("toast");

  const showToast = (msg) => {
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.hidden = true;
    }, 2800);
  };

  const format = (ms) => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const durationFor = (m) => {
    if (m === "work") return settings.workMin * 60 * 1000;
    if (m === "long") return settings.longBreakMin * 60 * 1000;
    return settings.breakMin * 60 * 1000;
  };

  const applyTheme = (themeId) => {
    const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
    if (!theme.free && !isPro()) {
      showToast("That theme needs Pro — unlock once for $21");
      return false;
    }
    const root = document.documentElement;
    Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
    settings = saveState({ themeId: theme.id });
    document.querySelectorAll("[data-theme-id]").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.themeId === theme.id);
      const locked = el.dataset.pro === "1" && !isPro();
      el.classList.toggle("is-locked", locked);
    });
    return true;
  };

  const updateChrome = () => {
    if (display) display.textContent = format(remainingMs);
    if (modeLabel) {
      modeLabel.textContent =
        mode === "work" ? "Focus" : mode === "long" ? "Long break" : "Short break";
    }
    if (roundLabel) {
      roundLabel.textContent = `Round ${Math.min(completedRounds + 1, settings.rounds)} / ${settings.rounds}`;
    }
    if (tomatoImg) {
      tomatoImg.src =
        mode === "work"
          ? "/assets/img/tomatoes/tomato-happy.png"
          : "/assets/img/tomatoes/tomato-withered.png";
      tomatoImg.alt = mode === "work" ? "Focus tomato" : "Break tomato";
    }
    if (startBtn) startBtn.disabled = running;
    if (pauseBtn) pauseBtn.disabled = !running;
    if (proBadge) {
      proBadge.hidden = !isPro();
    }
    document.body.dataset.mode = mode;
    document.title = `${format(remainingMs)} · TomoFlow`;
  };

  const tick = (now) => {
    if (!running) return;
    if (!lastTick) lastTick = now;
    const delta = now - lastTick;
    lastTick = now;
    remainingMs -= delta;
    if (remainingMs <= 0) {
      remainingMs = 0;
      updateChrome();
      completePhase();
      return;
    }
    updateChrome();
    raf = requestAnimationFrame(tick);
  };

  const start = () => {
    if (running) return;
    running = true;
    lastTick = 0;
    raf = requestAnimationFrame(tick);
    updateChrome();
  };

  const pause = () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    lastTick = 0;
    updateChrome();
  };

  const resetPhase = () => {
    pause();
    remainingMs = durationFor(mode);
    updateChrome();
  };

  const completePhase = () => {
    pause();
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = mode === "work" ? 880 : 523;
      g.gain.value = 0.05;
      o.start();
      setTimeout(() => {
        o.stop();
        ctx.close();
      }, 220);
    } catch {
      /* ignore */
    }

    if (mode === "work") {
      completedRounds += 1;
      if (completedRounds % settings.rounds === 0) mode = "long";
      else mode = "break";
    } else {
      mode = "work";
    }
    remainingMs = durationFor(mode);
    updateChrome();
    showToast(mode === "work" ? "Back to focus" : "Nice work — take a break");
  };

  const skip = () => {
    completePhase();
  };

  const bindSettings = () => {
    const work = $("cfgWork");
    const brk = $("cfgBreak");
    const long = $("cfgLong");
    const rounds = $("cfgRounds");
    if (work) work.value = settings.workMin;
    if (brk) brk.value = settings.breakMin;
    if (long) long.value = settings.longBreakMin;
    if (rounds) rounds.value = settings.rounds;

    const persist = () => {
      const next = {
        workMin: clampInt(work?.value, 1, 120, 25),
        breakMin: clampInt(brk?.value, 1, 60, 5),
        longBreakMin: clampInt(long?.value, 1, 60, 15),
        rounds: clampInt(rounds?.value, 1, 12, 4),
      };
      settings = saveState(next);
      if (!running) {
        remainingMs = durationFor(mode);
      }
      updateChrome();
    };

    [work, brk, long, rounds].forEach((el) => el?.addEventListener("change", persist));
  };

  const clampInt = (v, min, max, fallback) => {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  const renderThemes = () => {
    const grid = $("themeGrid");
    if (!grid) return;
    grid.innerHTML = THEMES.map((t) => {
      const locked = !t.free && !isPro();
      return `<button type="button" class="theme-swatch${t.id === settings.themeId ? " is-active" : ""}${locked ? " is-locked" : ""}" data-theme-id="${t.id}" data-pro="${t.free ? "0" : "1"}" style="--swatch:${t.vars.primary}" title="${t.name}${locked ? " (Pro)" : ""}">
        <span class="theme-name">${t.name}</span>
        ${locked ? '<span class="theme-lock">Pro</span>' : ""}
      </button>`;
    }).join("");
    grid.querySelectorAll("[data-theme-id]").forEach((btn) => {
      btn.addEventListener("click", () => applyTheme(btn.dataset.themeId));
    });
  };

  const bindPro = () => {
    const price = $("proPrice");
    if (price) price.textContent = cfg.proPriceLabel || "$21";
    const unlockBtn = $("btnUnlockPro");
    const link = cfg.stripePaymentLink || "";
    if (unlockBtn) {
      unlockBtn.addEventListener("click", () => {
        if (isPro()) {
          showToast("Pro is already unlocked on this browser");
          return;
        }
        if (!link || link.includes("REPLACE_WITH")) {
          showToast("Set stripePaymentLink in assets/js/config.js");
          return;
        }
        window.location.href = link;
      });
    }
    const demo = $("btnDemoPro");
    demo?.addEventListener("click", () => {
      setPro(true);
      renderThemes();
      applyTheme(settings.themeId);
      updateProUi();
      showToast("Pro unlocked on this device");
    });
  };

  const updateProUi = () => {
    const status = $("proStatus");
    if (status) {
      status.textContent = isPro()
        ? "Pro unlocked on this browser (local)."
        : "Free timer · Pro unlocks extra themes.";
    }
    if (proBadge) proBadge.hidden = !isPro();
    renderThemes();
  };

  const bindTip = () => {
    const addr = cfg.btcAddress || "REPLACE_WITH_BTC_ADDRESS";
    const addrEl = $("btcAddress");
    const qr = $("btcQr");
    const copyBtn = $("btnCopyBtc");
    if (addrEl) addrEl.textContent = addr;
    if (qr) {
      const data = encodeURIComponent(addr.startsWith("REPLACE") ? "bitcoin:placeholder" : `bitcoin:${addr}`);
      qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=168x168&data=${data}`;
      qr.alt = "Bitcoin tip QR code";
    }
    copyBtn?.addEventListener("click", async () => {
      if (addr.includes("REPLACE_WITH")) {
        showToast("Replace REPLACE_WITH_BTC_ADDRESS in config.js first");
        return;
      }
      try {
        await navigator.clipboard.writeText(addr);
        showToast("Bitcoin address copied");
      } catch {
        showToast("Could not copy — select the address manually");
      }
    });
  };

  startBtn?.addEventListener("click", start);
  pauseBtn?.addEventListener("click", pause);
  resetBtn?.addEventListener("click", resetPhase);
  skipBtn?.addEventListener("click", skip);

  consumeUnlockFromUrl();
  bindSettings();
  bindPro();
  bindTip();
  renderThemes();
  applyTheme(settings.themeId);
  remainingMs = durationFor(mode);
  updateChrome();
  updateProUi();
})();
