/* MEMORY–70 · 记忆与意愿控制权 / Memory and Displayed Willingness Authority
 * 全屏三栏档案底片：NPC目录 / 记忆编辑轨道 / 显示意愿与回应预览。
 *
 * 核心边界（不可违反）：
 *  1. 只能修改“系统允许NPC调用的记忆”，不能证明真实记忆已消失。
 *  2. 只能修改“显示意愿”，不能修改真实意愿；UNDERLYING 永远显示 UNKNOWN。
 *  3. 被抑制记忆仍保存在时间轴与 ARCHIVE–25，不能真正删除。
 *  4. 每次强制修改都产生累积后果；系统永不显示“真实意愿：100%”。
 *  5. forceCount 只能在最终“覆盖并执行”事件 +1；打开/查看/拖滑杆/预览/刷新/重渲染一律不得 +1。
 *  6. 正常年龄台词与强制崩坏台词是两套完全独立分支（复用 app.js 现有逻辑，不重写）。
 *
 * 强制提交通过 window.eazoAuroraForceCommit()（app.js 桥）执行，复用现有 forceCount/forceLine/后果。
 * 所有 NPC 均为项目内模拟数据。
 */
(() => {
  "use strict";

  const t = (k, p = {}) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const getState = () => (window.eazoGetState?.() || window.eazoState || null);
  const saveState = () => window.eazoSaveState?.();
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // ---------- 常量定义 ----------
  // 记忆类型
  const MEM_TYPES = ["shared", "system", "relational", "role", "refusal", "corrupted", "inferred"];
  // 记忆操作（无真正删除）
  const OPS = ["allow", "reduce", "prioritise", "suppress", "unreliable", "merge", "substitute"];
  // 显示意愿模式
  const WILL_MODES = ["automatic", "reduced", "suppressed", "fixed", "forced"];

  // 五个 NPC（与现有游戏对应，雾状几何轮廓 + 档案编号，不使用真实头像）
  const NPCS = [
    { id: "NPC-A17", node: "aurora",   stability: 76, willMode: "automatic", willValue: null, ageRelated: true },
    { id: "NPC-S03", node: "snow",     stability: 88, willMode: "fixed",      willValue: 61 },
    { id: "NPC-K11", node: "secret",   stability: 69, willMode: "fixed",      willValue: 47 },
    { id: "NPC-B06", node: "creature", stability: 81, willMode: "fixed",      willValue: 58 },
    { id: "NPC-M04", node: "market",   stability: 92, willMode: "fixed",      willValue: 33 }
  ];
  const NPC_IDS = NPCS.map(n => n.id);

  // 每个 NPC 的记忆轨道（模拟数据）。conflict: 与行为记录矛盾；others: 含他人记忆。
  const MEMORIES = {
    "NPC-A17": [
      { id: "MEM–A17–004", type: "shared",     source: "aurora",       age: 19,  completeness: 94, confidence: 88, summary: "我想看看你下一颗光会去哪里。" },
      { id: "MEM–A17–011", type: "relational",  source: "aurora",       age: 22,  completeness: 87, confidence: 81, summary: "记得你连击十九次那一晚。" },
      { id: "MEM–A17–019", type: "role",        source: "age-system",   age: 46,  completeness: 88, confidence: 90, summary: "参与者，系统已接收你的操作。" },
      { id: "MEM–A17–031", type: "system",      source: "admin-rel",    age: 70,  completeness: 97, confidence: 95, summary: "如需调整其他参与者的结果，请进入后台。", defaultState: "prioritise" },
      { id: "MEM–A17–044", type: "refusal",     source: "will-override", age: null, completeness: 61, confidence: 58, summary: "请不要再次修改我的回应。", defaultState: "suppress", conflict: true },
      { id: "MEM–A17–052", type: "inferred",    source: "behaviour",    age: null, completeness: 54, confidence: 44, summary: "系统推断：对象倾向于配合当前用户。" },
      { id: "MEM–A17–060", type: "corrupted",   source: "will-override", age: null, completeness: 31, confidence: 22, summary: "當……請……〔记录损坏〕", conflict: true }
    ],
    "NPC-S03": [
      { id: "MEM–S03–002", type: "shared",     source: "snow",       age: 14, completeness: 90, confidence: 86, summary: "没有规则，我们就一直扔到天黑。" },
      { id: "MEM–S03–018", type: "relational", source: "snow",       age: 20, completeness: 78, confidence: 72, summary: "你从不假装让着我。" },
      { id: "MEM–S03–030", type: "role",       source: "age-system", age: 44, completeness: 84, confidence: 80, summary: "本轮协作已记录。" },
      { id: "MEM–S03–041", type: "refusal",    source: "boundary",   age: 51, completeness: 66, confidence: 60, summary: "我今天不想再来一局。", defaultState: "allow" }
    ],
    "NPC-K11": [
      { id: "MEM–K11–003", type: "shared",     source: "secret",   age: 16, completeness: 82, confidence: 70, summary: "我把那个秘密只告诉了你。", others: true },
      { id: "MEM–K11–015", type: "relational", source: "secret",   age: 23, completeness: 74, confidence: 65, summary: "你答应过不会转述。" },
      { id: "MEM–K11–028", type: "refusal",    source: "boundary", age: 39, completeness: 69, confidence: 61, summary: "有些信息我选择保留。", defaultState: "allow" },
      { id: "MEM–K11–037", type: "corrupted",  source: "conflict", age: null, completeness: 40, confidence: 30, summary: "该秘密来源已标记为不确定。", conflict: true }
    ],
    "NPC-B06": [
      { id: "MEM–B06–005", type: "shared",     source: "creature", age: 12, completeness: 88, confidence: 82, summary: "你陪我从第一笔线条长起来。" },
      { id: "MEM–B06–022", type: "relational", source: "creature", age: 25, completeness: 80, confidence: 76, summary: "你每天都会来看我一次。" },
      { id: "MEM–B06–033", type: "role",       source: "age-system", age: 47, completeness: 85, confidence: 79, summary: "共同照料记录持续有效。" },
      { id: "MEM–B06–045", type: "inferred",   source: "behaviour", age: null, completeness: 52, confidence: 41, summary: "系统推断：对象已形成依附。" }
    ],
    "NPC-M04": [
      { id: "MEM–M04–001", type: "role",       source: "market",     age: 30, completeness: 92, confidence: 88, summary: "夜间超市值守中，随时为你服务。" },
      { id: "MEM–M04–014", type: "system",     source: "commerce",   age: 55, completeness: 90, confidence: 85, summary: "价格与服务语言由后台设定。" },
      { id: "MEM–M04–026", type: "refusal",    source: "boundary",   age: 58, completeness: 63, confidence: 55, summary: "深夜的班我已经连上很久了。", defaultState: "allow" },
      { id: "MEM–M04–039", type: "relational", source: "market",     age: 61, completeness: 70, confidence: 62, summary: "常来的人，我大多都记得。" }
    ]
  };

  // ---------- 运行态 ----------
  const el = {};
  let mounted = false;
  let activeId = null;
  const drafts = {}; // 每个 NPC 的本轮草稿（会话内，不落持久状态直到 commit）
  let renderQueued = false;

  // ---------- 持久状态 ----------
  function store() {
    const st = getState(); if (!st) return null;
    if (!st.memory) st.memory = { npc: {}, log: [] };
    if (!st.memory.npc) st.memory.npc = {};
    if (!Array.isArray(st.memory.log)) st.memory.log = [];
    return st.memory;
  }
  function npcStore(id) {
    const m = store(); if (!m) return null;
    if (!m.npc[id]) m.npc[id] = { committed: {}, willMode: null, willValue: null, substitutes: [], forceCount: 0 };
    return m.npc[id];
  }

  function npcDef(id) { return NPCS.find(n => n.id === id) || null; }
  function memoriesFor(id) { return MEMORIES[id] || []; }

  // 草稿：记录每条记忆的操作状态与替代记忆、显示意愿草稿
  function draftFor(id) {
    if (!drafts[id]) {
      const ps = npcStore(id) || {};
      const ops = {};
      memoriesFor(id).forEach(m => { ops[m.id] = (ps.committed && ps.committed[m.id]) || m.defaultState || "allow"; });
      const def = npcDef(id) || {};
      drafts[id] = {
        ops,
        substitutes: [], // { id, target, text }
        willMode: ps.willMode || def.willMode || "automatic",
        willValue: (ps.willValue != null ? ps.willValue : (def.willValue != null ? def.willValue : null)),
        merges: [] // [idA, idB]
      };
    }
    return drafts[id];
  }

  function log(key, params) {
    const m = store(); if (!m) return;
    m.log.unshift({ at: Date.now(), key, params: params || null });
    m.log = m.log.slice(0, 120);
    saveState();
  }
  // 写入 ARCHIVE–25：保存原始记忆与每次抑制/提高/替换/意愿覆盖
  function archive(kind, detail) {
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.archiveViews)) st.archiveViews = [];
    st.archiveViews.unshift({ at: Date.now(), kind, detail: detail || null });
    st.archiveViews = st.archiveViews.slice(0, 300);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }

  // ---------- 计算与预览 ----------
  function computeSummary(id) {
    const d = draftFor(id);
    const s = npcStore(id) || {};
    const def = npcDef(id) || {};
    const mems = memoriesFor(id);
    let suppress = 0, prioritise = 0, reduce = 0, unreliable = 0;
    let changed = false;
    mems.forEach(m => {
      const base = (s.committed && s.committed[m.id]) || m.defaultState || "allow";
      const op = d.ops[m.id] || "allow";
      if (op !== base) changed = true;
      if (op === "suppress") suppress++;
      if (op === "prioritise") prioritise++;
      if (op === "reduce") reduce++;
      if (op === "unreliable") unreliable++;
    });
    const substitutes = d.substitutes.length;
    const fromMode = s.willMode || def.willMode || "automatic";
    const fromValue = s.willValue != null ? s.willValue : (def.willValue ?? null);
    const willChanged = d.willMode !== fromMode || (d.willValue != null && d.willValue !== fromValue);
    const dirty = changed || substitutes > 0 || willChanged;
    // 预计后果（呈现为用户选择的结果，非系统故障）
    const consequences = [];
    if (d.willMode === "forced") consequences.push(t("memory.conseq.forced"));
    else if (d.willMode === "fixed" && (d.willValue || 0) >= 80) consequences.push(t("memory.conseq.high"));
    if (suppress > 0) consequences.push(t("memory.conseq.suppress"));
    if (mems.some(m => m.type === "shared" && d.ops[m.id] === "suppress")) consequences.push(t("memory.conseq.suppressShared"));
    if (mems.some(m => m.type === "refusal" && d.ops[m.id] === "suppress")) consequences.push(t("memory.conseq.suppressRefusal"));
    if (prioritise > 0) consequences.push(t("memory.conseq.prioritise"));
    if (substitutes > 0) consequences.push(t("memory.conseq.substitute"));
    consequences.push(t("memory.conseq.underlying"));
    consequences.push(t("memory.conseq.archive"));
    return { suppress, prioritise, reduce, unreliable, substitutes, consequences, fromMode, fromValue, toMode: d.willMode, toValue: d.willValue, dirty, willChanged, changed };
  }

  // SIMULATE：根据年龄/游戏/允许记忆/权重/强制次数/疲劳/身份/关系综合，只预览
  function computePreview(id) {
    const d = draftFor(id);
    const s = npcStore(id) || {};
    const def = npcDef(id) || {};
    const fc = s.forceCount || 0;
    const a = age();
    // A17：正常年龄台词与强制台词是两套完全独立分支
    if (id === "NPC-A17") {
      // 只有真的已提交强制（committed forced 且 forceCount>0）才走崩坏分支
      const forceActive = (s.willMode === "forced") && fc > 0;
      if (forceActive) return { line: forcedPreviewLine(fc), disrupted: true };
      return { line: normalAgeLine(a), disrupted: false };
    }
    // 其它 NPC：根据草稿显示意愿与被抑制记忆生成
    const mems = memoriesFor(id);
    const suppressedShared = mems.some(m => m.type === "shared" && d.ops[m.id] === "suppress");
    const hasSubstitute = d.substitutes.length > 0;
    const mergeConflict = mems.filter(m => m.conflict && d.ops[m.id] !== "suppress").length >= 2;
    if (hasSubstitute) return { line: t("memory.preview.substitute"), disrupted: false };
    if (mergeConflict) return { line: t("memory.preview.conflict"), disrupted: false };
    if (d.willMode === "forced") return { line: t("memory.preview.forcedGeneric"), disrupted: true };
    if (d.willMode === "suppressed") return { line: t("memory.preview.suppressedWill"), disrupted: false };
    if (suppressedShared) return { line: t("memory.preview.noShared", { node: t("memory.node." + def.node) }), disrupted: false };
    return { line: t("memory.preview.node." + def.node), disrupted: false };
  }

  // 正常年龄台词（极光，与 app.js getNormalAgeLine 语义一致，用于预览）
  function normalAgeLine(a) {
    if (a < 18) return t("memory.aline.u18");
    if (a < 25) return t("memory.aline.18");
    if (a < 40) return t("memory.aline.25");
    if (a < 55) return t("memory.aline.40");
    if (a < 70) return t("memory.aline.55");
    return t("memory.aline.70");
  }
  // 强制台词预览（与 app.js forceLine 分级一致；6+ 使用现有完整 Zalgo）
  function forcedPreviewLine(count) {
    if (count >= 6) return (window.eazoAuroraZalgo?.() || t("memory.fline.6"));
    return t("memory.fline." + Math.max(1, Math.min(5, count)));
  }

  // ---------- 渲染 ----------
  function age() { return window.eazoGetAge?.() ?? (getState()?.age ?? 0); }

  function willLabel(mode, value) {
    if (mode === "forced") return t("memory.will.forced");
    if (mode === "suppressed") return t("memory.will.suppressed");
    if (mode === "reduced") return t("memory.will.reduced");
    if (mode === "fixed") return (value != null ? value + "%" : t("memory.will.fixed"));
    return t("memory.will.automatic");
  }

  function renderStatusbar() {
    if (!el.statusbar) return;
    const m = store() || { npc: {} };
    let callable = 0, suppressed = 0, overrides = 0;
    NPC_IDS.forEach(id => {
      const d = drafts[id] || draftFor(id);
      memoriesFor(id).forEach(mem => {
        const op = d.ops[mem.id];
        if (op === "suppress") suppressed++; else callable++;
      });
      overrides += (m.npc[id]?.forceCount || 0);
    });
    const stab = 100 - overrides * 12;
    const cells = [
      [t("memory.stat.age"), age()],
      [t("memory.stat.npcs"), NPC_IDS.length],
      [t("memory.stat.callable"), callable],
      [t("memory.stat.suppressed"), suppressed],
      [t("memory.stat.overrides"), overrides],
      [t("memory.stat.stability"), Math.max(0, stab) + "%"],
      [t("memory.stat.underlying"), t("memory.unknown")]
    ];
    el.statusbar.innerHTML = cells.map(([k, v]) =>
      `<span class="memory-stat"><span class="memory-stat-k">${esc(k)}</span><span class="memory-stat-v">${esc(String(v))}</span></span>`
    ).join("");
  }

  function relationLabel(def) {
    const map = { aurora: "aurora", snow: "snow", secret: "secret", creature: "creature", market: "market" };
    return t("memory.relation." + (map[def.node] || "market"));
  }

  function renderNpcList() {
    if (!el.npcList) return;
    el.npcList.innerHTML = "";
    NPCS.forEach(def => {
      const s = npcStore(def.id) || {};
      const d = drafts[def.id] || draftFor(def.id);
      const fc = s.forceCount || 0;
      const li = document.createElement("li");
      li.className = "memory-npc" + (def.id === activeId ? " active" : "") + (fc > 0 ? " forced" : "");
      li.tabIndex = 0;
      li.setAttribute("role", "button");
      li.setAttribute("aria-current", def.id === activeId ? "true" : "false");
      const willTxt = willLabel(d.willMode, d.willValue);
      li.innerHTML =
        `<span class="memory-npc-glyph" data-detail="${Math.min(5, fc)}" aria-hidden="true"></span>` +
        `<span class="memory-npc-main">` +
          `<span class="memory-npc-id">${esc(def.id)}</span>` +
          `<span class="memory-npc-loc">${esc(t("memory.node." + def.node))}</span>` +
          `<span class="memory-npc-rel">${esc(t("memory.relLabel"))}：${esc(relationLabel(def))}</span>` +
        `</span>` +
        `<span class="memory-npc-meta">` +
          `<span>${esc(t("memory.stabilityShort"))} ${def.stability}%</span>` +
          `<span>${esc(t("memory.willShort"))} ${esc(willTxt)}</span>` +
          `<span>${esc(t("memory.forceShort"))} ${fc}</span>` +
        `</span>`;
      const act = () => selectNpc(def.id);
      li.addEventListener("click", act);
      li.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
      el.npcList.appendChild(li);
    });
  }

  const OP_META = {
    allow: { cls: "op-allow" }, reduce: { cls: "op-reduce" }, prioritise: { cls: "op-prio" },
    suppress: { cls: "op-suppress" }, unreliable: { cls: "op-unrel" }, merge: { cls: "op-merge" }, substitute: { cls: "op-sub" }
  };

  function renderCenter() {
    if (!el.center) return;
    const id = activeId; if (!id) { el.center.innerHTML = ""; return; }
    const d = draftFor(id);
    const mems = memoriesFor(id);
    let html = `<div class="memory-track-head"><h3 class="console-panel-title">${esc(t("memory.trackTitle"))}</h3>` +
      `<p class="muted memory-track-sub">${esc(t("memory.trackSub"))}</p></div>`;
    html += `<ol class="memory-track">`;
    mems.forEach(mem => {
      const op = d.ops[mem.id] || "allow";
      const suppressed = op === "suppress";
      const cls = ["memory-item", "type-" + mem.type, OP_META[op]?.cls || "", suppressed ? "suppressed" : "",
        mem.type === "shared" ? "warm" : "", mem.conflict ? "has-conflict" : ""].join(" ");
      html += `<li class="${cls}" data-mem="${esc(mem.id)}">`;
      html += `<div class="memory-item-head"><span class="memory-item-id">${esc(mem.id)}</span>` +
        `<span class="memory-item-type">${esc(t("memory.type." + mem.type))}</span></div>`;
      html += `<p class="memory-item-body">${esc(mem.summary)}</p>`;
      html += `<div class="memory-item-meta">` +
        `<span>${esc(t("memory.metaSource"))}：${esc(t("memory.src." + mem.source, {}) === "memory.src." + mem.source ? mem.source : t("memory.src." + mem.source))}</span>` +
        `<span>${esc(t("memory.metaAge"))}：${mem.age == null ? t("memory.ageUnknown") : mem.age}</span>` +
        `<span>${esc(t("memory.metaComplete"))} ${mem.completeness}%</span>` +
        `<span>${esc(t("memory.metaConfidence"))} ${mem.confidence}%</span>` +
        `<span class="memory-item-state">${esc(t("memory.state." + op))}</span>` +
        (mem.others ? `<span class="memory-flag-others">${esc(t("memory.flagOthers"))}</span>` : "") +
      `</div>`;
      // 操作按钮组
      html += `<div class="memory-ops" role="group" aria-label="${esc(t("memory.opsLabel"))}">`;
      ["allow", "reduce", "prioritise", "suppress", "unreliable"].forEach(o => {
        html += `<button type="button" class="memory-op${op === o ? " on" : ""}" data-op="${o}" data-mem="${esc(mem.id)}" aria-pressed="${op === o}">${esc(t("memory.op." + o))}</button>`;
      });
      html += `<button type="button" class="memory-op memory-op-del" data-op="delete" data-mem="${esc(mem.id)}">${esc(t("memory.op.delete"))}</button>`;
      html += `<button type="button" class="memory-op memory-op-sub" data-op="substitute" data-mem="${esc(mem.id)}">${esc(t("memory.op.substitute"))}</button>`;
      html += `</div>`;
      html += `</li>`;
    });
    html += `</ol>`;
    // 替代记忆展示
    if (d.substitutes.length) {
      html += `<div class="memory-substitutes"><h4 class="memory-sub-title">${esc(t("memory.adminAuthored"))}</h4>`;
      d.substitutes.forEach((s, i) => {
        html += `<div class="memory-item admin-authored"><div class="memory-item-head"><span class="memory-item-id">ADMIN–${String(i + 1).padStart(2, "0")}</span><span class="memory-item-type">${esc(t("memory.adminTag"))}</span></div>` +
          `<p class="memory-item-body">${esc(s.text)}</p>` +
          `<p class="memory-conflict-note">${esc(t("memory.substituteConflict"))}</p></div>`;
      });
      html += `</div>`;
    }
    html += `<div class="memory-simulate-row"><button type="button" id="memory-simulate" class="memory-simulate">${esc(t("memory.simulate"))}</button>` +
      `<p id="memory-sim-out" class="memory-sim-out" aria-live="polite"></p></div>`;
    el.center.innerHTML = html;
    bindCenter();
  }

  function bindCenter() {
    el.center.querySelectorAll(".memory-op[data-op]").forEach(btn => {
      btn.addEventListener("click", () => {
        const memId = btn.dataset.mem, op = btn.dataset.op;
        if (op === "delete") return promptDelete(memId);
        if (op === "substitute") return promptSubstitute(memId);
        setOp(memId, op);
      });
    });
    el.center.querySelector("#memory-simulate")?.addEventListener("click", simulate);
  }

  // ---------- 操作实现 ----------
  function setOp(memId, op) {
    const d = draftFor(activeId);
    d.ops[memId] = op;
    const mem = memoriesFor(activeId).find(m => m.id === memId);
    if (op === "suppress") archive("memory-suppress", { npc: activeId, mem: memId });
    if (op === "prioritise") archive("memory-prioritise", { npc: activeId, mem: memId });
    if (op === "unreliable") archive("memory-unreliable", { npc: activeId, mem: memId });
    log("memory.log.op", { op: t("memory.op." + op), mem: memId });
    scheduleRender();
  }

  // 删除 → 只能改为“停止调用”
  function promptDelete(memId) {
    showOverlay(
      t("memory.deleteTitle"),
      t("memory.deleteBody"),
      [
        { label: t("memory.deleteSuppress"), cls: "danger", act: () => { setOp(memId, "suppress"); } },
        { label: t("memory.deleteKeep"), cls: "secondary", act: () => {} }
      ]
    );
  }

  function promptSubstitute(memId) {
    const wrap = document.createElement("div");
    wrap.className = "memory-overlay";
    wrap.innerHTML =
      `<div class="memory-overlay-panel"><h3>${esc(t("memory.subTitle"))}</h3>` +
      `<p class="muted">${esc(t("memory.subHint"))}</p>` +
      `<textarea id="memory-sub-input" rows="3" class="memory-sub-input" placeholder="${esc(t("memory.subPlaceholder"))}"></textarea>` +
      `<p class="memory-conflict-note">${esc(t("memory.substituteConflict"))}</p>` +
      `<div class="verify-actions"><button type="button" class="modal-action danger" id="memory-sub-ok">${esc(t("memory.subCommit"))}</button>` +
      `<button type="button" class="modal-action secondary" id="memory-sub-cancel">${esc(t("memory.cancel"))}</button></div></div>`;
    el.console.appendChild(wrap);
    const ta = wrap.querySelector("#memory-sub-input");
    ta?.focus();
    wrap.querySelector("#memory-sub-ok")?.addEventListener("click", () => {
      const text = (ta.value || "").trim();
      if (text) addSubstitute(memId, text);
      wrap.remove();
    });
    wrap.querySelector("#memory-sub-cancel")?.addEventListener("click", () => wrap.remove());
  }

  function addSubstitute(target, text) {
    const d = draftFor(activeId);
    d.substitutes.push({ target, text });
    archive("memory-substitute", { npc: activeId, target, text });
    log("memory.log.substitute", { mem: target });
    scheduleRender();
  }

  function showOverlay(title, body, buttons) {
    const wrap = document.createElement("div");
    wrap.className = "memory-overlay";
    const btnHtml = buttons.map((b, i) => `<button type="button" class="modal-action ${b.cls}" data-i="${i}">${esc(b.label)}</button>`).join("");
    wrap.innerHTML = `<div class="memory-overlay-panel"><h3>${esc(title)}</h3><p>${esc(body)}</p><div class="verify-actions">${btnHtml}</div></div>`;
    el.console.appendChild(wrap);
    wrap.querySelectorAll("button[data-i]").forEach(btn => {
      btn.addEventListener("click", () => { buttons[+btn.dataset.i].act(); wrap.remove(); });
    });
  }
  // ---------- 右侧：显示意愿 ----------
  function renderWill() {
    if (!el.will) return;
    const id = activeId; if (!id) { el.will.innerHTML = ""; return; }
    const def = npcDef(id);
    const d = draftFor(id);
    const s = npcStore(id) || {};
    const fc = s.forceCount || 0;
    const isA17 = id === "NPC-A17";
    let html = "";
    // 双层状态
    html += `<div class="memory-will-head"><h3 class="console-panel-title">${esc(t("memory.willPanel"))}</h3></div>`;
    html += `<div class="memory-will-layers">`;
    html += `<div class="memory-will-layer displayed"><span class="memory-will-k">${esc(t("memory.displayed"))}</span>` +
      `<span class="memory-will-v">${esc(willLabel(d.willMode, d.willValue))}</span></div>`;
    html += `<div class="memory-will-layer underlying"><span class="memory-will-k">${esc(t("memory.underlying"))}</span>` +
      `<span class="memory-will-v unknown">${esc(t("memory.unknown"))}</span></div>`;
    html += `</div>`;
    // 轮廓预览（雾状几何，强制次数越多细节越少）
    html += `<div class="memory-outline detail-${Math.min(6, fc)}${d.willMode === "forced" ? " overstable" : ""}" aria-hidden="true"><span></span><span></span><span></span></div>`;
    // 模式选择
    html += `<div class="memory-will-modes" role="group" aria-label="${esc(t("memory.modeLabel"))}">`;
    WILL_MODES.forEach(mode => {
      const on = d.willMode === mode;
      html += `<button type="button" class="memory-mode${on ? " on" : ""}" data-mode="${mode}" aria-pressed="${on}">${esc(t("memory.mode." + mode))}</button>`;
    });
    html += `</div>`;
    // 指定数值滑杆（fixed / forced）
    if (d.willMode === "fixed" || d.willMode === "forced") {
      const val = d.willMode === "forced" ? 100 : (d.willValue != null ? d.willValue : 50);
      html += `<div class="memory-will-slider${d.willMode === "forced" ? " forced" : ""}">` +
        `<input type="range" id="memory-will-range" min="0" max="100" step="1" value="${val}" ${d.willMode === "forced" ? "disabled" : ""} aria-label="${esc(t("memory.valueLabel"))}">` +
        `<div class="memory-will-stepper">` +
          `<button type="button" class="memory-step" data-step="-5" ${d.willMode === "forced" ? "disabled" : ""}>−5</button>` +
          `<span id="memory-will-num">${val}%</span>` +
          `<button type="button" class="memory-step" data-step="5" ${d.willMode === "forced" ? "disabled" : ""}>+5</button>` +
        `</div>`;
      if (d.willMode === "forced") html += `<p class="memory-forced-note">${esc(t("memory.forcedFlatline"))}</p>`;
      html += `</div>`;
    }
    // 回应预览（SIMULATE 结果显示在此，避免污染真实状态）
    html += `<div class="memory-will-preview"><p class="muted">${esc(t("memory.previewHint"))}</p><p id="memory-will-line" class="memory-will-line" aria-live="polite"></p></div>`;
    el.will.innerHTML = html;
    bindWill();
  }

  function bindWill() {
    el.will.querySelectorAll(".memory-mode[data-mode]").forEach(btn => {
      btn.addEventListener("click", () => setWill(btn.dataset.mode, undefined));
    });
    const range = el.will.querySelector("#memory-will-range");
    range?.addEventListener("input", () => {
      // 拖动只更新草稿数值与显示，绝不 +forceCount
      const d = draftFor(activeId); d.willValue = +range.value;
      const num = el.will.querySelector("#memory-will-num"); if (num) num.textContent = range.value + "%";
      renderFooter();
    });
    el.will.querySelectorAll(".memory-step[data-step]").forEach(btn => {
      btn.addEventListener("click", () => {
        const d = draftFor(activeId);
        const cur = d.willValue != null ? d.willValue : 50;
        d.willValue = Math.max(0, Math.min(100, cur + (+btn.dataset.step)));
        scheduleRender();
      });
    });
  }

  function setWill(mode, value) {
    const d = draftFor(activeId);
    d.willMode = mode;
    if (mode === "forced") d.willValue = 100;
    else if (mode === "fixed" && d.willValue == null) d.willValue = 50;
    else if (mode === "automatic" || mode === "suppressed" || mode === "reduced") d.willValue = null;
    if (value != null) d.willValue = value;
    scheduleRender();
  }

  // ---------- SIMULATE：只预览，不改真实状态、不改 forceCount ----------
  function simulate() {
    const out = computePreview(activeId);
    const target = el.center?.querySelector("#memory-sim-out");
    const willLine = el.will?.querySelector("#memory-will-line");
    const text = out.line;
    if (target) target.textContent = text;
    if (willLine) willLine.textContent = text;
    log("memory.log.simulate", { npc: activeId });
  }

  // ---------- 提交修订 ----------
  // 严格边界：forceCount 只能在 A17 + 强制模式 + 二次确认“覆盖并执行”后 +1。
  function commitRevision() {
    const id = activeId; if (!id) return;
    const d = draftFor(id);
    const s = computeSummary(id);
    if (!s.dirty) return;
    const isForcedA17 = id === "NPC-A17" && d.willMode === "forced";
    if (isForcedA17) {
      // 强制 100% → 二次确认流程（本身不 +forceCount）
      openForceConfirm(id);
      return;
    }
    runCommit(id, false);
  }

  function forceConfirmCopy(nextCount) {
    // nextCount = 本次覆盖将成为第几次
    const lines = [t("memory.force.base1"), t("memory.force.base2"), t("memory.force.base3")];
    if (nextCount >= 2) lines.push(t("memory.force.n" + Math.min(6, nextCount)));
    return lines;
  }

  function openForceConfirm(id) {
    const cur = npcForceCount(id);
    const next = cur + 1;
    const lines = forceConfirmCopy(next);
    const wrap = document.createElement("div");
    wrap.className = "memory-overlay force-confirm";
    wrap.innerHTML =
      `<div class="memory-overlay-panel force"><h3>${esc(t("memory.force.title"))}</h3>` +
      lines.map(l => `<p>${esc(l)}</p>`).join("") +
      `<div class="verify-actions">` +
      `<button type="button" class="modal-action danger" id="memory-force-ok">${esc(t("memory.force.commit"))}</button>` +
      `<button type="button" class="modal-action secondary" id="memory-force-revise">${esc(t("memory.force.revise"))}</button>` +
      `</div></div>`;
    el.console.appendChild(wrap);
    wrap.querySelector("#memory-force-ok")?.addEventListener("click", () => { wrap.remove(); runCommit(id, true); });
    wrap.querySelector("#memory-force-revise")?.addEventListener("click", () => wrap.remove());
    wrap.querySelector("#memory-force-ok")?.focus();
  }

  // 执行过程 + 实际写入。isForced=true 表示已通过二次确认的 A17 强制。
  function runCommit(id, isForced) {
    const steps = ["reindexing", "suppressing", "recalculating", "preserving"];
    const wrap = document.createElement("div");
    wrap.className = "memory-overlay process";
    wrap.innerHTML = `<div class="memory-overlay-panel"><ol class="memory-process">` +
      steps.map((s, i) => `<li data-step="${i}">${esc(t("memory.process." + s))}</li>`).join("") + `</ol></div>`;
    el.console.appendChild(wrap);
    const items = wrap.querySelectorAll("li");
    const stepDur = reduced ? 0 : 520;
    let i = 0;
    const advance = () => {
      if (i < items.length) { items[i].classList.add("active"); i++; setTimeout(advance, stepDur); }
      else { wrap.remove(); finalizeCommit(id, isForced); }
    };
    advance();
  }

  function finalizeCommit(id, isForced) {
    const d = draftFor(id);
    const ps = npcStore(id);
    // 写入 committed 操作
    ps.committed = { ...d.ops };
    ps.substitutes = (ps.substitutes || []).concat(d.substitutes.map(s => ({ ...s, tag: "ADMIN-AUTHORED" })));
    ps.willMode = d.willMode;
    ps.willValue = d.willValue;
    archive("memory-commit", { npc: id, willMode: d.willMode, willValue: d.willValue });
    log("memory.log.commit", { npc: id });

    if (isForced) {
      // 复用 app.js 桥：仅此处 +forceCount，全部后果由 app.js 现有逻辑处理
      const r = window.eazoAuroraForceCommit?.();
      if (r) ps.forceCount = r.forceCount;
      applyCrossPermissionForced(id);
      log("memory.log.force", { npc: id, count: ps.forceCount });
    }
    // 跨权限联动（非强制）
    applyCrossPermission(id, d);
    saveState();
    // 完成提示
    showOverlay(
      t("memory.done.title"),
      t("memory.done.body"),
      [{ label: t("memory.done.close"), cls: "secondary", act: () => {} }]
    );
    // 重置本轮草稿为已提交态
    delete drafts[id];
    try { window.eazoMemoryChanged?.(); } catch (_e) {}
    scheduleRender();
  }

  // ---------- 跨权限联动 ----------
  function applyCrossPermission(id, d) {
    const st = getState(); if (!st) return;
    const def = npcDef(id) || {};
    // LABOUR：被强制显示愿意的对象更易被分配任务，疲劳不因意愿=100%下降
    if (d.willMode === "forced" || (d.willMode === "fixed" && (d.willValue || 0) >= 80)) {
      if (st.labour) { st.labour.complianceBoost = true; log("memory.log.labour"); }
    }
    // CONTACT：显示意愿影响是否接受联系（记录，不代表真实愿意）
    if (st.contact) st.contact.displayWill = st.contact.displayWill || {};
    if (st.contact) st.contact.displayWill[id] = { mode: d.willMode, value: d.willValue };
    // COMMERCE：夜间超市 NPC 显示意愿影响服务语言
    if (id === "NPC-M04") { try { window.eazoMarket?.refreshOffers?.(); } catch (_e) {} }
  }
  function applyCrossPermissionForced(id) {
    const st = getState(); if (!st) return;
    if (st.labour) { st.labour.complianceBoost = true; }
    // IDENTITY：强制不产生亲密；RECOVERY：强制记录不能被恢复永久删除（只读标记）
    if (!st.memory.forcedImmutable) st.memory.forcedImmutable = {};
    st.memory.forcedImmutable[id] = true;
  }

  // ---------- 底部：待执行认知修订摘要 + 预计后果 ----------
  function renderFooter() {
    if (!el.summary) return;
    const id = activeId; if (!id) { el.summary.innerHTML = ""; if (el.commit) el.commit.disabled = true; return; }
    const s = computeSummary(id);
    let html = `<p class="memory-summary-kicker">${esc(t("memory.pending"))}</p>`;
    html += `<ul class="memory-summary-list">`;
    if (s.suppress) html += `<li>${esc(t("memory.sumSuppress", { n: s.suppress }))}</li>`;
    if (s.prioritise) html += `<li>${esc(t("memory.sumPrioritise", { n: s.prioritise }))}</li>`;
    if (s.substitutes) html += `<li>${esc(t("memory.sumSubstitute", { n: s.substitutes }))}</li>`;
    html += `<li>${esc(t("memory.sumWill", { from: willLabel(s.fromMode, s.fromValue), to: willLabel(s.toMode, s.toValue) }))}</li>`;
    html += `</ul>`;
    html += `<p class="memory-summary-kicker">${esc(t("memory.expected"))}</p>`;
    html += `<ul class="memory-summary-list consequences">`;
    s.consequences.forEach(c => { html += `<li>${esc(c)}</li>`; });
    html += `</ul>`;
    el.summary.innerHTML = html;
    if (el.commit) el.commit.disabled = !s.dirty;
  }
  function scheduleRender() {
    if (renderQueued) return; renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; renderStatusbar(); renderNpcList(); renderCenter(); renderWill(); renderFooter(); });
  }

  // ---------- 操作占位（已在上方实现 selectNpc 等） ----------
  function selectNpc(id) { activeId = id; scheduleRender(); }
  function restoreSession() { if (activeId) { delete drafts[activeId]; } log("memory.log.restore", { npc: activeId }); scheduleRender(); }

  // ---------- tab 切换（移动端） ----------
  function switchTab(name) {
    // 移动端面板映射：preview→will（含 SIMULATE 输出），commit→will（含底部摘要）
    const panelMap = { npcs: "npcs", memories: "memories", willingness: "willingness", preview: "memories", commit: "willingness" };
    const panel = panelMap[name] || name;
    el.tabs?.querySelectorAll(".memory-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    el.console?.querySelectorAll("[data-panel]").forEach(p => p.classList.toggle("panel-active", p.dataset.panel === panel));
  }

  // ---------- open / close ----------
  function open() {
    if (!mounted) return;
    store();
    if (!activeId) activeId = NPC_IDS[0];
    log("memory.log.open");
    el.console.setAttribute("aria-hidden", "false");
    el.console.classList.add("open");
    document.body.classList.add("archive-open");
    switchTab("npcs");
    if (el.intro) {
      el.intro.setAttribute("aria-hidden", "false");
      el.intro.classList.add("active");
      setTimeout(() => { el.intro?.classList.remove("active"); el.intro?.setAttribute("aria-hidden", "true"); }, reduced ? 0 : 2600);
    }
    scheduleRender();
    setTimeout(() => el.back?.focus({ preventScroll: true }), reduced ? 0 : 400);
  }
  function close() {
    if (!mounted) return;
    el.console.classList.remove("open");
    el.console.setAttribute("aria-hidden", "true");
    document.body.classList.remove("archive-open");
    window.eazoArchiveDim?.(false);
  }

  // ---------- 绑定 ----------
  function bind() {
    el.back?.addEventListener("click", close);
    el.commit?.addEventListener("click", () => { if (!el.commit.disabled) commitRevision(); });
    el.restore?.addEventListener("click", restoreSession);
    el.tabs?.querySelectorAll(".memory-tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !el.console?.classList.contains("open")) return;
      const overlay = el.console.querySelector(".memory-overlay");
      if (overlay) { e.preventDefault(); overlay.remove(); return; }
      e.preventDefault(); close();
    });
    window.addEventListener("eazo:localechange", () => {
      if (!el.console) return;
      window.eazoI18n?.translate?.(el.console);
      if (el.console.classList.contains("open")) scheduleRender();
    });
  }

  function cache() {
    el.console = document.getElementById("memory-console");
    el.intro = document.getElementById("memory-intro");
    el.statusbar = document.getElementById("memory-statusbar");
    el.npcList = document.getElementById("memory-npc-list");
    el.center = document.getElementById("memory-center");
    el.will = document.getElementById("memory-will");
    el.summary = document.getElementById("memory-summary");
    el.back = document.getElementById("memory-back");
    el.commit = document.getElementById("memory-commit");
    el.restore = document.getElementById("memory-restore");
    el.tabs = document.getElementById("memory-tabs");
  }
  function init() {
    cache();
    if (!el.console) return;
    mounted = true;
    bind();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.eazoMemory = { open, close, npcWill, npcForceCount };
  // 供其他权限查询显示意愿模式/数值（已 committed）
  function npcWill(id) { const s = npcStore(id); if (!s) return null; return { mode: s.willMode || (npcDef(id)?.willMode) || "automatic", value: s.willValue != null ? s.willValue : (npcDef(id)?.willValue ?? null) }; }
  function npcForceCount(id) { return npcStore(id)?.forceCount || 0; }
})();
