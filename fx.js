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
  const CATALOG = {
    alcohol:     { channel: "visual", duration: 120000 },
    cigarettes:  { channel: "visual", duration: 120000 },
    energy:      { channel: "motion", duration: 90000 },
    silence:     { channel: "audio",  duration: 60000 },
  };
  const FADE_MS = 10000;      // last-10s smooth fade-out for visual/color
  const ENERGY_FATIGUE = 10000; // post-energy fatigue window

  // globalEffects: at most one per channel
  const state = { visual: null, motion: null, audio: null, fatigueUntil: 0 };

  let raf = 0;
  const listeners = new Set();

  function now() { return Date.now(); }

  // ── Persistence ──
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        visual: state.visual, motion: state.motion, audio: state.audio,
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
      ["visual", "motion", "audio"].forEach((ch) => {
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
    ["visual", "motion", "audio"].forEach((ch) => {
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
    ["visual", "motion", "audio"].forEach((ch) => {
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
    if (state.motion && state.motion.id === "energy" && state.motion.expiresAt > t) {
      return 1.6;
    }
    if (t < state.fatigueUntil) return 0.6; // fatigue slow-down
    return 1;
  }

  // ── Render: write CSS classes + variables onto <html> ──
  function render() {
    const t = now();
    // Expire stale channels first
    ["visual", "motion", "audio"].forEach((ch) => {
      if (state[ch] && state[ch].expiresAt <= t) {
        if (ch === "motion" && state[ch].id === "energy") {
          state.fatigueUntil = t + ENERGY_FATIGUE;
        }
        state[ch] = null;
        save();
      }
    });

    const vis = state.visual;
    const alcohol = vis && vis.id === "alcohol";
    const cigs = vis && vis.id === "cigarettes";
    // A combined visual (油膜) only when both requested at once → stored as id "filmoil"
    const filmoil = vis && vis.id === "filmoil";

    root.classList.toggle("fx-alcohol", !!(alcohol || filmoil));
    root.classList.toggle("fx-cigarettes", !!(cigs || filmoil));
    root.classList.toggle("fx-filmoil", !!filmoil);
    root.classList.toggle("fx-reduced", reduced);
    root.classList.toggle("fx-mobile", mobile);

    // Visual intensity envelope
    let visAmt = 0;
    if (vis) {
      const rampMs = cigs || filmoil ? 20000 : 4000;
      visAmt = envelope(vis, rampMs);
    }
    root.style.setProperty("--fx-visual", visAmt.toFixed(3));

    // Drive the SVG refraction displacement scale (alcohol / oil film)
    const map = document.getElementById("fx-refract-map");
    if (map) {
      const refractOn = alcohol || filmoil;
      const scale = refractOn && !reduced ? (mobile ? 6 : 14) * visAmt : 0;
      map.setAttribute("scale", scale.toFixed(2));
    }

    const motion = state.motion;
    root.classList.toggle("fx-energy", !!(motion && motion.id === "energy"));
    root.classList.toggle("fx-fatigue", t < state.fatigueUntil);

    root.classList.toggle("fx-silence", silenceActive());
  }

  // ── Animation loop: keeps envelopes + expiry smooth ──
  function anyActive() {
    return state.visual || state.motion || state.audio || now() < state.fatigueUntil;
  }
  function tick() {
    render();
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
    ["visual", "motion", "audio"].forEach((ch) => {
      const eff = state[ch];
      if (eff && eff.expiresAt > t) {
        list.push({ id: eff.id, channel: ch, remaining: eff.expiresAt - t, expiresAt: eff.expiresAt });
      }
    });
    return { effects: list, fatigue: t < state.fatigueUntil, timeScale: timeScale() };
  }

  function clearAll() {
    state.visual = state.motion = state.audio = null;
    state.fatigueUntil = 0;
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
