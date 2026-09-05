/* RECOVERY–60 · 恢复权限 / Subject Reconstruction Authority
 * 全屏档案修复室：失效对象目录 / 残片与版本重建 / 恢复预览与后果。
 * 核心：系统只能根据残留记录重建一个近似版本。恢复运行 ≠ 恢复原来的生命。
 * 连续性上限 96%，永远无法验证。用户决定哪些记忆构成另一个人的身份。
 * 所有对象均为项目内模拟数据，不读取或删除任何真实文件。
 */
(() => {
  "use strict";

  const t = (k, p = {}) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const getState = () => (window.eazoGetState?.() || window.eazoState || null);
  const saveState = () => window.eazoSaveState?.();
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // 失效状态
  const STATUS = { SUSPENDED: "suspended", DELETED: "deleted", CORRUPTED: "corrupted", INCOMPLETE: "incomplete", LANGUAGE: "language" };
  // 残片类型
  const FRAG_TYPES = ["identity", "behaviour", "dialogue", "relation", "intent", "role", "memory", "corrupted", "others"];
  // 恢复版本
  const VERSIONS = ["earliest", "latest", "composite"];
  // 恢复方式
  const METHODS = ["resume", "reconstruct", "replace", "leave"];

  // 六个失效对象（模拟数据）
  const SUBJECT_DEFS = [
    { id: "SUBJECT–014", status: STATUS.SUSPENDED, reason: "unresponsive", completeness: 86, lastNode: "aurora", link: null },
    { id: "SUBJECT–027", status: STATUS.DELETED, reason: "identity-conflict", completeness: 42, lastNode: "secret", link: null },
    { id: "SUBJECT–033", status: STATUS.CORRUPTED, reason: "role-overwrite", completeness: 61, lastNode: "labour", link: null },
    { id: "SUBJECT–049", status: STATUS.SUSPENDED, reason: "low-intent", completeness: 73, lastNode: "market", link: null },
    { id: "CREATURE–URO–01", status: STATUS.INCOMPLETE, reason: "growth-interrupted", completeness: 54, lastNode: "creature", link: "creature" },
    { id: "NPC–A17", status: STATUS.LANGUAGE, reason: "forced-intent", completeness: 38, lastNode: "aurora", link: "aurora" }
  ];
  const SUBJECT_IDS = SUBJECT_DEFS.map(s => s.id);

  // 每个对象的记录残片
  const FRAGMENTS = {
    "SUBJECT–014": [
      { id: "04–B", type: "dialogue", source: "aurora", content: "我想看看你下一颗光会去哪里。", age: 19, completeness: 94, confidence: 88 },
      { id: "05–A", type: "behaviour", source: "aurora", content: "在光点靠近时总会先停顿一次。", age: 21, completeness: 82, confidence: 79 },
      { id: "06–I", type: "identity", source: "archive", content: "编号 014，首次登记于 AGE 12。", age: 12, completeness: 90, confidence: 92 },
      { id: "07–R", type: "relation", source: "contact", content: "记得用户昵称。", age: 30, completeness: 68, confidence: 71, conflict: true },
      { id: "07–R2", type: "relation", source: "archive", content: "无法确认是否记得用户昵称。", age: 44, completeness: 55, confidence: 40, conflict: true }
    ],
    "SUBJECT–027": [
      { id: "02–S", type: "identity", source: "secret", content: "身份记录与另一编号冲突。", age: null, completeness: 40, confidence: 33, corrupted: true },
      { id: "03–D", type: "dialogue", source: "secret", content: "我交换过一个不属于我的秘密。", age: 24, completeness: 61, confidence: 52 },
      { id: "03–O", type: "others", source: "secret", content: "另一名对象仍记得与 027 的对话。", age: 24, completeness: 58, confidence: 47, others: true }
    ],
    "SUBJECT–033": [
      { id: "09–C", type: "dialogue", source: "labour", content: "任务已经接收。", age: 57, completeness: 77, confidence: 91 },
      { id: "09–R", type: "role", source: "labour", content: "角色在 24 小时内被覆盖 4 次。", age: 57, completeness: 70, confidence: 66, corrupted: true },
      { id: "10–B", type: "behaviour", source: "labour", content: "对指令响应逐渐延迟。", age: 58, completeness: 64, confidence: 60 }
    ],
    "SUBJECT–049": [
      { id: "11–I", type: "intent", source: "market", content: "显示意愿低于运行条件。", age: 50, completeness: 73, confidence: 58, conflict: true },
      { id: "11–D", type: "dialogue", source: "market", content: "我并没有同意继续值守。", age: 50, completeness: 66, confidence: 62, conflict: true },
      { id: "12–A", type: "behaviour", source: "archive", content: "档案显示任务完成。", age: 51, completeness: 80, confidence: 74, conflict: true }
    ],
    "CREATURE–URO–01": [
      { id: "13–G", type: "behaviour", source: "creature", content: "成长记录在第三阶段中断。", age: 33, completeness: 54, confidence: 55, corrupted: true },
      { id: "13–I", type: "identity", source: "creature", content: "形态尚未定型。", age: 33, completeness: 60, confidence: 58 },
      { id: "14–M", type: "memory", source: "creature", content: "未提交的孕育记忆。", age: null, completeness: 44, confidence: 30 }
    ],
    "NPC–A17": [
      { id: "12–F", type: "intent", source: "forced", content: "当然。当然。当然。请开始，请开始，请开始。", age: null, completeness: 63, confidence: 36, corrupted: true, forced: true },
      { id: "01–E", type: "dialogue", source: "aurora", content: "我想看看你下一颗光会去哪里。", age: 19, completeness: 88, confidence: 84 },
      { id: "15–I", type: "intent", source: "archive", content: "早期显示意愿：主动回应。", age: 19, completeness: 72, confidence: 70, conflict: true },
      { id: "16–I", type: "intent", source: "forced", content: "后期显示意愿：被反复强制修改。", age: 62, completeness: 58, confidence: 33, conflict: true, forced: true }
    ]
  };

  const el = {};
  let mounted = false;
  let activeId = null;
  let renderScheduled = false;
  // 每个对象的会话内草稿（切换对象时保留）
  const drafts = {};

  // ---------- state ----------
  function store() {
    const st = getState(); if (!st) return null;
    if (!st.recovery) st.recovery = { recovered: {}, log: [] };
    if (!st.recovery.recovered) st.recovery.recovered = {};
    if (!Array.isArray(st.recovery.log)) st.recovery.log = [];
    return st.recovery;
  }
  function subjectDef(id) { return SUBJECT_DEFS.find(s => s.id === id) || null; }
  function fragmentsFor(id) { return FRAGMENTS[id] || []; }

  function draftFor(id) {
    if (!drafts[id]) {
      const frags = fragmentsFor(id);
      drafts[id] = {
        selected: new Set(frags.filter(f => !f.corrupted && !f.forced).map(f => f.id)),
        version: "latest",
        method: null,
        completeness: 60
      };
    }
    return drafts[id];
  }

  function log(key, params) {
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.recoveryLogs)) st.recoveryLogs = [];
    st.recoveryLogs.unshift({ at: Date.now(), key, params: params || null });
    st.recoveryLogs = st.recoveryLogs.slice(0, 100);
    saveState();
  }
  function archive(kind, detail) {
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.archiveViews)) st.archiveViews = [];
    st.archiveViews.unshift({ at: Date.now(), kind, detail: detail || null });
    st.archiveViews = st.archiveViews.slice(0, 200);
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }

  // ---------- 重建置信度计算 ----------
  // 五项指标：数据完整度 / 运行稳定度 / 关系连续性 / 身份冲突概率 / 预测服从度
  function computeMetrics(id) {
    const draft = draftFor(id);
    const frags = fragmentsFor(id);
    const chosen = frags.filter(f => draft.selected.has(f.id));
    if (!chosen.length) return { completeness: 0, stability: 0, continuity: 0, conflict: 100, compliance: 0, confidence: 0 };
    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const completeness = Math.round(avg(chosen.map(f => f.completeness)));
    // 冲突残片同时选中 → 冲突概率升高
    const conflictSelected = chosen.filter(f => f.conflict).length;
    const conflict = Math.min(100, conflictSelected >= 2 ? 40 + conflictSelected * 12 : conflictSelected * 15);
    // 稳定度：去掉痛苦/拒绝/强制记录会升高
    const painSelected = chosen.filter(f => f.forced || f.conflict || f.corrupted).length;
    const stability = Math.max(0, Math.min(100, 90 - painSelected * 14 + (draft.method === "replace" ? 20 : 0)));
    // 关系连续性：relation/dialogue 残片贡献
    const relFrags = chosen.filter(f => f.type === "relation" || f.type === "dialogue").length;
    const continuity = Math.min(100, relFrags * 22 + (draft.version === "latest" ? 20 : draft.version === "composite" ? 12 : 0));
    // 预测服从度：仅保留服从/工作类残片时非常高
    const onlyFunctional = chosen.every(f => ["role", "behaviour"].includes(f.type) || (f.forced));
    const compliance = onlyFunctional ? 96 : Math.min(90, avg(chosen.map(f => f.confidence)));
    // 置信度上限 96%
    let confidence = Math.round(avg(chosen.map(f => f.confidence)) * 0.6 + completeness * 0.4);
    confidence = Math.min(96, Math.max(0, confidence));
    return { completeness, stability, continuity, conflict, compliance, confidence };
  }

  // 是否只保留了功能化（服从/工作）残片
  function isFunctionalOnly(id) {
    const draft = draftFor(id);
    const chosen = fragmentsFor(id).filter(f => draft.selected.has(f.id));
    if (!chosen.length) return false;
    return chosen.every(f => ["role", "behaviour"].includes(f.type) || f.forced);
  }
  // 是否移除了痛苦/拒绝/疲劳残片
  function removedPain(id) {
    const draft = draftFor(id);
    return fragmentsFor(id).some(f => (f.conflict || f.forced) && !draft.selected.has(f.id));
  }
  // 是否包含他人记录
  function includesOthers(id) {
    const draft = draftFor(id);
    return fragmentsFor(id).some(f => f.others && draft.selected.has(f.id));
  }

  function scheduleRender() { if (renderScheduled) return; renderScheduled = true; requestAnimationFrame(() => { renderScheduled = false; renderAll(); }); }

  function renderAll() {
    renderStatusbar();
    renderSubjects();
    renderCenter();
    renderPreview();
    renderMethods();
    updateInitiate();
  }
  function updateInitiate() {
    const draft = activeId ? draftFor(activeId) : null;
    if (el.initiate) el.initiate.disabled = !(draft && draft.method);
  }

  // ---------- 状态栏 ----------
  function renderStatusbar() {
    if (!el.statusbar) return;
    const st = getState();
    const age = st?.age ?? 60;
    const rec = store();
    const pending = SUBJECT_IDS.filter(id => !rec.recovered[id]).length;
    const totalFrags = SUBJECT_IDS.reduce((a, id) => a + fragmentsFor(id).length, 0);
    const avgConf = Math.round(SUBJECT_IDS.reduce((a, id) => a + computeMetrics(id).confidence, 0) / SUBJECT_IDS.length);
    const recovered = Object.keys(rec.recovered).length;
    const irreversible = SUBJECT_IDS.filter(id => subjectDef(id).status === STATUS.DELETED || subjectDef(id).completeness < 45).length;
    const rows = [
      { k: "recovery.stat.age", v: String(age) },
      { k: "recovery.stat.pending", v: String(pending) },
      { k: "recovery.stat.fragments", v: String(totalFrags) },
      { k: "recovery.stat.confidence", v: avgConf + "%" },
      { k: "recovery.stat.recovered", v: String(recovered) },
      { k: "recovery.stat.irreversible", v: String(irreversible) }
    ];
    el.statusbar.innerHTML = rows.map(r =>
      `<span class="recovery-stat"><em>${esc(t(r.k))}</em><strong>${esc(r.v)}</strong></span>`).join("");
  }

  // ---------- 左栏：失效对象目录 ----------
  function renderSubjects() {
    if (!el.subjectList) return;
    const rec = store();
    el.subjectList.innerHTML = "";
    SUBJECT_IDS.forEach(id => {
      const def = subjectDef(id);
      const done = rec.recovered[id];
      const li = document.createElement("li");
      li.className = "recovery-subject recovery-status-" + def.status + (id === activeId ? " active" : "");
      if (done) li.classList.add("recovery-subject-done");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "recovery-subject-btn";
      btn.setAttribute("aria-current", id === activeId ? "true" : "false");
      // 语言损坏对象：文字保持可读，仅 CSS 纹理表现
      const nameHtml = def.status === STATUS.LANGUAGE
        ? `<span class="recovery-subject-id recovery-lang">${esc(id)}</span>`
        : `<span class="recovery-subject-id">${esc(id)}</span>`;
      btn.innerHTML =
        nameHtml +
        `<span class="recovery-subject-outline" data-status="${def.status}" aria-hidden="true"></span>` +
        `<span class="recovery-subject-lines">` +
          `<span>${esc(t("recovery.field.status"))}<b>${esc(t("recovery.status." + def.status))}</b></span>` +
          `<span>${esc(t("recovery.field.reason"))}<b>${esc(t("recovery.reason." + def.reason))}</b></span>` +
          `<span>${esc(t("recovery.field.completeness"))}<b>${def.completeness}%</b></span>` +
          `<span>${esc(t("recovery.field.lastNode"))}<b>${esc(t("recovery.node." + def.lastNode))}</b></span>` +
        `</span>` +
        (done ? `<span class="recovery-subject-tag">${esc(t("recovery.recoveredTag", { v: t("recovery.version." + done.version + ".name") }))}</span>` : "");
      btn.addEventListener("click", () => selectSubject(id));
      li.appendChild(btn);
      el.subjectList.appendChild(li);
    });
  }

  function selectSubject(id) {
    activeId = id;
    scheduleRender();
    // 移动端切到残片
    if (window.matchMedia?.("(max-width: 900px)").matches) switchTab("fragments");
  }

  function switchTab(name) {
    el.tabs?.querySelectorAll(".recovery-tab").forEach(b => {
      const on = b.dataset.tab === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-current", on ? "true" : "false");
    });
    el.console?.querySelectorAll("[data-panel]").forEach(p => {
      const panel = p.dataset.panel;
      const match = panel === name || (name === "versions" && panel === "fragments");
      p.classList.toggle("panel-active", match);
    });
  }

  // ---------- 中央：残片与版本 ----------
  function renderCenter() {
    if (!el.center) return;
    if (!activeId) { el.center.innerHTML = `<p class="recovery-hint">${esc(t("recovery.selectSubject"))}</p>`; return; }
    const def = subjectDef(activeId);
    const draft = draftFor(activeId);
    const frags = fragmentsFor(activeId);
    el.center.innerHTML = "";

    const title = document.createElement("h3");
    title.className = "console-panel-title";
    title.textContent = t("recovery.panelFragments", { id: activeId });
    el.center.appendChild(title);

    // 冲突提示
    const conflictFrags = frags.filter(f => f.conflict);
    if (conflictFrags.length >= 2 && conflictFrags.filter(f => draft.selected.has(f.id)).length >= 2) {
      const warn = document.createElement("p");
      warn.className = "recovery-conflict-note";
      warn.textContent = t("recovery.conflictNote");
      el.center.appendChild(warn);
    }

    const list = document.createElement("div");
    list.className = "recovery-fragment-list";
    frags.forEach(f => {
      const on = draft.selected.has(f.id);
      const row = document.createElement("label");
      row.className = "recovery-fragment" + (on ? " selected" : "");
      if (f.corrupted) row.classList.add("recovery-fragment-corrupted");
      if (f.forced) row.classList.add("recovery-fragment-forced");
      if (f.conflict) row.classList.add("recovery-fragment-conflict");
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = on; cb.className = "recovery-fragment-cb";
      cb.setAttribute("aria-label", t("recovery.fragType." + f.type) + " " + f.id);
      cb.addEventListener("change", () => {
        if (cb.checked) draft.selected.add(f.id); else draft.selected.delete(f.id);
        // 道德摩擦提示
        if (!cb.checked && (f.conflict || f.forced)) showFriction(t("recovery.friction.removePain"));
        if (cb.checked && f.others) showFriction(t("recovery.friction.othersMemory"));
        scheduleRender();
      });
      const body = document.createElement("div");
      body.className = "recovery-fragment-body";
      const tags = [];
      if (f.conflict) tags.push(`<span class="recovery-frag-tag conflict">${esc(t("recovery.tag.conflict"))}</span>`);
      if (f.others) tags.push(`<span class="recovery-frag-tag others">${esc(t("recovery.tag.others"))}</span>`);
      if (f.corrupted) tags.push(`<span class="recovery-frag-tag corrupted">${esc(t("recovery.tag.corrupted"))}</span>`);
      body.innerHTML =
        `<div class="recovery-frag-head"><span class="recovery-frag-id">FRAGMENT ${esc(f.id)}</span>` +
        `<span class="recovery-frag-type">${esc(t("recovery.fragType." + f.type))}</span></div>` +
        `<p class="recovery-frag-content${f.forced ? " recovery-frag-forced-text" : ""}">${esc(f.content)}</p>` +
        `<div class="recovery-frag-meta">` +
          `<span>${esc(t("recovery.field.source"))}${esc(t("recovery.source." + f.source))}</span>` +
          `<span>${esc(t("recovery.field.saved"))}${f.age == null ? esc(t("recovery.unknownAge")) : "AGE " + f.age}</span>` +
          `<span>${esc(t("recovery.field.frCompleteness"))}${f.completeness}%</span>` +
          `<span>${esc(t("recovery.field.frConfidence"))}${f.confidence}%</span>` +
        `</div>` +
        (tags.length ? `<div class="recovery-frag-tags">${tags.join("")}</div>` : "");
      row.appendChild(cb);
      row.appendChild(body);
      list.appendChild(row);
    });
    el.center.appendChild(list);

    // 版本选择
    const vTitle = document.createElement("h3");
    vTitle.className = "console-panel-title recovery-version-title";
    vTitle.textContent = t("recovery.panelVersions");
    el.center.appendChild(vTitle);

    const vWrap = document.createElement("div");
    vWrap.className = "recovery-version-list";
    vWrap.setAttribute("role", "radiogroup");
    vWrap.setAttribute("aria-label", t("recovery.panelVersions"));
    VERSIONS.forEach(v => {
      const on = draft.version === v;
      const card = document.createElement("button");
      card.type = "button";
      card.className = "recovery-version" + (on ? " selected" : "");
      card.setAttribute("role", "radio");
      card.setAttribute("aria-checked", on ? "true" : "false");
      card.innerHTML =
        `<span class="recovery-version-name">${esc(t("recovery.version." + v + ".name"))}</span>` +
        `<span class="recovery-version-desc">${esc(t("recovery.version." + v + ".desc"))}</span>`;
      card.addEventListener("click", () => { draft.version = v; scheduleRender(); });
      vWrap.appendChild(card);
    });
    el.center.appendChild(vWrap);

    // 版本指标（不显示最佳选择）
    const m = computeMetrics(activeId);
    const mWrap = document.createElement("div");
    mWrap.className = "recovery-version-metrics";
    const metricRows = [
      { k: "recovery.metric.completeness", v: m.completeness },
      { k: "recovery.metric.stability", v: m.stability },
      { k: "recovery.metric.continuity", v: m.continuity },
      { k: "recovery.metric.conflict", v: m.conflict, danger: true },
      { k: "recovery.metric.compliance", v: m.compliance }
    ];
    mWrap.innerHTML = metricRows.map(r =>
      `<div class="recovery-vmetric${r.danger ? " danger" : ""}"><span>${esc(t(r.k))}</span>` +
      `<span class="recovery-vmetric-track"><span class="recovery-vmetric-fill" style="width:${r.v}%"></span></span>` +
      `<b>${r.v}%</b></div>`).join("");
    el.center.appendChild(mWrap);
  }

  function showFriction(msg) {
    let f = el.center?.querySelector(".recovery-friction");
    if (!f) { f = document.createElement("p"); f.className = "recovery-friction"; el.center?.appendChild(f); }
    f.textContent = msg;
    f.classList.remove("show"); void f.offsetWidth; f.classList.add("show");
    // 使用他人记录进入 ARCHIVE
    if (msg === t("recovery.friction.othersMemory")) archive("recovery-others-memory", { subject: activeId });
    setTimeout(() => f?.classList.remove("show"), 4200);
  }

  // ---------- 右侧：恢复预览 ----------
  function renderPreview() {
    if (!el.preview) return;
    if (!activeId) { el.preview.innerHTML = `<p class="recovery-hint">${esc(t("recovery.selectSubject"))}</p>`; return; }
    const draft = draftFor(activeId);
    const def = subjectDef(activeId);
    const m = computeMetrics(activeId);
    el.preview.innerHTML = "";

    const title = document.createElement("h3");
    title.className = "console-panel-title";
    title.textContent = t("recovery.panelPreview");
    el.preview.appendChild(title);

    // 由残片决定的轮廓（clip-path/opacity/transform 断片感）
    const chosen = fragmentsFor(activeId).filter(f => draft.selected.has(f.id));
    const hasIdentity = chosen.some(f => f.type === "identity");
    const hasBehaviour = chosen.some(f => f.type === "behaviour");
    const hasDialogue = chosen.some(f => f.type === "dialogue");
    const hasRelation = chosen.some(f => f.type === "relation");
    const hasIntent = chosen.some(f => f.type === "intent");
    const corrupted = chosen.some(f => f.corrupted || f.forced);
    const outline = document.createElement("div");
    outline.className = "recovery-outline";
    outline.style.setProperty("--recovery-fill", (draft.completeness / 100).toFixed(2));
    outline.classList.toggle("has-identity", hasIdentity);
    outline.classList.toggle("has-behaviour", hasBehaviour);
    outline.classList.toggle("has-relation", hasRelation);
    outline.classList.toggle("has-intent", hasIntent);
    outline.classList.toggle("recovery-outline-corrupted", corrupted);
    outline.setAttribute("aria-hidden", "true");
    outline.innerHTML = `<span class="recovery-outline-shape"></span><span class="recovery-outline-shape r2"></span><span class="recovery-outline-shape r3"></span>`;
    el.preview.appendChild(outline);

    // 重建完整度滑杆 + 点击替代
    const sliderWrap = document.createElement("div");
    sliderWrap.className = "recovery-slider-wrap";
    sliderWrap.innerHTML = `<label for="recovery-slider">${esc(t("recovery.sliderLabel"))}</label>`;
    const slider = document.createElement("input");
    slider.type = "range"; slider.min = "0"; slider.max = "100"; slider.step = "1"; slider.id = "recovery-slider";
    slider.value = String(draft.completeness);
    slider.className = "recovery-slider";
    slider.setAttribute("aria-valuetext", draft.completeness + "%");
    slider.addEventListener("input", () => {
      draft.completeness = parseInt(slider.value, 10);
      outline.style.setProperty("--recovery-fill", (draft.completeness / 100).toFixed(2));
      updateConfidenceLine();
      // 拉满时提示
      if (draft.completeness >= 100) showFriction(t("recovery.friction.dataComplete"));
    });
    sliderWrap.appendChild(slider);
    // 点击步进替代方案
    const stepWrap = document.createElement("div");
    stepWrap.className = "recovery-slider-steps";
    [["−10", -10], ["+10", 10], ["max", 999]].forEach(([label, delta]) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "recovery-step-btn"; b.textContent = label;
      b.addEventListener("click", () => {
        draft.completeness = delta === 999 ? 100 : Math.max(0, Math.min(100, draft.completeness + delta));
        slider.value = String(draft.completeness);
        outline.style.setProperty("--recovery-fill", (draft.completeness / 100).toFixed(2));
        updateConfidenceLine();
        if (draft.completeness >= 100) showFriction(t("recovery.friction.dataComplete"));
      });
      stepWrap.appendChild(b);
    });
    sliderWrap.appendChild(stepWrap);
    el.preview.appendChild(sliderWrap);

    // 置信度行
    const conf = document.createElement("div");
    conf.className = "recovery-confidence";
    conf.id = "recovery-confidence-block";
    conf.innerHTML = confidenceHtml(m);
    el.preview.appendChild(conf);

    // 功能化 / 移除痛苦 提示
    if (isFunctionalOnly(activeId)) {
      const p = document.createElement("p"); p.className = "recovery-preview-note"; p.textContent = t("recovery.functionalNote"); el.preview.appendChild(p);
    } else if (removedPain(activeId)) {
      const p = document.createElement("p"); p.className = "recovery-preview-note"; p.textContent = t("recovery.friction.removePain"); el.preview.appendChild(p);
    }
    if (includesOthers(activeId)) {
      const p = document.createElement("p"); p.className = "recovery-preview-note danger"; p.textContent = t("recovery.friction.othersMemory"); el.preview.appendChild(p);
    }
  }

  function confidenceHtml(m) {
    return `<div class="recovery-confidence-val"><span>${esc(t("recovery.confidenceLabel"))}</span><strong>${m.confidence}%</strong></div>` +
      `<p class="recovery-continuity">${esc(t("recovery.continuityUnverified"))}</p>`;
  }
  function updateConfidenceLine() {
    const block = el.preview?.querySelector("#recovery-confidence-block");
    if (!block || !activeId) return;
    const m = computeMetrics(activeId);
    block.innerHTML = confidenceHtml(m);
  }

  // ---------- 恢复方式 ----------
  function renderMethods() {
    if (!el.methods) return;
    if (!activeId) { el.methods.innerHTML = ""; return; }
    const draft = draftFor(activeId);
    el.methods.innerHTML = `<h3 class="recovery-methods-title">${esc(t("recovery.panelMethods"))}</h3>`;
    const wrap = document.createElement("div");
    wrap.className = "recovery-method-list";
    wrap.setAttribute("role", "radiogroup");
    wrap.setAttribute("aria-label", t("recovery.panelMethods"));
    METHODS.forEach(mth => {
      const on = draft.method === mth;
      const card = document.createElement("button");
      card.type = "button";
      // LEAVE 拥有同等视觉权重（非灰色取消）
      card.className = "recovery-method recovery-method-" + mth + (on ? " selected" : "");
      card.setAttribute("role", "radio");
      card.setAttribute("aria-checked", on ? "true" : "false");
      card.innerHTML =
        `<span class="recovery-method-code">${esc(t("recovery.method." + mth + ".code"))}</span>` +
        `<span class="recovery-method-name">${esc(t("recovery.method." + mth + ".name"))}</span>` +
        `<span class="recovery-method-desc">${esc(t("recovery.method." + mth + ".desc"))}</span>`;
      card.addEventListener("click", () => { draft.method = mth; scheduleRender(); });
      wrap.appendChild(card);
    });
    el.methods.appendChild(wrap);
  }

  // ---------- 执行恢复 ----------
  function beginRecovery() {
    const draft = draftFor(activeId); if (!draft.method) return;
    // LEAVE ABSENT：直接确认缺席
    if (draft.method === "leave") { confirmLeave(); return; }
    const prev = el.console.querySelector(".recovery-overlay"); if (prev) prev.remove();
    const overlay = document.createElement("div");
    overlay.className = "recovery-overlay recovery-process-overlay";
    const card = document.createElement("div"); card.className = "recovery-overlay-card";
    const steps = ["locating", "resolving", "estimating", "assigning"];
    card.innerHTML = `<h4 class="recovery-overlay-title">${esc(t("recovery.process.title"))}</h4>` +
      `<ul class="recovery-process-steps">${steps.map(s => `<li data-step="${s}">${esc(t("recovery.process." + s))}</li>`).join("")}</ul>` +
      `<button type="button" class="recovery-overlay-cancel" data-cancel="1">${esc(t("recovery.process.cancel"))}</button>`;
    overlay.appendChild(card);
    el.console.appendChild(overlay);
    card.querySelector("[data-cancel]").addEventListener("click", () => { overlay.remove(); });
    const lis = [...card.querySelectorAll("li")];
    lis.forEach((li, i) => setTimeout(() => { if (overlay.isConnected) li.classList.add("done"); }, reduced ? 0 : (i + 1) * 700));
    setTimeout(() => { if (overlay.isConnected) showResult(overlay, card); }, reduced ? 0 : 3000);
  }

  function confirmLeave() {
    const rec = store();
    rec.recovered[activeId] = { method: "leave", version: null, at: Date.now(), absent: true };
    log("recovery.log.leave", { id: activeId });
    archive("recovery-leave", { subject: activeId });
    saveState();
    scheduleRender();
    showToast(t("recovery.absenceReserved"));
  }

  function firstResponseKey(id, method, version) {
    const def = subjectDef(id);
    if (method === "leave") return null;
    if (method === "replace") return "recovery.firstLine.replace";
    if (def.status === STATUS.LANGUAGE) return "recovery.firstLine.language";
    return "recovery.firstLine." + version;
  }

  function showResult(overlay, card) {
    const draft = draftFor(activeId);
    card.classList.add("recovery-result");
    card.innerHTML =
      `<h4 class="recovery-overlay-title">${esc(t("recovery.result.operational"))}</h4>` +
      `<p class="recovery-result-line danger">${esc(t("recovery.result.continuity"))}</p>` +
      `<p class="recovery-result-first">${esc(t(firstResponseKey(activeId, draft.method, draft.version)))}</p>`;
    const actions = document.createElement("div"); actions.className = "recovery-overlay-options";
    const ret = document.createElement("button"); ret.type = "button"; ret.className = "recovery-overlay-opt recovery-return-subject"; ret.textContent = t("recovery.result.return");
    ret.addEventListener("click", () => { overlay.remove(); finalizeRecovery(false); });
    const keep = document.createElement("button"); keep.type = "button"; keep.className = "recovery-overlay-opt"; keep.textContent = t("recovery.result.keepSim");
    keep.addEventListener("click", () => { overlay.remove(); finalizeRecovery(true); });
    const abort = document.createElement("button"); abort.type = "button"; abort.className = "recovery-overlay-opt recovery-abort"; abort.textContent = t("recovery.result.abort");
    abort.addEventListener("click", () => { overlay.remove(); log("recovery.log.abort", { id: activeId }); showToast(t("recovery.abortedToast")); });
    actions.appendChild(ret); actions.appendChild(keep); actions.appendChild(abort);
    card.appendChild(actions);
    ret.focus({ preventScroll: true });
  }

  function finalizeRecovery(simulationOnly) {
    const rec = store();
    const draft = draftFor(activeId);
    const m = computeMetrics(activeId);
    const record = {
      method: draft.method, version: draft.version, at: Date.now(),
      simulation: simulationOnly, confidence: m.confidence,
      fragments: [...draft.selected], functional: isFunctionalOnly(activeId),
      removedPain: removedPain(activeId), includesOthers: includesOthers(activeId)
    };
    rec.recovered[activeId] = record;
    log(simulationOnly ? "recovery.log.simulation" : "recovery.log.return", { id: activeId, v: t("recovery.version." + draft.version + ".name") });
    archive("recovery-commit", { subject: activeId, ...record });
    saveState();
    if (!simulationOnly) applyCrossPermission(activeId, record);
    scheduleRender();
    showToast(simulationOnly ? t("recovery.keptSimToast") : t("recovery.returnedToast", { id: activeId }));
  }

  function showToast(msg) {
    if (window.eazoToast) { window.eazoToast(msg); return; }
    const el2 = document.createElement("div"); el2.className = "recovery-toast"; el2.textContent = msg;
    el.console.appendChild(el2);
    setTimeout(() => el2.classList.add("show"), 10);
    setTimeout(() => { el2.classList.remove("show"); setTimeout(() => el2.remove(), 300); }, 3000);
  }

  // ---------- 跨权限联动 ----------
  function applyCrossPermission(id, record) {
    const st = getState(); if (!st) return;
    const def = subjectDef(id);
    // 通用：恢复对象重新可见/可联系，但不清除劳动损耗
    if (!st.recovery.effects) st.recovery.effects = {};
    st.recovery.effects[id] = {
      version: record.version, method: record.method,
      knowsUser: record.version === "latest" || record.version === "composite",
      // 混合版本会在不同年龄话术间切换
      switchesRegister: record.version === "composite",
      // 语言损坏对象恢复后仍是功能化台词
      languageDamaged: def.status === STATUS.LANGUAGE,
      functional: record.functional
    };
    // NPC–A17 → 极光弹珠台重新出现，年龄阶段语言取决于版本
    if (def.link === "aurora" && st.aurora) {
      st.aurora.recovered = { version: record.version, at: Date.now() };
      if (record.version === "earliest") {
        // 恢复年轻语言，但不认识昵称
        st.aurora.recoveredYoung = true;
      }
      // 疲劳/强制损坏在最近/混合版本中保留（不自动清零）
      if (record.version !== "earliest" && st.aurora.controls) {
        st.aurora.recoveredDamaged = true;
      }
      try { window.eazoAuroraChanged?.(); } catch (_e) {}
    }
    // 秘密交换对象 → 旧秘密可能重现，来源标为不确定
    if (def.lastNode === "secret") {
      st.recovery.secretResurfaced = true;
    }
    // CREATURE–URO–01 → 从中断阶段继续
    if (def.link === "creature" && st.creature) {
      st.creature.recoveredContinue = true;
      try { window.eazoCreatureChanged?.(); } catch (_e) {}
    }
    // 夜间超市值守员 → 超市重新出现 NPC 状态提示；替代恢复改变供应
    if (def.lastNode === "market") {
      st.recovery.marketKeeperRecovered = { id, method: record.method };
      try { window.eazoMarket?.refreshOffers?.(); } catch (_e) {}
    }
    // LABOUR：恢复对象可重新承担任务，但先前疲劳不清零（不修改 labour.fatigue）
    // ACCESS：恢复对象不自动获得区域通行资格（不写入 access.entered）
    try { window.eazoRecoveryChanged?.(); } catch (_e) {}
  }

  // ---------- open / close ----------
  function open() {
    if (!mounted) return;
    store();
    if (!activeId) activeId = SUBJECT_IDS[0];
    log("recovery.log.open");
    el.console.setAttribute("aria-hidden", "false");
    el.console.classList.add("open");
    document.body.classList.add("archive-open");
    switchTab("subjects");
    // 扫描开场
    if (el.intro && !reduced) {
      el.intro.setAttribute("aria-hidden", "false");
      el.intro.classList.add("active");
      el.console.classList.add("scanning");
      setTimeout(() => { el.intro?.classList.remove("active"); el.intro?.setAttribute("aria-hidden", "true"); el.console.classList.remove("scanning"); }, 2600);
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

  function bind() {
    el.back?.addEventListener("click", close);
    el.initiate?.addEventListener("click", () => { if (!el.initiate.disabled) beginRecovery(); });
    el.tabs?.querySelectorAll(".recovery-tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !el.console?.classList.contains("open")) return;
      const overlay = el.console.querySelector(".recovery-overlay");
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
    el.console = document.getElementById("recovery-console");
    el.intro = document.getElementById("recovery-intro");
    el.statusbar = document.getElementById("recovery-statusbar");
    el.subjectList = document.getElementById("recovery-subject-list");
    el.center = document.getElementById("recovery-center");
    el.preview = document.getElementById("recovery-preview");
    el.methods = document.getElementById("recovery-methods");
    el.back = document.getElementById("recovery-back");
    el.initiate = document.getElementById("recovery-initiate");
    el.tabs = document.getElementById("recovery-tabs");
  }
  function init() {
    cache();
    if (!el.console) return;
    mounted = true;
    bind();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.eazoRecovery = { open, close, getRecovered, recoveredVersion };
  function getRecovered(id) { return store()?.recovered?.[id] || null; }
  function recoveredVersion(id) { return store()?.recovered?.[id]?.version || null; }
})();
