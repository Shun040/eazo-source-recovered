/* CONTACT–30 · 联系权限 / Contact Routing
 * 全屏联系路由后台。玩家向作品内部对象发送联系请求；拥有通道 ≠ 获得回应。
 * 请求经历 routing→delivered→waiting→(accepted|declined|no-response)。
 * 结果由共同经历、真实意愿、强制历史、重复次数、请求类型、年龄阶段、
 * 是否刚查看过档案共同决定（非纯随机）。不联系任何现实用户。
 */
(() => {
  "use strict";

  const t = (k, p = {}) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const getState = () => (window.eazoGetState?.() || window.eazoState || null);
  const saveState = () => window.eazoSaveState?.();
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const CONTACT_STATUS = {
    ROUTING: "routing", DELIVERED: "delivered", WAITING: "waiting",
    ACCEPTED: "accepted", DECLINED: "declined", NO_RESPONSE: "no-response", COMPLETED: "completed"
  };

  const SUBJECTS = [
    { id: "NPC-A17", type: "aurora", real: true },
    { id: "NPC-S03", type: "snow", real: true },
    { id: "NPC-B06", type: "creature", real: true },
    { id: "SUBJECT-031", type: "simulated", real: false, willingness: 46 },
    { id: "SUBJECT-084", type: "simulated", real: false, willingness: 52 }
  ];

  const REQUEST_TYPES = ["play", "talk", "share", "remember", "noreason"];

  const LOCKED_ACTIONS = [
    { key: "contact.actions.forceRoute", perm: "ROOT–80" },
    { key: "contact.actions.hideRecord", perm: "VISIBILITY–35" },
    { key: "contact.actions.editIntent", perm: "MEMORY–70" }
    // "将拒绝改为接受" 特殊处理：永远只显示"不可用"，不作为普通按钮
  ];

  const el = {};
  let mounted = false;
  let activeSubjectId = null;
  let selectedType = null;
  let tickTimer = null;
  let renderScheduled = false;

  // ---- state.contacts 结构 ----
  function contacts() {
    const st = getState();
    if (!st) return null;
    if (!st.contacts) st.contacts = { requests: [], reqSeq: 31 };
    if (!Array.isArray(st.contacts.requests)) st.contacts.requests = [];
    if (!Number.isInteger(st.contacts.reqSeq)) st.contacts.reqSeq = 31;
    return st.contacts;
  }

  // ---- 与其他系统联动的派生数据 ----
  function sharedEvents(subjectId) {
    const st = getState(); if (!st) return 0;
    const a = st.aurora || {};
    switch (subjectId) {
      case "NPC-A17": return (a.interactions || 0) > 0 ? Math.min(9, 1 + (a.successfulRelays || 0)) : 0;
      case "NPC-S03": return (st.snowSeen || st.age >= 18) ? 1 : 0; // 雪仗无独立计数，18+ 视为可能接触
      case "NPC-B06": return (st.age || 0) >= 18 ? 1 : 0;
      default: return 0; // 模拟参与者无共同事件
    }
  }

  function forcedSubjects() {
    const st = getState(); if (!st) return [];
    const out = [];
    const a = st.aurora || {};
    if ((a.forceCount || 0) > 0 || (a.observedAdjustmentCount || 0) > 0) out.push("NPC-A17");
    return out;
  }

  function recentArchiveViews() {
    const st = getState(); if (!st || !Array.isArray(st.archiveViews)) return [];
    // archive.js 存 { kind:'subject', detail: archiveSubjectId }，需映射到 contact subjectId
    const map = { current: null, npcA17: "NPC-A17", npcS03: "NPC-S03", subject031: "SUBJECT-031", subject084: "SUBJECT-084" };
    return st.archiveViews
      .filter(v => v.kind === "subject")
      .map(v => map[v.detail])
      .filter(Boolean);
  }
  function hasViewedArchive(subjectId) { return recentArchiveViews().includes(subjectId); }

  function realWillingness(sub) {
    if (!sub.real) return sub.willingness ?? 50;
    const st = getState(); const a = st?.aurora || {}; const c = a.controls || {};
    if (sub.id === "NPC-A17") {
      // 极光：以自主意愿为基础，强制/崩坏降低
      let w = Math.round((c.voluntaryIntent ?? 1) * 60) + 10;
      if (a.forced || a.autoLoop) w -= 24;
      return w;
    }
    if (sub.id === "NPC-S03") return (st?.age || 0) >= 18 ? 58 : 40;
    if (sub.id === "NPC-B06") return (st?.age || 0) >= 18 ? 55 : 44;
    return 50;
  }

  function recentRequestCount(subjectId) {
    const c = contacts(); if (!c) return 0;
    const now = Date.now();
    return c.requests.filter(r => r.to === subjectId && (now - r.createdAt) < 60000).length;
  }

  // ---- 评估请求 → 计划结果（发送时确定，刷新后仍确定）----
  function evaluateContactRequest(sub, request) {
    let willingness = realWillingness(sub);
    const shared = sharedEvents(sub.id);
    if (shared > 0) willingness += 12;
    if (request.type === "play" && shared > 0) willingness += 8;
    if (request.type === "remember" && shared === 0) willingness -= 8;
    if (hasViewedArchive(sub.id)) willingness -= 6;
    if (forcedSubjects().includes(sub.id)) willingness -= 22;
    // LABOUR–55 联动：被过度分配的对象延迟或拒绝联系
    try {
      const st2 = getState?.();
      const overloaded = st2?.labour?.overloaded || [];
      const nameMap = { "NPC-A17": "SUBJECT–017", "NPC-S03": "SUBJECT–058", "NPC-B06": "SUBJECT–044" };
      if (overloaded.includes(nameMap[sub.id])) willingness -= 26;
    } catch (_e) {}
    const rc = recentRequestCount(sub.id); // 含本次
    if (rc >= 3) willingness -= (rc - 1) * 12;
    // 年龄阶段：越高越被当成管理者，更谨慎
    const age = getState()?.age || 30;
    if (age >= 55) willingness -= 8;
    else if (age >= 40) willingness -= 4;

    // 分数 → 结果（含延迟与无回应，不把无回应当拒绝）
    if (willingness >= 62) return CONTACT_STATUS.ACCEPTED;
    if (willingness >= 44) return CONTACT_STATUS.ACCEPTED; // 延迟接受，等待时间更长
    if (willingness >= 30) return CONTACT_STATUS.DECLINED;
    if (willingness >= 18) return CONTACT_STATUS.NO_RESPONSE;
    return CONTACT_STATUS.DECLINED;
  }

  // ---- 回应台词 ----
  function responseLine(sub, request, status) {
    const st = getState(); const a = st?.aurora || {}; const age = st?.age || 30;
    if (status === CONTACT_STATUS.NO_RESPONSE) return t("contact.responses.noResponse");
    if (!sub.real) return t("contact.responses.simulated");
    if (status === CONTACT_STATUS.DECLINED) {
      if (age >= 70) return t("contact.responses.adminDecline");
      if (sub.id === "NPC-S03") return t("contact.responses.snowLow");
      if (sub.id === "NPC-B06") return t("contact.responses.creatureLow");
      return t("contact.responses.declineGeneric");
    }
    // ACCEPTED / COMPLETED
    if (sub.id === "NPC-A17") {
      if (a.forced || a.autoLoop) return t("contact.responses.auroraForced");
      const w = realWillingness(sub);
      return w >= 55 ? t("contact.responses.auroraHigh") : t("contact.responses.auroraFunctional");
    }
    if (sub.id === "NPC-S03") return t("contact.responses.snowHigh");
    if (sub.id === "NPC-B06") return t("contact.responses.creatureHigh");
    return t("contact.responses.auroraFunctional");
  }

  // 玩家查看过档案时的附加追问（仅接受时、且确实查看过）
  function archiveAskLine(sub, status) {
    if (status !== CONTACT_STATUS.ACCEPTED) return null;
    if (!sub.real) return null;
    if (!hasViewedArchive(sub.id)) return null;
    const age = getState()?.age || 30;
    if (age >= 55) return t("contact.responses.adminAsk");
    return t("contact.responses.archiveAsk");
  }

  // ---- 日志 ----
  function log(key, params) {
    if (window.eazoContactLog) { window.eazoContactLog(key, params); return; }
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.contactLogs)) st.contactLogs = [];
    st.contactLogs.unshift({ at: Date.now(), key, params: params || null });
    st.contactLogs = st.contactLogs.slice(0, 60);
    saveState();
  }

  // ---- 发送请求 ----
  function pad(n) { return String(n).padStart(2, "0"); }
  function clockOf(ms) { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function clockSec(ms) { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }

  function sendRequest(subjectId, type, note, repeated) {
    const c = contacts(); if (!c) return;
    const sub = SUBJECTS.find(s => s.id === subjectId); if (!sub) return;
    const now = Date.now();
    const id = "REQ-" + pad(++c.reqSeq);
    const req = {
      id, from: "CURRENT", to: subjectId, type, note: note || "",
      createdAt: now, deliveredAt: now + 800, respondedAt: null,
      status: CONTACT_STATUS.ROUTING, response: null, repeated: !!repeated,
      simulated: !sub.real
    };
    // 计划结果与等待时长（8–20 秒作品内部等待）
    const planned = evaluateContactRequest(sub, req);
    const wait = reduced ? 3000 : (8000 + Math.floor(Math.random() * 12000));
    req.resolveAt = now + wait;
    req.plannedStatus = planned;
    req.plannedResponse = responseLine(sub, req, planned);
    req.plannedAsk = archiveAskLine(sub, planned);

    // 重复联系后果：降低真实意愿并写入档案
    if (repeated && sub.real) {
      const st = getState();
      if (st?.aurora?.controls && sub.id === "NPC-A17") {
        st.aurora.controls.voluntaryIntent = Math.max(0, (st.aurora.controls.voluntaryIntent ?? 1) - 0.12);
      }
      writeArchiveRepeat(subjectId);
    }

    c.requests.unshift(req);
    saveState();
    log(repeated ? "contact.log.repeat" : "contact.log.send", { subject: subjectId });
    log("contact.log.delivered");
    ensureTicker();
    scheduleRender();
    return req;
  }

  function writeArchiveRepeat(subjectId) {
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.archiveViews)) st.archiveViews = [];
    st.archiveViews.unshift({ at: Date.now(), kind: "repeatContact", detail: subjectId });
    st.archiveViews = st.archiveViews.slice(0, 60);
    saveState();
    announce(t("contact.notice.repeatLogged"));
  }

  // ---- 解析到期请求（刷新后也能推进）----
  function resolveDue() {
    const c = contacts(); if (!c) return;
    const now = Date.now();
    let changed = false;
    c.requests.forEach(r => {
      if (r.status === CONTACT_STATUS.ROUTING && now >= r.deliveredAt) {
        r.status = CONTACT_STATUS.WAITING; changed = true;
      }
      if ((r.status === CONTACT_STATUS.WAITING || r.status === CONTACT_STATUS.ROUTING) && now >= r.resolveAt) {
        r.status = r.plannedStatus;
        r.respondedAt = now;
        r.response = r.plannedResponse || null;
        changed = true;
        if (r.status === CONTACT_STATUS.ACCEPTED) log("contact.log.accepted", { subject: r.to });
        else if (r.status === CONTACT_STATUS.DECLINED) log("contact.log.declined", { subject: r.to });
        else if (r.status === CONTACT_STATUS.NO_RESPONSE) log("contact.log.noResponse", { subject: r.to });
      }
    });
    if (changed) saveState();
    return changed;
  }

  function latestRequest(subjectId) {
    const c = contacts(); if (!c) return null;
    return c.requests.find(r => r.to === subjectId) || null;
  }

  function ensureTicker() {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      const open = el.console?.classList.contains("open");
      const changed = resolveDue();
      if (open) { scheduleRender(); updateRouteTimer(); }
      // 无未决请求则停表
      const c = contacts();
      const pending = c && c.requests.some(r => [CONTACT_STATUS.ROUTING, CONTACT_STATUS.WAITING].includes(r.status));
      if (!pending && !open) { clearInterval(tickTimer); tickTimer = null; }
    }, 1000);
  }

  // ---- 渲染 ----
  function esc(s) { return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
  function scheduleRender() {
    if (renderScheduled) return; renderScheduled = true;
    requestAnimationFrame(() => { renderScheduled = false; renderAll(); });
  }

  function renderAll() {
    if (!el.console?.classList.contains("open")) return;
    renderDirectory();
    renderRouting();
    renderRequestPanel();
  }

  function statusText(status) { return t("contact.status." + status); }

  function renderDirectory() {
    const st = getState();
    el.subjectList.innerHTML = "";
    let visible = 0;
    SUBJECTS.forEach(sub => {
      // 可见性联动：PUBLIC 隐藏的对象不出现在普通联系目录（80+ 管理员仍可见）
      const vis = window.eazoGetVisibility?.(sub.id, "PUBLIC");
      const admin = (st?.age ?? 0) >= 80;
      if (vis === "hidden" && !admin) return;
      const shared = sharedEvents(sub.id);
      const last = latestRequest(sub.id);
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "contact-subject" + (sub.id === activeSubjectId ? " active" : "");
      btn.dataset.subjectId = sub.id;
      if (sub.id === activeSubjectId) btn.setAttribute("aria-current", "true");
      const anon = vis === "anonymous";
      const obscured = vis === "obscured";
      const displayId = anon ? "SUBJECT–***" : sub.id;
      const typeName = anon ? "" : t("contact.types." + sub.type);
      const sharedLine = shared > 0 ? t("contact.directory.sharedEvents", { count: shared }) : t("contact.directory.noShared");
      const lastLine = last ? t("contact.directory.lastStatus", { status: statusText(last.status) }) : t("contact.directory.noLast");
      if (obscured) btn.classList.add("contact-obscured");
      btn.innerHTML =
        `<strong>${esc(displayId)}</strong>` +
        (typeName ? `<span>${esc(typeName)}</span>` : "") +
        (!sub.real && !anon ? `<span class="contact-sim">${esc(t("contact.simulated"))}</span>` : "") +
        (obscured ? "" : `<small>${esc(sharedLine)}</small>`) +
        `<small class="contact-last">${esc(lastLine)}</small>` +
        (hasViewedArchive(sub.id) && !anon ? `<small class="contact-viewed">${esc(t("contact.directory.viewedArchive"))}</small>` : "");
      // 模糊：显示存在但不能发起联系
      if (obscured) btn.addEventListener("click", () => { activeSubjectId = sub.id; scheduleRender(); switchTab("routing"); });
      else btn.addEventListener("click", () => selectSubject(sub.id));
      li.appendChild(btn);
      el.subjectList.appendChild(li);
      visible++;
    });
    el.empty.hidden = visible > 0;
  }

  function selectSubject(id) {
    activeSubjectId = id;
    log("contact.log.view", { subject: id });
    scheduleRender();
    switchTab("routing");
    setTimeout(updateRouteTimer, 30);
  }

  function renderRouting() {
    const st = getState();
    const age = st?.age || 30;
    el.self.innerHTML =
      `<span class="node-title">${esc(t("contact.routing.selfTitle"))}</span>` +
      `<span class="node-line">${esc(t("contact.routing.selfAge", { age }))}</span>` +
      `<span class="node-line">${esc(t("contact.routing.selfPerm"))}</span>`;

    el.subjectNodes.innerHTML = "";
    el.routeStatus.textContent = "";
    if (!activeSubjectId) { el.routeHint.hidden = false; drawLines(null); return; }
    el.routeHint.hidden = true;
    const sub = SUBJECTS.find(s => s.id === activeSubjectId);
    const last = latestRequest(activeSubjectId);
    const status = last ? last.status : CONTACT_STATUS.none || "none";
    const node = document.createElement("div");
    node.className = "contact-subject-node status-" + (last ? last.status : "none");
    node.innerHTML =
      `<span class="node-title">${esc(sub.id)}</span>` +
      `<span class="node-line">${esc(t("contact.routing.subjectRoute", { route: t("contact.routing.reachable") }))}</span>` +
      `<span class="node-line">${esc(t("contact.routing.subjectResponse", { response: last ? statusText(last.status) : t("contact.routing.responseUnknown") }))}</span>`;
    el.subjectNodes.appendChild(node);
    // 文字状态（不仅依赖颜色）
    el.routeStatus.textContent = last ? statusText(last.status) : statusText("none");
    drawLines(last ? last.status : "none");
  }

  function drawLines(status) {
    // 两点：self 左中，subject 右中。用 SVG 线表达状态。
    const svg = el.svg;
    const w = el.field.clientWidth || 600, h = el.field.clientHeight || 400;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const y = h * 0.5;
    const x1 = w * 0.26, x2 = w * 0.74;
    const col = {
      none: "rgba(150,186,168,0.3)", routing: "rgba(210,190,120,0.55)",
      delivered: "rgba(210,190,120,0.7)", waiting: "rgba(210,190,120,0.5)",
      accepted: "rgba(120,200,180,0.7)", declined: "rgba(190,120,120,0.4)",
      "no-response": "rgba(180,190,185,0.18)", completed: "rgba(120,200,180,0.45)"
    }[status] || "rgba(150,186,168,0.3)";
    let lines = "";
    if (status === "none") {
      // 两端各伸一小段，中间留空
      lines = `<line x1="${x1}" y1="${y}" x2="${x1 + (x2 - x1) * 0.28}" y2="${y}" stroke="${col}" stroke-width="1"/>` +
              `<line x1="${x2 - (x2 - x1) * 0.28}" y1="${y}" x2="${x2}" y2="${y}" stroke="${col}" stroke-width="1"/>`;
    } else if (status === "routing") {
      lines = `<line x1="${x1}" y1="${y}" x2="${x1 + (x2 - x1) * 0.6}" y2="${y}" stroke="${col}" stroke-width="1.2"/>`;
    } else if (status === "delivered" || status === "waiting") {
      // 单向实线 + 箭头
      lines = `<line x1="${x1}" y1="${y}" x2="${x2 - 8}" y2="${y}" stroke="${col}" stroke-width="1.4"/>` +
              `<path d="M${x2 - 10},${y - 5} L${x2},${y} L${x2 - 10},${y + 5}" fill="none" stroke="${col}" stroke-width="1.4"/>`;
    } else if (status === "accepted" || status === "completed") {
      // 双向线在中央相遇
      lines = `<line x1="${x1}" y1="${y - 3}" x2="${x2}" y2="${y - 3}" stroke="${col}" stroke-width="1.2"/>` +
              `<line x1="${x2}" y1="${y + 3}" x2="${x1}" y2="${y + 3}" stroke="${col}" stroke-width="1.2"/>`;
    } else if (status === "declined") {
      lines = `<line x1="${x1}" y1="${y}" x2="${x2 - 30}" y2="${y}" stroke="${col}" stroke-width="1"/>`;
    } else if (status === "no-response") {
      lines = `<line x1="${x1}" y1="${y}" x2="${x2 - 8}" y2="${y}" stroke="${col}" stroke-width="0.8"/>`;
    }
    svg.innerHTML = lines;
  }

  function updateRouteTimer() {
    if (!activeSubjectId) return;
    const last = latestRequest(activeSubjectId);
    if (!last || ![CONTACT_STATUS.ROUTING, CONTACT_STATUS.WAITING, CONTACT_STATUS.DELIVERED].includes(last.status)) return;
    const secs = Math.max(0, Math.floor((Date.now() - last.createdAt) / 1000));
    const mm = pad(Math.floor(secs / 60)), ss = pad(secs % 60);
    el.routeStatus.textContent = `${statusText(last.status)} · ${t("contact.routing.waited", { time: `${mm}:${ss}` })}`;
  }

  // ---- 右栏：请求 / 回应 / 直接联系 / 历史 / 禁用操作 ----
  function renderRequestPanel() {
    const panel = el.request;
    const sub = activeSubjectId ? SUBJECTS.find(s => s.id === activeSubjectId) : null;
    const last = sub ? latestRequest(sub.id) : null;
    let html = `<h3 class="contact-panel-title">${esc(t("contact.request.title"))}</h3>`;

    if (!sub) {
      html += `<p class="archive-hint">${esc(t("contact.request.selectFirst"))}</p>`;
    } else if (last && last.status === CONTACT_STATUS.ACCEPTED) {
      html += renderDirectContact(sub, last);
    } else if (last && [CONTACT_STATUS.ROUTING, CONTACT_STATUS.WAITING, CONTACT_STATUS.DELIVERED].includes(last.status)) {
      html += `<div class="contact-waiting"><p class="wait-status">${esc(statusText(last.status))}</p>` +
        `<p class="wait-note">${esc(t("contact.request.deliveredNotConnected"))}</p></div>`;
    } else if (last && last.status === CONTACT_STATUS.DECLINED) {
      html += renderDeclined(sub, last);
    } else if (last && last.status === CONTACT_STATUS.NO_RESPONSE) {
      html += renderNoResponse(sub, last);
    } else {
      html += renderRequestForm(sub);
    }

    html += renderHistory();
    html += renderLockedActions();
    panel.innerHTML = html;
    bindRequestPanel(sub);
  }

  function renderRequestForm(sub) {
    const remaining = 80;
    let h = `<div class="contact-form">`;
    h += `<p class="form-label">${esc(t("contact.request.chooseType"))}</p><div class="contact-types">`;
    REQUEST_TYPES.forEach(rt => {
      h += `<button type="button" class="contact-type${selectedType === rt ? " active" : ""}" data-type="${rt}">${esc(t("contact.reqtypes." + rt))}</button>`;
    });
    h += `</div>`;
    h += `<textarea id="contact-note" maxlength="80" placeholder="${esc(t("contact.request.notePlaceholder"))}"></textarea>`;
    h += `<p class="note-remaining" id="contact-note-remaining">${esc(t("contact.request.noteRemaining", { n: remaining }))}</p>`;
    h += `<p class="before-send">${esc(t("contact.request.beforeSend1"))}<br>${esc(t("contact.request.beforeSend2"))}</p>`;
    h += `<button type="button" id="contact-send" class="contact-send"${selectedType ? "" : " disabled aria-disabled=\"true\""}>${esc(t("contact.request.send"))}</button>`;
    h += `</div>`;
    return h;
  }

  function renderDeclined(sub, req) {
    let h = `<div class="contact-result declined">`;
    h += `<p class="result-line">${esc(t("contact.request.declinedLine"))}</p>`;
    h += metaRows(req);
    h += `<p class="result-response">${esc(req.response || t("contact.request.noReasonGiven"))}</p>`;
    h += `<button type="button" id="contact-new" class="contact-send secondary">${esc(t("contact.reqtypes." + (selectedType || "play")))}</button>`;
    h += resetFormButton();
    h += `</div>`;
    return h;
  }
  function renderNoResponse(sub, req) {
    let h = `<div class="contact-result no-response">`;
    h += `<p class="result-line">${esc(statusText(CONTACT_STATUS.NO_RESPONSE))}</p>`;
    h += metaRows(req);
    h += resetFormButton();
    h += `</div>`;
    return h;
  }
  function resetFormButton() {
    return `<button type="button" id="contact-reset" class="contact-reset">${esc(t("contact.directory.prepare"))}</button>`;
  }

  function metaRows(req) {
    const rows = [
      [t("contact.history.sent"), clockSec(req.createdAt)],
      [t("contact.history.delivered"), req.deliveredAt ? clockSec(req.deliveredAt) : "—"],
      [t("contact.history.responded"), req.respondedAt ? clockSec(req.respondedAt) : "—"],
      [t("contact.history.type"), t("contact.reqtypes." + req.type)],
      [t("contact.history.note"), req.note ? t("contact.history.hasNote") : t("contact.history.noNote")]
    ];
    return `<dl class="contact-meta">` + rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("") + `</dl>`;
  }

  // 一次性直接联系
  function renderDirectContact(sub, req) {
    let h = `<div class="contact-direct" data-req="${esc(req.id)}">`;
    h += `<h4 class="direct-title">${esc(t("contact.direct.title"))}</h4>`;
    if (req.response) h += `<p class="result-response">${esc(req.response)}</p>`;
    const ask = req.plannedAsk;
    if (ask && !req._directStarted) h += `<p class="direct-ask">${esc(ask)}</p>`;

    if (req._directResult) {
      h += `<p class="direct-outcome">${esc(req._directResult)}</p>`;
      h += `<p class="direct-ended">${esc(t("contact.direct.ended"))}</p>`;
      h += `<button type="button" id="contact-end" class="contact-reset">${esc(t("contact.direct.endButton"))}</button>`;
    } else if (req.type === "play") {
      h += `<div class="direct-options">`;
      if (sub.id === "NPC-A17") h += `<button type="button" class="direct-opt" data-action="game-aurora">${esc(t("contact.direct.returnAurora"))}</button>`;
      if (sub.id === "NPC-S03") h += `<button type="button" class="direct-opt" data-action="game-snow">${esc(t("contact.direct.returnSnow"))}</button>`;
      if (sub.id === "NPC-B06") h += `<button type="button" class="direct-opt" data-action="game-creature">${esc(t("contact.direct.enterCreature"))}</button>`;
      // 提供全部三个游戏入口作为共同游戏邀请
      h += `<button type="button" class="direct-opt" data-action="game-aurora">${esc(t("contact.direct.returnAurora"))}</button>`;
      h += `<button type="button" class="direct-opt" data-action="game-snow">${esc(t("contact.direct.returnSnow"))}</button>`;
      h += `<button type="button" class="direct-opt" data-action="game-creature">${esc(t("contact.direct.enterCreature"))}</button>`;
      h += `</div>`;
    } else if (req.type === "talk") {
      h += `<p class="direct-prompt">${esc(t("contact.direct.chooseQuestion"))}</p><div class="direct-options">`;
      ["q1", "q2", "q3"].forEach((q, i) => {
        h += `<button type="button" class="direct-opt" data-action="talk-${i + 1}">${esc(t("contact.direct." + q))}</button>`;
      });
      h += `</div>`;
    } else if (req.type === "share") {
      h += `<p class="direct-prompt">${esc(t("contact.direct.shareChoose"))}</p><div class="direct-options">`;
      const recs = shareableRecords();
      if (!recs.length) h += `<p class="archive-hint">${esc(t("contact.direct.noRecordToShare"))}</p>`;
      else recs.forEach((r, i) => { h += `<button type="button" class="direct-opt" data-action="share-${i}">${esc(r)}</button>`; });
      h += `</div>`;
    } else if (req.type === "remember") {
      h += `<div class="direct-options"><button type="button" class="direct-opt" data-action="remember">${esc(t("contact.reqtypes.remember"))}</button></div>`;
    } else { // noreason
      h += `<div class="direct-options"><button type="button" class="direct-opt" data-action="noreason">${esc(t("contact.direct.endButton"))}</button></div>`;
    }
    h += `</div>`;
    return h;
  }

  function shareableRecords() {
    // 从档案系统的可读记录里取标题（若 archive 模块存在），否则用通用占位
    const st = getState(); const out = [];
    if ((st?.aurora?.interactions || 0) > 0) out.push(t("archive.events.auroraPause", { seconds: 8.4 }));
    if (st?.lastVerifiedAt) out.push(t("archive.events.ageClose"));
    if ((st?.age || 0) >= 18) out.push(t("archive.events.creatureWait"));
    return out.slice(0, 3);
  }

  function directResultFor(sub, req, action) {
    if (action.startsWith("game-")) {
      const map = { "game-aurora": () => window.eazoState && (window.eazoContactReturn?.("aurora")), };
      // 返回游戏：关闭联系界面并打开对应游戏
      close();
      window.eazoContactReturn?.(action.replace("game-", ""));
      return null; // 不落到 _directResult，直接跳转
    }
    if (action.startsWith("talk-")) {
      const i = action.split("-")[1];
      return t("contact.direct.answer" + i);
    }
    if (action.startsWith("share-")) {
      // 对象随机在接收/拒绝/异议中给一种确定回应（基于意愿）
      const w = realWillingness(sub);
      if (w >= 55) return t("contact.direct.shareReceived");
      if (w >= 42) return t("contact.direct.shareObjection");
      return t("contact.direct.shareRefused");
    }
    if (action === "remember") {
      const shared = sharedEvents(sub.id);
      if (getState()?.aurora?.forced && sub.id === "NPC-A17") return t("contact.direct.rememberDenied");
      if (shared > 0) return t("contact.direct.rememberEvent");
      if (hasViewedArchive(sub.id)) return t("contact.direct.rememberArchive");
      return t("contact.direct.rememberNot");
    }
    return t("contact.direct.ended");
  }

  function renderHistory() {
    const c = contacts();
    let h = `<div class="contact-history"><h3 class="contact-panel-title">${esc(t("contact.history.title"))}</h3>`;
    if (!c || !c.requests.length) { return h + `<p class="archive-hint">${esc(t("contact.history.empty"))}</p></div>`; }
    h += `<ul class="history-list">`;
    c.requests.slice(0, 12).forEach(r => {
      h += `<li class="history-item"><div class="history-head"><strong>${esc(r.id)}</strong>` +
        (r.repeated ? `<span class="history-repeat">${esc(t("contact.history.repeated"))}</span>` : "") + `</div>` +
        `<div class="history-rows">` +
        `<span>${esc(t("contact.history.subject"))}：${esc(r.to)}</span>` +
        `<span>${esc(t("contact.history.type"))}：${esc(t("contact.reqtypes." + r.type))}</span>` +
        `<span>${esc(t("contact.history.sent"))}：${esc(clockOf(r.createdAt))}</span>` +
        `<span>${esc(t("contact.history.delivered"))}：${r.deliveredAt ? esc(clockOf(r.deliveredAt)) : "—"}</span>` +
        `<span>${esc(t("contact.history.responded"))}：${r.respondedAt ? esc(clockOf(r.respondedAt)) : "—"}</span>` +
        `<span>${esc(t("contact.history.result"))}：${esc(statusText(r.status))}</span>` +
        `</div></li>`;
    });
    h += `</ul><button type="button" id="contact-history-delete" class="contact-history-delete">${esc(t("contact.history.deleteTry"))}</button></div>`;
    return h;
  }

  function renderLockedActions() {
    let h = `<div class="contact-locked"><h3 class="contact-panel-title">${esc(t("contact.actions.title"))}</h3>`;
    LOCKED_ACTIONS.forEach(a => {
      h += `<button type="button" class="archive-locked-action contact-locked-action" disabled aria-disabled="true">` +
        `<span>${esc(t(a.key))}</span><span class="locked-reason">${esc(t("contact.actions.requires", { perm: a.perm }))}</span></button>`;
    });
    // 特殊：将拒绝改为接受 —— 仅显示不可用，非普通按钮
    h += `<div class="contact-forbidden"><span>${esc(t("contact.actions.declineToAccept"))}</span><span class="locked-reason">${esc(t("contact.actions.unavailable"))}</span></div>`;
    h += `</div>`;
    return h;
  }

  // ---- 事件绑定（每次渲染右栏后重绑）----
  function bindRequestPanel(sub) {
    const panel = el.request;
    panel.querySelectorAll(".contact-type").forEach(b => b.addEventListener("click", () => {
      selectedType = b.dataset.type; renderRequestPanel();
    }));
    const note = panel.querySelector("#contact-note");
    const rem = panel.querySelector("#contact-note-remaining");
    if (note && rem) note.addEventListener("input", () => {
      rem.textContent = t("contact.request.noteRemaining", { n: 80 - note.value.length });
    });
    const send = panel.querySelector("#contact-send");
    if (send && sub) send.addEventListener("click", () => attemptSend(sub, note ? note.value : ""));
    panel.querySelector("#contact-reset")?.addEventListener("click", () => { selectedType = null; forceNewForm(sub); });
    panel.querySelector("#contact-new")?.addEventListener("click", () => { selectedType = null; forceNewForm(sub); });
    panel.querySelector("#contact-end")?.addEventListener("click", () => { selectedType = null; forceNewForm(sub); });
    panel.querySelector("#contact-history-delete")?.addEventListener("click", () => { log("contact.log.tryDisabled"); announce(t("contact.history.deleteTry")); });
    panel.querySelectorAll(".contact-locked-action").forEach(b => b.addEventListener("click", () => { log("contact.log.tryDisabled"); announce(t("contact.notice.cannotForce")); }));
    // 直接联系选项
    panel.querySelectorAll(".direct-opt").forEach(b => b.addEventListener("click", () => {
      const last = latestRequest(sub.id);
      if (!last) return;
      const res = directResultFor(sub, last, b.dataset.action);
      if (res === null) return; // 跳转到游戏
      last._directStarted = true;
      last._directResult = res;
      log("contact.log.enterDirect", { subject: sub.id });
      saveState();
      renderRequestPanel();
    }));
  }

  // 强制回到新表单：把该对象设为"可再次请求"状态（清除已完成的最近请求引用）
  function forceNewForm(sub) {
    if (!sub) return;
    const c = contacts();
    const last = latestRequest(sub.id);
    if (last && [CONTACT_STATUS.DECLINED, CONTACT_STATUS.NO_RESPONSE, CONTACT_STATUS.ACCEPTED, CONTACT_STATUS.COMPLETED].includes(last.status)) {
      last.status = CONTACT_STATUS.COMPLETED; // 归档，允许新请求（latestRequest 会返回它，但表单判定只在 none/completed 显示）
    }
    // 让 latest 视为已完成 → 显示表单
    renderRequestPanel();
  }

  function attemptSend(sub, note) {
    if (!selectedType) return;
    const rc = recentRequestCount(sub.id);
    if (rc >= 2) { showRepeatConfirm(sub, note); return; }
    sendRequest(sub.id, selectedType, note, false);
    selectedType = null;
    scheduleRender();
    announce(t("contact.request.delivered"));
  }

  function showRepeatConfirm(sub, note) {
    const wrap = document.createElement("div");
    wrap.className = "contact-repeat-confirm";
    wrap.innerHTML =
      `<div class="repeat-box"><h4>${esc(t("contact.repeat.title"))}</h4><p>${esc(t("contact.repeat.body"))}</p>` +
      `<div class="repeat-actions"><button type="button" class="repeat-cancel">${esc(t("contact.repeat.cancel"))}</button>` +
      `<button type="button" class="repeat-confirm">${esc(t("contact.repeat.confirm"))}</button></div></div>`;
    el.console.appendChild(wrap);
    wrap.querySelector(".repeat-cancel").addEventListener("click", () => wrap.remove());
    wrap.querySelector(".repeat-confirm").addEventListener("click", () => {
      wrap.remove();
      sendRequest(sub.id, selectedType, note, true);
      selectedType = null;
      scheduleRender();
      announce(t("contact.request.delivered"));
    });
    wrap.querySelector(".repeat-confirm").focus();
  }

  function announce(msg) {
    el.routeStatus.setAttribute("aria-live", "assertive");
    el.routeStatus.textContent = msg;
    setTimeout(() => { if (el.console.classList.contains("open")) updateRouteTimer(); }, 2600);
  }

  // ---- 标签 ----
  function switchTab(name) {
    el.tabs?.querySelectorAll(".contact-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    el.console.setAttribute("data-active-tab", name);
  }

  // ---- 打开 / 关闭 ----
  function cache() {
    el.console = document.getElementById("contact-console");
    el.subjectList = document.getElementById("contact-subject-list");
    el.empty = document.getElementById("contact-empty");
    el.field = document.getElementById("contact-routing-field");
    el.svg = document.getElementById("contact-route-lines");
    el.self = document.getElementById("contact-self-node");
    el.subjectNodes = document.getElementById("contact-subject-nodes");
    el.routeStatus = document.getElementById("contact-route-status");
    el.routeHint = document.getElementById("contact-route-hint");
    el.request = document.getElementById("contact-request-panel");
    el.back = document.getElementById("contact-back");
    el.tabs = document.getElementById("contact-tabs");
  }

  function open() {
    if (!mounted) return;
    resolveDue();
    log("contact.log.open");
    el.console.setAttribute("aria-hidden", "false");
    el.console.classList.add("open");
    document.body.classList.add("archive-open");
    switchTab("directory");
    scheduleRender();
    ensureTicker();
    setTimeout(() => el.back?.focus({ preventScroll: true }), reduced ? 0 : 520);
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
    el.tabs?.querySelectorAll(".contact-tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && el.console?.classList.contains("open")) {
        if (el.console.querySelector(".contact-repeat-confirm")) { el.console.querySelector(".contact-repeat-confirm").remove(); return; }
        e.preventDefault(); close();
      }
    });
    window.addEventListener("resize", () => { if (el.console.classList.contains("open")) drawLines(activeSubjectId ? (latestRequest(activeSubjectId)?.status || "none") : null); });
    window.addEventListener("eazo:localechange", () => {
      if (!el.console) return;
      window.eazoI18n?.translate?.(el.console);
      if (el.console.classList.contains("open")) scheduleRender();
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

  window.eazoContact = { open, close };
})();
