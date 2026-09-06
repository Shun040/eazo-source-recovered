/* K–11 SECRET EXCHANGE — canvas renderer (seed + particles). No external deps. */
(() => {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let canvas = null;
  let ctx = null;
  let raf = 0;
  let running = false;
  let paused = false;
  let w = 1, h = 1, dpr = 1;
  let t0 = 0;
  let last = 0;

  // Seed presentation state, driven by secret.js through setMode().
  // modes: "arrive" | "idle" | "open" | "bury" | "forward" | "static"
  const seed = {
    mode: "idle",
    // normalized center (0..1) + progress of current mode animation (0..1)
    cx: 0.5, cy: 0.5,
    progress: 0,
    clarity: 0,        // 0 blurred .. 1 clear (hover)
    clarityTarget: 0,
    modeStart: 0,
    dropChar: false,   // open: a character falls off as a particle
    radius: 0.11,      // fraction of min(w,h); actual diameter ~0.22
  };

  const particles = [];   // {x,y,vx,vy,life,max,r}
  const roots = [];       // bury: {seg:[{x,y}...], grow}

  function ready() { return !!ctx; }

  function bind() {
    canvas = document.getElementById("secret-canvas");
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

  function seedGeom() {
    const minSide = Math.min(w, h);
    const r = seed.radius * minSide;      // radius
    const cx = seed.cx * w;
    let cy = seed.cy * h;
    // bury: center sinks toward the bottom as progress grows
    if (seed.mode === "bury") cy = (seed.cy + (0.42) * ease(seed.progress)) * h;
    return { cx, cy, r };
  }

  function ease(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }

  function setMode(mode, opts = {}) {
    seed.mode = mode;
    seed.progress = 0;
    seed.modeStart = now();
    if (mode === "open") {
      seed.dropChar = true;
      if (!reduced) spawnDropParticles();
    }
    if (mode === "bury") { roots.length = 0; buildRoots(); }
    if (opts.cx != null) seed.cx = opts.cx;
    if (opts.cy != null) seed.cy = opts.cy;
    if (reduced) seed.progress = 1;  // reduced-motion → jump to end state
  }

  function setClarity(target) { seed.clarityTarget = Math.max(0, Math.min(1, target)); }

  function buildRoots() {
    const n = 3 + Math.floor(Math.random() * 4); // 3–6
    for (let i = 0; i < n; i++) {
      const seg = [];
      const angle = Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      let px = 0, py = 0;
      const steps = 5 + Math.floor(Math.random() * 4);
      let a = angle;
      for (let s = 0; s < steps; s++) {
        a += (Math.random() - 0.5) * 0.5;
        const len = 10 + Math.random() * 14;
        px += Math.cos(a) * len;
        py += Math.abs(Math.sin(a)) * len;
        seg.push({ x: px, y: py });
      }
      roots.push({ seg });
    }
  }

  function spawnDropParticles() {
    const { cx, cy, r } = seedGeom();
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      particles.push({
        x: cx + Math.cos(a) * r * 0.3,
        y: cy + Math.sin(a) * r * 0.3,
        vx: (Math.random() - 0.5) * 0.4,
        vy: 0.2 + Math.random() * 0.5,
        life: 0, max: 1600 + Math.random() * 1200,
        rr: 0.8 + Math.random() * 1.4
      });
    }
  }

  function now() { return (typeof performance !== "undefined" ? performance.now() : Date.now()); }

  function frame(ts) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (paused) { last = ts; return; }
    const dt = Math.min(50, ts - (last || ts));
    last = ts;

    // ease clarity toward target
    seed.clarity += (seed.clarityTarget - seed.clarity) * Math.min(1, dt / 220);

    // advance current mode progress over ~1.6s (arrive faster)
    const dur = seed.mode === "arrive" ? 1500 : 2200;
    if (!reduced && seed.progress < 1) seed.progress = Math.min(1, seed.progress + dt / dur);

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      p.x += p.vx * dt * 0.06;
      p.y += p.vy * dt * 0.06;
      if (p.life >= p.max) particles.splice(i, 1);
    }

    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const { cx, cy, r } = seedGeom();

    // arrive: seed drifts in along an arc from upper-right
    let ax = cx, ay = cy;
    if (seed.mode === "arrive") {
      const p = ease(seed.progress);
      ax = cx + (1 - p) * (w * 0.42);
      ay = cy - (1 - p) * (h * 0.30) * Math.sin(p * Math.PI);
    }

    const openP = seed.mode === "open" ? ease(seed.progress) : 0;
    const buryP = seed.mode === "bury" ? ease(seed.progress) : 0;
    const fwdP = seed.mode === "forward" ? ease(seed.progress) : 0;

    // forward: seed slides off along a glowing track to the right
    if (seed.mode === "forward") {
      ax = cx + fwdP * (w * 0.6);
      ay = cy - fwdP * (h * 0.12);
      // glowing track
      ctx.save();
      ctx.strokeStyle = "rgba(196,180,120," + (0.5 * (1 - fwdP)) + ")";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.restore();
    }

    const alpha = seed.mode === "forward" ? (1 - fwdP * 0.9)
      : seed.mode === "bury" ? (1 - buryP * 0.6) : 1;

    // seed body: dots + lines + translucent face
    drawSeedBody(ax, ay, r, alpha, openP, buryP);

    // bury roots
    if (seed.mode === "bury") drawRoots(ax, ay, r, buryP);

    // particles (open char fall)
    ctx.save();
    for (const p of particles) {
      const l = 1 - p.life / p.max;
      ctx.fillStyle = "rgba(214,226,214," + (0.5 * l) + ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSeedBody(cx, cy, r, alpha, openP, buryP) {
    ctx.save();
    ctx.globalAlpha = alpha;

    // translucent face
    const grad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    grad.addColorStop(0, "rgba(170,196,180,0.16)");
    grad.addColorStop(1, "rgba(120,150,140,0.02)");
    ctx.fillStyle = grad;

    if (openP > 0) {
      // open: two halves crack apart slowly (never explode)
      const gap = openP * r * 0.5;
      halfEllipse(cx - gap, cy, r, -1);
      ctx.fill();
      halfEllipse(cx + gap, cy, r, 1);
      ctx.fill();
      // crack line
      ctx.strokeStyle = "rgba(210,222,212,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, r * (1 - buryP * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }

    // orbiting dots
    ctx.fillStyle = "rgba(214,226,214,0.7)";
    const dots = 18;
    for (let i = 0; i < dots; i++) {
      const a = (i / dots) * Math.PI * 2 + seed.progress * 0.6;
      const rr = r * (0.86 + 0.1 * Math.sin(a * 3 + seed.modeStart));
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI * 2); ctx.fill();
    }
    // thin connecting lines
    ctx.strokeStyle = "rgba(150,180,168,0.35)";
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function halfEllipse(cx, cy, r, dir) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r, 0, -Math.PI / 2, Math.PI / 2, dir < 0);
    ctx.closePath();
  }

  function drawRoots(cx, cy, r, buryP) {
    ctx.save();
    ctx.strokeStyle = "rgba(140,170,158," + (0.5 * buryP) + ")";
    ctx.lineWidth = 0.8;
    const baseY = cy + r * 0.6;
    for (const rt of roots) {
      ctx.beginPath();
      ctx.moveTo(cx, baseY);
      let px = cx, py = baseY;
      const grow = Math.floor(rt.seg.length * buryP);
      for (let i = 0; i < grow; i++) {
        px = cx + rt.seg[i].x;
        py = baseY + rt.seg[i].y;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function start() {
    if (!ready()) return;
    running = true;
    paused = false;
    t0 = now();
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    particles.length = 0;
    roots.length = 0;
    if (ctx) ctx.clearRect(0, 0, w, h);
  }

  function pause() { paused = true; }
  function resume() { if (running) { paused = false; last = 0; } }

  window.eazoSecretCanvas = {
    bind, resize, start, stop, pause, resume, setMode, setClarity,
    isReduced: () => reduced,
    seedRect: () => { const g = seedGeom(); return g; }
  };
})();
