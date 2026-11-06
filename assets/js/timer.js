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

  /** In-memory fallback when localStorage throws (private mode / blocked). */
  const memoryStore = Object.create(null);

  const storageGet = (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
    }
  };

  const storageSet = (key, value) => {
    try {
      localStorage.setItem(key, value);
      return;
    } catch {
      memoryStore[key] = String(value);
    }
  };

  const storageRemove = (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    delete memoryStore[key];
  };

  const loadState = () => {
    try {
      const raw = storageGet(STORAGE_KEY);
      return { ...defaults, ...JSON.parse(raw || "{}") };
    } catch {
      return { ...defaults };
    }
  };

  const saveState = (partial) => {
    const next = { ...loadState(), ...partial };
    try {
      storageSet(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storageSet already fell back to memory */
    }
    return next;
  };

  const isPro = () => {
    try {
      return storageGet(PRO_KEY) === "1";
    } catch {
      return false;
    }
  };

  const setPro = (on) => {
    try {
      if (on) storageSet(PRO_KEY, "1");
      else storageRemove(PRO_KEY);
    } catch {
      /* ignore — storage helpers already fall back to memory */
    }
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
  /** True when the user paused mid-phase (vs idle at full phase duration). */
  let paused = false;
  let completedRounds = 0;
  let raf = null;
  /** Absolute Date.now() when the current phase should end (while running). */
  let deadlineAt = null;
  /** setTimeout id for phase completion — fires even when the tab is hidden. */
  let completeTimer = null;
  /** Bumped whenever a timed phase ends or is cancelled, to ignore stale timeouts. */
  let phaseEpoch = 0;

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

  const durationKeyFor = (m) => {
    if (m === "work") return "workMin";
    if (m === "long") return "longBreakMin";
    return "breakMin";
  };

  const displayRound = () => (completedRounds % settings.rounds) + 1;

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
      roundLabel.textContent = `Round ${displayRound()} / ${settings.rounds}`;
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

  const clearCompleteTimer = () => {
    if (completeTimer != null) {
      clearTimeout(completeTimer);
      completeTimer = null;
    }
  };

  const syncRemainingFromDeadline = () => {
    if (!running || deadlineAt == null) return remainingMs;
    remainingMs = Math.max(0, deadlineAt - Date.now());
    return remainingMs;
  };

  const schedulePhaseComplete = () => {
    clearCompleteTimer();
    if (!running || deadlineAt == null) return;
    const epoch = phaseEpoch;
    const ms = Math.max(0, deadlineAt - Date.now());
    completeTimer = setTimeout(() => {
      completeTimer = null;
      if (epoch !== phaseEpoch || !running) return;
      remainingMs = 0;
      updateChrome();
      completePhase();
    }, ms);
  };

  /** UI loop; completion also scheduled via setTimeout so it fires while the tab is hidden. */
  const tick = () => {
    if (!running) return;
    syncRemainingFromDeadline();
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
    paused = false;
    deadlineAt = Date.now() + remainingMs;
    schedulePhaseComplete();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
    updateChrome();
  };

  const pause = () => {
    if (running) {
      syncRemainingFromDeadline();
      paused = true;
    }
    phaseEpoch += 1;
    running = false;
    deadlineAt = null;
    clearCompleteTimer();
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    updateChrome();
  };

  const resetPhase = () => {
    pause();
    paused = false;
    remainingMs = durationFor(mode);
    updateChrome();
  };

  const completePhase = () => {
    phaseEpoch += 1;
    running = false;
    paused = false;
    deadlineAt = null;
    clearCompleteTimer();
    if (raf) cancelAnimationFrame(raf);
    raf = null;

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
      const prev = { ...settings };
      const next = {
        workMin: clampInt(work?.value, 1, 120, 25),
        breakMin: clampInt(brk?.value, 1, 60, 5),
        longBreakMin: clampInt(long?.value, 1, 60, 15),
        rounds: clampInt(rounds?.value, 1, 12, 4),
      };
      settings = saveState(next);

      const phaseKey = durationKeyFor(mode);
      const phaseDurationChanged = prev[phaseKey] !== next[phaseKey];

      if (running) {
        if (phaseDurationChanged) {
          // Restart the current phase with the new duration for this mode.
          remainingMs = durationFor(mode);
          deadlineAt = Date.now() + remainingMs;
          schedulePhaseComplete();
        }
      } else if (!paused) {
        // Idle at a full phase — keep remaining in sync with settings.
        remainingMs = durationFor(mode);
      } else if (phaseDurationChanged) {
        // Paused, but the duration for *this* phase changed — reset that phase.
        remainingMs = durationFor(mode);
        paused = false;
      }
      // else: paused + unrelated setting (e.g. break while on work) — keep progress

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
    let pro = false;
    try {
      pro = isPro();
    } catch {
      pro = false;
    }
    grid.innerHTML = THEMES.map((t) => {
      const locked = !t.free && !pro;
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
    let pro = false;
    try {
      pro = isPro();
    } catch {
      pro = false;
    }
    if (status) {
      status.textContent = pro
        ? "Pro unlocked on this browser (local)."
        : "Free timer · Pro unlocks extra themes.";
    }
    if (proBadge) proBadge.hidden = !pro;
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

  // Keep the UI in sync when returning to a backgrounded tab; completion already
  // fires via setTimeout even while hidden.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !running) return;
    syncRemainingFromDeadline();
    updateChrome();
    if (remainingMs > 0 && raf == null) {
      raf = requestAnimationFrame(tick);
    }
  });

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
