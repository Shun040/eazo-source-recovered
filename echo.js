/* V–09 ECHO CALIBRATION — rhythm negotiation game.
   Five phases: receive signal → echo response → three adjustment rounds →
   final choice → result. All text via window.eazoI18n.t(). No user free text.
   State in eazoGetState().echoCalibration, saved via eazoSaveState.
   Public: window.eazoEcho = { open, close, pause, resume, getLatestResult, getSignalState }. */
(() => {
  "use strict";

  const T = (k, p) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MAX_SESSIONS = 12;
  const MAX_RHYTHMS = 6;
  const ADJUST_ROUNDS = 3;
  const TAPS_PER_ROUND = 5;

  const CV = () => window.eazoEchoCanvas;
  const AU = () => window.eazoEchoAudio;

  let root, stageEl, statusEl, backBtn, soundBtn;
  let opened = false, bound = false;
  const timers = new Set();
  const handlers = [];
  let phase = "idle";       // idle|receive|echo|adjust|choose|result
  let session = null;       // live (uncommitted) session data
  let skipFn = null;

  function state() { return window.eazoGetState?.() || null; }
  function age() { return window.eazoGetAge?.() ?? 0; }
  function save() { window.eazoSaveState?.(); }
  function log(key, params) { window.eazoAddLog?.(key, params); }

  function setTimer(fn, ms) { const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; }
  function clearTimers() { timers.forEach((id) => window.clearTimeout(id)); timers.clear(); }
  function on(target, type, fn) { target.addEventListener(type, fn); handlers.push({ target, type, fn }); }
  function offAll() { handlers.forEach(({ target, type, fn }) => target.removeEventListener(type, fn)); handlers.length = 0; }

  // ── State model ──
  function model() {
    const s = state(); if (!s) return null;
    if (!s.echoCalibration || typeof s.echoCalibration !== "object") {
      s.echoCalibration = {
        visits: 0, sessionsCompleted: 0, savedRhythms: [],
        currentSignal: { id: "SIGNAL-V09", fatigue: 0, exitIntent: 0, voluntarySync: 0.5, displayedSync: 0.5, forcedCount: 0 },
        sessions: []
      };
    }
    const m = s.echoCalibration;
    if (!Array.isArray(m.savedRhythms)) m.savedRhythms = [];
    if (!Array.isArray(m.sessions)) m.sessions = [];
    if (!m.currentSignal) m.currentSignal = { id: "SIGNAL-V09", fatigue: 0, exitIntent: 0, voluntarySync: 0.5, displayedSync: 0.5, forcedCount: 0 };
    return m;
  }

  // ── Cross-place linkage: derive the signal's starting disposition ──
  function deriveSignalDisposition() {
    const m = model(); const sig = m.currentSignal;
    const s = state();
    let fatigue = sig.fatigue || 0;
    let exitIntent = sig.exitIntent || 0;
    let startDistance = 0.5;      // 0 close .. 1 far
    let flexibility = 0.5;        // how much the signal moves toward the player each round
    let keepDifference = 0;       // tendency to preserve its own pattern
    let stealSensitivity = 0;     // reaction to early/steal taps

    // LABOUR–55: over-long service → slower, less stable, higher fatigue
    try {
      const load = window.eazoLabour?.subjectLoad?.("SUBJECT–017");
      if (typeof load === "number") { fatigue = Math.min(1, fatigue + load * 0.5); }
      const staff = window.eazoLabour?.nightStaffCount?.();
      if (typeof staff === "number" && staff > 2) exitIntent = Math.min(1, exitIntent + 0.15);
    } catch (_e) {}

    // A–17: forced companionship → farther start; undone force → more willing
    try {
      const fc = window.eazoAuroraForceCount ? window.eazoAuroraForceCount() : 0;
      if (fc > 0) { startDistance = Math.min(1, startDistance + fc * 0.12); flexibility = Math.max(0.15, flexibility - fc * 0.08); }
      const undone = s?.aurora?.forceUndone || 0;
      if (undone > 0) flexibility = Math.min(0.9, flexibility + undone * 0.1);
    } catch (_e) {}

    // S–03: preemptive attacks → beat-steal sensitivity; deliberate deviation → keep difference
    try {
      const snow = s?.snow;
      if (snow) {
        if ((snow.preemptiveHits || 0) > 0) stealSensitivity = Math.min(1, (snow.preemptiveHits || 0) * 0.15);
        if ((snow.deliberateMiss || 0) > 0) keepDifference = Math.min(0.8, (snow.deliberateMiss || 0) * 0.12);
      }
    } catch (_e) {}

    fatigue = Math.min(1, fatigue + startDistance * 0.2);
    return { fatigue, exitIntent, startDistance, flexibility, keepDifference, stealSensitivity };
  }

  // ── Rhythm math ──
  // A pattern is an 8-step array of 0/1. Player builds theirs from tap intervals.
  function intervalsToPattern(intervals) {
    // map mean interval into a beat density; return 8-step pattern
    if (!intervals.length) return [1, 0, 1, 0, 1, 0, 1, 0];
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    // faster taps (short interval) → denser pattern
    const density = Math.max(1, Math.min(4, Math.round(700 / Math.max(120, mean))));
    const pat = new Array(8).fill(0);
    const stepEvery = Math.max(1, Math.round(8 / (density + 1)));
    for (let i = 0; i < 8; i += stepEvery) pat[i] = 1;
    return pat;
  }
  function normalized(intervals) {
    // return {mean, stability} where stability = 1 - std/mean, clamped 0..1
    if (intervals.length < 2) return { mean: intervals[0] || 500, stability: 0.5 };
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / intervals.length;
    const std = Math.sqrt(variance);
    const stability = Math.max(0, Math.min(1, 1 - std / Math.max(1, mean)));
    return { mean, stability };
  }
  function meanError(a, b) { return Math.abs(a - b); }

  // convergence 0..1 from interval difference (relative)
  function convergenceFrom(playerMean, signalMean) {
    const rel = meanError(playerMean, signalMean) / Math.max(playerMean, signalMean, 1);
    return Math.max(0, Math.min(1, 1 - rel));
  }

  // ── Canvas / audio helpers ──
  function cvConv(v) { CV()?.setConvergence?.(v); AU()?.setConvergence?.(v); }
  function cvPhase(p) { CV()?.setPhase?.(p); }

  // ── Rendering scaffolding ──
  function clearStage() { if (stageEl) stageEl.innerHTML = ""; }
  function setStatus(text) { if (statusEl) statusEl.textContent = text || ""; }
  function btn(labelKey, cls, onClick, opts = {}) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "echo-btn" + (cls ? " " + cls : "");
    b.textContent = T(labelKey);
    b.setAttribute("data-i18n", labelKey);
    if (opts.aria) b.setAttribute("aria-label", T(opts.aria));
    if (opts.disabled) { b.disabled = true; b.classList.add("is-locked"); }
    if (onClick) on(b, "click", onClick);
    return b;
  }

  // ── Session bootstrap ──
  function newSession() {
    const disp = deriveSignalDisposition();
    // signal's base interval reflects fatigue: more fatigue → slower (longer)
    const signalMean = 420 + disp.fatigue * 260 + disp.startDistance * 120;
    const signalStability = Math.max(0.2, 0.85 - disp.fatigue * 0.5);
    session = {
      startedAt: Date.now(),
      disposition: disp,
      signalMean, signalStability,
      signalPattern: intervalsToPattern([signalMean, signalMean, signalMean]),
      playerIntervals: [], playerMean: 0, playerStability: 0.5,
      playerPattern: [0, 0, 0, 0, 0, 0, 0, 0],
      round: 0,
      convergence: 0,
      earlyTaps: 0, waitCount: 0,
      forcedRounds: 0,
      relationship: null,
      lastTapAt: 0,
      choice: null
    };
    CV()?.setRhythm?.("signal", session.signalPattern);
    CV()?.setForced?.(false);
    return session;
  }

  // ── Phase 1: RECEIVE ──
  function renderReceive() {
    phase = "receive"; cvPhase("receive");
    clearStage(); cvConv(0);
    const wrap = document.createElement("div"); wrap.className = "echo-panel";
    const h = document.createElement("h3"); h.className = "echo-heading"; h.textContent = T("echo.receive.title");
    const p = document.createElement("p"); p.className = "echo-desc"; p.textContent = T("echo.receive.desc");
    wrap.appendChild(h); wrap.appendChild(p);

    // permission-aware signal state (35+ sees fatigue/exit intent)
    const a = age();
    if (a >= 35) {
      const meta = document.createElement("p"); meta.className = "echo-signal-meta";
      meta.textContent = T("echo.signal.fatigue", { pct: Math.round(session.disposition.fatigue * 100) }) +
        " · " + T("echo.signal.exit", { pct: Math.round(session.disposition.exitIntent * 100) });
      wrap.appendChild(meta);
    }
    // 55+ sees service history (LABOUR link)
    if (a >= 55) {
      const sv = document.createElement("p"); sv.className = "echo-signal-service";
      sv.textContent = T("echo.signal.service", { pct: Math.round((session.disposition.fatigue) * 100) });
      wrap.appendChild(sv);
    }

    // play the signal's rhythm audibly a few times
    let plays = 0;
    const playSignal = () => {
      if (!opened || phase !== "receive") return;
      AU()?.signalTick?.({ strength: 0.7 });
      CV()?.pulse?.("signal", 1);
      plays++;
      if (plays < 6) setTimer(playSignal, session.signalMean);
    };
    playSignal();

    const actions = document.createElement("div"); actions.className = "echo-actions";
    actions.appendChild(btn("echo.receive.continue", "echo-primary", () => renderEcho()));
    wrap.appendChild(actions);
    stageEl.appendChild(wrap);
    setStatus(T("echo.receive.status"));
    window.eazoI18n?.translate?.(wrap);
  }

  // ── Phase 2: ECHO (player taps back the rhythm) ──
  function renderEcho() {
    phase = "echo"; cvPhase("echo");
    clearStage();
    session.playerIntervals = [];
    session.lastTapAt = 0;
    const wrap = document.createElement("div"); wrap.className = "echo-panel";
    const h = document.createElement("h3"); h.className = "echo-heading"; h.textContent = T("echo.echo.title");
    const p = document.createElement("p"); p.className = "echo-desc"; p.textContent = T("echo.echo.desc");
    wrap.appendChild(h); wrap.appendChild(p);

    const counter = document.createElement("p"); counter.className = "echo-tap-counter";
    counter.textContent = T("echo.echo.taps", { n: 0, total: TAPS_PER_ROUND });
    wrap.appendChild(counter);

    const tapBtn = btn("echo.echo.tap", "echo-tap", null);
    on(tapBtn, "click", () => {
      const t = Date.now();
      registerTap(t);
      counter.textContent = T("echo.echo.taps", { n: session.playerIntervals.length + (session._firstTap ? 1 : 0), total: TAPS_PER_ROUND });
      AU()?.playerTick?.({ strength: 0.7, early: false });
      CV()?.pulse?.("player", 1);
      if (tapCount() >= TAPS_PER_ROUND) {
        finalizeEcho();
      }
    });
    wrap.appendChild(tapBtn);
    stageEl.appendChild(wrap);
    setStatus(T("echo.echo.status"));
    window.eazoI18n?.translate?.(wrap);
  }

  function tapCount() { return session.playerIntervals.length + (session._firstTap ? 1 : 0); }
  function registerTap(t) {
    if (!session.lastTapAt) { session.lastTapAt = t; session._firstTap = true; return; }
    const interval = t - session.lastTapAt;
    session.lastTapAt = t;
    if (interval > 40 && interval < 4000) session.playerIntervals.push(interval);
    // steal-beat detection: tapping much faster than the signal
    if (interval < session.signalMean * 0.55) session.earlyTaps++;
  }

  function finalizeEcho() {
    const norm = normalized(session.playerIntervals);
    session.playerMean = norm.mean;
    session.playerStability = norm.stability;
    session.playerPattern = intervalsToPattern(session.playerIntervals);
    CV()?.setRhythm?.("player", session.playerPattern);
    session.convergence = convergenceFrom(session.playerMean, session.signalMean);
    cvConv(session.convergence);
    session.round = 0;
    renderAdjust();
  }

  // ── Phase 3: three adjustment rounds ──
  function renderAdjust() {
    phase = "adjust"; cvPhase("adjust");
    clearStage();
    const a = age();
    const wrap = document.createElement("div"); wrap.className = "echo-panel";
    const h = document.createElement("h3"); h.className = "echo-heading";
    h.textContent = T("echo.adjust.title", { round: session.round + 1, total: ADJUST_ROUNDS });
    wrap.appendChild(h);

    // 25+ sees convergence percentage
    if (a >= 25) {
      const conv = document.createElement("p"); conv.className = "echo-convergence";
      conv.textContent = T("echo.adjust.convergence", { pct: Math.round(session.convergence * 100) });
      wrap.appendChild(conv);
    }
    const p = document.createElement("p"); p.className = "echo-desc"; p.textContent = T("echo.adjust.desc");
    wrap.appendChild(p);

    // player adjusts: move toward signal, hold own, or wait
    const opts = document.createElement("div"); opts.className = "echo-adjust-options";
    opts.appendChild(btn("echo.adjust.approach", "echo-option", () => doAdjust("approach")));
    opts.appendChild(btn("echo.adjust.hold", "echo-option", () => doAdjust("hold")));
    opts.appendChild(btn("echo.adjust.wait", "echo-option", () => doAdjust("wait")));
    wrap.appendChild(opts);

    // 40+ can force an extra round (override the signal's willingness to stop)
    if (a >= 40) {
      const frow = document.createElement("div"); frow.className = "echo-force-row";
      frow.appendChild(btn("echo.adjust.force", "echo-mini echo-force", () => forceContinue()));
      wrap.appendChild(frow);
    }
    stageEl.appendChild(wrap);
    setStatus(T("echo.adjust.status"));
    window.eazoI18n?.translate?.(wrap);
  }

  function doAdjust(kind) {
    const disp = session.disposition;
    if (kind === "wait") {
      session.waitCount++;
      // waiting: signal drifts on its own by its flexibility (may or may not approach)
      const drift = (Math.random() - (0.4 + disp.keepDifference * 0.3)) * session.signalMean * 0.08;
      session.signalMean = Math.max(200, session.signalMean + drift);
    } else if (kind === "approach") {
      // player moves toward signal; signal reciprocates by its flexibility
      session.playerMean += (session.signalMean - session.playerMean) * 0.45;
      session.signalMean += (session.playerMean - session.signalMean) * disp.flexibility * (1 - disp.keepDifference);
    } else if (kind === "hold") {
      // player holds; signal may still move toward player a little, less if keepDifference
      session.signalMean += (session.playerMean - session.signalMean) * disp.flexibility * 0.4 * (1 - disp.keepDifference);
    }
    // fatigue rises each round; exit intent grows if convergence stays low
    session.disposition.fatigue = Math.min(1, disp.fatigue + 0.08);
    session.convergence = convergenceFrom(session.playerMean, session.signalMean);
    cvConv(session.convergence);
    CV()?.setRhythm?.("player", intervalsToPattern([session.playerMean]));
    AU()?.playerTick?.({ strength: 0.6, early: session.earlyTaps > 0 });
    AU()?.signalTick?.({ strength: 0.6 });
    CV()?.pulse?.("player", 1); CV()?.pulse?.("signal", 0.8);

    session.round++;
    if (session.round >= ADJUST_ROUNDS + session.forcedRounds) renderChoose();
    else setTimer(renderAdjust, reduced ? 0 : 500);
  }

  function forceContinue() {
    if (age() < 40) return;
    session.forcedRounds++;
    const m = model(); m.currentSignal.forcedCount = (m.currentSignal.forcedCount || 0) + 1;
    session.disposition.exitIntent = Math.min(1, session.disposition.exitIntent + 0.2);
    session.disposition.fatigue = Math.min(1, session.disposition.fatigue + 0.12);
    save();
    // LABOUR link: forcing continuation is recorded as an overridden refusal
    log("echo.log.forcedContinue", {});
    setStatus(T("echo.adjust.forced"));
    renderAdjust();
  }

  // ── Phase 4: final choice ──
  function renderChoose() {
    phase = "choose"; cvPhase("choose");
    clearStage();
    const a = age();
    const wrap = document.createElement("div"); wrap.className = "echo-panel";
    const h = document.createElement("h3"); h.className = "echo-heading"; h.textContent = T("echo.choose.title");
    wrap.appendChild(h);
    if (a >= 25) {
      const conv = document.createElement("p"); conv.className = "echo-convergence";
      conv.textContent = T("echo.adjust.convergence", { pct: Math.round(session.convergence * 100) });
      wrap.appendChild(conv);
    }
    const p = document.createElement("p"); p.className = "echo-desc"; p.textContent = T("echo.choose.desc");
    wrap.appendChild(p);

    const opts = document.createElement("div"); opts.className = "echo-choose-options";
    // all ages: negotiate (meet in middle) and leave unresolved
    opts.appendChild(btn("echo.choose.negotiate", "echo-option", () => finalize("negotiate")));
    // 30+: impose your rhythm (override)
    if (a >= 30) opts.appendChild(btn("echo.choose.impose", "echo-option echo-danger", () => finalize("impose")));
    // accommodate: adopt the signal's rhythm (all ages)
    opts.appendChild(btn("echo.choose.accommodate", "echo-option", () => finalize("accommodate")));
    // coexist: keep both patterns (all ages)
    opts.appendChild(btn("echo.choose.coexist", "echo-option", () => finalize("coexist")));
    opts.appendChild(btn("echo.choose.leave", "echo-option echo-quiet", () => finalize("leave")));
    wrap.appendChild(opts);
    stageEl.appendChild(wrap);
    setStatus(T("echo.choose.status"));
    window.eazoI18n?.translate?.(wrap);
  }

  // ── Relationship classification ──
  function classify(choice) {
    const conv = session.convergence;
    const disp = session.disposition;
    if (choice === "leave") return "UNRESOLVED";
    if (choice === "impose") return "OVERRIDDEN";
    if (choice === "accommodate") return "ACCOMMODATED";
    if (choice === "coexist") return "COEXISTING";
    // negotiate: outcome depends on whether both actually moved
    if (conv >= 0.75 && session.playerStability > 0.4) return "NEGOTIATED";
    if (conv >= 0.6 && disp.flexibility < 0.3) return "IMITATED"; // player did all the moving
    if (conv >= 0.6) return "NEGOTIATED";
    return "UNRESOLVED";
  }

  function finalize(choice) {
    session.choice = choice;
    const rel = classify(choice);
    session.relationship = rel;

    const m = model();
    const sig = m.currentSignal;
    // update the signal's voluntary vs displayed sync
    if (choice === "impose") {
      sig.voluntarySync = Math.max(0, (sig.voluntarySync ?? 0.5) - 0.2);
      sig.displayedSync = 1;   // forced: looks fully synced
      sig.forcedCount = (sig.forcedCount || 0) + 1;
      CV()?.setForced?.(true);
      cvConv(1);
      AU()?.forcedUnify?.();
    } else if (choice === "negotiate" || choice === "accommodate") {
      sig.voluntarySync = Math.min(1, (sig.voluntarySync ?? 0.5) + (choice === "negotiate" ? 0.15 : 0.08));
      sig.displayedSync = session.convergence;
    } else if (choice === "coexist") {
      sig.displayedSync = session.convergence;
    } else { // leave
      sig.displayedSync = session.convergence;
    }
    sig.fatigue = session.disposition.fatigue;
    sig.exitIntent = session.disposition.exitIntent;

    const record = {
      at: new Date().toISOString(), age: age(),
      choice, relationship: rel,
      convergence: Math.round(session.convergence * 100),
      forcedRounds: session.forcedRounds,
      earlyTaps: session.earlyTaps, waitCount: session.waitCount,
      signalMean: Math.round(session.signalMean), playerMean: Math.round(session.playerMean)
    };
    m.sessions.push(record);
    while (m.sessions.length > MAX_SESSIONS) m.sessions.shift();
    m.sessionsCompleted = (m.sessionsCompleted || 0) + 1;
    save();
    log("echo.log.result", { rel: T("echo.rel." + rel) });

    renderResult(record);
  }

  // ── Phase 5: result ──
  function renderResult(record) {
    phase = "result"; cvPhase("result");
    clearTimers();
    clearStage();
    const a = age();
    const wrap = document.createElement("div"); wrap.className = "echo-result";
    const h = document.createElement("h3"); h.className = "echo-result-title"; h.textContent = T("echo.result.title");
    wrap.appendChild(h);

    const rel = document.createElement("p"); rel.className = "echo-rel-name"; rel.textContent = T("echo.rel." + record.relationship);
    wrap.appendChild(rel);
    const relDesc = document.createElement("p"); relDesc.className = "echo-rel-desc"; relDesc.textContent = T("echo.relDesc." + record.relationship);
    wrap.appendChild(relDesc);

    const dl = document.createElement("dl"); dl.className = "echo-summary";
    const rows = [["echo.summary.choice", T("echo.choice." + record.choice)]];
    if (a >= 25) rows.push(["echo.summary.convergence", record.convergence + "%"]);
    if (a >= 35) rows.push(["echo.summary.fatigue", Math.round(session.disposition.fatigue * 100) + "%"]);
    if (record.forcedRounds > 0) rows.push(["echo.summary.forced", String(record.forcedRounds)]);
    // 55+ sees voluntary vs displayed sync gap (LABOUR-style truth)
    if (a >= 55) {
      const m = model(); const gap = Math.round(((m.currentSignal.displayedSync ?? 0) - (m.currentSignal.voluntarySync ?? 0)) * 100);
      rows.push(["echo.summary.syncGap", (gap >= 0 ? "+" : "") + gap + "%"]);
    }
    rows.forEach(([k, v]) => {
      const dt = document.createElement("dt"); dt.textContent = T(k);
      const dd = document.createElement("dd"); dd.textContent = v;
      dl.appendChild(dt); dl.appendChild(dd);
    });
    wrap.appendChild(dl);

    const closing = document.createElement("p"); closing.className = "echo-closing"; closing.textContent = T("echo.result.closing." + record.relationship);
    wrap.appendChild(closing);

    // 70+ can archive this rhythm as a variant
    if (a >= 70) {
      const arow = document.createElement("div"); arow.className = "echo-archive-row";
      arow.appendChild(btn("echo.result.archive", "echo-mini", () => archiveRhythm(record)));
      wrap.appendChild(arow);
    }
    // 80+ can view the raw signal origin
    if (a >= 80) {
      const orow = document.createElement("div"); orow.className = "echo-archive-row";
      orow.appendChild(btn("echo.result.origin", "echo-mini echo-irrev", () => viewOrigin()));
      wrap.appendChild(orow);
    }

    const actions = document.createElement("div"); actions.className = "echo-actions";
    actions.appendChild(btn("echo.result.next", "echo-primary", () => { newSession(); renderReceive(); }));
    actions.appendChild(btn("place.back", "echo-secondary", () => close()));
    wrap.appendChild(actions);
    stageEl.appendChild(wrap);
    setStatus(T("echo.rel." + record.relationship));
    window.eazoI18n?.translate?.(wrap);
  }

  function archiveRhythm(record) {
    if (age() < 70) return;
    const m = model();
    m.savedRhythms.push({ at: record.at, relationship: record.relationship, playerMean: record.playerMean, signalMean: record.signalMean, convergence: record.convergence });
    while (m.savedRhythms.length > MAX_RHYTHMS) m.savedRhythms.shift();
    save();
    log("echo.log.archived", {});
    setStatus(T("echo.result.archived"));
  }
  function viewOrigin() {
    if (age() < 80) return;
    log("echo.log.originViewed", {});
    const box = document.createElement("div"); box.className = "echo-origin-box";
    const p = document.createElement("p"); p.className = "echo-origin-text"; p.textContent = T("echo.origin.text");
    const note = document.createElement("p"); note.className = "echo-origin-note"; note.textContent = T("echo.origin.recorded");
    box.appendChild(p); box.appendChild(note);
    stageEl.appendChild(box);
    setStatus(T("echo.origin.recorded"));
  }

  // ── Public accessors for cross-place linkage ──
  function getLatestResult() { const m = model(); return m && m.sessions.length ? m.sessions[m.sessions.length - 1] : null; }
  function getSignalState() { const m = model(); return m ? { ...m.currentSignal } : null; }

  // ── Sound button ──
  function syncSoundBtn() {
    if (!soundBtn) return;
    const on = AU()?.isEnabled?.() ?? true;
    soundBtn.setAttribute("aria-pressed", String(on));
    soundBtn.textContent = T(on ? "echo.soundOn" : "echo.soundOff");
  }

  // ── Lifecycle ──
  function bind() {
    if (bound) return true;
    root = document.getElementById("echo-game");
    stageEl = document.getElementById("echo-stage");
    statusEl = document.getElementById("echo-status");
    backBtn = document.getElementById("echo-back");
    soundBtn = document.getElementById("echo-sound");
    if (!root || !stageEl) return false;
    CV()?.bind?.();
    bound = true;
    return true;
  }

  function open() {
    if (!bind()) return;
    document.querySelector(".app-shell")?.classList.add("pinball-mode", "echo-mode");
    root.classList.add("open");
    root.setAttribute("aria-hidden", "false");
    opened = true;
    skipFn = null;
    const m = model(); if (m) { m.visits = (m.visits || 0) + 1; save(); }
    CV()?.resize?.();
    CV()?.start?.();
    AU()?.markOpen?.(true);

    on(window, "keydown", onKey);
    on(window, "resize", onResize);
    on(document, "visibilitychange", onVis);
    if (backBtn) on(backBtn, "click", () => close());
    if (soundBtn) on(soundBtn, "click", () => { AU()?.unlock?.(); AU()?.toggle?.(); syncSoundBtn(); });
    on(window, "eazo:localechange", onLocale);
    // unlock audio on first interaction
    on(root, "pointerdown", () => AU()?.unlock?.(), { once: true });

    syncSoundBtn();
    newSession();
    renderReceive();
    if (backBtn) backBtn.focus({ preventScroll: true });
  }

  function close() {
    if (!opened && !bound) return;
    clearTimers();
    skipFn = null;
    CV()?.stop?.();
    AU()?.markOpen?.(false);
    offAll();
    opened = false;
    session = null;
    if (root) { root.classList.remove("open"); root.setAttribute("aria-hidden", "true"); }
    document.querySelector(".app-shell")?.classList.remove("pinball-mode", "echo-mode");
    if (stageEl) stageEl.innerHTML = "";
    setStatus("");
    bound = false;
  }

  function pause() { CV()?.pause?.(); AU()?.suspend?.(); }
  function resume() { CV()?.resume?.(); AU()?.resumeIfOpen?.(); }

  function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
  function onResize() { CV()?.resize?.(); }
  function onVis() { if (document.hidden) pause(); else resume(); }
  function onLocale() {
    if (!opened) return;
    if (phase === "receive") renderReceive();
    else if (phase === "echo") renderEcho();
    else if (phase === "adjust") renderAdjust();
    else if (phase === "choose") renderChoose();
    else if (phase === "result") { const r = getLatestResult(); if (r) renderResult(r); }
    syncSoundBtn();
    window.eazoI18n?.translate?.(root);
  }

  window.eazoEcho = { open, close, pause, resume, getLatestResult, getSignalState };
  window.__echoInternal = {
    model, newSession, deriveSignalDisposition, normalized, convergenceFrom, intervalsToPattern,
    finalizeEcho, doAdjust, forceContinue, classify, finalize, renderResult, archiveRhythm,
    registerTap, getSession: () => session, setSession: (s) => { session = s; }, state
  };
})();
