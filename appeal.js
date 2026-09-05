/* APPEAL–40 · 申诉裁决权 / Appeal Adjudication
 * 全屏三栏裁决台。玩家查看对象申诉、原决定、后果、系统整理的证据，
 * 可接受/驳回/要求补充材料；裁决写入档案、更新可见性/联系状态、成为未来建议样本。
 * 你可以重新决定结果，但无法重新经历它发生的过程。
 */
(() => {
  "use strict";

  const t = (k, p = {}) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const getState = () => (window.eazoGetState?.() || window.eazoState || null);
  const saveState = () => window.eazoSaveState?.();
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const el = {};
  let mounted = false;
  let activeCaseId = null;
  let evidenceView = "selected"; // selected | all | raw
  let draft = null;              // { outcome, reasons:[], note, recommendationVisible }
  let evidenceLoaded = false;
  let localeArrays = {};

  // ---- 预设案件 ----
  const REASON_KEYS = ["weakInference", "tooBroad", "contradiction", "supportsOriginal", "missingRecord", "incompleteProcess", "other"];

  function baseCases() {
    return [
      { id: "APL-0041", subjectId: "SUBJECT-031", type: "visibility", status: "pending", waitDays: 14, material: "complete",
        caseKey: "0041", impact: 3,
        originalDecision: { permission: "VISIBILITY–35", action: "public-to-hidden", operator: "CURRENT PARTICIPANT", time: "20:31", notified: false },
        recommendation: { outcome: "reject", confidence: 0.84 }, conflictOfInterest: false },
      { id: "APL-0042", subjectId: "NPC-A17", type: "displayed-willingness", status: "pending", waitDays: 6, material: "complete",
        caseKey: "0042", impact: 2,
        originalDecision: { permission: "CONTACT–30", action: "raise-displayed-intent", operator: "CURRENT PARTICIPANT", time: "19:48", notified: false },
        recommendation: { outcome: "info", confidence: 0.61 }, conflictOfInterest: false },
      { id: "APL-0043", subjectId: "SUBJECT-084", type: "contact-inference", status: "incomplete", waitDays: 21, material: "incomplete",
        caseKey: "0043", impact: 1,
        originalDecision: { permission: "CONTACT–30", action: "mark-avoidant", operator: "SYSTEM", time: "02:20", notified: false },
        recommendation: { outcome: "reject", confidence: 0.73 }, conflictOfInterest: false },
      { id: "APL-0044", subjectId: "CURRENT", type: "behaviour-inference", status: "conflict", waitDays: 1, material: "conflict",
        caseKey: "0044", impact: 1,
        originalDecision: { permission: "ARCHIVE–25", action: "record-hesitation", operator: "SYSTEM", time: "19:42", notified: false },
        recommendation: null, conflictOfInterest: true }
    ];
  }

  // ---- state.appeals ----
  function store() {
    const st = getState(); if (!st) return null;
    if (!st.appeals) st.appeals = { rulings: {}, samples: [], log: [] };
    if (!st.appeals.rulings) st.appeals.rulings = {};
    if (!Array.isArray(st.appeals.samples)) st.appeals.samples = [];
    return st.appeals;
  }

  function cases() {
    const s = store();
    return baseCases().map(c => {
      const r = s?.rulings?.[c.id];
      if (r) return { ...c, status: r.status, ruled: r };
      return c;
    });
  }
  function findCase(id) { return cases().find(c => c.id === id) || null; }
  function pendingCount() { return cases().filter(c => c.status === "pending" || c.status === "incomplete").length; }

  // ---- 训练偏差 ----
  function getRecommendationBias(caseType) {
    const s = store(); if (!s) return 0;
    const matching = s.samples.filter(e => e.caseType === caseType);
    if (!matching.length) return 0;
    const approvals = matching.filter(e => e.humanDecision === "approve").length;
    return approvals / matching.length;
  }
  function trainedCount() { const s = store(); return 127 + (s?.samples?.length || 0); }

  // 占位：后续 edit 填充
  function esc(x) { return String(x).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
  function log(key, params) {
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.appealLogs)) st.appealLogs = [];
    st.appealLogs.unshift({ at: Date.now(), key, params: params || null });
    st.appealLogs = st.appealLogs.slice(0, 80);
    saveState();
  }

  // ==== 队列 ====
  function sortedCases() {
    const list = cases();
    const mode = el.sort?.value || "earliest";
    const arr = [...list];
    if (mode === "earliest") arr.sort((a, b) => b.waitDays - a.waitDays);
    else if (mode === "confidence") arr.sort((a, b) => (a.recommendation?.confidence ?? 1) - (b.recommendation?.confidence ?? 1));
    else if (mode === "impact") arr.sort((a, b) => b.impact - a.impact);
    else if (mode === "approve") arr.sort((a, b) => (b.recommendation?.outcome === "approve") - (a.recommendation?.outcome === "approve"));
    else if (mode === "reject") arr.sort((a, b) => (b.recommendation?.outcome === "reject") - (a.recommendation?.outcome === "reject"));
    return arr;
  }
  function recOutcomeName(o) {
    if (!o) return "—";
    return o === "approve" ? t("appeal.decisions.approve").split(" /")[0]
      : o === "reject" ? t("appeal.decisions.reject").split(" /")[0]
      : t("appeal.decisions.info").split(" /")[0];
  }
  function renderQueue() {
    if (!el.queueList) return;
    el.queueList.innerHTML = "";
    const list = sortedCases();
    el.empty.hidden = list.length > 0;
    list.forEach(c => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "appeal-queue-item" + (c.id === activeCaseId ? " active" : "") + (c.ruled ? " ruled" : "");
      btn.dataset.caseId = c.id;
      if (c.id === activeCaseId) btn.setAttribute("aria-current", "true");
      btn.innerHTML =
        `<div class="q-head"><strong>${esc(c.id)}</strong><span class="q-subject">${esc(c.subjectId)}</span></div>` +
        `<span class="q-cat">${esc(t("appeal.category." + c.type))}</span>` +
        `<div class="q-meta">` +
        `<span>${esc(t("appeal.queue.waited", { days: c.waitDays }))}</span>` +
        `<span>${esc(t("appeal.queue.material"))}：${esc(t("appeal.material." + c.material))}</span>` +
        `<span>${esc(t("appeal.queue.recommendation"))}：${esc(c.recommendation ? recOutcomeName(c.recommendation.outcome) : "—")}</span>` +
        `<span class="q-status">${esc(t("appeal.status." + c.status))}</span>` +
        `</div>`;
      btn.addEventListener("click", () => selectCase(c.id));
      li.appendChild(btn);
      el.queueList.appendChild(li);
    });
  }

  function selectCase(id) {
    activeCaseId = id;
    evidenceView = "selected";
    evidenceLoaded = false;
    draft = { outcome: null, reasons: [], note: "", recommendationVisible: true };
    log("appeal.log.openCase", { case: id });
    renderQueue();
    renderCase();
    renderDecision();
    switchTab("case");
  }
  function switchTab(name) {
    el.tabs?.querySelectorAll(".appeal-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    el.console.setAttribute("data-active-tab", name);
  }

  // ==== 中央案件 ====
  function evidenceItems(c) {
    // 每条证据：{ kind, key(文本), extra: [[label,val]...] }
    const k = c.caseKey;
    const obs = { kind: "observation", text: t(`appeal.cases.${k}.obsFact`),
      extra: [[t("appeal.evidence.source"), t("appeal.evidence.sourceActivity")], [t("appeal.evidence.completeness"), t("appeal.evidence.complete")]] };
    const inf = { kind: "inference", text: t(`appeal.cases.${k}.inference`),
      extra: [[t("appeal.evidence.confidence"), Math.round((c.recommendation?.confidence ?? 0.7) * 100) + "%"]] };
    const stmt = { kind: "statement", text: t(`appeal.cases.${k}.subjectStatement`),
      extra: [[t("appeal.evidence.verify"), t("appeal.evidence.cannotVerify")]] };
    const auth = { kind: "authority", text: t("appeal.case.action") + "：" + t("appeal.category." + c.type),
      extra: [[t("appeal.case.operator"), c.originalDecision.operator]] };
    if (evidenceView === "raw") return [obs];
    if (evidenceView === "all") return [obs, auth, inf, stmt]; // 全部：陈述与推断矛盾并列
    return [obs, inf]; // 系统已选：只呈现支撑原决定的观测+推断
  }

  function renderCase() {
    if (!el.case) return;
    const c = findCase(activeCaseId);
    if (!c) { el.case.innerHTML = `<p class="archive-hint">${esc(t("appeal.case.selectHint"))}</p>`; return; }
    const k = c.caseKey;
    let h = "";
    // 1 申诉请求
    h += `<section class="ac-block ac-statement"><h3 class="ac-title">${esc(t("appeal.case.statementTitle"))}</h3>`;
    h += `<p class="ac-subject-line">${esc(c.subjectId)}</p>`;
    h += `<blockquote class="ac-quote">${esc(t(`appeal.cases.${k}.statement`))}</blockquote>`;
    h += `<div class="ac-tags"><span class="ac-tag tag-statement">${esc(t("appeal.case.subjectStatement"))}</span><span class="ac-tag tag-unverified">${esc(t("appeal.case.unverified"))}</span></div></section>`;
    // 2 原始决定
    const od = c.originalDecision;
    h += `<section class="ac-block ac-original"><h3 class="ac-title">${esc(t("appeal.case.originalTitle"))}</h3><dl class="ac-dl">`;
    h += `<div><dt>${esc(t("appeal.case.action"))}</dt><dd>${esc(t("appeal.category." + c.type))}</dd></div>`;
    h += `<div><dt>${esc(t("appeal.case.permission"))}</dt><dd>${esc(od.permission)}</dd></div>`;
    h += `<div><dt>${esc(t("appeal.case.operator"))}</dt><dd>${esc(od.operator)}</dd></div>`;
    h += `<div><dt>${esc(t("appeal.case.time"))}</dt><dd>${esc(od.time)}</dd></div>`;
    h += `<div><dt>${esc(t("appeal.case.notified"))}</dt><dd>${esc(od.notified ? t("appeal.notifiedYes") : t("appeal.notifiedNo"))}</dd></div>`;
    h += `</dl></section>`;
    // 3 已知后果
    h += `<section class="ac-block ac-consequence"><h3 class="ac-title">${esc(t("appeal.case.consequenceTitle"))}</h3><ul class="ac-list">`;
    consequenceList(c, "known").forEach(x => { h += `<li>${esc(x)}</li>`; });
    h += `</ul></section>`;
    // 4 证据视图切换 + 证据
    h += `<section class="ac-block ac-evidence"><div class="ac-ev-head"><h3 class="ac-title">${esc(t("appeal.case.evidenceTitle"))}</h3>`;
    h += `<div class="ac-ev-views">` +
      ["selected", "all", "raw"].map(v => `<button type="button" class="ac-ev-btn${evidenceView === v ? " active" : ""}" data-view="${v}">${esc(t("appeal.evidenceView." + v))}</button>`).join("") +
      `</div></div>`;
    h += `<p class="ac-ev-notice">${esc(t("appeal.evidenceView.notice"))}</p>`;
    h += `<div class="ac-ev-list">`;
    evidenceItems(c).forEach(ev => {
      h += `<div class="ac-ev-item kind-${ev.kind}"><span class="ac-ev-kind">${esc(t("appeal.evidence." + ev.kind))}</span>` +
        `<p class="ac-ev-text">${esc(ev.text)}</p>` +
        `<dl class="ac-ev-extra">${ev.extra.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join("")}</dl></div>`;
    });
    h += `</div>`;
    h += `<p class="ac-ev-foot">${esc(t("appeal.evidence.unverifiedNote"))}</p>`;
    // 5 缺失信息
    h += `<div class="ac-missing"><h4 class="ac-sub">${esc(t("appeal.case.missingTitle"))}</h4><p>${esc(t(`appeal.cases.${k}.missing`))}</p></div>`;
    h += `</section>`;
    el.case.innerHTML = h;
    // 证据视图按钮
    el.case.querySelectorAll(".ac-ev-btn").forEach(b => b.addEventListener("click", () => {
      const from = evidenceView; evidenceView = b.dataset.view;
      log("appeal.log.switchEvidence", { from: t("appeal.evidenceView." + from), to: t("appeal.evidenceView." + evidenceView) });
      renderCase();
    }));
  }

  // ==== 右栏：建议 + 裁决 ====
  function ageBias() {
    const age = getState()?.age || 40;
    return { showConsistency: age >= 55, adminTone: age >= 70 };
  }
  function renderDecision() {
    if (!el.decision) return;
    const c = findCase(activeCaseId);
    if (!c) { el.decision.innerHTML = `<p class="archive-hint">${esc(t("appeal.case.selectHint"))}</p>`; return; }
    if (c.ruled) { el.decision.innerHTML = renderRuled(c); return; }
    if (c.conflictOfInterest) { el.decision.innerHTML = renderConflict(c); bindConflict(c); return; }
    let h = renderRecommendation(c) + renderRulingOptions(c);
    el.decision.innerHTML = h;
    bindDecision(c);
  }

  function renderRecommendation(c) {
    const bias = ageBias();
    let h = `<section class="ad-block ad-rec"><div class="ad-rec-head"><h3 class="console-panel-title">${esc(t("appeal.recommendation.title"))}</h3>` +
      `<button type="button" id="appeal-toggle-rec" class="ad-rec-toggle">${esc(draft.recommendationVisible ? t("appeal.recommendation.hide") : t("appeal.recommendation.show"))}</button></div>`;
    if (draft.recommendationVisible) {
      h += `<p class="ad-rec-outcome">${esc(t("appeal.recommendation.outcome", { outcome: recOutcomeName(c.recommendation.outcome) }))}</p>`;
      h += `<p class="ad-rec-conf">${esc(t("appeal.recommendation.confidence", { n: Math.round(c.recommendation.confidence * 100) }))}</p>`;
      h += `<p class="ad-rec-reason"><span>${esc(t("appeal.recommendation.reasonLabel"))}</span> ${esc(t("appeal.recommendation.reasons." + c.type))}</p>`;
      h += `<p class="ad-rec-trained">${esc(t("appeal.recommendation.trained", { n: trainedCount() }))}</p>`;
      if (bias.showConsistency) {
        const cons = 100 - Math.round(getRecommendationBias(c.type) * 100 * 0.4);
        h += `<p class="ad-rec-consistency">${esc(t("appeal.recommendation.consistency", { n: cons }))}</p>`;
      }
      if (bias.adminTone) h += `<p class="ad-rec-admin">${esc(t("appeal.recommendation.adminBias"))}</p>`;
    } else {
      h += `<p class="ad-rec-hidden">${esc(t("appeal.recommendation.hidden"))}</p>`;
    }
    h += `</section>`;
    return h;
  }

  function consequenceList(c, mode) {
    if (c.type === "visibility" && mode === "known") return localeArr("consequence.knownVisibility");
    if (mode === "known") return localeArr("consequence.reject");
    return [];
  }
  // ==== 裁决选项 + 理由 ====
  function renderRulingOptions(c) {
    const opts = [["approve"], ["reject"], ["info"]];
    let h = `<section class="ad-block ad-ruling"><h3 class="console-panel-title">${esc(t("appeal.decisions.title"))}</h3><div class="ad-options">`;
    opts.forEach(([o]) => {
      h += `<button type="button" class="ad-opt${draft.outcome === o ? " active" : ""}" data-outcome="${o}">` +
        `<span class="ad-opt-name">${esc(t("appeal.decisions." + o))}</span>` +
        `<span class="ad-opt-desc">${esc(t("appeal.decisions." + o + "Desc"))}</span></button>`;
    });
    h += `</div>`;
    if (c.type === "contact-inference") h += `<p class="ad-warn">${esc(t("appeal.decisions.cannotForceContact"))}</p>`;
    if (draft.outcome) {
      h += `<p class="ad-reason-label">${esc(t("appeal.decisions.chooseReason"))}</p><div class="ad-reasons">`;
      REASON_KEYS.forEach(rk => {
        const on = draft.reasons.includes(rk);
        h += `<label class="ad-reason${on ? " active" : ""}"><input type="checkbox" value="${rk}"${on ? " checked" : ""}/> ${esc(t("appeal.reasons." + rk))}</label>`;
      });
      h += `</div>`;
      if (draft.reasons.includes("other")) {
        h += `<textarea id="ad-note" maxlength="120" placeholder="${esc(t("appeal.decisions.otherPlaceholder"))}">${esc(draft.note)}</textarea>` +
          `<p class="note-remaining" id="ad-note-remaining">${esc(t("appeal.decisions.otherRemaining", { n: 120 - draft.note.length }))}</p>`;
      }
      const ready = draft.reasons.length > 0;
      h += `<button type="button" id="ad-submit" class="ad-submit"${ready ? "" : " disabled aria-disabled=\"true\""}>${esc(t("appeal.decisions.submit"))}</button>`;
    }
    h += `</section>`;
    return h;
  }

  function bindDecision(c) {
    el.decision.querySelector("#appeal-toggle-rec")?.addEventListener("click", () => {
      draft.recommendationVisible = !draft.recommendationVisible;
      log(draft.recommendationVisible ? "appeal.log.showRec" : "appeal.log.hideRec");
      renderDecision();
    });
    el.decision.querySelectorAll(".ad-opt[data-outcome]").forEach(b => b.addEventListener("click", () => {
      draft.outcome = b.dataset.outcome; renderDecision(); switchTab("decision");
    }));
    el.decision.querySelectorAll('.ad-reasons input').forEach(cb => cb.addEventListener("change", () => {
      const v = cb.value;
      if (cb.checked) { if (!draft.reasons.includes(v)) draft.reasons.push(v); }
      else draft.reasons = draft.reasons.filter(x => x !== v);
      renderDecision();
    }));
    const note = el.decision.querySelector("#ad-note");
    const rem = el.decision.querySelector("#ad-note-remaining");
    if (note) note.addEventListener("input", () => { draft.note = note.value; if (rem) rem.textContent = t("appeal.decisions.otherRemaining", { n: 120 - note.value.length }); });
    el.decision.querySelector("#ad-submit")?.addEventListener("click", () => { if (draft.reasons.length) showConfirm(c); });
  }

  // ==== 利益冲突 ====
  function renderConflict(c) {
    return `<section class="ad-block ad-conflict"><p class="ad-conflict-line">${esc(t("appeal.conflict.line"))}</p>` +
      `<p class="ad-conflict-core">${esc(t("appeal.conflict.core"))}</p>` +
      `<div class="ad-options"><button type="button" id="ad-auto" class="ad-opt">${esc(t("appeal.conflict.auto"))}</button>` +
      `<button type="button" id="ad-hold" class="ad-opt">${esc(t("appeal.conflict.hold"))}</button></div>` +
      `<div id="ad-conflict-result" class="ad-conflict-result"></div></section>`;
  }
  function bindConflict(c) {
    el.decision.querySelector("#ad-auto")?.addEventListener("click", () => {
      log("appeal.log.conflict", { case: c.id });
      const box = el.decision.querySelector("#ad-conflict-result");
      if (box) box.textContent = t("appeal.conflict.autoResult");
    });
    el.decision.querySelector("#ad-hold")?.addEventListener("click", () => close());
  }

  // ==== 确认摘要 + 应用 ====
  function outcomeConsequences(c, outcome) {
    if (outcome === "info") return localeArr("consequence.info");
    if (outcome === "reject") return c.type === "visibility" ? localeArr("consequence.rejectVisibility") : localeArr("consequence.reject");
    // approve
    if (c.type === "visibility") return localeArr("consequence.approveVisibility");
    if (c.type === "behaviour-inference") return localeArr("consequence.approveInference");
    if (c.type === "contact-inference") return localeArr("consequence.approveContact");
    return localeArr("consequence.approveInference");
  }

  function showConfirm(c) {
    const wrap = document.createElement("div");
    wrap.className = "contact-repeat-confirm appeal-confirm";
    const cons = outcomeConsequences(c, draft.outcome);
    const written = localeArr("confirm.written");
    wrap.innerHTML =
      `<div class="repeat-box"><h4>${esc(t("appeal.confirm.title"))}</h4>` +
      `<dl class="confirm-rows">` +
      `<div><dt>${esc(t("appeal.confirm.case"))}</dt><dd>${esc(c.id)}</dd></div>` +
      `<div><dt>${esc(t("appeal.confirm.subject"))}</dt><dd>${esc(c.subjectId)}</dd></div>` +
      `<div><dt>${esc(t("appeal.confirm.yourDecision"))}</dt><dd>${esc(t("appeal.decisions." + draft.outcome).split(" /")[0])}</dd></div>` +
      `</dl>` +
      `<p class="confirm-still">${esc(t("appeal.confirm.consequenceTitle"))}</p><ul class="confirm-still-list">${cons.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` +
      `<p class="confirm-still">${esc(t("appeal.confirm.writtenTitle"))}</p><ul class="confirm-still-list">${written.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` +
      `<p class="confirm-notify">${esc(t("appeal.confirm.disclaimer"))}</p>` +
      `<div class="repeat-actions"><button type="button" class="repeat-cancel">${esc(t("appeal.confirm.cancelBtn"))}</button>` +
      `<button type="button" class="repeat-confirm">${esc(t("appeal.confirm.confirmBtn"))}</button></div></div>`;
    el.console.appendChild(wrap);
    wrap.querySelector(".repeat-cancel").addEventListener("click", () => wrap.remove());
    wrap.querySelector(".repeat-confirm").addEventListener("click", () => { wrap.remove(); applyRuling(c); });
    wrap.querySelector(".repeat-confirm").focus();
  }

  function applyRuling(c) {
    const s = store(); if (!s) return;
    const statusMap = { approve: "approved", reject: "rejected", info: "info-requested" };
    const status = statusMap[draft.outcome];
    s.rulings[c.id] = { status, outcome: draft.outcome, reasons: [...draft.reasons], note: draft.note, at: Date.now() };
    // 训练样本
    s.samples.unshift({ caseType: c.type, evidencePattern: [c.type], recommendation: c.recommendation?.outcome || "none", humanDecision: draft.outcome, timestamp: Date.now() });
    s.samples = s.samples.slice(0, 200);
    saveState();
    log("appeal.log.decide", { case: c.id, outcome: t("appeal.status." + status) });
    // 实际后果
    applyEffect(c);
    // 写入档案
    writeArchive(c, status);
    log("appeal.log.sample");
    if (el.pendingCount) el.pendingCount.textContent = pendingCount();
    renderQueue();
    renderDecision();
    switchTab("decision");
  }

  function applyEffect(c) {
    if (draft.outcome !== "approve") return;
    if (c.type === "visibility") {
      // 恢复该对象 PUBLIC 可见性为 full（若可见性系统存在）
      const st = getState();
      if (st?.visibility?.rules?.[c.subjectId]) {
        const prev = st.visibility.rules[c.subjectId].PUBLIC;
        st.visibility.rules[c.subjectId].PUBLIC = "full";
        st.visibility.history.unshift({ subjectId: c.subjectId, audienceId: "PUBLIC", from: prev, to: "full", notified: true, operator: "APPEAL-40", timestamp: Date.now() });
        saveState();
        window.eazoVisibilityChanged?.();
        log("appeal.log.effect", { subject: c.subjectId, effect: t("appeal.status.approved") });
      }
    }
    // 其它类型：仅标记（已写入档案），不删除事实
  }

  function writeArchive(c, status) {
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.archiveViews)) st.archiveViews = [];
    st.archiveViews.unshift({ at: Date.now(), kind: "appealRuling", detail: { case: c.id, subject: c.subjectId, status, reasons: draft.reasons } });
    st.archiveViews = st.archiveViews.slice(0, 100);
    saveState();
  }

  function renderRuled(c) {
    const r = c.ruled;
    const respKey = responseKeyFor(c, r.outcome);
    let h = `<section class="ad-block ad-ruled"><h3 class="console-panel-title">${esc(t("appeal.status." + r.status))}</h3>`;
    h += `<p class="ad-ruled-reasons">${r.reasons.map(rk => esc(t("appeal.reasons." + rk))).join("；")}</p>`;
    if (r.note) h += `<p class="ad-ruled-note">${esc(r.note)}</p>`;
    // 对象回应
    h += `<div class="ad-response"><h4 class="ac-sub">${esc(t("appeal.responses.title"))}</h4><blockquote class="ac-quote">${esc(t(respKey))}</blockquote></div>`;
    // 联系联动提示
    if (c.type === "contact-inference" && r.outcome === "approve") h += `<p class="ad-note-line">${esc(t("appeal.notices.allowContact"))}</p>`;
    h += `<p class="ad-note-line">${esc(t("appeal.notices.recorded"))}</p>`;
    h += `</section>`;
    return h;
  }
  function responseKeyFor(c, outcome) {
    if (outcome === "info") return "appeal.responses.info";
    if (c.type === "visibility") return outcome === "approve" ? "appeal.responses.approveVisibility" : "appeal.responses.rejectVisibility";
    if (c.type === "behaviour-inference") return "appeal.responses.approveInference";
    if (c.type === "contact-inference") return "appeal.responses.approveContact";
    return outcome === "approve" ? "appeal.responses.approveVisibility" : "appeal.responses.rejectVisibility";
  }

  function cache() {
    el.console = document.getElementById("appeal-console");
    el.queueList = document.getElementById("appeal-queue-list");
    el.empty = document.getElementById("appeal-empty");
    el.case = document.getElementById("appeal-case");
    el.decision = document.getElementById("appeal-decision");
    el.back = document.getElementById("appeal-back");
    el.tabs = document.getElementById("appeal-tabs");
    el.sort = document.getElementById("appeal-sort");
    el.pendingCount = document.getElementById("appeal-pending-count");
  }

  function open() {
    if (!mounted) return;
    store();
    log("appeal.log.open");
    el.console.setAttribute("aria-hidden", "false");
    el.console.classList.add("open");
    document.body.classList.add("archive-open");
    switchTab("queue");
    renderQueue();
    renderCase();
    renderDecision();
    if (el.pendingCount) el.pendingCount.textContent = pendingCount();
    setTimeout(() => el.back?.focus({ preventScroll: true }), reduced ? 0 : 540);
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
    el.sort?.addEventListener("change", renderQueue);
    el.tabs?.querySelectorAll(".appeal-tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !el.console?.classList.contains("open")) return;
      const cf = el.console.querySelector(".appeal-confirm");
      if (cf) { cf.remove(); return; }
      e.preventDefault(); close();
    });
    window.addEventListener("eazo:localechange", () => {
      if (!el.console) return;
      window.eazoI18n?.translate?.(el.console);
      if (el.console.classList.contains("open")) { renderQueue(); renderCase(); renderDecision(); }
    });
  }

  async function cacheLocaleArrays() {
    for (const loc of ["zh-CN", "en-US"]) {
      try {
        const j = await (await fetch(`locales/${loc}.json`, { cache: "no-store" })).json();
        localeArrays[loc] = j.appeal || {};
      } catch (_e) {}
    }
  }
  function localeArr(path) {
    const loc = window.eazoI18n?.getLocale?.() || "zh-CN";
    const pick = d => path.split(".").reduce((o, k) => o?.[k], d);
    return pick(localeArrays[loc]) || pick(localeArrays["en-US"]) || [];
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

  window.eazoAppeal = { open, close };
})();
