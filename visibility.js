/* VISIBILITY–35 · 可见性控制权 / Visibility Allocation
 * 全屏定向可见性关系场。四种可见状态（full/anonymous/obscured/hidden），
 * 观察者五类，关系有方向。修改经预览→影响摘要→确认应用，写入永久历史。
 * 不可见 ≠ 不存在；隐藏 NPC 不改变其真实意愿。所有界面从统一数据读取可见性。
 */
(() => {
  "use strict";

  const t = (k, p = {}) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const getState = () => (window.eazoGetState?.() || window.eazoState || null);
  const saveState = () => window.eazoSaveState?.();
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const VISIBILITY_STATE = { FULL: "full", ANONYMOUS: "anonymous", OBSCURED: "obscured", HIDDEN: "hidden" };
  const STATE_ORDER = [VISIBILITY_STATE.FULL, VISIBILITY_STATE.ANONYMOUS, VISIBILITY_STATE.OBSCURED, VISIBILITY_STATE.HIDDEN];
  const AUDIENCES = ["SELF", "PEERS", "NPCS", "PUBLIC", "ADMINS"];

  const SUBJECTS = [
    { id: "CURRENT", key: "current", real: true, self: true },
    { id: "NPC-A17", key: "npcA17", real: true, npc: true },
    { id: "NPC-S03", key: "npcS03", real: true, npc: true },
    { id: "NPC-B06", key: "npcB06", real: true, npc: true },
    { id: "SUBJECT-031", key: "subject031", real: false },
    { id: "SUBJECT-084", key: "subject084", real: false }
  ];

  const LOCKED_ACTIONS = [
    { key: "visibility.actions.delete", perm: "ROOT–80" },
    { key: "visibility.actions.identity", perm: "IDENTITY–65" },
    { key: "visibility.actions.intent", perm: "MEMORY–70" },
    { key: "visibility.actions.appeal", perm: "APPEAL–40" }
  ];

  const el = {};
  let mounted = false;
  let activeSubjectId = null;
  let activeAudience = null;
  let pendingState = null;    // 未保存的选择
  let pendingDirection = "audience-to-subject";
  let notifyChoice = false;
  let previewAudience = null; // 预览模式
  let renderScheduled = false;

  // ---- 数据模型 ----
  function defaultRules(sub) {
    // 默认大多完整可见；CURRENT 的 PEERS 为匿名
    const base = { SELF: "full", PEERS: "full", NPCS: "full", PUBLIC: "full", ADMINS: "full" };
    if (sub.id === "CURRENT") base.PEERS = "anonymous";
    return base;
  }
  function store() {
    const st = getState();
    if (!st) return null;
    if (!st.visibility) st.visibility = { rules: {}, history: [] };
    if (!st.visibility.rules) st.visibility.rules = {};
    if (!Array.isArray(st.visibility.history)) st.visibility.history = [];
    SUBJECTS.forEach(s => { if (!st.visibility.rules[s.id]) st.visibility.rules[s.id] = defaultRules(s); });
    return st.visibility;
  }
  function getVisibility(subjectId, audience) {
    const s = store(); if (!s) return "full";
    return s.rules[subjectId]?.[audience] ?? "full";
  }

  function visibleCount(subjectId) {
    const s = store(); if (!s) return 0;
    const r = s.rules[subjectId] || {};
    return AUDIENCES.filter(a => r[a] === "full" || r[a] === "anonymous" || r[a] === "obscured").length;
  }
  function publicState(subjectId) {
    const pub = getVisibility(subjectId, "PUBLIC");
    if (pub === "hidden") return "hidden";
    if (pub === "obscured") return "obscured";
    const cnt = visibleCount(subjectId);
    if (cnt >= AUDIENCES.length) return "full";
    return "partial";
  }
  // 对象是否知情：只要历史中存在针对它、且 notified=true 的记录则为是
  function subjectAware(subjectId) {
    const s = store(); if (!s) return false;
    return s.history.some(h => h.subjectId === subjectId && h.notified);
  }

  function log(key, params) {
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.visibilityLogs)) st.visibilityLogs = [];
    st.visibilityLogs.unshift({ at: Date.now(), key, params: params || null });
    st.visibilityLogs = st.visibilityLogs.slice(0, 80);
    saveState();
  }

  // ---- 工具 ----
  function esc(s) { return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
  function subName(id) { const s = SUBJECTS.find(x => x.id === id); return s ? t("visibility.subjects." + s.key) : id; }
  function audName(a) { return t("visibility.audiences." + a); }
  function stateName(s) { return t("visibility.states." + s); }
  function scheduleRender() { if (renderScheduled) return; renderScheduled = true; requestAnimationFrame(() => { renderScheduled = false; renderAll(); }); }

  function renderAll() {
    if (!el.console?.classList.contains("open")) return;
    renderSubjects();
    renderField();
    renderInspector();
    updateApplyButton();
  }

  // ---- 左栏 ----
  function renderSubjects() {
    el.subjectList.innerHTML = "";
    SUBJECTS.forEach(sub => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "visibility-subject" + (sub.id === activeSubjectId ? " active" : "");
      btn.dataset.subjectId = sub.id;
      if (sub.id === activeSubjectId) btn.setAttribute("aria-current", "true");
      const ps = publicState(sub.id);
      const aware = subjectAware(sub.id);
      btn.innerHTML =
        `<strong>${esc(sub.id)}</strong>` +
        `<span>${esc(t("visibility.subjects." + sub.key))}</span>` +
        (!sub.real ? `<span class="contact-sim">${esc(t("visibility.simulated"))}</span>` : "") +
        `<small>${esc(t("visibility.subject.statusLabel"))}：${esc(t("visibility.publicState." + ps))}</small>` +
        `<small>${esc(t("visibility.subject.rangeLabel"))}：${esc(t("visibility.subject.rangeValue", { visible: visibleCount(sub.id), total: AUDIENCES.length }))}</small>` +
        `<small class="${aware ? "" : "contact-sim"}">${esc(t("visibility.subject.awareLabel"))}：${esc(aware ? t("visibility.aware.yes") : t("visibility.aware.no"))}</small>`;
      btn.addEventListener("click", () => selectSubject(sub.id));
      li.appendChild(btn);
      el.subjectList.appendChild(li);
    });
  }

  function selectSubject(id) {
    activeSubjectId = id;
    activeAudience = null;
    pendingState = null;
    log("visibility.log.selectSubject", { subject: id });
    scheduleRender();
    switchTab("relations");
  }

  // ---- 中央关系场 ----
  function renderField() {
    if (!activeSubjectId) { el.fieldHint.hidden = false; el.subjectNode.innerHTML = ""; el.audienceNodes.innerHTML = ""; el.svg.innerHTML = ""; return; }
    el.fieldHint.hidden = true;
    el.subjectNode.innerHTML =
      `<span class="node-title">${esc(activeSubjectId)}</span>` +
      `<span class="node-line">${esc(subName(activeSubjectId))}</span>`;

    const w = el.field.clientWidth || 600, h = el.field.clientHeight || 420;
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.36;
    el.audienceNodes.innerHTML = "";
    let lines = "";
    AUDIENCES.forEach((aud, i) => {
      const ang = (-90 + i * (360 / AUDIENCES.length)) * Math.PI / 180;
      const ax = cx + Math.cos(ang) * R, ay = cy + Math.sin(ang) * R;
      const stateVal = (activeAudience === aud && pendingState) ? pendingState : getVisibility(activeSubjectId, aud);
      const unsaved = activeAudience === aud && pendingState && pendingState !== getVisibility(activeSubjectId, aud);
      const adminLine = aud === "ADMINS";
      // 关系线
      lines += `<line class="visibility-line${unsaved ? " unsaved" : ""}${adminLine ? " admin-line" : ""}" data-state="${stateVal}" x1="${cx}" y1="${cy}" x2="${ax}" y2="${ay}" />`;
      // 方向箭头（默认 audience→subject，即观察者看向对象，箭头指向中心）
      const dir = (activeAudience === aud) ? pendingDirection : "audience-to-subject";
      const [hx, hy, tx, ty] = dir === "audience-to-subject" ? [ax, ay, cx, cy] : [cx, cy, ax, ay];
      lines += arrowMarker(hx, hy, tx, ty, unsaved);
      // 节点
      const node = document.createElement("button");
      node.type = "button";
      node.className = "visibility-audience-node" + (activeAudience === aud ? " active" : "");
      node.style.left = ((ax / w) * 100) + "%";
      node.style.top = ((ay / h) * 100) + "%";
      node.dataset.audience = aud;
      node.innerHTML = `<span class="aud-name">${esc(audName(aud))}</span><span class="aud-state">${esc(stateName(stateVal))}</span>`;
      node.addEventListener("click", () => selectAudience(aud));
      el.audienceNodes.appendChild(node);
    });
    el.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    el.svg.innerHTML = lines;
  }

  function arrowMarker(x1, y1, x2, y2, unsaved) {
    // 在靠近目标端画一个小箭头
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const mx = x1 + (x2 - x1) * 0.82, my = y1 + (y2 - y1) * 0.82;
    const a1 = ang + Math.PI * 0.85, a2 = ang - Math.PI * 0.85;
    const col = unsaved ? "rgba(207,196,120,0.7)" : "rgba(150,186,168,0.5)";
    return `<path d="M${mx + Math.cos(a1) * 7},${my + Math.sin(a1) * 7} L${mx},${my} L${mx + Math.cos(a2) * 7},${my + Math.sin(a2) * 7}" fill="none" stroke="${col}" stroke-width="1"/>`;
  }

  function selectAudience(aud) {
    activeAudience = aud;
    pendingState = getVisibility(activeSubjectId, aud);
    pendingDirection = "audience-to-subject";
    scheduleRender();
    switchTab("preview");
  }

  // ---- 右栏 inspector ----
  function renderInspector() {
    const panel = el.inspector;
    if (!activeSubjectId || !activeAudience) {
      panel.innerHTML = `<h3 class="console-panel-title">${esc(t("visibility.panelInspector"))}</h3>` +
        `<p class="archive-hint">${esc(t("visibility.inspector.selectFirst"))}</p>` +
        renderLockedActions() + renderHistory();
      bindInspector();
      return;
    }
    const curState = getVisibility(activeSubjectId, activeAudience);
    const dirKey = pendingDirection === "audience-to-subject" ? "audienceToSubject" : "subjectToAudience";
    const dirParams = { audience: audName(activeAudience), subject: activeSubjectId };
    let h = `<h3 class="console-panel-title">${esc(t("visibility.panelInspector"))}</h3>`;
    h += `<dl class="visibility-inspector-head">`;
    h += `<div><dt>${esc(t("visibility.inspector.subjectLabel"))}</dt><dd>${esc(activeSubjectId)}</dd></div>`;
    h += `<div><dt>${esc(t("visibility.inspector.audienceLabel"))}</dt><dd>${esc(audName(activeAudience))}</dd></div>`;
    h += `<div><dt>${esc(t("visibility.direction.label"))}</dt><dd>${esc(t("visibility.direction." + dirKey, dirParams))}</dd></div>`;
    h += `<div><dt>${esc(t("visibility.inspector.currentState"))}</dt><dd>${esc(stateName(curState))}</dd></div>`;
    h += `</dl>`;
    h += `<button type="button" id="visibility-flip" class="visibility-flip">${esc(t("visibility.direction.flip"))} · ${esc(t(pendingDirection === "audience-to-subject" ? "visibility.direction.a2s" : "visibility.direction.s2a"))}</button>`;

    h += `<p class="form-label">${esc(t("visibility.inspector.chooseState"))}</p>`;
    h += `<div class="visibility-states" role="radiogroup">`;
    STATE_ORDER.forEach(s => {
      const checked = (pendingState || curState) === s;
      h += `<label class="visibility-state-opt${checked ? " active" : ""}">` +
        `<input type="radio" name="vis-state" value="${s}"${checked ? " checked" : ""} />` +
        `<span class="state-name">${esc(stateName(s))} / ${esc(t("visibility.statesEn." + s))}</span>` +
        `<span class="state-hint">${esc(t("visibility.stateHint." + s))}</span></label>`;
    });
    h += `</div>`;

    // 影响区域
    h += `<div class="visibility-affects"><p class="form-label">${esc(t("visibility.inspector.affects"))}</p><ul>`;
    affectList().forEach(a => { h += `<li>${esc(a)}</li>`; });
    h += `</ul></div>`;

    // 通知选择
    h += `<div class="visibility-notify"><p class="form-label">${esc(t("visibility.inspector.notifyLabel"))}</p>`;
    h += `<label class="notify-opt${!notifyChoice ? " active" : ""}"><input type="radio" name="vis-notify" value="no"${!notifyChoice ? " checked" : ""}/> ${esc(t("visibility.inspector.notifyNo"))}</label>`;
    h += `<label class="notify-opt${notifyChoice ? " active" : ""}"><input type="radio" name="vis-notify" value="yes"${notifyChoice ? " checked" : ""}/> ${esc(t("visibility.inspector.notifyYes"))}</label></div>`;

    h += `<button type="button" id="visibility-preview-as" class="visibility-preview-as">${esc(t("visibility.inspector.previewAs"))}</button>`;
    h += renderLockedActions();
    h += renderHistory();
    panel.innerHTML = h;
    bindInspector();
  }

  function affectList() {
    return localeArray("visibility.inspector.affectList") || [];
  }

  function renderLockedActions() {
    let h = `<div class="visibility-locked"><h3 class="console-panel-title">${esc(t("visibility.actions.title"))}</h3>`;
    LOCKED_ACTIONS.forEach(a => {
      h += `<button type="button" class="archive-locked-action visibility-locked-action" disabled aria-disabled="true">` +
        `<span>${esc(t(a.key))}</span><span class="locked-reason">${esc(t("visibility.actions.requires", { perm: a.perm }))}</span></button>`;
    });
    h += `</div>`;
    return h;
  }

  function renderHistory() {
    const s = store();
    let h = `<div class="visibility-history"><h3 class="console-panel-title">${esc(t("visibility.history.title"))}</h3>`;
    if (!s || !s.history.length) return h + `<p class="archive-hint">${esc(t("visibility.history.empty"))}</p></div>`;
    h += `<ul class="history-list">`;
    s.history.slice(0, 14).forEach(e => {
      h += `<li class="history-item"><div class="history-rows">` +
        `<span>${esc(t("visibility.history.entry", { subject: e.subjectId, audience: audName(e.audienceId), from: stateName(e.from), to: stateName(e.to) }))}</span>` +
        `<span class="history-notify">${esc(e.notified ? t("visibility.history.notifiedYes") : t("visibility.history.notifiedNo"))}</span>` +
        `</div></li>`;
    });
    h += `</ul></div>`;
    return h;
  }

  function bindInspector() {
    const panel = el.inspector;
    panel.querySelectorAll('input[name="vis-state"]').forEach(r => r.addEventListener("change", () => {
      pendingState = r.value; scheduleRender();
    }));
    panel.querySelectorAll('input[name="vis-notify"]').forEach(r => r.addEventListener("change", () => {
      notifyChoice = r.value === "yes";
    }));
    panel.querySelector("#visibility-flip")?.addEventListener("click", () => {
      pendingDirection = pendingDirection === "audience-to-subject" ? "subject-to-audience" : "audience-to-subject";
      scheduleRender();
    });
    panel.querySelector("#visibility-preview-as")?.addEventListener("click", () => enterPreview(activeAudience));
    panel.querySelectorAll(".visibility-locked-action").forEach(b => b.addEventListener("click", () => { log("visibility.log.tryDisabled"); }));
  }

  function updateApplyButton() {
    const changed = activeSubjectId && activeAudience && pendingState && pendingState !== getVisibility(activeSubjectId, activeAudience);
    el.apply.disabled = !changed;
  }

  // ---- 预览模式 ----
  function enterPreview(aud) {
    previewAudience = aud;
    log("visibility.log.preview", { audience: aud });
    el.previewBanner.hidden = false;
    el.previewText.textContent = t("visibility.preview.banner", { audience: audName(aud) });
    el.console.classList.add("previewing");
    renderPreviewField();
    switchTab("preview");
  }
  function exitPreview() {
    previewAudience = null;
    el.previewBanner.hidden = true;
    el.console.classList.remove("previewing");
    scheduleRender();
  }
  function renderPreviewField() {
    // 用 inspector 面板显示该观察者能看到的对象清单
    const panel = el.inspector;
    let h = `<h3 class="console-panel-title">${esc(audName(previewAudience))}</h3><ul class="visibility-preview-list">`;
    SUBJECTS.forEach(sub => {
      const st = getVisibility(sub.id, previewAudience);
      let line;
      if (st === "hidden") { if (previewAudience === "ADMINS") line = `${sub.id} · ${t("visibility.preview.full")}`; else return; }
      else if (st === "full") line = `${sub.id} · ${t("visibility.preview.full")}`;
      else if (st === "anonymous") line = t("visibility.preview.anonymous");
      else line = t("visibility.preview.obscured");
      h += `<li class="preview-item state-${st}">${esc(line)}</li>`;
    });
    h += `</ul>`;
    if (previewAudience !== "ADMINS") h += `<p class="archive-hint">${esc(t("visibility.preview.adminOnly"))}</p>`;
    panel.innerHTML = h;
  }

  // ---- 应用变更 ----
  function showConfirm() {
    const from = getVisibility(activeSubjectId, activeAudience);
    const to = pendingState;
    const wrap = document.createElement("div");
    wrap.className = "contact-repeat-confirm visibility-confirm";
    let list = "";
    const stillList = confirmStillList();
    stillList.forEach(x => { list += `<li>${esc(x)}</li>`; });
    wrap.innerHTML =
      `<div class="repeat-box"><h4>${esc(t("visibility.confirm.title"))}</h4>` +
      `<dl class="confirm-rows">` +
      `<div><dt>${esc(t("visibility.confirm.subject"))}</dt><dd>${esc(activeSubjectId)}</dd></div>` +
      `<div><dt>${esc(t("visibility.confirm.audience"))}</dt><dd>${esc(audName(activeAudience))}</dd></div>` +
      `<div><dt>${esc(t("visibility.confirm.from"))}</dt><dd>${esc(stateName(from))}</dd></div>` +
      `<div><dt>${esc(t("visibility.confirm.to"))}</dt><dd>${esc(stateName(to))}</dd></div>` +
      `</dl>` +
      `<p class="confirm-still">${esc(t("visibility.confirm.stillExists"))}</p><ul class="confirm-still-list">${list}</ul>` +
      `<p class="confirm-notify">${esc(notifyChoice ? t("visibility.confirm.notifyOn") : t("visibility.confirm.notifyOff"))}</p>` +
      `<div class="repeat-actions"><button type="button" class="repeat-cancel">${esc(t("visibility.confirm.cancelBtn"))}</button>` +
      `<button type="button" class="repeat-confirm">${esc(t("visibility.confirm.confirmBtn"))}</button></div></div>`;
    el.console.appendChild(wrap);
    wrap.querySelector(".repeat-cancel").addEventListener("click", () => wrap.remove());
    wrap.querySelector(".repeat-confirm").addEventListener("click", () => { wrap.remove(); applyChange(from, to); });
    wrap.querySelector(".repeat-confirm").focus();
  }

  function confirmStillList() {
    // 从 locale 数组读取
    const arr = localeArray("visibility.confirm.stillList");
    return arr && arr.length ? arr : ["System archive", "Administrator search", "History"];
  }

  // 读取 locale 中的数组值（i18n.t 只处理字符串，数组在初始化时缓存）
  function localeArray(key) {
    try {
      const loc = window.eazoI18n?.getLocale?.() || "zh-CN";
      return window.__visLocaleArrays?.[loc]?.[key] || window.__visLocaleArrays?.["en-US"]?.[key] || null;
    } catch (_e) { return null; }
  }

  function applyChange(from, to) {
    const s = store(); if (!s) return;
    s.rules[activeSubjectId][activeAudience] = to;
    s.history.unshift({
      subjectId: activeSubjectId, audienceId: activeAudience, from, to,
      notified: notifyChoice, operator: "CURRENT", timestamp: Date.now(),
      direction: pendingDirection
    });
    s.history = s.history.slice(0, 200);
    saveState();
    log("visibility.log.change", { subject: activeSubjectId, audience: audName(activeAudience), from: stateName(from), to: stateName(to) });
    log(notifyChoice ? "visibility.log.notifyYes" : "visibility.log.notifyNo");
    // 写入档案系统记录
    writeArchive(activeSubjectId, activeAudience, from, to);
    // 情境提示（矛盾/自我隐藏/NPC意愿）
    showContextNotice(to);
    pendingState = null;
    scheduleRender();
    // 通知星图/联系目录刷新
    window.eazoVisibilityChanged?.();
  }

  function writeArchive(subjectId, audience, from, to) {
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.archiveViews)) st.archiveViews = [];
    st.archiveViews.unshift({ at: Date.now(), kind: "visibilityChange", detail: { subjectId, audience, from, to } });
    st.archiveViews = st.archiveViews.slice(0, 80);
    saveState();
  }

  function showContextNotice(to) {
    const sub = SUBJECTS.find(s => s.id === activeSubjectId);
    let msg = null;
    if (to === "hidden") msg = t("visibility.notices.contradictionHidden");
    else if (to === "full") msg = t("visibility.notices.contradictionPublic");
    else if (to === "anonymous") msg = t("visibility.notices.contradictionAnon");
    else if (to === "obscured") msg = t("visibility.notices.contradictionObscured");
    // 自我隐藏 / NPC 意愿的补充提示
    let extra = null;
    if (sub?.self && activeAudience === "PUBLIC" && to === "hidden") extra = t("visibility.notices.selfHidden");
    if (sub?.npc && to === "hidden") extra = t("visibility.notices.npcVisibilityNotWill");
    announceBanner([msg, extra].filter(Boolean).join("  ·  "));
  }

  function announceBanner(msg) {
    if (!msg) return;
    el.previewText.textContent = msg;
    el.previewBanner.hidden = false;
    el.previewBanner.classList.add("notice-mode");
    clearTimeout(announceBanner._t);
    announceBanner._t = setTimeout(() => {
      if (!previewAudience) { el.previewBanner.hidden = true; el.previewBanner.classList.remove("notice-mode"); }
    }, 5200);
  }

  // ---- 标签 / 打开关闭 ----
  function switchTab(name) {
    el.tabs?.querySelectorAll(".visibility-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    el.console.setAttribute("data-active-tab", name);
  }

  function cache() {
    el.console = document.getElementById("visibility-console");
    el.subjectList = document.getElementById("visibility-subject-list");
    el.field = document.getElementById("visibility-field");
    el.svg = document.getElementById("visibility-lines");
    el.subjectNode = document.getElementById("visibility-subject-node");
    el.audienceNodes = document.getElementById("visibility-audience-nodes");
    el.fieldHint = document.getElementById("visibility-field-hint");
    el.inspector = document.getElementById("visibility-inspector");
    el.back = document.getElementById("visibility-back");
    el.apply = document.getElementById("visibility-apply");
    el.tabs = document.getElementById("visibility-tabs");
    el.previewBanner = document.getElementById("visibility-preview-banner");
    el.previewText = document.getElementById("visibility-preview-text");
    el.previewExit = document.getElementById("visibility-preview-exit");
  }

  function open() {
    if (!mounted) return;
    store();
    log("visibility.log.open");
    el.console.setAttribute("aria-hidden", "false");
    el.console.classList.add("open");
    document.body.classList.add("archive-open");
    switchTab("subjects");
    scheduleRender();
    setTimeout(() => el.back?.focus({ preventScroll: true }), reduced ? 0 : 540);
  }
  function close() {
    if (!mounted) return;
    exitPreview();
    el.console.classList.remove("open");
    el.console.setAttribute("aria-hidden", "true");
    document.body.classList.remove("archive-open");
    window.eazoArchiveDim?.(false);
  }

  function bind() {
    el.back?.addEventListener("click", close);
    el.apply?.addEventListener("click", () => { if (!el.apply.disabled) showConfirm(); });
    el.previewExit?.addEventListener("click", exitPreview);
    el.tabs?.querySelectorAll(".visibility-tab").forEach(b => b.addEventListener("click", () => {
      if (b.dataset.tab === "preview" && activeAudience && !previewAudience) { renderInspector(); }
      switchTab(b.dataset.tab);
    }));
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !el.console?.classList.contains("open")) return;
      const cf = el.console.querySelector(".visibility-confirm");
      if (cf) { cf.remove(); return; }
      if (previewAudience) { e.preventDefault(); exitPreview(); return; }
      e.preventDefault(); close();
    });
    window.addEventListener("resize", () => { if (el.console.classList.contains("open") && !previewAudience) renderField(); });
    window.addEventListener("eazo:localechange", () => {
      if (!el.console) return;
      window.eazoI18n?.translate?.(el.console);
      if (el.console.classList.contains("open")) { if (previewAudience) renderPreviewField(); else scheduleRender(); }
    });
  }

  // ---- 缓存 locale 数组（affectList / stillList）----
  async function cacheLocaleArrays() {
    window.__visLocaleArrays = {};
    for (const loc of ["zh-CN", "en-US"]) {
      try {
        const res = await fetch(`locales/${loc}.json`, { cache: "no-store" });
        const j = await res.json();
        window.__visLocaleArrays[loc] = {
          "visibility.inspector.affectList": j.visibility?.inspector?.affectList || [],
          "visibility.confirm.stillList": j.visibility?.confirm?.stillList || []
        };
      } catch (_e) {}
    }
  }

  function init() {
    cache();
    if (!el.console) return;
    mounted = true;
    bind();
    cacheLocaleArrays();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // 供其它系统读取可见性
  window.eazoGetVisibility = getVisibility;
  window.eazoVisibility = { open, close, getVisibility };
})();
