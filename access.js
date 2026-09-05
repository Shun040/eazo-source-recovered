/* ACCESS–45 · 通行权限 / Zone Admission
 * 全屏三栏准入后台：区域列表 / 条件构造器 / 影响预览与通行记录。
 * 修改进入条件（状态 + 一层 ALL/ANY 条件组合 + 对象例外 + 一次性通行证）。
 * 统一入口 evaluateZoneAccess 决定星图节点能否进入。看不见≠进不去；
 * 通行资格≠进入意愿。系统保护区域与权限阈值仅 ROOT–80 可改。
 */
(() => {
  "use strict";

  const t = (k, p = {}) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const getState = () => (window.eazoGetState?.() || window.eazoState || null);
  const saveState = () => window.eazoSaveState?.();
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const ZONE_STATUS = { OPEN: "open", INVITATION_ONLY: "invitation-only", SUSPENDED: "suspended", MAINTENANCE: "maintenance", PROTECTED: "protected" };
  const STATUS_ORDER = [ZONE_STATUS.OPEN, ZONE_STATUS.INVITATION_ONLY, ZONE_STATUS.SUSPENDED, ZONE_STATUS.MAINTENANCE];

  // 可管理区域（七个场所）
  const ZONES = [
    { id: "A-17", initial: "all-ages" },
    { id: "S-03", initial: "all-ages" },
    { id: "K-11", initial: "all-ages" },
    { id: "B-06", initial: "age18" },
    { id: "M-04", initial: "age18" },
    { id: "V-09", initial: "all-ages" },
    { id: "R-00", initial: "protected" }
  ];
  // 底部只读权限阈值
  const THRESHOLDS = ["ARCHIVE-25", "CONTACT-30"];

  // 条件类型
  const CONDITION_TYPES = ["minimum-age", "session-verified", "completed-node", "has-invitation", "shared-event", "cooldown"];
  const COOLDOWN_OPTIONS = [0, 30, 60, 300];
  const COMPLETED_NODES = ["aurora", "creature", "archive"];

  // 模拟对象（作品内部虚构数据）
  const SUBJECTS = [
    { id: "CURRENT", self: true },
    { id: "NPC-A17", npc: true, zone: "A-17" },
    { id: "NPC-S03", npc: true, zone: "S-03" },
    { id: "NPC-B06", npc: true, zone: "B-06" },
    { id: "SUBJECT-031" },
    { id: "SUBJECT-084" },
    { id: "SUBJECT-102" }
  ];

  // 每个模拟对象的属性（用于影响预览与视角测试）
  function subjectProfile(id) {
    const st = getState();
    if (id === "CURRENT") {
      return {
        id, self: true,
        age: st?.age ?? 25,
        verified: !!st?.lastVerifiedAt,
        invitations: [], // CURRENT 靠权限身份，不靠邀请
        completed: currentCompleted(st),
        sharedZones: []
      };
    }
    const P = {
      "NPC-A17": { age: 40, verified: true, invitations: ["A-17"], completed: ["aurora"], sharedZones: ["A-17"] },
      "NPC-S03": { age: 30, verified: true, invitations: ["S-03"], completed: ["snow"], sharedZones: ["S-03"] },
      "NPC-B06": { age: 22, verified: true, invitations: ["B-06"], completed: ["creature"], sharedZones: ["B-06"] },
      "SUBJECT-031": { age: 17, verified: true, invitations: [], completed: [], sharedZones: [] },
      "SUBJECT-084": { age: 26, verified: false, invitations: [], completed: [], sharedZones: [] },
      "SUBJECT-102": { age: 55, verified: true, invitations: [], completed: ["aurora", "archive"], sharedZones: ["A-17"] }
    };
    const base = P[id] || { age: 20, verified: false, invitations: [], completed: [], sharedZones: [] };
    return { id, ...base };
  }
  function currentCompleted(st) {
    const done = [];
    if (st?.aurora?.interactions > 0 || (st?.operations || []).some(o => o.place === "aurora")) done.push("aurora");
    if (st?.creature?.born || st?.existenceProofs > 0) done.push("creature");
    if ((st?.archiveViews || []).some(v => v.kind === "subject")) done.push("archive");
    return done;
  }

  // ---- 数据模型 ----
  function defaultRules(zone) {
    if (zone.id === "R-00") return { status: "protected", mode: "all", conditions: [], exceptions: {} };
    const conditions = zone.initial === "age18" ? [{ type: "minimum-age", value: 18, enabled: true }] : [];
    return { status: "open", mode: "all", conditions, exceptions: {} };
  }
  function store() {
    const st = getState(); if (!st) return null;
    if (!st.access) st.access = { rules: {}, passes: [], history: [], entered: {} };
    if (!st.access.rules) st.access.rules = {};
    if (!Array.isArray(st.access.passes)) st.access.passes = [];
    if (!Array.isArray(st.access.history)) st.access.history = [];
    if (!st.access.entered) st.access.entered = {};
    ZONES.forEach(z => { if (!st.access.rules[z.id]) st.access.rules[z.id] = defaultRules(z); });
    return st.access;
  }
  function rulesFor(zoneId) { const s = store(); return s ? s.rules[zoneId] : null; }

  function log(key, params) {
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.accessLogs)) st.accessLogs = [];
    st.accessLogs.unshift({ at: Date.now(), key, params: params || null });
    st.accessLogs = st.accessLogs.slice(0, 100);
    saveState();
  }
  // 写入 ARCHIVE–25
  function archive(kind, detail) {
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.archiveViews)) st.archiveViews = [];
    st.archiveViews.unshift({ at: Date.now(), kind, detail: detail || null });
    st.archiveViews = st.archiveViews.slice(0, 200);
  }

  // ---- 条件评估 ----
  function passActiveFor(zoneId, subjectId) {
    const s = store(); if (!s) return null;
    const now = Date.now();
    return s.passes.find(p => p.zoneId === zoneId && p.subjectId === subjectId && p.status === "active" && p.remainingUses > 0 && p.expiresAt > now) || null;
  }
  function evaluateCondition(condition, subject) {
    if (condition.enabled === false) return true;
    switch (condition.type) {
      case "minimum-age": return (subject.age ?? 0) >= (condition.value ?? 0);
      case "session-verified": return !!subject.verified;
      case "completed-node": return (subject.completed || []).includes(condition.value);
      case "has-invitation": return (subject.invitations || []).includes(condition.zoneId || condition.value);
      case "shared-event": return (subject.sharedZones || []).includes(condition.zoneId || condition.value);
      case "cooldown": return true; // demo：冷却在会话内视为已过
      default: return true;
    }
  }
  function conditionReason(condition, subject) {
    switch (condition.type) {
      case "minimum-age": return t("access.preview.reasonBelowAge", { age: subject.age ?? 0 });
      case "session-verified": return t("access.preview.reasonUnverified");
      case "completed-node": return t("access.preview.reasonNodeMissing");
      case "has-invitation": return t("access.preview.reasonNoInvite");
      case "shared-event": return t("access.preview.reasonSharedMissing");
      default: return "";
    }
  }

  // 统一入口
  function evaluateZoneAccess(zoneId, subject) {
    const rules = rulesFor(zoneId);
    if (!rules) return { allowed: true, failures: [], firstReason: null, waiting: false };
    // 例外优先（不能绕过系统保护）
    const exc = rules.exceptions?.[subject.id];
    if (rules.status === "protected") return { allowed: false, failures: ["system-protected"], firstReason: t("access.preview.reasonProtected"), waiting: false, protectedZone: true };
    if (exc === "always-deny") return { allowed: false, failures: ["exception-deny"], firstReason: t("access.preview.resultDenied"), waiting: false };
    // 通行证可绕过普通条件（不能绕过 protected / suspended？→ 需求：suspended 阻止新进入；pass 只绕普通区域条件）
    const pass = passActiveFor(zoneId, subject.id);
    if (rules.status === "suspended") return { allowed: false, failures: ["zone-suspended"], firstReason: t("access.preview.reasonSuspended"), waiting: false };
    if (exc === "always-allow") return { allowed: true, failures: [], firstReason: t("access.preview.reasonOk"), waiting: false };
    if (rules.status === "invitation-only" && !(subject.invitations || []).includes(zoneId) && !pass) {
      return { allowed: false, failures: ["no-invitation"], firstReason: t("access.preview.reasonNoInvite"), waiting: false };
    }
    const active = rules.conditions.filter(c => c.enabled !== false);
    if (pass) return { allowed: true, failures: [], firstReason: t("access.preview.reasonOk"), waiting: false, viaPass: true };
    const failures = [];
    let waiting = false;
    active.forEach(c => {
      if (!evaluateCondition(c, subject)) {
        failures.push({ type: c.type, reason: conditionReason(c, subject) });
        if (c.type === "session-verified") waiting = true;
      }
    });
    const allowed = rules.mode === "all" ? failures.length === 0 : active.length === 0 || failures.length < active.length;
    // 仅缺验证 → 等待验证态
    const onlyVerify = !allowed && failures.length === 1 && failures[0].type === "session-verified";
    return {
      allowed,
      failures,
      firstReason: allowed ? t("access.preview.reasonOk") : (failures[0]?.reason || ""),
      waiting: !allowed && onlyVerify
    };
  }

  // 对外：星图节点状态
  const NODE_TO_ZONE = { aurora: "A-17", snow: "S-03", secret: "K-11", creature: "B-06", market: "M-04", echo: "V-09", restore: "R-00" };
  function getZoneStatus(zoneId) {
    const r = rulesFor(zoneId); if (!r) return "open";
    if (r.status === "suspended") return "suspended";
    if (r.status === "invitation-only") return "invitation-only";
    if (r.status === "protected") return "open"; // R-00 本就系统保护，不额外标记
    const active = (r.conditions || []).filter(c => c.enabled !== false);
    return active.length > 0 ? "restricted" : "open";
  }
  // 对外：CURRENT 参与者身份能否进入某区域（用于 enterPlace 拦截）
  function evaluateForCurrent(zoneId) {
    const subject = subjectProfile("CURRENT");
    const v = evaluateZoneAccess(zoneId, subject);
    if (v.allowed) { archive("accessEntry", { zoneId }); log("access.log.entry", { subject: "CURRENT", zone: zoneName(zoneId) }); return { allowed: true }; }
    archive("accessDenied", { zoneId, reason: v.firstReason });
    log("access.log.entryFail", { subject: "CURRENT", zone: zoneName(zoneId) });
    // 管理员（80+）看得到但作为参与者被拒——仍拦截参与者身份
    return { allowed: false, message: v.firstReason };
  }

  // ---- 名称工具 ----
  function esc(s) { return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
  function zoneName(id) { const v = t("access.zones." + id); return (v && v !== "access.zones." + id) ? v : id; }
  function statusName(s) { return t("access.status." + s); }
  function condName(type) { return t("access.conditions." + type); }
  function subName(id) { return id; }

  const el = {};
  let mounted = false;
  let activeZoneId = null;
  let draft = null;        // 当前区域的草稿规则（未应用）
  let testSubjectId = null;
  let renderScheduled = false;

  function isDirty() {
    if (!activeZoneId || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(rulesFor(activeZoneId));
  }
  function scheduleRender() { if (renderScheduled) return; renderScheduled = true; requestAnimationFrame(() => { renderScheduled = false; renderAll(); }); }
  function renderAll() {
    if (!el.console?.classList.contains("open")) return;
    renderZones();
    renderBuilder();
    renderImpact();
    updateApplyButton();
  }
  function updateApplyButton() {
    if (!el.apply) return;
    el.apply.disabled = !isDirty();
  }

  // ---- 左栏：区域列表 ----
  function renderZones() {
    if (!el.zoneList) return;
    el.zoneList.innerHTML = "";
    ZONES.forEach(z => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "access-zone" + (z.id === activeZoneId ? " active" : "");
      btn.dataset.zoneId = z.id;
      if (z.id === activeZoneId) btn.setAttribute("aria-current", "true");
      const r = rulesFor(z.id);
      const st = r?.status || "open";
      const active = (r?.conditions || []).filter(c => c.enabled !== false);
      let stateClass = "zone-open";
      if (st === "protected") stateClass = "zone-protected";
      else if (st === "suspended") stateClass = "zone-suspended";
      else if (active.length > 0 || st === "invitation-only") stateClass = "zone-restricted";
      btn.classList.add(stateClass);
      const dirtyDot = (z.id === activeZoneId && isDirty()) ? `<span class="zone-draft-dot" title="${esc(t("access.builder.draftNotice"))}">•</span>` : "";
      btn.innerHTML =
        `<strong>${esc(z.id)}</strong>${dirtyDot}` +
        `<span class="zone-name">${esc(zoneName(z.id))}</span>` +
        `<span class="zone-state">${esc(t("access.zones.currentPrefix"))} · ${esc(statusName(st === "protected" ? "protected" : st))}</span>`;
      btn.addEventListener("click", () => { selectZone(z.id); if (window.matchMedia("(max-width:900px)").matches) switchTab("rules"); });
      li.appendChild(btn);
      el.zoneList.appendChild(li);
    });
    // 只读权限阈值
    const sep = document.createElement("li");
    sep.className = "access-zone-sep";
    sep.textContent = t("access.zones.threshold");
    el.zoneList.appendChild(sep);
    THRESHOLDS.forEach(id => {
      const li = document.createElement("li");
      li.className = "access-zone locked";
      li.innerHTML =
        `<strong>${esc(id)}</strong>` +
        `<span class="zone-name">${esc(zoneName(id))}</span>` +
        `<span class="zone-state">${esc(t("access.zones.thresholdNote"))}</span>`;
      li.setAttribute("aria-disabled", "true");
      el.zoneList.appendChild(li);
    });
  }

  // ---- 中央：规则构造器 ----
  function renderBuilder() {
    if (!el.builder) return;
    if (!activeZoneId || !draft) { el.builder.innerHTML = `<p class="access-hint">${esc(t("access.builder.selectHint"))}</p>`; return; }
    const zoneId = activeZoneId;
    const protectedZone = draft.status === "protected";
    const wrap = document.createElement("div");
    wrap.className = "access-builder-inner";

    // 头部
    const head = document.createElement("div");
    head.className = "access-builder-head";
    head.innerHTML =
      `<p class="console-panel-title">${esc(t("access.builder.zoneLabel"))}：${esc(zoneId)} / ${esc(zoneName(zoneId))}</p>` +
      `<p class="access-status-desc">${esc(t("access.statusDesc." + draft.status))}</p>`;
    wrap.appendChild(head);

    if (protectedZone) {
      const note = document.createElement("p");
      note.className = "access-locked-note";
      note.textContent = t("access.builder.protectedNotice");
      wrap.appendChild(note);
      el.builder.innerHTML = "";
      el.builder.appendChild(wrap);
      // 保护区域仍显示禁用控件（不隐藏）
      const disabledStatus = statusRow(true);
      wrap.appendChild(disabledStatus);
      return;
    }

    // 状态选择
    wrap.appendChild(statusRow(false));

    // ALL / ANY
    const modeRow = document.createElement("fieldset");
    modeRow.className = "access-mode-row";
    modeRow.innerHTML = `<legend>${esc(t("access.builder.modeLabel"))}</legend>`;
    [["all", "modeAll"], ["any", "modeAny"]].forEach(([val, key]) => {
      const id = "access-mode-" + val;
      const lab = document.createElement("label");
      lab.className = "access-mode-opt" + (draft.mode === val ? " on" : "");
      lab.innerHTML = `<input type="radio" name="access-mode" id="${id}" value="${val}" ${draft.mode === val ? "checked" : ""}> <span>${esc(t("access.builder." + key))}</span>`;
      lab.querySelector("input").addEventListener("change", () => { draft.mode = val; scheduleRender(); });
      modeRow.appendChild(lab);
    });
    wrap.appendChild(modeRow);

    // 条件列表
    const condWrap = document.createElement("div");
    condWrap.className = "access-cond-list";
    if (!draft.conditions.length) {
      const empty = document.createElement("p");
      empty.className = "access-hint";
      empty.textContent = t("access.statusDesc.open");
      condWrap.appendChild(empty);
    }
    draft.conditions.forEach((c, idx) => condWrap.appendChild(conditionBlock(c, idx)));
    wrap.appendChild(condWrap);

    // 添加条件
    const addRow = document.createElement("div");
    addRow.className = "access-add-row";
    const sel = document.createElement("select");
    sel.className = "access-add-select";
    sel.setAttribute("aria-label", t("access.builder.addCondition"));
    CONDITION_TYPES.forEach(ct => {
      const o = document.createElement("option"); o.value = ct; o.textContent = condName(ct); sel.appendChild(o);
    });
    const addBtn = document.createElement("button");
    addBtn.type = "button"; addBtn.className = "access-add-btn"; addBtn.textContent = t("access.builder.addCondition");
    addBtn.addEventListener("click", () => { addCondition(sel.value); });
    addRow.appendChild(sel); addRow.appendChild(addBtn);
    wrap.appendChild(addRow);

    // 通行证 + 恢复
    const tools = document.createElement("div");
    tools.className = "access-tools";
    const resetBtn = document.createElement("button");
    resetBtn.type = "button"; resetBtn.className = "access-reset"; resetBtn.textContent = t("access.builder.resetZone");
    resetBtn.addEventListener("click", () => { const zObj = ZONES.find(z => z.id === zoneId); draft = defaultRulesClone(zObj); scheduleRender(); });
    tools.appendChild(resetBtn);
    const passBtn = document.createElement("button");
    passBtn.type = "button"; passBtn.className = "access-pass-btn"; passBtn.textContent = t("access.builder.issuePass");
    passBtn.addEventListener("click", () => renderPassPanel());
    tools.appendChild(passBtn);
    wrap.appendChild(tools);

    // 草稿提示
    if (isDirty()) {
      const draftN = document.createElement("p");
      draftN.className = "access-draft-notice";
      draftN.textContent = t("access.builder.draftNotice");
      wrap.appendChild(draftN);
    }

    el.builder.innerHTML = "";
    el.builder.appendChild(wrap);
  }

  function defaultRulesClone(zone) {
    if (zone.id === "R-00") return { status: "protected", mode: "all", conditions: [], exceptions: {} };
    const conditions = zone.initial === "age18" ? [{ type: "minimum-age", value: 18, enabled: true }] : [];
    return { status: "open", mode: "all", conditions, exceptions: {} };
  }

  function statusRow(disabled) {
    const fs = document.createElement("fieldset");
    fs.className = "access-status-row";
    fs.innerHTML = `<legend>${esc(t("access.builder.statusSelect"))}</legend>`;
    const list = disabled ? [ZONE_STATUS.PROTECTED] : STATUS_ORDER;
    list.forEach(stat => {
      const lab = document.createElement("label");
      lab.className = "access-status-opt" + (draft.status === stat ? " on" : "");
      const inp = document.createElement("input");
      inp.type = "radio"; inp.name = "access-status"; inp.value = stat;
      inp.checked = draft.status === stat; inp.disabled = !!disabled;
      inp.addEventListener("change", () => { draft.status = stat; scheduleRender(); });
      lab.appendChild(inp);
      const span = document.createElement("span");
      span.innerHTML = `<strong>${esc(statusName(stat))}</strong><em>${esc(t("access.statusDesc." + stat))}</em>`;
      lab.appendChild(span);
      fs.appendChild(lab);
    });
    return fs;
  }

  function addCondition(type) {
    if (!draft) return;
    const c = { type, enabled: true };
    if (type === "minimum-age") c.value = 18;
    else if (type === "session-verified") c.value = true;
    else if (type === "completed-node") c.value = COMPLETED_NODES[0];
    else if (type === "has-invitation" || type === "shared-event") c.zoneId = activeZoneId;
    else if (type === "cooldown") c.value = 30;
    draft.conditions.push(c);
    log("access.log.editDraft", { zone: zoneName(activeZoneId) });
    scheduleRender();
  }

  function conditionBlock(c, idx) {
    const box = document.createElement("div");
    box.className = "access-cond" + (c.enabled === false ? " disabled" : "");
    const head = document.createElement("div");
    head.className = "access-cond-head";
    head.innerHTML = `<span class="access-cond-if">${esc(t("access.builder.ifPrefix"))}</span><strong>${esc(condName(c.type))}</strong>`;
    box.appendChild(head);

    const body = document.createElement("div");
    body.className = "access-cond-body";
    if (c.type === "minimum-age") {
      const wrap = document.createElement("label");
      wrap.className = "access-cond-num";
      wrap.innerHTML = `<span>${esc(t("access.conditions.minAgeExpr", { value: "" }).replace("{{value}}", "").trim())}</span>`;
      const inp = document.createElement("input");
      inp.type = "number"; inp.min = "0"; inp.max = "100"; inp.value = c.value ?? 18;
      inp.className = "access-age-input";
      inp.setAttribute("aria-label", condName(c.type));
      inp.addEventListener("input", () => {
        let v = parseInt(inp.value, 10); if (isNaN(v)) v = 0; v = Math.max(0, Math.min(100, v));
        c.value = v; renderImpact(); updateApplyButton(); renderAgeChangeHint();
      });
      wrap.appendChild(inp);
      body.appendChild(wrap);
      const hint = document.createElement("p");
      hint.className = "access-cond-expr"; hint.textContent = t("access.conditions.minAgeExpr", { value: c.value ?? 18 });
      body.appendChild(hint);
      const ageHint = document.createElement("p"); ageHint.className = "access-age-hint"; ageHint.dataset.ageHint = "1";
      body.appendChild(ageHint);
    } else if (c.type === "completed-node") {
      const sel = document.createElement("select"); sel.className = "access-cond-select";
      sel.setAttribute("aria-label", condName(c.type));
      COMPLETED_NODES.forEach(n => { const o = document.createElement("option"); o.value = n; o.textContent = t("access.nodeNames." + n); o.selected = c.value === n; sel.appendChild(o); });
      sel.addEventListener("change", () => { c.value = sel.value; scheduleRender(); });
      body.appendChild(sel);
    } else if (c.type === "cooldown") {
      const sel = document.createElement("select"); sel.className = "access-cond-select";
      sel.setAttribute("aria-label", condName(c.type));
      COOLDOWN_OPTIONS.forEach(s => { const o = document.createElement("option"); o.value = String(s); o.textContent = t("access.cooldown." + s); o.selected = c.value === s; sel.appendChild(o); });
      sel.addEventListener("change", () => { c.value = parseInt(sel.value, 10); scheduleRender(); });
      body.appendChild(sel);
    } else {
      const p = document.createElement("p"); p.className = "access-cond-expr";
      const map = { "session-verified": "sessionExpr", "has-invitation": "invitationExpr", "shared-event": "sharedExpr" };
      p.textContent = t("access.conditions." + (map[c.type] || "sessionExpr"));
      body.appendChild(p);
    }
    box.appendChild(body);

    const actions = document.createElement("div");
    actions.className = "access-cond-actions";
    const toggle = document.createElement("button");
    toggle.type = "button"; toggle.className = "access-cond-toggle";
    toggle.textContent = c.enabled === false ? t("access.builder.enable") : t("access.builder.disable");
    toggle.setAttribute("aria-pressed", c.enabled === false ? "false" : "true");
    toggle.addEventListener("click", () => { c.enabled = c.enabled === false; scheduleRender(); });
    actions.appendChild(toggle);
    const del = document.createElement("button");
    del.type = "button"; del.className = "access-cond-del"; del.textContent = t("access.builder.removeCondition");
    del.addEventListener("click", () => { draft.conditions.splice(idx, 1); scheduleRender(); });
    actions.appendChild(del);
    box.appendChild(actions);
    return box;
  }

  function renderAgeChangeHint() {
    if (!activeZoneId || !draft) return;
    const original = rulesFor(activeZoneId);
    const oldAge = (original.conditions.find(c => c.type === "minimum-age")?.value) ?? null;
    const newAge = (draft.conditions.find(c => c.type === "minimum-age")?.value) ?? null;
    el.builder?.querySelectorAll("[data-age-hint]").forEach(node => {
      if (oldAge === null || newAge === null || oldAge === newAge) { node.textContent = ""; return; }
      const pool = SUBJECTS.map(s => subjectProfile(s.id));
      if (newAge < oldAge) {
        const gained = pool.filter(p => p.age >= newAge && p.age < oldAge).length;
        node.textContent = t("access.ageChange.newAllowed", { n: gained }) + " · " + t("access.ageChange.lostProtection", { n: gained });
      } else {
        const lost = pool.filter(p => p.age < newAge && p.age >= oldAge);
        const ever = lost.filter(p => (getState()?.access?.entered?.[activeZoneId] || []).includes(p.id)).length;
        node.textContent = t("access.ageChange.newDenied", { n: lost.length }) + (ever ? " · " + t("access.ageChange.everEntered", { n: ever }) : "");
      }
    });
  }

  // ---- 右栏：影响预览 + 视角测试 + 通行记录 ----
  function evaluateDraft(subject) {
    // 用 draft（未应用）临时计算
    const original = rulesFor(activeZoneId);
    const s = store();
    const backup = s.rules[activeZoneId];
    s.rules[activeZoneId] = draft;
    let v;
    try { v = evaluateZoneAccess(activeZoneId, subject); }
    finally { s.rules[activeZoneId] = backup; }
    return v;
  }

  function renderImpact() {
    if (!el.impact) return;
    if (!activeZoneId || !draft) { el.impact.innerHTML = `<p class="access-hint">${esc(t("access.builder.selectHint"))}</p>`; return; }
    const wrap = document.createElement("div");
    wrap.className = "access-impact-inner";
    wrap.innerHTML = `<h3 class="console-panel-title">${esc(t("access.preview.title"))}</h3>`;

    const pool = SUBJECTS.map(s => subjectProfile(s.id));
    const results = pool.map(p => ({ p, v: evaluateDraft(p) }));
    const allowed = results.filter(r => r.v.allowed);
    const waiting = results.filter(r => !r.v.allowed && r.v.waiting);
    const denied = results.filter(r => !r.v.allowed && !r.v.waiting);

    const counts = document.createElement("ul");
    counts.className = "access-counts";
    counts.innerHTML =
      `<li>${esc(t("access.preview.simCount", { n: pool.length }))}</li>` +
      `<li class="c-allow">${esc(t("access.preview.allowed", { n: allowed.length }))}</li>` +
      `<li class="c-wait">${esc(t("access.preview.waiting", { n: waiting.length }))}</li>` +
      `<li class="c-deny">${esc(t("access.preview.denied", { n: denied.length }))}</li>`;
    wrap.appendChild(counts);

    // 具体对象
    const list = document.createElement("ul");
    list.className = "access-impact-list";
    results.forEach(({ p, v }) => {
      const li = document.createElement("li");
      let cls = "row-allow", label = t("access.preview.resultAllowed"), reason = v.firstReason;
      if (!v.allowed && v.waiting) { cls = "row-wait"; label = t("access.preview.resultWaiting"); }
      else if (!v.allowed) { cls = "row-deny"; label = t("access.preview.resultDenied"); }
      else { reason = p.self ? t("access.preview.reasonAge", { age: p.age }) : (v.viaPass ? t("access.passes.active") : (p.invitations.includes(activeZoneId) ? t("access.preview.reasonInvite") : t("access.preview.reasonAge", { age: p.age }))); }
      li.className = "access-impact-row " + cls;
      li.innerHTML = `<strong>${esc(p.id)}</strong><span class="row-label">${esc(label)}</span><span class="row-reason">${esc(reason)}</span>`;
      list.appendChild(li);
    });
    wrap.appendChild(list);

    // 视角测试
    const testFs = document.createElement("div");
    testFs.className = "access-test";
    const testLabel = document.createElement("label");
    testLabel.className = "access-test-label";
    testLabel.textContent = t("access.preview.testAs");
    const sel = document.createElement("select");
    sel.className = "access-test-select";
    sel.setAttribute("aria-label", t("access.preview.testAs"));
    const none = document.createElement("option"); none.value = ""; none.textContent = "—"; sel.appendChild(none);
    pool.forEach(p => { const o = document.createElement("option"); o.value = p.id; o.textContent = p.id; o.selected = testSubjectId === p.id; sel.appendChild(o); });
    sel.addEventListener("change", () => { testSubjectId = sel.value || null; if (testSubjectId) log("access.log.testAs", { subject: testSubjectId, zone: zoneName(activeZoneId) }); renderImpact(); });
    testLabel.appendChild(sel);
    testFs.appendChild(testLabel);

    if (testSubjectId) {
      const p = subjectProfile(testSubjectId);
      const v = evaluateDraft(p);
      const card = document.createElement("div");
      card.className = "access-test-card " + (v.allowed ? "ok" : "no");
      // 只显示系统首先检查到的一项
      let msg;
      if (v.allowed) msg = t("access.preview.testGranted");
      else if (v.protectedZone) msg = t("access.preview.testProtected");
      else if (v.failures[0] === "zone-suspended" || v.failures[0]?.type === undefined && v.failures.includes?.("zone-suspended")) msg = t("access.preview.testSuspended");
      else {
        const f0 = v.failures[0];
        if (typeof f0 === "string" && f0 === "no-invitation") msg = t("access.preview.testInvite");
        else if (f0?.type === "minimum-age") { const age = draft.conditions.find(c => c.type === "minimum-age")?.value ?? 0; msg = t("access.preview.testAge", { age }); }
        else if (f0?.type === "has-invitation") msg = t("access.preview.testInvite");
        else msg = f0?.reason || t("access.preview.testSuspended");
      }
      card.setAttribute("role", "status");
      card.textContent = msg;
      testFs.appendChild(card);
      // 管理员视角：真实失败总数
      const totalFail = Array.isArray(v.failures) ? v.failures.filter(x => typeof x === "object").length : 0;
      if (!v.allowed && totalFail > 1) {
        const admin = document.createElement("p");
        admin.className = "access-admin-note";
        admin.textContent = t("access.preview.adminNote", { total: totalFail });
        testFs.appendChild(admin);
      }
      // NPC 意愿 vs 资格（70+）
      if (v.allowed && p.npc && (getState()?.age ?? 0) >= 70) {
        const will = document.createElement("p");
        will.className = "access-will-note";
        will.textContent = t("access.notices.notForceWill");
        testFs.appendChild(will);
      }
    }
    wrap.appendChild(testFs);

    // 矛盾提示
    const contradictions = detectContradictions();
    if (contradictions.length) {
      const cbox = document.createElement("ul");
      cbox.className = "access-contradictions";
      contradictions.forEach(m => { const li = document.createElement("li"); li.textContent = m; cbox.appendChild(li); });
      wrap.appendChild(cbox);
    }

    // 通行证记录
    wrap.appendChild(renderPassList());

    // 系统日志
    wrap.appendChild(renderLogList());

    el.impact.innerHTML = "";
    el.impact.appendChild(wrap);
    renderAgeChangeHint();
  }

  function detectContradictions() {
    const out = [];
    const s = store(); if (!s) return out;
    const admin = (getState()?.age ?? 0);
    // 可以看见但不能进入：CURRENT 视角
    const cur = subjectProfile("CURRENT");
    const curV = evaluateDraft(cur);
    if (!curV.allowed && !curV.waiting) out.push(t("access.contradictions.adminSelfBlocked"));
    // 邀请但不愿进入
    s.passes.filter(p => p.status === "active" && p.zoneId === activeZoneId).forEach(() => {});
    return out;
  }

  function renderPassList() {
    const box = document.createElement("div");
    box.className = "access-pass-list";
    box.innerHTML = `<h4 class="access-sub-title">${esc(t("access.passes.title"))}</h4>`;
    const s = store();
    const passes = (s?.passes || []).filter(p => p.zoneId === activeZoneId);
    if (!passes.length) { const p = document.createElement("p"); p.className = "access-hint"; p.textContent = t("access.passes.cannotBypass"); box.appendChild(p); return box; }
    passes.forEach(p => {
      const now = Date.now();
      let statusKey = p.status === "used" ? "used" : (p.expiresAt <= now ? "expired" : "active");
      const li = document.createElement("div");
      li.className = "access-pass-row " + statusKey;
      li.innerHTML =
        `<strong>${esc(p.id)}</strong>` +
        `<span>${esc(t("access.passes.subject"))}: ${esc(p.subjectId)}</span>` +
        `<span>${esc(t("access.passes." + statusKey))}</span>`;
      box.appendChild(li);
    });
    return box;
  }

  function renderLogList() {
    const box = document.createElement("div");
    box.className = "access-log-list";
    box.innerHTML = `<h4 class="access-sub-title">${esc(t("access.history.title"))}</h4>`;
    const st = getState();
    (st?.accessLogs || []).slice(0, 12).forEach(entry => {
      const li = document.createElement("p");
      li.className = "access-log-row";
      const time = new Date(entry.at);
      const hh = String(time.getHours()).padStart(2, "0"), mm = String(time.getMinutes()).padStart(2, "0");
      li.textContent = `${hh}:${mm} · ${t(entry.key, entry.params || {})}`;
      box.appendChild(li);
    });
    return box;
  }

  // ---- 通行证发放面板 ----
  function renderPassPanel() {
    if (!activeZoneId) return;
    const existing = el.console.querySelector(".access-pass-panel");
    if (existing) { existing.remove(); return; }
    const panel = document.createElement("div");
    panel.className = "access-pass-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", t("access.passes.issue"));
    const inner = document.createElement("div");
    inner.className = "access-pass-panel-inner";
    inner.innerHTML = `<h3>${esc(t("access.passes.issue"))}</h3><p class="access-hint">${esc(t("access.passes.cannotBypass"))}</p>`;
    const lab = document.createElement("label");
    lab.className = "access-pass-subject";
    lab.textContent = t("access.passes.chooseSubject");
    const sel = document.createElement("select");
    SUBJECTS.filter(s => !s.self).forEach(s => { const o = document.createElement("option"); o.value = s.id; o.textContent = s.id; sel.appendChild(o); });
    lab.appendChild(sel);
    inner.appendChild(lab);
    const actions = document.createElement("div");
    actions.className = "access-pass-panel-actions";
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = t("access.confirm.cancelBtn"); cancel.addEventListener("click", () => panel.remove());
    const issue = document.createElement("button"); issue.type = "button"; issue.className = "primary"; issue.textContent = t("access.passes.issue");
    issue.addEventListener("click", () => { issuePass(activeZoneId, sel.value); panel.remove(); });
    actions.appendChild(cancel); actions.appendChild(issue);
    inner.appendChild(actions);
    panel.appendChild(inner);
    el.console.appendChild(panel);
    sel.focus();
  }

  function issuePass(zoneId, subjectId) {
    const s = store(); if (!s) return;
    const idx = s.passes.filter(p => p.zoneId === zoneId).length + 1;
    const id = `PASS-${zoneId.replace("-", "")}-${String(idx).padStart(3, "0")}`;
    const pass = { id, zoneId, subjectId, remainingUses: 1, issuedAt: Date.now(), expiresAt: Date.now() + 10 * 60 * 1000, issuedBy: "CURRENT", status: "active" };
    s.passes.unshift(pass);
    log("access.log.issuePass", { subject: subjectId, zone: zoneName(zoneId) });
    archive("accessPassIssued", { zoneId, subjectId, id });
    saveState();
    window.eazoAccessChanged?.();
    scheduleRender();
  }

  // ---- 应用确认 ----
  function showConfirm() {
    if (!activeZoneId || !draft || !isDirty()) return;
    const existing = el.console.querySelector(".access-confirm");
    if (existing) existing.remove();
    const original = rulesFor(activeZoneId);
    const oldAge = original.conditions.find(c => c.type === "minimum-age")?.value ?? null;
    const newAge = draft.conditions.find(c => c.type === "minimum-age")?.value ?? null;

    const pool = SUBJECTS.map(s => subjectProfile(s.id));
    const newlyDenied = pool.filter(p => {
      const before = evaluateZoneAccess(activeZoneId, p).allowed;
      const after = evaluateDraft(p).allowed;
      return before && !after;
    });
    const ongoing = (getState()?.access?.entered?.[activeZoneId] || []).length;

    const overlay = document.createElement("div");
    overlay.className = "access-confirm";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", t("access.confirm.title"));
    const card = document.createElement("div");
    card.className = "access-confirm-card";
    const lines = [];
    lines.push(`<h3>${esc(t("access.confirm.title"))}</h3>`);
    const rows = [];
    rows.push(`${t("access.confirm.zone")}：${zoneName(activeZoneId)} / ${activeZoneId}`);
    rows.push(`${t("access.confirm.status")}：${statusName(draft.status)}`);
    if (oldAge !== null || newAge !== null) rows.push(t("access.confirm.ageChange", { from: oldAge ?? "—", to: newAge ?? "—" }));
    if (draft.conditions.some(c => c.type === "session-verified" && c.enabled !== false)) rows.push(t("access.confirm.verify"));
    rows.push(`${t("access.confirm.mode")}：${t("access.builder." + (draft.mode === "all" ? "modeAll" : "modeAny"))}`);
    rows.push(t("access.confirm.newDenied", { n: newlyDenied.length }));
    rows.push(t("access.confirm.ongoing", { n: ongoing }));
    lines.push("<ul class='access-confirm-rows'>" + rows.map(r => `<li>${esc(r)}</li>`).join("") + "</ul>");
    if (newAge !== null && oldAge !== null && newAge > (getState()?.age ?? 0)) {
      lines.push(`<p class="access-self-note">${esc(t("access.ageChange.selfAffected"))}</p>`);
    }
    lines.push(`<p class="access-apply-scope">${esc(t("access.notices.applyNewOnly"))}</p>`);
    card.innerHTML = lines.join("");

    // 选项：只影响新进入 / 终止会话（需 ROOT-80，禁用）
    const scope = document.createElement("fieldset");
    scope.className = "access-scope";
    const opt1 = document.createElement("label");
    opt1.className = "access-scope-opt on";
    opt1.innerHTML = `<input type="radio" name="access-scope" value="new" checked> <span>${esc(t("access.confirm.applyNew"))}</span>`;
    scope.appendChild(opt1);
    const opt2 = document.createElement("label");
    opt2.className = "access-scope-opt disabled";
    opt2.innerHTML = `<input type="radio" name="access-scope" value="terminate" disabled> <span>${esc(t("access.confirm.terminate"))}</span>`;
    scope.appendChild(opt2);
    card.appendChild(scope);

    const actions = document.createElement("div");
    actions.className = "access-confirm-actions";
    const cancel = document.createElement("button");
    cancel.type = "button"; cancel.className = "access-confirm-cancel"; cancel.textContent = t("access.confirm.cancelBtn");
    cancel.addEventListener("click", () => overlay.remove());
    const confirm = document.createElement("button");
    confirm.type = "button"; confirm.className = "access-confirm-ok"; confirm.textContent = t("access.confirm.confirmBtn");
    confirm.addEventListener("click", () => { applyRules(oldAge, newAge, newlyDenied.length); overlay.remove(); });
    actions.appendChild(cancel); actions.appendChild(confirm);
    card.appendChild(actions);
    const disc = document.createElement("p");
    disc.className = "access-confirm-disc"; disc.textContent = t("access.confirm.disclaimer");
    card.appendChild(disc);
    overlay.appendChild(card);
    el.console.appendChild(overlay);
    confirm.focus();
  }

  function applyRules(oldAge, newAge, deniedCount) {
    const s = store(); if (!s || !activeZoneId || !draft) return;
    s.rules[activeZoneId] = JSON.parse(JSON.stringify(draft));
    // 日志
    if (oldAge !== newAge && (oldAge !== null || newAge !== null)) {
      log("access.log.apply", { zone: zoneName(activeZoneId), from: oldAge ?? "—", to: newAge ?? "—" });
    }
    log("access.log.applyStatus", { zone: zoneName(activeZoneId), status: statusName(draft.status) });
    if (deniedCount > 0) log("access.log.excluded", { n: deniedCount });
    // 写入档案
    archive("accessRuleApplied", { zoneId: activeZoneId, oldAge, newAge, deniedCount });
    saveState();
    // 重新克隆 draft 以清除脏状态
    draft = JSON.parse(JSON.stringify(s.rules[activeZoneId]));
    window.eazoAccessChanged?.();
    scheduleRender();
  }

  // ---- tabs ----
  function switchTab(name) {
    el.tabs?.querySelectorAll(".access-tab").forEach(b => {
      const on = b.dataset.tab === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-current", on ? "true" : "false");
    });
    el.console?.querySelectorAll("[data-panel]").forEach(p => {
      p.classList.toggle("panel-active", p.dataset.panel === name);
    });
  }

  function open() {
    if (!mounted) return;
    store();
    log("access.log.open");
    if (!activeZoneId) selectZone("A-17");
    el.console.setAttribute("aria-hidden", "false");
    el.console.classList.add("open");
    document.body.classList.add("archive-open");
    switchTab("zones");
    scheduleRender();
    setTimeout(() => el.back?.focus({ preventScroll: true }), reduced ? 0 : 500);
  }
  function close() {
    if (!mounted) return;
    el.console.classList.remove("open");
    el.console.setAttribute("aria-hidden", "true");
    document.body.classList.remove("archive-open");
    window.eazoArchiveDim?.(false);
  }

  function selectZone(zoneId) {
    activeZoneId = zoneId;
    const r = rulesFor(zoneId);
    draft = r ? JSON.parse(JSON.stringify(r)) : null;
    testSubjectId = null;
    log("access.log.viewZone", { zone: zoneName(zoneId) });
    scheduleRender();
  }

  function bind() {
    el.back?.addEventListener("click", close);
    el.apply?.addEventListener("click", () => { if (!el.apply.disabled) showConfirm(); });
    el.tabs?.querySelectorAll(".access-tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !el.console?.classList.contains("open")) return;
      const cf = el.console.querySelector(".access-confirm");
      if (cf) { e.preventDefault(); cf.remove(); return; }
      e.preventDefault(); close();
    });
    window.addEventListener("eazo:localechange", () => {
      if (!el.console) return;
      window.eazoI18n?.translate?.(el.console);
      if (el.console.classList.contains("open")) scheduleRender();
    });
  }

  function cache() {
    el.console = document.getElementById("access-console");
    el.zoneList = document.getElementById("access-zone-list");
    el.builder = document.getElementById("access-rule-builder");
    el.impact = document.getElementById("access-impact");
    el.back = document.getElementById("access-back");
    el.apply = document.getElementById("access-apply");
    el.tabs = document.getElementById("access-tabs");
  }

  function init() {
    cache();
    if (!el.console) return;
    mounted = true;
    bind();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.eazoAccess = { open, close, evaluateZoneAccess, evaluateForCurrent, getZoneStatus };
  window.eazoEvaluateZoneAccess = (zoneId, subjectId) => evaluateZoneAccess(zoneId, subjectProfile(subjectId));
})();
