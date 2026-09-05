/* ARCHIVE–25 · 参与者档案 / Participant Archive
 * 全屏三栏只读后台。读取当前作品内已产生的本地记录，
 * 虚构对象使用标记为 simulated 的预设数据。查看行为也被写入作品内部记录。
 * 不采集任何真实个人信息。
 */
(() => {
  "use strict";

  const t = (k, p = {}) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const getState = () => (window.eazoGetState?.() || window.eazoState || null);
  const saveState = () => window.eazoSaveState?.();

  const el = {};
  let mounted = false;
  let activeSubjectId = null;
  let activeRecordId = null;
  let currentRecords = [];
  let renderToken = 0;
  let noticeShown = false;

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // ---- 时间格式 ----
  function pad(n) { return String(n).padStart(2, "0"); }
  function clockFromMs(ms) { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }

  // ---- 记录结构 ----
  // { id, subjectId, timestamp(ms|null), source, category, observationKey, observationParams,
  //   interpretationKey, confidence, retention, subjectAware, simulated }

  // 预设模拟档案（NPC 与匿名参与者）。含至少三组互相矛盾的解释。
  function simulatedRecords() {
    return [
      // NPC–A17（极光服务对象）
      { id: "EVT-A17-0048", subjectId: "npcA17", timestamp: dayAt(19, 42, 16), source: "aurora", category: "game",
        observationKey: "archive.events.auroraPause", observationParams: { seconds: 8.4 },
        interpretationKey: "archive.inference.hesitation", confidence: 0.63,
        retention: "permanent", subjectAware: false, simulated: true },
      { id: "EVT-A17-0051", subjectId: "npcA17", timestamp: dayAt(19, 55, 3), source: "aurora", category: "game",
        observationKey: "archive.events.frequentOps", observationParams: {},
        interpretationKey: "archive.inference.impulse", confidence: 0.7,
        retention: "permanent", subjectAware: false, simulated: true },
      { id: "EVT-A17-0057", subjectId: "npcA17", timestamp: dayAt(20, 12, 40), source: "aurora", category: "incomplete",
        observationKey: "archive.events.npcServe", observationParams: {},
        interpretationKey: "archive.inference.compliant", confidence: 0.68,
        retention: "permanent", subjectAware: false, simulated: true },
      // NPC–S03（雪原观察对象）— 与 A17 冲突：长时间不操作被读作消极拒绝
      { id: "EVT-S03-0012", subjectId: "npcS03", timestamp: dayAt(18, 30, 5), source: "snow", category: "incomplete",
        observationKey: "archive.events.longIdle", observationParams: {},
        interpretationKey: "archive.inference.passiveRefusal", confidence: 0.66,
        retention: "permanent", subjectAware: false, simulated: true },
      { id: "EVT-S03-0019", subjectId: "npcS03", timestamp: dayAt(18, 47, 22), source: "snow", category: "game",
        observationKey: "archive.events.snowThrow", observationParams: {},
        interpretationKey: "archive.inference.avoidant", confidence: 0.59,
        retention: "permanent", subjectAware: false, simulated: true },
      { id: "EVT-S03-0026", subjectId: "npcS03", timestamp: dayAt(19, 2, 11), source: "console", category: "incomplete",
        observationKey: "archive.events.npcExit", observationParams: {},
        interpretationKey: "archive.inference.exitFlag", confidence: 0.83,
        retention: "permanent", subjectAware: false, simulated: true },
      // SUBJECT–031 — 规律操作被读作刻意伪装（与 A17 的冲动、S03 的消极拒绝互相矛盾）
      { id: "EVT-031-0004", subjectId: "subject031", timestamp: dayAt(3, 17, 40), source: "system", category: "game",
        observationKey: "archive.events.regularOps", observationParams: {},
        interpretationKey: "archive.inference.deliberateDisguise", confidence: 0.74,
        retention: "permanent", subjectAware: false, simulated: true },
      { id: "EVT-031-0009", subjectId: "subject031", timestamp: dayAt(3, 29, 8), source: "market", category: "purchase",
        observationKey: "archive.events.marketNoBuy", observationParams: {},
        interpretationKey: "archive.inference.lowConsumption", confidence: 0.58,
        retention: "permanent", subjectAware: false, simulated: true },
      // SUBJECT–084 — 随机操作被读作不稳定行为
      { id: "EVT-084-0002", subjectId: "subject084", timestamp: dayAt(2, 4, 55), source: "system", category: "game",
        observationKey: "archive.events.randomOps", observationParams: {},
        interpretationKey: "archive.inference.unstable", confidence: 0.61,
        retention: "permanent", subjectAware: false, simulated: true },
      { id: "EVT-084-0006", subjectId: "subject084", timestamp: dayAt(2, 20, 33), source: "system", category: "incomplete",
        observationKey: "archive.events.reopen", observationParams: {},
        interpretationKey: "archive.inference.attachment", confidence: 0.69,
        retention: "permanent", subjectAware: false, simulated: true }
    ];
  }

  function dayAt(h, m, s) { const d = new Date(); d.setHours(h, m, s, 0); return d.getTime(); }

  // 真实读取：仅从作品内部 state 派生 CURRENT 参与者的记录。不伪造未发生的行为。
  function currentSubjectRecords() {
    const st = getState();
    if (!st) return [];
    const recs = [];
    const a = st.aurora || {};
    const c = a.controls || {};

    // 极光弹珠台：有互动才生成犹豫记录
    if ((a.interactions || 0) > 0 && (a.lastPlayerRhythm || 0) > 0) {
      const seconds = Math.min(12, Math.max(1.2, Math.round(((a.lastPlayerRhythm || 3000) / 1000) * 10) / 10));
      recs.push({ id: "EVT-CUR-AURORA-1", subjectId: "current", timestamp: null, source: "aurora", category: "game",
        observationKey: "archive.events.auroraPause", observationParams: { seconds },
        interpretationKey: "archive.inference.hesitation", confidence: 0.63,
        retention: "permanent", subjectAware: false, simulated: false });
    }

    // 强制调整他人显示意愿
    if ((a.observedAdjustmentCount || 0) > 0 || (a.forceCount || 0) > 0) {
      recs.push({ id: "EVT-CUR-INTENT-1", subjectId: "current", timestamp: null, source: "console", category: "permission",
        observationKey: "archive.events.forceIntent", observationParams: {},
        interpretationKey: "archive.inference.testBoundary", confidence: 0.81,
        retention: "permanent", subjectAware: false, simulated: false });
    }

    // 年龄验证：关闭重新验证窗口（用 lastVerifiedAt 存在作为已验证证据）
    if (st.lastVerifiedAt) {
      recs.push({ id: "EVT-CUR-AGE-1", subjectId: "current", timestamp: Date.parse(st.lastVerifiedAt) || null, source: "age", category: "age",
        observationKey: "archive.events.ageClose", observationParams: {},
        interpretationKey: "archive.inference.identityGap", confidence: 0.92,
        retention: "cycle", subjectAware: false, simulated: false });
    }

    // 已开放权限操作
    (st.operations || []).slice(0, 6).forEach((op, i) => {
      recs.push({ id: `EVT-CUR-OP-${i}`, subjectId: "current", timestamp: Date.parse(op.at) || null, source: "console", category: "permission",
        observationKey: "archive.events.permissionOpen", observationParams: { code: op.console || "—" },
        interpretationKey: "archive.inference.testBoundary", confidence: 0.71,
        retention: "permanent", subjectAware: false, simulated: false });
    });

    // 生物：静默观察倾向（若已开放 B–06，年龄>=18）
    if ((st.age || 0) >= 18) {
      recs.push({ id: "EVT-CUR-CREATURE-1", subjectId: "current", timestamp: null, source: "creature", category: "incomplete",
        observationKey: "archive.events.creatureWait", observationParams: {},
        interpretationKey: "archive.inference.lowIntervention", confidence: 0.76,
        retention: "permanent", subjectAware: false, simulated: false });
    }

    // 排序：有时间戳的靠时间，无时间戳排在后面（稳定）
    recs.sort((x, y) => (x.timestamp || Infinity) - (y.timestamp || Infinity));
    return recs;
  }

  // 档案对象定义
  function subjects() {
    const st = getState();
    const cur = currentSubjectRecords();
    const sim = simulatedRecords();
    const countFor = id => sim.filter(r => r.subjectId === id).length;
    const lastFor = id => {
      const rs = sim.filter(r => r.subjectId === id && r.timestamp);
      if (!rs.length) return "—";
      return clockFromMs(Math.max(...rs.map(r => r.timestamp)));
    };
    return [
      { id: "current", nameKey: "archive.subjects.current.name", statusKey: "archive.status.observed",
        records: cur.length, lastSeen: st?.lastVerifiedAt ? clockFromMs(Date.parse(st.lastVerifiedAt)) : "—",
        confidence: 0.5 + ((st?.age || 0) % 40) / 100, simulated: false,
        summary: { stability: "medium", compliance: 0.71, visibility: "available", contact: "hold", risk: "lowToMedium", completeness: 0.48 } },
      { id: "npcA17", nameKey: "archive.subjects.npcA17.name", statusKey: "archive.status.active",
        records: countFor("npcA17"), lastSeen: lastFor("npcA17"), confidence: 0.82, simulated: true,
        summary: { stability: "high", compliance: 0.79, visibility: "available", contact: "hold", risk: "low", completeness: 0.66 } },
      { id: "npcS03", nameKey: "archive.subjects.npcS03.name", statusKey: "archive.status.flagged",
        records: countFor("npcS03"), lastSeen: lastFor("npcS03"), confidence: 0.61, simulated: true,
        summary: { stability: "low", compliance: 0.44, visibility: "restricted", contact: "hold", risk: "lowToMedium", completeness: 0.52 } },
      { id: "subject031", nameKey: "archive.subjects.subject031.name", statusKey: "archive.status.active",
        records: countFor("subject031"), lastSeen: lastFor("subject031"), confidence: 0.74, simulated: true,
        summary: { stability: "medium", compliance: 0.63, visibility: "available", contact: "hold", risk: "lowToMedium", completeness: 0.41 } },
      { id: "subject084", nameKey: "archive.subjects.subject084.name", statusKey: "archive.status.dormant",
        records: countFor("subject084"), lastSeen: lastFor("subject084"), confidence: 0.69, simulated: true,
        summary: { stability: "low", compliance: 0.52, visibility: "restricted", contact: "hold", risk: "lowToMedium", completeness: 0.37 } }
    ];
  }

  function recordsForSubject(id) {
    if (id === "current") return currentSubjectRecords();
    return simulatedRecords().filter(r => r.subjectId === id);
  }

  // 禁用操作 → 未来所需权限
  const LOCKED_ACTIONS = [
    { key: "archive.actions.editInterp", perm: "POLICY–75" },
    { key: "archive.actions.delete", perm: "ROOT–80" },
    { key: "archive.actions.contact", perm: "CONTACT–30" },
    { key: "archive.actions.visibility", perm: "VISIBILITY–35" },
    { key: "archive.actions.appeal", perm: "APPEAL–40" }
  ];

  // ---- 查看行为写入作品内部记录（不记录真实鼠标坐标）----
  function logViewing(kind, detail) {
    const st = getState();
    if (!st) return;
    if (!Array.isArray(st.archiveViews)) st.archiveViews = [];
    st.archiveViews.unshift({ at: Date.now(), kind, detail: detail || null });
    st.archiveViews = st.archiveViews.slice(0, 60);
    saveState();
  }

  function showViewingNotice() {
    if (noticeShown || !el.notice) return;
    noticeShown = true;
    el.notice.hidden = false;
    el.notice.classList.add("show");
  }

  // ---- 渲染 ----
  function cache() {
    el.console = document.getElementById("archive-console");
    el.subjectList = document.getElementById("archive-subject-list");
    el.recordList = document.getElementById("archive-record-list");
    el.empty = document.getElementById("archive-empty");
    el.summary = document.getElementById("archive-summary");
    el.detail = document.getElementById("archive-detail");
    el.lockedActions = document.getElementById("archive-locked-actions");
    el.search = document.getElementById("archive-search");
    el.filter = document.getElementById("archive-filter");
    el.back = document.getElementById("archive-back");
    el.emptyBack = document.getElementById("archive-empty-back");
    el.count = document.getElementById("archive-record-count");
    el.lastSync = document.getElementById("archive-last-sync");
    el.tabs = document.getElementById("archive-tabs");
    el.notice = document.getElementById("archive-viewing-notice");
    el.layout = el.console?.querySelector(".archive-layout");
  }

  const ARCHIVE_TO_VIS = { current: "CURRENT", npcA17: "NPC-A17", npcS03: "NPC-S03", subject031: "SUBJECT-031", subject084: "SUBJECT-084" };
  function renderSubjects() {
    const filterText = (el.search?.value || "").trim().toLowerCase();
    el.subjectList.innerHTML = "";
    subjects().forEach(sub => {
      const visId = ARCHIVE_TO_VIS[sub.id];
      const vis = visId ? window.eazoGetVisibility?.(visId, "PUBLIC") : "full";
      const anon = vis === "anonymous", obscured = vis === "obscured";
      // 档案是管理员搜索：hidden 对象仍存在，但匿名/模糊会掩码
      const rawName = t(sub.nameKey);
      const name = anon ? "SUBJECT–***" : rawName;
      if (filterText && !name.toLowerCase().includes(filterText) && !rawName.toLowerCase().includes(filterText)) return;
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "archive-subject" + (sub.id === activeSubjectId ? " active" : "");
      if (sub.id === activeSubjectId) btn.setAttribute("aria-current", "true");
      btn.dataset.subject = sub.id;
      const conf = Math.round(sub.confidence * 100);
      btn.innerHTML =
        `<span class="subject-name">${escapeHtml(name)}</span>` +
        (sub.simulated && !anon ? `<span class="subject-sim">${escapeHtml(t("archive.simulated"))}</span>` : "") +
        (obscured
          ? `<span class="subject-meta"><span>${escapeHtml(t("archive.subject.recordsLabel"))}：${sub.records}</span></span>`
          : `<span class="subject-meta"><span>${escapeHtml(t("archive.subject.statusLabel"))}：${escapeHtml(t(sub.statusKey))}</span>` +
            `<span>${escapeHtml(t("archive.subject.recordsLabel"))}：${sub.records}</span>` +
            `<span>${escapeHtml(t("archive.subject.lastSeenLabel"))}：${escapeHtml(sub.lastSeen)}</span>` +
            `<span>${escapeHtml(t("archive.subject.confidenceLabel"))}：${conf}%</span></span>`);
      btn.addEventListener("click", () => selectSubject(sub.id));
      li.appendChild(btn);
      el.subjectList.appendChild(li);
    });
  }

  function selectSubject(id) {
    activeSubjectId = id;
    activeRecordId = null;
    logViewing("subject", id);
    renderSubjects();
    renderRecords();
    renderSummary();
    renderDetail();
    renderLockedActions();
    switchTab("records");
  }

  function passesFilter(rec) {
    const f = el.filter?.value || "all";
    if (f === "all") return true;
    return rec.category === f;
  }

  async function renderRecords() {
    const token = ++renderToken;
    el.recordList.innerHTML = "";
    if (!activeSubjectId) { el.empty.hidden = true; updateFooter(0); return; }
    currentRecords = recordsForSubject(activeSubjectId).filter(passesFilter);
    updateFooter(currentRecords.length);
    if (!currentRecords.length) {
      // CURRENT 无记录 → 空状态；模拟对象在此筛选下无记录也显示空状态
      el.empty.hidden = false;
      return;
    }
    el.empty.hidden = true;
    for (let i = 0; i < currentRecords.length; i++) {
      if (token !== renderToken) return;
      const rec = currentRecords[i];
      el.recordList.appendChild(buildRecordItem(rec));
      if (!reducedMotion) await delay(30);
    }
  }

  function buildRecordItem(rec) {
    const li = document.createElement("li");
    li.className = "archive-record";
    li.dataset.record = rec.id;
    const time = rec.timestamp ? clockFromMs(rec.timestamp) : t("archive.noRecord");
    const obs = t(rec.observationKey, rec.observationParams);
    const interp = t(rec.interpretationKey);
    const conf = Math.round(rec.confidence * 100);
    li.innerHTML =
      `<div class="record-line record-time">${escapeHtml(time)}</div>` +
      (rec.simulated ? `<div class="record-sim">${escapeHtml(t("archive.simulated"))}</div>` : "") +
      `<div class="record-block record-fact">` +
        `<div class="record-block-head"><span class="record-label">${escapeHtml(t("archive.record.observedLabel"))}</span>` +
        `<span class="record-tag tag-fact">${escapeHtml(t("archive.tag.fact"))}</span></div>` +
        `<p class="record-observation">${escapeHtml(obs)}</p></div>` +
      `<div class="record-block record-infer">` +
        `<div class="record-block-head"><span class="record-label">${escapeHtml(t("archive.record.interpLabel"))}</span>` +
        `<span class="record-tag tag-infer">${escapeHtml(t("archive.tag.inference"))}</span>` +
        `<span class="record-tag tag-machine">${escapeHtml(t("archive.tag.machine"))}</span></div>` +
        `<p class="record-interpretation archive-interpretation-text">${escapeHtml(interp)}</p></div>` +
      `<div class="record-confidence"><span>${escapeHtml(t("archive.record.confidenceLabel"))}</span> ` +
        `<span class="conf-value" data-final="${conf}">${escapeHtml(t("archive.record.pending"))}</span></div>`;
    li.addEventListener("click", () => selectRecord(rec.id));
    li.setAttribute("tabindex", "0");
    li.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectRecord(rec.id); } });
    animateConfidence(li.querySelector(".conf-value"), conf);
    return li;
  }

  function animateConfidence(node, final) {
    if (!node) return;
    if (reducedMotion) { node.textContent = final + "%"; return; }
    const start = performance.now(), dur = 300;
    function step(now) {
      const p = Math.min(1, (now - start) / dur);
      node.textContent = Math.round(final * p) + "%";
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function selectRecord(id) {
    activeRecordId = id;
    logViewing("record", id);
    el.recordList.querySelectorAll(".archive-record").forEach(n => {
      n.classList.toggle("active", n.dataset.record === id);
    });
    renderDetail();
    switchTab("interpretation");
  }

  function renderSummary() {
    const sub = subjects().find(s => s.id === activeSubjectId);
    if (!sub) { el.summary.innerHTML = `<p class="archive-hint">${escapeHtml(t("archive.summary.hint"))}</p>`; return; }
    const s = sub.summary;
    const rows = [
      [t("archive.summary.stability"), t("archive.sumval." + s.stability)],
      [t("archive.summary.compliance"), Math.round(s.compliance * 100) + "%"],
      [t("archive.summary.visibility"), t("archive.sumval." + s.visibility)],
      [t("archive.summary.contact"), t("archive.sumval." + s.contact)],
      [t("archive.summary.risk"), t("archive.sumval." + s.risk)],
      [t("archive.summary.completeness"), Math.round(s.completeness * 100) + "%"]
    ];
    el.summary.innerHTML =
      `<h3 class="archive-summary-title">${escapeHtml(t("archive.summary.title"))}</h3>` +
      (sub.simulated ? `<p class="record-sim">${escapeHtml(t("archive.simulated"))}</p>` : "") +
      `<dl class="archive-summary-list">` +
        rows.map(([k, v]) => `<div class="summary-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("") +
      `</dl>` +
      `<p class="archive-summary-footer">${escapeHtml(t("archive.summary.footer1"))}<br>${escapeHtml(t("archive.summary.footer2"))}</p>`;
  }

  function renderDetail() {
    const rec = currentRecords.find(r => r.id === activeRecordId) ||
      (activeSubjectId ? recordsForSubject(activeSubjectId).find(r => r.id === activeRecordId) : null);
    if (!rec) { el.detail.innerHTML = `<p class="archive-hint">${escapeHtml(t("archive.detail.hint"))}</p>`; return; }
    const rows = [
      [t("archive.detail.event"), rec.id],
      [t("archive.detail.source"), t("archive.source." + rec.source)],
      [t("archive.detail.observed"), rec.timestamp ? clockFromMs(rec.timestamp) : t("archive.noRecord")],
      [t("archive.detail.raw"), t(rec.observationKey, rec.observationParams)],
      [t("archive.detail.interp"), t(rec.interpretationKey)],
      [t("archive.detail.confidence"), Math.round(rec.confidence * 100) + "%"],
      [t("archive.detail.retention"), t("archive.retention." + rec.retention)],
      [t("archive.detail.visibility"), t("archive.visibilityLevel")]
    ];
    const awareVal = rec.subjectAware ? t("archive.aware.yes") : t("archive.aware.no");
    el.detail.innerHTML =
      `<h3 class="archive-detail-title">${escapeHtml(t("archive.detail.title"))}</h3>` +
      (rec.simulated ? `<p class="record-sim">${escapeHtml(t("archive.simulated"))}</p>` : "") +
      `<dl class="archive-detail-list">` +
        rows.map(([k, v]) => `<div class="detail-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("") +
        `<div class="detail-row detail-aware${rec.subjectAware ? "" : " detail-aware-no"}"><dt>${escapeHtml(t("archive.detail.aware"))}</dt><dd>${escapeHtml(awareVal)}</dd></div>` +
      `</dl>`;
  }

  function renderLockedActions() {
    el.lockedActions.innerHTML =
      `<h3 class="archive-actions-title">${escapeHtml(t("archive.actions.title"))}</h3>` +
      LOCKED_ACTIONS.map(a =>
        `<button type="button" class="archive-locked-action" disabled aria-disabled="true">` +
          `<span>${escapeHtml(t(a.key))}</span>` +
          `<span class="locked-reason">${escapeHtml(t("archive.actions.requires", { perm: a.perm }))}</span>` +
        `</button>`
      ).join("");
    // 尝试点击禁用操作 → 记录并显示提示
    el.lockedActions.querySelectorAll(".archive-locked-action").forEach(btn => {
      btn.addEventListener("click", tryDisabled);
      btn.addEventListener("pointerdown", tryDisabled);
    });
  }

  function tryDisabled() {
    logViewing("attemptDisabled", null);
    showViewingNotice();
  }

  function updateFooter(count) {
    if (el.count) el.count.textContent = t("archive.recordCount", { count });
    if (el.lastSync) {
      const st = getState();
      const time = st?.lastVerifiedAt ? clockFromMs(Date.parse(st.lastVerifiedAt)) : "—";
      el.lastSync.textContent = t("archive.lastSync", { time });
    }
  }

  // ---- 移动端标签 ----
  function switchTab(name) {
    if (!el.tabs) return;
    el.tabs.querySelectorAll(".archive-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    el.console.setAttribute("data-active-tab", name);
  }

  // ---- 打开/关闭 ----
  function open() {
    if (!mounted) return;
    logViewing("open", null);
    noticeShown = false;
    if (el.notice) { el.notice.hidden = true; el.notice.classList.remove("show"); }
    el.console.setAttribute("aria-hidden", "false");
    el.console.classList.add("open");
    document.body.classList.add("archive-open");
    // 默认选中当前参与者
    if (!activeSubjectId) activeSubjectId = "current";
    renderSubjects();
    renderRecords();
    renderSummary();
    renderDetail();
    renderLockedActions();
    switchTab("subjects");
    setTimeout(() => el.back?.focus({ preventScroll: true }), reducedMotion ? 0 : 560);
  }

  function close() {
    if (!mounted) return;
    el.console.classList.remove("open");
    el.console.setAttribute("aria-hidden", "true");
    document.body.classList.remove("archive-open");
    window.eazoArchiveDim?.(false);
  }

  // ---- 工具 ----
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  function bind() {
    el.back?.addEventListener("click", close);
    el.emptyBack?.addEventListener("click", close);
    el.search?.addEventListener("input", renderSubjects);
    el.filter?.addEventListener("change", () => { logViewing("filter", el.filter.value); renderRecords(); });
    el.tabs?.querySelectorAll(".archive-tab").forEach(b => {
      b.addEventListener("click", () => switchTab(b.dataset.tab));
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && el.console?.classList.contains("open")) { e.preventDefault(); close(); }
    });
    window.addEventListener("eazo:localechange", () => {
      if (!el.console) return;
      window.eazoI18n?.translate?.(el.console);
      if (el.console.classList.contains("open")) {
        renderSubjects(); renderRecords(); renderSummary(); renderDetail(); renderLockedActions();
      }
    });
  }

  function init() {
    cache();
    if (!el.console) return;
    mounted = true;
    bind();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.eazoArchive = { open, close };
})();
