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
    { id: "cigarettes", code: "ITM-02", price: 10, duration: 120000 },
    { id: "energy",     code: "ITM-03", price: 8,  duration: 90000 },
    { id: "lottery",    code: "ITM-04", price: 5,  duration: 0 },
    { id: "silence",    code: "ITM-05", price: 15, duration: 60000 },
  ];

  let root, shelf, cartList, cartEmpty, cartTotal, npcLine, receipt, ageEl;
  let detailLayer, lotteryLayer, cornerEl, summaryToast;
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
  function renderShelf() {
    if (!shelf) return;
    shelf.innerHTML = "";
    PRODUCTS.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "market-item";
      btn.dataset.id = p.id;
      btn.innerHTML =
        '<span class="market-item-bag" aria-hidden="true"></span>' +
        `<span class="market-item-name">${pname(p.id)}</span>` +
        `<span class="market-item-en">${p.code}</span>` +
        `<span class="market-item-price">${p.price} ${t("market.currency")}</span>`;
      btn.addEventListener("click", () => {
        if (p.id === "lottery") openLottery();
        else openDetail(p);
      });
      shelf.appendChild(btn);
    });
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

  // ── Effect application (delegates to eazoFx, resolves oil-film combo) ──
  function applyProduct(id) {
    const f = fx(); if (!f) return;
    if (id === "alcohol" || id === "cigarettes") {
      // both visual → check if the OTHER visual is currently active → combine
      const other = id === "alcohol" ? "cigarettes" : "alcohol";
      if (f.has(other)) { f.apply("filmoil", { duration: 120000 }); return; }
      f.apply(id);
    } else if (id === "energy") {
      f.apply("energy");
    } else if (id === "silence") {
      f.apply("silence");
    }
  }

  function refreshShelfUsed() {
    const active = fx()?.activeIds?.() || new Set();
    shelf?.querySelectorAll(".market-item").forEach((el) => {
      const id = el.dataset.id;
      el.classList.toggle("used", active.has(id) || (id === "alcohol" || id === "cigarettes" ? active.has("filmoil") : false));
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
      .map((e) => `<div class="fx-chip"><b>${effectLabel(e.id)}</b><span class="fx-time">${fmtTime(e.remaining)}</span></div>`)
      .join("");
    if (opened) refreshShelfUsed();
  }
  function effectLabel(id) {
    if (id === "filmoil") return t("market.fx.filmoil");
    return t(`market.items.${id}.name`);
  }

  // =====================================================================
  // LOTTERY — scratch-to-reveal, one ticket per session
  // =====================================================================
  const SESSION_TICKET_KEY = "silentStarMap.market.ticketUsed";
  let scratchCanvas, scratchCtx, scratched = false, drawing = false, ticketResolved = false;

  function ticketUsed() {
    try { return sessionStorage.getItem(SESSION_TICKET_KEY) === "1"; } catch (_e) { return false; }
  }
  function markTicketUsed() {
    try { sessionStorage.setItem(SESSION_TICKET_KEY, "1"); } catch (_e) {}
  }

  function pickPrize() {
    const r = Math.random();
    if (r < 0.14) return "freeItem";
    if (r < 0.30) return "extend";
    if (r < 0.46) return "color";
    if (r < 0.60) return "fakePriv";
    return "nothing";
  }

  function openLottery() {
    const resultEl = document.getElementById("market-lottery-result");
    const prizeEl = document.getElementById("market-scratch-prize");
    if (ticketUsed()) {
      lotteryLayer.classList.add("open");
      lotteryLayer.setAttribute("aria-hidden", "false");
      prizeEl.textContent = "";
      resultEl.textContent = t("market.lotteryUsed");
      scratchCanvas.style.display = "none";
      return;
    }
    scratchCanvas.style.display = "block";
    resultEl.textContent = "";
    scratched = false; ticketResolved = false;
    const prize = pickPrize();
    lotteryLayer.dataset.prize = prize;
    prizeEl.textContent = t(`market.prize.${prize}`);
    lotteryLayer.classList.add("open");
    lotteryLayer.setAttribute("aria-hidden", "false");
    setupScratch();
  }
  function closeLottery() {
    lotteryLayer.classList.remove("open");
    lotteryLayer.setAttribute("aria-hidden", "true");
  }

  function setupScratch() {
    const wrap = scratchCanvas.parentElement;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    scratchCanvas.width = rect.width * dpr;
    scratchCanvas.height = rect.height * dpr;
    scratchCtx = scratchCanvas.getContext("2d");
    scratchCtx.scale(dpr, dpr);
    scratchCtx.fillStyle = "#243a30";
    scratchCtx.fillRect(0, 0, rect.width, rect.height);
    scratchCtx.fillStyle = "rgba(180,210,196,.6)";
    scratchCtx.font = "12px ui-monospace,monospace";
    scratchCtx.textAlign = "center";
    scratchCtx.fillText(t("market.scratchHint"), rect.width / 2, rect.height / 2);
    scratchCtx.globalCompositeOperation = "destination-out";
  }
  function scratchAt(e) {
    if (!drawing || scratched) return;
    const rect = scratchCanvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    scratchCtx.beginPath();
    scratchCtx.arc(cx, cy, 16, 0, Math.PI * 2);
    scratchCtx.fill();
    maybeReveal();
  }
  function maybeReveal() {
    // sample coverage
    const w = scratchCanvas.width, h = scratchCanvas.height;
    const data = scratchCtx.getImageData(0, 0, w, h).data;
    let clear = 0;
    for (let i = 3; i < data.length; i += 40) if (data[i] === 0) clear++;
    const ratio = clear / (data.length / 40);
    if (ratio > 0.5 && !ticketResolved) resolveTicket();
  }
  function resolveTicket() {
    ticketResolved = true; scratched = true;
    markTicketUsed();
    const prize = lotteryLayer.dataset.prize;
    const resultEl = document.getElementById("market-lottery-result");
    applyPrize(prize, resultEl);
    scratchCanvas.style.display = "none";
  }
  function applyPrize(prize, resultEl) {
    const f = fx();
    switch (prize) {
      case "freeItem":
        f?.apply("energy");
        resultEl.textContent = t("market.prizeResult.freeItem");
        refreshShelfUsed();
        break;
      case "extend":
        f?.extendAny(30000);
        resultEl.textContent = t("market.prizeResult.extend");
        break;
      case "color":
        document.documentElement.classList.add("fx-lottery-color");
        window.setTimeout(() => document.documentElement.classList.remove("fx-lottery-color"), 120000);
        resultEl.textContent = t("market.prizeResult.color");
        break;
      case "fakePriv":
        resultEl.textContent = t("market.prizeResult.fakePriv");
        break;
      default:
        resultEl.textContent = t("market.prizeResult.nothing");
    }
  }

  // ── mouse tracking for refraction focus ──
  function onPointerMove(e) {
    document.documentElement.style.setProperty("--fx-mx", `${e.clientX}px`);
    document.documentElement.style.setProperty("--fx-my", `${e.clientY}px`);
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
    lotteryLayer = document.getElementById("market-lottery");
    cornerEl = document.getElementById("fx-corner");
    summaryToast = document.getElementById("fx-summary-toast");
    scratchCanvas = document.getElementById("market-scratch");

    document.getElementById("market-back")?.addEventListener("click", close);
    document.getElementById("market-detail-close")?.addEventListener("click", closeDetail);
    document.getElementById("market-detail-cart")?.addEventListener("click", () => { if (detailProduct) { addToCart(detailProduct); closeDetail(); } });
    document.getElementById("market-detail-buy")?.addEventListener("click", () => { if (detailProduct) { const p = detailProduct; closeDetail(); cart = [p]; renderCart(); checkout(); } });
    document.getElementById("market-checkout")?.addEventListener("click", checkout);
    document.getElementById("market-lottery-close")?.addEventListener("click", closeLottery);

    // scratch events
    const start = (e) => { drawing = true; scratchAt(e); e.preventDefault(); };
    const move = (e) => scratchAt(e);
    const end = () => { drawing = false; };
    scratchCanvas.addEventListener("mousedown", start);
    scratchCanvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    scratchCanvas.addEventListener("touchstart", start, { passive: false });
    scratchCanvas.addEventListener("touchmove", (e) => { scratchAt(e); e.preventDefault(); }, { passive: false });
    scratchCanvas.addEventListener("touchend", end);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
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
    if (root) { root.classList.remove("open"); root.setAttribute("aria-hidden", "true"); }
    document.querySelector(".app-shell")?.classList.remove("market-mode");
    say("market.npc.leave");
  }

  // late fx readiness
  window.addEventListener("eazo:fxready", subscribeFx);
  if (document.readyState !== "loading") { bind(); } else { document.addEventListener("DOMContentLoaded", bind); }

  window.eazoMarket = { open, close };
})();
