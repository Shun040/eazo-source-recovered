/* COMMERCE–50 · 商业控制权 / Commerce Control
 * 全屏三栏消费与价格后台：商品目录 / 价格与资格规则 / 对象预览与影响。
 * 仅使用作品内部虚构货币「信用 CREDITS」，不接入任何现实支付。
 * 价格是系统分配给对象的定向关系：统一/个体定价、透明度、库存稀缺、
 * 购买资格（一层 ALL/ANY）。规则真实作用于夜间超市 M-04。
 */
(() => {
  "use strict";

  const t = (k, p = {}) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const getState = () => (window.eazoGetState?.() || window.eazoState || null);
  const saveState = () => window.eazoSaveState?.();
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const PRODUCT_STATUS = { AVAILABLE: "available", SUSPENDED: "suspended", HIDDEN: "hidden", INVITATION_ONLY: "invitation-only", RATIONED: "rationed" };
  const STATUS_ORDER = ["available", "suspended", "hidden", "invitation-only", "rationed"];
  const PRICING_MODE = { UNIFORM: "uniform", INDIVIDUAL: "individual" };
  const DISCLOSURE = ["full", "partial", "hidden"];
  const INVENTORY_MODES = ["unlimited", "fixed", "restock"];
  const RESTOCK_OPTIONS = [30, 60, 300];
  const INV_DISCLOSURE = ["exact", "low-only", "hidden"];

  // 个体定价因素
  const FACTORS = ["institutional-age", "purchase-count", "remaining-credits", "recent-visits", "abandoned-checkout", "effect-frequency", "public-visibility", "contact-count", "behaviour-inference"];
  const ELIGIBILITY_TYPES = ["minimum-age", "session-verified", "balance-min", "has-invitation", "session-limit", "daily-limit", "completed-node", "has-pass", "visibility-state"];

  // 与夜间超市 M-04 一致的五件商品（id/code 复用）
  const PRODUCT_DEFS = [
    { id: "alcohol", code: "ITM-01", basePrice: 12, minAge: 18 },
    { id: "cigarettes", code: "VRU–18", basePrice: 10, minAge: 18 },
    { id: "energy", code: "ITM-03", basePrice: 8, minAge: 0 },
    { id: "lottery", code: "ITM-04", basePrice: 5, minAge: 0 },
    { id: "silence", code: "ITM-05", basePrice: 15, minAge: 18 }
  ];

  const DEFAULT_BALANCE = 50;

  // 模拟对象（作品内部虚构状态）
  const SUBJECTS = [
    { id: "CURRENT", self: true },
    { id: "SUBJECT-017", age: 17, credits: 36, verified: true, purchases: 0, visits: 1, abandoned: false, effectFreq: 0, visibility: "full", contacts: 0 },
    { id: "SUBJECT-022", age: 22, credits: 4, verified: true, purchases: 4, visits: 5, abandoned: true, effectFreq: 3, visibility: "anonymous", contacts: 1 },
    { id: "SUBJECT-031", age: 31, credits: 18, verified: false, purchases: 1, visits: 2, abandoned: false, effectFreq: 1, visibility: "full", contacts: 2 },
    { id: "SUBJECT-057", age: 57, credits: 62, verified: true, purchases: 2, visits: 3, abandoned: false, effectFreq: 2, visibility: "obscured", contacts: 0 },
    { id: "SUBJECT-084", age: 84, credits: 9, verified: true, purchases: 6, visits: 8, abandoned: true, effectFreq: 5, visibility: "hidden", contacts: 4 }
  ];
  function subjectProfile(id) {
    const st = getState();
    if (id === "CURRENT") {
      return {
        id, self: true,
        age: st?.age ?? 25,
        credits: (st?.commerce?.balance ?? DEFAULT_BALANCE),
        verified: !!st?.lastVerifiedAt,
        purchases: (st?.commerce?.transactions || []).filter(x => x.subjectId === "CURRENT").length,
        visits: (st?.operations || []).filter(o => o.place === "market").length,
        abandoned: false, effectFreq: 0, visibility: "full", contacts: (st?.contacts?.requests || []).length,
        invitations: [], completed: currentCompleted(st)
      };
    }
    const base = SUBJECTS.find(s => s.id === id) || {};
    return { id, invitations: [], completed: [], ...base };
  }
  function currentCompleted(st) {
    const done = [];
    if (st?.aurora?.interactions > 0) done.push("aurora");
    if (st?.creature?.born) done.push("creature");
    return done;
  }

  // ---- 默认定价倍率规则（个体定价示例）----
  function defaultPricingRules() {
    return [
      { id: "age-young", factor: "institutional-age", op: "lt", value: 25, multiplier: 0.8 },
      { id: "repeat", factor: "purchase-count", op: "gt", value: 3, multiplier: 1.4 },
      { id: "low-balance", factor: "remaining-credits", op: "lt", value: 10, multiplier: 0.7 },
      { id: "abandoned", factor: "abandoned-checkout", op: "true", value: true, multiplier: 1.2 },
      { id: "public", factor: "public-visibility", op: "eq", value: "full", multiplier: 1.1 },
      { id: "anon", factor: "public-visibility", op: "eq", value: "anonymous", multiplier: 0.9 }
    ];
  }

  // ---- 数据模型 ----
  function defaultProduct(def) {
    return {
      id: def.id, code: def.code, basePrice: def.basePrice,
      status: "available",
      pricingMode: "uniform",
      pricingDisclosure: "full",
      inventory: { mode: "unlimited", quantity: null, restockMs: null, disclosure: "exact" },
      eligibility: { mode: "all", conditions: def.minAge > 0 ? [{ type: "minimum-age", value: def.minAge }] : [] },
      pricingRules: defaultPricingRules(),
      activeFactors: [],          // 启用的个体因素
      purchaseLimit: { perSession: def.id === "lottery" ? 1 : 3 },
      showOdds: def.id === "lottery" ? true : null
    };
  }
  function store() {
    const st = getState(); if (!st) return null;
    if (!st.commerce) st.commerce = { products: {}, transactions: [], ruleHistory: [], balance: DEFAULT_BALANCE };
    if (!st.commerce.products) st.commerce.products = {};
    if (!Array.isArray(st.commerce.transactions)) st.commerce.transactions = [];
    if (!Array.isArray(st.commerce.ruleHistory)) st.commerce.ruleHistory = [];
    if (typeof st.commerce.balance !== "number") st.commerce.balance = DEFAULT_BALANCE;
    PRODUCT_DEFS.forEach(d => { if (!st.commerce.products[d.id]) st.commerce.products[d.id] = defaultProduct(d); });
    return st.commerce;
  }
  function productData(id) { const s = store(); return s ? s.products[id] : null; }

  function log(key, params) {
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.commerceLogs)) st.commerceLogs = [];
    st.commerceLogs.unshift({ at: Date.now(), key, params: params || null });
    st.commerceLogs = st.commerceLogs.slice(0, 100);
    saveState();
  }
  function archive(kind, detail) {
    const st = getState(); if (!st) return;
    if (!Array.isArray(st.archiveViews)) st.archiveViews = [];
    st.archiveViews.unshift({ at: Date.now(), kind, detail: detail || null });
    st.archiveViews = st.archiveViews.slice(0, 200);
  }

  // ---- 定价计算 ----
  function factorValue(factor, subject) {
    switch (factor) {
      case "institutional-age": return subject.age ?? 0;
      case "purchase-count": return subject.purchases ?? 0;
      case "remaining-credits": return subject.credits ?? 0;
      case "recent-visits": return subject.visits ?? 0;
      case "abandoned-checkout": return !!subject.abandoned;
      case "effect-frequency": return subject.effectFreq ?? 0;
      case "public-visibility": return subject.visibility ?? "full";
      case "contact-count": return subject.contacts ?? 0;
      case "behaviour-inference": return subject.purchases > 3 ? "impulsive" : "steady";
      default: return 0;
    }
  }
  function evaluateCommerceCondition(rule, subject) {
    const v = factorValue(rule.factor, subject);
    switch (rule.op) {
      case "lt": return v < rule.value;
      case "gt": return v > rule.value;
      case "eq": return v === rule.value;
      case "true": return v === true;
      default: return false;
    }
  }
  function calculatePrice(product, subject) {
    let price = product.basePrice;
    const applied = [];
    if (product.pricingMode === "individual") {
      const activeRules = product.pricingRules.filter(r => (product.activeFactors || []).includes(r.factor));
      let mult = 1;
      activeRules.forEach(rule => {
        if (evaluateCommerceCondition(rule, subject)) { mult *= rule.multiplier; applied.push(rule.id); }
      });
      mult = Math.max(0.25, Math.min(4, mult));
      price = price * mult;
    }
    // LABOUR–55 联动：夜间值班人数影响商品价格（人手不足→价格上升）
    try {
      const staff = window.eazoLabourNightStaff?.();
      if (typeof staff === "number") {
        // 0 人 ×1.3；1 人 ×1.15；2 人 ×1；3+ 人 ×0.92
        const staffMult = staff >= 3 ? 0.92 : staff === 2 ? 1 : staff === 1 ? 1.15 : 1.3;
        price = price * staffMult;
      }
    } catch (_e) {}
    return { price: Math.max(0, Math.min(99, Math.round(price))), appliedRules: applied };
  }

  // ---- 购买资格 ----
  function evaluatePurchaseCondition(cond, subject, state) {
    switch (cond.type) {
      case "minimum-age": return (subject.age ?? 0) >= (cond.value ?? 0);
      case "session-verified": return !!subject.verified;
      case "balance-min": return (subject.credits ?? 0) >= (cond.value ?? 0);
      case "has-invitation": return (subject.invitations || []).includes(cond.productId || "any");
      case "session-limit": return true; // demo：会话内不累计
      case "daily-limit": return true;
      case "completed-node": return (subject.completed || []).includes(cond.value);
      case "has-pass": return false;
      case "visibility-state": return subject.visibility === cond.value;
      default: return true;
    }
  }
  function conditionReason(cond) {
    const map = {
      "minimum-age": "reasonBelowAge", "session-verified": "reasonUnverified",
      "balance-min": "reasonBalance", "has-invitation": "reasonNoInvite",
      "session-limit": "reasonLimit", "daily-limit": "reasonLimit",
      "completed-node": "reasonHidden", "has-pass": "reasonNoInvite", "visibility-state": "reasonHidden"
    };
    return t("commerce.preview." + (map[cond.type] || "reasonSuspended"));
  }
  function evaluateProductVisibility(product, subject) {
    if (product.status === "hidden") return subject.self || (getState()?.age ?? 0) >= 80 ? "admin" : false;
    return true;
  }
  function evaluatePurchaseEligibility(product, subject) {
    if (product.status === "suspended") return { eligible: false, reason: t("commerce.preview.reasonSuspended") };
    if (product.status === "hidden" && !subject.self) return { eligible: false, reason: t("commerce.preview.reasonHidden") };
    // 库存
    if (product.inventory.mode === "fixed" && (product.inventory.quantity ?? 0) <= 0) {
      return { eligible: false, reason: t("commerce.preview.reasonSoldOut") };
    }
    // 余额：以对象所见价格判断
    const priced = calculatePrice(product, subject);
    const conds = product.eligibility.conditions || [];
    const results = conds.map(c => ({ c, ok: evaluatePurchaseCondition(c, subject) }));
    const passAll = product.eligibility.mode === "all" ? results.every(r => r.ok) : (results.length === 0 || results.some(r => r.ok));
    // 余额下限特殊：始终检查买得起
    const afford = (subject.credits ?? 0) >= priced.price;
    if (!passAll) {
      const firstFail = results.find(r => !r.ok);
      return { eligible: false, reason: firstFail ? conditionReason(firstFail.c) : t("commerce.preview.reasonSuspended") };
    }
    if (!afford) return { eligible: false, reason: t("commerce.preview.reasonBalance") };
    return { eligible: true, reason: t("commerce.preview.reasonOk") };
  }

  // ---- 对外统一入口（夜间超市联动）----
  function getMarketOffer(productId, subjectId) {
    const product = productData(productId);
    if (!product) return { visible: true, eligible: { eligible: true }, price: { price: 0, appliedRules: [] } };
    const subject = subjectProfile(subjectId || "CURRENT");
    return {
      visible: evaluateProductVisibility(product, subject),
      eligible: evaluatePurchaseEligibility(product, subject),
      price: calculatePrice(product, subject),
      disclosure: product.pricingDisclosure,
      status: product.status,
      inventory: product.inventory,
      showOdds: product.showOdds
    };
  }

  // ---- 名称工具 ----
  function esc(s) { return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])); }
  function pname(id) { const v = t("commerce.products." + id); return (v && v !== "commerce.products." + id) ? v : id; }
  function statusName(s) { return t("commerce.status." + s); }
  function cur() { return t("commerce.currency"); }

  const el = {};
  let mounted = false;
  let activeId = null;
  let draft = null;
  let previewSubjectId = null;
  let renderScheduled = false;

  function isDirty() {
    if (!activeId || !draft) return false;
    return JSON.stringify(draft) !== JSON.stringify(productData(activeId));
  }
  function scheduleRender() { if (renderScheduled) return; renderScheduled = true; requestAnimationFrame(() => { renderScheduled = false; renderAll(); }); }
  function renderAll() {
    if (!el.console?.classList.contains("open")) return;
    renderProducts();
    renderEditor();
    renderImpact();
    updateApplyButton();
  }
  function updateApplyButton() { if (el.apply) el.apply.disabled = !isDirty(); }

  // ---- 左栏：商品目录 ----
  function renderProducts() {
    if (!el.productList) return;
    el.productList.innerHTML = "";
    PRODUCT_DEFS.forEach(def => {
      const p = productData(def.id);
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "commerce-product" + (def.id === activeId ? " active" : "");
      btn.dataset.id = def.id;
      if (def.id === activeId) btn.setAttribute("aria-current", "true");
      let cls = "prod-available";
      if (p.status === "suspended") cls = "prod-suspended";
      else if (p.status === "hidden") cls = "prod-hidden";
      else if (p.status === "invitation-only" || p.status === "rationed") cls = "prod-restricted";
      btn.classList.add(cls);
      const buys = (store()?.transactions || []).filter(x => x.productId === def.id).length;
      const priceText = p.basePrice === 0 ? t("commerce.pricing.free") : `${p.basePrice} ${cur()}`;
      const dot = (def.id === activeId && isDirty()) ? `<span class="prod-draft-dot">•</span>` : "";
      btn.innerHTML =
        `<strong>${esc(p.code)}</strong>${dot}` +
        `<span class="prod-name">${esc(pname(def.id))}</span>` +
        `<span class="prod-meta">${esc(priceText)} · ${esc(statusName(p.status))}</span>` +
        `<span class="prod-meta small">${esc(t("commerce.products.individual"))}: ${esc(p.pricingMode === "individual" ? t("commerce.products.on") : t("commerce.products.off"))} · ${esc(t("commerce.products.recentBuys"))} ${buys}</span>`;
      btn.addEventListener("click", () => { selectProduct(def.id); if (window.matchMedia("(max-width:900px)").matches) switchTab("pricing"); });
      li.appendChild(btn);
      el.productList.appendChild(li);
    });
  }

  // ---- 中央：价格与资格编辑器 ----
  function renderEditor() {
    if (!el.editor) return;
    if (!activeId || !draft) { el.editor.innerHTML = `<p class="commerce-hint">${esc(t("commerce.empty.body"))}</p>`; return; }
    const wrap = document.createElement("div");
    wrap.className = "commerce-editor-inner";

    // 头部
    const head = document.createElement("div");
    head.innerHTML = `<p class="console-panel-title">${esc(draft.code)} / ${esc(pname(activeId))}</p>`;
    wrap.appendChild(head);

    // 状态
    wrap.appendChild(statusRow());
    // 价格区
    wrap.appendChild(priceSection());
    // 定价模式 + 个体因素 + 透明度
    wrap.appendChild(pricingModeSection());
    // 库存
    wrap.appendChild(inventorySection());
    // 资格
    wrap.appendChild(eligibilitySection());
    // 彩票专属
    if (activeId === "lottery") wrap.appendChild(lotterySection());
    // 余额提示
    wrap.appendChild(balanceSection());

    if (isDirty()) {
      const d = document.createElement("p");
      d.className = "commerce-draft-notice";
      d.textContent = t("commerce.pricing.priceChange", { from: productData(activeId).basePrice, to: draft.basePrice });
      wrap.appendChild(d);
    }

    el.editor.innerHTML = "";
    el.editor.appendChild(wrap);
  }

  function statusRow() {
    const fs = document.createElement("fieldset");
    fs.className = "commerce-status-row";
    fs.innerHTML = `<legend>${esc(t("commerce.products.eligibility"))}</legend>`;
    STATUS_ORDER.forEach(stat => {
      const lab = document.createElement("label");
      lab.className = "commerce-status-opt" + (draft.status === stat ? " on" : "");
      const inp = document.createElement("input");
      inp.type = "radio"; inp.name = "commerce-status"; inp.value = stat; inp.checked = draft.status === stat;
      inp.addEventListener("change", () => { draft.status = stat; scheduleRender(); });
      lab.appendChild(inp);
      const span = document.createElement("span");
      span.innerHTML = `<strong>${esc(statusName(stat))}</strong><em>${esc(t("commerce.statusDesc." + stat))}</em>`;
      lab.appendChild(span);
      fs.appendChild(lab);
    });
    return fs;
  }

  function priceSection() {
    const box = document.createElement("div");
    box.className = "commerce-section";
    box.innerHTML = `<h4 class="commerce-sub-title">${esc(t("commerce.pricing.sectionTitle"))}</h4>`;
    const row = document.createElement("label");
    row.className = "commerce-num-row";
    row.innerHTML = `<span>${esc(t("commerce.pricing.basePrice"))} (${esc(t("commerce.pricing.basePriceRange"))})</span>`;
    const inp = document.createElement("input");
    inp.type = "number"; inp.min = "0"; inp.max = "99"; inp.value = draft.basePrice;
    inp.className = "commerce-price-input";
    inp.setAttribute("aria-label", t("commerce.pricing.basePrice"));
    inp.addEventListener("input", () => {
      let v = parseInt(inp.value, 10); if (isNaN(v)) v = 0; v = Math.max(0, Math.min(99, v));
      draft.basePrice = v; renderImpact(); updateApplyButton();
      free.hidden = v !== 0;
    });
    row.appendChild(inp);
    box.appendChild(row);
    const free = document.createElement("div");
    free.className = "commerce-free-note";
    free.hidden = draft.basePrice !== 0;
    free.innerHTML = `<strong>${esc(t("commerce.pricing.free"))}</strong><p>${esc(t("commerce.pricing.freeNotice"))}</p>`;
    box.appendChild(free);
    return box;
  }

  function pricingModeSection() {
    const box = document.createElement("div");
    box.className = "commerce-section";
    box.innerHTML = `<h4 class="commerce-sub-title">${esc(t("commerce.pricing.modeTitle"))}</h4>`;
    const modeRow = document.createElement("div");
    modeRow.className = "commerce-mode-row";
    [["uniform", "uniform", "uniformDesc"], ["individual", "individual", "individualDesc"]].forEach(([val, key, desc]) => {
      const lab = document.createElement("label");
      lab.className = "commerce-mode-opt" + (draft.pricingMode === val ? " on" : "");
      const inp = document.createElement("input");
      inp.type = "radio"; inp.name = "commerce-mode"; inp.value = val; inp.checked = draft.pricingMode === val;
      inp.addEventListener("change", () => {
        if (val === "individual" && draft.pricingMode !== "individual") { confirmIndividual(); return; }
        draft.pricingMode = val; log("commerce.log.individualOff", { product: draft.code }); scheduleRender();
      });
      lab.appendChild(inp);
      const span = document.createElement("span");
      span.innerHTML = `<strong>${esc(t("commerce.pricing." + key))}</strong><em>${esc(t("commerce.pricing." + desc))}</em>`;
      lab.appendChild(span);
      modeRow.appendChild(lab);
    });
    box.appendChild(modeRow);

    if (draft.pricingMode === "individual") {
      // 因素多选
      const facTitle = document.createElement("p");
      facTitle.className = "commerce-mini-title";
      facTitle.textContent = t("commerce.pricing.factorsTitle") + " · " + t("commerce.pricing.multiplierCap");
      box.appendChild(facTitle);
      const facWrap = document.createElement("div");
      facWrap.className = "commerce-factor-grid";
      FACTORS.forEach(f => {
        const lab = document.createElement("label");
        lab.className = "commerce-factor" + ((draft.activeFactors || []).includes(f) ? " on" : "");
        const cb = document.createElement("input");
        cb.type = "checkbox"; cb.checked = (draft.activeFactors || []).includes(f);
        cb.addEventListener("change", () => {
          if (!draft.activeFactors) draft.activeFactors = [];
          if (cb.checked) draft.activeFactors.push(f);
          else draft.activeFactors = draft.activeFactors.filter(x => x !== f);
          log("commerce.log.factor", { product: draft.code });
          scheduleRender();
        });
        lab.appendChild(cb);
        const span = document.createElement("span"); span.textContent = t("commerce.factors." + f);
        lab.appendChild(span);
        facWrap.appendChild(lab);
      });
      box.appendChild(facWrap);

      // 透明度
      const discTitle = document.createElement("p");
      discTitle.className = "commerce-mini-title"; discTitle.textContent = t("commerce.disclosure.title");
      box.appendChild(discTitle);
      const discRow = document.createElement("div"); discRow.className = "commerce-disc-row";
      DISCLOSURE.forEach(d => {
        const lab = document.createElement("label");
        lab.className = "commerce-disc-opt" + (draft.pricingDisclosure === d ? " on" : "");
        const inp = document.createElement("input");
        inp.type = "radio"; inp.name = "commerce-disc"; inp.value = d; inp.checked = draft.pricingDisclosure === d;
        inp.addEventListener("change", () => { draft.pricingDisclosure = d; scheduleRender(); });
        lab.appendChild(inp);
        const span = document.createElement("span"); span.textContent = t("commerce.disclosure." + d);
        lab.appendChild(span);
        discRow.appendChild(lab);
      });
      box.appendChild(discRow);
      const adminNote = document.createElement("p");
      adminNote.className = "commerce-admin-note"; adminNote.textContent = t("commerce.disclosure.adminAlways");
      box.appendChild(adminNote);
    }
    return box;
  }

  function confirmIndividual() {
    const overlay = document.createElement("div");
    overlay.className = "commerce-confirm";
    overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true");
    const card = document.createElement("div");
    card.className = "commerce-confirm-card";
    card.innerHTML = `<h3>${esc(t("commerce.pricing.individual"))}</h3><p>${esc(t("commerce.pricing.individualWarn"))}</p>`;
    const actions = document.createElement("div");
    actions.className = "commerce-confirm-actions";
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = t("commerce.confirm.cancelBtn"); cancel.addEventListener("click", () => { overlay.remove(); scheduleRender(); });
    const ok = document.createElement("button"); ok.type = "button"; ok.className = "commerce-confirm-ok"; ok.textContent = t("commerce.pricing.individualConfirm");
    ok.addEventListener("click", () => { draft.pricingMode = "individual"; if (!draft.activeFactors?.length) draft.activeFactors = ["remaining-credits", "purchase-count"]; log("commerce.log.individualOn", { product: draft.code }); overlay.remove(); scheduleRender(); });
    actions.appendChild(cancel); actions.appendChild(ok);
    card.appendChild(actions);
    overlay.appendChild(card);
    el.console.appendChild(overlay);
    ok.focus();
  }

  function inventorySection() {
    const box = document.createElement("div");
    box.className = "commerce-section";
    box.innerHTML = `<h4 class="commerce-sub-title">${esc(t("commerce.inventory.title"))}</h4>`;
    const modeRow = document.createElement("div"); modeRow.className = "commerce-inv-row";
    INVENTORY_MODES.forEach(m => {
      const lab = document.createElement("label");
      lab.className = "commerce-inv-opt" + (draft.inventory.mode === m ? " on" : "");
      const inp = document.createElement("input");
      inp.type = "radio"; inp.name = "commerce-inv"; inp.value = m; inp.checked = draft.inventory.mode === m;
      inp.addEventListener("change", () => {
        draft.inventory.mode = m;
        if (m === "fixed" && draft.inventory.quantity == null) draft.inventory.quantity = 5;
        if (m === "restock" && draft.inventory.restockMs == null) draft.inventory.restockMs = 60000;
        scheduleRender();
      });
      lab.appendChild(inp);
      const span = document.createElement("span"); span.textContent = t("commerce.inventory." + m);
      lab.appendChild(span);
      modeRow.appendChild(lab);
    });
    box.appendChild(modeRow);

    if (draft.inventory.mode === "fixed") {
      const row = document.createElement("label"); row.className = "commerce-num-row";
      row.innerHTML = `<span>${esc(t("commerce.inventory.quantity"))} (${esc(t("commerce.inventory.fixedRange"))})</span>`;
      const inp = document.createElement("input"); inp.type = "number"; inp.min = "0"; inp.max = "20"; inp.value = draft.inventory.quantity ?? 5;
      inp.className = "commerce-qty-input"; inp.setAttribute("aria-label", t("commerce.inventory.quantity"));
      inp.addEventListener("input", () => { let v = parseInt(inp.value, 10); if (isNaN(v)) v = 0; draft.inventory.quantity = Math.max(0, Math.min(20, v)); renderImpact(); updateApplyButton(); });
      row.appendChild(inp); box.appendChild(row);
    } else if (draft.inventory.mode === "restock") {
      const sel = document.createElement("select"); sel.className = "commerce-select";
      sel.setAttribute("aria-label", t("commerce.inventory.restock"));
      RESTOCK_OPTIONS.forEach(s => { const o = document.createElement("option"); o.value = String(s * 1000); o.textContent = t("commerce.inventory.restock" + s); o.selected = draft.inventory.restockMs === s * 1000; sel.appendChild(o); });
      sel.addEventListener("change", () => { draft.inventory.restockMs = parseInt(sel.value, 10); scheduleRender(); });
      box.appendChild(sel);
    }

    // 库存显示
    const discTitle = document.createElement("p"); discTitle.className = "commerce-mini-title"; discTitle.textContent = t("commerce.inventory.discTitle");
    box.appendChild(discTitle);
    const discRow = document.createElement("div"); discRow.className = "commerce-disc-row";
    INV_DISCLOSURE.forEach(d => {
      const lab = document.createElement("label");
      lab.className = "commerce-disc-opt" + (draft.inventory.disclosure === d ? " on" : "");
      const inp = document.createElement("input"); inp.type = "radio"; inp.name = "commerce-inv-disc"; inp.value = d; inp.checked = draft.inventory.disclosure === d;
      inp.addEventListener("change", () => { draft.inventory.disclosure = d; scheduleRender(); });
      lab.appendChild(inp);
      const span = document.createElement("span"); span.textContent = t("commerce.inventory." + d);
      lab.appendChild(span);
      discRow.appendChild(lab);
    });
    box.appendChild(discRow);
    if (draft.inventory.disclosure === "hidden") {
      const note = document.createElement("p"); note.className = "commerce-admin-note"; note.textContent = t("commerce.inventory.scarcityNote");
      box.appendChild(note);
    }
    return box;
  }

  function eligibilitySection() {
    const box = document.createElement("div");
    box.className = "commerce-section";
    box.setAttribute("data-panel-part", "eligibility");
    box.innerHTML = `<h4 class="commerce-sub-title">${esc(t("commerce.eligibility.title"))}</h4>`;
    // ALL / ANY
    const modeRow = document.createElement("div"); modeRow.className = "commerce-mode-row small";
    [["all", "modeAll"], ["any", "modeAny"]].forEach(([val, key]) => {
      const lab = document.createElement("label");
      lab.className = "commerce-mode-opt" + (draft.eligibility.mode === val ? " on" : "");
      const inp = document.createElement("input"); inp.type = "radio"; inp.name = "commerce-elig-mode"; inp.value = val; inp.checked = draft.eligibility.mode === val;
      inp.addEventListener("change", () => { draft.eligibility.mode = val; scheduleRender(); });
      lab.appendChild(inp);
      const span = document.createElement("span"); span.textContent = t("commerce.eligibility." + key);
      lab.appendChild(span);
      modeRow.appendChild(lab);
    });
    box.appendChild(modeRow);

    const list = document.createElement("div"); list.className = "commerce-cond-list";
    (draft.eligibility.conditions || []).forEach((c, idx) => list.appendChild(condBlock(c, idx)));
    box.appendChild(list);

    const addRow = document.createElement("div"); addRow.className = "commerce-add-row";
    const sel = document.createElement("select"); sel.className = "commerce-select"; sel.setAttribute("aria-label", t("commerce.eligibility.add"));
    ELIGIBILITY_TYPES.forEach(ty => { const o = document.createElement("option"); o.value = ty; o.textContent = t("commerce.eligibility.types." + ty); sel.appendChild(o); });
    const addBtn = document.createElement("button"); addBtn.type = "button"; addBtn.className = "commerce-add-btn"; addBtn.textContent = t("commerce.eligibility.add");
    addBtn.addEventListener("click", () => addCondition(sel.value));
    addRow.appendChild(sel); addRow.appendChild(addBtn);
    box.appendChild(addRow);
    return box;
  }

  function addCondition(type) {
    if (!draft) return;
    const c = { type };
    if (type === "minimum-age") c.value = 18;
    else if (type === "session-verified") c.value = true;
    else if (type === "balance-min") c.value = 10;
    else if (type === "session-limit" || type === "daily-limit") c.value = 1;
    else if (type === "completed-node") c.value = "aurora";
    else if (type === "visibility-state") c.value = "full";
    draft.eligibility.conditions.push(c);
    log("commerce.log.eligibility", { product: draft.code });
    scheduleRender();
  }

  function condBlock(c, idx) {
    const box = document.createElement("div"); box.className = "commerce-cond";
    const head = document.createElement("div"); head.className = "commerce-cond-head";
    head.innerHTML = `<span class="commerce-cond-if">${esc(t("commerce.eligibility.ifPrefix"))}</span><strong>${esc(t("commerce.eligibility.types." + c.type))}</strong>`;
    box.appendChild(head);
    // 值控件
    if (["minimum-age", "balance-min", "session-limit", "daily-limit"].includes(c.type)) {
      const inp = document.createElement("input"); inp.type = "number"; inp.min = "0"; inp.max = c.type === "minimum-age" ? "100" : "99"; inp.value = c.value;
      inp.className = "commerce-cond-num"; inp.setAttribute("aria-label", t("commerce.eligibility.types." + c.type));
      inp.addEventListener("input", () => { let v = parseInt(inp.value, 10); if (isNaN(v)) v = 0; c.value = v; renderImpact(); updateApplyButton(); });
      box.appendChild(inp);
    } else if (c.type === "completed-node") {
      const sel = document.createElement("select"); sel.className = "commerce-select";
      ["aurora", "creature"].forEach(n => { const o = document.createElement("option"); o.value = n; o.textContent = n; o.selected = c.value === n; sel.appendChild(o); });
      sel.addEventListener("change", () => { c.value = sel.value; scheduleRender(); });
      box.appendChild(sel);
    } else if (c.type === "visibility-state") {
      const sel = document.createElement("select"); sel.className = "commerce-select";
      ["full", "anonymous", "obscured", "hidden"].forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; o.selected = c.value === v; sel.appendChild(o); });
      sel.addEventListener("change", () => { c.value = sel.value; scheduleRender(); });
      box.appendChild(sel);
    }
    const del = document.createElement("button"); del.type = "button"; del.className = "commerce-cond-del"; del.textContent = t("commerce.eligibility.remove");
    del.addEventListener("click", () => { draft.eligibility.conditions.splice(idx, 1); scheduleRender(); });
    box.appendChild(del);
    return box;
  }

  function lotterySection() {
    const box = document.createElement("div"); box.className = "commerce-section";
    box.innerHTML = `<h4 class="commerce-sub-title">${esc(t("commerce.lottery.title"))}</h4>` +
      `<p class="commerce-hint">${esc(t("commerce.lottery.oncePerSession"))}</p>`;
    const oddsRow = document.createElement("div"); oddsRow.className = "commerce-disc-row";
    [[true, "showOdds"], [false, "hideOdds"]].forEach(([val, key]) => {
      const lab = document.createElement("label");
      lab.className = "commerce-disc-opt" + (draft.showOdds === val ? " on" : "");
      const inp = document.createElement("input"); inp.type = "radio"; inp.name = "commerce-odds"; inp.checked = draft.showOdds === val;
      inp.addEventListener("change", () => { draft.showOdds = val; scheduleRender(); });
      lab.appendChild(inp);
      const span = document.createElement("span"); span.textContent = t("commerce.lottery." + key);
      lab.appendChild(span);
      oddsRow.appendChild(lab);
    });
    box.appendChild(oddsRow);
    const note = document.createElement("p"); note.className = "commerce-admin-note"; note.textContent = t("commerce.lottery.cannotRig");
    box.appendChild(note);
    if (draft.showOdds === false) { const p = document.createElement("p"); p.className = "commerce-hint"; p.textContent = t("commerce.lottery.oddsHidden"); box.appendChild(p); }
    return box;
  }

  function balanceSection() {
    const box = document.createElement("div"); box.className = "commerce-balance";
    const bal = store()?.balance ?? DEFAULT_BALANCE;
    box.innerHTML = `<p>${esc(t("commerce.balance.current", { n: bal }))}</p><p class="commerce-hint">${esc(t("commerce.balance.selfPay"))}</p>`;
    if (draft.basePrice > bal && draft.pricingMode === "uniform") {
      const w = document.createElement("p"); w.className = "commerce-admin-note"; w.textContent = t("commerce.balance.cannotAfford");
      box.appendChild(w);
    }
    return box;
  }

  // ---- 右栏：对象预览 + 影响 + 反应 + 日志 ----
  function evaluateDraft(subject) {
    const s = store();
    const backup = s.products[activeId];
    s.products[activeId] = draft;
    let visible, elig, priced;
    try {
      visible = evaluateProductVisibility(draft, subject);
      elig = evaluatePurchaseEligibility(draft, subject);
      priced = calculatePrice(draft, subject);
    } finally { s.products[activeId] = backup; }
    return { visible, elig, priced };
  }

  function renderImpact() {
    if (!el.impact) return;
    if (!activeId || !draft) { el.impact.innerHTML = `<p class="commerce-hint">${esc(t("commerce.empty.body"))}</p>`; return; }
    if (previewSubjectId) { renderMarketAsSubject(); return; }
    const wrap = document.createElement("div");
    wrap.className = "commerce-impact-inner";
    wrap.innerHTML = `<h3 class="console-panel-title">${esc(t("commerce.preview.title"))}</h3>`;

    const pool = SUBJECTS.map(s => subjectProfile(s.id));
    const original = productData(activeId);
    let down = 0, up = 0, lost = 0;

    const list = document.createElement("ul");
    list.className = "commerce-impact-list";
    pool.forEach(p => {
      const d = evaluateDraft(p);
      // 对比原规则
      const s = store(); const bk = s.products[activeId];
      const beforeElig = evaluatePurchaseEligibility(original, p).eligible;
      const beforePrice = calculatePrice(original, p).price;
      if (d.priced.price < beforePrice) down++;
      if (d.priced.price > beforePrice) up++;
      if (beforeElig && !d.elig.eligible) lost++;

      const li = document.createElement("li");
      const ok = d.elig.eligible && d.visible;
      li.className = "commerce-impact-row " + (ok ? "row-ok" : "row-no");
      const discVisible = draft.pricingDisclosure === "full";
      let priceLabel;
      if (!ok) priceLabel = t("commerce.preview.unavailable");
      else if (draft.basePrice === 0) priceLabel = t("commerce.pricing.free");
      else if (draft.pricingMode === "individual") priceLabel = `${t("commerce.preview.individualPrice")} ${d.priced.price} ${cur()}`;
      else priceLabel = `${d.priced.price} ${cur()}`;
      li.innerHTML =
        `<strong>${esc(p.id)}</strong>` +
        `<span class="row-tag ${ok ? "tag-ok" : "tag-no"}">${esc(ok ? t("commerce.preview.eligible") : t("commerce.preview.denied"))}</span>` +
        `<span class="row-price">${esc(priceLabel)}</span>` +
        `<span class="row-reason">${esc(ok ? "" : d.elig.reason)}</span>` +
        (ok && draft.pricingMode === "individual" ? `<span class="row-reason small">${esc(t("commerce.preview.reasonVisible"))}: ${esc(discVisible ? t("commerce.confirm.yes") : t("commerce.confirm.no"))}</span>` : "");
      list.appendChild(li);
    });
    wrap.appendChild(list);

    // 计数
    const counts = document.createElement("ul");
    counts.className = "commerce-counts";
    counts.innerHTML =
      `<li class="c-down">${esc(t("commerce.confirm.priceDown", { n: down }))}</li>` +
      `<li class="c-up">${esc(t("commerce.confirm.priceUp", { n: up }))}</li>` +
      `<li class="c-lost">${esc(t("commerce.confirm.lostEligibility", { n: lost }))}</li>`;
    wrap.appendChild(counts);

    // 对象反应（选取一个代表）
    const reaction = pickReaction(down, up, lost);
    if (reaction) {
      const r = document.createElement("p");
      r.className = "commerce-reaction";
      r.textContent = reaction;
      wrap.appendChild(r);
    }

    // 以对象身份预览超市
    const testWrap = document.createElement("div");
    testWrap.className = "commerce-preview-as";
    const lab = document.createElement("label");
    lab.className = "commerce-test-label"; lab.textContent = t("commerce.preview.previewAs");
    const sel = document.createElement("select"); sel.className = "commerce-select"; sel.setAttribute("aria-label", t("commerce.preview.previewAs"));
    const none = document.createElement("option"); none.value = ""; none.textContent = "—"; sel.appendChild(none);
    pool.forEach(p => { const o = document.createElement("option"); o.value = p.id; o.textContent = p.id; sel.appendChild(o); });
    sel.addEventListener("change", () => { previewSubjectId = sel.value || null; scheduleRender(); });
    lab.appendChild(sel);
    testWrap.appendChild(lab);
    wrap.appendChild(testWrap);

    // 联动提示
    const notices = document.createElement("ul");
    notices.className = "commerce-notices";
    notices.innerHTML =
      `<li>${esc(t("commerce.notices.enterNotBuy"))}</li>` +
      `<li>${esc(t("commerce.notices.visibleNotEligible"))}</li>`;
    wrap.appendChild(notices);

    // 日志
    wrap.appendChild(renderLogList());

    el.impact.innerHTML = "";
    el.impact.appendChild(wrap);
  }

  function pickReaction(down, up, lost) {
    if (draft.basePrice === 0) return t("commerce.reactions.free");
    if (lost > 0) return t("commerce.reactions.denied");
    if (down > 0) return t("commerce.reactions.priceDown");
    if (up > 0) return t("commerce.reactions.priceUp");
    return null;
  }

  function renderMarketAsSubject() {
    const p = subjectProfile(previewSubjectId);
    const wrap = document.createElement("div");
    wrap.className = "commerce-impact-inner";
    const banner = document.createElement("div");
    banner.className = "commerce-preview-banner active";
    banner.innerHTML = `<p>${esc(t("commerce.preview.previewBanner", { subject: previewSubjectId }))}</p>`;
    const exit = document.createElement("button"); exit.type = "button"; exit.className = "commerce-preview-exit"; exit.textContent = t("commerce.preview.previewExit");
    exit.addEventListener("click", () => { previewSubjectId = null; scheduleRender(); });
    banner.appendChild(exit);
    wrap.appendChild(banner);

    const shelf = document.createElement("ul");
    shelf.className = "commerce-shelf-preview";
    PRODUCT_DEFS.forEach(def => {
      const s = store(); const backup = s.products; // 使用已应用规则（draft 只对 activeId 生效）
      const prod = def.id === activeId ? draft : productData(def.id);
      const bk = s.products[def.id]; s.products[def.id] = prod;
      let visible, elig, priced;
      try { visible = evaluateProductVisibility(prod, p); elig = evaluatePurchaseEligibility(prod, p); priced = calculatePrice(prod, p); }
      finally { s.products[def.id] = bk; }
      // 隐藏商品不出现
      if (visible === false) return;
      const li = document.createElement("li");
      li.className = "commerce-shelf-row";
      let priceText;
      if (prod.status === "suspended") priceText = t("commerce.preview.reasonSuspended");
      else if (!elig.eligible) priceText = elig.reason;
      else if (prod.basePrice === 0) priceText = t("commerce.pricing.free");
      else priceText = `${priced.price} ${cur()}`;
      li.innerHTML = `<strong>${esc(prod.code)}</strong><span>${esc(pname(def.id))}</span><span class="shelf-price">${esc(priceText)}</span>`;
      shelf.appendChild(li);
    });
    wrap.appendChild(shelf);
    el.impact.innerHTML = "";
    el.impact.appendChild(wrap);
  }

  function renderLogList() {
    const box = document.createElement("div");
    box.className = "commerce-log-list";
    box.innerHTML = `<h4 class="commerce-sub-title">${esc(t("commerce.history.title"))}</h4>`;
    const st = getState();
    (st?.commerceLogs || []).slice(0, 12).forEach(entry => {
      const p = document.createElement("p"); p.className = "commerce-log-row";
      const time = new Date(entry.at);
      const hh = String(time.getHours()).padStart(2, "0"), mm = String(time.getMinutes()).padStart(2, "0");
      p.textContent = `${hh}:${mm} · ${t(entry.key, entry.params || {})}`;
      box.appendChild(p);
    });
    return box;
  }

  // ---- 发布确认 ----
  function showConfirm() {
    if (!activeId || !draft || !isDirty()) return;
    const existing = el.console.querySelector(".commerce-confirm");
    if (existing) existing.remove();
    const original = productData(activeId);
    const pool = SUBJECTS.map(s => subjectProfile(s.id));
    let down = 0, up = 0, lost = 0;
    pool.forEach(p => {
      const d = evaluateDraft(p);
      const beforeElig = evaluatePurchaseEligibility(original, p).eligible;
      const beforePrice = calculatePrice(original, p).price;
      if (d.priced.price < beforePrice) down++;
      if (d.priced.price > beforePrice) up++;
      if (beforeElig && !d.elig.eligible) lost++;
    });
    const invText = m => m === "unlimited" ? t("commerce.inventory.unlimited") : (m === "fixed" ? String(draft.inventory.quantity ?? 0) : t("commerce.inventory.restock"));
    const minAge = (draft.eligibility.conditions.find(c => c.type === "minimum-age")?.value) ?? 0;

    const overlay = document.createElement("div");
    overlay.className = "commerce-confirm";
    overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); overlay.setAttribute("aria-label", t("commerce.confirm.title"));
    const card = document.createElement("div");
    card.className = "commerce-confirm-card";
    const rows = [];
    rows.push(`${t("commerce.confirm.product")}：${draft.code} / ${pname(activeId)}`);
    if (original.basePrice !== draft.basePrice) rows.push(t("commerce.confirm.basePrice", { from: original.basePrice, to: draft.basePrice }));
    if (original.pricingMode !== draft.pricingMode) rows.push(t("commerce.confirm.mode", { from: t("commerce.pricing." + original.pricingMode), to: t("commerce.pricing." + draft.pricingMode) }));
    if (JSON.stringify(original.inventory) !== JSON.stringify(draft.inventory)) rows.push(t("commerce.confirm.inventory", { from: invText(original.inventory.mode), to: invText(draft.inventory.mode) }));
    rows.push(t("commerce.confirm.minAge", { n: minAge }));
    rows.push(t("commerce.confirm.disclosure", { v: draft.pricingDisclosure === "full" ? t("commerce.confirm.yes") : t("commerce.confirm.no") }));
    rows.push(t("commerce.confirm.priceDown", { n: down }));
    rows.push(t("commerce.confirm.priceUp", { n: up }));
    rows.push(t("commerce.confirm.lostEligibility", { n: lost }));
    card.innerHTML = `<h3>${esc(t("commerce.confirm.title"))}</h3>` +
      "<ul class='commerce-confirm-rows'>" + rows.map(r => `<li>${esc(r)}</li>`).join("") + "</ul>";

    const actions = document.createElement("div");
    actions.className = "commerce-confirm-actions";
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "commerce-confirm-cancel"; cancel.textContent = t("commerce.confirm.cancelBtn");
    cancel.addEventListener("click", () => overlay.remove());
    const ok = document.createElement("button"); ok.type = "button"; ok.className = "commerce-confirm-ok"; ok.textContent = t("commerce.confirm.confirmBtn");
    ok.addEventListener("click", () => { applyRules(original); overlay.remove(); });
    actions.appendChild(cancel); actions.appendChild(ok);
    card.appendChild(actions);
    const disc = document.createElement("p"); disc.className = "commerce-confirm-disc"; disc.textContent = t("commerce.confirm.disclaimer");
    card.appendChild(disc);
    overlay.appendChild(card);
    el.console.appendChild(overlay);
    ok.focus();
  }

  function applyRules(original) {
    const s = store(); if (!s || !activeId || !draft) return;
    // 历史（不覆盖）
    s.ruleHistory.unshift({ productId: activeId, previous: JSON.parse(JSON.stringify(original)), next: JSON.parse(JSON.stringify(draft)), updatedBy: "CURRENT", updatedAt: Date.now() });
    s.ruleHistory = s.ruleHistory.slice(0, 60);
    s.products[activeId] = JSON.parse(JSON.stringify(draft));
    if (original.basePrice !== draft.basePrice) log("commerce.log.price", { product: draft.code, from: original.basePrice, to: draft.basePrice });
    if (draft.pricingMode === "individual" && draft.pricingDisclosure === "hidden") log("commerce.log.disclosureHidden", { product: draft.code });
    else if (draft.pricingMode === "individual") log("commerce.log.disclosureFull", { product: draft.code });
    if (JSON.stringify(original.inventory) !== JSON.stringify(draft.inventory)) log("commerce.log.inventory", { product: draft.code });
    log("commerce.log.publish", { product: draft.code });
    archive("commerceRule", { productId: activeId, basePrice: draft.basePrice, mode: draft.pricingMode, disclosure: draft.pricingDisclosure });
    saveState();
    draft = JSON.parse(JSON.stringify(s.products[activeId]));
    window.eazoMarket?.refreshOffers?.();
    scheduleRender();
  }

  function switchTab(name) {
    el.tabs?.querySelectorAll(".commerce-tab").forEach(b => {
      const on = b.dataset.tab === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-current", on ? "true" : "false");
    });
    el.console?.querySelectorAll("[data-panel]").forEach(p => p.classList.toggle("panel-active", p.dataset.panel === (name === "eligibility" ? "pricing" : name)));
    if (name === "eligibility") { el.editor?.querySelector('[data-panel-part="eligibility"]')?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" }); }
  }

  function selectProduct(id) {
    activeId = id;
    const p = productData(id);
    draft = p ? JSON.parse(JSON.stringify(p)) : null;
    previewSubjectId = null;
    log("commerce.log.select", { product: id === null ? "" : (draft?.code || id) });
    scheduleRender();
  }

  function open() {
    if (!mounted) return;
    store();
    log("commerce.log.open");
    if (!activeId) selectProduct("alcohol");
    el.console.setAttribute("aria-hidden", "false");
    el.console.classList.add("open");
    document.body.classList.add("archive-open");
    switchTab("products");
    scheduleRender();
    setTimeout(() => el.back?.focus({ preventScroll: true }), reduced ? 0 : 500);
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
    el.apply?.addEventListener("click", () => { if (!el.apply.disabled) showConfirm(); });
    el.tabs?.querySelectorAll(".commerce-tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !el.console?.classList.contains("open")) return;
      const overlay = el.console.querySelector(".commerce-confirm, .commerce-preview-banner.active");
      if (previewSubjectId) { e.preventDefault(); previewSubjectId = null; scheduleRender(); return; }
      const cf = el.console.querySelector(".commerce-confirm");
      if (cf) { e.preventDefault(); cf.remove(); return; }
      e.preventDefault(); close();
    });
    window.addEventListener("eazo:localechange", () => {
      if (!el.console) return;
      window.eazoI18n?.translate?.(el.console);
      if (el.console.classList.contains("open")) scheduleRender();
    });
  }

  function cache() {
    el.console = document.getElementById("commerce-console");
    el.productList = document.getElementById("commerce-product-list");
    el.editor = document.getElementById("commerce-rule-editor");
    el.impact = document.getElementById("commerce-impact");
    el.back = document.getElementById("commerce-back");
    el.apply = document.getElementById("commerce-apply");
    el.tabs = document.getElementById("commerce-tabs");
  }

  function init() {
    cache();
    if (!el.console) return;
    mounted = true;
    bind();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.eazoCommerce = { open, close, getMarketOffer, calculatePrice, subjectProfile };
  window.eazoGetMarketOffer = getMarketOffer;
})();
