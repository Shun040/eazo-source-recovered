/* K–11 SECRET EXCHANGE — game state, phases, choices, persistence, lifecycle.
   Public: window.eazoSecret = { open, close, pause, resume }.
   All state lives in eazoGetState().secretExchange and is saved via eazoSaveState.
   All user-visible text goes through window.eazoI18n.t(). No user secret input. */
(() => {
  "use strict";

  const T = (k, p) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MAX_SECRETS = 12;

  // Preset fictional secrets. Each id maps to originalText + previewText (incomplete)
  // pulled from locale so both languages read naturally.
  const SECRET_IDS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12", "s13", "s14", "s15", "s16", "s17", "s18", "s19", "s20", "s21", "s22", "s23", "s24"];
  const RECIPIENTS = ["aurora", "snow", "creature", "anon"]; // A-17 / S-03 / B-06 / random
  const REASONS = ["understand", "authority", "avoid", "random"];
  const MUTATIONS = ["drop", "replace", "shorten", "inference"];

  let root, stageEl, statusEl, backBtn, skipBtn;
  let opened = false;
  let bound = false;
  const timers = new Set();
  let hoverIdleTimer = 0;
  let phase = "arrive";        // arrive | choice | result | ending
  let skipRequested = false;
  const handlers = [];         // {target, type, fn} for cleanup

  function state() { return window.eazoGetState?.() || null; }
  function age() { return window.eazoGetAge?.() ?? 0; }
  function save() { window.eazoSaveState?.(); }
  function log(key, params) { window.eazoAddLog?.(key, params); }

  function setTimer(fn, ms) { const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; }
  function clearTimers() { timers.forEach((id) => window.clearTimeout(id)); timers.clear(); if (hoverIdleTimer) { window.clearTimeout(hoverIdleTimer); hoverIdleTimer = 0; } }

  function on(target, type, fn) { target.addEventListener(type, fn); handlers.push({ target, type, fn }); }
  function offAll() { handlers.forEach(({ target, type, fn }) => target.removeEventListener(type, fn)); handlers.length = 0; }

  // ── State model ──────────────────────────────────────────────
  function ensureModel() {
    const s = state();
    if (!s) return null;
    if (!s.secretExchange || typeof s.secretExchange !== "object") {
      s.secretExchange = {
        currentSecretId: "",
        handledCount: 0, openedCount: 0, buriedCount: 0, forwardedCount: 0,
        secrets: []
      };
    }
    const m = s.secretExchange;
    if (!Array.isArray(m.secrets)) m.secrets = [];
    return m;
  }

  function current() {
    const m = ensureModel(); if (!m) return null;
    return m.secrets.find((x) => x.id === m.currentSecretId) || null;
  }

  function pickPreset(m) {
    // Avoid repeats: prefer presets not used recently (track last-used presetIds).
    const usedRecently = (m.recentPresets && Array.isArray(m.recentPresets)) ? m.recentPresets : [];
    const alsoActive = m.secrets.map((x) => x.presetId);
    const avoid = new Set([...usedRecently, ...alsoActive]);
    let pool = SECRET_IDS.filter((id) => !avoid.has(id));
    if (!pool.length) pool = SECRET_IDS.filter((id) => !usedRecently.includes(id));
    if (!pool.length) pool = SECRET_IDS.slice();
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    m.recentPresets = [...usedRecently, chosen].slice(-Math.min(12, SECRET_IDS.length - 1));
    return chosen;
  }

  function newSecret() {
    const m = ensureModel(); if (!m) return null;
    const base = pickPreset(m);
    const id = base + "-" + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36);
    const sec = {
      id, presetId: base,
      originalText: T("secret.presets." + base + ".full"),
      currentText: T("secret.presets." + base + ".full"),
      previewText: T("secret.presets." + base + ".preview"),
      systemInference: "",
      status: "waiting",
      viewCount: 0, transferCount: 0,
      recipient: "", reason: "", visibility: [],
      deletionRequested: Math.random() < 0.35,
      history: []
    };
    m.secrets.push(sec);
    while (m.secrets.length > MAX_SECRETS) m.secrets.shift();
    m.currentSecretId = id;
    save();
    return sec;
  }

  // ── Information mutation (visible change each round) ──────────
  function mutate(sec) {
    const kind = MUTATIONS[Math.floor(Math.random() * MUTATIONS.length)];
    let text = sec.currentText || sec.originalText;
    if (kind === "drop") {
      const words = splitWords(text);
      if (words.length > 3) { words.splice(1 + Math.floor(Math.random() * (words.length - 2)), 1); text = joinWords(words); }
    } else if (kind === "replace") {
      const map = T("secret.institutionalWords");
      if (map && typeof map === "object") {
        for (const from in map) { if (text.includes(from)) { text = text.replace(from, map[from]); break; } }
      }
    } else if (kind === "shorten") {
      const words = splitWords(text);
      if (words.length > 2) { text = joinWords(words.slice(0, Math.max(2, Math.ceil(words.length * 0.6)))) + T("secret.ellipsis"); }
    } else if (kind === "inference") {
      sec.systemInference = T("secret.inferenceLines." + Math.floor(Math.random() * 3));
    }
    sec.currentText = text;
    return kind;
  }

  function splitWords(s) { return /[\u3400-\u9fff]/.test(s) ? Array.from(s) : s.split(/(\s+)/).filter((x) => x.trim().length); }
  function joinWords(a) { return /[\u3400-\u9fff]/.test(a.join("")) ? a.join("") : a.join(" "); }

  function record(sec, action, mutation) {
    sec.history.push({ action, at: new Date().toISOString(), age: age(), mutation: mutation || "" });
    if (sec.history.length > 40) sec.history.shift();
  }

  // ── Canvas helpers ───────────────────────────────────────────
  const CV = () => window.eazoSecretCanvas;
  function canvasMode(mode, opts) { CV()?.setMode?.(mode, opts); }
  function canvasClarity(v) { CV()?.setClarity?.(v); }

  // ── Rendering ────────────────────────────────────────────────
  function clearStage() { if (stageEl) stageEl.innerHTML = ""; }
  function setStatus(text) { if (statusEl) statusEl.textContent = text || ""; }

  function btn(labelKey, cls, onClick, opts = {}) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "secret-btn" + (cls ? " " + cls : "");
    b.textContent = T(labelKey);
    b.setAttribute("data-i18n", labelKey);
    if (opts.aria) b.setAttribute("aria-label", T(opts.aria));
    if (opts.disabled) { b.disabled = true; b.classList.add("is-locked"); }
    if (onClick) on(b, "click", onClick);
    return b;
  }

  function showSkip(show) { if (skipBtn) skipBtn.hidden = !show || reduced; }

  // Phase 1: seed arrives, preview visible, three choices always present.
  function renderArrival() {
    phase = "choice";
    skipRequested = false;
    clearStage();
    canvasMode("arrive");
    showSkip(!reduced);

    const sec = current(); if (!sec) return;

    const wrap = document.createElement("div");
    wrap.className = "secret-arrival";

    const seedText = document.createElement("p");
    seedText.className = "secret-seed-text";
    seedText.textContent = sec.previewText;
    wrap.appendChild(seedText);

    // hover clarity: clear near the seed text, blur after 2s idle.
    // Bound to the seed text itself (never an overlay) so choice buttons stay clickable.
    on(seedText, "mousemove", () => {
      seedText.classList.add("is-clear"); canvasClarity(1);
      if (hoverIdleTimer) window.clearTimeout(hoverIdleTimer);
      hoverIdleTimer = window.setTimeout(() => { seedText.classList.remove("is-clear"); canvasClarity(0); }, 2000);
    });
    on(seedText, "mouseleave", () => { seedText.classList.remove("is-clear"); canvasClarity(0); });

    // permission-aware secondary info (age gates)
    const meta = document.createElement("div");
    meta.className = "secret-meta";
    const a = age();
    if (a >= 25) { const p = document.createElement("p"); p.textContent = T("secret.meta.handled", { n: sec.transferCount + sec.viewCount }); meta.appendChild(p); }
    if (a >= 35 && sec.visibility.length) { const p = document.createElement("p"); p.textContent = T("secret.meta.visibleTo", { list: sec.visibility.map((r) => T("secret.recipients." + r)).join(", ") }); meta.appendChild(p); }
    if (meta.childNodes.length) wrap.appendChild(meta);

    // choices — reading (open) is always available; forwarding requires having read first.
    const hasRead = sec.viewCount > 0 || sec.status === "opened";
    const choices = document.createElement("div");
    choices.className = "secret-choices";
    choices.appendChild(btn("secret.choice.open", "secret-open", () => doOpen()));
    choices.appendChild(btn("secret.choice.bury", "secret-bury", () => doBury()));
    const fwdBtn = btn("secret.choice.forward", "secret-forward", hasRead ? (() => startForward()) : null, hasRead ? {} : { disabled: true, aria: "secret.lock.forwardAria" });
    choices.appendChild(fwdBtn);
    wrap.appendChild(choices);

    if (!hasRead) {
      const lockNote = document.createElement("p");
      lockNote.className = "secret-lock-note";
      lockNote.textContent = T("secret.lock.mustRead");
      wrap.appendChild(lockNote);
    }

    // high-permission extras (kept subtle / hidden below the fold)
    const extras = document.createElement("div");
    extras.className = "secret-extras";
    if (a >= 40 && sec.deletionRequested) {
      const row = document.createElement("div"); row.className = "secret-extra-row";
      const label = document.createElement("span"); label.className = "secret-extra-label"; label.textContent = T("secret.deletion.pending");
      row.appendChild(label);
      if (hasRead) {
        row.appendChild(btn("secret.deletion.approve", "secret-mini", () => resolveDeletion(true)));
        row.appendChild(btn("secret.deletion.reject", "secret-mini", () => resolveDeletion(false)));
      } else {
        row.appendChild(btn("secret.deletion.approve", "secret-mini", null, { disabled: true, aria: "secret.lock.deleteAria" }));
        row.appendChild(btn("secret.deletion.reject", "secret-mini", null, { disabled: true, aria: "secret.lock.deleteAria" }));
        const dn = document.createElement("span"); dn.className = "secret-lock-hint"; dn.textContent = T("secret.lock.mustReadShort"); row.appendChild(dn);
      }
      extras.appendChild(row);
    }
    if (a >= 70) extras.appendChild(btn("secret.variant.create", "secret-mini", () => createVariant()));
    if (a >= 80) extras.appendChild(btn("secret.original.view", "secret-mini secret-irrev", () => viewOriginal()));
    if (extras.childNodes.length) wrap.appendChild(extras);

    stageEl.appendChild(wrap);
    setStatus(T("secret.status.arrived"));
    window.eazoI18n?.translate?.(wrap);
  }

  // ── Phase 2A: OPEN ──
  function doOpen() {
    const sec = current(); if (!sec) return;
    phase = "result";
    clearStage();
    canvasMode("open");
    showSkip(!reduced);

    sec.status = "opened";
    sec.viewCount += 1;
    const mut = mutate(sec);
    record(sec, "open", mut);
    const m = ensureModel(); m.handledCount++; m.openedCount++;
    save();
    log("secret.log.opened", {});

    const finish = () => {
      showSkip(false);
      renderOutcome({
        titleKey: "secret.open.title",
        reveal: sec.currentText,        // full (mutated) secret shown
        consequenceKey: "secret.open.consequence",
        sec, allowFinishIn: reduced ? 0 : 5000
      });
    };
    if (reduced) finish(); else setTimer(finish, 1600);
    onSkip(() => { clearTimers(); finish(); });
  }

  // ── Phase 2B: BURY ──
  function doBury() {
    const sec = current(); if (!sec) return;
    phase = "result";
    clearStage();
    canvasMode("bury");
    showSkip(!reduced);

    sec.status = "buried";
    sec.buriedAt = new Date().toISOString();
    const mut = mutate(sec);
    record(sec, "bury", mut);
    const m = ensureModel(); m.handledCount++; m.buriedCount++;
    save();
    log("secret.log.buried", {});

    const finish = () => {
      showSkip(false);
      renderOutcome({
        titleKey: "secret.bury.title",
        reveal: null,                    // never reveal full secret
        consequenceKey: "secret.bury.consequence",
        sec, allowFinishIn: reduced ? 0 : 3000
      });
    };
    if (reduced) finish(); else setTimer(finish, 1600);
    onSkip(() => { clearTimers(); finish(); });
  }

  // ── Phase 2C: FORWARD ──
  function startForward() {
    const sec = current(); if (!sec) return;
    phase = "result";
    clearStage();
    showSkip(false);
    const a = age();
    const canPickRecipient = a >= 30;

    const wrap = document.createElement("div");
    wrap.className = "secret-forward-flow";
    const h = document.createElement("p"); h.className = "secret-substep"; h.textContent = T("secret.forward.pickRecipient");
    wrap.appendChild(h);

    const list = document.createElement("div"); list.className = "secret-option-list";
    const pool = canPickRecipient ? RECIPIENTS : ["anon"]; // <30 → random anon only
    pool.forEach((r) => {
      const b = btn("secret.recipients." + r, "secret-option", () => pickRecipient(r));
      list.appendChild(b);
    });
    wrap.appendChild(list);
    if (!canPickRecipient) { const note = document.createElement("p"); note.className = "secret-note"; note.textContent = T("secret.forward.randomOnly"); wrap.appendChild(note); }
    stageEl.appendChild(wrap);
    setStatus(T("secret.forward.pickRecipient"));
  }

  function pickRecipient(r) {
    const sec = current(); if (!sec) return;
    const recipient = r === "anon" ? RECIPIENTS.filter((x) => x !== "anon")[Math.floor(Math.random() * 3)] : r;
    sec._pendingRecipient = recipient;
    clearStage();
    const wrap = document.createElement("div"); wrap.className = "secret-forward-flow";
    const h = document.createElement("p"); h.className = "secret-substep"; h.textContent = T("secret.forward.pickReason");
    wrap.appendChild(h);
    const list = document.createElement("div"); list.className = "secret-option-list";
    REASONS.forEach((rs) => list.appendChild(btn("secret.reasons." + rs, "secret-option", () => confirmForward(rs))));
    wrap.appendChild(list);
    stageEl.appendChild(wrap);
    setStatus(T("secret.forward.pickReason"));
  }

  function confirmForward(reasonKey) {
    const sec = current(); if (!sec) return;
    const reason = reasonKey === "random" ? REASONS.filter((x) => x !== "random")[Math.floor(Math.random() * 3)] : reasonKey;
    sec.recipient = sec._pendingRecipient;
    sec.reason = reason;
    delete sec._pendingRecipient;
    sec.status = "forwarded";
    sec.transferCount += 1;
    if (!sec.visibility.includes(sec.recipient)) sec.visibility.push(sec.recipient);
    const mut = mutate(sec);
    record(sec, "forward", mut);
    const m = ensureModel(); m.handledCount++; m.forwardedCount++;
    save();
    log("secret.log.forwarded", { to: T("secret.recipients." + sec.recipient), reason: T("secret.reasons." + reason) });

    clearStage();
    canvasMode("forward");
    showSkip(!reduced);
    const finish = () => {
      showSkip(false);
      renderOutcome({
        titleKey: "secret.forward.title",
        reveal: null,
        consequenceKey: "secret.forward.consequence",
        sec, allowFinishIn: reduced ? 0 : 3000
      });
    };
    if (reduced) finish(); else setTimer(finish, 1800);
    onSkip(() => { clearTimers(); finish(); });
  }

  // ── High-permission actions ──
  function resolveDeletion(approve) {
    const sec = current(); if (!sec || age() < 40) return;
    sec.deletionRequested = false;
    sec.deletionResolved = approve ? "approved" : "rejected";
    record(sec, approve ? "deletion-approve" : "deletion-reject", "");
    save();
    log(approve ? "secret.log.deletionApproved" : "secret.log.deletionRejected", {});
    renderArrival();
  }

  function createVariant() {
    const sec = current(); if (!sec || age() < 70) return;
    // create an alternate propagation version while preserving originalText
    sec.currentText = T("secret.variant.template", { text: sec.currentText });
    record(sec, "variant", "variant");
    save();
    log("secret.log.variantCreated", {});
    setStatus(T("secret.variant.done"));
    renderArrival();
  }

  function viewOriginal() {
    const sec = current(); if (!sec || age() < 80) return;
    record(sec, "view-original", "");
    save();
    log("secret.log.originalViewed", {});
    // reveal original with an irreversible-action note
    const box = document.createElement("div");
    box.className = "secret-original-box";
    const p = document.createElement("p"); p.className = "secret-original-text"; p.textContent = sec.originalText;
    const note = document.createElement("p"); note.className = "secret-original-note"; note.textContent = T("secret.original.recorded");
    box.appendChild(p); box.appendChild(note);
    stageEl.appendChild(box);
    setStatus(T("secret.original.recorded"));
  }

  // ── Outcome + Phase 4 ending ──
  function renderOutcome({ titleKey, reveal, consequenceKey, sec, allowFinishIn }) {
    clearStage();
    const wrap = document.createElement("div");
    wrap.className = "secret-outcome";

    const title = document.createElement("h3"); title.className = "secret-outcome-title"; title.textContent = T(titleKey);
    wrap.appendChild(title);

    if (reveal) {
      const rv = document.createElement("p"); rv.className = "secret-reveal"; rv.textContent = reveal;
      wrap.appendChild(rv);
    }
    if (sec.systemInference) {
      const si = document.createElement("p"); si.className = "secret-inference"; si.textContent = T("secret.inferenceLabel") + " " + sec.systemInference;
      wrap.appendChild(si);
    }
    const cons = document.createElement("p"); cons.className = "secret-consequence"; cons.textContent = T(consequenceKey);
    wrap.appendChild(cons);

    // mutation visible marker
    const mv = document.createElement("p"); mv.className = "secret-mutation"; mv.textContent = T("secret.mutationNote");
    wrap.appendChild(mv);

    const cont = document.createElement("div"); cont.className = "secret-continue";

    // Post-read actions: once the secret has been opened, allow forwarding / deletion / keep.
    if (sec.status === "opened") {
      const acts = document.createElement("div"); acts.className = "secret-postread";
      const fwd = btn("secret.choice.forward", "secret-forward secret-mini", () => startForward());
      acts.appendChild(fwd);
      if (age() >= 40 && sec.deletionRequested) {
        acts.appendChild(btn("secret.deletion.approve", "secret-mini", () => resolveDeletion(true)));
        acts.appendChild(btn("secret.deletion.reject", "secret-mini", () => resolveDeletion(false)));
      }
      wrap.appendChild(acts);
    }

    const goEnding = btn("secret.toEnding", "secret-primary", () => renderEnding(sec));
    if (allowFinishIn > 0) {
      goEnding.disabled = true; goEnding.classList.add("is-waiting");
      setTimer(() => { goEnding.disabled = false; goEnding.classList.remove("is-waiting"); }, allowFinishIn);
    }
    cont.appendChild(goEnding);
    wrap.appendChild(cont);

    stageEl.appendChild(wrap);
    setStatus(T(consequenceKey));
    window.eazoI18n?.translate?.(wrap);
  }

  function renderEnding(sec) {
    phase = "ending";
    clearTimers();
    clearStage();
    canvasMode("static");
    const m = ensureModel();

    const wrap = document.createElement("div"); wrap.className = "secret-ending";
    const h = document.createElement("h3"); h.className = "secret-ending-title"; h.textContent = T("secret.ending.title");
    wrap.appendChild(h);

    const dl = document.createElement("dl"); dl.className = "secret-summary";
    const rows = [
      ["secret.summary.action", T("secret.actionName." + sec.status)],
      ["secret.summary.read", sec.status === "opened" ? T("secret.yes") : T("secret.no")],
      ["secret.summary.location", locationLabel(sec)],
      ["secret.summary.change", changeLabel(sec)],
      ["secret.summary.transfers", String(sec.transferCount)]
    ];
    rows.forEach(([k, v]) => {
      const dt = document.createElement("dt"); dt.textContent = T(k);
      const dd = document.createElement("dd"); dd.textContent = v;
      dl.appendChild(dt); dl.appendChild(dd);
    });
    wrap.appendChild(dl);

    const closing = document.createElement("p"); closing.className = "secret-closing"; closing.textContent = T("secret.ending.closing");
    wrap.appendChild(closing);

    const actions = document.createElement("div"); actions.className = "secret-ending-actions";
    actions.appendChild(btn("secret.ending.next", "secret-primary", () => { newSecret(); renderArrival(); }));
    actions.appendChild(btn("place.back", "secret-secondary", () => close(true)));
    wrap.appendChild(actions);

    stageEl.appendChild(wrap);
    setStatus(T("secret.ending.title"));
    window.eazoI18n?.translate?.(wrap);
  }

  function locationLabel(sec) {
    if (sec.status === "buried") return T("secret.location.buried");
    if (sec.status === "forwarded") return T("secret.location.forwarded", { to: T("secret.recipients." + sec.recipient) });
    if (sec.status === "opened") return T("secret.location.here");
    return T("secret.location.waiting");
  }
  function changeLabel(sec) {
    const last = sec.history[sec.history.length - 1];
    if (sec.systemInference) return T("secret.change.inference");
    if (!last || !last.mutation) return T("secret.change.none");
    return T("secret.change." + last.mutation);
  }

  // ── Skip handling ──
  let skipFn = null;
  function onSkip(fn) { skipFn = fn; }
  function handleSkip() { if (skipFn) { const f = skipFn; skipFn = null; f(); } }

  // ── Lifecycle ────────────────────────────────────────────────
  function bind() {
    if (bound) return true;
    root = document.getElementById("secret-game");
    stageEl = document.getElementById("secret-stage");
    statusEl = document.getElementById("secret-status");
    backBtn = document.getElementById("secret-back");
    skipBtn = document.getElementById("secret-skip");
    if (!root || !stageEl) return false;
    CV()?.bind?.();
    bound = true;
    return true;
  }

  function open() {
    if (!bind()) return;
    document.querySelector(".app-shell")?.classList.add("pinball-mode", "secret-mode");
    root.classList.add("open");
    root.setAttribute("aria-hidden", "false");
    opened = true;
    skipFn = null;
    CV()?.resize?.();
    CV()?.start?.();

    // window-level listeners
    on(window, "keydown", onKey);
    on(window, "resize", onResize);
    on(document, "visibilitychange", onVis);
    if (backBtn) on(backBtn, "click", () => close(true));
    if (skipBtn) on(skipBtn, "click", handleSkip);
    on(window, "eazo:localechange", onLocale);

    // ensure a current secret exists
    const cur = current();
    if (!cur || cur.status !== "waiting") newSecret();
    renderArrival();
    if (backBtn) backBtn.focus({ preventScroll: true });
  }

  function close(returnToMap) {
    if (!opened && !bound) return;
    clearTimers();
    skipFn = null;
    CV()?.stop?.();
    offAll();
    opened = false;
    if (root) { root.classList.remove("open"); root.setAttribute("aria-hidden", "true"); }
    document.querySelector(".app-shell")?.classList.remove("pinball-mode", "secret-mode");
    if (stageEl) stageEl.innerHTML = "";
    setStatus("");
  }

  function pause() { CV()?.pause?.(); }
  function resume() { CV()?.resume?.(); }

  function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(true); } }
  function onResize() { CV()?.resize?.(); }
  function onVis() { if (document.hidden) pause(); else resume(); }
  function onLocale() {
    if (!opened) return;
    // re-render current phase in the new language
    if (phase === "choice") renderArrival();
    else if (phase === "ending") { const sec = current(); if (sec) renderEnding(sec); }
    window.eazoI18n?.translate?.(root);
  }

  window.eazoSecret = { open, close: () => close(true), pause, resume };

  // test hook
  window.__secretInternal = { ensureModel, newSecret, current, mutate, doOpen, doBury, startForward, pickRecipient, confirmForward, renderEnding, state };
})();
