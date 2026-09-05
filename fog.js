/* EAZO NIGHT SUPERMARKET — MIST RESTORER ("cigarettes" item)
 * The mist restorer no longer raises saturation. Instead the whole site
 * enters a damp, out-of-focus state that the pointer can locally clear.
 *
 *   clear original page  +  translucent noise fog  +  pointer clear-trail
 *   +  a few slowly drifting fog blobs  +  breathing puffs on click
 *
 * Layers:
 *   .fog-blur    fixed overlay, backdrop-filter blur+desaturate, masked so
 *                a soft hole follows the pointer (Safari degrades gracefully
 *                — it keeps the fog canvas + clear mask, no live blur).
 *   #fog-canvas  low-res canvas painting the drifting fog, the lingering
 *                pointer trail (refills in 3–5s), and click breathing puffs.
 *
 * Lifecycle is driven by fx.js across the 120s mist window via:
 *   start() / stop() / setProgress(0..1)
 *
 * Public API (window.eazoFog):
 *   start()             attach layers + loop
 *   stop()              tear down
 *   setProgress(p)      0..1 elapsed fraction (drives the 4 stages)
 *   spawnPuff(x,y)      breathing puff at viewport px (used internally on click)
 */
(() => {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = window.matchMedia("(max-width: 720px)").matches;
  const RES = mobile ? 0.32 : 0.4;          // internal fog canvas scale
  const TRAIL_MAX = mobile ? 26 : 40;       // lingering clear-trail points
  const TRAIL_LIFE = 4200;                  // ms a clear point takes to refill (3–5s)

  const fx = () => window.eazoFx;

  let blurEl = null, canvas = null, ctx = null;
  let raf = 0, running = false;
  let vw = 0, vh = 0, cw = 0, ch = 0, dpr = 1;
  let progress = 0;                          // 0..1 across mist window
  let lastX = -1, lastY = -1, havePointer = false;
  let lastT = 0, driftPhase = 0;

  const trail = [];                          // { x, y, t } viewport px
  const puffs = [];                          // { x, y, t, life }
  const blobs = [];                          // slowly drifting fog blobs (fog px)

  // ── Audio: very light breathing / airflow / drip ──
  let actx = null, ambientGain = null, breathOsc = null, breathLfo = null, breathLfoGain = null;
  let dripTimer = 0, noiseSrc = null, noiseGain = null;

  /* ================================================================= */
  function ensureDom() {
    if (!blurEl) {
      blurEl = document.createElement("div");
      blurEl.className = "fog-blur";
      blurEl.setAttribute("aria-hidden", "true");
      document.body.appendChild(blurEl);
    }
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "fog-canvas";
      canvas.setAttribute("aria-hidden", "true");
      document.body.appendChild(canvas);
      ctx = canvas.getContext("2d");
    }
  }

  function resize() {
    vw = window.innerWidth; vh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    cw = Math.max(2, Math.round(vw * RES));
    ch = Math.max(2, Math.round(vh * RES));
    if (canvas) {
      canvas.width = cw; canvas.height = ch;
      canvas.style.width = vw + "px"; canvas.style.height = vh + "px";
    }
  }

  function seedBlobs() {
    blobs.length = 0;
    const n = mobile ? 5 : 8;
    for (let i = 0; i < n; i++) {
      blobs.push({
        x: Math.random() * cw,
        y: Math.random() * ch,
        r: (0.16 + Math.random() * 0.22) * Math.min(cw, ch),
        vx: (Math.random() - 0.5) * 0.05,
        vy: (Math.random() - 0.5) * 0.05,
        a: 0.10 + Math.random() * 0.10,
        ph: Math.random() * Math.PI * 2,
      });
    }
  }

  // ── Stage model over the 120s window ──
  //  0–10s   inhale        density 0→1, fog gathers from edges to centre
  //  10–90s  local recovery density~1, strong pointer clearing
  //  90–110s over-stable   density slightly up, uniform, weaker clearing
  //  last10s dissipate      density → 0, hidden nodes/text reappear
  function stageParams(p) {
    if (p < 0.0834) {                        // inhale (0–10s)
      const k = p / 0.0834;
      return { density: k, clarity: 0.4 + 0.4 * k, edgeGather: 1 - k, uniform: 0 };
    }
    if (p < 0.75) {                          // recovery (10–90s)
      return { density: 1, clarity: 1, edgeGather: 0, uniform: 0.15 };
    }
    if (p < 0.9167) {                        // over-stable (90–110s)
      const k = (p - 0.75) / 0.1667;
      return { density: 1 + 0.06 * k, clarity: 1 - 0.55 * k, edgeGather: 0, uniform: 0.15 + 0.75 * k };
    }
    const k = (p - 0.9167) / 0.0833;         // dissipate (last 10s)
    return { density: Math.max(0, 1.06 * (1 - k)), clarity: 0.45, edgeGather: 0, uniform: 1 - k };
  }

  /* ================================================================= */
  function draw(t) {
    const dt = lastT ? Math.min(64, t - lastT) : 16;
    lastT = t;
    const scale = (fx()?.timeScale?.() || 1);   // energy speeds the fog up
    driftPhase += dt * 0.00018 * scale;

    const sp = stageParams(progress);
    ctx.clearRect(0, 0, cw, ch);

    // 1) base fog wash — teal-grey, denser toward the edges early on
    ctx.globalCompositeOperation = "source-over";
    const cx = cw / 2, cy = ch / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, cy));
    const centreA = 0.30 * sp.density * (1 - sp.edgeGather * 0.7);
    const edgeA = (0.46 + 0.10 * sp.uniform) * sp.density;
    g.addColorStop(0, `rgba(150,180,168,${(centreA * 0.5).toFixed(3)})`);
    g.addColorStop(0.55, `rgba(90,126,113,${(centreA).toFixed(3)})`);
    g.addColorStop(1, `rgba(19,38,32,${edgeA.toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);

    // 2) slowly drifting fog blobs (extra body, avoids a flat wash)
    for (const b of blobs) {
      b.x += b.vx * dt * 0.06 * scale;
      b.y += b.vy * dt * 0.06 * scale;
      if (b.x < -b.r) b.x = cw + b.r; else if (b.x > cw + b.r) b.x = -b.r;
      if (b.y < -b.r) b.y = ch + b.r; else if (b.y > ch + b.r) b.y = -b.r;
      const puls = 0.7 + 0.3 * Math.sin(driftPhase * 6 + b.ph);
      const a = b.a * sp.density * puls;
      const bg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      bg.addColorStop(0, `rgba(120,156,142,${a.toFixed(3)})`);
      bg.addColorStop(1, "rgba(120,156,142,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    }

    // 3) sparse noise grain so the fog reads as damp, not a clean gradient
    if (!reduced && sp.density > 0.05) {
      const grains = mobile ? 120 : 220;
      for (let i = 0; i < grains; i++) {
        ctx.fillStyle = `rgba(205,230,217,${(Math.random() * 0.03 * sp.density).toFixed(3)})`;
        ctx.fillRect(Math.random() * cw, Math.random() * ch, 1, 1);
      }
    }

    // 4) punch the lingering pointer trail (refills over 3–5s)
    ctx.globalCompositeOperation = "destination-out";
    const rTrail = (mobile ? 118 : 158) * RES;
    for (let i = trail.length - 1; i >= 0; i--) {
      const pt = trail[i];
      const age = t - pt.t;
      if (age > TRAIL_LIFE) { trail.splice(i, 1); continue; }
      const k = 1 - age / TRAIL_LIFE;                 // 1 → 0 as it refills
      const a = Math.min(1, k * sp.clarity * 2.4);    // fully clear core so text is legible
      const px = pt.x * RES, py = pt.y * RES;
      const hole = ctx.createRadialGradient(px, py, 0, px, py, rTrail);
      // fully-clear core + many-step long falloff so the edge reads as soft mist
      hole.addColorStop(0.00, `rgba(0,0,0,${a.toFixed(3)})`);
      hole.addColorStop(0.35, `rgba(0,0,0,${a.toFixed(3)})`);
      hole.addColorStop(0.50, `rgba(0,0,0,${(a * 0.85).toFixed(3)})`);
      hole.addColorStop(0.62, `rgba(0,0,0,${(a * 0.68).toFixed(3)})`);
      hole.addColorStop(0.74, `rgba(0,0,0,${(a * 0.48).toFixed(3)})`);
      hole.addColorStop(0.85, `rgba(0,0,0,${(a * 0.28).toFixed(3)})`);
      hole.addColorStop(0.94, `rgba(0,0,0,${(a * 0.12).toFixed(3)})`);
      hole.addColorStop(1.00, "rgba(0,0,0,0)");
      ctx.fillStyle = hole;
      ctx.fillRect(px - rTrail, py - rTrail, rTrail * 2, rTrail * 2);
    }

    // 5) click breathing puffs — a small outward-expanding clear breath
    for (let i = puffs.length - 1; i >= 0; i--) {
      const pf = puffs[i];
      const age = t - pf.t;
      if (age > pf.life) { puffs.splice(i, 1); continue; }
      const k = age / pf.life;
      const rr = (30 + k * (mobile ? 120 : 170)) * RES;
      const a = (1 - k) * 0.7 * sp.clarity;
      const px = pf.x * RES, py = pf.y * RES;
      const hole = ctx.createRadialGradient(px, py, rr * 0.35, px, py, rr);
      hole.addColorStop(0, `rgba(0,0,0,${(a).toFixed(3)})`);
      hole.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = hole;
      ctx.fillRect(px - rr, py - rr, rr * 2, rr * 2);
    }
    ctx.globalCompositeOperation = "source-over";

    // 6) drive the CSS blur mask hole toward the pointer (clear path)
    if (havePointer && blurEl) {
      blurEl.style.setProperty("--fog-x", lastX + "px");
      blurEl.style.setProperty("--fog-y", lastY + "px");
    }
    if (blurEl) blurEl.style.setProperty("--fog-density", sp.density.toFixed(3));

    if (running) raf = requestAnimationFrame(draw);
  }

  /* ── pointer + click handling ── */
  function onMove(e) {
    const x = e.clientX, y = e.clientY;
    havePointer = true; lastX = x; lastY = y;
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(x - last.x, y - last.y) > 10) {
      trail.push({ x, y, t: performance.now() });
      if (trail.length > TRAIL_MAX) trail.shift();
    }
  }
  function onDown(e) {
    spawnPuff(e.clientX, e.clientY);
    // 罐装寂静 + 雾化恢复器叠加：清开一块画面时，该方向短暂一声笑。
    window.eazoSilenceLaugh?.eraseAt?.(e.clientX / (window.innerWidth || 1));
  }
  function spawnPuff(x, y) {
    puffs.push({ x, y, t: performance.now(), life: 1100 });
    if (puffs.length > 8) puffs.shift();
    breath(0.5);
  }

  /* ── light ambient audio: breathing + airflow + occasional drip ── */
  function initAudio() {
    if (actx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      actx = new AC();
      ambientGain = actx.createGain();
      ambientGain.gain.value = 0;
      ambientGain.connect(actx.destination);

      // airflow: filtered noise bed
      const buf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
      noiseSrc = actx.createBufferSource();
      noiseSrc.buffer = buf; noiseSrc.loop = true;
      const nf = actx.createBiquadFilter();
      nf.type = "lowpass"; nf.frequency.value = 480;
      noiseGain = actx.createGain(); noiseGain.gain.value = 0.06;
      noiseSrc.connect(nf); nf.connect(noiseGain); noiseGain.connect(ambientGain);
      noiseSrc.start();

      // breathing: slow gain LFO over a soft low tone
      breathOsc = actx.createOscillator();
      breathOsc.type = "sine"; breathOsc.frequency.value = 96;
      const bGain = actx.createGain(); bGain.gain.value = 0.0;
      breathLfo = actx.createOscillator();
      breathLfo.type = "sine"; breathLfo.frequency.value = 0.18;   // ~one breath / 5.5s
      breathLfoGain = actx.createGain(); breathLfoGain.gain.value = 0.05;
      breathLfo.connect(breathLfoGain); breathLfoGain.connect(bGain.gain);
      breathOsc.connect(bGain); bGain.connect(ambientGain);
      breathOsc.start(); breathLfo.start();
    } catch (_e) { actx = null; }
  }
  function breath(strength) {
    // a small transient airflow swell on click
    if (!actx || !noiseGain) return;
    const now = actx.currentTime;
    try {
      noiseGain.gain.cancelScheduledValues(now);
      noiseGain.gain.setValueAtTime(noiseGain.gain.value, now);
      noiseGain.gain.linearRampToValueAtTime(0.14 * strength + 0.06, now + 0.12);
      noiseGain.gain.linearRampToValueAtTime(0.06, now + 0.8);
    } catch (_e) {}
  }
  function drip() {
    if (!actx || !ambientGain) return;
    try {
      const o = actx.createOscillator();
      const gg = actx.createGain();
      o.type = "sine";
      const f0 = 700 + Math.random() * 500;
      o.frequency.setValueAtTime(f0, actx.currentTime);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.5, actx.currentTime + 0.14);
      gg.gain.setValueAtTime(0.0001, actx.currentTime);
      gg.gain.exponentialRampToValueAtTime(0.05, actx.currentTime + 0.01);
      gg.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.22);
      o.connect(gg); gg.connect(ambientGain);
      o.start(); o.stop(actx.currentTime + 0.25);
    } catch (_e) {}
    scheduleDrip();
  }
  function scheduleDrip() {
    dripTimer = window.setTimeout(drip, 3500 + Math.random() * 6000);
  }
  function fadeAudio(target, ms) {
    if (!actx || !ambientGain) return;
    const now = actx.currentTime;
    try {
      ambientGain.gain.cancelScheduledValues(now);
      ambientGain.gain.setValueAtTime(ambientGain.gain.value, now);
      ambientGain.gain.linearRampToValueAtTime(target, now + ms / 1000);
    } catch (_e) {}
  }

  /* ================================================================= */
  let boundMove = false;
  function start() {
    if (running) return;
    ensureDom();
    resize();
    seedBlobs();
    running = true;
    document.documentElement.classList.add("fx-mist");
    window.addEventListener("resize", resize);
    if (!boundMove) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      boundMove = true;
    }
    initAudio();
    if (actx && actx.state === "suspended") actx.resume().catch(() => {});
    fadeAudio(0.9, 1200);
    scheduleDrip();
    lastT = 0;
    raf = requestAnimationFrame(draw);
  }
  function stop() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    document.documentElement.classList.remove("fx-mist");
    window.removeEventListener("resize", resize);
    if (boundMove) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      boundMove = false;
    }
    trail.length = 0; puffs.length = 0;
    if (dripTimer) { clearTimeout(dripTimer); dripTimer = 0; }
    fadeAudio(0, 900);
    if (ctx) ctx.clearRect(0, 0, cw, ch);
    if (blurEl) blurEl.style.setProperty("--fog-density", "0");
  }
  function setProgress(p) { progress = Math.max(0, Math.min(1, p)); }

  document.addEventListener("visibilitychange", () => {
    if (!running) return;
    if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; } fadeAudio(0, 300); }
    else { fadeAudio(0.9, 600); lastT = 0; raf = requestAnimationFrame(draw); }
  });

  window.eazoFog = { start, stop, setProgress, spawnPuff };
})();
