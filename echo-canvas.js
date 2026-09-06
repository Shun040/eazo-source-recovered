/* V–09 ECHO CALIBRATION — canvas renderer. No external deps.
 * Two rings: SELF (player) and SIGNAL–V09. A dashed connection line between
 * them tightens as convergence rises. Two rhythm tracks (rows of pulses) show
 * each side's beat pattern. When aligned the rings overlap tightly but never
 * merge into a single circle — two outlines always remain. A forced
 * unification collapses them onto each other and leaves a dashed ghost of the
 * original signal ring (residue of the overridden pattern).
 *
 * Driven by echo.js through: setConvergence, setPhase, pulse, setForced, setRhythm.
 */
(() => {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let canvas = null, ctx = null;
  let raf = 0, running = false, paused = false;
  let w = 1, h = 1, dpr = 1;
  let t0 = 0;

  const S = {
    convergence: 0,       // 0 far apart .. 1 aligned
    convDisplay: 0,       // eased toward convergence
    phase: "idle",        // idle|receive|echo|adjust|choose|result
    forced: false,        // overridden: rings snap + ghost residue
    forceProgress: 0,
    signalPattern: [1, 0, 1, 0, 1, 0, 1, 0],   // 8-step beat
    playerPattern: [0, 0, 0, 0, 0, 0, 0, 0],
    ghostPattern: null,   // saved original signal pattern for residue
  };
  const pulses = [];      // {side, at, life} transient ring flashes

  function ready() { return !!ctx; }
  function now() { return (typeof performance !== "undefined" ? performance.now() : Date.now()); }

  function bind() {
    canvas = document.getElementById("echo-canvas");
    if (!canvas) return false;
    ctx = canvas.getContext("2d");
    return !!ctx;
  }

  function resize() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, Math.round(rect.width));
    h = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ease(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }

  function setConvergence(v) { S.convergence = Math.max(0, Math.min(1, v || 0)); }
  function setPhase(p) { S.phase = p || "idle"; }
  function setForced(on) {
    S.forced = !!on;
    if (on && !S.ghostPattern) S.ghostPattern = S.signalPattern.slice();
  }
  function setRhythm(side, pattern) {
    if (!Array.isArray(pattern)) return;
    if (side === "signal") S.signalPattern = pattern.slice();
    else if (side === "player") S.playerPattern = pattern.slice();
  }
  function pulse(side, strength = 1) {
    pulses.push({ side, at: now(), life: 520, strength: Math.max(0.2, Math.min(1, strength)) });
    if (pulses.length > 40) pulses.shift();
  }

  // layout: rings live in the visual area; keep clear of left UI on wide screens
  function field() {
    const narrow = w < 720;
    const cx = narrow ? w * 0.5 : w * 0.62;
    const cy = h * 0.42;
    const spread = Math.min(w, h) * (narrow ? 0.16 : 0.14);
    const r = Math.min(w, h) * 0.13;
    return { cx, cy, spread, r, narrow };
  }

  function ringCenters() {
    const f = field();
    // as convergence rises the two centers move toward each other but never coincide
    const gap = f.spread * (1 - 0.82 * S.convDisplay) + (S.forced ? 0 : f.r * 0.15);
    const selfC = { x: f.cx - gap, y: f.cy };
    const sigC = { x: f.cx + gap, y: f.cy };
    return { selfC, sigC, r: f.r, f };
  }

  function drawRing(c, r, color, lineWidth, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawTrack(pattern, cx, cy, wTrack, color, activeStep) {
    if (!pattern || !pattern.length) return;
    const n = pattern.length;
    const step = wTrack / n;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const x = cx - wTrack / 2 + step * (i + 0.5);
      const on = pattern[i];
      const isActive = i === activeStep;
      ctx.beginPath();
      ctx.fillStyle = on ? color : "rgba(120,150,140,0.18)";
      const rad = on ? (isActive ? 5.5 : 4) : 2.2;
      ctx.arc(x, cy, rad, 0, Math.PI * 2);
      ctx.fill();
      if (on && isActive) {
        ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, cy, 9, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  function render() {
    if (!ready()) return;
    ctx.clearRect(0, 0, w, h);
    // eased convergence
    S.convDisplay += (S.convergence - S.convDisplay) * 0.08;
    if (S.forced) S.forceProgress = Math.min(1, S.forceProgress + 0.02);
    else S.forceProgress = Math.max(0, S.forceProgress - 0.03);

    const { selfC, sigC, r, f } = ringCenters();
    const tsec = (now() - t0) / 1000;
    const beat = (tsec % 2) / 2;                    // 2s loop
    const activeStep = Math.floor(beat * 8) % 8;

    // connection line: dashed, tightens (shorter dashes, brighter) with convergence
    ctx.save();
    const conn = S.convDisplay;
    ctx.strokeStyle = `rgba(120,210,180,${0.15 + conn * 0.5})`;
    ctx.lineWidth = 1 + conn * 1.5;
    ctx.setLineDash([Math.max(2, 12 - conn * 9), Math.max(3, 10 - conn * 7)]);
    ctx.beginPath(); ctx.moveTo(selfC.x, selfC.y); ctx.lineTo(sigC.x, sigC.y); ctx.stroke();
    ctx.restore();

    // ghost residue of original signal when forced (dashed faint ring at old position)
    if (S.forceProgress > 0.01 && S.ghostPattern) {
      const ghostX = f.cx + f.spread * 0.6;
      drawRing({ x: ghostX, y: f.cy }, r * 1.02, `rgba(150,120,120,${0.28 * S.forceProgress})`, 1.2, [4, 6]);
    }

    // breathing radius from beat
    const breath = reduced ? 0 : Math.sin(tsec * Math.PI) * 2;

    // SELF ring (player) — cool green
    drawRing(selfC, r + breath, "rgba(150,230,190,0.9)", 2.2);
    // SIGNAL ring — dimmer teal; when forced snaps onto self
    const sigColor = S.forced ? "rgba(120,200,175,0.95)" : "rgba(110,180,165,0.75)";
    drawRing(sigC, r - breath, sigColor, S.forced ? 2.2 : 1.8);

    // transient pulse flashes
    const tnow = now();
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      const age = tnow - p.at;
      if (age > p.life) { pulses.splice(i, 1); continue; }
      const k = age / p.life;
      const c = p.side === "player" ? selfC : sigC;
      const col = p.side === "player" ? "150,230,190" : "110,190,170";
      ctx.save();
      ctx.strokeStyle = `rgba(${col},${(1 - k) * 0.6 * p.strength})`;
      ctx.lineWidth = 2 * (1 - k);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + k * r * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // rhythm tracks below the rings
    const trackW = Math.min(w, h) * 0.5;
    drawTrack(S.signalPattern, f.cx, f.cy + r + 42, trackW, "rgba(110,190,170,0.85)", activeStep);
    drawTrack(S.playerPattern, f.cx, f.cy + r + 70, trackW, "rgba(150,230,190,0.9)", activeStep);
  }

  function frame() {
    if (!running) return;
    if (!paused) render();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (!ready()) return;
    running = true; paused = false;
    t0 = now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    pulses.length = 0;
    S.forced = false; S.forceProgress = 0; S.ghostPattern = null;
    S.convergence = 0; S.convDisplay = 0;
    S.signalPattern = [1, 0, 1, 0, 1, 0, 1, 0];
    S.playerPattern = [0, 0, 0, 0, 0, 0, 0, 0];
    if (ctx) ctx.clearRect(0, 0, w, h);
  }
  function pause() { paused = true; }
  function resume() { if (running) paused = false; }

  window.eazoEchoCanvas = {
    bind, resize, start, stop, pause, resume,
    setConvergence, setPhase, setForced, setRhythm, pulse,
    isReduced: () => reduced
  };
})();
