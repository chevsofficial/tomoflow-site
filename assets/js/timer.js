(() => {
  const STORAGE_KEY = "tomoflow_web_v1";
  const PRO_KEY = "tomoflow_pro";
  const cfg = window.TOMOFLOW_CONFIG || {};
  const THEMES = Array.isArray(window.TOMOFLOW_THEMES) ? window.TOMOFLOW_THEMES : [];
  const CHARACTERS = Array.isArray(window.TOMOFLOW_CHARACTERS) ? window.TOMOFLOW_CHARACTERS : [];
  const DEFAULT_CHARACTER_ID = "tomo";

  const defaults = {
    workMin: 25,
    breakMin: 5,
    longBreakMin: 15,
    rounds: 4,
    themeId: "classic",
    characterId: DEFAULT_CHARACTER_ID,
  };

  const $ = (id) => document.getElementById(id);

  /** In-memory fallback when localStorage throws (private mode / blocked). */
  const memoryStore = Object.create(null);

  const storageGet = (key) => {
    if (Object.prototype.hasOwnProperty.call(memoryStore, key)) return memoryStore[key];
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const storageSet = (key, value) => {
    try {
      localStorage.setItem(key, value);
      delete memoryStore[key];
      return;
    } catch {
      memoryStore[key] = String(value);
    }
  };

  const loadState = () => {
    try {
      const raw = storageGet(STORAGE_KEY);
      const parsed = JSON.parse(raw || "{}");
      const saved = parsed && typeof parsed === "object" ? parsed : {};
      return {
        ...defaults, ...saved,
        workMin: clampInt(saved.workMin, 1, 120, defaults.workMin),
        breakMin: clampInt(saved.breakMin, 1, 60, defaults.breakMin),
        longBreakMin: clampInt(saved.longBreakMin, 1, 60, defaults.longBreakMin),
        rounds: clampInt(saved.rounds, 1, 12, defaults.rounds),
      };
    } catch {
      return { ...defaults };
    }
  };

  const saveState = (partial) => {
    const next = { ...loadState(), ...partial };
    storageSet(STORAGE_KEY, JSON.stringify(next));
    return next;
  };

  const isPro = () => storageGet(PRO_KEY) === "1";
  const unlockPro = () => storageSet(PRO_KEY, "1");

  const showAccessMessage = (message) => {
    const el = $("proAccessMessage");
    if (el) { el.textContent = message; el.hidden = false; }
  };

  const verifyPro = async (payload) => {
    const response = await fetch("/api/unlock-pro", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not verify Pro. Please try Restore Pro.");
    if (!result.unlocked) { showAccessMessage(result.message || "Payment is still processing."); return false; }
    unlockPro();
    updateProUi();
    showAccessMessage("Pro is unlocked on this browser.");
    return true;
  };

  const consumeUnlockFromUrl = async () => {
    const params = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("restore");
    const sessionId = params.get("session_id");
    const oldLink = params.has("pro") || params.has("unlocked") || params.has("restore");
    ["session_id", "pro", "unlocked", "restore"].forEach(key => params.delete(key));
    if (sessionId || token || oldLink) {
      const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${token ? "" : window.location.hash}`;
      // Remove bearer tokens immediately. Restore tokens live only in the fragment, never the request URL.
      window.history.replaceState({}, "", clean);
    }
    if (token && !isPro()) {
      const panel = $("restoreLinkState");
      const button = $("btnConfirmRestore");
      if (panel) panel.hidden = false;
      $("pro")?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (button) button.onclick = async () => {
        button.disabled = true;
        try { if (await verifyPro({ restoreToken: token })) panel.hidden = true; }
        catch (error) { showAccessMessage(error.message); }
        finally { button.disabled = false; }
      };
      return;
    }
    if (sessionId && !isPro()) {
      $("pro")?.scrollIntoView({ behavior: "smooth", block: "start" });
      showAccessMessage("Checking your purchase…");
      try { await verifyPro({ sessionId }); }
      catch (error) { showAccessMessage(error.message); }
    } else if (oldLink && !isPro()) {
      showAccessMessage("This old unlock link is no longer valid. Request a new Restore Pro email below.");
    }
  };

  let settings = loadState();
  let mode = "work"; // work | break | long
  let remainingMs = settings.workMin * 60 * 1000;
  let running = false;
  /** True when the user paused mid-phase (vs idle at full phase duration). */
  let paused = false;
  let completedRounds = 0;
  let displayTimer = null;
  /** Absolute Date.now() when the current phase should end (while running). */
  let deadlineAt = null;
  /** Completion is scheduled independently of painting; rechecked after tab suspension. */
  let completeTimer = null;
  /** Bumped whenever a timed phase ends or is cancelled, to ignore stale timeouts. */
  let phaseEpoch = 0;

  let themeFilter = "all"; // all | free | pro
  let themeQuery = "";
  let characterQuery = "";

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
  const themeTrigger = $("themeTrigger");
  const themePopover = $("themePopover");
  const themeList = $("themeList");
  const themeEmpty = $("themeEmpty");
  const themeSearch = $("themeSearch");
  const themeTriggerName = $("themeTriggerName");
  const themeTriggerSwatch = $("themeTriggerSwatch");
  const characterTrigger = $("characterTrigger");
  const characterPopover = $("characterPopover");
  const characterList = $("characterList");
  const characterEmpty = $("characterEmpty");
  const characterSearch = $("characterSearch");
  const characterTriggerName = $("characterTriggerName");
  const characterTriggerImg = $("characterTriggerImg");

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

  const displayRound = () => ((mode === "work" ? completedRounds : completedRounds - 1) % settings.rounds) + 1;

  const findTheme = (themeId) => THEMES.find((t) => t.id === themeId) || THEMES[0];

  const nudgePro = (what = "theme") => {
    const price = cfg.proPriceLabel || "$21";
    showToast(`That ${what} needs Pro — unlock once for ${price}`);
    const proSection = $("pro");
    if (proSection) {
      proSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
      proSection.classList.add("is-highlight");
      clearTimeout(nudgePro._t);
      nudgePro._t = setTimeout(() => proSection.classList.remove("is-highlight"), 1600);
    }
  };

  const syncThemeTrigger = () => {
    const theme = findTheme(settings.themeId);
    if (!theme) return;
    if (themeTriggerName) themeTriggerName.textContent = theme.name;
    if (themeTriggerSwatch) {
      themeTriggerSwatch.style.setProperty("--swatch", theme.vars.primary);
      themeTriggerSwatch.style.background = `linear-gradient(135deg, ${theme.vars.primary}, ${theme.vars.accent})`;
    }
  };

  const applyTheme = (themeId, { silentLock } = {}) => {
    const theme = findTheme(themeId);
    if (!theme) return false;
    if (!theme.free && !isPro()) {
      if (!silentLock) nudgePro("theme");
      return false;
    }
    const root = document.documentElement;
    Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
    settings = saveState({ themeId: theme.id });
    syncThemeTrigger();
    document.querySelectorAll("[data-theme-id]").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.themeId === theme.id);
      const locked = el.dataset.pro === "1" && !isPro();
      el.classList.toggle("is-locked", locked);
      el.setAttribute("aria-selected", el.dataset.themeId === theme.id ? "true" : "false");
    });
    return true;
  };

  const filteredThemes = () => {
    const q = themeQuery.trim().toLowerCase();
    return THEMES.filter((t) => {
      if (themeFilter === "free" && !t.free) return false;
      if (themeFilter === "pro" && t.free) return false;
      if (!q) return true;
      const hay = `${t.name} ${t.category || ""} ${t.id}`.toLowerCase();
      return hay.includes(q);
    });
  };

  const setThemePopoverOpen = (open) => {
    if (!themePopover || !themeTrigger) return;
    if (open) setCharacterPopoverOpen(false);
    themePopover.hidden = !open;
    themeTrigger.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      renderThemeList();
      themeSearch?.focus();
    }
  };

  const renderThemeList = () => {
    if (!themeList) return;
    const pro = isPro();
    const items = filteredThemes();
    if (themeEmpty) themeEmpty.hidden = items.length > 0;
    themeList.innerHTML = items
      .map((t) => {
        const locked = !t.free && !pro;
        const active = t.id === settings.themeId;
        return `<button type="button" role="option" class="theme-option${active ? " is-active" : ""}${locked ? " is-locked" : ""}" data-theme-id="${t.id}" data-pro="${t.free ? "0" : "1"}" aria-selected="${active ? "true" : "false"}">
        <span class="theme-option-swatch" style="--swatch:${t.vars.primary}; background: linear-gradient(135deg, ${t.vars.primary}, ${t.vars.accent})"></span>
        <span class="theme-option-meta">
          <span class="theme-option-name">${t.name}</span>
          <span class="theme-option-cat">${t.category || (t.free ? "Free" : "Pro")}</span>
        </span>
        ${locked ? '<span class="theme-lock">Pro</span>' : active ? '<span class="theme-check" aria-hidden="true">✓</span>' : ""}
      </button>`;
      })
      .join("");
    pickerTabStops(themeList);
    themeList.querySelectorAll("[data-theme-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        // Always close so a locked-theme nudge to Pro is not covered by the popover.
        applyTheme(btn.dataset.themeId);
        setThemePopoverOpen(false);
        themeTrigger?.focus();
      });
    });
  };

  const pickerTabStops = (list) => {
    const options = Array.from(list.querySelectorAll('[role="option"]'));
    const active = options.find(option => option.getAttribute("aria-selected") === "true") || options[0];
    options.forEach(option => { option.tabIndex = option === active ? 0 : -1; });
  };

  const bindPickerKeyboard = (list, search) => {
    search?.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown") return;
      const option = list?.querySelector('[role="option"][tabindex="0"]');
      if (option) { event.preventDefault(); option.focus(); }
    });
    list?.addEventListener("keydown", (event) => {
      const options = Array.from(list.querySelectorAll('[role="option"]'));
      if (!options.length) return;
      const current = options.indexOf(document.activeElement);
      const target = event.key === "ArrowDown" ? (current + 1) % options.length
        : event.key === "ArrowUp" ? (current - 1 + options.length) % options.length
        : event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : null;
      if (target == null) return;
      event.preventDefault();
      options.forEach((option, index) => { option.tabIndex = index === target ? 0 : -1; });
      options[target].focus();
    });
  };

  const bindThemePicker = () => {
    bindPickerKeyboard(themeList, themeSearch);
    themeTrigger?.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = themePopover?.hidden !== false;
      setThemePopoverOpen(open);
    });

    themeSearch?.addEventListener("input", () => {
      themeQuery = themeSearch.value || "";
      renderThemeList();
    });

    document.querySelectorAll(".theme-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        themeFilter = btn.dataset.filter || "all";
        document.querySelectorAll(".theme-filter").forEach((b) => {
          b.classList.toggle("is-active", b === btn);
          b.setAttribute("aria-pressed", b === btn ? "true" : "false");
        });
        renderThemeList();
      });
    });

    document.addEventListener("click", (e) => {
      if (!themePopover || themePopover.hidden) return;
      const picker = $("themePicker");
      if (picker && !picker.contains(e.target)) setThemePopoverOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && themePopover && !themePopover.hidden) {
        setThemePopoverOpen(false);
        themeTrigger?.focus();
      }
    });
  };

  // ---- Characters -------------------------------------------------------

  const findCharacter = (characterId) =>
    CHARACTERS.find((c) => c.id === characterId) ||
    CHARACTERS.find((c) => c.id === DEFAULT_CHARACTER_ID) ||
    CHARACTERS[0];

  /** Image for the current character + timer phase (only Tomo has mood variants today). */
  const characterImageFor = (character, phase) => {
    if (!character) return "/assets/img/tomatoes/tomato-happy.png";
    return (character.images && character.images[phase]) || character.image;
  };

  const escapeHtml = (v) =>
    String(v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

  const syncCharacterTrigger = () => {
    const c = findCharacter(settings.characterId);
    if (!c) return;
    if (characterTriggerName) characterTriggerName.textContent = c.name;
    if (characterTriggerImg) characterTriggerImg.src = c.image;
  };

  const applyCharacter = (characterId, { silentLock } = {}) => {
    const c = findCharacter(characterId);
    if (!c) return false;
    if (!c.free && !isPro()) {
      if (!silentLock) nudgePro("character");
      return false;
    }
    settings = saveState({ characterId: c.id });
    syncCharacterTrigger();
    renderCharacterList();
    updateChrome();
    return true;
  };

  const setCharacterPopoverOpen = (open) => {
    if (!characterPopover || !characterTrigger) return;
    if (open && themePopover && !themePopover.hidden) {
      themePopover.hidden = true;
      themeTrigger?.setAttribute("aria-expanded", "false");
    }
    characterPopover.hidden = !open;
    characterTrigger.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      renderCharacterList();
      characterSearch?.focus();
    }
  };

  const renderCharacterList = () => {
    if (!characterList) return;
    const pro = isPro();
    const q = characterQuery.trim().toLowerCase();
    const items = CHARACTERS.filter((c) => {
      if (!q) return true;
      return `${c.name} ${c.category || ""} ${c.id}`.toLowerCase().includes(q);
    });
    if (characterEmpty) characterEmpty.hidden = items.length > 0;
    characterList.innerHTML = items
      .map((c) => {
        const locked = !c.free && !pro;
        const active = c.id === settings.characterId;
        return `<button type="button" role="option" class="theme-option${active ? " is-active" : ""}${locked ? " is-locked" : ""}" data-character-id="${escapeHtml(c.id)}" data-pro="${c.free ? "0" : "1"}" aria-selected="${active ? "true" : "false"}">
        <img class="character-option-thumb" src="${escapeHtml(c.image)}" alt="" width="32" height="32" loading="lazy" />
        <span class="theme-option-meta">
          <span class="theme-option-name">${escapeHtml(c.name)}</span>
          <span class="theme-option-cat">${escapeHtml(c.category || (c.free ? "Free" : "Pro"))}</span>
        </span>
        ${locked ? '<span class="theme-lock">Pro</span>' : active ? '<span class="theme-check" aria-hidden="true">✓</span>' : ""}
      </button>`;
      })
      .join("");

    pickerTabStops(characterList);
    characterList.querySelectorAll("[data-character-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        // Close first so a locked-character nudge to Pro is not covered by the popover.
        setCharacterPopoverOpen(false);
        applyCharacter(btn.dataset.characterId);
        characterTrigger?.focus();
      });
    });
  };

  const bindCharacterPicker = () => {
    bindPickerKeyboard(characterList, characterSearch);
    characterTrigger?.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = characterPopover?.hidden !== false;
      setCharacterPopoverOpen(open);
    });

    characterSearch?.addEventListener("input", () => {
      characterQuery = characterSearch.value || "";
      renderCharacterList();
    });

    document.addEventListener("click", (e) => {
      if (!characterPopover || characterPopover.hidden) return;
      const picker = $("characterPicker");
      if (picker && !picker.contains(e.target)) setCharacterPopoverOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && characterPopover && !characterPopover.hidden) {
        setCharacterPopoverOpen(false);
        characterTrigger?.focus();
      }
    });
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
      const character = findCharacter(settings.characterId);
      const src = characterImageFor(character, mode);
      if (tomatoImg.getAttribute("src") !== src) tomatoImg.src = src;
      const name = character ? character.name : "Tomo";
      tomatoImg.alt = `${name}, ${mode === "work" ? "focus" : "break"}`;
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
      if (syncRemainingFromDeadline() > 0) { schedulePhaseComplete(); return; }
      completePhase();
    }, ms);
  };

  // Paint at the next displayed-second boundary, with no background rendering loop.
  const tick = () => {
    displayTimer = null;
    if (!running) return;
    syncRemainingFromDeadline();
    if (remainingMs <= 0) { completePhase(); return; }
    if (document.visibilityState === "hidden") return;
    updateChrome();
    displayTimer = setTimeout(tick, Math.max(1, remainingMs % 1000 || 1000));
  };

  const start = () => {
    if (running) return;
    running = true;
    paused = false;
    deadlineAt = Date.now() + remainingMs;
    schedulePhaseComplete();
    clearTimeout(displayTimer);
    tick();
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
    clearTimeout(displayTimer);
    displayTimer = null;
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
    clearTimeout(displayTimer);
    displayTimer = null;

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
      // else: paused + unrelated setting — keep progress.
      if (running) { clearTimeout(displayTimer); tick(); }
      else updateChrome();
    };

    [work, brk, long, rounds].forEach((el) => el?.addEventListener("change", persist));
  };

  function clampInt(v, min, max, fallback) {
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  const bindPro = () => {
    const price = $("proPrice");
    if (price) price.textContent = cfg.proPriceLabel || "$21";
    const unlockBtn = $("btnUnlockPro");
    const link = cfg.stripePaymentLink || "";
    if (unlockBtn) {
      unlockBtn.addEventListener("click", () => {
        if (isPro()) {
          showToast("Pro is already unlocked on this browser");
          updateProUi();
          return;
        }
        if (!link || link.includes("REPLACE_WITH")) {
          showToast("Checkout isn't configured yet — try again soon");
          return;
        }
        window.location.href = "/api/start-checkout";
      });
    }
    bindRestorePro();
  };

  const bindRestorePro = () => {
    const form = $("restoreProForm");
    const emailInput = $("restoreEmail");
    const btn = $("btnRestorePro");
    if (!form || !emailInput || !btn) return;

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const email = (emailInput.value || "").trim();
      if (!email) {
        showToast("Enter the email on your Stripe receipt");
        emailInput.focus();
        return;
      }

      if (isPro()) {
        showToast("Pro is already unlocked on this browser");
        return;
      }

      btn.disabled = true;
      const prevLabel = btn.textContent;
      btn.textContent = "Checking…";
      try {
        const res = await fetch("/api/restore-pro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        let data = {};
        try {
          data = await res.json();
        } catch {
          data = {};
        }

        if (!res.ok) {
          showToast(data.error || "Could not restore Pro — try again");
          return;
        }

        showToast(data.message || "Check your email for a restore link.");
      } catch {
        showToast("Network error — try restore again");
      } finally {
        btn.disabled = false;
        btn.textContent = prevLabel;
      }
    });
  };

  const updateProUi = () => {
    const pro = isPro();
    if (proBadge) proBadge.hidden = !pro;
    const freeState = $("proFreeState");
    const unlockedState = $("proUnlockedState");
    if (freeState) freeState.hidden = !!pro;
    if (unlockedState) unlockedState.hidden = !pro;
    const restore = $("restorePro");
    if (restore) restore.hidden = !!pro;
    const status = $("proStatus");
    if (status && !pro) {
      status.textContent = "Unlock every theme and character — one-time, no account.";
    }
    renderThemeList();
    syncThemeTrigger();
    renderCharacterList();
    syncCharacterTrigger();
  };

  const bindTip = () => {
    const addr = cfg.btcAddress || "";
    const configured = addr && !addr.includes("REPLACE");
    const tip = $("tip");
    if (tip) tip.hidden = !configured;
    if (!configured) return;
    const addrEl = $("btcAddress");
    const qr = $("btcQr");
    const copyBtn = $("btnCopyBtc");
    if (addrEl) addrEl.textContent = addr;
    if (qr) {
      const data = encodeURIComponent(`bitcoin:${addr}`);
      qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=168x168&data=${data}`;
      qr.alt = "Bitcoin tip QR code";
    }
    copyBtn?.addEventListener("click", async () => {
      if (addr.includes("REPLACE_WITH")) {
        showToast("Tip address isn't configured yet");
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

  // Browser/OS suspension may delay timers. Complete overdue work immediately on return.
  document.addEventListener("visibilitychange", () => {
    clearTimeout(displayTimer);
    displayTimer = null;
    if (!running) return;
    if (syncRemainingFromDeadline() <= 0) completePhase();
    else if (document.visibilityState === "visible") tick();
  });

  startBtn?.addEventListener("click", start);
  pauseBtn?.addEventListener("click", pause);
  resetBtn?.addEventListener("click", resetPhase);
  skipBtn?.addEventListener("click", skip);

  bindSettings();
  bindPro();
  bindTip();
  bindThemePicker();
  bindCharacterPicker();
  renderThemeList();
  // If a saved Pro theme exists but Pro isn't unlocked, fall back silently.
  if (!applyTheme(settings.themeId, { silentLock: true })) {
    applyTheme("classic", { silentLock: true });
  }
  // Same for a saved Pro character without Pro (or an id that no longer exists).
  const savedCharacter = CHARACTERS.find((c) => c.id === settings.characterId);
  if (!savedCharacter || !applyCharacter(savedCharacter.id, { silentLock: true })) {
    applyCharacter(DEFAULT_CHARACTER_ID, { silentLock: true });
  }
  remainingMs = durationFor(mode);
  updateChrome();
  updateProUi();
  consumeUnlockFromUrl();
  window.addEventListener("hashchange", () => {
    if (new URLSearchParams(window.location.hash.slice(1)).has("restore")) {
      updateProUi();
      consumeUnlockFromUrl();
    }
  });
})();
