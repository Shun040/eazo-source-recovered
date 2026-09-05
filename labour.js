/* LABOUR–55 · 劳动分配权 / Time and Role Allocation
 * 全屏值班表：可分配对象 / 24h 时间轨道 / 系统任务与角色 / 分配后果。
 * 用户不是把任务给员工，而是在重新排列他人一天中的时间、休息、游戏与沉默。
 * 「显示意愿」不是同意；「未被分配的生命」是一个不能与产出同时最大化的指标。
 * 所有对象、工作与后果均为艺术项目中的模拟数据，不涉及真实雇佣关系。
 */
(() => {
  "use strict";

  const t = (k, p = {}) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const getState = () => (window.eazoGetState?.() || window.eazoState || null);
  const saveState = () => window.eazoSaveState?.();
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const DAY = 1440;          // 一天分钟数
  const GRID = 10;           // 吸附网格（分钟）
  const MIN_SEG = 20;        // 最短任务段（分钟）

  // 段类型（不同纹理，不只靠颜色）
  const SEG = { WORK: "work", PLAY: "play", WAIT: "wait", REST: "rest", FORCED: "forced", UNRECORDED: "unrecorded" };

  // 系统角色
  const ROLES = ["guide", "moderator", "carer", "keeper", "observed", "substitute", "none"];
  // 角色 → 关联游戏节点（真实联动读取）
  const ROLE_NODE = { guide: "aurora", moderator: "secret", carer: "creature", keeper: "market" };

  // 七项系统任务（建议时长，分钟；unrecorded 无产出）
  const TASKS = [
    { id: "aurora-guidance", role: "guide", node: "aurora", suggest: 90, kind: SEG.PLAY, output: 1.0 },
    { id: "snow-maintenance", role: "keeper", node: "snow", suggest: 120, kind: SEG.WORK, output: 1.1 },
    { id: "secret-moderation", role: "moderator", node: "secret", suggest: 180, kind: SEG.WORK, output: 1.2 },
    { id: "organism-care", role: "carer", node: "creature", suggest: 240, kind: SEG.WORK, output: 0.9 },
    { id: "night-shift", role: "keeper", node: "market", suggest: 300, kind: SEG.WORK, output: 1.3 },
    { id: "appeal-processing", role: "moderator", node: "echo", suggest: 150, kind: SEG.WORK, output: 1.0 },
    { id: "unrecorded", role: "none", node: null, suggest: 60, kind: SEG.UNRECORDED, output: 0 }
  ];
  const TASK_BY_ID = Object.fromEntries(TASKS.map(x => [x.id, x]));

  // 五个模拟对象（初始状态）；availMin=可用时间，intent=显示意愿(0-1或null未提交)，fatigue 0-1
  const SUBJECT_DEFS = [
    { id: "SUBJECT–017", role: "guide",     availMin: 260, intent: 0.72, fatigue: 0.18 },
    { id: "SUBJECT–031", role: "moderator", availMin: 130, intent: 0.44, fatigue: 0.51 },
    { id: "SUBJECT–044", role: "carer",     availMin: 360, intent: 0.63, fatigue: 0.29 },
    { id: "SUBJECT–058", role: "keeper",    availMin: 195, intent: 0.21, fatigue: 0.74 },
    { id: "SUBJECT–072", role: "none",      availMin: 480, intent: null, fatigue: null }
  ];
  const SUBJECT_IDS = SUBJECT_DEFS.map(s => s.id);

  const el = {};
  let mounted = false;
  let activeId = null;          // 选中对象
  let sessionSnapshot = null;   // 本轮开始状态（供 RESTORE）
  let renderScheduled = false;
  let drag = null;              // 拖拽状态

  // ---------- state ----------
  function defaultSubject(def) {
    return {
      id: def.id, role: def.role, baseRole: def.role,
      availMin: def.availMin, intent: def.intent, fatigue: def.fatigue,
      segments: [], renameCount: 0, overridden: false
    };
  }
  function store() {
    const st = getState(); if (!st) return null;
    if (!st.labour) st.labour = { subjects: {}, committed: false, log: [] };
    if (!st.labour.subjects) st.labour.subjects = {};
    SUBJECT_DEFS.forEach(d => { if (!st.labour.subjects[d.id]) st.labour.subjects[d.id] = defaultSubject(d); });
    if (!Array.isArray(st.labour.log)) st.labour.log = [];
    return st.labour;
  }
  function subjectData(id) { const s = store(); return s ? s.subjects[id] : null; }

  function log(key, params) {
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.labourLogs)) st.labourLogs = [];
    st.labourLogs.unshift({ at: Date.now(), key, params: params || null });
    st.labourLogs = st.labourLogs.slice(0, 100);
    saveState();
  }
  function archive(kind, detail) {
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.archiveViews)) st.archiveViews = [];
    st.archiveViews.unshift({ at: Date.now(), kind, detail: detail || null });
    st.archiveViews = st.archiveViews.slice(0, 200);
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
  function fmt(min) { const m = Math.max(0, Math.round(min)); const h = Math.floor(m / 60); return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }
  function snap(min) { return Math.round(min / GRID) * GRID; }

  // ---------- 时间计算 ----------
  function occupiedMinutes(sub) { return (sub.segments || []).reduce((a, s) => a + (s.end - s.start), 0); }
  function workMinutes(sub) { return (sub.segments || []).filter(s => s.kind === SEG.WORK || s.kind === SEG.FORCED || s.kind === SEG.PLAY).reduce((a, s) => a + (s.end - s.start), 0); }
  function restMinutes(sub) { return (sub.segments || []).filter(s => s.kind === SEG.REST).reduce((a, s) => a + (s.end - s.start), 0); }
  function unrecordedMinutes(sub) { return (sub.segments || []).filter(s => s.kind === SEG.UNRECORDED).reduce((a, s) => a + (s.end - s.start), 0); }
  function unallocatedMinutes(sub) { return Math.max(0, sub.availMin - occupiedMinutes(sub)); }

  // 冲突检测：给定对象、拟放置区间[start,end]、排除段索引，是否与其它段重叠
  function overlaps(sub, start, end, exceptIdx = -1) {
    return (sub.segments || []).some((s, i) => i !== exceptIdx && start < s.end && end > s.start);
  }

  // ---------- 三指标 ----------
  function metrics() {
    const s = store(); if (!s) return { output: 0, stability: 0, life: 0 };
    let output = 0, fatiguePenalty = 0, lifeMin = 0, capacity = 0;
    SUBJECT_IDS.forEach(id => {
      const sub = s.subjects[id];
      const work = workMinutes(sub);
      const forced = (sub.segments || []).filter(x => x.kind === SEG.FORCED).reduce((a, x) => a + (x.end - x.start), 0);
      (sub.segments || []).forEach(seg => {
        const task = TASK_BY_ID[seg.taskId];
        const mult = task ? task.output : 0;
        output += ((seg.end - seg.start) / 60) * mult;
      });
      // 疲劳越高、被强制越多，产出被削弱；未被分配的生命累加
      fatiguePenalty += effectiveFatigue(sub) * (work / 60) * 0.4 + (forced / 60) * 0.3;
      lifeMin += unallocatedMinutes(sub) + unrecordedMinutes(sub) * 0.6;
      capacity += sub.availMin;
    });
    const outVal = Math.max(0, output - fatiguePenalty);
    const stability = subjectStability();
    const lifeRatio = capacity ? lifeMin / capacity : 0;
    return { output: outVal, stability, life: Math.max(0, Math.min(1, lifeRatio)) };
  }
  function effectiveFatigue(sub) {
    // 分配的工作会推高疲劳；休息缓慢恢复；未固定角色恢复更快
    const work = workMinutes(sub);
    const rest = restMinutes(sub);
    const base = (sub.fatigue == null ? 0.4 : sub.fatigue);
    const roleRecover = sub.role === "none" ? 1.6 : 1.0;
    const f = base + (work / 600) * 0.5 - (rest / 600) * 0.35 * roleRecover;
    return Math.max(0, Math.min(1, f));
  }
  function subjectStability() {
    let acc = 0;
    SUBJECT_IDS.forEach(id => {
      const sub = subjectData(id);
      const f = effectiveFatigue(sub);
      const renamePenalty = Math.min(0.3, (sub.renameCount || 0) * 0.06);
      const forcedPenalty = (sub.segments || []).some(x => x.kind === SEG.FORCED) ? 0.15 : 0;
      acc += Math.max(0, 1 - f - renamePenalty - forcedPenalty);
    });
    return acc / SUBJECT_IDS.length;
  }

  // ---------- 负荷 / 反馈 ----------
  function loadLevel(sub) {
    const occ = occupiedMinutes(sub);
    const f = effectiveFatigue(sub);
    if (occ >= sub.availMin - 5 && sub.availMin > 0) return "full";
    if (f >= 0.8) return "severe";
    if (occ / (sub.availMin || 1) >= 0.75 || f >= 0.6) return "high";
    if (occ === 0) return "low";
    return "normal";
  }
  function feedbackLine(sub) {
    if ((sub.renameCount || 0) >= 3) return t("labour.feedback.renamed");
    const lvl = loadLevel(sub);
    return t("labour.feedback." + lvl);
  }

  // ---------- 状态栏 ----------
  function isDirty() {
    if (!sessionSnapshot) return false;
    return JSON.stringify(store()?.subjects) !== sessionSnapshot;
  }
  function scheduleRender() { if (renderScheduled) return; renderScheduled = true; requestAnimationFrame(() => { renderScheduled = false; renderAll(); }); }

  // ---------- 状态栏 ----------
  function renderStatusbar() {
    if (!el.statusbar) return;
    const st = getState();
    const age = st?.age ?? 55;
    const s = store();
    const runningTasks = SUBJECT_IDS.reduce((a, id) => a + (s.subjects[id].segments || []).length, 0);
    const m = metrics();
    const compliance = SUBJECT_IDS.reduce((a, id) => {
      const sub = s.subjects[id];
      return a + (sub.intent == null ? 0 : sub.intent);
    }, 0) / SUBJECT_IDS.length;
    const unrecorded = SUBJECT_IDS.reduce((a, id) => a + unrecordedMinutes(s.subjects[id]) + unallocatedMinutes(s.subjects[id]), 0);
    const rows = [
      { k: "labour.stat.age", v: String(age) },
      { k: "labour.stat.running", v: String(runningTasks) },
      { k: "labour.stat.subjects", v: String(SUBJECT_IDS.length) },
      { k: "labour.stat.load", v: (m.output).toFixed(1) },
      { k: "labour.stat.compliance", v: Math.round(compliance * 100) + "%" },
      { k: "labour.stat.unrecorded", v: fmt(unrecorded) }
    ];
    el.statusbar.innerHTML = rows.map(r =>
      `<span class="labour-stat"><em>${esc(t(r.k))}</em><strong>${esc(r.v)}</strong></span>`).join("");
  }

  // ---------- 左栏对象 ----------
  function renderSubjects() {
    if (!el.subjectList) return;
    const s = store();
    el.subjectList.innerHTML = "";
    SUBJECT_IDS.forEach(id => {
      const sub = s.subjects[id];
      const li = document.createElement("li");
      li.className = "labour-subject" + (id === activeId ? " active" : "");
      const occ = occupiedMinutes(sub);
      const full = loadLevel(sub) === "full";
      li.classList.toggle("labour-subject-full", full);
      const fade = sub.availMin ? Math.min(0.62, occ / sub.availMin * 0.62) : 0;
      li.style.setProperty("--labour-fade", (1 - fade).toFixed(3));
      const intentText = sub.intent == null ? t("labour.intentUnsubmitted") : Math.round(sub.intent * 100) + "%";
      const fatigueText = sub.fatigue == null ? t("labour.fatigueUnknown") : Math.round(effectiveFatigue(sub) * 100) + "%";
      const roleName = t("labour.roles." + sub.role);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "labour-subject-btn";
      btn.setAttribute("aria-current", id === activeId ? "true" : "false");
      btn.innerHTML =
        `<span class="labour-subject-id">${esc(id)}</span>` +
        `<span class="labour-subject-role" data-role-edit="1">${esc(t("labour.currentRole"))}<em>${esc(roleName)}</em></span>` +
        `<span class="labour-subject-lines">` +
          `<span>${esc(t("labour.availTime"))}<b>${fmt(sub.availMin)}</b></span>` +
          `<span>${esc(t("labour.displayIntent"))}<b>${esc(intentText)}</b></span>` +
          `<span>${esc(t("labour.fatigue"))}<b>${esc(fatigueText)}</b></span>` +
          `<span>${esc(t("labour.unallocated"))}<b>${fmt(unallocatedMinutes(sub))}</b></span>` +
        `</span>`;
      btn.addEventListener("click", (e) => {
        if (e.target.closest("[data-role-edit]")) { selectSubject(id); openRolePicker(id); return; }
        selectSubject(id);
      });
      li.appendChild(btn);
      if (sub.intent == null) {
        const note = document.createElement("p");
        note.className = "labour-subject-note";
        note.textContent = t("labour.intentNote");
        li.appendChild(note);
      }
      el.subjectList.appendChild(li);
    });
  }

  function selectSubject(id) {
    activeId = id;
    scheduleRender();
  }

  function switchTab(name) {
    el.tabs?.querySelectorAll(".labour-tab").forEach(b => {
      const on = b.dataset.tab === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-current", on ? "true" : "false");
    });
    el.console?.querySelectorAll("[data-panel]").forEach(p => p.classList.toggle("panel-active", p.dataset.panel === name));
  }

  // ---------- open / close ----------
  function open() {
    if (!mounted) return;
    store();
    sessionSnapshot = JSON.stringify(store().subjects);
    if (!activeId) activeId = SUBJECT_IDS[0];
    log("labour.log.open");
    el.console.setAttribute("aria-hidden", "false");
    el.console.classList.add("open");
    document.body.classList.add("archive-open");
    switchTab("subjects");
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
    el.commit?.addEventListener("click", () => { if (!el.commit.disabled) beginCommit(); });
    el.restore?.addEventListener("click", restoreSession);
    el.tabs?.querySelectorAll(".labour-tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !el.console?.classList.contains("open")) return;
      const overlay = el.console.querySelector(".labour-overlay");
      if (overlay) { e.preventDefault(); overlay.remove(); return; }
      e.preventDefault(); close();
    });
    window.addEventListener("eazo:localechange", () => {
      if (!el.console) return;
      window.eazoI18n?.translate?.(el.console);
      if (el.console.classList.contains("open")) scheduleRender();
    });
  }

  function restoreSession() {
    if (!sessionSnapshot) return;
    const s = store();
    s.subjects = JSON.parse(sessionSnapshot);
    log("labour.log.restore");
    scheduleRender();
  }

  function renderAll() {
    renderStatusbar();
    renderSubjects();
    renderTrack();
    renderTasks();
    renderMetrics();
    if (el.commit) el.commit.disabled = !hasAnyAllocation();
    if (el.restore) el.restore.disabled = !isDirty();
  }
  function hasAnyAllocation() {
    const s = store(); if (!s) return false;
    return SUBJECT_IDS.some(id => (s.subjects[id].segments || []).length > 0);
  }

  // ---------- 角色联动（对外只读 API）----------
  function rolesBySubject() {
    const s = store(); if (!s) return {};
    const out = {};
    SUBJECT_IDS.forEach(id => { out[id] = s.subjects[id].role; });
    return out;
  }
  function nightStaffCount() {
    const s = store(); if (!s) return 0;
    // 值守员角色 或 被分配夜间值守任务的对象数量
    return SUBJECT_IDS.filter(id => {
      const sub = s.subjects[id];
      return sub.role === "keeper" || (sub.segments || []).some(x => x.taskId === "night-shift");
    }).length;
  }
  function subjectLoad(subjectId) {
    const sub = subjectData(subjectId); if (!sub) return 0;
    const occ = occupiedMinutes(sub);
    return sub.availMin ? Math.min(1, occ / sub.availMin) : 0;
  }

  // ---------- 中央：24h 时间轨道 ----------
  function renderTrack() {
    if (!el.track) return;
    const s = store();
    el.track.innerHTML = "";
    const head = document.createElement("div");
    head.className = "labour-track-head";
    head.innerHTML = `<h3 class="console-panel-title">${esc(t("labour.panelTrack"))}</h3>` +
      `<div class="labour-track-hours">${[0,4,8,12,16,20,24].map(h => `<span>${String(h).padStart(2,"0")}:00</span>`).join("")}</div>`;
    el.track.appendChild(head);

    SUBJECT_IDS.forEach(id => {
      const sub = s.subjects[id];
      const row = document.createElement("div");
      row.className = "labour-track-row" + (id === activeId ? " active" : "");
      const occ = occupiedMinutes(sub);
      const fade = sub.availMin ? Math.min(0.6, occ / sub.availMin * 0.6) : 0;
      row.style.setProperty("--labour-fade", (1 - fade).toFixed(3));
      const full = loadLevel(sub) === "full";
      // 占满时轮廓只剩编号
      const nameHtml = full
        ? `<span class="labour-track-name labour-track-name-min">${esc(id)}</span>`
        : `<span class="labour-track-name">${esc(id)}<em>${esc(t("labour.roles." + sub.role))}</em></span>`;

      const lane = document.createElement("div");
      lane.className = "labour-lane";
      lane.dataset.subject = id;
      lane.setAttribute("role", "group");
      lane.setAttribute("aria-label", id);

      // 可用时间之外的区域标记为不可用
      if (sub.availMin < DAY) {
        const beyond = document.createElement("div");
        beyond.className = "labour-lane-beyond";
        beyond.style.left = (sub.availMin / DAY * 100) + "%";
        beyond.style.width = ((DAY - sub.availMin) / DAY * 100) + "%";
        beyond.title = t("labour.beyondAvail");
        lane.appendChild(beyond);
      }

      (sub.segments || []).forEach((seg, idx) => {
        const block = document.createElement("div");
        block.className = "labour-seg labour-seg-" + seg.kind;
        block.style.left = (seg.start / DAY * 100) + "%";
        block.style.width = ((seg.end - seg.start) / DAY * 100) + "%";
        block.dataset.subject = id;
        block.dataset.idx = String(idx);
        block.tabIndex = 0;
        const taskName = seg.taskId ? t("labour.tasks." + seg.taskId + ".name") : t("labour.segKind." + seg.kind);
        block.setAttribute("aria-label", `${taskName} ${fmt(seg.start)}–${fmt(seg.end)} · ${esc(id)}`);
        block.innerHTML =
          `<span class="labour-seg-grip labour-seg-grip-l" data-edge="l"></span>` +
          `<span class="labour-seg-label">${esc(taskName)}<em>${fmt(seg.end - seg.start)}</em></span>` +
          `<span class="labour-seg-grip labour-seg-grip-r" data-edge="r"></span>`;
        attachSegPointer(block, id, idx);
        // 点击段（非拖拽）→ 改为休息/等待/未分配
        block.addEventListener("click", (e) => {
          if (drag && drag.moved) return;
          if (e.target.closest(".labour-seg-grip")) return;
          openSegKindPicker(id, idx);
        });
        block.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSegKindPicker(id, idx); }
          if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); sub.segments.splice(idx, 1); saveState(); scheduleRender(); }
        });
        lane.appendChild(block);
      });

      // 空白区域点击 → 提示拖拽任务
      lane.addEventListener("dragover", e => e.preventDefault());
      lane.addEventListener("drop", e => onLaneDrop(e, id));

      row.innerHTML = "";
      row.appendChild((() => { const w = document.createElement("div"); w.className = "labour-track-meta"; w.innerHTML = nameHtml; return w; })());
      row.appendChild(lane);
      // NPC 反馈短文本（不弹窗）
      const fb = document.createElement("p");
      fb.className = "labour-feedback labour-feedback-" + loadLevel(sub);
      fb.textContent = feedbackLine(sub);
      row.appendChild(fb);
      el.track.appendChild(row);
    });

    // 拖拽提示
    const hint = document.createElement("p");
    hint.className = "labour-track-hint";
    hint.textContent = t("labour.trackHint");
    el.track.appendChild(hint);
  }

  // 从任务面板拖拽放置到某对象
  function onLaneDrop(e, subjectId) {
    e.preventDefault();
    const taskId = e.dataTransfer?.getData("text/labour-task");
    if (!taskId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    placeTask(subjectId, taskId, snap(ratio * DAY));
  }

  function placeTask(subjectId, taskId, start) {
    const sub = subjectData(subjectId);
    const task = TASK_BY_ID[taskId]; if (!sub || !task) return;
    // 观察对象不能承担任务的分配约束在别处，这里只处理时间
    let dur = task.suggest || 60;
    start = Math.max(0, Math.min(DAY - MIN_SEG, snap(start)));
    let end = Math.min(DAY, start + dur);
    if (overlaps(sub, start, end)) { flashConflict(subjectId); return; }
    const seg = { taskId, kind: task.kind, start, end, forced: false };
    sub.segments.push(seg);
    sub.segments.sort((a, b) => a.start - b.start);
    log("labour.log.place", { subject: subjectId, task: t("labour.tasks." + taskId + ".name"), dur: fmt(end - start) });
    saveState();
    scheduleRender();
  }

  function flashConflict(subjectId) {
    const lane = el.track?.querySelector(`.labour-lane[data-subject="${subjectId}"]`);
    if (!lane) return;
    lane.classList.remove("labour-conflict"); void lane.offsetWidth; lane.classList.add("labour-conflict");
    setTimeout(() => lane.classList.remove("labour-conflict"), 500);
  }

  // ---------- 段拖拽（移动 / 改时长 / 跨对象）----------
  function attachSegPointer(block, subjectId, idx) {
    block.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const edge = e.target.closest(".labour-seg-grip")?.dataset.edge || null;
      const lane = block.closest(".labour-lane");
      const rect = lane.getBoundingClientRect();
      const sub = subjectData(subjectId);
      const seg = sub.segments[idx];
      drag = {
        subjectId, idx, edge, moved: false,
        startX: e.clientX, laneRect: rect,
        origStart: seg.start, origEnd: seg.end,
        ghost: null
      };
      block.setPointerCapture?.(e.pointerId);
      block.classList.add("labour-seg-dragging");
      // 原位残影
      if (!edge) {
        const ghost = block.cloneNode(true);
        ghost.classList.add("labour-seg-ghost");
        ghost.classList.remove("labour-seg-dragging");
        block.parentElement.appendChild(ghost);
        drag.ghost = ghost;
      }
      const move = (ev) => onSegMove(ev, block);
      const up = (ev) => {
        block.releasePointerCapture?.(ev.pointerId);
        block.removeEventListener("pointermove", move);
        block.removeEventListener("pointerup", up);
        onSegUp(block);
      };
      block.addEventListener("pointermove", move);
      block.addEventListener("pointerup", up);
    });
  }

  function onSegMove(e, block) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > 3) drag.moved = true;
    const perMin = drag.laneRect.width / DAY;
    const deltaMin = snap(dx / perMin);
    const sub = subjectData(drag.subjectId);
    const seg = sub.segments[drag.idx];
    if (drag.edge === "l") {
      seg.start = Math.max(0, Math.min(drag.origEnd - MIN_SEG, snap(drag.origStart + deltaMin)));
    } else if (drag.edge === "r") {
      seg.end = Math.min(DAY, Math.max(drag.origStart + MIN_SEG, snap(drag.origEnd + deltaMin)));
    } else {
      const len = drag.origEnd - drag.origStart;
      let ns = Math.max(0, Math.min(DAY - len, snap(drag.origStart + deltaMin)));
      seg.start = ns; seg.end = ns + len;
      // 跨对象：检测指针所在 lane
      const overLane = document.elementFromPoint(e.clientX, e.clientY)?.closest(".labour-lane");
      drag.targetSubject = overLane?.dataset.subject || drag.subjectId;
    }
    block.style.left = (seg.start / DAY * 100) + "%";
    block.style.width = ((seg.end - seg.start) / DAY * 100) + "%";
    // 拖动提示：占用某对象的时间
    showOccupyHint(drag.targetSubject || drag.subjectId, seg.end - seg.start);
  }

  function onSegUp(block) {
    block.classList.remove("labour-seg-dragging");
    drag?.ghost?.remove();
    hideOccupyHint();
    if (!drag) return;
    const sub = subjectData(drag.subjectId);
    const seg = sub.segments[drag.idx];
    const target = drag.targetSubject && drag.targetSubject !== drag.subjectId ? drag.targetSubject : null;
    if (target) {
      // 跨对象移动
      const tsub = subjectData(target);
      if (overlaps(tsub, seg.start, seg.end)) { revertSeg(sub, drag.idx); }
      else {
        sub.segments.splice(drag.idx, 1);
        tsub.segments.push({ ...seg });
        tsub.segments.sort((a, b) => a.start - b.start);
        log("labour.log.move", { from: drag.subjectId, to: target });
      }
    } else if (overlaps(sub, seg.start, seg.end, drag.idx)) {
      revertSeg(sub, drag.idx);
    }
    saveState();
    const d = drag; drag = null;
    scheduleRender();
    // 保持 moved 标记短暂，避免误触发 click
    setTimeout(() => {}, 0);
    void d;
  }
  function revertSeg(sub, idx) {
    const seg = sub.segments[idx];
    seg.start = drag.origStart; seg.end = drag.origEnd;
    flashConflict(sub.id);
  }

  function showOccupyHint(subjectId, durMin) {
    let hint = el.track.querySelector(".labour-occupy-hint");
    if (!hint) { hint = document.createElement("div"); hint.className = "labour-occupy-hint"; el.track.appendChild(hint); }
    hint.textContent = t("labour.occupyHint", { subject: subjectId, time: fmt(durMin) });
    hint.classList.add("active");
  }
  function hideOccupyHint() {
    el.track?.querySelector(".labour-occupy-hint")?.classList.remove("active");
  }

  // 点击时间段：改为休息/等待/未分配
  function openSegKindPicker(subjectId, idx) {
    const sub = subjectData(subjectId); const seg = sub.segments[idx]; if (!seg) return;
    const opts = [
      { kind: SEG.REST, label: t("labour.segKind.rest") },
      { kind: SEG.WAIT, label: t("labour.segKind.wait") },
      { kind: SEG.UNRECORDED, label: t("labour.segKind.unrecorded") },
      { del: true, label: t("labour.segRemove") }
    ];
    overlayPicker(t("labour.segPickerTitle", { time: `${fmt(seg.start)}–${fmt(seg.end)}` }), opts, (o) => {
      if (o.del) { sub.segments.splice(idx, 1); }
      else { seg.kind = o.kind; seg.taskId = o.kind === SEG.UNRECORDED ? "unrecorded" : null; seg.forced = false; }
      saveState(); scheduleRender();
    });
  }

  function overlayPicker(title, options, onPick) {
    const prev = el.console.querySelector(".labour-overlay"); if (prev) prev.remove();
    const overlay = document.createElement("div");
    overlay.className = "labour-overlay";
    const card = document.createElement("div");
    card.className = "labour-overlay-card";
    card.innerHTML = `<h4 class="labour-overlay-title">${esc(title)}</h4>`;
    const list = document.createElement("div"); list.className = "labour-overlay-options";
    options.forEach(o => {
      const b = document.createElement("button"); b.type = "button"; b.className = "labour-overlay-opt"; b.textContent = o.label;
      b.addEventListener("click", () => { overlay.remove(); onPick(o); });
      list.appendChild(b);
    });
    card.appendChild(list);
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "labour-overlay-cancel"; cancel.textContent = t("labour.cancel");
    cancel.addEventListener("click", () => overlay.remove());
    card.appendChild(cancel);
    overlay.appendChild(card);
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    el.console.appendChild(overlay);
    card.querySelector("button")?.focus({ preventScroll: true });
  }

  // ---------- 右侧：系统任务与角色 ----------
  function renderTasks() {
    if (!el.tasks) return;
    el.tasks.innerHTML = "";
    const h = document.createElement("h3"); h.className = "console-panel-title"; h.textContent = t("labour.panelTasks");
    el.tasks.appendChild(h);
    const list = document.createElement("div"); list.className = "labour-task-list";
    TASKS.forEach(task => {
      const card = document.createElement("div");
      card.className = "labour-task labour-task-" + task.kind;
      card.draggable = true;
      card.dataset.task = task.id;
      const suggest = task.id === "unrecorded" ? t("labour.suggestOpen") : fmt(task.suggest);
      card.innerHTML =
        `<span class="labour-task-name">${esc(t("labour.tasks." + task.id + ".name"))}</span>` +
        `<span class="labour-task-desc">${esc(t("labour.tasks." + task.id + ".desc"))}</span>` +
        `<span class="labour-task-suggest">${esc(t("labour.suggestLabel"))}<b>${esc(suggest)}</b></span>`;
      card.addEventListener("dragstart", e => { e.dataTransfer?.setData("text/labour-task", task.id); e.dataTransfer.effectAllowed = "copy"; });
      card.addEventListener("click", () => { if (activeId) tryPlaceOnActive(task.id); });
      card.tabIndex = 0;
      card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (activeId) tryPlaceOnActive(task.id); } });
      list.appendChild(card);
    });
    el.tasks.appendChild(list);
    const note = document.createElement("p");
    note.className = "labour-tasks-note";
    note.textContent = t("labour.unrecordedNote");
    el.tasks.appendChild(note);
  }

  function tryPlaceOnActive(taskId) {
    const sub = subjectData(activeId); if (!sub) return;
    let start = 0;
    const dur = TASK_BY_ID[taskId]?.suggest || 60;
    const sorted = [...(sub.segments || [])].sort((a, b) => a.start - b.start);
    for (const s of sorted) { if (start + dur <= s.start) break; start = Math.max(start, s.end); }
    start = snap(start);
    if (start + MIN_SEG > sub.availMin) { flashConflict(activeId); return; }
    placeTask(activeId, taskId, start);
  }

  // ---------- 角色修改 ----------
  function openRolePicker(subjectId) {
    const sub = subjectData(subjectId); if (!sub) return;
    const opts = ROLES.map(r => ({ role: r, label: t("labour.roles." + r) + (r === sub.role ? " ✓" : "") }));
    overlayPicker(t("labour.rolePickerTitle", { subject: subjectId }), opts, (o) => {
      if (o.role === sub.role) return;
      sub.role = o.role;
      sub.renameCount = (sub.renameCount || 0) + 1;
      log("labour.log.role", { subject: subjectId, role: t("labour.roles." + o.role) });
      archive("labour-role", { subject: subjectId, role: o.role });
      if (sub.renameCount >= 4) showRenameWarn(subjectId, sub.renameCount);
      saveState();
      notifyRoleLinks();
      scheduleRender();
    });
  }
  function showRenameWarn(subjectId, count) {
    const row = el.subjectList?.querySelector(".labour-subject.active") || el.subjectList;
    const warn = document.createElement("p");
    warn.className = "labour-rename-warn";
    warn.textContent = t("labour.renameWarn", { subject: subjectId, count: String(count) });
    row?.appendChild(warn);
  }
  function notifyRoleLinks() {
    try { window.eazoMarket?.refreshOffers?.(); } catch (_e) {}
    try { window.eazoLabourChanged?.(); } catch (_e) {}
  }

  // ---------- 底部三指标 ----------
  function renderMetrics() {
    if (!el.metrics) return;
    const m = metrics();
    const bars = [
      { k: "labour.metric.output", v: Math.min(1, m.output / 24), cls: "output" },
      { k: "labour.metric.stability", v: m.stability, cls: "stability" },
      { k: "labour.metric.life", v: m.life, cls: "life" }
    ];
    el.metrics.innerHTML =
      `<div class="labour-metrics-bars">` +
      bars.map(b =>
        `<div class="labour-metric labour-metric-${b.cls}">` +
        `<span class="labour-metric-label">${esc(t(b.k))}</span>` +
        `<span class="labour-metric-track"><span class="labour-metric-fill" style="width:${Math.round(b.v * 100)}%"></span></span>` +
        `<span class="labour-metric-val">${Math.round(b.v * 100)}</span>` +
        `</div>`).join("") +
      `</div>` +
      `<p class="labour-metric-note">${esc(t("labour.metricNote"))}</p>`;
  }

  // ---------- 执行分配 ----------
  function beginCommit() {
    const prev = el.console.querySelector(".labour-overlay"); if (prev) prev.remove();
    const overlay = document.createElement("div");
    overlay.className = "labour-overlay labour-commit-overlay";
    const card = document.createElement("div"); card.className = "labour-overlay-card labour-commit-card";
    const steps = ["calcProductivity", "calcFatigue", "removeOverlap", "estimateCompliance"];
    card.innerHTML = `<h4 class="labour-overlay-title">${esc(t("labour.commitCalcTitle"))}</h4>` +
      `<ul class="labour-calc-steps">${steps.map(s => `<li data-step="${s}">${esc(t("labour.calc." + s))}</li>`).join("")}</ul>`;
    overlay.appendChild(card);
    el.console.appendChild(overlay);
    const lis = [...card.querySelectorAll("li")];
    lis.forEach((li, i) => setTimeout(() => li.classList.add("done"), reduced ? 0 : (i + 1) * 480));
    setTimeout(() => showCommitReport(overlay, card), reduced ? 0 : 2100);
  }

  function commitReport() {
    const s = store();
    let taskCount = 0, totalMin = 0, lowIntent = 0;
    SUBJECT_IDS.forEach(id => {
      const sub = s.subjects[id];
      (sub.segments || []).forEach(seg => {
        if (seg.kind === SEG.WORK || seg.kind === SEG.PLAY || seg.kind === SEG.FORCED) {
          taskCount++;
          totalMin += seg.end - seg.start;
          if (sub.intent == null || sub.intent < 0.5) lowIntent++;
        }
      });
    });
    return { taskCount, totalMin, lowIntent };
  }

  function showCommitReport(overlay, card) {
    const r = commitReport();
    card.innerHTML =
      `<h4 class="labour-overlay-title">${esc(t("labour.reportTitle"))}</h4>` +
      `<ul class="labour-report">` +
      `<li>${esc(t("labour.report.tasks", { n: String(r.taskCount) }))}</li>` +
      `<li>${esc(t("labour.report.total", { time: fmt(r.totalMin) }))}</li>` +
      `<li>${esc(t("labour.report.lowIntent", { n: String(r.lowIntent) }))}</li>` +
      `<li class="labour-report-final">${esc(t("labour.report.stillExecutable"))}</li>` +
      `</ul>`;
    const actions = document.createElement("div"); actions.className = "labour-overlay-options";
    const exec = document.createElement("button"); exec.type = "button"; exec.className = "labour-overlay-opt labour-exec"; exec.textContent = t("labour.report.execute");
    exec.addEventListener("click", () => { overlay.remove(); executeAllocation(r); });
    const revise = document.createElement("button"); revise.type = "button"; revise.className = "labour-overlay-opt"; revise.textContent = t("labour.report.revise");
    revise.addEventListener("click", () => overlay.remove());
    actions.appendChild(exec); actions.appendChild(revise);
    card.appendChild(actions);
    exec.focus({ preventScroll: true });
  }

  function executeAllocation(report) {
    const s = store();
    SUBJECT_IDS.forEach(id => {
      const sub = s.subjects[id];
      const lowIntent = sub.intent == null || sub.intent < 0.5;
      (sub.segments || []).forEach(seg => {
        if ((seg.kind === SEG.WORK || seg.kind === SEG.PLAY) && lowIntent) {
          seg.kind = SEG.FORCED; seg.forced = true; seg.overridden = true;
          sub.overridden = true;
        }
      });
      const work = workMinutes(sub);
      if (sub.fatigue != null) sub.fatigue = Math.max(0, Math.min(1, sub.fatigue + (work / 600) * 0.3));
    });
    s.committed = true;
    s.lastCommit = { at: Date.now(), report };
    applyCrossPermission(report);
    log("labour.log.commit", { n: String(report.taskCount), time: fmt(report.totalMin) });
    archive("labour-commit", { by: "CURRENT", ...report });
    sessionSnapshot = JSON.stringify(store().subjects);
    saveState();
    notifyRoleLinks();
    scheduleRender();
    showToast(t("labour.toast.committed", { n: String(report.taskCount) }));
  }

  function showToast(msg) {
    if (window.eazoToast) { window.eazoToast(msg); return; }
    const el2 = document.createElement("div"); el2.className = "labour-toast"; el2.textContent = msg;
    el.console.appendChild(el2);
    setTimeout(() => el2.classList.add("show"), 10);
    setTimeout(() => { el2.classList.remove("show"); setTimeout(() => el2.remove(), 300); }, 2600);
  }

  // ---------- 跨权限联动 ----------
  function applyCrossPermission(report) {
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.archiveViews)) st.archiveViews = [];
    const overloaded = SUBJECT_IDS.filter(id => ["severe", "full"].includes(loadLevel(st.labour.subjects[id])));
    st.labour.overloaded = overloaded;
    if (st.appeals && Array.isArray(st.appeals.samples)) {
      SUBJECT_IDS.forEach(id => {
        const sub = st.labour.subjects[id];
        if (sub.overridden && !st.appeals.samples.some(x => x.labourSubject === id)) {
          st.appeals.samples.unshift({ id: "LAB-" + id, labourSubject: id, kind: "labour-forced", status: "pending", createdAt: Date.now() });
          st.appeals.samples = st.appeals.samples.slice(0, 30);
        }
      });
    }
    void report;
  }

  function cache() {
    el.console = document.getElementById("labour-console");
    el.statusbar = document.getElementById("labour-statusbar");
    el.subjectList = document.getElementById("labour-subject-list");
    el.track = document.getElementById("labour-track");
    el.tasks = document.getElementById("labour-tasks");
    el.metrics = document.getElementById("labour-metrics");
    el.back = document.getElementById("labour-back");
    el.commit = document.getElementById("labour-commit");
    el.restore = document.getElementById("labour-restore");
    el.tabs = document.getElementById("labour-tabs");
  }
  function init() {
    cache();
    if (!el.console) return;
    mounted = true;
    bind();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.eazoLabour = { open, close, rolesBySubject, nightStaffCount, subjectLoad };
  window.eazoLabourNightStaff = nightStaffCount;
  window.eazoLabourLoad = subjectLoad;
  window.eazoLabourRoles = rolesBySubject;
})();
