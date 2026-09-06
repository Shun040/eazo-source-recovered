/* R–00 RECOVERY ROOM — canvas renderer (fragment field + reconstruction outline).
   Public: window.eazoRestoreCanvas. No external deps. Canvas 2D only. */
(() => {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let canvas = null, ctx = null;
  let raf = 0, running = false, paused = false;
  let w = 1, h = 1, dpr = 1, last = 0;

  // fragment field state
  let frags = [];        // {id,type,x,y,vx,vy,r,selected,corrupted,synthetic,conf}
  let pointer = { x: 0.5, y: 0.5, active: false };
  let hovered = null;
  let onHover = null;    // callback(fragOrNull)
  let onPick = null;     // callback(fragId)

  // shape-morph params (0..1)
  const shape = { synthetic: 0.2, relational: 0, integrity: 0.6, phase: "field", step: 0, stepProgress: 0 };
  // phase: "field" | "assemble" | "result"; step 0=read 1=fill 2=respond
  let energyBoost = 1;   // M-04 energy → faster animation
  let clock = 0;         // ms accumulator for twinkle / drift

  const COLORS = {
    MEMORY: "rgba(170,196,180,0.9)",
    BEHAVIOUR: "rgba(150,180,168,0.85)",
    RELATION: "rgba(214,226,222,0.92)",
    SYSTEM: "rgba(198,170,96,0.85)",
    outline: "rgba(190,210,198,0.5)",
    synthetic: "rgba(198,170,96,0.55)"
  };

  function bind() {
    canvas = document.getElementById("restore-canvas");
    if (!canvas) return false;
    ctx = canvas.getContext("2d");
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("click", onClick);
    return !!ctx;
  }
  function unbind() {
    if (!canvas) return;
    canvas.removeEventListener("mousemove", onMove);
    canvas.removeEventListener("mouseleave", onLeave);
    canvas.removeEventListener("click", onClick);
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
    if (frags.length) buildAmbient();
  }

  // Safe field region (normalized 0..1) that never overlaps the left sidebar.
  // On wide screens the left panel occupies ~26px + ~330px; push the field right.
  function field() {
    const narrow = w < 720;
    if (narrow) {
      // sidebar is static / not overlaying → use a centered region
      return { cx: 0.5, cy: 0.48, rx: 0.34, ry: 0.34 };
    }
    const panelRight = (26 + 330 + 40) / w; // left offset + panel width + gap
    const leftBound = Math.min(0.6, Math.max(0.4, panelRight));
    const rightBound = 0.96;
    const cx = (leftBound + rightBound) / 2;
    const rx = (rightBound - leftBound) / 2;
    return { cx, cy: 0.48, rx, ry: 0.34 };
  }

  function setFragments(list) {
    // list: [{id,type,corrupted,synthetic,conf,selected}]
    const fd = field();
    frags = list.map((f, i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2;
      const rr = 0.45 + (i % 3) * 0.18; // fraction of field radius
      return {
        id: f.id, type: f.type, corrupted: !!f.corrupted, synthetic: !!f.synthetic,
        conf: f.conf != null ? f.conf : 0.7, selected: !!f.selected,
        bx: fd.cx + Math.cos(a) * fd.rx * rr, by: fd.cy + Math.sin(a) * fd.ry * rr,
        x: fd.cx + Math.cos(a) * fd.rx * rr, y: fd.cy + Math.sin(a) * fd.ry * rr,
        r: 5 + Math.random() * 4, jitter: Math.random() * Math.PI * 2,
        twPhase: Math.random() * Math.PI * 2, twSpeed: 0.6 + Math.random() * 0.8,
        driftPhase: Math.random() * Math.PI * 2
      };
    });
    buildAmbient();
  }

  // Decorative background stars — not interactive, just enrich the constellation.
  let ambient = [];
  function buildAmbient() {
    const fd = field();
    const count = w < 720 ? 34 : 60;
    ambient = [];
    for (let i = 0; i < count; i++) {
      // scatter across (and a little beyond) the safe field, never over the panel
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.pow(Math.random(), 0.7);
      let nx = fd.cx + Math.cos(ang) * fd.rx * (0.15 + rad * 1.05);
      let ny = fd.cy + Math.sin(ang) * fd.ry * (0.15 + rad * 1.05);
      nx = Math.min(0.985, Math.max(fd.cx - fd.rx, nx));
      ny = Math.min(0.96, Math.max(0.06, ny));
      const roll = Math.random();
      const tint = roll < 0.14 ? "amber" : (roll < 0.4 ? "cool" : "green");
      ambient.push({
        x: nx, y: ny,
        r: 0.5 + Math.random() * 1.6,
        twPhase: Math.random() * Math.PI * 2,
        twSpeed: 0.3 + Math.random() * 0.9,
        driftPhase: Math.random() * Math.PI * 2,
        tint
      });
    }
  }
  function setSelected(ids) {
    const set = new Set(ids);
    frags.forEach(f => { f.selected = set.has(f.id); });
  }
  function setShape(p) { Object.assign(shape, p); }
  function setEnergy(on) { energyBoost = on ? 1.8 : 1; }
  function setCallbacks(hoverCb, pickCb) { onHover = hoverCb; onPick = pickCb; }

  function localPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  }
  function onMove(e) {
    const p = localPoint(e); pointer.x = p.x; pointer.y = p.y; pointer.active = true;
    const f = pickAt(p.x, p.y);
    if (f !== hovered) { hovered = f; if (onHover) onHover(f); }
  }
  function onLeave() { pointer.active = false; if (hovered) { hovered = null; if (onHover) onHover(null); } }
  function onClick(e) {
    const p = localPoint(e);
    const f = pickAt(p.x, p.y);
    if (f && onPick) onPick(f.id);
  }
  function pickAt(nx, ny) {
    let best = null, bd = 0.05;
    for (const f of frags) {
      const dx = f.x - nx, dy = f.y - ny;
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  function ease(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }

  function frame(ts) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (paused) { last = ts; return; }
    const dt = Math.min(50, ts - (last || ts)) * energyBoost;
    last = ts;
    clock += dt;

    // during assemble, fragments drift toward center outline
    if (shape.phase === "assemble" && !reduced) {
      shape.stepProgress = Math.min(1, shape.stepProgress + dt / 1400);
    }

    // fragment motion targets
    const fd = field();
    for (const f of frags) {
      let tx = f.bx, ty = f.by;
      // relational: gently bias selected relation fragments toward the pointer,
      // but only when the pointer is inside the field and only a small amount,
      // and always clamp the result back into the safe field region.
      if (shape.relational > 0 && f.selected && f.type === "RELATION" && pointer.active &&
          pointer.x > fd.cx - fd.rx && pointer.x < fd.cx + fd.rx) {
        tx += (pointer.x - tx) * 0.18 * shape.relational;
        ty += (pointer.y - ty) * 0.18 * shape.relational;
      }
      // assemble: converge toward a human-ish outline point
      if (shape.phase === "assemble") {
        const p = ease(shape.stepProgress);
        const oc = outlinePointFor(f);
        tx = f.bx + (oc.x - f.bx) * p;
        ty = f.by + (oc.y - f.by) * p;
      }
      // synthetic ratio smooths motion; original fragments jitter (irregular/broken)
      const jig = (1 - shape.synthetic) * 0.006;
      f.jitter += dt * 0.002;
      tx += Math.cos(f.jitter) * jig;
      ty += Math.sin(f.jitter * 1.3) * jig;
      // gentle starfield drift while observing (never in assemble)
      if (shape.phase === "field" && !reduced) {
        tx += Math.cos(f.driftPhase + clock * 0.0004) * 0.006;
        ty += Math.sin(f.driftPhase * 1.2 + clock * 0.0005) * 0.006;
      }
      // clamp into safe field so nothing slides under the left panel or off-screen
      tx = Math.min(fd.cx + fd.rx, Math.max(fd.cx - fd.rx, tx));
      ty = Math.min(fd.cy + fd.ry, Math.max(fd.cy - fd.ry, ty));
      f.x += (tx - f.x) * Math.min(1, dt / 260);
      f.y += (ty - f.y) * Math.min(1, dt / 260);
    }
    draw();
  }

  function outlinePointFor(f) {
    // distribute fragments along an incomplete humanoid/vessel outline,
    // centered in the safe field region (never under the left panel)
    const fd = field();
    const idx = frags.indexOf(f);
    const total = Math.max(1, frags.length);
    const a = (idx / total) * Math.PI * 2;
    const gapStart = Math.PI * 1.7;
    let ang = a;
    if (ang > gapStart) ang = gapStart; // clamp into gap → outline stays open
    const rr = 0.6 + 0.08 * Math.sin(idx);
    return { x: fd.cx + Math.cos(ang) * fd.rx * rr, y: fd.cy + Math.sin(ang) * fd.ry * rr };
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const fd = field();
    const cx = fd.cx * w, cy = fd.cy * h;

    // ── Decorative background starfield (behind everything) ──
    for (const s of ambient) {
      const x = s.x * w, y = s.y * h;
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.twPhase + clock * 0.001 * s.twSpeed));
      const rgb = s.tint === "amber" ? [206, 176, 104] : (s.tint === "cool" ? [206, 222, 230] : [168, 196, 178]);
      const glowR = s.r * 3.4;
      const g = ctx.createRadialGradient(x, y, 0, x, y, glowR);
      g.addColorStop(0, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.32 * tw).toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.5 * tw).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(x, y, s.r, 0, Math.PI * 2); ctx.fill();
    }

    // reconstruction outline (assemble/result) — always leaves a gap
    if (shape.phase === "assemble" || shape.phase === "result") {
      ctx.save();
      ctx.strokeStyle = COLORS.outline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const R = Math.min(fd.rx * w, fd.ry * h) * 0.7;
      // open arc: gap at bottom-right
      ctx.ellipse(cx, cy, R * 0.72, R, 0, -Math.PI / 3, Math.PI * 1.4, false);
      ctx.stroke();
      // synthetic filler structure in amber grows with syntheticRatio
      if (shape.synthetic > 0.15) {
        ctx.strokeStyle = COLORS.synthetic;
        ctx.lineWidth = 0.8;
        const rings = Math.floor(shape.synthetic * 5);
        for (let i = 1; i <= rings; i++) {
          ctx.beginPath();
          ctx.ellipse(cx, cy, R * 0.72 * (i / (rings + 1)), R * (i / (rings + 1)), 0, -Math.PI / 3, Math.PI * 1.1, false);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // ── Constellation lines: connect nearby stars into a soft web ──
    // brighter/denser between selected stars; faint background web among all.
    const pts = frags.map(f => ({ f, x: f.x * w, y: f.y * h }));
    const maxLinkDist = Math.min(fd.rx * w, fd.ry * h) * 0.9;
    ctx.save();
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        if (a.f.corrupted || b.f.corrupted) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > maxLinkDist) continue;
        const both = a.f.selected && b.f.selected;
        const near = 1 - d / maxLinkDist;                 // 0..1 closeness
        // background web very faint; selected pairs form the real constellation
        let alpha = both ? 0.32 * near + 0.12 : 0.06 * near;
        if (!both && !(a.f.selected || b.f.selected)) alpha *= 0.7;
        if (alpha < 0.02) continue;
        // fracture: when few synthetic, skip some selected links for a broken look
        if (both && (1 - shape.synthetic) > 0.45 && ((i + j) % 3 === 0)) continue;
        const twinkle = 0.85 + 0.15 * Math.sin(clock * 0.001 + i + j);
        ctx.strokeStyle = "rgba(180,208,196," + (alpha * twinkle).toFixed(3) + ")";
        ctx.lineWidth = both ? 0.9 : 0.5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    ctx.restore();

    // ── Stars ──
    for (const f of frags) {
      const x = f.x * w, y = f.y * h;
      const tw = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(f.twPhase + clock * 0.001 * f.twSpeed));
      ctx.save();
      if (f.corrupted) {
        // unrecoverable → faint dashed outline only, no glow, no red
        ctx.strokeStyle = "rgba(150,160,160,0.3)";
        ctx.lineWidth = 0.8; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.arc(x, y, f.r, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        continue;
      }
      const base = f.synthetic ? [214, 184, 108] : starRGB(f.type);
      const coreR = (f.selected ? f.r + 1.5 : f.r) * (0.85 + 0.15 * tw);
      const glowR = coreR * (f.selected ? 5.5 : 3.8);
      // glow halo
      const g = ctx.createRadialGradient(x, y, 0, x, y, glowR);
      g.addColorStop(0, "rgba(" + base[0] + "," + base[1] + "," + base[2] + "," + (0.5 * tw * (f.selected ? 1 : 0.6)).toFixed(3) + ")");
      g.addColorStop(0.4, "rgba(" + base[0] + "," + base[1] + "," + base[2] + "," + (0.14 * tw).toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + base[0] + "," + base[1] + "," + base[2] + ",0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, glowR, 0, Math.PI * 2); ctx.fill();
      // bright core
      ctx.fillStyle = "rgba(" + base[0] + "," + base[1] + "," + base[2] + "," + (f.selected ? 1 : 0.78).toFixed(2) + ")";
      ctx.beginPath(); ctx.arc(x, y, coreR, 0, Math.PI * 2); ctx.fill();
      // white-hot center for selected
      if (f.selected) {
        ctx.fillStyle = "rgba(238,246,240,0.95)";
        ctx.beginPath(); ctx.arc(x, y, Math.max(1, coreR * 0.4), 0, Math.PI * 2); ctx.fill();
        // sparkle cross
        ctx.strokeStyle = "rgba(" + base[0] + "," + base[1] + "," + base[2] + "," + (0.5 * tw).toFixed(2) + ")";
        ctx.lineWidth = 0.8;
        const spikeR = glowR * 0.7;
        ctx.beginPath();
        ctx.moveTo(x - spikeR, y); ctx.lineTo(x + spikeR, y);
        ctx.moveTo(x, y - spikeR); ctx.lineTo(x, y + spikeR);
        ctx.stroke();
      }
      ctx.restore();
    }

    // hover marker — a soft ring around the hovered star
    if (hovered && !hovered.corrupted) {
      ctx.save();
      const hx = hovered.x * w, hy = hovered.y * h;
      ctx.strokeStyle = "rgba(230,242,234,0.85)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(hx, hy, hovered.r + 8, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  function starRGB(type) {
    switch (type) {
      case "MEMORY": return [176, 208, 186];
      case "BEHAVIOUR": return [150, 194, 176];
      case "RELATION": return [220, 234, 228];
      case "SYSTEM": return [214, 184, 108];
      default: return [190, 210, 198];
    }
  }

  function start() { if (!ctx) return; running = true; paused = false; last = 0; raf = requestAnimationFrame(frame); }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0; frags = []; hovered = null; ambient = [];
    shape.phase = "field"; shape.step = 0; shape.stepProgress = 0;
    if (ctx) ctx.clearRect(0, 0, w, h);
  }
  function pause() { paused = true; }
  function resume() { if (running) { paused = false; last = 0; } }

  function beginAssemble(step) { shape.phase = "assemble"; shape.step = step || 0; shape.stepProgress = reduced ? 1 : 0; }
  function showResult() { shape.phase = "result"; shape.stepProgress = 1; }

  window.eazoRestoreCanvas = {
    bind, unbind, resize, start, stop, pause, resume,
    setFragments, setSelected, setShape, setEnergy, setCallbacks,
    beginAssemble, showResult, isReduced: () => reduced
  };
})();
