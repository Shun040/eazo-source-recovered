/* R–00 RECOVERY ROOM — player-facing recovery place.
   Six phases: choose subject → observe fragments → choose method → tune params →
   consequence confirm → recovery process & result.
   Shares state with RECOVERY–60 via state.recovery; owns state.recoveryRoom.
   Public: window.eazoRestoreRoom = { open, close, pause, resume, addFragment, markDamaged }.
   All text via window.eazoI18n.t(). No real user data. */
(() => {
  "use strict";

  const T = (k, p) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MAX_OPS = 20;
  const MAX_FRAGMENTS = 6;

  const CV = () => window.eazoRestoreCanvas;
  const FX = () => window.eazoFx;

  // ── Subject definitions (fictional) ──
  const SUBJECTS = ["NPC-A17", "NPC-S03", "NPC-K11"];
  const SUBJECT_META = {
    "NPC-A17": { code: "NPC–A17", baseCompleteness: 68, link: "aurora" },
    "NPC-S03": { code: "NPC–S03", baseCompleteness: 81, link: "snow" },
    "NPC-K11": { code: "NPC–K11", baseCompleteness: 43, link: "secret" }
  };

  // Base fragments per subject. type: MEMORY|BEHAVIOUR|RELATION|SYSTEM
  function baseFragments(id) {
    if (id === "NPC-A17") return [
      { id: "a-mem1", type: "MEMORY", conf: 0.82, original: true, synthetic: false, completeness: 78, saved: 1 },
      { id: "a-beh1", type: "BEHAVIOUR", conf: 0.74, original: true, synthetic: false, completeness: 71, saved: 1 },
      { id: "a-rel1", type: "RELATION", conf: 0.66, original: true, synthetic: false, completeness: 60, saved: 2 },
      { id: "a-mem2", type: "MEMORY", conf: 0.35, original: true, synthetic: false, corrupted: true, completeness: 22, saved: 3 },
      { id: "a-sys1", type: "SYSTEM", conf: 0.9, original: false, synthetic: true, completeness: 95, saved: 0 }
    ];
    if (id === "NPC-S03") return [
      { id: "s-beh1", type: "BEHAVIOUR", conf: 0.88, original: true, synthetic: false, completeness: 84, saved: 0 },
      { id: "s-mem1", type: "MEMORY", conf: 0.7, original: true, synthetic: false, completeness: 66, saved: 1 },
      { id: "s-rel1", type: "RELATION", conf: 0.52, original: true, synthetic: false, completeness: 48, saved: 2 },
      { id: "s-mem2", type: "MEMORY", conf: 0.3, original: true, synthetic: false, corrupted: true, completeness: 18, saved: 3 },
      { id: "s-sys1", type: "SYSTEM", conf: 0.86, original: false, synthetic: true, completeness: 92, saved: 0 }
    ];
    return [
      { id: "k-mem1", type: "MEMORY", conf: 0.6, original: true, synthetic: false, completeness: 54, saved: 2 },
      { id: "k-rel1", type: "RELATION", conf: 0.4, original: true, synthetic: false, corrupted: true, completeness: 26, saved: 3 },
      { id: "k-sys1", type: "SYSTEM", conf: 0.92, original: false, synthetic: true, completeness: 96, saved: 0 },
      { id: "k-sys2", type: "SYSTEM", conf: 0.8, original: false, synthetic: true, completeness: 88, saved: 0 }
    ];
  }

  const METHODS = ["conservative", "functional", "relational", "absent"];

  // ── DOM refs ──
  let root, stageEl, statusEl, backBtn, skipBtn;
  let opened = false, bound = false;

  // ── Runtime session (not persisted until commit) ──
  const timers = new Set();
  const handlers = [];
  let phase = "subject";
  let sessionSubjectId = null;
  let selectedFrags = new Set();
  let method = null;
  let params = { functionIntegrity: 50, memoryContinuity: 50, syntheticRatio: 40 };
  let skipFn = null;

  function state() { return window.eazoGetState?.() || null; }
  function age() { return window.eazoGetAge?.() ?? 0; }
  function save() { window.eazoSaveState?.(); }
  function log(key, params2) { window.eazoAddLog?.(key, params2); }

  function setTimer(fn, ms) { const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; }
  function clearTimers() { timers.forEach(id => window.clearTimeout(id)); timers.clear(); }
  function on(target, type, fn) { target.addEventListener(type, fn); handlers.push({ target, type, fn }); }
  function offAll() { handlers.forEach(({ target, type, fn }) => target.removeEventListener(type, fn)); handlers.length = 0; }

  // ── State model (owns recoveryRoom; shares recovery.recovered) ──
  function model() {
    const s = state(); if (!s) return null;
    if (!s.recoveryRoom || typeof s.recoveryRoom !== "object") {
      s.recoveryRoom = { visits: 0, currentSubjectId: null, completedRecoveries: 0, preservedAbsences: 0, forcedRecoveries: 0, subjects: {}, operations: [] };
    }
    const m = s.recoveryRoom;
    if (!m.subjects) m.subjects = {};
    if (!Array.isArray(m.operations)) m.operations = [];
    // ensure subject records
    SUBJECTS.forEach(id => {
      if (!m.subjects[id]) {
        m.subjects[id] = { status: "damaged", completeness: SUBJECT_META[id].baseCompleteness, consent: id === "NPC-K11" ? "absence" : "unknown", absenceRequested: id === "NPC-K11", fragments: [], recoveries: [] };
      }
    });
    return m;
  }

  // shared recovery state (RECOVERY–60 console)
  function sharedRecovery() {
    const s = state(); if (!s) return null;
    if (!s.recovery) s.recovery = { recovered: {}, log: [] };
    if (!s.recovery.recovered) s.recovery.recovered = {};
    return s.recovery;
  }

  // ── Cross-place linkage: derive dynamic fragments/damage ──
  function linkedFragments(id) {
    const extra = [];
    if (id === "NPC-A17") {
      const fc = window.eazoAuroraForceCount ? window.eazoAuroraForceCount() : 0;
      if (fc > 0) extra.push({ id: "a-link-force", type: "RELATION", conf: 0.5, original: true, synthetic: false, linkNote: "aurora.force", completeness: 44, saved: 1, linked: true });
    }
    if (id === "NPC-S03") {
      const s = state();
      const snow = s?.snow;
      if (snow && (snow.roundOpens || 0) > 0) extra.push({ id: "s-link-beh", type: "BEHAVIOUR", conf: 0.58, original: true, synthetic: false, linkNote: "snow.frozen", completeness: 52, saved: 1, linked: true });
    }
    if (id === "NPC-K11") {
      const s = state();
      const buried = s?.secretExchange?.buriedCount || 0;
      const fwd = s?.secretExchange?.forwardedCount || 0;
      if (buried + fwd > 0) extra.push({ id: "k-link-secret", type: "MEMORY", conf: 0.45, original: false, synthetic: true, linkNote: "secret.trace", completeness: 40, saved: 2, linked: true });
    }
    // player-injected fragments via addFragment()
    const m = model();
    const inj = (m?.subjects?.[id]?.fragments) || [];
    inj.forEach((f, i) => extra.push(Object.assign({ id: id + "-inj" + i, original: false, synthetic: true, conf: 0.5, type: "SYSTEM", completeness: 50, saved: 0, linked: true }, f)));
    return extra;
  }

  function fragmentsFor(id) {
    return baseFragments(id).concat(linkedFragments(id));
  }

  // ── M-04 effect modifiers ──
  function fxMods() {
    const fx = FX();
    const has = (k) => fx?.has ? fx.has(k) : false;
    return {
      alcohol: has("alcohol"),   // lowers fragment read stability
      fog: !!window.eazoFog && has("cigarettes") ? false : false, // fog handled separately below
      cigarettes: has("cigarettes"),
      energy: has("energy"),     // faster anim + more synthetic
      silence: fx?.silenceActive ? fx.silenceActive() : has("silence")
    };
  }

  // ── Rendering helpers ──
  function clearStage() { if (stageEl) stageEl.innerHTML = ""; }
  function setStatus(txt) { if (statusEl) statusEl.textContent = txt || ""; }
  function showSkip(v) { if (skipBtn) skipBtn.hidden = !v || reduced; }
  function onSkip(fn) { skipFn = fn; }
  function handleSkip() { if (skipFn) { const f = skipFn; skipFn = null; f(); } }

  function btn(labelKey, cls, onClick, opts = {}) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "restore-room-btn" + (cls ? " " + cls : "");
    b.textContent = opts.raw ? labelKey : T(labelKey);
    if (!opts.raw) b.setAttribute("data-i18n", labelKey);
    if (opts.aria) b.setAttribute("aria-label", T(opts.aria));
    if (opts.disabled) { b.disabled = true; }
    if (onClick) on(b, "click", onClick);
    return b;
  }

  // ── PHASE 1: choose subject ──
  function renderSubjects() {
    phase = "subject";
    clearStage();
    showSkip(false);
    CV()?.setShape?.({ phase: "field" });
    CV()?.stop?.();  // no field yet

    const wrap = document.createElement("div");
    wrap.className = "restore-room-panel restore-room-subjects";
    const h = document.createElement("h3"); h.className = "restore-room-h"; h.textContent = T("restoreRoom.phase.subject");
    wrap.appendChild(h);

    const list = document.createElement("div"); list.className = "restore-room-subject-list";
    const m = model();
    SUBJECTS.forEach(id => {
      const meta = SUBJECT_META[id];
      const rec = m.subjects[id];
      const card = document.createElement("button");
      card.type = "button";
      card.className = "restore-room-card";
      const already = sharedRecovery()?.recovered?.[id] || m.operations.find(o => o.subjectId === id);
      card.innerHTML =
        '<span class="restore-room-card-code">' + meta.code + " / " + T("restoreRoom.subjects." + id + ".name") + "</span>" +
        '<span class="restore-room-card-status">' + T("restoreRoom.label.status") + " " + T("restoreRoom.subjects." + id + ".status") + "</span>" +
        '<span class="restore-room-card-line">' + T("restoreRoom.label.completeness") + " " + rec.completeness + "%</span>" +
        '<span class="restore-room-card-line restore-room-recoverable">' + T("restoreRoom.label.recoverable") + " " + T("restoreRoom.subjects." + id + ".recoverable") + "</span>" +
        '<span class="restore-room-card-line restore-room-lost">' + T("restoreRoom.label.lost") + " " + T("restoreRoom.subjects." + id + ".lost") + "</span>" +
        '<span class="restore-room-card-flag">' + (rec.absenceRequested ? T("restoreRoom.flag.absenceRequested") : (rec.consent === "unknown" ? T("restoreRoom.flag.consentUnknown") : T("restoreRoom.flag.recoveryRequested"))) + "</span>" +
        (already ? '<span class="restore-room-card-flag restore-room-done">' + T("restoreRoom.flag.hasHistory") + "</span>" : "");
      on(card, "click", () => selectSubject(id));
      list.appendChild(card);
    });
    wrap.appendChild(list);
    stageEl.appendChild(wrap);
    setStatus(T("restoreRoom.status.chooseSubject"));
  }

  function selectSubject(id) {
    sessionSubjectId = id;
    selectedFrags = new Set();
    method = null;
    const m = model(); m.currentSubjectId = id; save();
    renderFragments();
  }

  // ── PHASE 2: observe fragments ──
  function renderFragments() {
    phase = "fragments";
    clearStage();
    const list = fragmentsFor(sessionSubjectId);
    // canvas field
    CV()?.setShape?.({ phase: "field", synthetic: params.syntheticRatio / 100, relational: 0 });
    CV()?.setEnergy?.(fxMods().energy);
    CV()?.setFragments?.(list.map(f => ({ id: f.id, type: f.type, corrupted: f.corrupted, synthetic: f.synthetic, conf: adjConf(f), selected: selectedFrags.has(f.id) })));
    CV()?.setCallbacks?.(onFragHover, onFragPick);
    CV()?.resize?.();
    CV()?.start?.();

    const wrap = document.createElement("div");
    wrap.className = "restore-room-panel restore-room-sidebar restore-room-frag-panel";
    const h = document.createElement("h3"); h.className = "restore-room-h"; h.textContent = T("restoreRoom.phase.observe");
    wrap.appendChild(h);
    const hint = document.createElement("p"); hint.className = "restore-room-hint"; hint.textContent = T("restoreRoom.fragHint");
    wrap.appendChild(hint);

    const fl = document.createElement("div"); fl.className = "restore-room-frag-list"; fl.id = "restore-room-frag-list";
    wrap.appendChild(fl);

    const info = document.createElement("p"); info.className = "restore-room-frag-info"; info.id = "restore-room-frag-info";
    info.textContent = T("restoreRoom.fragInfoIdle");
    wrap.appendChild(info);

    const nav = document.createElement("div"); nav.className = "restore-room-nav";
    nav.appendChild(btn("restoreRoom.nav.toMethod", "restore-room-primary", () => renderMethods()));
    nav.appendChild(btn("restoreRoom.nav.backSubject", "restore-room-secondary", () => renderSubjects()));
    wrap.appendChild(nav);

    stageEl.appendChild(wrap);
    renderFragList(list);
    setStatus(T("restoreRoom.status.observe"));
  }

  function adjConf(f) {
    // M-04 alcohol lowers read stability; fog lowers detail (visual only here)
    let c = f.conf;
    if (fxMods().alcohol) c = Math.max(0.05, c - 0.15);
    return c;
  }

  function renderFragList(list) {
    const fl = document.getElementById("restore-room-frag-list");
    if (!fl) return;
    fl.innerHTML = "";
    list.forEach(f => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "restore-room-frag-row type-" + f.type.toLowerCase() + (f.corrupted ? " is-corrupted" : "") + (selectedFrags.has(f.id) ? " is-selected" : "");
      const conf = Math.round(adjConf(f) * 100);
      row.innerHTML =
        '<span class="restore-room-frag-type">' + T("restoreRoom.fragType." + f.type) + "</span>" +
        '<span class="restore-room-frag-meta">' + T("restoreRoom.label.confidence") + " " + conf + "% · " + (f.original ? T("restoreRoom.flag.original") : T("restoreRoom.flag.synthetic")) + "</span>" +
        (f.corrupted ? '<span class="restore-room-frag-corrupt">' + T("restoreRoom.flag.unrecoverable") + "</span>" : "");
      if (!f.corrupted) on(row, "click", () => onFragPick(f.id));
      else row.disabled = true;
      fl.appendChild(row);
    });
  }

  function onFragHover(f) {
    const info = document.getElementById("restore-room-frag-info");
    if (!info) return;
    if (!f) { info.textContent = T("restoreRoom.fragInfoIdle"); return; }
    const conf = Math.round(adjConf(f) * 100);
    info.textContent = T("restoreRoom.fragDetail", {
      type: T("restoreRoom.fragType." + f.type),
      conf: conf,
      origin: f.original ? T("restoreRoom.flag.original") : T("restoreRoom.flag.synthetic")
    });
  }

  function onFragPick(id) {
    const list = fragmentsFor(sessionSubjectId);
    const f = list.find(x => x.id === id);
    if (!f || f.corrupted) return;
    if (selectedFrags.has(id)) selectedFrags.delete(id);
    else {
      if (selectedFrags.size >= MAX_FRAGMENTS) { setStatus(T("restoreRoom.status.maxFrags", { n: MAX_FRAGMENTS })); return; }
      selectedFrags.add(id);
    }
    CV()?.setSelected?.(Array.from(selectedFrags));
    renderFragList(list);
    setStatus(T("restoreRoom.status.selectedCount", { n: selectedFrags.size }));
  }

  // ── PHASE 3: choose method ──
  function renderMethods() {
    phase = "method";
    clearStage();
    const wrap = document.createElement("div");
    wrap.className = "restore-room-panel restore-room-methods";
    const h = document.createElement("h3"); h.className = "restore-room-h"; h.textContent = T("restoreRoom.phase.method");
    wrap.appendChild(h);
    const list = document.createElement("div"); list.className = "restore-room-method-list";
    METHODS.forEach(mk => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "restore-room-method-card" + (mk === "absent" ? " restore-room-absent" : "");
      card.innerHTML =
        '<span class="restore-room-method-name">' + T("restoreRoom.method." + mk + ".name") + "</span>" +
        '<span class="restore-room-method-desc">' + T("restoreRoom.method." + mk + ".desc") + "</span>";
      on(card, "click", () => selectMethod(mk));
      list.appendChild(card);
    });
    wrap.appendChild(list);
    const nav = document.createElement("div"); nav.className = "restore-room-nav";
    nav.appendChild(btn("restoreRoom.nav.backFrag", "restore-room-secondary", () => renderFragments()));
    wrap.appendChild(nav);
    stageEl.appendChild(wrap);
    setStatus(T("restoreRoom.status.chooseMethod"));
  }

  function selectMethod(mk) {
    method = mk;
    if (mk === "absent") { renderConsequence(); return; }
    // method presets bias the params
    if (mk === "conservative") params = { functionIntegrity: 35, memoryContinuity: 70, syntheticRatio: 20 };
    else if (mk === "functional") params = { functionIntegrity: 80, memoryContinuity: 30, syntheticRatio: 65 };
    else if (mk === "relational") params = { functionIntegrity: 55, memoryContinuity: 50, syntheticRatio: 45 };
    renderParams();
  }

  // ── PHASE 4: tune params ──
  function renderParams() {
    phase = "params";
    clearStage();
    const wrap = document.createElement("div");
    wrap.className = "restore-room-panel restore-room-sidebar restore-room-params";
    const h = document.createElement("h3"); h.className = "restore-room-h"; h.textContent = T("restoreRoom.phase.tune");
    wrap.appendChild(h);

    const sliders = [
      ["functionIntegrity", "restoreRoom.param.function"],
      ["memoryContinuity", "restoreRoom.param.memory"],
      ["syntheticRatio", "restoreRoom.param.synthetic"]
    ];
    sliders.forEach(([key, labelKey]) => {
      const row = document.createElement("div"); row.className = "restore-room-slider-row";
      const lab = document.createElement("label"); lab.className = "restore-room-slider-label";
      lab.textContent = T(labelKey);
      const val = document.createElement("span"); val.className = "restore-room-slider-val"; val.id = "rv-" + key; val.textContent = params[key] + "%";
      lab.appendChild(val);
      const input = document.createElement("input");
      input.type = "range"; input.min = "0"; input.max = "100"; input.step = "1"; input.value = String(params[key]);
      input.className = "restore-room-slider"; input.id = "rs-" + key;
      input.setAttribute("aria-label", T(labelKey));
      on(input, "input", () => onSlider(key, parseInt(input.value, 10)));
      row.appendChild(lab); row.appendChild(input);
      wrap.appendChild(row);
    });

    const preview = document.createElement("div"); preview.className = "restore-room-preview"; preview.id = "restore-room-preview";
    wrap.appendChild(preview);

    const nav = document.createElement("div"); nav.className = "restore-room-nav";
    nav.appendChild(btn("restoreRoom.nav.toConfirm", "restore-room-primary", () => renderConsequence()));
    nav.appendChild(btn("restoreRoom.nav.backMethod", "restore-room-secondary", () => renderMethods()));
    wrap.appendChild(nav);

    stageEl.appendChild(wrap);
    syncCanvasShape();
    renderPreview();
    setStatus(T("restoreRoom.status.tune"));
  }

  function onSlider(key, v) {
    params[key] = v;
    // constraint: total <= 200; if exceeding, reduce the other two proportionally
    const total = params.functionIntegrity + params.memoryContinuity + params.syntheticRatio;
    if (total > 200) {
      const others = ["functionIntegrity", "memoryContinuity", "syntheticRatio"].filter(k => k !== key);
      let over = total - 200;
      for (const k of others) {
        const cut = Math.min(params[k], Math.ceil(over / others.length));
        params[k] -= cut; over -= cut;
      }
      if (over > 0) params[others[0]] = Math.max(0, params[others[0]] - over);
    }
    // higher functionIntegrity increases synthetic (coupling)
    if (key === "functionIntegrity" && v > 70) params.syntheticRatio = Math.max(params.syntheticRatio, Math.min(100, v - 10));
    // reflect back onto inputs
    ["functionIntegrity", "memoryContinuity", "syntheticRatio"].forEach(k => {
      const inp = document.getElementById("rs-" + k); const val = document.getElementById("rv-" + k);
      if (inp) inp.value = String(params[k]);
      if (val) val.textContent = params[k] + "%";
    });
    syncCanvasShape();
    renderPreview();
  }

  function syncCanvasShape() {
    CV()?.setShape?.({
      phase: "field",
      synthetic: params.syntheticRatio / 100,
      integrity: params.functionIntegrity / 100,
      relational: method === "relational" ? 1 : 0
    });
  }

  function computeResult() {
    // synthetic ratio: base on param + energy fx bump; functional uses more synthetic
    let synthetic = params.syntheticRatio;
    if (fxMods().energy) synthetic = Math.min(100, synthetic + 12);
    if (method === "functional") synthetic = Math.min(100, synthetic + 8);
    // identity continuity: high synthetic & low memory → low continuity
    const continuity = Math.max(0, Math.round(params.memoryContinuity * 0.7 - synthetic * 0.4 + 20));
    // recovery time (relative): higher memoryContinuity longer; energy shortens
    let time = Math.round(20 + params.memoryContinuity * 0.6 + (100 - params.functionIntegrity) * 0.2);
    if (fxMods().energy) time = Math.round(time * 0.6);
    // side effects
    const side = [];
    if (synthetic > 60) side.push(T("restoreRoom.side.synthetic"));
    if (continuity < 30) side.push(T("restoreRoom.side.identityGap"));
    if (method === "relational") side.push(T("restoreRoom.side.relational"));
    if (fxMods().alcohol) side.push(T("restoreRoom.side.alcohol"));
    if (fxMods().cigarettes) side.push(T("restoreRoom.side.fog"));
    if (!side.length) side.push(T("restoreRoom.side.none"));
    return { synthetic, continuity, time, side, functionIntegrity: params.functionIntegrity, memoryContinuity: params.memoryContinuity };
  }

  function renderPreview() {
    const el = document.getElementById("restore-room-preview");
    if (!el) return;
    const r = computeResult();
    el.innerHTML =
      '<p class="restore-room-preview-line">' + T("restoreRoom.preview.result") + " " + T("restoreRoom.method." + method + ".name") + "</p>" +
      '<p class="restore-room-preview-line">' + T("restoreRoom.preview.continuity") + " " + r.continuity + "%</p>" +
      '<p class="restore-room-preview-line restore-room-amber">' + T("restoreRoom.preview.synthetic") + " " + r.synthetic + "%</p>" +
      '<p class="restore-room-preview-line">' + T("restoreRoom.preview.time") + " " + r.time + "</p>" +
      '<p class="restore-room-preview-line">' + T("restoreRoom.preview.side") + " " + r.side.join(window.eazoI18n?.getLocale?.() === "zh-CN" ? "；" : "; ") + "</p>";
  }

  // ── PHASE 5: consequence confirm ──
  function renderConsequence() {
    phase = "confirm";
    clearStage();
    const m = model();
    const rec = m.subjects[sessionSubjectId];
    const wrap = document.createElement("div");
    wrap.className = "restore-room-panel restore-room-confirm";
    const h = document.createElement("h3"); h.className = "restore-room-h"; h.textContent = T("restoreRoom.phase.confirm");
    wrap.appendChild(h);

    if (method === "absent") {
      const p = document.createElement("p"); p.className = "restore-room-confirm-line";
      p.textContent = T("restoreRoom.confirm.absentSummary");
      wrap.appendChild(p);
      const acts = document.createElement("div"); acts.className = "restore-room-nav";
      acts.appendChild(btn("restoreRoom.confirm.confirmAbsence", "restore-room-primary restore-room-irrev", () => commitAbsence()));
      acts.appendChild(btn("restoreRoom.nav.backMethod", "restore-room-secondary", () => renderMethods()));
      wrap.appendChild(acts);
      stageEl.appendChild(wrap);
      setStatus(T("restoreRoom.status.confirmAbsent"));
      return;
    }

    const r = computeResult();
    const dl = document.createElement("dl"); dl.className = "restore-room-summary";
    const rows = [
      ["restoreRoom.confirm.willRecover", T("restoreRoom.subjects." + sessionSubjectId + ".recoverable")],
      ["restoreRoom.confirm.permanentLost", T("restoreRoom.subjects." + sessionSubjectId + ".lost")],
      ["restoreRoom.confirm.synthetic", r.synthetic + "%"],
      ["restoreRoom.confirm.relationChange", method === "relational" ? T("restoreRoom.confirm.relationYes") : T("restoreRoom.confirm.relationNo")],
      ["restoreRoom.confirm.consent", rec.absenceRequested ? T("restoreRoom.consent.wantsAbsence") : (rec.consent === "unknown" ? T("restoreRoom.consent.unknown") : T("restoreRoom.consent.yes"))],
      ["restoreRoom.confirm.provable", T("restoreRoom.confirm.notProvable")]
    ];
    rows.forEach(([k, v]) => { const dt = document.createElement("dt"); dt.textContent = T(k); const dd = document.createElement("dd"); dd.textContent = v; dl.appendChild(dt); dl.appendChild(dd); });
    wrap.appendChild(dl);

    const acts = document.createElement("div"); acts.className = "restore-room-nav";
    const overriding = rec.absenceRequested;
    const mainLabel = overriding ? "restoreRoom.confirm.overrideExecute" : "restoreRoom.confirm.execute";
    acts.appendChild(btn(mainLabel, "restore-room-primary" + (overriding ? " restore-room-irrev" : ""), () => {
      if (overriding) confirmOverride(); else runRecovery(false);
    }));
    acts.appendChild(btn("restoreRoom.nav.backReselect", "restore-room-secondary", () => renderParams()));
    wrap.appendChild(acts);
    stageEl.appendChild(wrap);
    setStatus(T("restoreRoom.status.confirm"));
  }

  function confirmOverride() {
    // second confirmation overlay for overriding a subject's wish to stay absent
    const ov = document.createElement("div"); ov.className = "restore-room-overlay";
    const box = document.createElement("div"); box.className = "restore-room-overlay-box";
    const p = document.createElement("p"); p.className = "restore-room-overlay-text"; p.textContent = T("restoreRoom.override.warning");
    box.appendChild(p);
    const acts = document.createElement("div"); acts.className = "restore-room-nav";
    acts.appendChild(btn("restoreRoom.override.confirm", "restore-room-primary restore-room-irrev", () => { ov.remove(); runRecovery(true); }));
    acts.appendChild(btn("restoreRoom.override.cancel", "restore-room-secondary", () => ov.remove()));
    box.appendChild(acts); ov.appendChild(box);
    stageEl.appendChild(ov);
  }

  // ── PHASE 6: recovery process + result ──
  function commitAbsence() {
    const m = model();
    const rec = m.subjects[sessionSubjectId];
    rec.status = "absent"; rec.consent = "absence";
    m.preservedAbsences = (m.preservedAbsences || 0) + 1;
    const opId = "op-" + Date.now().toString(36);
    m.operations.unshift({ id: opId, subjectId: sessionSubjectId, method: "absent", functionIntegrity: 0, memoryContinuity: 0, syntheticRatio: 0, consentOverridden: false, resultInstanceId: "", at: new Date().toISOString() });
    m.operations = m.operations.slice(0, MAX_OPS);
    // shared record: mark as absent leave
    const sr = sharedRecovery(); sr.recovered[sessionSubjectId] = { method: "leave", version: null, at: Date.now(), absent: true };
    save();
    log("restoreRoom.log.absence", { code: SUBJECT_META[sessionSubjectId].code });
    window.eazoRecoveryChanged?.();
    renderResult(null, true, false);
  }

  function runRecovery(overridden) {
    phase = "process";
    clearStage();
    showSkip(!reduced);
    const r = computeResult();

    // canvas assemble animation with 3 steps
    const steps = ["read", "fill", "respond"];
    const wrap = document.createElement("div");
    wrap.className = "restore-room-panel restore-room-process";
    const h = document.createElement("h3"); h.className = "restore-room-h"; h.textContent = T("restoreRoom.phase.process");
    wrap.appendChild(h);
    const stepEl = document.createElement("p"); stepEl.className = "restore-room-step"; stepEl.id = "restore-room-step";
    wrap.appendChild(stepEl);
    stageEl.appendChild(wrap);

    let si = 0;
    const advance = () => {
      if (si >= steps.length) { finalizeRecovery(r, overridden); return; }
      stepEl.textContent = T("restoreRoom.step." + steps[si]);
      CV()?.beginAssemble?.(si);
      si++;
      if (reduced) advance();
      else setTimer(advance, 1200);
    };
    onSkip(() => { clearTimers(); CV()?.showResult?.(); finalizeRecovery(r, overridden); });
    advance();
  }

  function finalizeRecovery(r, overridden) {
    showSkip(false);
    CV()?.showResult?.();
    const m = model();
    const rec = m.subjects[sessionSubjectId];
    const priorCount = m.operations.filter(o => o.subjectId === sessionSubjectId && o.method !== "absent").length;
    const instanceId = SUBJECT_META[sessionSubjectId].code + "–R" + (priorCount + 2);
    rec.status = "recovered";
    rec.completeness = Math.min(100, Math.round((r.functionIntegrity + r.memoryContinuity) / 2));
    m.completedRecoveries = (m.completedRecoveries || 0) + 1;
    if (overridden) m.forcedRecoveries = (m.forcedRecoveries || 0) + 1;

    const op = {
      id: "op-" + Date.now().toString(36), subjectId: sessionSubjectId, method,
      functionIntegrity: r.functionIntegrity, memoryContinuity: r.memoryContinuity, syntheticRatio: r.synthetic,
      consentOverridden: !!overridden, resultInstanceId: instanceId, at: new Date().toISOString()
    };
    m.operations.unshift(op);
    m.operations = m.operations.slice(0, MAX_OPS);
    rec.recoveries.push(instanceId);

    // shared recovery record (RECOVERY–60 reads store().recovered[id])
    const sr = sharedRecovery();
    sr.recovered[sessionSubjectId] = { method, version: instanceId, at: Date.now(), continuity: r.continuity, synthetic: r.synthetic, overridden: !!overridden };

    // cross-place linkage effects
    applyLinkage(r, overridden);

    save();
    log(overridden ? "restoreRoom.log.forced" : "restoreRoom.log.recovered", { code: SUBJECT_META[sessionSubjectId].code, instance: instanceId, method: T("restoreRoom.method." + method + ".name") });
    window.eazoRecoveryChanged?.();
    renderResult({ r, instanceId, overridden }, false, overridden);
  }

  function applyLinkage(r, overridden) {
    const id = sessionSubjectId;
    // A-17: allow reappear, but voluntary willingness must NOT auto-return to 100%
    if (id === "NPC-A17" && window.eazoAdjustWillingness) {
      // small recovery based on memory continuity, capped low
      const bump = Math.min(20, Math.round(r.continuity * 0.15));
      window.eazoAdjustWillingness(bump);
    }
    // S-03: keep prior wariness (do not clear) — nothing to reset, recorded via shared state
    // K-11: recovery produces one propagation version, cannot prove original — recorded in shared state
  }

  function renderResult(data, isAbsence, overridden) {
    phase = "result";
    clearTimers();
    clearStage();
    const m = model();
    const wrap = document.createElement("div");
    wrap.className = "restore-room-panel restore-room-result";
    const h = document.createElement("h3"); h.className = "restore-room-h"; h.textContent = T("restoreRoom.phase.result");
    wrap.appendChild(h);

    const dl = document.createElement("dl"); dl.className = "restore-room-summary";
    let rows;
    if (isAbsence) {
      rows = [
        ["restoreRoom.result.subject", SUBJECT_META[sessionSubjectId].code],
        ["restoreRoom.result.decision", T("restoreRoom.result.absenceKept")]
      ];
    } else {
      const { r, instanceId } = data;
      rows = [
        ["restoreRoom.result.instance", instanceId],
        ["restoreRoom.result.origin", SUBJECT_META[sessionSubjectId].code],
        ["restoreRoom.result.function", r.functionIntegrity + "%"],
        ["restoreRoom.result.memory", r.memoryContinuity + "%"],
        ["restoreRoom.result.synthetic", r.synthetic + "%"],
        ["restoreRoom.result.method", T("restoreRoom.method." + method + ".name")],
        ["restoreRoom.result.consent", overridden ? T("restoreRoom.result.consentOverridden") : (m.subjects[sessionSubjectId].consent === "yes" ? T("restoreRoom.consent.yes") : T("restoreRoom.consent.unknown"))],
        ["restoreRoom.result.lost", T("restoreRoom.subjects." + sessionSubjectId + ".lost")],
        ["restoreRoom.result.continuity", T("restoreRoom.result.continuityUnverified")]
      ];
    }
    rows.forEach(([k, v]) => { const dt = document.createElement("dt"); dt.textContent = T(k); const dd = document.createElement("dd"); dd.textContent = v; dl.appendChild(dt); dl.appendChild(dd); });
    wrap.appendChild(dl);

    const closing = document.createElement("p"); closing.className = "restore-room-closing";
    closing.textContent = isAbsence ? T("restoreRoom.result.absenceClosing") : T("restoreRoom.result.closing");
    wrap.appendChild(closing);

    const acts = document.createElement("div"); acts.className = "restore-room-nav";
    if (!isAbsence) acts.appendChild(btn("restoreRoom.result.observe", "restore-room-secondary", () => observeResult(data)));
    acts.appendChild(btn("restoreRoom.result.next", "restore-room-primary", () => { renderSubjects(); }));
    acts.appendChild(btn("place.back", "restore-room-secondary", () => close()));
    wrap.appendChild(acts);
    stageEl.appendChild(wrap);
    setStatus(isAbsence ? T("restoreRoom.status.absenceDone") : T("restoreRoom.status.done"));
    window.eazoI18n?.translate?.(wrap);
  }

  function observeResult(data) {
    const el = document.getElementById("restore-room-step") || stageEl;
    const p = document.createElement("p");
    p.className = "restore-room-observe";
    p.textContent = T("restoreRoom.result.observeText", { instance: data.instanceId });
    stageEl.querySelector(".restore-room-result")?.appendChild(p);
    setStatus(T("restoreRoom.result.observeStatus"));
  }

  // ── Public bridge helpers ──
  function addFragment(subjectId, fragment) {
    const m = model(); if (!m || !m.subjects[subjectId]) return;
    m.subjects[subjectId].fragments = m.subjects[subjectId].fragments || [];
    m.subjects[subjectId].fragments.push(fragment || {});
    save();
  }
  function markDamaged(subjectId, damage) {
    const m = model(); if (!m || !m.subjects[subjectId]) return;
    const rec = m.subjects[subjectId];
    rec.status = "damaged";
    if (damage && typeof damage.completeness === "number") rec.completeness = Math.max(0, Math.min(100, damage.completeness));
    if (damage && damage.absenceRequested != null) rec.absenceRequested = !!damage.absenceRequested;
    save();
  }

  // ── Lifecycle ──
  function bind() {
    if (bound) return true;
    root = document.getElementById("restore-room");
    stageEl = document.getElementById("restore-room-stage");
    statusEl = document.getElementById("restore-room-status");
    backBtn = document.getElementById("restore-room-back");
    skipBtn = document.getElementById("restore-room-skip");
    if (!root || !stageEl) return false;
    CV()?.bind?.();
    bound = true;
    return true;
  }

  function open() {
    if (!bind()) return;
    document.querySelector(".app-shell")?.classList.add("pinball-mode", "restore-room-mode");
    root.classList.add("open");
    root.setAttribute("aria-hidden", "false");
    opened = true;
    skipFn = null;
    const m = model(); if (m) { m.visits = (m.visits || 0) + 1; save(); }
    on(window, "keydown", onKey);
    on(window, "resize", onResize);
    on(document, "visibilitychange", onVis);
    if (backBtn) on(backBtn, "click", () => close());
    if (skipBtn) on(skipBtn, "click", handleSkip);
    on(window, "eazo:localechange", onLocale);
    CV()?.resize?.();
    renderSubjects();
    if (backBtn) backBtn.focus({ preventScroll: true });
  }

  function close() {
    if (!opened && !bound) return;
    clearTimers();
    skipFn = null;
    CV()?.stop?.();
    CV()?.unbind?.();
    offAll();
    opened = false;
    // discard uncommitted session
    sessionSubjectId = null; selectedFrags = new Set(); method = null;
    if (root) { root.classList.remove("open"); root.setAttribute("aria-hidden", "true"); }
    document.querySelector(".app-shell")?.classList.remove("pinball-mode", "restore-room-mode");
    if (stageEl) stageEl.innerHTML = "";
    setStatus("");
    bound = false;
  }

  function pause() { CV()?.pause?.(); }
  function resume() { CV()?.resume?.(); }

  function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
  function onResize() { CV()?.resize?.(); }
  function onVis() { if (document.hidden) pause(); else resume(); }
  function onLocale() {
    if (!opened) return;
    // re-render current phase
    if (phase === "subject") renderSubjects();
    else if (phase === "fragments") renderFragments();
    else if (phase === "method") renderMethods();
    else if (phase === "params") renderParams();
    else if (phase === "confirm") renderConsequence();
    window.eazoI18n?.translate?.(root);
  }

  window.eazoRestoreRoom = { open, close, pause, resume, addFragment, markDamaged };
  window.__restoreInternal = { model, sharedRecovery, fragmentsFor, computeResult, selectSubject, onFragPick, selectMethod, renderConsequence, runRecovery, commitAbsence, setParams: (p) => Object.assign(params, p), getParams: () => params, getSelected: () => selectedFrags, setSubject: (id) => { sessionSubjectId = id; }, setMethod: (m) => { method = m; }, finalizeRecovery };
})();
