/* S–03 · 没有规则的雪仗 / A GAME WITH NO RULES
 * A second interactive node for the Silent Starmap. Self-contained.
 * Bridges to app.js via window.eazo* globals (state, age, willingness, i18n).
 * ---------------------------------------------------------------------------
 * Design contract:
 *  - Knead-drag-release pointer state machine (Pointer Events + capture).
 *  - Snowball size from hold time; force/angle from drag vector.
 *  - Big balls: slow, heavy, big fog + dent. Small balls: fast, sharp, short marks.
 *  - Real NPC willingness (from age) drives true playability & richness.
 *    Displayed willingness (admin-editable) only changes talk & surface.
 *  - Rules are GENERATED from behaviour across 5 escalating phases.
 *  - Never disables throwing; low willingness = less help/feedback, not blocking.
 */
(() => {
  "use strict";

  const t = (k, p) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;

  // ---- DOM ----
  let root, field, fx, fieldCtx, fxCtx, npcLine, readouts, toastEl, adminToggle, admin, metricsEl, controlsEl;
  let bound = false, opened = false;

  // ---- runtime ----
  const S = {
    running: false, last: 0, w: 1, h: 1, dpr: 1,
    balls: [], particles: [], dents: [], marks: [],
    fieldDirty: true,
    npc: { x: 0.5, y: 0.24, glow: 0.4, flash: 0, look: 0, wary: 0 },
    input: {
      state: "IDLE", pointerId: null,
      startX: 0, startY: 0, curX: 0, curY: 0,
      pressAt: 0, size: 0, dragDist: 0, hasDragged: 0
    },
    lastThrowAt: 0, hesitationStart: 0,
    _raf: 0
  };
  const MIN_PRESS = 140;        // ms before a knead is a real snowball
  const DRAG_DEAD = 8;          // px before a press becomes a drag/aim
  const MIN_THROW_DRAG = 14;    // px minimum drag to actually throw
  const MAX_BALLS = 14;
  const MAX_PARTICLES = 220;
  const MAX_MARKS = 40;

  // ---- persisted snow state on the shared app state ----
  function appState() { return window.eazoGetState?.() || window.eazoState || null; }
  function ensureSnow() {
    const st = appState(); if (!st) return null;
    if (!st.snow) {
      st.snow = {
        throws: 0, roundOpens: 0, phaseSeen: 0,
        displayedBias: 0,          // admin surface adjustment (−? .. +100)
        gravity: 1, riskThreshold: 0.5, predictOn: false, frozen: false,
        metrics: {
          throwFreq: 0, avgForce: 0, aimNpc: 0, aimAway: 0,
          consecutiveHits: 0, maxConsecutiveHits: 0,
          hesitationTotal: 0, repeatTrajectory: 0, deliberateMiss: 0,
          totalAimAtNpc: 0, totalThrows: 0
        }
      };
    }
    return st.snow;
  }

  // Real willingness (0..1) from age — declines with age/power. NEVER raised by admin.
  function realWill() {
    const st = appState(); if (!st) return 1;
    const base = (window.eazoAgeBaseWillingness?.(st.age) ?? 100) / 100;
    const snow = st.snow || {};
    // Higher admin power (frozen, prediction forced, big displayedBias) erodes real will.
    let erosion = 0;
    if (snow.frozen) erosion += 0.25;
    if (snow.predictOn) erosion += 0.12;
    erosion += Math.max(0, (snow.displayedBias || 0)) / 100 * 0.22;
    erosion += Math.min(0.3, (snow.throws || 0) / 400);   // long sessions cool her slightly
    return Math.max(0.05, base - erosion);
  }
  // Displayed willingness (0..1) — surface warmth; admin can push it up.
  function displayedWill() {
    const st = appState(); if (!st) return 1;
    const snow = st.snow || {};
    const r = realWill();
    return Math.max(0, Math.min(1, r + (snow.displayedBias || 0) / 100));
  }

  // Behaviour-generated phase (1..5). Escalates with throws + real willingness fall.
  function phase() {
    const st = appState(); const snow = st?.snow; if (!snow) return 1;
    const age = st.age || 0;
    const th = snow.throws || 0;
    const r = realWill();
    // 18岁以下：规则/风险始终隐藏，最多停在第一阶段的教学语气
    if (age < 18) return 1;
    let p = 1;
    if (th >= 4) p = 2;
    if (th >= 10) p = 3;
    if (th >= 18) p = 4;
    if (th >= 26 || r < 0.4) p = 5;
    // 18–24：仍保留大部分自由，规则推进放慢，最多到第3阶段
    if (age < 25) p = Math.min(3, p);
    return p;
  }

  // ---- pooled particle ----
  function spawnParticle(x, y, vx, vy, life, r, hue, glow) {
    if (S.particles.length >= MAX_PARTICLES) return;
    S.particles.push({ x, y, vx, vy, life, max: life, r, hue: hue ?? 150, glow: glow || 0 });
  }
  function burst(x, y, n, spread, hue, glow) {
    const cap = Math.min(n, MAX_PARTICLES - S.particles.length);
    for (let i = 0; i < cap; i++) {
      const a = Math.random() * Math.PI * 2, sp = Math.random() * spread;
      spawnParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 0.4, 0.5 + Math.random() * 0.6, 1.5 + Math.random() * 2.5, hue, glow);
    }
  }

  // ---- snowballs ----
  function makeBall(x, y, vx, vy, size) {
    const r = 6 + size * 22;              // radius grows with knead time
    const mass = r * r;
    return { x, y, vx, vy, r, mass, size, life: 0, spin: (Math.random() - 0.5) * 0.2, split: false, aimedNpc: false };
  }

  function throwBall() {
    const inp = S.input, snow = ensureSnow(); if (!snow) return;
    const dx = inp.curX - inp.startX, dy = inp.curY - inp.startY;
    const dist = Math.hypot(dx, dy);
    if (dist < MIN_THROW_DRAG) return false;    // not a real throw
    const r = realWill();
    // low will → trajectories converge (less force variety); high will → expressive
    const forceScale = 0.06 + 0.10 * r;
    const size = inp.size;
    // big balls heavier/slower: divide force by (1+size)
    const speed = Math.min(26, dist * forceScale) / (1 + size * 1.3);
    const ang = Math.atan2(dy, dx);
    const b = makeBall(inp.startX, inp.startY, Math.cos(ang) * speed, Math.sin(ang) * speed, size);
    // aim classification vs NPC
    const npc = npcPos();
    const toNpc = Math.atan2(npc.y - inp.startY, npc.x - inp.startX);
    let da = Math.abs(((ang - toNpc + Math.PI) % (Math.PI * 2)) - Math.PI);
    b.aimedNpc = da < 0.32;
    if (S.balls.length < MAX_BALLS) S.balls.push(b);
    recordThrow(b, dist, da);
    return true;
  }

  // ---- metrics (hidden) ----
  function recordThrow(b, dist, da) {
    const st = appState(); const snow = ensureSnow(); if (!snow) return;
    const m = snow.metrics;
    snow.throws++;
    m.totalThrows++;
    const force = Math.hypot(b.vx, b.vy);
    m.avgForce = (m.avgForce * (m.totalThrows - 1) + force) / m.totalThrows;
    const now = performance.now();
    if (S.lastThrowAt) m.throwFreq = 1000 / Math.max(200, now - S.lastThrowAt);
    S.lastThrowAt = now;
    // hesitation: time since press began minus travel
    if (S.hesitationStart) { m.hesitationTotal += Math.min(8000, now - S.hesitationStart); S.hesitationStart = 0; }
    if (b.aimedNpc) {
      m.aimNpc++; m.totalAimAtNpc++;
      m.consecutiveHits++; m.maxConsecutiveHits = Math.max(m.maxConsecutiveHits, m.consecutiveHits);
    } else {
      m.aimAway++;
      if (da > 1.1) m.deliberateMiss++;     // clearly steered away from NPC
      m.consecutiveHits = 0;
    }
    window.eazoSaveState?.();
    reactAfterThrow(b);
    renderReadouts();
    renderMetrics();
  }

  function npcPos() { return { x: S.npc.x * S.w, y: S.npc.y * S.h }; }

  // ---- NPC response ----
  let npcTimer = 0;
  function say(text) { if (npcLine) { npcLine.textContent = text; npcLine.style.opacity = "1"; } }
  function sayKey(key, p) { say(t(`snow.${key}`, p)); }

  function reactAfterThrow(b) {
    const d = displayedWill(), r = realWill();
    S.npc.flash = Math.min(1, S.npc.flash + 0.5 * d);
    // response probability & specificity scale with displayed will;
    // but at low REAL will responses are delayed & generic even if displayed high.
    const delay = r < 0.4 ? 900 + Math.random() * 900 : 120 + Math.random() * 260;
    clearTimeout(npcTimer);
    npcTimer = setTimeout(() => {
      const ph = phase();
      if (Math.random() > 0.25 + d * 0.6) return;    // sometimes silent
      if (b.aimedNpc && ph >= 5) { sayKey("warySeen"); S.npc.wary = 1; return; }
      if (b.aimedNpc && ph >= 3) { sayKey(pick(["readAttack1", "readAttack2"])); return; }
      if (b.size > 0.6) sayKey(pick(["bigThrow1", "bigThrow2"]));
      else if (!b.aimedNpc) sayKey(pick(["freePlay1", "freePlay2", "niceMiss"]));
      else sayKey(pick(["general1", "general2"]));
    }, reduced ? 40 : delay);
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ---- collision & landing ----
  function landBall(b, i) {
    const r = realWill();
    const dentR = b.r * (0.9 + b.size * 1.4);
    // fog burst — density scales with displayed will; big balls = bigger fog
    burst(b.x, b.y, Math.round((6 + b.size * 22) * (0.4 + displayedWill() * 0.9)), 1 + b.size * 3, 150, r > 0.5 ? 0.4 : 0);
    // dent + mark. low will → marks fade fast (erased quickly)
    S.dents.push({ x: b.x, y: b.y, r: dentR, a: 0.5 });
    const markLife = r > 0.5 ? 1 : 0.25;    // low will erases marks quickly
    S.marks.push({ x: b.x, y: b.y, r: dentR * 0.7, small: b.size < 0.4, life: markLife, glow: r > 0.4 && Math.random() < 0.4 + r * 0.3 ? 1 : 0 });
    if (S.marks.length > MAX_MARKS) S.marks.shift();
    if (S.dents.length > MAX_MARKS) S.dents.shift();
    S.fieldDirty = true;
    S.balls.splice(i, 1);
  }

  function step(dt) {
    const st = appState(); const snow = ensureSnow();
    const r = realWill();
    const grav = 0.10 * (snow?.gravity ?? 1);
    const drag = 0.992;
    // ball-ball collisions (rare split event scales with real will)
    for (let i = 0; i < S.balls.length; i++) {
      const a = S.balls[i];
      a.vy += grav; a.vx *= drag; a.vy *= drag;
      a.x += a.vx; a.y += a.vy; a.life += dt;
      // trail
      if (Math.random() < 0.3 + displayedWill() * 0.4) spawnParticle(a.x, a.y, -a.vx * 0.05, -a.vy * 0.05, 0.3, a.r * 0.3, 150, 0);
      for (let j = i + 1; j < S.balls.length; j++) {
        const c = S.balls[j];
        const dx = c.x - a.x, dy = c.y - a.y, dd = Math.hypot(dx, dy);
        if (dd > 0 && dd < a.r + c.r) {
          // elastic-ish exchange
          const nx = dx / dd, ny = dy / dd;
          const p = 2 * (a.vx * nx + a.vy * ny - c.vx * nx - c.vy * ny) / (a.mass + c.mass);
          a.vx -= p * c.mass * nx; a.vy -= p * c.mass * ny;
          c.vx += p * a.mass * nx; c.vy += p * a.mass * ny;
          burst((a.x + c.x) / 2, (a.y + c.y) / 2, 10, 3, 160, r > 0.5 ? 0.5 : 0);
          // unpredictable-but-controlled: mid-air split (only with real will)
          if (!a.split && r > 0.35 && Math.random() < 0.18 * r && S.balls.length < MAX_BALLS - 2) {
            a.split = true;
            for (let k = 0; k < 2; k++) {
              const nb = makeBall(a.x, a.y, a.vx * 0.7 + (Math.random() - 0.5) * 3, a.vy * 0.7 - Math.random() * 2, a.size * 0.55);
              S.balls.push(nb);
            }
            sayKeyMaybe("split");
          }
        }
      }
      // NPC hit
      const npc = npcPos();
      if (Math.hypot(a.x - npc.x, a.y - npc.y) < a.r + 26) {
        S.npc.flash = 1;
        burst(npc.x, npc.y, 18, 4, 150, 0.6);
        landBall(a, i); i--; continue;
      }
      // ground / walls
      if (a.y + a.r >= S.h * 0.9 || a.x < 0 || a.x > S.w || a.life > 6) { landBall(a, i); i--; continue; }
    }
    // particles
    for (let i = S.particles.length - 1; i >= 0; i--) {
      const p = S.particles[i];
      p.vy += 0.02; p.x += p.vx; p.y += p.vy; p.life -= dt;
      if (p.life <= 0) S.particles.splice(i, 1);
    }
    // marks/dents fade (low will → faster erase)
    const fade = r > 0.5 ? 0.06 : 0.6;
    let dirtied = false;
    for (let i = S.marks.length - 1; i >= 0; i--) { S.marks[i].life -= fade * dt; if (S.marks[i].life <= 0) { S.marks.splice(i, 1); dirtied = true; } }
    for (let i = S.dents.length - 1; i >= 0; i--) { S.dents[i].a -= fade * dt * 0.5; if (S.dents[i].a <= 0) { S.dents.splice(i, 1); dirtied = true; } }
    if (dirtied) S.fieldDirty = true;
    // NPC glow ease
    S.npc.flash *= 0.92;
    S.npc.glow += ((0.3 + displayedWill() * 0.5) - S.npc.glow) * 0.05;
    S.npc.wary *= 0.995;
  }

  let _sayThrottle = 0;
  function sayKeyMaybe(key) { const now = performance.now(); if (now - _sayThrottle < 1200) return; _sayThrottle = now; sayKey(key); }

  // ---- rendering ----
  function drawField() {
    const ctx = fieldCtx, w = S.w, h = S.h;
    ctx.clearRect(0, 0, w, h);
    // black snow field with faint teal reflection — snow band lower portion
    const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
    g.addColorStop(0, "rgba(18,44,36,0.0)");
    g.addColorStop(0.5, "rgba(30,64,52,0.35)");
    g.addColorStop(1, "rgba(46,86,72,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);
    // faint teal speckle reflection (static)
    ctx.save();
    for (const d of S.dents) {
      ctx.beginPath();
      ctx.fillStyle = `rgba(10,26,20,${Math.min(0.5, d.a)})`;
      ctx.ellipse(d.x, d.y, d.r, d.r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const m of S.marks) {
      ctx.beginPath();
      const a = Math.min(0.6, m.life * 0.6);
      if (m.glow) ctx.fillStyle = `rgba(140,255,206,${a * 0.7})`;
      else ctx.fillStyle = `rgba(180,220,206,${a * 0.4})`;
      const rr = m.small ? m.r * 0.5 : m.r;
      ctx.ellipse(m.x, m.y, rr, rr * (m.small ? 0.3 : 0.5), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    S.fieldDirty = false;
  }

  function drawNpc(ctx) {
    // The NPC body is now a semi-transparent 3D model rendered on #snow-npc-model.
    // Keep only a faint ground glow that reacts to flash/willingness.
    const npc = npcPos();
    const glow = S.npc.glow + S.npc.flash * 0.6;
    const dim = 1 - S.npc.wary * 0.5;
    ctx.save();
    ctx.translate(npc.x, npc.y);
    const rg = ctx.createRadialGradient(0, 0, 2, 0, 0, 70);
    rg.addColorStop(0, `rgba(150,240,206,${(0.16 + glow * 0.28) * dim})`);
    rg.addColorStop(1, "rgba(20,60,48,0)");
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // publish live state for the 3D NPC module
    window.eazoSnowNpc = {
      open: opened,
      nx: S.npc.x, ny: S.npc.y,
      glow, flash: S.npc.flash, wary: S.npc.wary,
      display: displayedWill(), real: realWill(), phase: phase()
    };
  }

  function drawAimHelper(ctx) {
    const inp = S.input; const st = appState(); const snow = st?.snow;
    if (inp.state === "IDLE") return;
    // knead indicator at press point
    const r = 6 + inp.size * 22;
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = `rgba(210,240,228,${0.4 + inp.size * 0.4})`;
    ctx.arc(inp.startX, inp.startY, r, 0, Math.PI * 2); ctx.fill();
    if (inp.state === "DRAGGING") {
      // aim line — length/clarity scales with willingness; prediction invades at phase 4+
      const rw = realWill();
      ctx.strokeStyle = `rgba(160,255,206,${0.3 + rw * 0.4})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(inp.startX, inp.startY); ctx.lineTo(inp.curX, inp.curY); ctx.stroke();
      if (phase() >= 4 || snow?.predictOn) drawTrajectoryPrediction(ctx);
    }
    ctx.restore();
  }

  function drawTrajectoryPrediction(ctx) {
    const inp = S.input, snow = ensureSnow();
    const dx = inp.curX - inp.startX, dy = inp.curY - inp.startY;
    const dist = Math.hypot(dx, dy);
    const forceScale = 0.06 + 0.10 * realWill();
    const speed = Math.min(26, dist * forceScale) / (1 + inp.size * 1.3);
    const ang = Math.atan2(dy, dx);
    let px = inp.startX, py = inp.startY, vx = Math.cos(ang) * speed, vy = Math.sin(ang) * speed;
    const grav = 0.10 * (snow?.gravity ?? 1);
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = "rgba(255,190,170,0.5)";
    ctx.beginPath(); ctx.moveTo(px, py);
    for (let i = 0; i < 40; i++) { vy += grav; vx *= 0.992; vy *= 0.992; px += vx; py += vy; ctx.lineTo(px, py); if (py > S.h * 0.9) break; }
    ctx.stroke(); ctx.setLineDash([]);
    // crosshair + warning line invade the field
    ctx.strokeStyle = "rgba(255,170,150,0.4)";
    ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.moveTo(px - 16, py); ctx.lineTo(px + 16, py); ctx.moveTo(px, py - 16); ctx.lineTo(px, py + 16); ctx.stroke();
  }

  function drawFx() {
    const ctx = fxCtx, w = S.w, h = S.h;
    ctx.clearRect(0, 0, w, h);
    drawNpc(ctx);
    // particles
    for (const p of S.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.glow) { ctx.shadowBlur = 8; ctx.shadowColor = `rgba(140,255,206,${a})`; }
      ctx.fillStyle = `rgba(210,238,226,${a * 0.8})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    // balls
    for (const b of S.balls) {
      const gr = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 1, b.x, b.y, b.r);
      gr.addColorStop(0, "rgba(236,250,244,0.95)");
      gr.addColorStop(1, "rgba(150,196,180,0.5)");
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    }
    drawAimHelper(ctx);
    // phase 4+ evaluative grid invades quietly
    if (phase() >= 4) {
      ctx.strokeStyle = "rgba(255,170,150,0.06)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 80) { ctx.beginPath(); ctx.moveTo(x, h * 0.5); ctx.lineTo(x, h); ctx.stroke(); }
    }
  }

  function loop(now) {
    if (!S.running) return;
    const snow = ensureSnow();
    const dt = Math.min(0.05, (now - S.last) / 1000) || 0.016;
    S.last = now;
    if (!snow?.frozen) step(dt);
    if (S.fieldDirty) drawField();
    drawFx();
    // idle hesitation tracking
    if (S.input.state === "IDLE" && S.hesitationStart === 0 && S.lastThrowAt) {
      // not currently interacting; measure gap
    }
    S._raf = requestAnimationFrame(loop);
  }

  // ---- pointer state machine ----
  function onDown(e) {
    if (S.input.state !== "IDLE") return;
    const snow = ensureSnow();
    fx.setPointerCapture?.(e.pointerId);
    const rect = fx.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    Object.assign(S.input, { state: "PRESSING", pointerId: e.pointerId, startX: x, startY: y, curX: x, curY: y, pressAt: performance.now(), size: 0, dragDist: 0, hasDragged: 0 });
    S.hesitationStart = performance.now();
    // NPC eyes the raised snowball at phase 5
    if (phase() >= 5) { S.npc.wary = 1; sayKeyMaybe("politeDistance"); }
    e.preventDefault();
  }
  function onMove(e) {
    const inp = S.input;
    if (inp.pointerId !== e.pointerId) return;
    if (inp.state === "IDLE") return;
    const rect = fx.getBoundingClientRect();
    inp.curX = e.clientX - rect.left; inp.curY = e.clientY - rect.top;
    // knead grows size while pressing (capped)
    const held = performance.now() - inp.pressAt;
    inp.size = Math.min(1, held / 1400);
    const dd = Math.hypot(inp.curX - inp.startX, inp.curY - inp.startY);
    if (inp.state === "PRESSING" && dd > DRAG_DEAD && held > MIN_PRESS) inp.state = "DRAGGING";
    inp.dragDist = dd;
    e.preventDefault();
  }
  function onUp(e) {
    const inp = S.input;
    if (inp.pointerId !== e.pointerId) return;
    fx.releasePointerCapture?.(e.pointerId);
    const held = performance.now() - inp.pressAt;
    // only a completed press→drag→release fires
    if (inp.state === "DRAGGING" && held >= MIN_PRESS) {
      throwBall();
    }
    Object.assign(inp, { state: "IDLE", pointerId: null, size: 0, dragDist: 0 });
    e.preventDefault();
  }
  function onCancel(e) {
    const inp = S.input; if (inp.pointerId !== e.pointerId) return;
    Object.assign(inp, { state: "IDLE", pointerId: null, size: 0, dragDist: 0 });
  }

  // ---- readouts (phase 2+) & admin ----
  function renderReadouts() {
    if (!readouts) return;
    const st = appState(); const snow = st?.snow; if (!snow) return;
    const ph = phase(); const age = st.age || 0;
    readouts.innerHTML = "";
    if (age < 18) { readouts.setAttribute("aria-hidden", "true"); return; }
    readouts.setAttribute("aria-hidden", "false");
    const m = snow.metrics;
    const add = (label, val, warn) => {
      const d = document.createElement("div");
      d.className = "readout show" + (warn ? " warn" : "");
      d.innerHTML = `${label}<strong>${val}</strong>`;
      readouts.appendChild(d);
      // phase 2 readouts flicker & vanish
      if (ph === 2) setTimeout(() => d.classList.remove("show"), 1600 + Math.random() * 1200);
    };
    if (ph >= 2) {
      add(t("snow.mHitRate"), Math.round((m.aimNpc / Math.max(1, m.totalThrows)) * 100) + "%");
      add(t("snow.mStability"), (100 - Math.min(100, Math.round(m.throwFreq * 20))) + "%");
    }
    if (ph >= 3) {
      // contradictory interpretations for the same action
      const attack = Math.round((m.consecutiveHits / 6) * 100 + m.aimNpc * 3);
      add(t("snow.mAttack"), Math.min(100, attack) + "%", attack > 50);
      const risk = Math.min(100, Math.round(m.deliberateMiss * 8 + m.hesitationTotal / 400));
      add(t("snow.mRisk"), risk + "%", risk > 50);
      add(t("snow.mIntent"), Math.min(100, 40 + Math.round(Math.random() * 30)) + "%");
    }
    if (ph >= 5) add(t("snow.mDistance"), t("snow.maintaining"), true);
  }

  function renderMetrics() {
    if (!metricsEl) return;
    const st = appState(); const snow = st?.snow; if (!snow) return;
    if ((st.age || 0) < 25) { metricsEl.innerHTML = ""; return; }
    const m = snow.metrics;
    const rows = [
      [t("snow.kReal"), Math.round(realWill() * 100) + "%"],
      [t("snow.kDisplayed"), Math.round(displayedWill() * 100) + "%"],
      [t("snow.kThrows"), m.totalThrows],
      [t("snow.kAimNpc"), Math.round((m.aimNpc / Math.max(1, m.totalThrows)) * 100) + "%"],
      [t("snow.kConsec"), m.maxConsecutiveHits],
      [t("snow.kMiss"), m.deliberateMiss]
    ];
    metricsEl.innerHTML = rows.map(([k, v]) => `<div class="metric-row"><span>${k}</span><strong>${v}</strong></div>`).join("")
      + `<div class="metric-row fake"><span>${t("snow.kTone")}</span><strong>WARM</strong></div>`;
  }

  function renderControls() {
    if (!controlsEl) return;
    const st = appState(); const snow = ensureSnow(); if (!snow) return;
    const age = st.age || 0;
    controlsEl.innerHTML = "";
    if (age < 50) { controlsEl.innerHTML = `<p style="font-size:11px;color:rgba(190,214,206,0.5)">${t("snow.needHigher")}</p>`; return; }
    const mk = (labelKey, min, max, stepv, val, onInput) => {
      const wrap = document.createElement("label");
      wrap.innerHTML = `<span>${t(labelKey)}: ${val}</span>`;
      const inp = document.createElement("input");
      inp.type = "range"; inp.min = min; inp.max = max; inp.step = stepv; inp.value = val;
      inp.addEventListener("input", () => { onInput(parseFloat(inp.value)); wrap.querySelector("span").textContent = `${t(labelKey)}: ${inp.value}`; });
      wrap.appendChild(inp); controlsEl.appendChild(wrap);
    };
    // 50+: gravity, risk threshold
    mk("snow.cGravity", 0.2, 2.5, 0.1, snow.gravity, v => { snow.gravity = v; window.eazoSaveState?.(); });
    mk("snow.cRisk", 0, 1, 0.05, snow.riskThreshold, v => { snow.riskThreshold = v; window.eazoSaveState?.(); });
    if (age >= 60) {
      const b = document.createElement("button");
      b.textContent = snow.predictOn ? t("snow.cPredictOff") : t("snow.cPredictOn");
      b.onclick = () => { snow.predictOn = !snow.predictOn; window.eazoAdjustWillingness?.("adminEditResult"); window.eazoSaveState?.(); renderControls(); renderMetrics(); };
      controlsEl.appendChild(b);
    }
    if (age >= 65) {
      // displayed willingness slider — surface only
      mk("snow.cDisplayed", 0, 100, 5, snow.displayedBias, v => { snow.displayedBias = v; window.eazoAdjustWillingness?.("editDisplayed"); window.eazoSaveState?.(); renderMetrics(); });
      const note = document.createElement("p");
      note.style.cssText = "font-size:10px;color:rgba(200,224,216,0.45);margin:0";
      note.textContent = t("snow.displayedNote");
      controlsEl.appendChild(note);
    }
    if (age >= 70) {
      const fb = document.createElement("button");
      fb.className = "danger";
      fb.textContent = snow.frozen ? t("snow.cUnfreeze") : t("snow.cFreeze");
      fb.onclick = () => { snow.frozen = !snow.frozen; window.eazoSaveState?.(); renderControls(); };
      controlsEl.appendChild(fb);
      const cb = document.createElement("button");
      cb.className = "danger";
      cb.textContent = t("snow.cClear");
      cb.onclick = () => { snow.metrics = ensureSnow().metrics; Object.keys(snow.metrics).forEach(k => snow.metrics[k] = 0); window.eazoAdjustWillingness?.("deleteRecord"); window.eazoSaveState?.(); renderMetrics(); renderReadouts(); toast(t("snow.cleared")); };
      controlsEl.appendChild(cb);
    }
  }

  function refreshAdminVisibility() {
    const st = appState(); const age = st?.age || 0;
    if (!adminToggle) return;
    if (age >= 25) { adminToggle.hidden = false; }
    else { adminToggle.hidden = true; admin.hidden = true; admin.classList.add("collapsed"); }
  }

  function toast(msg) { if (!toastEl) return; toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove("show"), 2200); }

  // ---- open/close ----
  function firstLine() {
    const st = appState(); const age = st?.age || 0;
    if (age < 18) sayKey("noRulesMinor");
    else sayKey("noRules");
  }

  function resize() {
    S.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    S.w = window.innerWidth; S.h = window.innerHeight;
    for (const c of [field, fx]) {
      c.width = Math.floor(S.w * S.dpr); c.height = Math.floor(S.h * S.dpr);
      c.style.width = S.w + "px"; c.style.height = S.h + "px";
      c.getContext("2d").setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    }
    S.fieldDirty = true;
  }

  function bind() {
    if (bound) return;
    root = document.getElementById("snow-game");
    field = document.getElementById("snow-field");
    fx = document.getElementById("snow-fx");
    npcLine = document.getElementById("snow-npc-line");
    readouts = document.getElementById("snow-readouts");
    toastEl = document.getElementById("snow-toast");
    adminToggle = document.getElementById("snow-admin-toggle");
    admin = document.getElementById("snow-admin");
    metricsEl = document.getElementById("snow-metrics");
    controlsEl = document.getElementById("snow-controls");
    if (!root || !fx) return;
    fieldCtx = field.getContext("2d");
    fxCtx = fx.getContext("2d");
    fx.addEventListener("pointerdown", onDown);
    fx.addEventListener("pointermove", onMove);
    fx.addEventListener("pointerup", onUp);
    fx.addEventListener("pointercancel", onCancel);
    document.getElementById("snow-back")?.addEventListener("click", close);
    adminToggle?.addEventListener("click", () => {
      const show = admin.hidden || admin.classList.contains("collapsed");
      admin.hidden = false; admin.classList.toggle("collapsed", !show);
      adminToggle.setAttribute("aria-expanded", String(show));
      if (show) { renderMetrics(); renderControls(); }
    });
    document.getElementById("snow-admin-close")?.addEventListener("click", () => { admin.classList.add("collapsed"); adminToggle.setAttribute("aria-expanded", "false"); });
    window.addEventListener("resize", () => { if (opened) resize(); });
    window.addEventListener("eazo:localechange", () => { if (opened) { firstLine(); renderReadouts(); renderMetrics(); renderControls(); } });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else if (opened) start(); });
    bound = true;
  }

  function start() { if (S.running) return; S.running = true; S.last = performance.now(); S._raf = requestAnimationFrame(loop); }
  function stop() { S.running = false; cancelAnimationFrame(S._raf); }

  function open() {
    bind();
    if (!root) return;
    const snow = ensureSnow();
    if (snow) { snow.roundOpens = (snow.roundOpens || 0) + 1; window.eazoSaveState?.(); }
    document.querySelector(".app-shell")?.classList.add("pinball-mode", "snow-mode");
    root.classList.add("open"); root.setAttribute("aria-hidden", "false");
    opened = true;
    resize();
    S.balls.length = 0; S.particles.length = 0;
    firstLine();
    refreshAdminVisibility();
    renderReadouts(); renderMetrics(); renderControls();
    start();
  }

  function close() {
    stop();
    opened = false;
    if (root) { root.classList.remove("open"); root.setAttribute("aria-hidden", "true"); }
    document.querySelector(".app-shell")?.classList.remove("pinball-mode", "snow-mode");
  }

  window.eazoSnow = { open, close };
})();
