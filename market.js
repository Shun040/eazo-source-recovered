/* EAZO M-04 NIGHT SUPERMARKET
 * Scene UI + shelf + cart + fictional checkout + receipt + lottery scratch.
 * All persistent effects are delegated to window.eazoFx.
 */
(() => {
  "use strict";

  const t = (k, p) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const fx = () => window.eazoFx;

  // Product catalogue (price = fictional credits, duration ms)
  const PRODUCTS = [
    { id: "alcohol",    code: "ITM-01", price: 12, duration: 120000 },
    { id: "cigarettes", code: "VRU–18", price: 10, duration: 120000 },
    { id: "energy",     code: "ITM-03", price: 8,  duration: 90000 },
    { id: "lottery",    code: "ITM-04", price: 5,  duration: 0 },
    { id: "silence",    code: "ITM-05", price: 15, duration: 60000 },
  ];

  let root, shelf, cartList, cartEmpty, cartTotal, npcLine, receipt, ageEl;
  let detailLayer, cornerEl, summaryToast;
  let bound = false, opened = false;
  let cart = [];
  let detailProduct = null;
  let npcTimer = 0;
  let fxUnsub = null;

  // ── i18n helpers ──
  function pname(id) { return t(`market.items.${id}.name`); }
  function pdesc(id) { return t(`market.items.${id}.desc`); }
  function durationText(ms) {
    if (!ms) return t("market.instant");
    const s = Math.round(ms / 1000);
    return t("market.durationSec", { s });
  }

  // ── NPC line rotation (non-essential lines suppressed during silence) ──
  function say(key, essential) {
    if (!npcLine) return;
    if (!essential && fx()?.silenceActive?.()) return;
    npcLine.textContent = t(key);
  }
  function resetIdleTimer() {
    window.clearTimeout(npcTimer);
    npcTimer = window.setTimeout(() => { if (opened) say("market.npc.linger"); }, 18000);
  }

  // ── Shelf ──
  const MODEL_ITEMS = new Set(["alcohol", "cigarettes", "energy", "lottery", "silence"]);   // rendered as real 3D objects
  function isModelItem(id) { return window.eazoMarketModel?.isModel?.(id) ?? MODEL_ITEMS.has(id); }
  function renderShelf() {
    if (!shelf) return;
    window.eazoMarketModel?.unmountShelf?.();
    shelf.innerHTML = "";
    PRODUCTS.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "market-item";
      btn.dataset.id = p.id;
      if (isModelItem(p.id)) {
        btn.classList.add("market-item-vru");
        btn.innerHTML =
          `<div class="market-model-slot" data-model="${p.id}">` +
          '<canvas class="market-model-canvas" aria-hidden="true"></canvas>' +
          '<div class="market-model-fallback" hidden aria-hidden="true"></div>' +
          '</div>' +
          `<span class="market-item-name">${pname(p.id)}</span>` +
          `<span class="market-item-en">${p.code}</span>` +
          `<span class="market-item-price">${p.price} ${t("market.currency")}</span>`;
      } else {
        btn.innerHTML =
          '<span class="market-item-bag" aria-hidden="true"></span>' +
          `<span class="market-item-name">${pname(p.id)}</span>` +
          `<span class="market-item-en">${p.code}</span>` +
          `<span class="market-item-price">${p.price} ${t("market.currency")}</span>`;
      }
      btn.addEventListener("click", () => {
        if (p.id === "lottery") openLottery();
        else if (isModelItem(p.id)) openModelFocus(p);
        else openDetail(p);
      });
      shelf.appendChild(btn);
    });
    // Mount each inline shelf model (real objects on the shelf)
    shelf.querySelectorAll(".market-item-vru").forEach((btn) => {
      const id = btn.dataset.id;
      const cvs = btn.querySelector(".market-model-canvas");
      if (cvs) window.eazoMarketModel?.mountShelf?.(id, cvs);
    });
  }

  // Model items: click expands the same object into a fullscreen focus state (no dialog).
  function openModelFocus(p) {
    detailProduct = p;
    updateFocusMeta(p);
    const src = shelf?.querySelector(`.market-item[data-id="${p.id}"] .market-model-slot`);
    const ok = window.eazoMarketModel?.openFocus?.(p.id, src);
    if (!ok) { openDetail(p); }   // fallback if model layer unavailable
  }
  function updateFocusMeta(p) {
    const layer = document.getElementById("vru-focus");
    if (!layer) return;
    layer.querySelector(".model-focus-meta > span").textContent = p.code;
    layer.querySelector(".model-focus-meta h3").textContent = pname(p.id);
    layer.querySelector(".model-focus-meta p").textContent = pdesc(p.id);
  }

  // ── Detail card ──
  function openDetail(p) {
    detailProduct = p;
    document.getElementById("market-detail-code").textContent = p.code;
    document.getElementById("market-detail-name").textContent = pname(p.id);
    document.getElementById("market-detail-desc").textContent = pdesc(p.id);
    document.getElementById("market-detail-price").textContent = `${p.price} ${t("market.currency")}`;
    document.getElementById("market-detail-duration").textContent = durationText(p.duration);
    detailLayer.classList.add("open");
    detailLayer.setAttribute("aria-hidden", "false");
  }
  function closeDetail() {
    detailLayer.classList.remove("open");
    detailLayer.setAttribute("aria-hidden", "true");
    detailProduct = null;
  }

  // ── Cart ──
  function addToCart(p) {
    cart.push(p);
    renderCart();
    if (cart.length >= 2) say("market.npc.multi");
  }
  function removeFromCart(i) { cart.splice(i, 1); renderCart(); }
  function renderCart() {
    cartList.innerHTML = "";
    cart.forEach((p, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${pname(p.id)}</span><span>${p.price} <button type="button" aria-label="remove">×</button></span>`;
      li.querySelector("button").addEventListener("click", () => removeFromCart(i));
      cartList.appendChild(li);
    });
    cartEmpty.style.display = cart.length ? "none" : "block";
    cartTotal.textContent = String(cart.reduce((s, p) => s + p.price, 0));
  }

  // ── Checkout: consume every item in cart, apply effects, print receipt ──
  function checkout() {
    if (!cart.length) return;
    const lines = [];
    const consumedAt = new Date();
    cart.forEach((p) => {
      applyProduct(p.id);
      const dur = p.duration ? durationText(p.duration) : t("market.instant");
      lines.push(`${p.code}  ${pname(p.id)}  ${p.price}${t("market.currency")}  ${dur}`);
    });
    say("market.npc.approved", true);
    printReceipt(lines, consumedAt);
    cart = [];
    renderCart();
    refreshShelfUsed();
  }

  function printReceipt(lines, when) {
    const head = t("market.receiptHead");
    const stamp = when.toLocaleTimeString();
    const note = t("market.consumedNote");
    receipt.textContent =
      `${head}\n${stamp}\n----------------------------\n${lines.join("\n")}\n----------------------------\n${note}`;
    receipt.classList.add("show");
  }

  // ── Effect application (delegates to eazoFx; alcohol & cigarettes are
  //    independent channels, so buying one never cancels the other) ──
  function applyProduct(id) {
    const f = fx(); if (!f) return;
    if (id === "alcohol" || id === "cigarettes" || id === "energy" || id === "silence") {
      f.apply(id);
      if (id === "alcohol") acknowledgeAlcoholPurchase();
      if (id === "cigarettes") showSummary(t("market.mistComplete"));
      if (id === "energy") showSummary(t("market.energyComplete"));
      if (id === "silence") { window.eazoSilenceLaugh?.unlock?.(); showSummary(t("market.silenceComplete")); }
    }
  }

  // A single subtle page pulse so the alcohol purchase reads instantly,
  // before the refraction has fully ramped. Never a substitute for the effect.
  function acknowledgeAlcoholPurchase() {
    const root = document.documentElement;
    root.classList.remove("fx-alcohol-enter");
    void root.offsetHeight;
    root.classList.add("fx-alcohol-enter");
    window.setTimeout(() => root.classList.remove("fx-alcohol-enter"), 700);
  }

  function refreshShelfUsed() {
    const active = fx()?.activeIds?.() || new Set();
    shelf?.querySelectorAll(".market-item").forEach((el) => {
      el.classList.toggle("used", active.has(el.dataset.id));
    });
  }

  // ── Corner countdown chips ──
  function fmtTime(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
  }
  function renderCorner(snap) {
    if (!cornerEl) return;
    const list = snap?.effects || fx()?.snapshot?.().effects || [];
    if (!list.length) { cornerEl.setAttribute("aria-hidden", "true"); cornerEl.innerHTML = ""; return; }
    cornerEl.setAttribute("aria-hidden", "false");
    cornerEl.innerHTML = list
      .map((e) => {
        const stop = e.id === "silence"
          ? `<button class="fx-stop" data-fx-stop="silence" type="button" aria-label="${t("market.silenceStop")}">${t("market.silenceStop")}</button>`
          : "";
        return `<div class="fx-chip"><b>${effectLabel(e.id)}</b><span class="fx-time">${fmtTime(e.remaining)}</span>${stop}</div>`;
      })
      .join("");
    if (opened) refreshShelfUsed();
  }
  function effectLabel(id) {
    return t(`market.items.${id}.name`);
  }

  // =====================================================================
  // LOTTERY — fullscreen focus state, center-region scratch reveal.
  // Result is generated once, persisted; claim is idempotent. One ticket/session.
  // =====================================================================
  const SESSION_TICKET_KEY = "silentStarMap.market.ticketUsed";
  const TICKET_STATE_KEY = "silentStarMap.market.ticketState";

  let focusLayer, scratchCanvas, scratchCtx;
  let resultMainEl, resultNoteEl, readingStatusEl, claimButton;
  let scratching = false, lastPoint = null, scratchCheckPending = false;
  let lastFocusTrigger = null;
  const READABLE_THRESHOLD = 0.25;

  const ticketState = { result: null, readable: false, claimed: false, generatedAt: null };

  function ticketUsed() {
    try { return sessionStorage.getItem(SESSION_TICKET_KEY) === "1"; } catch (_e) { return false; }
  }
  function markTicketUsed() {
    try { sessionStorage.setItem(SESSION_TICKET_KEY, "1"); } catch (_e) {}
  }
  function saveTicketState() {
    try { sessionStorage.setItem(TICKET_STATE_KEY, JSON.stringify(ticketState)); } catch (_e) {}
  }
  function loadTicketState() {
    try {
      const raw = sessionStorage.getItem(TICKET_STATE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      ticketState.result = s.result || null;
      ticketState.readable = !!s.readable;
      ticketState.claimed = !!s.claimed;
      ticketState.generatedAt = s.generatedAt || null;
    } catch (_e) {}
  }
  // A fresh ticket is available on every entry to the market.
  function resetTicket() {
    ticketState.result = null;
    ticketState.readable = false;
    ticketState.claimed = false;
    ticketState.generatedAt = null;
    try {
      sessionStorage.removeItem(TICKET_STATE_KEY);
      sessionStorage.removeItem(SESSION_TICKET_KEY);
    } catch (_e) {}
  }

  function pickLotteryResult() {
    const r = Math.random();
    if (r < 0.14) return "freeItem";
    if (r < 0.30) return "extend";
    if (r < 0.46) return "color";
    if (r < 0.60) return "fakePriv";
    return "nothing";
  }
  function generateTicketOnce() {
    if (ticketState.result) return ticketState.result;
    ticketState.result = pickLotteryResult();
    ticketState.generatedAt = Date.now();
    saveTicketState();
    return ticketState.result;
  }
  function isWinning(result) { return result && result !== "nothing"; }

  // Underlying (below-coating) text for the current result
  function resultMainText(result) {
    return t(`market.result.${result}.main`);
  }
  function resultNoteText(result) {
    return t(`market.result.${result}.note`);
  }

  function openLottery() {
    if (!focusLayer) return;
    lastFocusTrigger = shelf?.querySelector('.market-item[data-id="lottery"]') || null;
    // used up in a previous session-ticket that was already claimed & no state → still show record
    generateTicketOnce();
    // render the underlying result text (revealed by scratching)
    resultMainEl.textContent = resultMainText(ticketState.result);
    resultNoteEl.textContent = resultNoteText(ticketState.result);

    focusLayer.classList.add("open");
    focusLayer.setAttribute("aria-hidden", "false");
    document.body.classList.add("lottery-focus-open");

    // Mount the draggable 3D ticket model into the object slot.
    const modelCanvas = document.getElementById("lottery-model-canvas");
    const objectEl = focusLayer.querySelector(".lottery-object");
    if (modelCanvas && window.eazoMarketModel?.mountViewer) {
      Promise.resolve(window.eazoMarketModel.mountViewer("lottery", modelCanvas))
        .then(() => { objectEl?.classList.add("model-ready"); })
        .catch(() => { objectEl?.classList.remove("model-ready"); });
    }

    setupScratch();
    if (ticketState.claimed) {
      // Already registered: show cleared result, disable claim.
      clearCoatingFully();
      claimButton.disabled = true;
      readingStatusEl.textContent = t("market.registered");
    } else if (ticketState.readable) {
      // Reopened after reaching readable but not claimed: restore a partial reveal.
      restorePartialReveal();
      claimButton.disabled = false;
      readingStatusEl.textContent = t("market.readingYes");
      scratchCanvas.classList.add("readable");
    } else {
      claimButton.disabled = true;
      readingStatusEl.textContent = t("market.readingNo");
      scratchCanvas.classList.remove("readable");
    }
  }
  function closeLottery() {
    if (!focusLayer) return;
    window.eazoMarketModel?.unmountViewer?.();
    focusLayer.querySelector(".lottery-object")?.classList.remove("model-ready");
    focusLayer.classList.remove("open");
    focusLayer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lottery-focus-open");
    scratching = false; lastPoint = null;
    if (lastFocusTrigger) { try { lastFocusTrigger.focus({ preventScroll: true }); } catch (_e) {} }
  }
  function isLotteryOpen() { return !!focusLayer && focusLayer.classList.contains("open"); }

  function drawScratchCoating() {
    const rect = scratchCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    scratchCanvas.width = Math.round(rect.width * dpr);
    scratchCanvas.height = Math.round(rect.height * dpr);
    scratchCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scratchCtx.globalCompositeOperation = "source-over";
    const gradient = scratchCtx.createLinearGradient(0, 0, rect.width, rect.height);
    gradient.addColorStop(0, "rgba(91,120,108,.98)");
    gradient.addColorStop(0.5, "rgba(53,78,68,.99)");
    gradient.addColorStop(1, "rgba(104,130,118,.98)");
    scratchCtx.fillStyle = gradient;
    scratchCtx.fillRect(0, 0, rect.width, rect.height);
    for (let i = 0; i < 500; i++) {
      scratchCtx.fillStyle = `rgba(205,230,217,${Math.random() * 0.045})`;
      scratchCtx.fillRect(Math.random() * rect.width, Math.random() * rect.height, 1, 1);
    }
  }
  function setupScratch() {
    if (!scratchCanvas || !scratchCtx) return;
    drawScratchCoating();
  }
  function getCanvasPoint(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function scratchStroke(x, y, previous) {
    scratchCtx.save();
    scratchCtx.globalCompositeOperation = "destination-out";
    scratchCtx.lineCap = "round";
    scratchCtx.lineJoin = "round";
    scratchCtx.lineWidth = 30;
    scratchCtx.beginPath();
    if (previous) scratchCtx.moveTo(previous.x, previous.y);
    else scratchCtx.moveTo(x, y);
    scratchCtx.lineTo(x, y);
    scratchCtx.stroke();
    scratchCtx.restore();
  }
  function getPrizeReadingRegion(canvas) {
    return {
      x: Math.floor(canvas.width * 0.18),
      y: Math.floor(canvas.height * 0.28),
      width: Math.floor(canvas.width * 0.64),
      height: Math.floor(canvas.height * 0.44),
    };
  }
  function getRevealedRatio(context, region) {
    const imageData = context.getImageData(region.x, region.y, region.width, region.height);
    const pixels = imageData.data;
    let transparent = 0, sampled = 0;
    for (let i = 3; i < pixels.length; i += 16) {
      sampled += 1;
      if (pixels[i] < 40) transparent += 1;
    }
    return sampled ? transparent / sampled : 0;
  }
  function checkScratchReadability() {
    if (ticketState.readable || ticketState.claimed) return;
    const region = getPrizeReadingRegion(scratchCanvas);
    const ratio = getRevealedRatio(scratchCtx, region);
    if (ratio >= READABLE_THRESHOLD) {
      ticketState.readable = true;
      saveTicketState();
      claimButton.disabled = false;
      readingStatusEl.textContent = t("market.readingYes");
      scratchCanvas.classList.add("readable");
    }
  }
  function scheduleScratchCheck() {
    if (scratchCheckPending) return;
    scratchCheckPending = true;
    requestAnimationFrame(() => { scratchCheckPending = false; checkScratchReadability(); });
  }
  // Restore a partial reveal over the text region (cheaper than persisting exact strokes)
  function restorePartialReveal() {
    drawScratchCoating();
    const rect = scratchCanvas.getBoundingClientRect();
    scratchCtx.save();
    scratchCtx.globalCompositeOperation = "destination-out";
    const cx = rect.width * 0.5, cy = rect.height * 0.5;
    const rx = rect.width * 0.26, ry = rect.height * 0.22;
    scratchCtx.beginPath();
    scratchCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    scratchCtx.fill();
    scratchCtx.restore();
  }
  function clearCoatingFully() {
    if (!scratchCtx) return;
    scratchCtx.save();
    scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
    scratchCtx.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
    scratchCtx.restore();
  }

  function claimTicket() {
    if (!ticketState.readable || ticketState.claimed) return;
    ticketState.claimed = true;
    claimButton.disabled = true;
    markTicketUsed();
    grantLotteryResult(ticketState.result);
    saveTicketState();
    readingStatusEl.textContent = t("market.registered");
  }
  function grantLotteryResult(result) {
    const f = fx();
    switch (result) {
      case "freeItem":
        f?.apply("energy");
        refreshShelfUsed();
        break;
      case "extend":
        f?.extendAny(30000);
        break;
      case "color":
        document.documentElement.classList.add("fx-lottery-color");
        window.setTimeout(() => document.documentElement.classList.remove("fx-lottery-color"), 120000);
        break;
      case "fakePriv":
      default:
        break;
    }
  }

  // ── silence: watch for expiry to show single summary ──
  let silenceWasActive = false;
  function watchSilence(snap) {
    const active = fx()?.silenceActive?.();
    if (silenceWasActive && !active) {
      showSummary(t("market.silenceSummary"));
    }
    silenceWasActive = active;
  }
  function showSummary(text) {
    if (!summaryToast) return;
    summaryToast.textContent = text;
    summaryToast.classList.add("show");
    summaryToast.setAttribute("aria-hidden", "false");
    window.setTimeout(() => { summaryToast.classList.remove("show"); summaryToast.setAttribute("aria-hidden", "true"); }, 4500);
  }

  // =====================================================================
  function bind() {
    if (bound) return;
    root = document.getElementById("market-game");
    if (!root) return;
    shelf = document.getElementById("market-shelf");
    cartList = document.getElementById("market-cart-list");
    cartEmpty = document.getElementById("market-cart-empty");
    cartTotal = document.getElementById("market-cart-total");
    npcLine = document.getElementById("market-npc-line");
    receipt = document.getElementById("market-receipt");
    ageEl = document.getElementById("market-age");
    detailLayer = document.getElementById("market-detail");
    cornerEl = document.getElementById("fx-corner");
    summaryToast = document.getElementById("fx-summary-toast");

    // Lottery focus layer
    focusLayer = document.getElementById("lottery-focus");
    scratchCanvas = document.getElementById("lottery-scratch-canvas");
    scratchCtx = scratchCanvas ? scratchCanvas.getContext("2d") : null;
    resultMainEl = document.getElementById("lottery-result-main");
    resultNoteEl = document.getElementById("lottery-result-note");
    readingStatusEl = document.getElementById("lottery-reading-status");
    claimButton = document.getElementById("lottery-claim");
    loadTicketState();

    document.getElementById("market-back")?.addEventListener("click", close);

    // 立即终止罐装寂静（避免听觉不适）；同时停止笑声引擎。
    cornerEl?.addEventListener("click", (e) => {
      const btn = e.target.closest?.("[data-fx-stop]");
      if (!btn) return;
      const ch = btn.getAttribute("data-fx-stop");
      if (ch === "silence") {
        window.eazoSilenceLaugh?.stopNow?.();
        fx()?.clearChannel?.("audio");
        showSummary(t("market.silenceStopped"));
      }
    });
    // 失去主体阶段结束：快乐状态已被确认，来源不可用。
    window.addEventListener("eazo:silence-dissolved", () => showSummary(t("market.silenceConfirmed")));
    document.getElementById("market-detail-close")?.addEventListener("click", closeDetail);
    document.getElementById("market-detail-cart")?.addEventListener("click", () => { if (detailProduct) { addToCart(detailProduct); closeDetail(); } });
    document.getElementById("market-detail-buy")?.addEventListener("click", () => { if (detailProduct) { const p = detailProduct; closeDetail(); cart = [p]; renderCart(); checkout(); } });
    // Model-item focus-state actions (fullscreen, no dialog) — use current focus product
    document.getElementById("vru-focus-cart")?.addEventListener("click", (e) => { e.stopPropagation(); if (detailProduct) { addToCart(detailProduct); window.eazoMarketModel?.closeFocus?.(); } });
    document.getElementById("vru-focus-buy")?.addEventListener("click", (e) => { e.stopPropagation(); if (detailProduct) { const p = detailProduct; window.eazoMarketModel?.closeFocus?.(); cart = [p]; renderCart(); checkout(); } });
    document.getElementById("market-checkout")?.addEventListener("click", checkout);

    // ── Lottery focus: close controls ──
    document.getElementById("lottery-focus-close")?.addEventListener("click", (e) => { e.stopPropagation(); closeLottery(); });
    // Click on empty backdrop closes; clicks on paper/station/buttons do not.
    focusLayer?.addEventListener("click", (e) => { if (e.target === focusLayer) closeLottery(); });
    focusLayer?.querySelector(".lottery-object")?.addEventListener("click", (e) => e.stopPropagation());
    focusLayer?.querySelector(".lottery-scratch-station")?.addEventListener("click", (e) => e.stopPropagation());
    claimButton?.addEventListener("click", (e) => { e.stopPropagation(); claimTicket(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isLotteryOpen()) closeLottery(); });

    // ── Scratch pointer events (mouse + touch via Pointer Events) ──
    if (scratchCanvas) {
      scratchCanvas.addEventListener("pointerdown", (event) => {
        if (ticketState.claimed) return;
        scratching = true;
        try { scratchCanvas.setPointerCapture(event.pointerId); } catch (_e) {}
        lastPoint = getCanvasPoint(scratchCanvas, event);
        scratchStroke(lastPoint.x, lastPoint.y, null);
        scheduleScratchCheck();
      });
      scratchCanvas.addEventListener("pointermove", (event) => {
        if (!scratching) return;
        const point = getCanvasPoint(scratchCanvas, event);
        scratchStroke(point.x, point.y, lastPoint);
        lastPoint = point;
        scheduleScratchCheck();
      });
      const stopScratch = (event) => {
        scratching = false; lastPoint = null;
        try { scratchCanvas.releasePointerCapture(event.pointerId); } catch (_e) {}
      };
      scratchCanvas.addEventListener("pointerup", stopScratch);
      scratchCanvas.addEventListener("pointercancel", stopScratch);
    }

    window.addEventListener("eazo:localechange", () => { if (opened) { renderShelf(); renderCart(); refreshShelfUsed(); } });

    // global fx subscription (corner + silence summary) — always on, even outside scene
    subscribeFx();
    bound = true;
  }

  function subscribeFx() {
    const f = fx();
    if (!f || fxUnsub) return;
    fxUnsub = f.subscribe((snap) => { renderCorner(snap); watchSilence(snap); });
    renderCorner(f.snapshot());
    silenceWasActive = f.silenceActive();
  }

  function currentAge() { return window.eazoGetAge ? window.eazoGetAge() : 0; }

  function open() {
    bind();
    if (!root) return;
    if (currentAge() < 18) return; // gate handled by app.js, defensive here
    document.querySelector(".app-shell")?.classList.add("market-mode");
    root.classList.add("open");
    root.setAttribute("aria-hidden", "false");
    opened = true;
    resetTicket();   // a fresh lottery ticket each time you enter the market
    if (ageEl) ageEl.textContent = String(currentAge());
    renderShelf(); renderCart(); refreshShelfUsed();
    receipt.classList.remove("show");
    say("market.npc.enter");
    resetIdleTimer();
    document.getElementById("market-back")?.focus({ preventScroll: true });
  }
  function close() {
    opened = false;
    window.clearTimeout(npcTimer);
    if (isLotteryOpen()) closeLottery();
    window.eazoMarketModel?.closeFocus?.();
    window.eazoMarketModel?.unmountShelf?.();
    if (root) { root.classList.remove("open"); root.setAttribute("aria-hidden", "true"); }
    document.querySelector(".app-shell")?.classList.remove("market-mode");
    say("market.npc.leave");
  }

  // late fx readiness
  window.addEventListener("eazo:fxready", subscribeFx);
  if (document.readyState !== "loading") { bind(); } else { document.addEventListener("DOMContentLoaded", bind); }

  window.eazoMarket = { open, close };
})();
