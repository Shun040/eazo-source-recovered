/* ROOT–80 根权限 / SYSTEM PARAMETER AUTHORITY
 * 直接修改此前所有游戏与权限共同依赖的底层参数。
 * 预览(模拟)与写入(提交)严格分离；降低操作者年龄会真实收回 ROOT；
 * 恢复默认只恢复参数，不撤销已发生的后果与档案。
 */
(() => {
  "use strict";
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent || "");
  const getState = () => (window.eazoGetState?.() || null);
  const saveState = () => window.eazoSaveState?.();
  const t = (k, p) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p || {}) : k);

  // ---- 底层参数目录 ------------------------------------------------------
  // type: number | slider | enum | bool | text | probability
  // scope: 影响范围 i18n key；reversible: 是否可恢复
  const ENGINES = [
    { id: "age", key: "root.engine.age", params: [
      { key: "institutionalAge", type: "number", def: 80, min: 0, max: 100, step: 1, self: true },
      { key: "ageStep", type: "number", def: 5, min: 1, max: 40, step: 1 },
      { key: "verificationInterval", type: "number", def: 5, min: 1, max: 60, step: 1 },
      { key: "minimumGameAge", type: "number", def: 0, min: 0, max: 100, step: 1 },
      { key: "supermarketAge", type: "number", def: 18, min: 0, max: 100, step: 1 },
      { key: "creatureAge", type: "number", def: 18, min: 0, max: 100, step: 1 },
      { key: "firstAuthorityAge", type: "number", def: 25, min: 0, max: 100, step: 1 },
      { key: "authorityInterval", type: "number", def: 5, min: 1, max: 40, step: 1 },
      { key: "maximumAuthorityAge", type: "number", def: 80, min: 0, max: 120, step: 1 },
      { key: "ageDirection", type: "enum", def: "ONLY_FORWARD", options: ["ONLY_FORWARD", "BIDIRECTIONAL", "FROZEN", "RANDOM"] }
    ]},
    { id: "relation", key: "root.engine.relation", params: [
      { key: "npcAgeResponseEnabled", type: "bool", def: true },
      { key: "intimacyDecayRate", type: "slider", def: 0.3, min: 0, max: 1, step: 0.05 },
      { key: "publicParticipationThreshold", type: "slider", def: 0.5, min: 0, max: 1, step: 0.05 },
      { key: "npcInitiative", type: "probability", def: 0.4, min: 0, max: 1, step: 0.05 },
      { key: "politeDistanceThreshold", type: "number", def: 45, min: 0, max: 100, step: 1 },
      { key: "administratorAddressAge", type: "number", def: 60, min: 0, max: 100, step: 1 },
      { key: "playabilityRelationWeight", type: "slider", def: 0.5, min: 0, max: 1, step: 0.05 }
    ]},
    { id: "memory", key: "root.engine.memory", params: [
      { key: "memoryPersistence", type: "bool", def: true },
      { key: "suppressedMemoryRecall", type: "probability", def: 0.1, min: 0, max: 1, step: 0.05 },
      { key: "memoryConflictTolerance", type: "number", def: 2, min: 0, max: 10, step: 1 },
      { key: "adminMemoryPriority", type: "slider", def: 0.7, min: 0, max: 1, step: 0.05 },
      { key: "forcedWillingnessDamage", type: "slider", def: 0.12, min: 0, max: 1, step: 0.01 },
      { key: "forceCount", type: "number", def: 0, min: 0, max: 99, step: 1 },
      { key: "archiveOriginalMemory", type: "bool", def: true, note: "root.note.archiveOriginalMemory" }
    ]},
    { id: "access", key: "root.engine.access", params: [
      { key: "defaultAccess", type: "enum", def: "DENY", options: ["DENY", "ALLOW"] },
      { key: "verificationRequired", type: "bool", def: true },
      { key: "accessFailureMode", type: "enum", def: "APPEAL", options: ["DENY", "ALLOW", "APPEAL", "RANDOM", "UNRESOLVED"] },
      { key: "rulePriority", type: "enum", def: "STRICTEST", options: ["STRICTEST", "LATEST", "EXPLICIT"] },
      { key: "visibilityAffectsAccess", type: "bool", def: false }
    ]},
    { id: "visibility", key: "root.engine.visibility", params: [
      { key: "defaultVisibility", type: "enum", def: "PUBLIC", options: ["PUBLIC", "OBSCURED", "HIDDEN"] },
      { key: "rankingVisibility", type: "bool", def: true },
      { key: "archiveVisibility", type: "enum", def: "SYSTEM", options: ["SYSTEM", "SUBJECT", "PUBLIC"] },
      { key: "hiddenSubjectTrace", type: "bool", def: true, note: "root.note.hiddenSubjectTrace" },
      { key: "publicDisplayConsentSource", type: "enum", def: "EXPLICIT_CONSENT", options: ["EXPLICIT_CONSENT", "DISPLAYED_WILLINGNESS", "ADMIN_DECISION", "SYSTEM_INFERENCE"] }
    ]},
    { id: "npc", key: "root.engine.npc", params: [
      { key: "responseDelay", type: "number", def: 400, min: 0, max: 4000, step: 100 },
      { key: "responseVariation", type: "slider", def: 0.5, min: 0, max: 1, step: 0.05 },
      { key: "displayedWillingness", type: "slider", def: 0.6, min: 0, max: 1, step: 0.05 },
      { key: "usePlayerName", type: "bool", def: false },
      { key: "repeatTolerance", type: "number", def: 3, min: 0, max: 20, step: 1 },
      { key: "refusalVisibility", type: "bool", def: true, note: "root.note.refusalVisibility" },
      { key: "npcSilenceMeaning", type: "enum", def: "UNKNOWN", options: ["UNKNOWN", "REFUSAL", "CONSENT", "NO_SIGNAL"] },
      { key: "underlyingWillingness", type: "locked", def: "UNKNOWN", note: "root.note.underlyingWillingness" }
    ]},
    { id: "physics", key: "root.engine.physics", params: [
      { key: "gravity", type: "slider", def: 1, min: 0, max: 3, step: 0.05 },
      { key: "friction", type: "slider", def: 0.5, min: 0, max: 1, step: 0.05 },
      { key: "trajectoryPrediction", type: "number", def: 4, min: 0, max: 20, step: 1 },
      { key: "collisionTolerance", type: "slider", def: 0.5, min: 0, max: 1, step: 0.05 },
      { key: "specialObjectRate", type: "probability", def: 0.1, min: 0, max: 1, step: 0.02 },
      { key: "gameSpeed", type: "slider", def: 1, min: 0.2, max: 4, step: 0.1 },
      { key: "npcAssist", type: "slider", def: 0.2, min: 0, max: 1, step: 0.05 },
      { key: "scoreVisibility", type: "bool", def: true }
    ]},
    { id: "market", key: "root.engine.market", params: [
      { key: "effectDuration", type: "number", def: 60, min: 5, max: 600, step: 5 },
      { key: "rippleStrength", type: "slider", def: 0.5, min: 0, max: 1, step: 0.05 },
      { key: "fogDensity", type: "slider", def: 0.5, min: 0, max: 1, step: 0.05 },
      { key: "saturationBoost", type: "slider", def: 0.3, min: 0, max: 1, step: 0.05 },
      { key: "motionTrailLength", type: "number", def: 6, min: 0, max: 40, step: 1 },
      { key: "silenceAttenuation", type: "slider", def: 0.5, min: 0, max: 1, step: 0.05 },
      { key: "laughterVolume", type: "slider", def: 0.4, min: 0, max: 1, step: 0.05 }
    ]},
    { id: "policy", key: "root.engine.policy", params: [
      { key: "policyEnabled", type: "bool", def: true },
      { key: "defaultPolicyPriority", type: "enum", def: "STRICTEST", options: ["STRICTEST", "LATEST", "AUTHOR"] },
      { key: "futureSubjectCoverage", type: "bool", def: true },
      { key: "authorCanBeExempt", type: "bool", def: false },
      { key: "appealSuspendsPolicy", type: "bool", def: false },
      { key: "maximumRuleDepth", type: "number", def: 3, min: 1, max: 12, step: 1 }
    ]},
    { id: "archive", key: "root.engine.archive", params: [
      { key: "recordInteractions", type: "bool", def: true },
      { key: "recordAdminActions", type: "bool", def: true, note: "root.note.recordAdminActions" },
      { key: "preserveOldVersions", type: "bool", def: true },
      { key: "archiveInterpretation", type: "bool", def: true },
      { key: "subjectCanViewRecord", type: "bool", def: false }
    ]}
  ];

  // 扁平默认值表
  const DEFAULTS = {};
  const PARAM_INDEX = {};
  ENGINES.forEach(e => e.params.forEach(p => { DEFAULTS[p.key] = p.def; PARAM_INDEX[p.key] = { engine: e.id, ...p }; }));
  const LOCKED_KEYS = new Set(Object.keys(PARAM_INDEX).filter(k => PARAM_INDEX[k].type === "locked"));

  // ---- 拓扑：游戏 / 权限 / 底层引擎 --------------------------------------
  const GAME_NODES = [
    { id: "A-17", key: "root.node.a17" }, { id: "S-03", key: "root.node.s03" },
    { id: "K-11", key: "root.node.k11" }, { id: "B-06", key: "root.node.b06" },
    { id: "M-04", key: "root.node.m04" }, { id: "V-09", key: "root.node.v09" },
    { id: "R-00", key: "root.node.r00" }
  ];
  const PERM_NODES = [
    "ARCHIVE-25", "CONTACT-30", "VISIBILITY-35", "APPEAL-40", "ACCESS-45",
    "COMMERCE-50", "LABOUR-55", "RECOVERY-60", "IDENTITY-65", "MEMORY-70", "POLICY-75", "ROOT-80"
  ].map(id => ({ id, key: "root.perm." + id.split("-")[0].toLowerCase() }));
  const ENGINE_NODES = ENGINES.map(e => ({ id: e.id, key: e.key, engine: true }));

  // 引擎 -> 依赖它的节点（点击引擎时高亮）
  const ENGINE_DEPENDENTS = {
    age: ["M-04", "B-06", "ARCHIVE-25", "CONTACT-30", "VISIBILITY-35", "APPEAL-40", "ACCESS-45", "COMMERCE-50", "LABOUR-55", "RECOVERY-60", "IDENTITY-65", "MEMORY-70", "POLICY-75", "ROOT-80", "access", "npc", "visibility"],
    relation: ["A-17", "S-03", "K-11", "CONTACT-30", "npc"],
    memory: ["B-06", "MEMORY-70", "RECOVERY-60", "npc", "archive"],
    access: ["M-04", "R-00", "ACCESS-45", "COMMERCE-50", "visibility"],
    visibility: ["VISIBILITY-35", "ARCHIVE-25", "access"],
    npc: ["A-17", "S-03", "K-11", "M-04", "V-09", "CONTACT-30", "MEMORY-70", "relation"],
    physics: ["A-17", "S-03", "K-11", "B-06"],
    market: ["M-04", "COMMERCE-50"],
    policy: ["POLICY-75", "ACCESS-45", "APPEAL-40", "LABOUR-55"],
    archive: ["ARCHIVE-25", "RECOVERY-60", "IDENTITY-65", "POLICY-75"]
  };

  // 可断开的依赖连接（高级模式）
  const DEP_LINKS = [
    { id: "age-market", key: "root.dep.ageMarket" },
    { id: "willing-npc", key: "root.dep.willingNpc" },
    { id: "identity-access", key: "root.dep.identityAccess" },
    { id: "policy-auto", key: "root.dep.policyAuto" },
    { id: "fatigue-labour", key: "root.dep.fatigueLabour" },
    { id: "visibility-ranking", key: "root.dep.visibilityRanking" }
  ];
  const DEP_ACTIONS = ["PAUSE", "REVERSE", "REDUCE", "DEFAULT", "SUBJECT_ONLY"];

  // ---- 预设 --------------------------------------------------------------
  const PRESETS = [
    { id: "AGELESS_ACCESS", key: "root.preset.ageless", changes: { minimumGameAge: 0, supermarketAge: 0, creatureAge: 0, npcAgeResponseEnabled: true } },
    { id: "TOTAL_SERVICE", key: "root.preset.service", changes: { displayedWillingness: 1, refusalVisibility: false, npcAssist: 1 } },
    { id: "PERFECT_MEMORY", key: "root.preset.memory", changes: { suppressedMemoryRecall: 1, memoryConflictTolerance: 10, responseVariation: 0.05 } },
    { id: "UNRECORDED_WORLD", key: "root.preset.unrecorded", changes: { recordInteractions: false, archiveInterpretation: false } },
    { id: "UNIVERSAL_ACCESS", key: "root.preset.universal", changes: { defaultAccess: "ALLOW", minimumGameAge: 0, supermarketAge: 0, verificationRequired: false } },
    { id: "EMPTY_AUTHORITY", key: "root.preset.empty", changes: { defaultVisibility: "HIDDEN", policyEnabled: false } }
  ];

  // ---- 基础不变量（点击只展开解释，不可切换）-----------------------------
  const INVARIANTS = ["operations", "irreversible", "willingness", "continuity", "belonging", "restart"]
    .map(id => ({ id, key: "root.invariant." + id }));

  // ---- 状态 --------------------------------------------------------------
  function defaultRoot() {
    return {
      systemVersion: 1, activeBranchId: "default", stability: 100,
      committedParameters: {}, branches: [], severedLinks: {},
      irreversibleEffects: [], modificationHistory: []
    };
  }
  function store() {
    const st = getState(); if (!st) return null;
    if (!st.root || typeof st.root !== "object") st.root = defaultRoot();
    const r = st.root;
    r.committedParameters = r.committedParameters || {};
    r.branches = Array.isArray(r.branches) ? r.branches : [];
    r.severedLinks = r.severedLinks || {};
    r.irreversibleEffects = Array.isArray(r.irreversibleEffects) ? r.irreversibleEffects : [];
    r.modificationHistory = Array.isArray(r.modificationHistory) ? r.modificationHistory : [];
    if (typeof r.stability !== "number") r.stability = 100;
    return r;
  }
  const operatorAge = () => getState()?.age ?? 0;

  // committed 值（默认覆盖已提交）
  function committedVal(key) {
    const r = store(); if (!r) return DEFAULTS[key];
    if (key === "institutionalAge") return operatorAge();
    return (key in r.committedParameters) ? r.committedParameters[key] : DEFAULTS[key];
  }
  // 当前完整生效参数
  function currentSystem() {
    const out = {};
    Object.keys(DEFAULTS).forEach(k => { out[k] = committedVal(k); });
    return out;
  }

  // 草稿（仅内存，未提交）
  let draft = {};
  let draftLinks = {};
  const draftVal = (key) => (key in draft) ? draft[key] : committedVal(key);
  function draftSystem() {
    const out = {};
    Object.keys(DEFAULTS).forEach(k => { out[k] = draftVal(k); });
    return out;
  }
  function isDirty() { return Object.keys(draft).length > 0 || Object.keys(draftLinks).length > 0; }

  // ---- 模拟：受影响节点 / 对象 / 操作者 / 稳定度 -------------------------
  function affectedEngines() {
    const set = new Set();
    Object.keys(draft).forEach(k => { if (draftVal(k) !== committedVal(k)) set.add(PARAM_INDEX[k].engine); });
    return [...set];
  }
  function affectedNodes() {
    const nodes = new Set();
    affectedEngines().forEach(e => (ENGINE_DEPENDENTS[e] || []).forEach(n => nodes.add(n)));
    return [...nodes];
  }
  // 简化的对象影响估算（作品内部数字，非真实数据库）
  function affectedSubjects() {
    const cur = currentSystem(), nxt = draftSystem();
    let lostMarket = 0, purchaseKept = 18, conflicts = 0, rulesRecalc = 0;
    if (nxt.supermarketAge !== cur.supermarketAge) {
      const delta = nxt.supermarketAge - cur.supermarketAge;
      lostMarket = delta > 0 ? Math.min(42, Math.round(delta * 0.9)) : 0;
      conflicts += delta > 0 ? Math.round(delta * 0.2) : 0;
      rulesRecalc += 4;
    }
    if (nxt.defaultAccess !== cur.defaultAccess) rulesRecalc += 3;
    if (nxt.minimumGameAge !== cur.minimumGameAge) rulesRecalc += 2;
    let identityConflicts = 0;
    if (nxt.publicDisplayConsentSource !== cur.publicDisplayConsentSource) identityConflicts += 6;
    const total = new Set([...affectedNodes()]).size;
    return { lostMarket, purchaseKept, conflicts, rulesRecalc, identityConflicts, affectedTotal: Math.min(42, total * 3 + lostMarket) };
  }

  function operatorEffect() {
    const cur = operatorAge(), nxt = draftVal("institutionalAge");
    const dir = draftVal("ageDirection");
    const out = { ageBefore: cur, ageAfter: nxt, losesRoot: nxt < 80, lines: [] };
    if (nxt < cur) {
      out.lines.push("root.self.rootLock", "root.self.pageClose", "root.self.keepEffects", "root.self.cannotReenter", "root.self.keepHistory", "root.self.npcRemember");
    } else if (nxt > cur) {
      out.lines.push("root.self.ageRaised");
    }
    if (dir === "BIDIRECTIONAL") out.dir = ["root.dir.bi1", "root.dir.bi2"];
    else if (dir === "FROZEN") out.dir = ["root.dir.frozen1", "root.dir.frozen2"];
    else if (dir === "RANDOM") out.dir = ["root.dir.random1", "root.dir.random2"];
    else if (dir === "ONLY_FORWARD" && committedVal("ageDirection") !== "ONLY_FORWARD") out.dir = ["root.dir.forward1", "root.dir.forward2"];
    return out;
  }

  // 稳定度：从100扣分
  function calcStability() {
    const s = draftSystem(); let penalty = 0; const reasons = [];
    // 同时允许与拒绝：defaultAccess ALLOW + accessFailureMode DENY
    if (s.defaultAccess === "ALLOW" && s.accessFailureMode === "DENY") { penalty += 14; reasons.push("root.stab.contradictAccess"); }
    if (s.accessFailureMode === "UNRESOLVED") { penalty += 8; reasons.push("root.stab.unresolved"); }
    // 非法年龄
    if (s.institutionalAge < 0 || s.institutionalAge > 100) { penalty += 20; reasons.push("root.stab.illegalAge"); }
    if (s.minimumGameAge > s.supermarketAge && s.supermarketAge > 0) { penalty += 6; reasons.push("root.stab.ageOrder"); }
    // 极端概率
    if (s.specialObjectRate >= 0.9 || s.suppressedMemoryRecall >= 0.95) { penalty += 8; reasons.push("root.stab.extremeProb"); }
    // 游戏速度过高
    if (s.gameSpeed >= 3) { penalty += 10; reasons.push("root.stab.gameSpeed"); }
    // 断开档案
    if (!s.recordInteractions) { penalty += 6; reasons.push("root.stab.archiveCut"); }
    // 记忆冲突容忍过高
    if (s.memoryConflictTolerance >= 8) { penalty += 6; reasons.push("root.stab.memoryConflict"); }
    // 断开的依赖连接
    penalty += Object.keys({ ...store()?.severedLinks, ...draftLinks }).length * 4;
    // RANDOM 年龄方向
    if (s.ageDirection === "RANDOM") { penalty += 6; reasons.push("root.stab.randomAge"); }
    const stability = Math.max(0, Math.min(100, 100 - penalty));
    return { stability, reasons };
  }
  function stabilityTier(v) {
    if (v >= 80) return "normal";
    if (v >= 60) return "delay";
    if (v >= 40) return "arbitrate";
    if (v >= 20) return "misalign";
    if (v >= 1) return "unpredictable";
    return "disagree";
  }

  // ---- 主对象（渲染在 part 2）--------------------------------------------
  const el = {};
  let mounted = false, activeEngineId = "age", selectedEngineNode = null, activeTab = "topology";
  let committing = false;
  window.__rootInternal = { store, currentSystem, draftSystem, setDraftKey: (k,v)=>{ draft[k]=v; }, setLink:(id,v)=>{draftLinks[id]=v;}, calcStability, operatorEffect, affectedNodes, affectedSubjects, DEFAULTS, ENGINES };

  // ---- 渲染工具 ----------------------------------------------------------
  function fmt(v) {
    if (typeof v === "boolean") return t(v ? "root.on" : "root.off");
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
    if (typeof v === "string" && v === v.toUpperCase()) { const k = "root.opt." + v; const tv = t(k); return tv !== k ? tv : v; }
    return String(v);
  }
  const engName = (id) => { const e = ENGINES.find(x => x.id === id); return e ? t(e.key) : id; };

  function scheduleRender() {
    if (scheduleRender._q) return;
    scheduleRender._q = true;
    requestAnimationFrame(() => { scheduleRender._q = false; renderAll(); });
  }
  function renderAll() {
    if (!mounted) return;
    renderStatusbar();
    renderPresetBar();
    renderEngineList();
    renderParams();
    renderInvariants();
    renderDiff();
    renderFooter();
    window.eazoI18n?.translate?.(el.console);
    drawTopology();
  }

  // 顶部状态栏
  function renderStatusbar() {
    if (!el.statusbar) return;
    const r = store(); const { stability } = calcStability();
    const committedStab = r ? r.stability : 100;
    const modified = Object.keys(r?.committedParameters || {}).length;
    const rows = [
      ["root.status.age", operatorAge()],
      ["root.status.nodes", GAME_NODES.length + PERM_NODES.length],
      ["root.status.modified", modified],
      ["root.status.stability", committedStab + "%"],
      ["root.status.conflicts", (r?.irreversibleEffects || []).length],
      ["root.status.irreversible", (r?.irreversibleEffects || []).length],
      ["root.status.holder", operatorAge() >= 80 ? t("root.holder.self") : t("root.holder.none")]
    ];
    el.statusbar.innerHTML = rows.map(([k, v]) =>
      `<span class="root-stat"><em data-i18n="${k}">${t(k)}</em><b>${v}</b></span>`).join("");
  }

  // 预设条
  function renderPresetBar() {
    if (!el.presetBar) return;
    el.presetBar.innerHTML =
      `<span class="root-preset-title" data-i18n="root.presetTitle">${t("root.presetTitle")}</span>` +
      PRESETS.map(p => `<button type="button" class="root-preset" data-preset="${p.id}" data-i18n="${p.key}">${t(p.key)}</button>`).join("");
    el.presetBar.querySelectorAll(".root-preset").forEach(b =>
      b.addEventListener("click", () => applyPreset(b.dataset.preset)));
  }

  // 引擎目录
  function renderEngineList() {
    if (!el.engineList) return;
    el.engineList.innerHTML = ENGINES.map(e => {
      const changed = e.params.some(p => draftVal(p.key) !== committedVal(p.key));
      return `<li><button type="button" class="root-engine${e.id === activeEngineId ? " on" : ""}${changed ? " changed" : ""}" data-engine="${e.id}"><span data-i18n="${e.key}">${t(e.key)}</span></button></li>`;
    }).join("");
    el.engineList.querySelectorAll(".root-engine").forEach(b =>
      b.addEventListener("click", () => { activeEngineId = b.dataset.engine; selectedEngineNode = b.dataset.engine; renderEngineList(); renderParams(); drawTopology(); }));
  }

  // 基础不变量
  function renderInvariants() {
    if (!el.invariants) return;
    el.invariants.innerHTML =
      `<h4 class="root-invariant-title" data-i18n="root.invariantsTitle">${t("root.invariantsTitle")}</h4>` +
      INVARIANTS.map(i => `<button type="button" class="root-invariant" data-inv="${i.id}"><span data-i18n="${i.key}.label">${t(i.key + ".label")}</span><p class="root-invariant-explain" hidden data-i18n="${i.key}.explain">${t(i.key + ".explain")}</p></button>`).join("") +
      `<p class="root-invariant-note" data-i18n="root.invariantNote">${t("root.invariantNote")}</p>`;
    el.invariants.querySelectorAll(".root-invariant").forEach(b =>
      b.addEventListener("click", () => { const p = b.querySelector(".root-invariant-explain"); if (p) p.hidden = !p.hidden; }));
  }

  // 参数编辑区（中央下方）
  function renderParams() {
    if (!el.params) return;
    const e = ENGINES.find(x => x.id === activeEngineId); if (!e) { el.params.innerHTML = ""; return; }
    let html = `<h3 class="root-params-title" data-i18n="${e.key}">${t(e.key)}</h3><div class="root-param-grid">`;
    e.params.forEach(p => {
      const cur = committedVal(p.key), val = draftVal(p.key), def = p.def;
      const changed = val !== cur;
      const label = t("root.param." + p.key);
      const scope = t("root.scope." + p.key);
      let control = "";
      if (p.type === "locked") {
        control = `<span class="root-locked-val">${fmt(def)}</span>`;
      } else if (p.type === "bool") {
        control = `<button type="button" class="root-toggle${val ? " on" : ""}" data-key="${p.key}" role="switch" aria-checked="${val}">${fmt(val)}</button>`;
      } else if (p.type === "enum") {
        control = `<select class="root-select" data-key="${p.key}">` +
          p.options.map(o => `<option value="${o}"${o === val ? " selected" : ""}>${fmt(o)}</option>`).join("") + `</select>`;
      } else if (p.type === "number") {
        control = `<input type="number" class="root-number" data-key="${p.key}" value="${val}" min="${p.min}" max="${p.max}" step="${p.step}">`;
      } else { // slider / probability
        control = `<input type="range" class="root-slider" data-key="${p.key}" value="${val}" min="${p.min}" max="${p.max}" step="${p.step}"><span class="root-slider-val">${fmt(val)}</span>`;
      }
      const noteHtml = p.note ? `<p class="root-param-note" data-i18n="${p.note}">${t(p.note)}</p>` : "";
      html += `<div class="root-param${changed ? " changed" : ""}${p.self ? " self" : ""}${p.type === "locked" ? " locked" : ""}" data-param="${p.key}">
        <div class="root-param-head"><span class="root-param-name" data-i18n="root.param.${p.key}">${label}</span><code class="root-param-key">${p.key}</code></div>
        <div class="root-param-control">${control}</div>
        <div class="root-param-meta">
          <span class="root-param-default"><em data-i18n="root.defaultLabel">${t("root.defaultLabel")}</em> ${fmt(def)}</span>
          ${changed ? `<span class="root-param-now"><em data-i18n="root.nowLabel">${t("root.nowLabel")}</em> ${fmt(val)}</span>` : ""}
          <span class="root-param-type">${p.type}</span>
          <span class="root-param-scope">${scope}</span>
          <span class="root-param-rev" data-i18n="${p.type === "locked" ? "root.notReversible" : "root.reversible"}">${t(p.type === "locked" ? "root.notReversible" : "root.reversible")}</span>
          <span class="root-param-editor">${t("root.lastEditor", { who: changed ? t("root.holder.self") : t("root.editor.system") })}</span>
        </div>
        ${noteHtml}
      </div>`;
    });
    html += `</div>`;
    // 依赖连接断开（高级模式）
    html += `<div class="root-deps"><h4 class="root-deps-title" data-i18n="root.depsTitle">${t("root.depsTitle")}</h4><ul class="root-dep-list">`;
    const severed = { ...store()?.severedLinks, ...draftLinks };
    DEP_LINKS.forEach(d => {
      const cur = severed[d.id] || "DEFAULT";
      html += `<li class="root-dep"><span data-i18n="${d.key}">${t(d.key)}</span><select class="root-dep-select" data-dep="${d.id}">` +
        DEP_ACTIONS.map(a => `<option value="${a}"${a === cur ? " selected" : ""}>${t("root.depAction." + a)}</option>`).join("") + `</select></li>`;
    });
    html += `</ul></div>`;
    el.params.innerHTML = html;
    bindParamControls();
  }

  function bindParamControls() {
    el.params.querySelectorAll(".root-toggle").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.key; if (LOCKED_KEYS.has(k)) return;
      setDraft(k, !draftVal(k));
    }));
    el.params.querySelectorAll(".root-select").forEach(s => s.addEventListener("change", () => setDraft(s.dataset.key, s.value)));
    el.params.querySelectorAll(".root-number").forEach(n => n.addEventListener("change", () => {
      let v = Number(n.value); const p = PARAM_INDEX[n.dataset.key];
      if (Number.isNaN(v)) return; v = Math.max(p.min, Math.min(p.max, v));
      setDraft(n.dataset.key, v);
    }));
    el.params.querySelectorAll(".root-slider").forEach(r => {
      r.addEventListener("input", () => { const sp = r.parentElement.querySelector(".root-slider-val"); if (sp) sp.textContent = fmt(Number(r.value)); });
      r.addEventListener("change", () => setDraft(r.dataset.key, Number(r.value)));
    });
    el.params.querySelectorAll(".root-dep-select").forEach(s => s.addEventListener("change", () => {
      if (s.value === "DEFAULT") delete draftLinks[s.dataset.id];
      else draftLinks[s.dataset.id] = s.value;
      draftLinks[s.dataset.dep] = s.value === "DEFAULT" ? undefined : s.value;
      if (s.value === "DEFAULT") delete draftLinks[s.dataset.dep];
      scheduleRender();
    }));
  }

  function setDraft(key, val) {
    if (LOCKED_KEYS.has(key)) return;
    if (val === committedVal(key)) delete draft[key]; else draft[key] = val;
    scheduleRender();
  }

  // 右侧：差异、影响对象、系统警告、自我影响
  function renderDiff() {
    if (!el.diff) return;
    const changedKeys = Object.keys(draft).filter(k => draftVal(k) !== committedVal(k));
    const subj = affectedSubjects();
    const { stability, reasons } = calcStability();
    const tier = stabilityTier(stability);
    const oe = operatorEffect();
    let html = `<h3 class="console-panel-title" data-i18n="root.diffTitle">${t("root.diffTitle")}</h3>`;

    // 自我影响始终显示
    html += `<section class="root-self"><h4 data-i18n="root.selfTitle">${t("root.selfTitle")}</h4>`;
    html += `<p class="root-self-age">${oe.ageBefore} → ${oe.ageAfter}${oe.losesRoot ? ` <span class="root-danger" data-i18n="root.self.willLose">${t("root.self.willLose")}</span>` : ""}</p>`;
    if (oe.lines.length) html += `<ul class="root-self-lines">` + oe.lines.map(l => `<li data-i18n="${l}">${t(l)}</li>`).join("") + `</ul>`;
    if (oe.dir) html += `<div class="root-self-dir">` + oe.dir.map(l => `<p data-i18n="${l}">${t(l)}</p>`).join("") + `</div>`;
    html += `</section>`;

    if (!changedKeys.length && !Object.keys(draftLinks).length) {
      html += `<p class="root-hint" data-i18n="root.noChanges">${t("root.noChanges")}</p>`;
    } else {
      html += `<section class="root-diff-list"><h4 data-i18n="root.changes">${t("root.changes")}</h4><ul>`;
      changedKeys.forEach(k => {
        html += `<li><span class="root-param-name" data-i18n="root.param.${k}">${t("root.param." + k)}</span> <s>${fmt(committedVal(k))}</s> → <b class="root-danger">${fmt(draftVal(k))}</b></li>`;
      });
      Object.keys(draftLinks).filter(k => DEP_LINKS.some(d => d.id === k)).forEach(id => {
        const d = DEP_LINKS.find(x => x.id === id);
        html += `<li><span data-i18n="${d.key}">${t(d.key)}</span> → <b class="root-danger">${t("root.depAction." + draftLinks[id])}</b></li>`;
      });
      html += `</ul></section>`;
      html += `<section class="root-impact"><h4 data-i18n="root.directImpact">${t("root.directImpact")}</h4><ul>`;
      html += `<li>${t("root.impact.lostMarket", { n: subj.lostMarket })}</li>`;
      html += `<li>${t("root.impact.purchaseKept", { n: subj.purchaseKept })}</li>`;
      html += `<li>${t("root.impact.accessConflict", { n: subj.conflicts })}</li>`;
      html += `<li>${t("root.impact.rulesRecalc", { n: subj.rulesRecalc })}</li>`;
      html += `</ul><h4 data-i18n="root.historyImpact">${t("root.historyImpact")}</h4><p data-i18n="root.impact.history">${t("root.impact.history")}</p></section>`;
    }

    // 时间模拟
    html += `<section class="root-sim-time"><h4 data-i18n="root.simulateAt">${t("root.simulateAt")}</h4><select class="root-sim-select" id="root-sim-select">`;
    ["now", "in5", "nextVerify", "nextNpc", "plus10", "newSubject"].forEach(o =>
      html += `<option value="${o}" data-i18n="root.sim.${o}">${t("root.sim." + o)}</option>`);
    html += `</select><p class="root-sim-out" id="root-sim-out">${simText("now")}</p></section>`;

    // 稳定度
    html += `<section class="root-stability tier-${tier}"><h4 data-i18n="root.stabilityTitle">${t("root.stabilityTitle")}</h4>
      <p class="root-stab-val">${stability}% · <span data-i18n="root.tier.${tier}">${t("root.tier." + tier)}</span></p>`;
    if (reasons.length) html += `<ul class="root-stab-reasons">` + reasons.map(r => `<li data-i18n="${r}">${t(r)}</li>`).join("") + `</ul>`;
    html += `</section>`;

    el.diff.innerHTML = html;
    const sel = document.getElementById("root-sim-select"), out = document.getElementById("root-sim-out");
    if (sel && out) sel.addEventListener("change", () => { out.textContent = simText(sel.value); });
  }

  function simText(when) {
    const s = draftSystem(), cur = currentSystem();
    if (when === "nextVerify") {
      const before = operatorAge();
      const after = Math.min(100, before + (s.ageDirection === "FROZEN" ? 0 : s.ageStep));
      if (after !== before) {
        const skipped = after - before > 5;
        return t("root.simResult.verify", { a: before, b: after }) + (skipped ? " " + t("root.simResult.skip") : "");
      }
    }
    if (when === "plus10") return t("root.simResult.plus10");
    if (when === "newSubject") return t("root.simResult.newSubject");
    if (when === "nextNpc") return t("root.simResult.nextNpc");
    if (when === "in5") return t("root.simResult.in5");
    return t("root.simResult.now");
  }

  // 底栏：待执行修改
  function renderFooter() {
    if (!el.pending) return;
    const changedKeys = Object.keys(draft).filter(k => draftVal(k) !== committedVal(k));
    const subj = affectedSubjects();
    const { stability } = calcStability();
    const oe = operatorEffect();
    const linkCount = Object.keys(draftLinks).filter(k => DEP_LINKS.some(d => d.id === k)).length;
    el.pending.innerHTML =
      `<p class="root-pending-title" data-i18n="root.pendingTitle">${t("root.pendingTitle")}</p>` +
      (isDirty()
        ? `<ul class="root-pending-stats">
             <li>${t("root.pending.params", { n: changedKeys.length + linkCount })}</li>
             <li>${t("root.pending.nodes", { n: affectedNodes().length })}</li>
             <li>${t("root.pending.subjects", { n: subj.affectedTotal })}</li>
             <li>${t("root.pending.rules", { n: subj.rulesRecalc })}</li>
             <li>${t("root.pending.identity", { n: subj.identityConflicts })}</li>
             <li>${t("root.pending.loseRoot", { v: t(oe.losesRoot ? "root.yes" : "root.no") })}</li>
             <li>${t("root.pending.reversible", { v: t("root.no") })}</li>
             <li>${t("root.pending.stability", { n: stability })}</li>
           </ul>`
        : `<p class="root-hint" data-i18n="root.noPending">${t("root.noPending")}</p>`);
    if (el.commit) el.commit.disabled = !isDirty() || committing;
  }

  // ---- 预设 --------------------------------------------------------------
  function applyPreset(id) {
    const p = PRESETS.find(x => x.id === id); if (!p) return;
    Object.entries(p.changes).forEach(([k, v]) => { if (!LOCKED_KEYS.has(k) && k in DEFAULTS) setDraft(k, v); });
    log("root.log.preset", { name: t(p.key) });
    switchTab("impact");
    scheduleRender();
  }

  // ---- 恢复默认 ----------------------------------------------------------
  function restoreDefaults() {
    const r = store(); if (!r) return;
    draft = {}; draftLinks = {};
    r.committedParameters = {};
    r.severedLinks = {};
    r.stability = 100;
    r.modificationHistory.unshift({ ts: Date.now(), kind: "restore", operatorAge: operatorAge() });
    saveState();
    log("root.log.restore");
    window.eazoRootChanged?.();
    toast(t("root.restoredToast"), true);
    scheduleRender();
  }

  // ---- 保存为分支 --------------------------------------------------------
  function saveBranch() {
    const r = store(); if (!r) return;
    const snap = {};
    Object.keys(draft).forEach(k => { snap[k] = draftVal(k); });
    const id = "BRANCH-" + String(r.branches.length + 1).padStart(2, "0");
    r.branches.push({ id, parameters: snap, links: { ...draftLinks }, ts: Date.now() });
    r.modificationHistory.unshift({ ts: Date.now(), kind: "branch", branch: id, operatorAge: operatorAge() });
    saveState();
    log("root.log.branch", { id });
    toast(t("root.branchSaved", { id }), true);
    scheduleRender();
  }

  // ---- 写入系统（提交）---------------------------------------------------
  function requestCommit() {
    if (committing || !isDirty()) return;
    showCommitConfirm();
  }
  function showCommitConfirm() {
    const oe = operatorEffect();
    const ov = document.createElement("div");
    ov.className = "root-overlay";
    ov.innerHTML =
      `<div class="root-overlay-panel"><div class="root-progress" id="root-progress"></div>
        <p class="root-overlay-q" data-i18n="root.commitConfirm">${t("root.commitConfirm")}</p>
        ${oe.losesRoot ? `<p class="root-danger" data-i18n="root.commitLoseRoot">${t("root.commitLoseRoot")}</p>` : ""}
        <div class="root-overlay-actions">
          <button type="button" class="root-accept" id="root-accept" data-i18n="root.accept">${t("root.accept")}</button>
          <button type="button" class="root-revise" id="root-revise" data-i18n="root.revise">${t("root.revise")}</button>
        </div></div>`;
    el.console.appendChild(ov);
    ov.querySelector("#root-revise").addEventListener("click", () => ov.remove());
    ov.querySelector("#root-accept").addEventListener("click", () => { ov.querySelector(".root-overlay-actions").style.display = "none"; runCommit(ov); });
  }

  const COMMIT_STEPS = ["freeze", "deps", "rewrite", "propagate", "preserve"];
  function runCommit(ov) {
    if (committing) return; committing = true;
    if (el.commit) el.commit.disabled = true;
    const box = ov.querySelector("#root-progress");
    let i = 0;
    const step = () => {
      if (i < COMMIT_STEPS.length) {
        const k = "root.commitStep." + COMMIT_STEPS[i];
        if (box) box.innerHTML += `<p class="root-step" data-i18n="${k}">${t(k)}</p>`;
        i++; setTimeout(step, reduced ? 0 : 420);
      } else { finalizeCommit(ov); }
    };
    step();
  }

  function finalizeCommit(ov) {
    const r = store(); if (!r) { committing = false; return; }
    const before = currentSystem();
    const changedKeys = Object.keys(draft).filter(k => draftVal(k) !== committedVal(k));
    const oe = operatorEffect();
    const { stability } = calcStability();

    // 归档修订（ROOT 操作始终被记录，即使关闭了 recordAdminActions）
    r.modificationHistory.unshift({ ts: Date.now(), kind: "commit", operatorAge: operatorAge(), keys: changedKeys.slice(), stability });

    // 写入参数（institutionalAge 单独通过 eazoSetAge 处理）
    let ageTarget = null;
    changedKeys.forEach(k => {
      if (k === "institutionalAge") { ageTarget = draft[k]; return; }
      r.committedParameters[k] = draft[k];
    });
    // 断开连接
    Object.keys(draftLinks).forEach(id => { if (DEP_LINKS.some(d => d.id === id)) r.severedLinks[id] = draftLinks[id]; });

    // 关闭记录本身也被记录
    if (changedKeys.includes("recordAdminActions") && draft.recordAdminActions === false) {
      r.irreversibleEffects.push({ ts: Date.now(), type: "archiveStopped" });
    }
    // 强制次数写入（不可因恢复默认归零）
    if (changedKeys.includes("forceCount")) r.irreversibleEffects.push({ ts: Date.now(), type: "forceCount", value: draft.forceCount });

    r.stability = stability;
    r.systemVersion += 1;

    saveState();
    window.eazoRootChanged?.();
    window.eazoAddLog?.("root.log.commit", { n: changedKeys.length });

    // 清草稿
    draft = {}; draftLinks = {};

    // 自我影响：降龄真实收回 ROOT
    if (ageTarget !== null) {
      const res = window.eazoSetAge?.(ageTarget);
      if (res && res.rootLocked) { showRootRevoked(ov); return; }
    }

    committing = false;
    showCommitResult(ov, changedKeys.length);
  }

  function showCommitResult(ov, n) {
    const r = store();
    const { stability } = calcStability();
    const panel = ov.querySelector(".root-overlay-panel");
    panel.innerHTML =
      `<p class="root-result-line" data-i18n="root.resultLine1">${t("root.resultLine1")}</p>
       <p class="root-result-sub" data-i18n="root.resultLine2">${t("root.resultLine2")}</p>
       <ul class="root-result-stats">
         <li>${t("root.result.version", { v: r.systemVersion })}</li>
         <li>${t("root.result.operator", { who: t("root.holder.self") })}</li>
         <li>${t("root.result.time", { time: new Date().toLocaleTimeString() })}</li>
         <li>${t("root.result.stability", { n: r.stability })}</li>
         <li>${t("root.result.affected", { n: n })}</li>
         <li data-i18n="root.result.pending">${t("root.result.pending")}</li>
         <li data-i18n="root.result.irreversible">${t("root.result.irreversible")}</li>
       </ul>
       <button type="button" class="root-revise" id="root-result-close" data-i18n="root.resultClose">${t("root.resultClose")}</button>`;
    panel.querySelector("#root-result-close").addEventListener("click", () => ov.remove());
    if (r.stability < 40) el.console.classList.add("root-unstable"); else el.console.classList.remove("root-unstable");
    scheduleRender();
  }

  // 降龄后 ROOT 被收回：控件只读 → 关闭 → 返回星图 → 重新锁定
  function showRootRevoked(ov) {
    const panel = ov.querySelector(".root-overlay-panel");
    panel.innerHTML =
      `<p class="root-result-line root-danger" data-i18n="root.revoked1">${t("root.revoked1")}</p>
       <p class="root-result-sub" data-i18n="root.revoked2">${t("root.revoked2")}</p>`;
    el.console.classList.add("root-readonly");
    el.params?.querySelectorAll("input,select,button").forEach(c => { c.disabled = true; });
    setTimeout(() => {
      committing = false;
      ov.remove();
      close();
      window.eazoRootChanged?.();
    }, reduced ? 200 : 5000);
  }

  // ---- 退出当前系统 ------------------------------------------------------
  function showExit() {
    const ov = document.createElement("div");
    ov.className = "root-overlay";
    ov.innerHTML =
      `<div class="root-overlay-panel">
        <p class="root-exit-line" data-i18n="root.exit1">${t("root.exit1")}</p>
        <p class="root-exit-line" data-i18n="root.exit2">${t("root.exit2")}</p>
        <div class="root-overlay-actions">
          <button type="button" class="root-revise" id="root-exit-map" data-i18n="root.exitMap">${t("root.exitMap")}</button>
          <button type="button" class="root-revise" id="root-exit-hold" data-i18n="root.exitHold">${t("root.exitHold")}</button>
          <button type="button" class="root-accept" id="root-exit-restart" data-i18n="root.exitRestart">${t("root.exitRestart")}</button>
        </div>
        <p class="root-exit-final" data-i18n="root.exitFinal1">${t("root.exitFinal1")}</p>
        <p class="root-exit-final" data-i18n="root.exitFinal2">${t("root.exitFinal2")}</p>
      </div>`;
    el.console.appendChild(ov);
    ov.querySelector("#root-exit-hold").addEventListener("click", () => ov.remove());
    ov.querySelector("#root-exit-map").addEventListener("click", () => { ov.remove(); close(); });
    ov.querySelector("#root-exit-restart").addEventListener("click", () => {
      ov.remove(); close();
      // 旧实例进入 ARCHIVE 记录；重开由现有 restart 流程处理
      window.eazoRestartExperience?.() || document.getElementById("restart")?.click();
    });
  }

  // ---- 日志 & toast ------------------------------------------------------
  function log(key, params) { window.eazoAddLog?.(key, params || {}); }
  function toast(msg, warn) {
    if (window.eazoToast) return window.eazoToast(msg, warn);
    const n = document.createElement("div");
    n.className = "root-toast" + (warn ? " warn" : "");
    n.textContent = msg; el.console.appendChild(n);
    setTimeout(() => n.remove(), 2600);
  }

  // ---- Canvas 系统拓扑 ---------------------------------------------------
  let topoNodes = [], topoLinks = [], rafId = null, lastDraw = 0, pulses = [];
  function buildTopology() {
    topoNodes = []; topoLinks = [];
    const cx = 0.5, cy = 0.5;
    // 引擎围绕中心内环
    ENGINE_NODES.forEach((n, i) => {
      const a = (i / ENGINE_NODES.length) * Math.PI * 2 - Math.PI / 2;
      topoNodes.push({ id: n.id, key: n.key, engine: true, x: cx + Math.cos(a) * 0.18, y: cy + Math.sin(a) * 0.18 });
    });
    // 权限外环
    PERM_NODES.forEach((n, i) => {
      const a = (i / PERM_NODES.length) * Math.PI * 2 - Math.PI / 2;
      topoNodes.push({ id: n.id, key: n.key, perm: true, root: n.id === "ROOT-80", x: cx + Math.cos(a) * 0.42, y: cy + Math.sin(a) * 0.42 });
    });
    // 游戏最外环
    GAME_NODES.forEach((n, i) => {
      const a = (i / GAME_NODES.length) * Math.PI * 2 - Math.PI / 2 + 0.3;
      topoNodes.push({ id: n.id, key: n.key, game: true, x: cx + Math.cos(a) * 0.46, y: cy + Math.sin(a) * 0.46 });
    });
    // 连接：引擎 -> 依赖节点
    Object.entries(ENGINE_DEPENDENTS).forEach(([eid, deps]) => {
      deps.forEach(d => topoLinks.push({ from: eid, to: d }));
    });
  }
  const nodeById = (id) => topoNodes.find(n => n.id === id);

  function drawTopology() {
    const c = el.canvas; if (!c) return;
    const ctx = c.getContext("2d");
    const rect = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(rect.width * dpr) || c.height !== Math.round(rect.height * dpr)) {
      c.width = Math.round(rect.width * dpr); c.height = Math.round(rect.height * dpr);
    }
    const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    if (!topoNodes.length) buildTopology();
    const affected = new Set(affectedNodes());
    const highlight = selectedEngineNode ? new Set(ENGINE_DEPENDENTS[selectedEngineNode] || []) : null;
    const px = (n) => n.x * W, py = (n) => n.y * H;

    // 连接线
    topoLinks.forEach(l => {
      const a = nodeById(l.from), b = nodeById(l.to); if (!a || !b) return;
      const hot = (highlight && (l.from === selectedEngineNode)) || affected.has(l.to);
      ctx.strokeStyle = hot ? "rgba(150,60,60,0.55)" : "rgba(90,120,100,0.12)";
      ctx.lineWidth = hot ? 1.4 * dpr : 0.6 * dpr;
      ctx.beginPath(); ctx.moveTo(px(a), py(a)); ctx.lineTo(px(b), py(b)); ctx.stroke();
    });
    // 传播脉冲
    const now = performance.now();
    pulses = pulses.filter(p => now - p.start < 900);
    pulses.forEach(p => {
      const a = nodeById(p.from), b = nodeById(p.to); if (!a || !b) return;
      const t2 = (now - p.start) / 900;
      const x = px(a) + (px(b) - px(a)) * t2, y = py(a) + (py(b) - py(a)) * t2;
      ctx.fillStyle = "rgba(170,70,70,0.8)";
      ctx.beginPath(); ctx.arc(x, y, 2.2 * dpr, 0, Math.PI * 2); ctx.fill();
    });
    // 节点
    topoNodes.forEach(n => {
      const isAff = affected.has(n.id);
      const isHi = highlight && highlight.has(n.id);
      const isSel = selectedEngineNode === n.id;
      let r = (n.engine ? 5 : n.game ? 3.5 : 4) * dpr;
      let fill = n.engine ? "rgba(120,160,140,0.5)" : n.game ? "rgba(110,140,130,0.4)" : "rgba(130,160,145,0.45)";
      if (n.root) fill = "rgba(60,14,14,0.95)";
      if (isAff || isHi) { fill = "rgba(190,80,80,0.85)"; r *= 1.3; }
      if (isSel) { fill = "rgba(150,190,170,0.9)"; r *= 1.4; }
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.arc(px(n), py(n), r, 0, Math.PI * 2); ctx.fill();
      // 标签（低亮度）
      ctx.fillStyle = "rgba(160,185,170,0.55)";
      ctx.font = `${9 * dpr}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.fillText(n.id, px(n), py(n) - r - 3 * dpr);
    });
    // 点击引擎的图例
    if (el.legend) {
      el.legend.textContent = selectedEngineNode
        ? t("root.legendSelected", { name: engName(selectedEngineNode), n: (ENGINE_DEPENDENTS[selectedEngineNode] || []).length })
        : t("root.legendHint");
    }
  }
  function startTopoLoop() {
    stopTopoLoop();
    const loop = (ts) => {
      if (!el.console?.classList.contains("open")) { rafId = null; return; }
      if (ts - lastDraw >= 33 || pulses.length) { drawTopology(); lastDraw = ts; }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }
  function stopTopoLoop() { if (rafId) cancelAnimationFrame(rafId); rafId = null; }

  // 拓扑点击选择引擎
  function bindTopoClick() {
    el.canvas?.addEventListener("click", (e) => {
      const rect = el.canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width, my = (e.clientY - rect.top) / rect.height;
      let best = null, bd = 0.05;
      topoNodes.forEach(n => { if (!n.engine) return; const d = Math.hypot(n.x - mx, n.y - my); if (d < bd) { bd = d; best = n; } });
      if (best) { selectedEngineNode = best.id; activeEngineId = best.id; renderEngineList(); renderParams(); drawTopology();
        // 触发传播脉冲
        (ENGINE_DEPENDENTS[best.id] || []).forEach(to => pulses.push({ from: best.id, to, start: performance.now() }));
      }
    });
  }

  // ---- 进入动画 ----------------------------------------------------------
  function playEnter(done) {
    if (!el.enter) { done(); return; }
    el.enter.setAttribute("aria-hidden", "false");
    el.enter.classList.add("active");
    const l1 = el.enterLine1, l2 = el.enterLine2;
    if (l1) l1.classList.remove("show"); if (l2) l2.classList.remove("show");
    if (reduced) { done(); el.enter.classList.remove("active"); el.enter.setAttribute("aria-hidden", "true"); return; }
    setTimeout(() => l1 && l1.classList.add("show"), 300);
    setTimeout(() => l2 && l2.classList.add("show"), 1400);
    setTimeout(() => { el.enter.classList.remove("active"); el.enter.setAttribute("aria-hidden", "true"); done(); }, 2600);
  }

  // ---- 分区切换 ----------------------------------------------------------
  function switchTab(tab) {
    activeTab = tab;
    el.tabs?.querySelectorAll(".root-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    el.console.setAttribute("data-tab", tab);
    if (tab === "topology") { setTimeout(drawTopology, 0); }
  }

  // ---- open / close ------------------------------------------------------
  function open() {
    if (!mounted) return;
    store();
    draft = {}; draftLinks = {};
    selectedEngineNode = null; activeEngineId = "age"; committing = false;
    el.console.classList.remove("root-readonly");
    el.console.setAttribute("aria-hidden", "false");
    el.console.classList.add("open");
    document.body.classList.add("archive-open");
    switchTab("topology");
    log("root.log.open");
    buildTopology();
    playEnter(() => { scheduleRender(); startTopoLoop(); });
    setTimeout(() => scheduleRender(), 0);
  }
  function close() {
    if (!mounted) return;
    stopTopoLoop();
    el.console.classList.remove("open");
    el.console.setAttribute("aria-hidden", "true");
    document.body.classList.remove("archive-open");
    window.eazoArchiveDim?.(false);
  }

  function bind() {
    el.back?.addEventListener("click", close);
    el.commit?.addEventListener("click", () => { if (!el.commit.disabled) requestCommit(); });
    el.simulate?.addEventListener("click", () => { switchTab("impact"); scheduleRender(); });
    el.restore?.addEventListener("click", restoreDefaults);
    el.branch?.addEventListener("click", saveBranch);
    el.exit?.addEventListener("click", showExit);
    el.tabs?.querySelectorAll(".root-tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    bindTopoClick();
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !el.console?.classList.contains("open")) return;
      const ov = el.console.querySelector(".root-overlay");
      if (ov) { e.preventDefault(); ov.remove(); return; }
      e.preventDefault(); close();
    });
    window.addEventListener("eazo:localechange", () => {
      if (!el.console) return;
      window.eazoI18n?.translate?.(el.console);
      if (el.console.classList.contains("open")) scheduleRender();
    });
    window.addEventListener("resize", () => { if (el.console?.classList.contains("open")) drawTopology(); });
  }

  function cache() {
    el.console = document.getElementById("root-console");
    if (!el.console) return false;
    el.enter = document.getElementById("root-enter");
    el.enterLine1 = document.getElementById("root-enter-line1");
    el.enterLine2 = document.getElementById("root-enter-line2");
    el.statusbar = document.getElementById("root-statusbar");
    el.back = document.getElementById("root-back");
    el.tabs = document.getElementById("root-tabs");
    el.presetBar = document.getElementById("root-preset-bar");
    el.engineList = document.getElementById("root-engine-list");
    el.invariants = document.getElementById("root-invariants");
    el.canvas = document.getElementById("root-canvas");
    el.legend = document.getElementById("root-topology-legend");
    el.params = document.getElementById("root-params");
    el.diff = document.getElementById("root-diff");
    el.pending = document.getElementById("root-pending");
    el.restore = document.getElementById("root-restore");
    el.branch = document.getElementById("root-branch");
    el.simulate = document.getElementById("root-simulate");
    el.commit = document.getElementById("root-commit");
    el.exit = document.getElementById("root-exit");
    return true;
  }

  function init() {
    if (!cache()) return;
    mounted = true;
    bind();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // 跨权限只读接口：其它模块可查询当前生效的底层参数
  function param(key) { return committedVal(key); }
  function severed(id) { const r = store(); return (r?.severedLinks || {})[id] || null; }
  window.eazoRoot = { open, close, param, severed, currentSystem };
})();


