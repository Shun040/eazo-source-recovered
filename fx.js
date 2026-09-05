/* EAZO NIGHT SUPERMARKET — GLOBAL EFFECTS MANAGER (eazoFx)
 * One visual filter + one motion state + one audio state at a time.
 * Effects persist across scenes and reloads (localStorage), and are
 * applied to the whole site via <html> classes + CSS variables, plus a
 * global time-scale that other loops (starfield, games) can read.
 */
(() => {
  "use strict";

  const STORAGE_KEY = "silentStarMap.fx.v1";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = window.matchMedia("(max-width: 720px)").matches;
  const root = document.documentElement;

  // ── Effect catalogue: which channel each item occupies + duration ──
  // alcohol → visual (screen-space ring-wave refraction, WebGL + weak SVG drift)
  // cigarettes → color (saturation + chromatic aberration)
  // They occupy DIFFERENT channels, so they stack and count down separately.
  // cigarettes → "mist" channel (damp out-of-focus state, pointer-cleared)
  const CATALOG = {
    alcohol:     { channel: "visual", duration: 120000 },
    cigarettes:  { channel: "color",  duration: 120000 },
    energy:      { channel: "motion", duration: 90000 },
    silence:     { channel: "audio",  duration: 60000 },
  };
  const CHANNELS = ["visual", "color", "motion", "audio"];
  const FADE_MS = 10000;      // last-10s smooth fade-out for visual/color
  const ENERGY_FATIGUE = 10000; // post-energy fatigue window

  // globalEffects: at most one per channel
  const state = { visual: null, color: null, motion: null, audio: null, fatigueUntil: 0 };

  let raf = 0;
  let lastEmit = 0;
  let mistRunning = false;
  const listeners = new Set();

  function now() { return Date.now(); }

  /* ===================================================================
     ALCOHOL REFRACTION — two cooperating layers
       1. SVG feTurbulence displacement = continuous, weak liquid DRIFT
          of the whole page (no click rings here).
       2. Click / demo RING-WAVES are rendered by the WebGL layer in
          ripple.js (window.eazoRipple); fx.js only forwards wave sources
          and toggles that layer on/off with the alcohol lifecycle.
     No glowing rings, discs or outlines are ever drawn.
     =================================================================== */
  const MAP_MAX_PX = mobile ? 10 : 14;   // peak SVG drift displacement (px)
  let boundClick = false;
  let driftPhase = 0;          // turbulence drift accumulator
  let alcoholFilterMounted = false;

  function appShell() { return document.querySelector(".app-shell"); }
  function dispMap() { return document.getElementById("fx-refract-map"); }

  // Fixed SVG strength tier — never modulated per frame (Safari won't repaint
  // a CSS-referenced filter when JS mutates it live).
  function alcoholSvgStrength() { return mobile ? 7 : 14; }

  function refractActive() {
    const vis = state.visual;
    return !reduced && !!vis && vis.id === "alcohol" && vis.expiresAt > now();
  }

  function ripple() { return window.eazoRipple || null; }

  /* Safari-compatible mount order: set a NON-ZERO scale on the displacement
     map FIRST, force a reflow, then attach the filter on the next frame so
     Safari recomputes the referenced filter instead of caching scale=0. */
  function mountAlcoholFilter() {
    const shell = appShell();
    const map = dispMap();
    if (!shell || !map) return;
    map.setAttribute("scale", String(alcoholSvgStrength()));
    if (!alcoholFilterMounted) {
      shell.style.filter = "none";
      void shell.offsetHeight;                 // force layout
      requestAnimationFrame(() => {
        root.classList.add("fx-alcohol");
        shell.style.filter = 'url("#fx-refract")';
        alcoholFilterMounted = true;
      });
    }
  }

  function unmountAlcoholFilter() {
    const shell = appShell();
    const map = dispMap();
    if (shell) shell.style.filter = "none";
    root.classList.remove("fx-alcohol");
    if (map) map.setAttribute("scale", "0");
    alcoholFilterMounted = false;
  }

  function destroyField() {
    unmountAlcoholFilter();
    ripple()?.stop?.();
  }

  // Alcohol strength envelope — drives ONLY the overlay opacity, ripple
  // strength and colour intensity. Never the SVG displacement scale.
  function alcoholStrength(eff) {
    const t = now();
    const since = t - eff.startedAt;
    let rise;
    if (since <= 500) rise = 0.6 * (since / 500);        // 0 → 60% in 500ms
    else rise = 0.6 + 0.4 * Math.min(1, (since - 500) / 2000); // 60% → 100%
    const left = eff.expiresAt - t;
    const out = Math.min(1, left / FADE_MS);
    return Math.max(0, Math.min(rise, out));
  }

  function onGlobalClick(e) {
    if (!refractActive()) return;
    const x = (e.clientX ?? window.innerWidth / 2) / (window.innerWidth || 1);
    const y = 1 - (e.clientY ?? window.innerHeight / 2) / (window.innerHeight || 1);
    ripple()?.spawn?.(x, y, 1);  // full-strength click ring-wave
  }

  // Per-frame work is limited to the WebGL ripple layer + a very slow drift of
  // the turbulence seed. We do NOT touch feDisplacementMap.scale each frame.
  function renderField() {
    const vis = state.visual;
    if (!vis) return;
    const amt = alcoholStrength(vis);

    // Slow ambient drift of the turbulence pattern (position, not scale).
    // Safari tolerates an occasional baseFrequency nudge; keep it gentle and
    // low-frequency so it isn't a per-pixel repaint storm.
    driftPhase += 0.0025;
    const bx = 0.011 + Math.sin(driftPhase) * 0.003;
    const by = 0.017 + Math.cos(driftPhase * 0.8) * 0.003;
    const src = document.getElementById("fx-refract-src");
    if (src) src.setAttribute("baseFrequency", `${bx.toFixed(5)} ${by.toFixed(5)}`);

    ripple()?.setStrength?.(amt);
  }

  // ── Persistence ──
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        visual: state.visual, color: state.color, motion: state.motion, audio: state.audio,
        fatigueUntil: state.fatigueUntil,
      }));
    } catch (_e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      const t = now();
      ["visual", "color", "motion", "audio"].forEach((ch) => {
        const eff = data?.[ch];
        if (eff && eff.expiresAt > t) state[ch] = eff;
      });
      if (typeof data?.fatigueUntil === "number" && data.fatigueUntil > t) {
        state.fatigueUntil = data.fatigueUntil;
      }
    } catch (_e) {}
  }

  // ── Remaining / progress helpers ──
  function remaining(ch) {
    const eff = state[ch];
    if (!eff) return 0;
    return Math.max(0, eff.expiresAt - now());
  }
  function progress(eff) {
    const total = eff.expiresAt - eff.startedAt;
    if (total <= 0) return 1;
    return Math.min(1, Math.max(0, (now() - eff.startedAt) / total));
  }
  // envelope: 0→1 ramp-in, 1 hold, →0 last FADE_MS
  function envelope(eff, rampMs) {
    const t = now();
    const inT = Math.min(1, (t - eff.startedAt) / rampMs);
    const left = eff.expiresAt - t;
    const outT = Math.min(1, left / FADE_MS);
    return Math.max(0, Math.min(inT, outT));
  }

  // ── Active effect ids for consumers (e.g. combined alcohol+cigarettes) ──
  function activeIds() {
    const ids = new Set();
    CHANNELS.forEach((ch) => {
      if (state[ch] && state[ch].expiresAt > now()) ids.add(state[ch].id);
    });
    return ids;
  }
  function has(id) { return activeIds().has(id); }
  function silenceActive() { return has("silence"); }

  // ── Add / replace an effect (same channel overwrites, restarts timer) ──
  function apply(id, extra) {
    const meta = CATALOG[id];
    if (!meta) return null;
    const t = now();
    const eff = Object.assign({
      id, channel: meta.channel, startedAt: t,
      expiresAt: t + meta.duration, intensity: 1,
    }, extra || {});
    state[meta.channel] = eff;
    save();
    render();
    ensureLoop();
    emit();
    return eff;
  }

  // Extend the freshest active timed effect by ms (lottery reward)
  function extendAny(ms) {
    let target = null;
    CHANNELS.forEach((ch) => {
      const eff = state[ch];
      if (eff && eff.expiresAt > now()) {
        if (!target || eff.startedAt > target.startedAt) target = eff;
      }
    });
    if (target) { target.expiresAt += ms; save(); emit(); }
    return target;
  }

  function clearChannel(ch) { state[ch] = null; save(); render(); emit(); }

  // ── Motion time-scale exposed to every animation loop ──
  function timeScale() {
    const t = now();
    const m = state.motion;
    if (m && m.id === "energy" && m.expiresAt > t) {
      const elapsed = t - m.startedAt;
      const toEnd = m.expiresAt - t;
      // 0–15s: smooth ramp 1 → 1.6
      if (elapsed < 15000) return 1 + (elapsed / 15000) * 0.6;
      // last 10s: slight instability, wobble ~1.35–1.7
      if (toEnd < 10000) return 1.5 + Math.sin(t * 0.012) * 0.17;
      // 15s–last10s: excited plateau
      return 1.6;
    }
    // post-effect fatigue: subjective time drags at ~0.55–0.7
    if (t < state.fatigueUntil) return 0.62 + Math.sin(t * 0.004) * 0.06;
    return 1;
  }

  // ── Render: write CSS classes + variables onto <html> ──
  function render() {
    const t = now();
    // Expire stale channels first
    CHANNELS.forEach((ch) => {
      if (state[ch] && state[ch].expiresAt <= t) {
        if (ch === "motion" && state[ch].id === "energy") {
          state.fatigueUntil = t + ENERGY_FATIGUE;
        }
        state[ch] = null;
        save();
      }
    });

    // Alcohol (visual channel) and cigarettes (color channel) are fully
    // independent now — either, both, or neither may be active.
    const alcohol = state.visual && state.visual.id === "alcohol";
    const cigs = state.color && state.color.id === "cigarettes";

    // NB: fx-alcohol class is managed by mount/unmountAlcoholFilter (Safari
    // ordering), not toggled here.
    root.classList.toggle("fx-reduced", reduced);
    root.classList.toggle("fx-mobile", mobile);

    // Alcohol drift envelope drives --fx-visual (fast-rise, see alcoholStrength)
    root.style.setProperty("--fx-visual",
      (alcohol ? alcoholStrength(state.visual) : 0).toFixed(3));

    // Mist restorer lifecycle: run the fog layer while cigarettes is active,
    // feeding it a 0..1 progress so it can drive its 4 stages.
    const fog = window.eazoFog;
    if (cigs && fog) {
      const eff = state.color;
      const total = Math.max(1, eff.expiresAt - eff.startedAt);
      const p = Math.min(1, (t - eff.startedAt) / total);
      if (!mistRunning) { fog.start(); mistRunning = true; }
      fog.setProgress(p);
    } else if (mistRunning && fog) {
      fog.stop(); mistRunning = false;
    }

    // Ring-wave refraction lifecycle: bind click source + run WebGL ripple
    // layer only while alcohol is active; release everything otherwise.
    if (refractActive()) {
      mountAlcoholFilter();
      if (!boundClick) {
        window.addEventListener("pointerdown", onGlobalClick, { passive: true });
        boundClick = true;
        ripple()?.start?.();
        // Demo wave slightly below centre so the buy feedback is instant.
        setTimeout(() => { if (refractActive()) ripple()?.spawn?.(0.5, 0.42, 1); }, 60);
      }
    } else if (boundClick || alcoholFilterMounted) {
      window.removeEventListener("pointerdown", onGlobalClick);
      boundClick = false;
      destroyField();
    }
    // Reduced-motion: no WebGL waves / live filter, just a faint static class.
    if (reduced) {
      const alcoholLive = state.visual && state.visual.id === "alcohol"
        && state.visual.expiresAt > now();
      root.classList.toggle("fx-alcohol", !!alcoholLive);
    }

    const motion = state.motion;
    root.classList.toggle("fx-energy", !!(motion && motion.id === "energy"));
    root.classList.toggle("fx-fatigue", t < state.fatigueUntil);

    root.classList.toggle("fx-silence", silenceActive());
  }

  // ── Animation loop: keeps envelopes + expiry smooth ──
  function anyActive() {
    return state.visual || state.color || state.motion || state.audio || now() < state.fatigueUntil;
  }
  function tick() {
    render();
    if (refractActive()) renderField();
    // Push a fresh snapshot ~once per second so the countdown chips visibly
    // tick down (remaining is computed live in snapshot()).
    const t = now();
    if (t - lastEmit >= 250) { lastEmit = t; emit(); }
    if (anyActive()) { raf = requestAnimationFrame(tick); }
    else { raf = 0; emit(); }
  }
  function ensureLoop() {
    if (!raf && anyActive()) raf = requestAnimationFrame(tick);
  }

  // ── Subscription for UI (countdown corner, receipts) ──
  function emit() {
    const snap = snapshot();
    listeners.forEach((fn) => { try { fn(snap); } catch (_e) {} });
  }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function snapshot() {
    const t = now();
    const list = [];
    ["visual", "color", "motion", "audio"].forEach((ch) => {
      const eff = state[ch];
      if (eff && eff.expiresAt > t) {
        list.push({ id: eff.id, channel: ch, remaining: eff.expiresAt - t, expiresAt: eff.expiresAt });
      }
    });
    return { effects: list, fatigue: t < state.fatigueUntil, timeScale: timeScale() };
  }

  function clearAll() {
    state.visual = state.color = state.motion = state.audio = null;
    state.fatigueUntil = 0;
    if (boundClick) { window.removeEventListener("pointerdown", onGlobalClick); boundClick = false; }
    destroyField();
    if (mistRunning && window.eazoFog) { window.eazoFog.stop(); mistRunning = false; }
    save(); render(); emit();
  }

  // Pause loop when tab hidden; resume when visible
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    else ensureLoop();
  });

  load();
  render();
  ensureLoop();

  window.eazoFx = {
    apply, extendAny, clearChannel, clearAll,
    remaining, timeScale, activeIds, has, silenceActive,
    subscribe, snapshot, CATALOG,
    get reduced() { return reduced; },
    get mobile() { return mobile; },
  };
  // Notify late subscribers that fx is ready
  window.dispatchEvent(new CustomEvent("eazo:fxready"));
})();
