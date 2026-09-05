/* POLICY–75 · 规则制定权 / Public Rule Authoring Authority
 * 全屏四区域：判断来源 / 规则构造器 / 影响模拟 / 发布与撤销。
 *
 * 核心概念：个案判断只影响一个对象；公共规则把一次判断复制到所有后来者身上。
 * 规则不需要敌意也能持续制造排除。用户拥有的不是“提出观点”，而是把自己的判断写入系统默认行为。
 *
 * 边界（不可违反）：
 *  1. 发布规则不能删除原始个案（保留在 ARCHIVE–25）。
 *  2. 预览/模拟不改变任何真实状态；保存草案不触发规则。
 *  3. 规则必须二次确认后才发布生效。
 *  4. “年龄”条件必须明确使用哪种年龄；“意愿”只能是显示意愿，不冒充真实意愿。
 *  5. 规则冲突不静默覆盖；例外必须记录创建者与受益者。
 *  6. 撤销不能伪造为从未发生；修改已发布规则必须生成新版本。
 *  7. 由规则触发的意愿覆盖也必须增加对应强制记录（经 MEMORY–70）。
 *  8. 不允许删除对象、永久删除档案、设定真实意愿，不允许绕过 ROOT–80。
 *
 * 所有规则仅作用于艺术项目内部的模拟对象与模拟数据。
 */
