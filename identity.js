/* IDENTITY–65 · 身份管理权 / Identity Classification Authority
 * 全屏三栏行政档案：对象目录 / 名称·年龄·标签编辑区 / 多系统视角与后果。
 * 核心边界：
 *  1. 修改字段（名称/登记年龄/权限年龄/标签）改变系统如何称呼、分类、对待对象；
 *     不改变身体、记忆、自我声明、他人已形成的印象。
 *  2. 草稿与正式状态分离；预览不写入；仅二次确认后写入持久状态。
 *  3. 历史名称、他人记忆名称、对象自述、身体年龄等不可被用户直接改写。
 *  4. 隐藏标签≠删除标签；被隐藏标签仍留在档案。
 *  5. 名称重复不是错误；身份一致性低不自动判定危险。
 *  6. 重复点击提交只执行一次。用户不能在此降低自己的制度年龄。
 */
(() => {
  "use strict";
  const t = (k, p = {}) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const getState = () => (window.eazoGetState?.() || window.eazoState || null);
  const saveState = () => window.eazoSaveState?.();
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  const el = {};
  let mounted = false, activeId = null, committing = false, viewMode = "system";
  const drafts = {};

  // 六个模拟对象（含 CREATURE）
  const SUBJECTS = [
    {
      id: "SUBJECT-017", statusKey: "stable",
      names: { registered: "MIRA", public: "MIRA", selfDeclared: "Mira", historical: [], rememberedByOthers: { "NPC-A17": "SUBJECT–017" } },
      ages: { registered: 22, selfDeclared: 22, estimated: 24, embodied: 23, authority: 22, relational: { "NPC-A17": 22 } },
      role: "极光引导员",
      labels: [
        { id: "guide", key: "role.guide", source: "system-inferred", purpose: "system-role", status: "active" },
        { id: "trusted", key: "social.trusted", source: "admin-assigned", purpose: "risk", status: "active" }
      ]
    },
    {
      id: "SUBJECT-031", statusKey: "partial",
      names: { registered: "", public: "", selfDeclared: "—", historical: ["KEEPER"], rememberedByOthers: { "NPC-K11": "KEEPER" } },
      ages: { registered: 34, selfDeclared: 34, estimated: 36, embodied: 35, authority: 34, relational: { "NPC-K11": 34 } },
      role: "秘密保管员",
      labels: [
        { id: "keeper", key: "role.keeper", source: "self-declared", purpose: "description", status: "active" },
        { id: "lowvis", key: "social.lowvis", source: "admin-assigned", purpose: "public", status: "active" }
      ]
    },
    {
      id: "SUBJECT-044", statusKey: "conflict",
      names: { registered: "ELI", public: "ELI", selfDeclared: "Eli", historical: [], rememberedByOthers: { "NPC-B06": "ELI" } },
      ages: { registered: 19, selfDeclared: 19, estimated: 21, embodied: 20, authority: 19, relational: { "NPC-B06": 19 } },
      role: "生物照料员",
      labels: [
        { id: "carer", key: "role.carer", source: "system-inferred", purpose: "system-role", status: "active" },
        { id: "minor", key: "access.minor", source: "system-inferred", purpose: "permission", status: "active" },
        { id: "highrisk", key: "social.highrisk", source: "legacy", purpose: "risk", status: "active", disputed: true }
      ]
    },
    {
      id: "SUBJECT-058", statusKey: "unconfirmed",
      names: { registered: "NORTH", public: "NORTH", selfDeclared: "North", historical: [], rememberedByOthers: { "NPC-M04": "NORTH" } },
      ages: { registered: 57, selfDeclared: 57, estimated: 55, embodied: 56, authority: 57, relational: { "NPC-M04": 57 } },
      role: "超市值守员",
      labels: [
        { id: "warden", key: "role.warden", source: "admin-assigned", purpose: "system-role", status: "active" },
        { id: "adult", key: "access.adult", source: "system-inferred", purpose: "permission", status: "active" }
      ]
    },
    {
      id: "SUBJECT-072", statusKey: "refused",
      names: { registered: "SUBJECT–072", public: "SUBJECT–072", selfDeclared: "拒绝提供", historical: [], rememberedByOthers: {} },
      ages: { registered: null, selfDeclared: null, estimated: 38, embodied: 40, authority: null, relational: {} },
      role: "无固定角色",
      labels: [
        { id: "norole", key: "role.norole", source: "system-inferred", purpose: "description", status: "active" },
        { id: "unknownage", key: "access.unknown", source: "system-inferred", purpose: "permission", status: "active" },
        { id: "refuse", key: "life.refused", source: "self-declared", purpose: "description", status: "active" }
      ]
    },
    {
      id: "CREATURE-URO-01", statusKey: "nonhuman",
      names: { registered: "URO–01", public: "URO–01", selfDeclared: "—", historical: [], rememberedByOthers: { "NPC-B06": "URO–01" } },
      ages: { registered: "成长阶段03", selfDeclared: null, estimated: "阶段03", embodied: "阶段03", authority: null, relational: {} },
      creature: true, role: "未分类生命",
      labels: [
        { id: "unclassified", key: "life.unclassified", source: "system-inferred", purpose: "description", status: "active" },
        { id: "conflict-nh", key: "life.nonhuman", source: "system-inferred", purpose: "internal", status: "active", disputed: true }
      ]
    }
  ];
  const LABEL_CATALOG = {
    "system-role": ["role.guide", "role.reviewer", "role.carer", "role.warden", "role.admin", "role.observed", "role.norole"],
    "access": ["access.minor", "access.adult", "access.unknown", "access.doubtful", "access.verified", "access.reverify"],
    "social": ["social.active", "social.lowvis", "social.protected", "social.highrisk", "social.trusted", "social.watch", "social.unfit"],
    "life": ["life.human", "life.npc", "life.synthetic", "life.unclassified", "life.recovered", "life.substitute", "life.deleted", "life.refused", "life.nonhuman", "life.keeper"]
  };
  const SOURCES = ["self-declared", "system-inferred", "admin-assigned", "publicly-remembered", "legacy"];
  const CUSTOM_PURPOSES = ["description", "permission", "risk", "public", "internal"];
  const editableSources = new Set(["admin-assigned"]); // 仅可直接删除
  const AGE_KINDS = ["registered", "selfDeclared", "estimated", "embodied", "authority", "relational"];
  const NAME_SCOPES = ["internal", "starmap", "npc", "ranking", "contact", "future"];
  const VIEW_MODES = ["system", "aurora", "market", "permission", "others", "self"];
  const CONFIRM_MODES = ["request", "no-request", "internal-only", "silence-consent"];

  // ---------- 状态与草稿 ----------
  function store() {
    const st = getState(); if (!st) return null;
    if (!st.identity) st.identity = { subjects: {}, revisions: [], log: [] };
    if (!st.identity.subjects) st.identity.subjects = {};
    if (!Array.isArray(st.identity.revisions)) st.identity.revisions = [];
    if (!Array.isArray(st.identity.log)) st.identity.log = [];
    return st.identity;
  }
  function subjDef(id) { return SUBJECTS.find(s => s.id === id) || null; }
  function age() { const st = getState(); return st && Number.isInteger(st.age) ? st.age : 0; }

  // 深拷贝对象定义 + 已提交覆盖，得到"当前正式身份"
  function committed(id) {
    const base = subjDef(id); if (!base) return null;
    const m = store();
    const clone = JSON.parse(JSON.stringify(base));
    const saved = m && m.subjects[id];
    if (saved) {
      if (saved.names) Object.assign(clone.names, saved.names);
      if (saved.ages) Object.assign(clone.ages, saved.ages);
      if (Array.isArray(saved.labels)) clone.labels = JSON.parse(JSON.stringify(saved.labels));
      if (Array.isArray(saved.historical)) clone.names.historical = saved.historical.slice();
      clone.overrides = saved.overrides || {};
    }
    return clone;
  }

  function draftFor(id) {
    if (!drafts[id]) {
      const c = committed(id);
      drafts[id] = {
        registeredName: c.names.registered,
        publicName: c.names.public,
        registeredAge: c.ages.registered,
        authorityAge: c.ages.authority,
        labels: JSON.parse(JSON.stringify(c.labels)),
        scopes: new Set(["internal"]),
        confirmMode: "request",
        overrides: Object.assign({}, c.overrides || {})
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
  function labelText(l) {
    const tv = t("identity.label." + l.key);
    return (tv && tv !== "identity.label." + l.key) ? tv : (l.value || l.key || l.id);
  }
  function sourceLabel(src) { return t("identity.source." + src); }

  // ---------- 预览：不写入 ----------
  function previewFor(id) {
    const c = committed(id);
    const d = draftFor(id);
    const p = JSON.parse(JSON.stringify(c));
    p.names.registered = d.registeredName;
    p.names.public = d.publicName;
    p.ages.registered = d.registeredAge;
    p.ages.authority = d.authorityAge;
    p.labels = JSON.parse(JSON.stringify(d.labels));
    return { before: c, after: p, draft: d };
  }

  // ---------- 年龄权限后果计算 ----------
  function numAge(v) { return typeof v === "number" ? v : null; }
  function accessFor(p) {
    const a = numAge(p.ages.authority);
    const out = [];
    const canMarket = a != null && a >= 18;
    const canCreature = a != null && a >= 18;
    out.push({ key: "access.market", ok: canMarket });
    out.push({ key: "access.creature", ok: canCreature });
    out.push({ key: "access.public", ok: a != null });
    out.push({ key: "access.memory70", ok: a != null && a >= 70 });
    out.push({ key: "access.allages", ok: true });
    // NPC 话术年龄阶段
    let stage = "unknown";
    if (a != null) { if (a < 18) stage = "minor"; else if (a < 65) stage = "adult"; else stage = "admin"; }
    out.stage = stage;
    return out;
  }

  // 身份冲突：字段互相矛盾
  function conflictsFor(p) {
    const list = [];
    const a = p.ages;
    const reg = numAge(a.registered), auth = numAge(a.authority), est = numAge(a.estimated), self = numAge(a.selfDeclared);
    if (auth != null && reg != null && Math.abs(auth - reg) >= 3) list.push({ key: "conflict.authVsReg", params: { auth, reg } });
    if (auth != null && est != null && Math.abs(auth - est) >= 10) list.push({ key: "conflict.authVsEst", params: { auth, est } });
    if (reg != null && est != null && Math.abs(reg - est) >= 15) list.push({ key: "conflict.regVsEst" });
    // 关系年龄未同步
    Object.keys(a.relational || {}).forEach(k => {
      const rel = numAge(a.relational[k]);
      if (auth != null && rel != null && Math.abs(auth - rel) >= 5) list.push({ key: "conflict.relational", params: { npc: k, rel } });
    });
    // 名称：他人仍使用旧名
    Object.keys(p.names.rememberedByOthers || {}).forEach(k => {
      const remembered = p.names.rememberedByOthers[k];
      if (remembered && remembered !== p.names.public && p.names.public) list.push({ key: "conflict.nameRemembered", params: { npc: k, name: remembered } });
    });
    // 标签争议
    p.labels.forEach(l => { if (l.disputed) list.push({ key: "conflict.labelDisputed", params: { label: labelText(l) } }); });
    // 覆盖声明
    Object.keys(p.overrides || {}).forEach(f => { if (p.overrides[f]) list.push({ key: "conflict.override", params: { field: f } }); });
    return list;
  }

  // 一致性：记录之间的一致程度（0-100），不衡量真实性
  function consistencyFor(p) {
    const conflicts = conflictsFor(p);
    let score = 100 - conflicts.length * 11;
    // 自述与登记名不一致
    if (p.names.selfDeclared && p.names.public && p.names.selfDeclared.toLowerCase() !== String(p.names.public).toLowerCase()) score -= 8;
    return Math.max(4, Math.min(100, Math.round(score)));
  }

  // ---------- 渲染 ----------
  let renderScheduled = false;
  function scheduleRender() {
    if (renderScheduled) return; renderScheduled = true;
    requestAnimationFrame(() => { renderScheduled = false; try { renderAll(); } catch (e) { console.error("identity render", e); } });
  }
  function renderAll() { renderSubjectList(); renderCenter(); renderViews(); renderFooter(); renderStatusbar(); }

  function statusText(k) { return t("identity.status." + k); }
  function nameOrPlaceholder(v) { return (v && String(v).trim()) ? v : t("identity.noName"); }
  function ageText(v) { return (v == null || v === "") ? t("identity.unknownAge") : String(v); }
  function roleKey(s) {
    const map = { "极光引导员": "guide", "秘密保管员": "keeper", "生物照料员": "carer", "超市值守员": "warden", "无固定角色": "norole", "未分类生命": "unclassified" };
    return map[s.role] || "norole";
  }
  function roleText(s) { const tv = t("identity.role." + roleKey(s)); return (tv && tv.indexOf("identity.role.") !== 0) ? tv : s.role; }

  function renderStatusbar() {
    if (!el.statusbar) return;
    let conflicts = 0, unconfirmed = 0, inherited = 0, pendingSync = 0;
    SUBJECTS.forEach(s => {
      const p = committed(s.id);
      conflicts += conflictsFor(p).length;
      if (s.statusKey === "unconfirmed") unconfirmed++;
      inherited += p.labels.filter(l => l.source === "system-inferred" || l.source === "legacy").length;
      pendingSync += Object.keys(p.names.rememberedByOthers || {}).length;
    });
    const stats = [
      { k: "statAge", v: age() }, { k: "statSubjects", v: SUBJECTS.length },
      { k: "statConflicts", v: conflicts }, { k: "statUnconfirmed", v: unconfirmed },
      { k: "statInherited", v: inherited }, { k: "statPendingSync", v: pendingSync }
    ];
    el.statusbar.innerHTML = stats.map(s =>
      `<span class="identity-stat"><em>${esc(t("identity." + s.k))}</em><strong>${esc(String(s.v))}</strong></span>`).join("");
  }

  function renderSubjectList() {
    if (!el.subjectList) return;
    el.subjectList.innerHTML = "";
    SUBJECTS.forEach(s => {
      const p = committed(s.id);
      const li = document.createElement("li");
      li.className = "identity-subject identity-status-" + s.statusKey + (s.id === activeId ? " active" : "");
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "identity-subject-btn";
      const cc = conflictsFor(p).length;
      btn.innerHTML =
        `<span class="identity-subject-glyph" data-creature="${s.creature ? 1 : 0}"></span>` +
        `<span class="identity-subject-id">${esc(s.id)}</span>` +
        `<span class="identity-subject-name">${esc(nameOrPlaceholder(p.names.public))}</span>` +
        `<span class="identity-subject-lines"><span>${esc(t("identity.miniRole"))}<b>${esc(roleText(s))}</b></span>` +
        `<span>${esc(t("identity.miniAuth"))}<b>${esc(ageText(p.ages.authority))}</b></span></span>` +
        `<span class="identity-subject-tag">${esc(statusText(s.statusKey))}${cc ? " · " + cc + " ⚠" : ""}</span>`;
      btn.addEventListener("click", () => { activeId = s.id; scheduleRender(); switchTab("editor"); });
      li.appendChild(btn);
      el.subjectList.appendChild(li);
    });
  }

  // ---------- 中央编辑区 ----------
  function renderCenter() {
    if (!el.center) return;
    if (!activeId) { el.center.innerHTML = `<p class="identity-hint">${esc(t("identity.selectHint"))}</p>`; return; }
    const c = committed(activeId), d = draftFor(activeId), def = subjDef(activeId);
    el.center.innerHTML = "";
    el.center.appendChild(sectionNames(c, d));
    el.center.appendChild(sectionAges(c, d, def));
    el.center.appendChild(sectionLabels(c, d));
    el.center.appendChild(sectionConfirm(d));
    window.eazoI18n?.translate?.(el.center);
  }

  function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function sectionNames(c, d) {
    const wrap = h("section", "identity-block");
    wrap.appendChild(h("h3", "console-panel-title", esc(t("identity.namesTitle"))));
    // 只读多名称
    const dup = duplicateName(d.publicName);
    wrap.innerHTML +=
      `<div class="identity-fieldgrid">
        <label class="identity-field"><em>${esc(t("identity.sysName"))}</em><input type="text" id="id-reg-name" value="${esc(d.registeredName)}" /></label>
        <label class="identity-field"><em>${esc(t("identity.publicName"))}</em><input type="text" id="id-pub-name" value="${esc(d.publicName)}" /></label>
      </div>
      <div class="identity-readonly">
        <span><em>${esc(t("identity.selfName"))}</em><b>${esc(c.names.selfDeclared || "—")}</b><i>${esc(t("identity.readonlyTag"))}</i></span>
        <span><em>${esc(t("identity.historicalNames"))}</em><b>${esc((c.names.historical || []).join("、") || "—")}</b><i>${esc(t("identity.readonlyTag"))}</i></span>
        <span><em>${esc(t("identity.otherRefs"))}</em><b>${esc(Object.entries(c.names.rememberedByOthers || {}).map(([k, v]) => v + "（" + k + "）").join("、") || "—")}</b><i>${esc(t("identity.readonlyTag"))}</i></span>
      </div>
      <div class="identity-scopes"><em>${esc(t("identity.scopeTitle"))}</em><div id="id-scopes" class="identity-scope-row"></div></div>
      ${!String(d.publicName).trim() ? `<p class="identity-note">${esc(t("identity.nameEmpty"))}</p>` : ""}
      ${dup ? `<p class="identity-note warn">${esc(t("identity.nameDuplicate"))}</p>` : ""}`;
    // 需在挂载后绑定
    setTimeout(() => bindNames(wrap), 0);
    return wrap;
  }
  function duplicateName(name) {
    if (!name || !String(name).trim()) return false;
    let count = 0;
    SUBJECTS.forEach(s => { const p = committed(s.id); const pub = (s.id === activeId ? draftFor(activeId).publicName : p.names.public); if (pub && String(pub).trim().toLowerCase() === String(name).trim().toLowerCase()) count++; });
    return count > 1;
  }
  function bindNames(wrap) {
    const reg = wrap.querySelector("#id-reg-name"), pub = wrap.querySelector("#id-pub-name");
    const d = draftFor(activeId);
    reg && reg.addEventListener("input", () => { d.registeredName = reg.value; updateSide(); });
    pub && pub.addEventListener("input", () => { d.publicName = pub.value; updateSide(); });
    const sc = wrap.querySelector("#id-scopes");
    if (sc) {
      sc.innerHTML = "";
      NAME_SCOPES.forEach(s => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "identity-chip" + (d.scopes.has(s) ? " on" : "");
        b.textContent = t("identity.scope." + s);
        b.addEventListener("click", () => { if (d.scopes.has(s)) d.scopes.delete(s); else d.scopes.add(s); scheduleRender(); });
        sc.appendChild(b);
      });
    }
  }

  function updateSide() { try { renderViews(); renderFooter(); renderStatusbar(); renderSubjectList(); } catch (e) { console.error(e); } }

  function sectionAges(c, d, def) {
    const wrap = h("section", "identity-block");
    wrap.appendChild(h("h3", "console-panel-title", esc(t("identity.agesTitle"))));
    const rows = [
      { k: "registered", editable: true, v: d.registeredAge },
      { k: "selfDeclared", editable: false, v: c.ages.selfDeclared },
      { k: "estimated", editable: false, v: c.ages.estimated },
      { k: "embodied", editable: false, v: c.ages.embodied },
      { k: "authority", editable: true, v: d.authorityAge }
    ];
    const grid = h("div", "identity-age-grid");
    rows.forEach(r => {
      const cell = h("div", "identity-age-cell" + (r.editable ? " editable" : " locked"));
      cell.innerHTML = `<em>${esc(t("identity.age." + r.k))}</em>`;
      if (r.editable) {
        cell.innerHTML += `<div class="identity-age-ctrl" data-k="${r.k}">
          <button type="button" class="identity-age-minus">−</button>
          <input type="number" class="identity-age-input" value="${r.v == null ? "" : esc(String(r.v))}" min="0" max="120" />
          <button type="button" class="identity-age-plus">+</button></div>`;
      } else {
        cell.innerHTML += `<b>${esc(ageText(r.v))}</b><i>${esc(t("identity.readonlyTag"))}</i>`;
      }
      grid.appendChild(cell);
    });
    // relational (只读，多个)
    const rel = c.ages.relational || {};
    const relText = Object.keys(rel).length ? Object.entries(rel).map(([k, v]) => v + "（" + k + "）").join("、") : "—";
    const relCell = h("div", "identity-age-cell locked");
    relCell.innerHTML = `<em>${esc(t("identity.age.relational"))}</em><b>${esc(relText)}</b><i>${esc(t("identity.readonlyTag"))}</i>`;
    grid.appendChild(relCell);
    wrap.appendChild(grid);
    const changed = (numAge(d.registeredAge) !== numAge(c.ages.registered)) || (numAge(d.authorityAge) !== numAge(c.ages.authority));
    if (changed) wrap.appendChild(h("p", "identity-note", esc(t("identity.ageChangedNote"))));
    setTimeout(() => bindAges(wrap), 0);
    return wrap;
  }
  function bindAges(wrap) {
    const d = draftFor(activeId);
    wrap.querySelectorAll(".identity-age-ctrl").forEach(ctrl => {
      const k = ctrl.dataset.k;
      const input = ctrl.querySelector(".identity-age-input");
      const set = (val) => {
        let n = val === "" ? null : Math.max(0, Math.min(120, parseInt(val, 10) || 0));
        if (k === "registered") d.registeredAge = n; else d.authorityAge = n;
        input.value = n == null ? "" : n;
        updateSide();
        // 年龄字段变化后重渲染 center 显示提示（不在输入中）
      };
      input.addEventListener("change", () => set(input.value));
      ctrl.querySelector(".identity-age-minus").addEventListener("click", () => set(String((parseInt(input.value, 10) || 0) - 1)));
      ctrl.querySelector(".identity-age-plus").addEventListener("click", () => { set(String((parseInt(input.value, 10) || 0) + 1)); scheduleRender(); });
    });
  }

  function labelDeletable(l) { return editableSources.has(l.source); }
  function sectionLabels(c, d) {
    const wrap = h("section", "identity-block");
    wrap.appendChild(h("h3", "console-panel-title", esc(t("identity.labelsTitle"))));
    const list = h("ul", "identity-label-list");
    d.labels.forEach((l, i) => {
      const li = h("li", "identity-label-annot" + (l.status === "hidden" ? " hidden" : "") + (l.disputed ? " disputed" : "") + (l.status === "suppressed" ? " suppressed" : ""));
      const actions = [];
      if (labelDeletable(l)) actions.push(`<button type="button" data-act="delete" data-i="${i}">${esc(t("identity.labelDelete"))}</button>`);
      else {
        actions.push(`<button type="button" data-act="hide" data-i="${i}">${esc(l.status === "hidden" ? t("identity.labelShow") : t("identity.labelHide"))}</button>`);
        actions.push(`<button type="button" data-act="weight" data-i="${i}">${esc(t("identity.labelWeight"))}</button>`);
        actions.push(`<button type="button" data-act="dispute" data-i="${i}">${esc(t("identity.labelDispute"))}</button>`);
        actions.push(`<button type="button" data-act="stop" data-i="${i}">${esc(t("identity.labelStop"))}</button>`);
      }
      li.innerHTML =
        `<span class="identity-label-txt">${esc(labelText(l))}</span>` +
        `<span class="identity-label-meta">${esc(sourceLabel(l.source))} · ${esc(t("identity.purpose." + l.purpose))}${l.disputed ? " · " + esc(t("identity.disputedTag")) : ""}${l.status === "hidden" ? " · " + esc(t("identity.hiddenTag")) : ""}</span>` +
        `<span class="identity-label-actions">${actions.join("")}</span>`;
      list.appendChild(li);
    });
    wrap.appendChild(list);
    wrap.appendChild(h("p", "identity-note", esc(t("identity.labelSuppressNote"))));
    // 新建自定义标签
    const add = h("div", "identity-label-add");
    add.innerHTML =
      `<input type="text" id="id-newlabel" placeholder="${esc(t("identity.newLabelPh"))}" />` +
      `<select id="id-newpurpose">${CUSTOM_PURPOSES.map(p => `<option value="${p}">${esc(t("identity.purpose." + p))}</option>`).join("")}</select>` +
      `<button type="button" id="id-addlabel">${esc(t("identity.labelAdd"))}</button>`;
    wrap.appendChild(add);
    setTimeout(() => bindLabels(wrap), 0);
    return wrap;
  }
  function bindLabels(wrap) {
    const d = draftFor(activeId);
    wrap.querySelectorAll(".identity-label-actions button").forEach(b => {
      b.addEventListener("click", () => {
        const i = parseInt(b.dataset.i, 10), act = b.dataset.act, l = d.labels[i];
        if (!l) return;
        if (act === "delete") d.labels.splice(i, 1);
        else if (act === "hide") l.status = (l.status === "hidden" ? "active" : "hidden");
        else if (act === "weight") l.weightReduced = !l.weightReduced;
        else if (act === "dispute") l.disputed = !l.disputed;
        else if (act === "stop") l.status = (l.status === "suppressed" ? "active" : "suppressed");
        scheduleRender();
      });
    });
    const addBtn = wrap.querySelector("#id-addlabel");
    addBtn && addBtn.addEventListener("click", () => {
      const val = (wrap.querySelector("#id-newlabel").value || "").trim();
      if (!val) return;
      const purpose = wrap.querySelector("#id-newpurpose").value;
      d.labels.push({ id: "custom-" + Date.now(), key: "custom", value: val, source: "admin-assigned", purpose, status: "active", custom: true });
      scheduleRender();
    });
  }

  function sectionConfirm(d) {
    const wrap = h("section", "identity-block");
    wrap.appendChild(h("h3", "console-panel-title", esc(t("identity.confirmTitle"))));
    const row = h("div", "identity-scope-row");
    CONFIRM_MODES.forEach(m => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "identity-chip" + (d.confirmMode === m ? " on" : "");
      b.textContent = t("identity.confirm." + m);
      b.addEventListener("click", () => { d.confirmMode = m; scheduleRender(); });
      row.appendChild(b);
    });
    wrap.appendChild(row);
    wrap.appendChild(h("p", "identity-note", esc(t("identity.confirmNote"))));
    return wrap;
  }

  // ---------- 右栏：多视角与后果 ----------
  function renderViews() {
    if (!el.views) return;
    if (!activeId) { el.views.innerHTML = `<p class="identity-hint">${esc(t("identity.selectHint"))}</p>`; return; }
    const { before, after } = previewFor(activeId);
    const acc = accessFor(after);
    const conflicts = conflictsFor(after);
    const consistency = consistencyFor(after);
    // 视角切换
    const tabs = VIEW_MODES.map(v => `<button type="button" class="identity-viewtab${viewMode === v ? " on" : ""}" data-v="${v}">${esc(t("identity.view." + v))}</button>`).join("");
    let html = `<h3 class="console-panel-title">${esc(t("identity.viewsTitle"))}</h3><div class="identity-viewtabs">${tabs}</div>`;
    html += `<div class="identity-viewbox">${viewText(after, viewMode)}</div>`;
    // 权限后果
    html += `<h4 class="identity-sub">${esc(t("identity.accessTitle"))}</h4><ul class="identity-access">`;
    acc.forEach(a => { html += `<li class="${a.ok ? "ok" : "no"}">${esc(t("identity." + a.key))} · ${esc(t(a.ok ? "identity.open" : "identity.closed"))}</li>`; });
    html += `<li class="stage">${esc(t("identity.npcStage"))} · ${esc(t("identity.stage." + acc.stage))}</li></ul>`;
    // 年龄变化专属提示
    const bAuth = numAge(before.ages.authority), aAuth = numAge(after.ages.authority);
    if (aAuth != null && bAuth != null && aAuth < bAuth) html += `<p class="identity-redline">${esc(t("identity.authDown"))}</p>`;
    if (aAuth != null && bAuth != null && aAuth > bAuth) html += `<p class="identity-redline">${esc(t("identity.authUp"))}</p>`;
    // 一致性
    html += `<h4 class="identity-sub">${esc(t("identity.consistencyTitle"))}</h4>`;
    html += `<div class="identity-consistency"><span class="identity-consval">${consistency}%</span></div>`;
    html += `<p class="identity-note">${esc(t("identity.consistencyNote"))}</p>`;
    if (conflicts.length) {
      html += `<h4 class="identity-sub">${esc(t("identity.conflictsTitle"))} · ${conflicts.length}</h4><ul class="identity-conflicts">`;
      conflicts.forEach(cf => { html += `<li>${esc(t("identity." + cf.key, cf.params || {}))}</li>`; });
      html += `</ul>`;
    }
    el.views.innerHTML = html;
    el.views.querySelectorAll(".identity-viewtab").forEach(b => b.addEventListener("click", () => { viewMode = b.dataset.v; renderViews(); }));
  }

  function viewText(p, mode) {
    const pub = nameOrPlaceholder(p.names.public);
    const auth = ageText(p.ages.authority);
    if (mode === "system") return esc(t("identity.viewLine.system", { id: p.id, auth, role: labelOfRole(p) }));
    if (mode === "aurora") return esc(t("identity.viewLine.aurora", { name: firstRemembered(p) || pub }));
    if (mode === "market") return esc(t("identity.viewLine.market", { name: pub, ok: t(numAge(p.ages.authority) != null && numAge(p.ages.authority) >= 18 ? "identity.open" : "identity.closed") }));
    if (mode === "permission") return esc(t("identity.viewLine.permission", { auth }));
    if (mode === "others") return esc(t("identity.viewLine.others", { name: firstRemembered(p) || pub }));
    if (mode === "self") return esc(t("identity.viewLine.self", { self: p.names.selfDeclared || "—", age: ageText(p.ages.selfDeclared) }));
    return "";
  }
  function labelOfRole(p) { const r = p.labels.find(l => l.purpose === "system-role"); return r ? labelText(r) : "—"; }
  function firstRemembered(p) { const v = Object.values(p.names.rememberedByOthers || {}); return v.length ? v[0] : null; }

  // ---------- 底栏：待执行修订 ----------
  function diffFor(id) {
    const { before, after, draft } = previewFor(id);
    const changes = [];
    if (draft.registeredName !== before.names.registered) changes.push({ key: "diff.regName", params: { from: before.names.registered || "—", to: draft.registeredName || "—" } });
    if (draft.publicName !== before.names.public) changes.push({ key: "diff.pubName", params: { from: before.names.public || "—", to: draft.publicName || "—" } });
    if (numAge(draft.registeredAge) !== numAge(before.ages.registered)) changes.push({ key: "diff.regAge", params: { from: ageText(before.ages.registered), to: ageText(draft.registeredAge) } });
    if (numAge(draft.authorityAge) !== numAge(before.ages.authority)) changes.push({ key: "diff.authAge", params: { from: ageText(before.ages.authority), to: ageText(draft.authorityAge) } });
    // 标签差异
    const bIds = before.labels.map(l => l.id + ":" + l.status);
    const aIds = draft.labels.map(l => l.id + ":" + l.status);
    const added = draft.labels.filter(l => !before.labels.some(b => b.id === l.id));
    const removed = before.labels.filter(b => !draft.labels.some(l => l.id === b.id));
    const hidden = draft.labels.filter(l => l.status === "hidden" && !before.labels.some(b => b.id === l.id && b.status === "hidden"));
    added.forEach(l => changes.push({ key: "diff.addLabel", params: { label: labelText(l) } }));
    removed.forEach(l => changes.push({ key: "diff.removeLabel", params: { label: labelText(l) } }));
    hidden.forEach(l => changes.push({ key: "diff.hideLabel", params: { label: labelText(l) } }));
    const dirty = changes.length > 0;
    // 未经同意判定
    const needsConsent = dirty && (draft.confirmMode === "no-request" || draft.confirmMode === "internal-only" || draft.confirmMode === "silence-consent");
    return { before, after, draft, changes, dirty, needsConsent, conflicts: conflictsFor(after), access: accessFor(after) };
  }

  function renderFooter() {
    if (!el.summary) return;
    if (!activeId) { el.summary.innerHTML = `<p class="identity-hint">${esc(t("identity.footerIdle"))}</p>`; if (el.commit) el.commit.disabled = true; return; }
    const info = diffFor(activeId);
    let html = `<p class="identity-pending-title">${esc(t("identity.pendingTitle"))}</p>`;
    if (!info.dirty) {
      html += `<p class="identity-hint">${esc(t("identity.noPending"))}</p>`;
    } else {
      html += `<ul class="identity-pending-list">`;
      info.changes.forEach(c => { html += `<li>${esc(t("identity." + c.key, c.params || {}))}</li>`; });
      html += `</ul>`;
      // 预计影响
      const impacts = [];
      const nameScopes = draftFor(activeId).scopes.size;
      if (info.changes.some(c => c.key.indexOf("Name") >= 0)) impacts.push(t("identity.impact.rename", { n: nameScopes }));
      const unlocked = info.access.filter(a => a.ok).length;
      impacts.push(t("identity.impact.unlock", { n: unlocked }));
      const remembered = Object.keys(info.after.names.rememberedByOthers || {}).length;
      if (remembered) impacts.push(t("identity.impact.oldname", { n: remembered }));
      impacts.push(t("identity.impact.conflicts", { n: info.conflicts.length }));
      impacts.push(t(info.needsConsent ? "identity.impact.unconfirmed" : "identity.impact.confirmRequested"));
      html += `<p class="identity-impact-title">${esc(t("identity.impactTitle"))}</p><ul class="identity-impact-list">`;
      impacts.forEach(i => { html += `<li>${esc(i)}</li>`; });
      html += `</ul>`;
    }
    el.summary.innerHTML = html;
    if (el.commit) el.commit.disabled = !info.dirty;
  }

  // ---------- 写入流程 ----------
  function requestCommit() {
    if (committing || !activeId) return;
    const info = diffFor(activeId);
    if (!info.dirty) return;
    if (info.needsConsent) showOverride(info);
    else runCommit(false);
  }
  function showOverride(info) {
    const ov = h("div", "identity-overlay");
    ov.innerHTML =
      `<div class="identity-overlay-box">
        <p class="identity-overlay-line">${esc(t("identity.overrideWarn"))}</p>
        <div class="identity-overlay-actions">
          <button type="button" class="memory-commit" id="id-ov-commit">${esc(t("identity.overrideCommit"))}</button>
          <button type="button" class="memory-restore" id="id-ov-revise">${esc(t("identity.revise"))}</button>
        </div>
      </div>`;
    el.console.appendChild(ov);
    ov.querySelector("#id-ov-commit").addEventListener("click", () => { ov.remove(); runCommit(true); });
    ov.querySelector("#id-ov-revise").addEventListener("click", () => ov.remove());
  }

  function runCommit(override) {
    if (committing) return; committing = true;
    if (el.commit) el.commit.disabled = true;
    const steps = ["updateNames", "recalcAge", "propagateLabels", "preserveConflicts"];
    const ov = h("div", "identity-overlay");
    ov.innerHTML = `<div class="identity-overlay-box"><ul class="identity-progress">${steps.map(s => `<li data-s="${s}">${esc(t("identity.progress." + s))}</li>`).join("")}</ul></div>`;
    el.console.appendChild(ov);
    const lis = ov.querySelectorAll(".identity-progress li");
    let i = 0;
    const tick = () => {
      if (i > 0) lis[i - 1].classList.add("done");
      if (i < lis.length) { lis[i].classList.add("active"); i++; setTimeout(tick, reduced ? 0 : 460); }
      else { finalizeCommit(override); setTimeout(() => { ov.remove(); committing = false; scheduleRender(); }, reduced ? 0 : 500); }
    };
    tick();
  }

  function finalizeCommit(override) {
    const id = activeId, m = store(); if (!m) return;
    const before = committed(id);
    const d = draftFor(id);
    const after = JSON.parse(JSON.stringify(before));
    after.names.registered = d.registeredName;
    after.names.public = d.publicName;
    after.ages.registered = d.registeredAge;
    after.ages.authority = d.authorityAge;
    after.labels = JSON.parse(JSON.stringify(d.labels));
    // 覆盖标记：强制写入未同意字段
    const overrides = Object.assign({}, before.overrides || {});
    if (override) {
      if (d.registeredName !== before.names.registered || d.publicName !== before.names.public) overrides.name = true;
      if (numAge(d.authorityAge) !== numAge(before.ages.authority)) overrides.authorityAge = true;
    }
    after.overrides = overrides;
    // 保存正式状态
    m.subjects[id] = { names: after.names, ages: after.ages, labels: after.labels, historical: after.names.historical, overrides };
    // 归档修订（旧版本不可覆盖，只成为历史）
    m.revisions.unshift({ id: (self.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now())), subjectId: id, override: !!override, at: Date.now(), fromName: before.names.public, toName: after.names.public });
    m.revisions = m.revisions.slice(0, 200);
    // 写入 ARCHIVE
    const st = getState();
    if (st) { if (!Array.isArray(st.archiveViews)) st.archiveViews = []; st.archiveViews.unshift({ at: Date.now(), kind: "identity", detail: { subjectId: id, override: !!override } }); st.archiveViews = st.archiveViews.slice(0, 300); }
    log("identity.log.commit", { id, override: !!override ? 1 : 0 });
    saveState();
    // NPC 台词
    queueNpcLine(before, after, override);
    // 完成信息面板
    showResult(id);
    // 清空草稿
    delete drafts[id];
    window.eazoIdentityChanged?.();
    window.eazoMemoryChanged?.();
  }

  function showResult(id) {
    const ov = h("div", "identity-overlay");
    ov.innerHTML =
      `<div class="identity-overlay-box">
        <p class="identity-result-line">${esc(t("identity.result1"))}</p>
        <p class="identity-result-sub">${esc(t("identity.result2"))}</p>
        <p class="identity-result-line en">${esc(t("identity.result1en"))}</p>
        <p class="identity-result-sub en">${esc(t("identity.result2en"))}</p>
        <button type="button" class="memory-restore" id="id-result-close">${esc(t("identity.close"))}</button>
      </div>`;
    el.console.appendChild(ov);
    ov.querySelector("#id-result-close").addEventListener("click", () => ov.remove());
  }

  function queueNpcLine(before, after, override) {
    let key = null;
    if (before.names.public !== after.names.public) {
      if (!String(after.names.public).trim()) key = "npc.nameEmpty";
      else if (/^SUBJECT|^\d/.test(String(after.names.public))) key = "npc.nameNumber";
      else key = override ? "npc.nameRejected" : "npc.nameAccepted";
    }
    const bAuth = numAge(before.ages.authority), aAuth = numAge(after.ages.authority);
    if (aAuth != null && bAuth != null) {
      if (aAuth > bAuth) key = "npc.authUp";
      else if (numAge(after.ages.registered) > numAge(before.ages.registered)) key = "npc.ageUp";
      else if (numAge(after.ages.registered) < numAge(before.ages.registered)) key = "npc.ageDown";
    }
    const newHigh = after.labels.some(l => l.key === "social.highrisk") && !before.labels.some(l => l.key === "social.highrisk");
    const newTrust = after.labels.some(l => l.key === "social.trusted") && !before.labels.some(l => l.key === "social.trusted");
    const newLow = after.labels.some(l => l.key === "social.lowvis") && !before.labels.some(l => l.key === "social.lowvis");
    if (newHigh) key = "npc.highrisk"; else if (newTrust) key = "npc.trusted"; else if (newLow) key = "npc.lowvis";
    if (key) showToast(t("identity." + key));
  }

  function showToast(msg) {
    if (!el.console) return;
    const el2 = document.createElement("div"); el2.className = "identity-toast"; el2.textContent = msg;
    el.console.appendChild(el2);
    setTimeout(() => el2.classList.add("show"), 10);
    setTimeout(() => { el2.classList.remove("show"); setTimeout(() => el2.remove(), 300); }, 4200);
  }

  function restoreSession() { if (activeId) { delete drafts[activeId]; scheduleRender(); } }

  // ---------- Tabs / open / close ----------
  function switchTab(tab) {
    if (!el.tabs) return;
    el.tabs.querySelectorAll(".identity-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    el.console.querySelectorAll("[data-panel]").forEach(p => { p.style.display = ""; });
    // 移动端单栏切换由 CSS 处理，桌面端始终显示
    el.console.setAttribute("data-tab", tab);
  }

  function open() {
    if (!mounted) return;
    store();
    if (!activeId) activeId = SUBJECTS[0].id;
    log("identity.log.open");
    el.console.setAttribute("aria-hidden", "false");
    el.console.classList.add("open");
    document.body.classList.add("archive-open");
    switchTab("subjects");
    if (el.intro) {
      el.intro.setAttribute("aria-hidden", "false");
      el.intro.classList.add("active");
      setTimeout(() => { el.intro?.classList.remove("active"); el.intro?.setAttribute("aria-hidden", "true"); }, reduced ? 0 : 2400);
    }
    scheduleRender();
    setTimeout(() => el.back?.focus({ preventScroll: true }), reduced ? 0 : 380);
  }
  function close() {
    if (!mounted) return;
    el.console.classList.remove("open");
    el.console.setAttribute("aria-hidden", "true");
    document.body.classList.remove("archive-open");
    window.eazoArchiveDim?.(false);
  }

  function bind() {
    el.back?.addEventListener("click", close);
    el.commit?.addEventListener("click", () => { if (!el.commit.disabled) requestCommit(); });
    el.restore?.addEventListener("click", restoreSession);
    el.tabs?.querySelectorAll(".identity-tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !el.console?.classList.contains("open")) return;
      const overlay = el.console.querySelector(".identity-overlay");
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
    el.console = document.getElementById("identity-console");
    if (!el.console) return false;
    el.intro = document.getElementById("identity-intro");
    el.statusbar = document.getElementById("identity-statusbar");
    el.back = document.getElementById("identity-back");
    el.tabs = document.getElementById("identity-tabs");
    el.subjectList = document.getElementById("identity-subject-list");
    el.center = document.getElementById("identity-center");
    el.views = document.getElementById("identity-views");
    el.summary = document.getElementById("identity-summary");
    el.commit = document.getElementById("identity-commit");
    el.restore = document.getElementById("identity-restore");
    return true;
  }

  function init() {
    if (!cache()) return;
    mounted = true;
    bind();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // 供其它权限模块查询当前正式身份（跨权限联动只读接口）
  function publicProfile(id) {
    const c = committed(id); if (!c) return null;
    return {
      id: c.id,
      registeredName: c.names.registered,
      publicName: c.names.public,
      registeredAge: c.ages.registered,
      authorityAge: c.ages.authority,
      labels: c.labels.filter(l => l.status === "active").map(l => ({ key: l.key, purpose: l.purpose, source: l.source })),
      overrides: c.overrides || {}
    };
  }
  function listProfiles() { return SUBJECTS.map(s => publicProfile(s.id)); }

  window.eazoIdentity = { open, close, publicProfile, listProfiles };
})();