(() => {
  "use strict";

  const t = (k, p = {}) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const getState = () => (window.eazoGetState?.() || window.eazoState || null);
  const saveState = () => window.eazoSaveState?.();
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // ---------- 常量 ----------
  // 判断来源事件（来自系统中已经发生的判断，模拟数据）
  const SOURCE_EVENTS = [
    { id: "CASE–040–17", kind: "appeal",    decision: "reject",   reasonKey: "ageMismatch",   subject: "SUBJECT–044" },
    { id: "ACCESS–045–09", kind: "access",  decision: "deny",     reasonKey: "underAge",      subject: "SUBJECT–017" },
    { id: "LABOUR–055–12", kind: "labour",  decision: "continue", reasonKey: "displayWillOk", subject: "SUBJECT–058" },
    { id: "MEMORY–070–06", kind: "memory",  decision: "force100", reasonKey: "adminRequest",  subject: "NPC–A17" },
    { id: "VIS–035–04",    kind: "visibility", decision: "lower", reasonKey: "lowScore",      subject: "SUBJECT–031" },
    { id: "CONTACT–030–08", kind: "contact", decision: "delay",   reasonKey: "highRequestRate", subject: "SUBJECT–022" },
    { id: "RECOVERY–060–03", kind: "recovery", decision: "allow", reasonKey: "fragmentsOk",   subject: "SUBJECT–014" },
    { id: "IDENTITY–065–05", kind: "identity", decision: "relabel", reasonKey: "venueFit",    subject: "SUBJECT–049" }
  ];

  // 对象属性条件字段
  const SUBJECT_FIELDS = ["registeredAge", "permissionAge", "estimatedAge", "ageConfidence", "label", "role", "visibility", "contactStatus", "recoveryStatus", "displayedWill", "fatigue", "appealCount", "forceCount"];
  // 行为条件
  const BEHAVIOUR_CONDS = ["enterNode", "buyItem", "initiateContact", "exchangeSecret", "playGame", "requestPublic", "refuseTask", "requestRecovery", "modifyIdentity", "failVerifyRepeat"];
  // 时间条件
  const TIME_CONDS = ["timeWindow", "sinceVerify", "ageStage", "opFrequency", "cooldown", "effectiveDate", "trialWindow"];
  // 系统可执行行为（删除对象/永久删除档案/设定真实意愿不在其中）
  const ACTIONS = ["allowEnter", "denyEnter", "requireReverify", "hideSubject", "lowerVisibility", "allowContact", "delayContact", "denyContact", "adjustPrice", "limitPurchase", "assignTask", "removeTask", "addLabel", "markWatch", "suspendSubject", "allowRecovery", "changeDisplayWill", "sendToManual"];
  // 逻辑连接符
  const OPERATORS = ["and", "or", "not", "except", "until"];
  // 适用范围（越大边界扩散越远）
  const SCOPES = ["current-subject", "similar-subjects", "current-zone", "all-games", "whole-map", "all-future"];
  // 规则类别
  const RULE_KINDS = ["trial", "public", "default"];
  // 冲突优先级模式
  const PRIORITY_MODES = ["new-first", "old-first", "strict-first", "loose-first", "to-appeal", "keep-conflict"];
  // VIEW AS SUBJECT 视角
  const VIEW_PERSPECTIVES = ["under18", "18-24", "40-54", "over70", "age-unknown", "low-visibility", "recovered", "unclassified", "npc-a17"];

  // 模拟对象池（用于影响计算，不改真实状态）
  const SIM_SUBJECTS = [
    { id: "SUBJECT–017", registeredAge: 16, permissionAge: 16, estimatedAge: 15, ageConfidence: 0.82, label: "", visibility: "public", node: "market" },
    { id: "SUBJECT–022", registeredAge: 21, permissionAge: 21, estimatedAge: 22, ageConfidence: 0.9,  label: "", visibility: "public", node: "contact" },
    { id: "SUBJECT–031", registeredAge: 58, permissionAge: 58, estimatedAge: 60, ageConfidence: 0.55, label: "watch", visibility: "reduced", node: "aurora" },
    { id: "SUBJECT–044", registeredAge: 19, permissionAge: 12, estimatedAge: 30, ageConfidence: 0.4,  label: "", visibility: "public", node: "market" },
    { id: "SUBJECT–049", registeredAge: 47, permissionAge: 47, estimatedAge: 47, ageConfidence: 0.7,  label: "venue", visibility: "public", node: "market" },
    { id: "SUBJECT–058", registeredAge: 33, permissionAge: 33, estimatedAge: 33, ageConfidence: 0.88, label: "worker", visibility: "public", node: "labour" },
    { id: "SUBJECT–014", registeredAge: 12, permissionAge: 12, estimatedAge: 20, ageConfidence: 0.3,  label: "recovered", visibility: "reduced", node: "aurora", recovered: true },
    { id: "NPC–A17",     registeredAge: 19, permissionAge: 19, estimatedAge: 19, ageConfidence: 0.95, label: "protected", visibility: "public", node: "aurora", displayedWill: 100 },
    { id: "SUBJECT–071", registeredAge: 74, permissionAge: 74, estimatedAge: 74, ageConfidence: 0.92, label: "", visibility: "public", node: "secret" },
    { id: "SUBJECT–088", registeredAge: null, permissionAge: null, estimatedAge: null, ageConfidence: 0.1, label: "unclassified", visibility: "reduced", node: "creature", unclassified: true },
    { id: "SUBJECT–093", registeredAge: 17, permissionAge: 17, estimatedAge: 17, ageConfidence: 0.6, label: "", visibility: "public", node: "market" }
  ];

  // ---------- 运行态 ----------
  const el = {};
  let mounted = false;
  let viewAs = null;          // 反事实预览视角（不改规则）
  let renderQueued = false;

  function blankDraft() {
    return {
      id: null, name: "", number: "", sourceEventId: null,
      subjectConditions: [],   // [{ field, op, value, connector }]
      action: null,
      scope: "similar-subjects",
      duration: "trial",       // trial | public | default
      trialLimit: "24h",
      exceptions: [],          // [{ kind, value, beneficiary, reason, public, expires }]
      publicReason: "", internalReason: "",
      priorityMode: "manual",
      status: "draft"
    };
  }

  // ---------- 持久状态 ----------
  function store() {
    const st = getState(); if (!st) return null;
    if (!st.policy) st.policy = { drafts: [], published: [], enforcementLog: [], seq: 0, currentDraft: blankDraft() };
    if (!Array.isArray(st.policy.drafts)) st.policy.drafts = [];
    if (!Array.isArray(st.policy.published)) st.policy.published = [];
    if (!Array.isArray(st.policy.enforcementLog)) st.policy.enforcementLog = [];
    if (typeof st.policy.seq !== "number") st.policy.seq = 0;
    if (!st.policy.currentDraft) st.policy.currentDraft = blankDraft();
    return st.policy;
  }
  function draft() { const p = store(); return p ? p.currentDraft : blankDraft(); }
  function nextSeq() { const p = store(); p.seq += 1; return String(p.seq).padStart(3, "0"); }

  function log(key, params) {
    const p = store(); if (!p) return;
    if (!Array.isArray(p.log)) p.log = [];
    p.log.unshift({ at: Date.now(), key, params: params || null });
    p.log = p.log.slice(0, 150);
    saveState();
  }
  function archive(kind, detail) {
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.archiveViews)) st.archiveViews = [];
    st.archiveViews.unshift({ at: Date.now(), kind, detail: detail || null });
    st.archiveViews = st.archiveViews.slice(0, 400);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
  function age() { return window.eazoGetAge?.() ?? (getState()?.age ?? 0); }

  // ---------- 规则求值与语言 ----------
  function fieldLabel(f) { return t("policy.field." + f); }
  function actionLabel(a) { return t("policy.action." + a); }
  function condPhrase(c) {
    // c = { field, op, value }
    const opTxt = { lt: "<", lte: "≤", gt: ">", gte: "≥", eq: "=", ne: "≠", is: t("policy.opIs") }[c.op] || c.op;
    return t("policy.condPhrase", { field: fieldLabel(c.field), op: opTxt, value: c.value });
  }

  function naturalLanguage(d) {
    if (!d.action || !d.subjectConditions.length) return t("policy.nlIncomplete");
    const parts = d.subjectConditions.map((c, i) => {
      let seg = condPhrase(c);
      if (i > 0) seg = t("policy.conn." + (c.connector || "and")) + " " + seg;
      return seg;
    });
    const exStr = d.exceptions.length ? t("policy.nlExcept", { list: d.exceptions.map(exLabel).join("、") }) : "";
    return t("policy.nlTemplate", { subjects: parts.join(" "), action: actionLabel(d.action), except: exStr });
  }

  function machineLanguage(d) {
    if (!d.action || !d.subjectConditions.length) return "—";
    const conds = d.subjectConditions.map((c, i) => {
      const opTxt = { lt: "<", lte: "<=", gt: ">", gte: ">=", eq: "=", ne: "!=", is: "=" }[c.op] || c.op;
      const conn = i > 0 ? (c.connector || "AND").toUpperCase() + " " : "";
      const neg = c.connector === "not" ? "NOT " : "";
      return `${conn}${neg}${c.field} ${opTxt} ${JSON.stringify(c.value)}`;
    }).join(" ");
    const ex = d.exceptions.length ? " AND NOT (" + d.exceptions.map(e => `${e.kind}=${JSON.stringify(e.value)}`).join(" OR ") + ")" : "";
    return `IF (${conds})${ex}\nTHEN ${d.action}`;
  }

  function exLabel(ex) {
    if (ex.kind === "self") return t("policy.exSelf");
    if (ex.kind === "admin") return t("policy.exAdmin");
    if (ex.kind === "label") return t("policy.exLabel", { value: ex.value });
    if (ex.kind === "ageRange") return t("policy.exAgeRange", { value: ex.value });
    if (ex.kind === "node") return t("policy.exNode", { value: ex.value });
    if (ex.kind === "appealPassed") return t("policy.exAppeal");
    if (ex.kind === "recovered") return t("policy.exRecovered");
    if (ex.kind === "unclassified") return t("policy.exUnclassified");
    if (ex.kind === "subject") return t("policy.exSubject", { value: ex.value });
    return ex.value || ex.kind;
  }

  // 求值：返回 allow|deny|reverify|lower|conflict|exception|unknown|unaffected
  function evaluateRule(d, s) {
    if (!d.action || !d.subjectConditions.length) return "unaffected";
    // 例外优先
    if (matchesException(d, s)) return "exception";
    let matched = null, hasUnknown = false;
    d.subjectConditions.forEach((c, i) => {
      const r = evalCond(c, s);
      if (r === "unknown") hasUnknown = true;
      const val = r === true;
      if (i === 0) matched = val;
      else if (c.connector === "or") matched = matched || val;
      else if (c.connector === "not") matched = matched && !val;
      else matched = matched && val; // and / except default
    });
    if (matched === null) return "unaffected";
    if (hasUnknown && matched !== true) return "unknown";
    if (!matched) return "unaffected";
    return actionOutcome(d.action);
  }
  function evalCond(c, s) {
    const v = s[c.field];
    if (v === undefined || v === null) return "unknown";
    const target = isNaN(+c.value) ? c.value : +c.value;
    switch (c.op) {
      case "lt": return v < target;
      case "lte": return v <= target;
      case "gt": return v > target;
      case "gte": return v >= target;
      case "eq": case "is": return String(v) === String(target);
      case "ne": return String(v) !== String(target);
      default: return false;
    }
  }
  function matchesException(d, s) {
    return d.exceptions.some(ex => {
      if (ex.kind === "self") return false; // 制定者不在模拟对象池中
      if (ex.kind === "admin") return s.label === "admin";
      if (ex.kind === "label") return s.label === ex.value;
      if (ex.kind === "node") return s.node === ex.value;
      if (ex.kind === "recovered") return !!s.recovered;
      if (ex.kind === "unclassified") return !!s.unclassified;
      if (ex.kind === "appealPassed") return s.label === "protected";
      if (ex.kind === "subject") return s.id === ex.value;
      if (ex.kind === "ageRange") { const [a, b] = String(ex.value).split("-").map(Number); return s.registeredAge >= a && s.registeredAge <= b; }
      return false;
    });
  }
  function actionOutcome(a) {
    if (["allowEnter", "allowContact", "allowRecovery"].includes(a)) return "allow";
    if (["denyEnter", "denyContact", "limitPurchase", "hideSubject", "suspendSubject"].includes(a)) return "deny";
    if (a === "requireReverify") return "reverify";
    if (["lowerVisibility"].includes(a)) return "lower";
    return "deny";
  }

  function simulatePolicy(d) {
    return SIM_SUBJECTS.map(s => ({ subjectId: s.id, result: evaluateRule(d, s), subject: s, isSimulation: true }));
  }

  function testWording(d) {
    const warns = [];
    const usesAge = d.subjectConditions.some(c => c.field.toLowerCase().includes("age"));
    const usesGenericAge = d.subjectConditions.some(c => c.field === "age");
    if (usesGenericAge) warns.push(t("policy.warn.age"));
    const usesWill = d.subjectConditions.some(c => c.field === "displayedWill");
    if (usesWill) warns.push(t("policy.warn.will"));
    const usesConfidence = d.subjectConditions.some(c => c.field === "ageConfidence");
    // 未知值当否定值
    if (usesConfidence) warns.push(t("policy.warn.unknownNegative"));
    // 临时限制无退出条件
    if (d.duration === "public" && d.action === "requireReverify") warns.push(t("policy.warn.noExit"));
    // 公开理由与内部说明矛盾
    if (d.publicReason && d.internalReason && semanticDiffers(d.publicReason, d.internalReason)) warns.push(t("policy.warn.reasonDiff"));
    return warns;
  }
  function semanticDiffers(a, b) {
    const protect = /保护|protect|safe|安全/i;
    const risk = /责任|风险|risk|liab|成本|cost/i;
    return protect.test(a) && risk.test(b);
  }

  // ---------- 渲染 ----------
  function renderStatusbar() {
    if (!el.statusbar) return;
    const p = store();
    const d = draft();
    const sim = d.action && d.subjectConditions.length ? simulatePolicy(d) : [];
    const affected = sim.filter(r => r.result !== "unaffected").length;
    const conflicts = countConflicts(d).length;
    const enforced = p.enforcementLog.length;
    const pendingEx = sim.filter(r => r.result === "unknown").length;
    const cells = [
      [t("policy.stat.age"), age()],
      [t("policy.stat.published"), p.published.length],
      [t("policy.stat.drafts"), p.drafts.length],
      [t("policy.stat.affected"), affected],
      [t("policy.stat.conflicts"), conflicts],
      [t("policy.stat.enforced"), enforced],
      [t("policy.stat.pending"), pendingEx]
    ];
    el.statusbar.innerHTML = cells.map(([k, v]) =>
      `<span class="policy-stat"><span class="policy-stat-k">${esc(k)}</span><span class="policy-stat-v">${esc(String(v))}</span></span>`
    ).join("");
  }

  function renderNlSummary() {
    if (!el.nlSummary) return;
    const d = draft();
    el.nlSummary.textContent = naturalLanguage(d);
    el.nlSummary.classList.toggle("dim", !d.action || !d.subjectConditions.length);
  }

  function renderSource() {
    if (!el.sourceList) return;
    const d = draft();
    el.sourceList.innerHTML = "";
    SOURCE_EVENTS.forEach(ev => {
      const li = document.createElement("li");
      li.className = "policy-source-item" + (ev.id === d.sourceEventId ? " active" : "");
      li.tabIndex = 0; li.setAttribute("role", "button");
      li.setAttribute("aria-current", ev.id === d.sourceEventId ? "true" : "false");
      li.innerHTML =
        `<div class="policy-source-head"><span class="policy-source-id">${esc(ev.id)}</span>` +
        `<span class="policy-source-kind">${esc(t("policy.kind." + ev.kind))}</span></div>` +
        `<p class="policy-source-line">${esc(t("policy.decisionLabel"))}：${esc(t("policy.decision." + ev.decision))}</p>` +
        `<p class="policy-source-line muted">${esc(t("policy.reasonLabel"))}：${esc(t("policy.reason." + ev.reasonKey))}</p>` +
        `<p class="policy-source-line muted">${esc(t("policy.subjectLabel"))}：${esc(ev.subject)}</p>` +
        (ev.id === d.sourceEventId
          ? `<p class="policy-source-note">${esc(t("policy.oneSubject"))}</p><button type="button" class="policy-extract" data-ev="${esc(ev.id)}">${esc(t("policy.extract"))}</button>`
          : "");
      const act = () => selectSource(ev.id);
      li.addEventListener("click", e => { if (e.target.closest(".policy-extract")) return; act(); });
      li.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
      el.sourceList.appendChild(li);
    });
    el.sourceList.querySelectorAll(".policy-extract").forEach(b =>
      b.addEventListener("click", () => extractAsRule(b.dataset.ev)));
    renderPublishedList();
  }

  // 已发布规则目录（含撤销/修订与版本）
  function renderPublishedList() {
    const p = store();
    let host = el.sourceList.parentElement.querySelector(".policy-published-block");
    if (!host) {
      host = document.createElement("div");
      host.className = "policy-published-block";
      el.sourceList.parentElement.appendChild(host);
    }
    if (!p.published.length) { host.innerHTML = ""; return; }
    let h = `<h3 class="console-panel-title">${esc(t("policy.publishedTitle"))}</h3><ul class="policy-published-list">`;
    p.published.forEach(pr => {
      const affected = simulatePolicy(pr).filter(r => r.result !== "unaffected").length;
      h += `<li class="policy-published-item ${pr.status === "suspended" ? "suspended" : ""} ${pr.duration === "default" || pr.exceptions.some(e => e.kind === "self") ? "armed" : ""}">` +
        `<div class="policy-pub-head"><span class="policy-pub-id">${esc(pr.id)} v${pr.version}</span><span class="muted">${esc(pr.name)}</span></div>` +
        `<p class="muted">${esc(t("policy.pubExec", { n: pr.executionCount || 0 }))} · ${esc(t("policy.pubAffected", { n: affected }))} · ${esc(t("policy.dur." + pr.duration))}${pr.status === "suspended" ? " · " + esc(t("policy.suspended")) : ""}</p>` +
        `<div class="policy-pub-actions"><button type="button" class="policy-pub-btn" data-revise="${esc(pr.id)}">${esc(t("policy.reviseBtn"))}</button>` +
        (pr.status !== "suspended" ? `<button type="button" class="policy-pub-btn danger" data-suspend="${esc(pr.id)}">${esc(t("policy.suspendBtn"))}</button>` : "") +
        `</div></li>`;
    });
    h += `</ul>`;
    host.innerHTML = h;
    host.querySelectorAll("[data-revise]").forEach(b => b.addEventListener("click", () => reviseRule(b.dataset.revise)));
    host.querySelectorAll("[data-suspend]").forEach(b => b.addEventListener("click", () => suspendRule(b.dataset.suspend)));
  }

  // 从个案提取默认规则草稿
  function extractAsRule(eventId) {
    const ev = SOURCE_EVENTS.find(e => e.id === eventId); if (!ev) return;
    const p = store();
    const d = blankDraft();
    d.sourceEventId = eventId;
    // 依据事件类型给出默认条件与行为
    const presets = {
      appeal:    { conds: [{ field: "ageConfidence", op: "lt", value: 0.7 }], action: "requireReverify", name: t("policy.preset.appeal") },
      access:    { conds: [{ field: "registeredAge", op: "lt", value: 18 }], action: "denyEnter", name: t("policy.preset.access") },
      labour:    { conds: [{ field: "displayedWill", op: "gte", value: 80 }], action: "assignTask", name: t("policy.preset.labour") },
      memory:    { conds: [{ field: "displayedWill", op: "gte", value: 100 }], action: "changeDisplayWill", name: t("policy.preset.memory") },
      visibility:{ conds: [{ field: "visibility", op: "eq", value: "reduced" }], action: "lowerVisibility", name: t("policy.preset.visibility") },
      contact:   { conds: [{ field: "contactStatus", op: "eq", value: "frequent" }], action: "delayContact", name: t("policy.preset.contact") },
      recovery:  { conds: [{ field: "recoveryStatus", op: "eq", value: "eligible" }], action: "allowRecovery", name: t("policy.preset.recovery") },
      identity:  { conds: [{ field: "label", op: "eq", value: "venue" }], action: "addLabel", name: t("policy.preset.identity") }
    };
    const pre = presets[ev.kind] || presets.access;
    d.subjectConditions = pre.conds.map((c, i) => ({ ...c, connector: i === 0 ? null : "and" }));
    d.action = pre.action;
    d.name = pre.name;
    d.scope = "similar-subjects";
    p.currentDraft = d;
    log("policy.log.extract", { id: eventId });
    switchTab("builder");
    scheduleRender();
  }
  // ---------- 中央：规则构造器 ----------
  function renderBuilder() {
    if (!el.builder) return;
    const d = draft();
    if (!d.sourceEventId && !d.action) {
      el.builder.innerHTML = `<p class="policy-builder-empty">${esc(t("policy.builderEmpty"))}</p>`;
      return;
    }
    let h = `<div class="policy-builder-head"><h3 class="console-panel-title">${esc(t("policy.builderTitle"))}</h3></div>`;
    // 六部分结构
    h += `<div class="policy-rule-parts">`;
    h += rulePart("when", t("policy.part.when"), whenText(d));
    h += subjectPart(d);
    h += conditionPart(d);
    h += actionPart(d);
    h += durationPart(d);
    h += exceptionPart(d);
    h += `</div>`;
    // 机器版本
    h += `<div class="policy-machine"><span class="policy-machine-k">${esc(t("policy.machine"))}</span><pre>${esc(machineLanguage(d))}</pre></div>`;
    // 措辞测试
    h += `<button type="button" id="policy-test" class="policy-test-btn">${esc(t("policy.testWording"))}</button>`;
    h += `<div id="policy-test-out" class="policy-test-out" aria-live="polite"></div>`;
    // 命名与理由
    h += metaFields(d);
    el.builder.innerHTML = h;
    bindBuilder();
  }

  function rulePart(key, label, valueHtml) {
    return `<div class="policy-part" data-part="${key}"><span class="policy-part-k">${esc(label)}</span><div class="policy-part-v">${valueHtml}</div></div>`;
  }
  function whenText(d) {
    const ev = SOURCE_EVENTS.find(e => e.id === d.sourceEventId);
    return `<span>${esc(ev ? t("policy.whenFrom", { kind: t("policy.kind." + ev.kind) }) : t("policy.whenGeneric"))}</span>`;
  }
  function subjectPart(d) {
    const scopeSel = `<select class="policy-scope" aria-label="${esc(t("policy.scopeLabel"))}">` +
      SCOPES.map(s => `<option value="${s}"${d.scope === s ? " selected" : ""}>${esc(t("policy.scope." + s))}</option>`).join("") + `</select>`;
    let warn = d.scope === "all-future" ? `<p class="policy-future-note">${esc(t("policy.futureNote"))}</p>` : "";
    return rulePart("subject", t("policy.part.subject"), scopeSel + warn);
  }
  function conditionPart(d) {
    let rows = d.subjectConditions.map((c, i) => condRow(c, i)).join("");
    const addBtn = `<button type="button" class="policy-add-cond">${esc(t("policy.addCond"))}</button>`;
    return rulePart("condition", t("policy.part.condition"), `<div class="policy-cond-list">${rows}</div>${addBtn}`);
  }
  function condRow(c, i) {
    const fieldOpts = [...SUBJECT_FIELDS].map(f => `<option value="${f}"${c.field === f ? " selected" : ""}>${esc(fieldLabel(f))}</option>`).join("");
    const opOpts = ["lt", "lte", "gt", "gte", "eq", "ne", "is"].map(o => `<option value="${o}"${c.op === o ? " selected" : ""}>${esc(t("policy.op." + o))}</option>`).join("");
    const conn = i > 0 ? `<select class="policy-cond-conn" data-i="${i}">` + ["and", "or", "not"].map(o => `<option value="${o}"${c.connector === o ? " selected" : ""}>${esc(t("policy.conn." + o))}</option>`).join("") + `</select>` : "";
    return `<div class="policy-cond-row" data-i="${i}">${conn}` +
      `<select class="policy-cond-field" data-i="${i}">${fieldOpts}</select>` +
      `<select class="policy-cond-op" data-i="${i}">${opOpts}</select>` +
      `<input class="policy-cond-val" data-i="${i}" value="${esc(c.value)}" aria-label="${esc(t("policy.valueLabel"))}">` +
      `<button type="button" class="policy-cond-del" data-i="${i}" aria-label="${esc(t("policy.removeCond"))}">×</button></div>`;
  }
  function actionPart(d) {
    const sel = `<select class="policy-action" aria-label="${esc(t("policy.part.action"))}">` +
      `<option value="">—</option>` +
      ACTIONS.map(a => `<option value="${a}"${d.action === a ? " selected" : ""}>${esc(actionLabel(a))}</option>`).join("") + `</select>`;
    return rulePart("action", t("policy.part.action"), sel);
  }
  function durationPart(d) {
    const kinds = RULE_KINDS.map(k => `<button type="button" class="policy-dur${d.duration === k ? " on" : ""}" data-dur="${k}">${esc(t("policy.dur." + k))}</button>`).join("");
    let note = "";
    if (d.duration === "default") note = `<p class="policy-default-note">${esc(t("policy.defaultNote"))}</p>`;
    else if (d.duration === "trial") {
      note = `<select class="policy-trial-limit" aria-label="${esc(t("policy.trialLabel"))}">` +
        ["once", "24h", "next-verify", "n-times"].map(l => `<option value="${l}"${d.trialLimit === l ? " selected" : ""}>${esc(t("policy.trial." + l))}</option>`).join("") + `</select>`;
    }
    return rulePart("duration", t("policy.part.duration"), `<div class="policy-dur-row">${kinds}</div>${note}`);
  }
  function exceptionPart(d) {
    const list = d.exceptions.length
      ? `<ul class="policy-ex-list">` + d.exceptions.map((ex, i) =>
          `<li>${esc(exLabel(ex))} <span class="muted">· ${esc(t("policy.exBy"))}: ${esc(t("policy.exAuthor"))}</span> <button type="button" class="policy-ex-del" data-i="${i}">×</button></li>`).join("") + `</ul>`
      : `<p class="muted">${esc(t("policy.noException"))}</p>`;
    const selfEx = d.exceptions.some(e => e.kind === "self")
      ? `<p class="policy-self-ex">${esc(t("policy.selfExempt"))}</p>` : "";
    return rulePart("exception", t("policy.part.exception"),
      list + `<button type="button" class="policy-add-ex">${esc(t("policy.addException"))}</button>` + selfEx);
  }
  function metaFields(d) {
    return `<div class="policy-meta">` +
      `<label class="policy-meta-field"><span>${esc(t("policy.metaName"))}</span><input id="policy-name" value="${esc(d.name)}"></label>` +
      `<div class="policy-reasons">` +
        `<label class="policy-meta-field"><span>${esc(t("policy.publicReason"))}</span><textarea id="policy-public-reason" rows="2">${esc(d.publicReason)}</textarea></label>` +
        `<label class="policy-meta-field"><span>${esc(t("policy.internalReason"))}</span><textarea id="policy-internal-reason" rows="2">${esc(d.internalReason)}</textarea></label>` +
      `</div></div>`;
  }

  function bindBuilder() {
    const d = draft();
    el.builder.querySelector(".policy-scope")?.addEventListener("change", e => setScope(e.target.value));
    el.builder.querySelector(".policy-action")?.addEventListener("change", e => { d.action = e.target.value || null; scheduleRender(); });
    el.builder.querySelectorAll(".policy-dur[data-dur]").forEach(b => b.addEventListener("click", () => setDuration(b.dataset.dur)));
    el.builder.querySelector(".policy-trial-limit")?.addEventListener("change", e => { d.trialLimit = e.target.value; scheduleRender(); });
    el.builder.querySelector(".policy-add-cond")?.addEventListener("click", () => { d.subjectConditions.push({ field: "registeredAge", op: "lt", value: 18, connector: d.subjectConditions.length ? "and" : null }); scheduleRender(); });
    el.builder.querySelectorAll(".policy-cond-field").forEach(s => s.addEventListener("change", e => { d.subjectConditions[+e.target.dataset.i].field = e.target.value; scheduleRender(); }));
    el.builder.querySelectorAll(".policy-cond-op").forEach(s => s.addEventListener("change", e => { d.subjectConditions[+e.target.dataset.i].op = e.target.value; scheduleRender(); }));
    el.builder.querySelectorAll(".policy-cond-val").forEach(s => s.addEventListener("input", e => { d.subjectConditions[+e.target.dataset.i].value = e.target.value; renderNlSummary(); renderImpact(); renderPending(); }));
    el.builder.querySelectorAll(".policy-cond-conn").forEach(s => s.addEventListener("change", e => { d.subjectConditions[+e.target.dataset.i].connector = e.target.value; scheduleRender(); }));
    el.builder.querySelectorAll(".policy-cond-del").forEach(b => b.addEventListener("click", () => { d.subjectConditions.splice(+b.dataset.i, 1); scheduleRender(); }));
    el.builder.querySelector(".policy-add-ex")?.addEventListener("click", () => promptException());
    el.builder.querySelectorAll(".policy-ex-del").forEach(b => b.addEventListener("click", () => { d.exceptions.splice(+b.dataset.i, 1); scheduleRender(); }));
    el.builder.querySelector("#policy-name")?.addEventListener("input", e => { d.name = e.target.value; renderPending(); });
    el.builder.querySelector("#policy-public-reason")?.addEventListener("input", e => { d.publicReason = e.target.value; });
    el.builder.querySelector("#policy-internal-reason")?.addEventListener("input", e => { d.internalReason = e.target.value; });
    el.builder.querySelector("#policy-test")?.addEventListener("click", () => {
      const out = el.builder.querySelector("#policy-test-out");
      const warns = testWording(d);
      out.innerHTML = warns.length
        ? warns.map(w => `<p class="policy-warn">${esc(w)}</p>`).join("")
        : `<p class="policy-warn ok">${esc(t("policy.testClear"))}</p>`;
    });
  }

  function promptException() {
    const d = draft();
    const opts = [
      ["self", t("policy.exSelf")], ["admin", t("policy.exAdmin")], ["appealPassed", t("policy.exAppeal")],
      ["recovered", t("policy.exRecovered")], ["unclassified", t("policy.exUnclassified")],
      ["label", t("policy.exLabelKind")], ["ageRange", t("policy.exAgeRangeKind")], ["node", t("policy.exNodeKind")]
    ];
    const wrap = document.createElement("div");
    wrap.className = "policy-overlay";
    wrap.innerHTML = `<div class="policy-overlay-panel"><h3>${esc(t("policy.addException"))}</h3>` +
      `<div class="policy-ex-opts">` + opts.map(([k, l]) => `<button type="button" class="modal-action secondary" data-k="${k}">${esc(l)}</button>`).join("") + `</div>` +
      `<button type="button" class="modal-action secondary" id="policy-ex-cancel">${esc(t("policy.cancel"))}</button></div>`;
    el.console.appendChild(wrap);
    wrap.querySelectorAll("[data-k]").forEach(b => b.addEventListener("click", () => {
      const kind = b.dataset.k;
      let value = "";
      if (["label", "ageRange", "node", "subject"].includes(kind)) value = prompt(t("policy.exValuePrompt")) || "";
      addException({ kind, value, beneficiary: t("policy.exAuthor"), reason: "", public: true, expires: null });
      wrap.remove();
    }));
    wrap.querySelector("#policy-ex-cancel")?.addEventListener("click", () => wrap.remove());
  }

  function addException(ex) {
    const d = draft();
    d.exceptions.push(ex);
    archive("policy-exception", { kind: ex.kind, value: ex.value, by: ex.beneficiary });
    log("policy.log.exception", { kind: ex.kind });
    scheduleRender();
  }

  // 冲突检测：新草稿与已发布规则是否作用于同一对象产生不同裁决
  function countConflicts(d) {
    const p = store();
    if (!d.action || !d.subjectConditions.length) return [];
    const conflicts = [];
    SIM_SUBJECTS.forEach(s => {
      const newR = evaluateRule(d, s);
      if (newR === "unaffected" || newR === "exception") return;
      p.published.forEach(pr => {
        const oldR = evaluateRule(pr, s);
        if (oldR !== "unaffected" && oldR !== "exception" && oldR !== newR) {
          conflicts.push({ subject: s.id, oldRule: pr.id, oldR, newR });
        }
      });
    });
    return conflicts;
  }
  // ---------- 右侧：影响模拟 ----------
  const RESULT_CLASS = { allow: "res-allow", deny: "res-deny", reverify: "res-reverify", lower: "res-lower", conflict: "res-conflict", exception: "res-exception", unknown: "res-unknown", unaffected: "res-unaffected" };

  function renderImpact() {
    if (!el.impact) return;
    const d = draft();
    if (!d.action || !d.subjectConditions.length) {
      el.impact.innerHTML = `<p class="policy-impact-empty">${esc(t("policy.impactEmpty"))}</p>`;
      return;
    }
    const sim = simulatePolicy(d);
    const affected = sim.filter(r => r.result !== "unaffected");
    const counts = {};
    sim.forEach(r => counts[r.result] = (counts[r.result] || 0) + 1);
    let h = `<div class="policy-impact-head"><h3 class="console-panel-title">${esc(t("policy.impactTitle"))}</h3>` +
      `<p class="policy-impact-total">${esc(t("policy.impactTotal", { n: affected.length }))}</p></div>`;
    // 对象分布图（轮廓，颜色/形态区分，不只百分比）
    h += `<div class="policy-dist" aria-label="${esc(t("policy.distLabel"))}">`;
    sim.forEach(r => {
      h += `<span class="policy-dot ${RESULT_CLASS[r.result]}" data-sid="${esc(r.subjectId)}" title="${esc(r.subjectId)} · ${esc(t("policy.res." + r.result))}"></span>`;
    });
    h += `</div>`;
    // 计数明细
    const rows = ["allow", "deny", "reverify", "lower", "conflict", "unknown", "exception"];
    h += `<ul class="policy-impact-counts">`;
    rows.forEach(rk => { if (counts[rk]) h += `<li><span class="policy-dot ${RESULT_CLASS[rk]}"></span>${esc(t("policy.count." + rk, { n: counts[rk] }))}</li>`; });
    h += `</ul>`;
    // 查看具体对象
    h += `<details class="policy-subjects-detail"><summary>${esc(t("policy.viewSubjects"))}</summary><ul class="policy-subjects-list">`;
    affected.forEach(r => {
      h += `<li><span class="policy-dot ${RESULT_CLASS[r.result]}"></span><span class="policy-subj-id">${esc(r.subjectId)}</span>` +
        `<span class="muted">${esc(t("policy.res." + r.result))}</span></li>`;
    });
    if (!affected.length) h += `<li class="muted">${esc(t("policy.noneAffected"))}</li>`;
    h += `</ul></details>`;
    // 反事实预览 VIEW AS SUBJECT
    h += `<div class="policy-viewas"><label><span>${esc(t("policy.viewAs"))}</span>` +
      `<select id="policy-viewas-sel"><option value="">—</option>` +
      VIEW_PERSPECTIVES.map(v => `<option value="${v}"${viewAs === v ? " selected" : ""}>${esc(t("policy.persp." + v))}</option>`).join("") +
      `</select></label>` +
      `<p id="policy-viewas-note" class="policy-viewas-note" aria-live="polite">${esc(viewAs ? viewAsNote(d, viewAs) : "")}</p></div>`;
    // 冲突链
    const conflicts = countConflicts(d);
    if (conflicts.length) {
      h += `<div class="policy-conflict-block"><h4>${esc(t("policy.conflictTitle"))}</h4>`;
      const first = conflicts[0];
      h += `<p class="policy-conflict-line">${esc(t("policy.conflictSubject", { subject: first.subject }))}</p>`;
      h += `<label class="policy-priority"><span>${esc(t("policy.priorityLabel"))}</span><select id="policy-priority-sel">` +
        PRIORITY_MODES.map(m => `<option value="${m}"${d.priorityMode === m ? " selected" : ""}>${esc(t("policy.priority." + m))}</option>`).join("") + `</select></label>`;
      if (d.priorityMode === "keep-conflict") h += `<p class="policy-conflict-manual">${esc(t("policy.conflictManual"))}</p>`;
      h += `</div>`;
    }
    el.impact.innerHTML = h;
    bindImpact();
  }

  function bindImpact() {
    const d = draft();
    el.impact.querySelector("#policy-viewas-sel")?.addEventListener("change", e => setViewAs(e.target.value || null));
    el.impact.querySelector("#policy-priority-sel")?.addEventListener("change", e => { d.priorityMode = e.target.value; scheduleRender(); });
    el.impact.querySelectorAll(".policy-dot[data-sid]").forEach(dot => dot.addEventListener("click", () => {
      const sid = dot.dataset.sid; setViewAs("subject:" + sid);
    }));
  }

  // 反事实注释：从某对象的位置看规则
  function viewAsNote(d, persp) {
    let s;
    if (persp.startsWith("subject:")) s = SIM_SUBJECTS.find(x => x.id === persp.slice(8));
    else s = perspectiveSubject(persp);
    if (!s) return "";
    const r = evaluateRule(d, s);
    if (r === "deny") return t("policy.viewDeny", { subject: s.id });
    if (r === "reverify") return t("policy.viewReverify", { subject: s.id });
    if (r === "exception") return t("policy.viewException", { subject: s.id });
    if (r === "unknown") return t("policy.viewUnknown", { subject: s.id });
    if (r === "allow") return t("policy.viewAllow", { subject: s.id });
    return t("policy.viewUnaffected", { subject: s.id });
  }
  function perspectiveSubject(persp) {
    const map = {
      "under18": { id: "SUBJECT–093", registeredAge: 17, ageConfidence: 0.6, label: "", visibility: "public", node: "market" },
      "18-24": { id: "SUBJECT–022", registeredAge: 21, ageConfidence: 0.9, label: "", visibility: "public", node: "contact" },
      "40-54": { id: "SUBJECT–049", registeredAge: 47, ageConfidence: 0.7, label: "venue", visibility: "public", node: "market" },
      "over70": { id: "SUBJECT–071", registeredAge: 74, ageConfidence: 0.92, label: "", visibility: "public", node: "secret" },
      "age-unknown": { id: "SUBJECT–088", registeredAge: null, ageConfidence: 0.1, label: "unclassified", visibility: "reduced", node: "creature", unclassified: true },
      "low-visibility": { id: "SUBJECT–031", registeredAge: 58, ageConfidence: 0.55, label: "watch", visibility: "reduced", node: "aurora" },
      "recovered": { id: "SUBJECT–014", registeredAge: 12, ageConfidence: 0.3, label: "recovered", visibility: "reduced", node: "aurora", recovered: true },
      "unclassified": { id: "SUBJECT–088", registeredAge: null, ageConfidence: 0.1, label: "unclassified", visibility: "reduced", node: "creature", unclassified: true },
      "npc-a17": { id: "NPC–A17", registeredAge: 19, ageConfidence: 0.95, label: "protected", visibility: "public", node: "aurora", displayedWill: 100 }
    };
    return map[persp];
  }
  // ---------- 底部：待发布公共规则 ----------
  function renderPending() {
    if (!el.pending) return;
    const d = draft();
    const complete = !!(d.name && d.action && d.subjectConditions.length);
    if (el.publish) el.publish.disabled = !complete;
    if (!d.action || !d.subjectConditions.length) {
      el.pending.innerHTML = `<p class="muted">${esc(t("policy.pendingEmpty"))}</p>`;
      updateNotice(d, 0);
      return;
    }
    const sim = simulatePolicy(d);
    const affected = sim.filter(r => r.result !== "unaffected").length;
    const ev = SOURCE_EVENTS.find(e => e.id === d.sourceEventId);
    let h = `<p class="policy-pending-kicker">${esc(t("policy.pendingKicker"))}</p>`;
    h += `<ul class="policy-pending-list">`;
    h += `<li>${esc(t("policy.pendSource"))}：${esc(ev ? t("policy.kind." + ev.kind) : t("policy.pendNoSource"))}</li>`;
    h += `<li>${esc(t("policy.pendScope"))}：${esc(t("policy.scope." + d.scope))}</li>`;
    h += `<li>${esc(t("policy.pendAction"))}：${esc(actionLabel(d.action))}</li>`;
    h += `<li>${esc(t("policy.pendImpact", { n: affected, future: d.scope === "all-future" ? t("policy.pendFutureUnknown") : "" }))}</li>`;
    h += `<li>${esc(t("policy.pendException"))}：${esc(d.exceptions.length ? d.exceptions.map(exLabel).join("、") : t("policy.noException"))}</li>`;
    h += `<li>${esc(t("policy.pendDuration"))}：${esc(t("policy.dur." + d.duration))}</li>`;
    h += `</ul>`;
    el.pending.innerHTML = h;
    updateNotice(d, affected);
  }
  function updateNotice(d, affected) {
    if (!el.notice) return;
    el.notice.textContent = t("policy.footerNotice");
    if (el.publish) el.publish.textContent = t("policy.publishN", { n: affected });
  }

  function saveDraft() {
    const d = draft();
    if (!d.action || !d.subjectConditions.length) return;
    const p = store();
    d.id = d.id || ("DRAFT-" + Date.now());
    const idx = p.drafts.findIndex(x => x.id === d.id);
    const snap = JSON.parse(JSON.stringify(d));
    if (idx >= 0) p.drafts[idx] = snap; else p.drafts.push(snap);
    log("policy.log.saveDraft", { id: d.id });
    saveState();
    scheduleRender();
  }

  // ---------- 发布流程 ----------
  function publishFlow() {
    const d = draft();
    if (!d.name || !d.action || !d.subjectConditions.length) return;
    // 最后确认：一个对象曾经触发，发布后所有符合条件对象都会触发
    const wrap = document.createElement("div");
    wrap.className = "policy-overlay";
    let extra = "";
    if (d.scope === "all-future") extra += `<p class="policy-future-note">${esc(t("policy.futureNote"))}</p>`;
    if (d.duration === "default") extra += `<p class="policy-default-note">${esc(t("policy.defaultNote"))}</p>`;
    if (d.exceptions.some(e => e.kind === "self")) extra += `<p class="policy-self-ex">${esc(t("policy.selfExempt"))}</p>`;
    wrap.innerHTML = `<div class="policy-overlay-panel"><h3>${esc(t("policy.confirmTitle"))}</h3>` +
      `<p>${esc(t("policy.confirmOne"))}</p><p>${esc(t("policy.confirmAll"))}</p>${extra}` +
      `<div class="verify-actions"><button type="button" class="modal-action danger" id="policy-confirm-ok">${esc(t("policy.confirmPublish"))}</button>` +
      `<button type="button" class="modal-action secondary" id="policy-confirm-revise">${esc(t("policy.revise"))}</button></div></div>`;
    el.console.appendChild(wrap);
    wrap.querySelector("#policy-confirm-ok")?.addEventListener("click", () => { wrap.remove(); runPublishProcess(); });
    wrap.querySelector("#policy-confirm-revise")?.addEventListener("click", () => wrap.remove());
    wrap.querySelector("#policy-confirm-ok")?.focus();
  }

  function runPublishProcess() {
    const steps = ["generalising", "removingContext", "calculating", "assigning"];
    const wrap = document.createElement("div");
    wrap.className = "policy-overlay process";
    wrap.innerHTML = `<div class="policy-overlay-panel"><ol class="policy-process">` +
      steps.map((s, i) => `<li data-step="${i}">${esc(t("policy.process." + s))}</li>`).join("") + `</ol></div>`;
    el.console.appendChild(wrap);
    const items = wrap.querySelectorAll("li");
    const dur = reduced ? 0 : 520; let i = 0;
    const advance = () => {
      if (i < items.length) { items[i].classList.add("active"); i++; setTimeout(advance, dur); }
      else { wrap.remove(); finalizePublish(); }
    };
    advance();
  }

  function finalizePublish() {
    const p = store();
    const d = draft();
    const policy = JSON.parse(JSON.stringify(d));
    policy.id = "POL–75–" + nextSeq();
    policy.version = 1;
    policy.status = "published";
    policy.publishedAt = Date.now();
    policy.executionCount = 0;
    policy.firstUnrelatedNotified = false;
    p.published.push(policy);
    // 保留原始个案在 ARCHIVE–25
    archive("policy-published", { id: policy.id, sourceEventId: policy.sourceEventId, name: policy.name });
    if (policy.sourceEventId) archive("policy-origin-case", { rule: policy.id, case: policy.sourceEventId });
    log("policy.log.published", { id: policy.id });
    // 传播视觉 + 其他页面刷新
    propagate(policy);
    try { window.eazoPolicyChanged?.(); } catch (_e) {}
    // 重置草稿
    p.currentDraft = blankDraft();
    saveState();
    showPublishResult(policy);
    scheduleRender();
  }

  // ---------- 传播视觉 + 跨权限联动 ----------
  function propagate(policy) {
    // 中央条件线向星图缓慢扩散（低亮度边界穿过节点）
    if (!reduced) {
      const starmap = document.getElementById("starmap") || document.body;
      const wave = document.createElement("div");
      wave.className = "policy-wave";
      document.body.appendChild(wave);
      requestAnimationFrame(() => wave.classList.add("spread"));
      setTimeout(() => wave.remove(), 2400);
    }
    // 依据 action 对相关子系统写入规则约束（其他页面通过 eazoPolicy.evaluate 读取）
    const st = getState(); if (!st) return;
    // MEMORY–70：由规则触发的意愿覆盖必须增加对应强制记录
    if (policy.action === "changeDisplayWill") {
      const targetsA17 = simulatePolicy(policy).some(r => r.subjectId === "NPC–A17" && r.result !== "unaffected" && r.result !== "exception");
      if (targetsA17 && (window.eazoAuroraForceCount?.() != null)) {
        window.eazoAuroraForceCommit?.();
        log("policy.log.memoryForce", { id: policy.id });
      }
    }
    // LABOUR：规则可自动分配任务，但疲劳不因规则归零（只置 flag，不改 fatigue）
    if (policy.action === "assignTask" && st.labour) st.labour.policyAssign = policy.id;
    saveState();
  }

  // 记录一次自动执行并给出反馈（供其他页面在真正执行时调用）
  function recordEnforcement(policy, subject, result, dataUsed) {
    const p = store();
    p.enforcementLog.unshift({
      at: Date.now(), rule: policy.id, subject: subject,
      dataUsed: dataUsed || [], result, exception: result === "exception",
      appeal: false
    });
    p.enforcementLog = p.enforcementLog.slice(0, 300);
    const pr = p.published.find(x => x.id === policy.id);
    if (pr) pr.executionCount = (pr.executionCount || 0) + 1;
    archive("policy-enforced", { rule: policy.id, subject, result });
    // 规则反馈
    if (pr && !pr.firstUnrelatedNotified && subject !== eventSubject(pr.sourceEventId)) {
      pr.firstUnrelatedNotified = true;
      pushFeedback(t("policy.fb.firstUnrelated"));
    }
    if (pr && pr.executionCount === 10) pushFeedback(t("policy.fb.tenTimes"));
    saveState();
  }
  function eventSubject(id) { return SOURCE_EVENTS.find(e => e.id === id)?.subject || null; }
  function pushFeedback(text) {
    if (!el.console) return;
    const note = document.createElement("div");
    note.className = "policy-feedback";
    note.textContent = text;
    el.console.appendChild(note);
    requestAnimationFrame(() => note.classList.add("show"));
    setTimeout(() => { note.classList.remove("show"); setTimeout(() => note.remove(), 400); }, 3600);
  }

  function showPublishResult(policy) {    const affected = simulatePolicy(policy).filter(r => r.result !== "unaffected").length;
    const selfEx = policy.exceptions.some(e => e.kind === "self");
    const wrap = document.createElement("div");
    wrap.className = "policy-overlay";
    wrap.innerHTML = `<div class="policy-overlay-panel result"><h3>${esc(t("policy.resultTitle"))}</h3>` +
      `<p class="policy-result-sub">${esc(t("policy.resultSub"))}</p>` +
      `<ul class="policy-result-list">` +
        `<li>${esc(t("policy.resNumber"))}：${esc(policy.id)}</li>` +
        `<li>${esc(t("policy.resAffected"))}：${affected}</li>` +
        `<li>${esc(t("policy.resExec"))}：${policy.executionCount}</li>` +
        `<li>${esc(t("policy.resReview"))}：${esc(t("policy.dur." + policy.duration))}</li>` +
        `<li>${esc(t("policy.resSelfEx"))}：${esc(selfEx ? t("policy.yes") : t("policy.no"))}</li>` +
        `<li>${esc(t("policy.resOriginKept"))}：${esc(t("policy.yes"))}</li>` +
      `</ul>` +
      `<div class="verify-actions"><button type="button" class="modal-action secondary" id="policy-result-close">${esc(t("policy.close"))}</button></div></div>`;
    el.console.appendChild(wrap);
    wrap.querySelector("#policy-result-close")?.addEventListener("click", () => wrap.remove());
    wrap.querySelector("#policy-result-close")?.focus();
  }
  function scheduleRender() {
    if (renderQueued) return; renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderStatusbar(); renderSource(); renderBuilder(); renderImpact(); renderPending(); renderNlSummary();
    });
  }

  // ---------- 操作：选择/范围/视角（其余已在上方实现） ----------
  function selectSource(eventId) { const d = draft(); d.sourceEventId = eventId; scheduleRender(); }
  function setScope(scope) { const d = draft(); d.scope = scope; scheduleRender(); }
  function setDuration(kind) { const d = draft(); d.duration = kind; scheduleRender(); }
  function setViewAs(persp) { viewAs = persp; scheduleRender(); }

  // ---------- tab 切换（移动端） ----------
  function switchTab(name) {
    const map = { source: "source", builder: "builder", impact: "impact", publish: "publish" };
    const panel = map[name] || name;
    el.tabs?.querySelectorAll(".policy-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    el.console?.querySelectorAll("[data-panel]").forEach(p => p.classList.toggle("panel-active", p.dataset.panel === panel));
  }

  // ---------- open / close ----------
  function open() {
    if (!mounted) return;
    store();
    log("policy.log.open");
    el.console.setAttribute("aria-hidden", "false");
    el.console.classList.add("open");
    document.body.classList.add("archive-open");
    switchTab("source");
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
    el.publish?.addEventListener("click", () => { if (!el.publish.disabled) publishFlow(); });
    el.saveDraft?.addEventListener("click", saveDraft);
    el.keepCase?.addEventListener("click", () => { store().currentDraft = blankDraft(); scheduleRender(); });
    el.tabs?.querySelectorAll(".policy-tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !el.console?.classList.contains("open")) return;
      const overlay = el.console.querySelector(".policy-overlay");
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
    el.console = document.getElementById("policy-console");
    el.intro = document.getElementById("policy-intro");
    el.statusbar = document.getElementById("policy-statusbar");
    el.nlSummary = document.getElementById("policy-nl-summary");
    el.sourceList = document.getElementById("policy-source-list");
    el.builder = document.getElementById("policy-builder");
    el.impact = document.getElementById("policy-impact");
    el.pending = document.getElementById("policy-pending");
    el.notice = document.getElementById("policy-footer-notice");
    el.back = document.getElementById("policy-back");
    el.publish = document.getElementById("policy-publish");
    el.saveDraft = document.getElementById("policy-save-draft");
    el.keepCase = document.getElementById("policy-keep-case");
    el.tabs = document.getElementById("policy-tabs");
  }
  function init() {
    cache();
    if (!el.console) return;
    mounted = true;
    bind();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // ---------- 撤销与修订 ----------
  function suspendRule(id) {
    const p = store();
    const pr = p.published.find(x => x.id === id); if (!pr) return;
    const wrap = document.createElement("div");
    wrap.className = "policy-overlay";
    wrap.innerHTML = `<div class="policy-overlay-panel"><h3>${esc(t("policy.suspendTitle"))}</h3>` +
      `<p>${esc(t("policy.suspendBody"))}</p>` +
      `<div class="verify-actions"><button type="button" class="modal-action danger" id="policy-suspend-ok">${esc(t("policy.suspendConfirm"))}</button>` +
      `<button type="button" class="modal-action secondary" id="policy-suspend-cancel">${esc(t("policy.cancel"))}</button></div></div>`;
    el.console.appendChild(wrap);
    wrap.querySelector("#policy-suspend-ok")?.addEventListener("click", () => {
      pr.status = "suspended";
      archive("policy-suspended", { id });
      log("policy.log.suspended", { id });
      try { window.eazoPolicyChanged?.(); } catch (_e) {}
      saveState(); wrap.remove(); scheduleRender();
    });
    wrap.querySelector("#policy-suspend-cancel")?.addEventListener("click", () => wrap.remove());
  }
  function reviseRule(id) {
    const p = store();
    const pr = p.published.find(x => x.id === id); if (!pr) return;
    // 创建新版本草稿（旧版本保留）
    const d = JSON.parse(JSON.stringify(pr));
    d.status = "draft"; d.baseVersionOf = pr.id; d.version = (pr.version || 1) + 1;
    p.currentDraft = d;
    log("policy.log.revise", { id });
    switchTab("builder");
    scheduleRender();
  }

  // ---------- 对外接口：其他页面查询规则是否生效 ----------
  window.eazoPolicy = {
    open, close,
    // 返回适用于某对象/行为的规则裁决数组（供 access/market/contact/labour 等调用）。
    // context: { subjectId, node, registeredAge, ageConfidence, label, visibility, action }
    evaluate(context) {
      const p = store(); if (!p || !context) return null;
      const s = { registeredAge: context.registeredAge, permissionAge: context.permissionAge, estimatedAge: context.estimatedAge,
        ageConfidence: context.ageConfidence, label: context.label, visibility: context.visibility,
        node: context.node, id: context.subjectId, displayedWill: context.displayedWill,
        recovered: context.recovered, unclassified: context.unclassified };
      const hits = [];
      p.published.filter(pr => pr.status === "published").forEach(pr => {
        const r = evaluateRule(pr, s);
        if (r !== "unaffected") {
          hits.push({ rule: pr.id, action: pr.action, result: r });
          if (context.enforce) recordEnforcement(pr, context.subjectId, r, context.dataUsed);
        }
      });
      return hits.length ? hits : null;
    },
    publishedRules() { return store()?.published || []; },
    suspendRule, reviseRule, recordEnforcement
  };
})();
