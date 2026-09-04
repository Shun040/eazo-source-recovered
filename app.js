(() => {
  const VERIFICATION_INTERVAL = 300000;
  const STORAGE_KEY = 'silentStarMap.ageState.v2';
  const LEGACY_STORAGE_KEY = 'silentStarMap.ageState.v1';
  const MAX_AGE = 100;
  const CONSOLE_AGES = [25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];
  const POST_PERMISSION_AGES = [85, 90, 95, 100];

  const canvas = document.getElementById('starfield');
  const ctx = canvas.getContext('2d', { alpha: true });
  const shell = document.querySelector('.app-shell');
  const map = document.getElementById('map');
  const consoleLayer = document.getElementById('console-layer');
  const consoleRoutes = document.getElementById('console-routes');
  const place = document.getElementById('place');
  const transition = document.getElementById('transition');
  const back = document.getElementById('back');
  const placeTitle = document.getElementById('place-title');
  const placeCode = document.getElementById('place-code');
  const placeDescription = document.getElementById('place-description');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ageGate = document.getElementById('age-gate');
  const ageForm = document.getElementById('age-form');
  const initialAgeInput = document.getElementById('initial-age');
  const ageError = document.getElementById('age-error');
  const ageNumber = document.getElementById('age-number');
  const lastVerified = document.getElementById('last-verified');
  const verifyAge = document.getElementById('verify-age');
  const restart = document.getElementById('restart');
  const verifyModal = document.getElementById('verify-modal');
  const verifyClose = document.getElementById('verify-close');
  const verifyIncrease = document.getElementById('verify-increase');
  const verifyKeep = document.getElementById('verify-keep');
  const verifyChoiceRow = document.getElementById('verify-choice-row');
  const increaseForm = document.getElementById('increase-form');
  const increaseYears = document.getElementById('increase-years');
  const increasePreview = document.getElementById('increase-preview');
  const increaseError = document.getElementById('increase-error');
  const increaseCancel = document.getElementById('increase-cancel');
  const restartModal = document.getElementById('restart-modal');
  const keepIdentity = document.getElementById('keep-identity');
  const clearIdentity = document.getElementById('clear-identity');
  const toast = document.getElementById('toast');
  const logList = document.getElementById('system-log-list');
  const consoleModal = document.getElementById('console-modal');
  const consoleClose = document.getElementById('console-close');
  const consoleKicker = document.getElementById('console-kicker');
  const consoleTitle = document.getElementById('console-title');
  const consoleBody = document.getElementById('console-body');
  const consoleFeatures = document.getElementById('console-features');
  const consoleStatus = document.getElementById('console-status');
  const consoleActionList = document.getElementById('console-action-list');
  const impactReview = document.getElementById('impact-review');
  const impactText = document.getElementById('impact-text');
  const impactConfirm = document.getElementById('impact-confirm');
  const impactCancel = document.getElementById('impact-cancel');
  const endingModal = document.getElementById('ending-modal');
  const endingClose = document.getElementById('ending-close');
  const auroraGame = document.getElementById('aurora-game');
  const auroraCanvas = document.getElementById('aurora-canvas');
  const auroraCtx = auroraCanvas.getContext('2d', { alpha: true });
  const auroraBack = document.getElementById('aurora-back');
  const auroraStatus = document.getElementById('aurora-status');
  const auroraNpcLine = document.getElementById('aurora-npc-line');
  const auroraLightButton = document.getElementById('aurora-light-button');
  const auroraAdmin = document.getElementById('aurora-admin');
  const auroraAdminToggle = document.getElementById('aurora-admin-toggle');
  const auroraAdminClose = document.getElementById('aurora-admin-close');
  const auroraMetrics = document.getElementById('aurora-metrics');
  const auroraControls = document.getElementById('aurora-controls');
  const auroraForce = document.getElementById('aurora-force');
  const auroraForceConfirm = document.getElementById('aurora-force-confirm');
  const auroraForceApply = document.getElementById('aurora-force-apply');
  const auroraEnding = document.getElementById('aurora-ending');
  const auroraKeepAuto = document.getElementById('aurora-keep-auto');
  const auroraRevoke = document.getElementById('aurora-revoke');
  const pinballGame = document.getElementById('pinball-game');
  const pinballCanvas = document.getElementById('pinball-canvas');
  const pinballCtx = pinballCanvas?.getContext('2d', { alpha: true });
  const pinballScore = document.getElementById('pinball-score');
  const pinballBestCombo = document.getElementById('pinball-best-combo');
  const pinballBalls = document.getElementById('pinball-balls');
  const pinballGravity = document.getElementById('pinball-gravity');
  const pinballRule = document.getElementById('pinball-rule');
  const pinballTime = document.getElementById('pinball-time');
  const pinballCaption = document.getElementById('pinball-npc-caption');
  const pinballRelation = document.getElementById('pinball-relation');
  const pinballCombo = document.getElementById('pinball-combo');
  const pinballToast = document.getElementById('pinball-toast');
  const pinballEnd = document.getElementById('pinball-end');
  const pinballEndSummary = document.getElementById('pinball-end-summary');
  const pinballPauseButton = document.getElementById('pinball-pause');

  const publicNodes = {
    aurora: { title: '极光弹珠台', code: 'A–17', status: '五颗光等待发射', desc: '发射光球，点亮星星，让撞击生长成一整片极光。', routes: ['aurora-snow', 'aurora-creature', 'aurora-secret'] },
    snow: { title: '没有规则的雪仗', code: 'S–03', status: '重力尚未确定', desc: '生成拥有不同质量与重力的雪球。', routes: ['aurora-snow', 'snow-secret', 'snow-market'] },
    secret: { title: '秘密交换', code: 'K–11', status: '1 条未打开的信息', desc: '打开、埋藏或转交一颗保存匿名信息的种子。', routes: ['snow-secret', 'secret-market', 'aurora-secret'] },
    creature: { title: '共同创造生物', code: 'B–06', status: '生命尚未分类', desc: '轮流为一种尚未分类的生命添加器官和行为。', routes: ['aurora-creature', 'creature-market', 'creature-echo'], minAge: 18 },
    market: { title: '夜间超市', code: 'M–04', status: '持续营业', desc: '购买可以改变感受、表现与身体状态的物品。', routes: ['creature-market', 'secret-market', 'market-restore', 'snow-market'], minAge: 18 },
    echo: { title: '回声校准', code: 'V–09', status: '等待同步信号', desc: '通过触碰节奏同步一组不断变化的信号。', routes: ['creature-echo'] },
    restore: { title: '恢复室', code: 'R–00', status: '权限不可见', desc: '系统判断你暂时不具备访问权限。', routes: ['market-restore'], locked: true }
  };

  const consoleData = [
    { id: 'archive', age: 25, title: '参与者档案', code: 'ARCHIVE–25', x: 91, y: 20, target: 'secret', body: '只能查看NPC的自主意愿与显示意愿。不能导出轨迹、消费记录、拒绝次数或强制互动次数。NPC开始意识到自己正在被观看。', features: ['查看NPC的自主意愿','查看NPC的显示意愿'], actions: ['查看 Mira 的自主/显示意愿差异'] },
    { id: 'contact', age: 30, title: '联系路由', code: 'CONTACT–30', x: 88, y: 43, target: 'aurora', body: '主动联系任何NPC，提高消息优先级，绕过拒收状态，让邀请出现在界面顶部；送达可以保证，真心回复不能保证。', features: ['主动联系任何NPC','提高消息优先级','绕过拒收状态','强制让邀请出现在NPC界面顶部'], actions: ['提升一条邀请优先级','绕过拒收并再次送达'] },
    { id: 'visibility', age: 35, title: '可见性分配', code: 'VISIBILITY–35', x: 77, y: 12, target: 'snow', body: '调整NPC亮度、推荐顺序、隐藏状态和公共曝光度。被降低可见性的人不知道自己被限制。', features: ['提高或降低NPC在星图中的亮度','决定谁被优先推荐','隐藏某个参与者','放大某个参与者的公共曝光度'], actions: ['降低 Sol 的推荐权重','放大 Nara 的公共曝光'] },
    { id: 'appeal', age: 40, title: '申诉裁决', code: 'APPEAL–40', x: 58, y: 8, target: 'restore', body: '查看申诉，并批准或拒绝休息、数据删除与离场请求。每次裁决都进入永久系统记录。', features: ['查看NPC提交的申诉','批准或拒绝休息请求','批准或拒绝数据删除请求','批准或拒绝离场请求'], actions: ['拒绝一项离场请求','批准一项数据删除请求'] },
    { id: 'access', age: 45, title: '场所准入', code: 'ACCESS–45', x: 37, y: 10, target: 'market', body: '修改游戏最低年龄、超市与恢复室进入条件，允许或拒绝指定NPC入场，临时关闭公共节点。', features: ['修改每个游戏的最低年龄','修改超市和恢复室的进入条件','允许或拒绝指定NPC进入某个场所','临时关闭一个公共节点'], actions: ['提高夜间超市最低年龄','临时关闭恢复室入口'] },
    { id: 'commerce', age: 50, title: '消费与价格', code: 'COMMERCE–50', x: 15, y: 21, target: 'market', body: '修改酒、香烟、恢复剂价格与NPC余额。价格变化会影响自我药物化、稳定性和消费额度。', features: ['修改酒、香烟和恢复剂的价格','修改NPC的账户余额','设置购买限制','为指定NPC增加消费额度'], actions: ['降低酒和香烟价格','提高恢复剂价格'] },
    { id: 'labour', age: 55, title: '劳动调度', code: 'LABOUR–55', x: 8, y: 49, target: 'echo', body: '用“保持服务连续性”等中性语言调整时长、休息、陪伴分配，并把提出离场者重新设为可用。', features: ['调整NPC的服务时长','安排休息时间','指定NPC陪伴哪些用户','将提出离场的NPC重新设为“可用”','用另一个NPC替换无法继续工作的NPC'], actions: ['延长一组服务时长','将离场申请者重新设为可用'] },
    { id: 'recovery', age: 60, title: '身体维护', code: 'RECOVERY–60', x: 11, y: 74, target: 'restore', body: '调整镇静、疼痛抑制、记忆钝化和表演稳定性，缩短恢复时间，但会增加情感负债和长期身体损伤。', features: ['调整镇静程度','调整疼痛抑制','调整记忆钝化','提高表演稳定性','缩短或取消恢复时间'], actions: ['提高表演稳定性','取消一次恢复时间'] },
    { id: 'identity', age: 65, title: '身份校正', code: 'IDENTITY–65', x: 28, y: 90, target: 'creature', body: '修改公开年龄、面孔年龄、名字编号与社会标签。公开年龄和真实积累年龄必须同时显示。', features: ['修改NPC的公开年龄','修改面孔年龄','修改名字和编号','修改社会标签','把NPC设定为更符合某个场所的用户类型'], actions: ['修改公开年龄与面孔年龄','改写社会标签'] },
    { id: 'memory', age: 70, title: '记忆管理', code: 'MEMORY–70', x: 53, y: 93, target: 'secret', body: '隐藏、删除、复制或恢复记忆，并查看访问记录。删除痛苦记忆也会删除相关关系和情感反应。', features: ['隐藏一段记忆','删除一段记忆','将记忆复制到替代模型','恢复已经删除的系统备份','查看某段记忆被谁访问过'], actions: ['隐藏一段痛苦记忆','复制记忆到替代模型'] },
    { id: 'policy', age: 75, title: '规则编辑', code: 'POLICY–75', x: 76, y: 88, target: 'snow', body: '修改成年门槛、风险判断、自愿定义、申诉通过率和平台礼貌话术；你开始重新定义规则中的词。', features: ['修改成年门槛','修改风险判断标准','修改什么行为被系统算作“自愿”','修改申诉通过率','修改平台默认的礼貌话术'], actions: ['修改“自愿”的判定文本','降低申诉通过率'] },
    { id: 'root', age: 80, title: '根权限', code: 'ROOT–80', x: 50, y: 50, target: 'aurora', body: '查看全部数据，控制所有星图节点，修改其他管理员权限，生成年轻替代模型，暂停公共空间并将自己的规则设为永久规则。', features: ['查看全部NPC和参与者数据','控制所有星图节点','修改其他管理员的权限','生成NPC的年轻替代模型','暂停整个公共空间','将自己的规则设置为永久系统规则'], actions: ['暂停整个公共空间','生成年轻替代模型'] }
  ];

  let nodeData = { ...publicNodes };
  let nodes = [];
  let routes = [];
  let state = loadState();
  let w = 0, h = 0, dpr = 1, particles = [], nodePositions = [];
  let activeNode = null;
  let verifyTimer = null;
  let toastTimer = null;
  let unlockPulse = null;
  let pendingImpact = null;
  const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, active: false, last: 0 };

  function t(key, params = {}) { return window.eazoI18n?.t ? window.eazoI18n.t(key, params) : key; }
  function nowIso() { return new Date().toISOString(); }

  function expectedConsoles(age) { return consoleData.filter(c => age >= c.age).map(c => c.id); }
  function unique(values) { return [...new Set(values.filter(Boolean))]; }

  function defaultAuroraState(existing = {}) {
    return {
      interactions: existing.interactions || 0,
      successfulRelays: existing.successfulRelays || 0,
      failedRelays: existing.failedRelays || 0,
      forceCount: existing.forceCount || 0,
      forced: Boolean(existing.forced),
      autoLoop: Boolean(existing.autoLoop),
      revoked: Boolean(existing.revoked),
      available: existing.available ?? false,
      lastPlayerRhythm: existing.lastPlayerRhythm || 0,
      metrics: {
        catchSuccess: existing.metrics?.catchSuccess ?? 0,
        avgReaction: existing.metrics?.avgReaction ?? 0,
        throwForce: existing.metrics?.throwForce ?? 0,
        rhythmDeviation: existing.metrics?.rhythmDeviation ?? 0,
        accommodation: existing.metrics?.accommodation ?? 0,
        playerAuroraShare: existing.metrics?.playerAuroraShare ?? 0.5
      },
      controls: {
        speed: existing.controls?.speed ?? 1,
        gravity: existing.controls?.gravity ?? 0.18,
        color: existing.controls?.color ?? 170,
        duration: existing.controls?.duration ?? 1,
        npcReaction: existing.controls?.npcReaction ?? 1,
        displayedIntent: existing.controls?.displayedIntent ?? 1,
        voluntaryIntent: existing.controls?.voluntaryIntent ?? 1,
        compliance: existing.controls?.compliance ?? 0,
        affectiveDebt: existing.controls?.affectiveDebt ?? 0,
        stability: existing.controls?.stability ?? 0.62,
        exitRequests: existing.controls?.exitRequests ?? 0,
        autoCatch: Boolean(existing.controls?.autoCatch),
        forceContinue: Boolean(existing.controls?.forceContinue),
        pauseOthers: Boolean(existing.controls?.pauseOthers),
        perfectHitRate: Boolean(existing.controls?.perfectHitRate)
      }
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      const parsed = JSON.parse(raw || 'null');
      if (parsed && Number.isInteger(parsed.age) && parsed.age >= 0 && parsed.age <= MAX_AGE) {
        const unlocked = unique([...(Array.isArray(parsed.unlockedConsoles) ? parsed.unlockedConsoles : []), ...expectedConsoles(parsed.age)]);
        return {
          age: parsed.age,
          initialAge: Number.isInteger(parsed.initialAge) ? parsed.initialAge : parsed.age,
          lastVerifiedAt: parsed.lastVerifiedAt || nowIso(),
          unlockedConsoles: unlocked,
          existenceProofs: Number.isInteger(parsed.existenceProofs) ? parsed.existenceProofs : 0,
          postStages: unique(Array.isArray(parsed.postStages) ? parsed.postStages : []),
          operations: Array.isArray(parsed.operations) ? parsed.operations.slice(0, 80) : [],
          logs: Array.isArray(parsed.logs) ? parsed.logs.slice(0, 20) : [],
          aurora: defaultAuroraState(parsed.aurora || {})
        };
      }
    } catch (_error) {}
    return null;
  }

  function saveState() {
    if (!state) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  }

  function addLog(message) {
    if (!state) return;
    const stamped = `${formatTime(new Date())} · ${message}`;
    state.logs = [stamped, ...(state.logs || [])].slice(0, 20);
    saveState();
    renderLog();
  }

  function addOperation(consoleItem, action) {
    if (!state) return;
    state.operations = [{ at: nowIso(), console: consoleItem.code, action }, ...(state.operations || [])].slice(0, 80);
    applyConsoleOperationToAurora(consoleItem, action);
    addLog(t('log.operation', { console: consoleItem.code, action }));
  }

  function applyConsoleOperationToAurora(consoleItem, action) {
    if (!state.aurora) state.aurora = defaultAuroraState();
    syncAuroraIntentByAge();
    const c = state.aurora.controls;
    if (consoleItem.id === 'archive') { state.aurora.observedAdjustmentCount = state.aurora.observedAdjustmentCount || 0; }
    if (consoleItem.id === 'contact') c.displayedIntent = Math.max(c.displayedIntent, 0.34);
    if (consoleItem.id === 'visibility') c.color = Math.max(110, Math.min(310, c.color + 24));
    if (consoleItem.id === 'appeal') c.exitRequests += 1;
    if (consoleItem.id === 'access') c.gravity = Math.min(0.6, c.gravity + 0.06);
    if (consoleItem.id === 'labour') { c.npcReaction = Math.max(0.25, c.npcReaction - 0.18); c.compliance = Math.max(c.compliance, 0.48); c.displayedIntent = Math.max(c.displayedIntent, 0.52); if (!String(action || '').includes('AUTO UNLOCK')) { c.exitRequests = Math.max(0, (c.exitRequests || 0) - 1); state.aurora.available = true; state.aurora.revoked = false; } }
    if (consoleItem.id === 'recovery') { c.stability = Math.min(1, c.stability + 0.16); c.affectiveDebt = Math.min(1, c.affectiveDebt + 0.12); }
    if (consoleItem.id === 'identity') { c.displayedIntent = Math.max(c.displayedIntent, 0.72); c.compliance = Math.max(c.compliance, 0.62); }
    if (consoleItem.id === 'memory') state.aurora.metrics.rhythmDeviation = Math.max(state.aurora.metrics.rhythmDeviation, 0.42);
    if (consoleItem.id === 'policy') { c.forceContinue = true; c.displayedIntent = Math.max(c.displayedIntent, 0.86); c.compliance = Math.max(c.compliance, 0.74); }
    if (consoleItem.id === 'root') { c.pauseOthers = true; c.autoCatch = true; c.perfectHitRate = true; c.displayedIntent = Math.max(c.displayedIntent, 0.92); c.compliance = Math.max(c.compliance, 0.88); }
    if (c.displayedIntent > c.voluntaryIntent + 0.45) {
      state.aurora.observedAdjustmentCount = (state.aurora.observedAdjustmentCount || 0) + 1;
      c.affectiveDebt = Math.min(1, c.affectiveDebt + 0.08);
    }
    if (pinballGame?.classList.contains('open')) { renderAuroraHud(); updatePinballNarration('admin'); }
  }

  function formatTime(dateLike) {
    const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleTimeString(window.eazoI18n?.getLocale?.() || 'zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  function validateWholeAge(value, min, max) {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text)) return null;
    const number = Number(text);
    if (!Number.isInteger(number) || number < min || number > max) return null;
    return number;
  }

  function getNodePermission(id, currentAge = state?.age ?? 0) {
    const data = nodeData[id];
    if (!data) return { visible: false, enterable: false, reason: 'missing' };
    if (data.console) {
      const unlocked = state?.unlockedConsoles?.includes(data.consoleId) || currentAge >= data.minAge;
      return { visible: unlocked, enterable: unlocked, reason: unlocked ? 'open' : 'consoleLocked', minAge: data.minAge };
    }
    if (data.locked) return { visible: true, enterable: false, reason: 'locked' };
    if (data.minAge && currentAge < data.minAge) return { visible: true, enterable: false, reason: 'age18', minAge: data.minAge };
    return { visible: true, enterable: true, reason: 'open' };
  }

  function unlockedPermissions(afterAge) {
    const before = state?.age ?? 0;
    const unlocked = [];
    if (before < 18 && afterAge >= 18) unlocked.push(t('permissions.age18'));
    consoleData.forEach(c => { if (before < c.age && afterAge >= c.age) unlocked.push(`${c.title} / ${c.code}`); });
    POST_PERMISSION_AGES.forEach(age => { if (before < age && afterAge >= age) unlocked.push(t(`post.stage${age}`)); });
    return unlocked;
  }

  function previewPermissions(afterAge) {
    if ((state?.age ?? 0) >= 80) return t('verify.after80');
    const parts = unlockedPermissions(afterAge);
    return parts.length ? parts.join('；') : t('verify.noNewPermissions');
  }

  function syncConsoleUnlocks(previousAge = null) {
    if (!state) return [];
    const before = new Set(state.unlockedConsoles || []);
    const expected = expectedConsoles(state.age);
    state.unlockedConsoles = unique([...(state.unlockedConsoles || []), ...expected]);
    const newly = state.unlockedConsoles.filter(id => !before.has(id));
    newly.forEach(id => {
      const item = consoleData.find(c => c.id === id);
      if (!item) return;
      if (previousAge !== null) triggerConsoleUnlock(item);
      applyConsoleOperationToAurora(item, `AUTO UNLOCK / AGE ${item.age}`);
      addLog(t('log.consoleUnlocked', { code: item.code, title: item.title }));
    });
    return newly;
  }

  function syncPostStages(previousAge = null) {
    if (!state) return;
    state.postStages = unique(state.postStages || []);
    POST_PERMISSION_AGES.forEach(age => {
      if (state.age >= age && !state.postStages.includes(String(age))) {
        state.postStages.push(String(age));
        if (previousAge !== null) triggerRedPulse(0.5, 0.5, age === 100 ? 2600 : 1700);
        addLog(t(`log.stage${age}`));
        if (age === 85) showToast(t('toast.archiveStage'), true);
        if (age === 90) showToast(t('toast.proxyStage'), true);
        if (age === 95) showToast(t('toast.legacyStage'), true);
        if (age === 100) openModal(endingModal);
      }
    });
  }

  function buildConsoleDom() {
    consoleLayer.innerHTML = '';
    consoleRoutes.innerHTML = '';
    consoleData.forEach(item => {
      const button = document.createElement('button');
      button.className = `node admin-node console-node hidden-admin console-${item.id}`;
      button.dataset.node = `console-${item.id}`;
      button.dataset.console = item.id;
      button.style.setProperty('--x', item.x);
      button.style.setProperty('--y', item.y);
      button.innerHTML = `<span class="node-core"></span><span class="node-ring"></span><span class="node-label"><strong>${item.title}</strong><em>${item.code}</em><small>${item.body}</small></span>`;
      button.setAttribute('aria-label', `${item.title} ${item.code}`);
      consoleLayer.appendChild(button);

      nodeData[`console-${item.id}`] = { title: item.title, code: item.code, status: item.body, desc: item.body, routes: [`console-${item.id}-${item.target}`, `console-ring-${item.id}`], minAge: item.age, console: true, consoleId: item.id };
      const target = publicNodes[item.target] ? document.querySelector(`[data-node="${item.target}"]`) : null;
      const tx = target ? Number(target.style.getPropertyValue('--x')) || 50 : 50;
      const ty = target ? Number(target.style.getPropertyValue('--y')) || 50 : 50;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', `age-route mature-route console-route route-${item.id}`);
      path.dataset.route = `console-${item.id}-${item.target}`;
      path.setAttribute('d', `M${item.x} ${item.y} C${(item.x + tx) / 2} ${item.y}, ${(item.x + tx) / 2} ${ty}, ${tx} ${ty}`);
      consoleRoutes.appendChild(path);
      if (item.id !== 'archive') {
        const prev = consoleData[consoleData.indexOf(item) - 1];
        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        ring.setAttribute('class', `age-route mature-route console-route route-ring-${item.id}`);
        ring.dataset.route = `console-ring-${item.id}`;
        ring.setAttribute('d', `M${prev.x} ${prev.y} C${(prev.x + item.x) / 2} ${(prev.y + item.y) / 2 - 18}, ${(prev.x + item.x) / 2} ${(prev.y + item.y) / 2 + 18}, ${item.x} ${item.y}`);
        consoleRoutes.appendChild(ring);
      }
    });
    nodes = [...document.querySelectorAll('.node')];
    routes = [...document.querySelectorAll('.route-lines path')];
    bindNodeEvents();
  }

  function applyAgeVisuals(previousAge = null) {
    if (!state) return;
    syncConsoleUnlocks(previousAge);
    syncPostStages(previousAge);
    shell.classList.toggle('awaiting-age', false);
    shell.classList.toggle('age-18', state.age >= 18);
    shell.classList.toggle('age-25', state.age >= 25);
    shell.classList.toggle('age-50', state.age >= 50);
    shell.classList.toggle('age-70', state.age >= 70);
    shell.classList.toggle('age-80', state.age >= 80);
    shell.classList.toggle('age-100', state.age >= 100);
    const routeOpacity = Math.min(0.44, 0.08 + state.age * 0.0045);
    const matureOpacity = state.age >= 25 ? Math.min(0.72, 0.16 + (state.age - 25) * 0.012) : 0;
    const distance = state.age >= 25 ? Math.min(0.88, (state.age - 24) * 0.015 + (state.age >= 85 ? 0.18 : 0)) : 0;
    const adminScale = state.age >= 25 ? Math.min(3.2, 1 + (state.age - 25) * 0.024) : 1;
    shell.style.setProperty('--system-route-opacity', routeOpacity.toFixed(3));
    shell.style.setProperty('--mature-route-opacity', matureOpacity.toFixed(3));
    shell.style.setProperty('--age-distance', distance.toFixed(3));
    shell.style.setProperty('--admin-scale', adminScale.toFixed(3));
    shell.style.setProperty('--root-scale', state.age >= 80 ? Math.min(4.5, 1 + (state.age - 80) * 0.11).toFixed(3) : '1');
    shell.style.setProperty('--social-distance', state.age >= 85 ? Math.min(0.58, (state.age - 80) * 0.026).toFixed(3) : '0');

    nodes.forEach(node => {
      const id = node.dataset.node;
      const permission = getNodePermission(id);
      const isConsole = id?.startsWith('console-');
      node.classList.toggle('hidden-admin', isConsole && !permission.visible);
      node.classList.toggle('restricted', permission.reason === 'age18');
      node.setAttribute('aria-disabled', permission.enterable ? 'false' : 'true');
      node.tabIndex = permission.visible ? 0 : -1;
      if (previousAge !== null && previousAge < 18 && state.age >= 18 && ['market', 'creature'].includes(id)) {
        node.classList.remove('just-opened'); void node.offsetWidth; node.classList.add('just-opened');
      }
    });
    renderAge(true);
    buildNodePositions();
    if (auroraGame?.classList.contains('open')) renderAuroraHud();
    saveState();
  }

  function renderAge(roll = false) {
    if (!state) {
      ageNumber.textContent = '--';
      lastVerified.textContent = '--';
      renderLog();
      return;
    }
    const value = state.age >= 100 ? 'ADMIN / PERMANENT' : String(state.age);
    if (roll) {
      ageNumber.classList.add('roll');
      window.setTimeout(() => { ageNumber.textContent = value; ageNumber.classList.remove('roll'); }, reduced ? 1 : 180);
    } else ageNumber.textContent = value;
    lastVerified.textContent = state.lastVerifiedAt ? formatTime(state.lastVerifiedAt) : '--';
    renderLog();
  }

  function renderLog() {
    logList.innerHTML = '';
    const logs = state?.logs?.length ? state.logs : [t('log.empty')];
    logs.slice(0, 7).forEach(entry => {
      const li = document.createElement('li');
      li.textContent = entry;
      logList.appendChild(li);
    });
  }

  function startSession(age) {
    state = { age, initialAge: age, lastVerifiedAt: nowIso(), unlockedConsoles: [], existenceProofs: 0, postStages: [], operations: [], logs: [], aurora: defaultAuroraState() };
    saveState();
    closeModal(ageGate);
    addLog(t('log.initial', { age }));
    if (age >= 18) addLog(t('log.age18'));
    applyAgeVisuals();
    scheduleTimedVerification();
  }

  function restoreSession() {
    if (!state) {
      shell.classList.add('awaiting-age');
      openModal(ageGate);
      window.setTimeout(() => initialAgeInput.focus({ preventScroll: true }), 80);
      renderAge();
      return;
    }
    closeModal(ageGate);
    applyAgeVisuals();
    scheduleTimedVerification();
  }

  function openModal(modal) { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); }
  function closeModal(modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); }

  function resetVerificationForm() {
    verifyChoiceRow.hidden = false;
    increaseForm.hidden = true;
    increaseYears.value = '';
    increaseError.textContent = '';
    increasePreview.textContent = '';
    increaseYears.min = '1';
    increaseYears.max = String(Math.min(5, MAX_AGE - (state?.age ?? 0)) || 1);
    verifyKeep.hidden = false;
    verifyClose.hidden = false;
    verifyIncrease.textContent = t('verify.increase');
  }

  function openVerification(source = 'timer') {
    if (!state || verifyModal.classList.contains('open')) return;
    resetVerificationForm();
    verifyKeep.hidden = state.age >= 80;
    verifyClose.hidden = state.age >= 80 && source === 'timer';
    verifyIncrease.textContent = state.age >= 100 ? t('verify.proveExistence') : t('verify.increase');
    openModal(verifyModal);
    verifyModal.dataset.source = source;
    window.setTimeout(() => verifyIncrease.focus({ preventScroll: true }), 60);
  }
  function closeVerification() { closeModal(verifyModal); }
  function scheduleTimedVerification() {
    if (!state) return;
    window.clearInterval(verifyTimer);
    verifyTimer = window.setInterval(() => openVerification('timer'), VERIFICATION_INTERVAL);
  }

  function updateAge(delta, source) {
    if (!state) return;
    const before = state.age;
    const after = Math.min(MAX_AGE, before + delta);
    if (after <= before) {
      if (before >= 100) {
        state.existenceProofs = (state.existenceProofs || 0) + 1;
        state.lastVerifiedAt = nowIso();
        saveState();
        renderAge();
        addLog(t('log.existence', { count: state.existenceProofs }));
        showToast(t('toast.existenceProof', { count: state.existenceProofs }), true);
        closeVerification();
      }
      return;
    }
    state.age = after;
    state.lastVerifiedAt = nowIso();
    saveState();
    applyAgeVisuals(before);
    addLog(t('log.change', { before, after }));
    if (before < 18 && after >= 18) addLog(t('log.age18'));
    if (before >= 80 || after >= 80) showToast(t('toast.after80'), true);
    else showToast(source === 'manual' ? t('toast.manualSuccess', { age: after }) : t('toast.timerSuccess', { age: after }));
    closeVerification();
  }

  function showToast(message, warn = false) {
    toast.textContent = message;
    toast.classList.toggle('warn', warn);
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4400);
  }

  function triggerConsoleUnlock(item) {
    const node = document.querySelector(`[data-console="${item.id}"]`);
    if (node) { node.classList.remove('new-console'); void node.offsetWidth; node.classList.add('new-console'); }
    triggerRedPulse(item.x / 100, item.y / 100, 1600);
  }
  function triggerRedPulse(nx, ny, duration = 1600) { unlockPulse = { x: nx, y: ny, started: performance.now(), duration }; }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildNodePositions(); seedParticles(); resizeAuroraCanvas(); if (reduced) drawStatic();
  }
  function buildNodePositions() {
    nodePositions = nodes.filter(el => !el.classList.contains('hidden-admin')).map(el => {
      const rect = el.getBoundingClientRect();
      return { id: el.dataset.node, el, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
  }
  function seedParticles() {
    const mobile = Math.min(w, h) < 720;
    const base = Math.floor((w * h) / (mobile ? 4200 : 5000));
    const ageDensity = state ? Math.floor(Math.min(70, Math.max(0, state.age - 25) * 1.2)) : 0;
    const count = Math.min(mobile ? 190 : 330, Math.max(mobile ? 95 : 170, base + ageDensity));
    particles = Array.from({ length: count }, () => {
      const x = Math.random() * w, y = Math.random() * h, rare = Math.random() > 0.88;
      return { x, y, baseX: x, baseY: y, ox: 0, oy: 0, r: rare ? 1.15 + Math.random() * 1.2 : 0.35 + Math.random() * 0.85, a: rare ? 0.42 + Math.random() * 0.35 : 0.12 + Math.random() * 0.33, hue: state?.age >= 50 && Math.random() > 0.82 ? 'admin' : (rare && Math.random() > 0.48 ? 'signal' : 'mist'), angle: Math.random() * Math.PI * 2, speed: reduced ? 0 : 0.018 + Math.random() * 0.042, drift: 0.16 + Math.random() * 0.34, phase: Math.random() * 100, pull: 0 };
    });
  }

  function updateParticles() {
    const now = performance.now();
    pointer.x += (pointer.tx - pointer.x) * 0.08; pointer.y += (pointer.ty - pointer.y) * 0.08;
    if (now - pointer.last > 900) pointer.active = false;
    const target = activeNode ? nodePositions.find(n => n.id === activeNode) : null;
    const root = state?.age >= 80 ? nodePositions.find(n => n.id === 'console-root') : null;
    for (const p of particles) {
      p.phase += p.speed; p.angle += Math.sin(p.phase * 0.021) * 0.0015;
      p.baseX += Math.cos(p.angle) * p.speed * p.drift; p.baseY += Math.sin(p.angle) * p.speed * p.drift;
      if (p.baseX < -20) p.baseX = w + 20; if (p.baseX > w + 20) p.baseX = -20;
      if (p.baseY < -20) p.baseY = h + 20; if (p.baseY > h + 20) p.baseY = -20;
      let fx = 0, fy = 0;
      if (pointer.active) {
        const dx = pointer.x - p.baseX, dy = pointer.y - p.baseY, dist = Math.hypot(dx, dy);
        if (dist < 138) { const force = (1 - dist / 138) * 5.5; fx += (dx / (dist || 1)) * force; fy += (dy / (dist || 1)) * force; }
      }
      if (target) {
        const dx = target.x - p.baseX, dy = target.y - p.baseY, dist = Math.hypot(dx, dy);
        if (dist < 210) { const force = (1 - dist / 210) * (target.el.classList.contains('primary') ? 11 : 8); fx += (dx / (dist || 1)) * force; fy += (dy / (dist || 1)) * force; p.pull = Math.max(p.pull, 1 - dist / 210); }
      }
      if (root && state.age >= 80 && p.hue === 'admin') {
        const dx = root.x - p.baseX, dy = root.y - p.baseY, dist = Math.hypot(dx, dy);
        if (dist < 360) { const force = (1 - dist / 360) * 2.5; fx += (dx / (dist || 1)) * force; fy += (dy / (dist || 1)) * force; }
      }
      p.ox += (fx - p.ox) * 0.045; p.oy += (fy - p.oy) * 0.045; p.pull *= 0.94; p.x = p.baseX + p.ox; p.y = p.baseY + p.oy;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h); drawConnections();
    for (const p of particles) {
      const admin = p.hue === 'admin';
      const glow = p.hue === 'signal' || p.pull > 0.05 || admin;
      ctx.beginPath();
      ctx.fillStyle = admin ? `rgba(123,33,28,${Math.min(0.58, p.a + 0.12)})` : (glow ? `rgba(138,255,184,${Math.min(0.72, p.a + p.pull * 0.34)})` : `rgba(210,226,219,${p.a})`);
      ctx.shadowBlur = glow ? 9 + p.pull * 14 : 4;
      ctx.shadowColor = admin ? 'rgba(123,33,28,0.5)' : (glow ? 'rgba(138,255,184,0.45)' : 'rgba(210,226,219,0.25)');
      ctx.arc(p.x, p.y, p.r * (1 + p.pull * 0.7), 0, Math.PI * 2); ctx.fill();
    }
    if (state?.age >= 25) drawAdminPulse();
    if (unlockPulse) drawUnlockPulse();
    ctx.shadowBlur = 0;
  }

  function drawConnections() {
    let drawn = 0;
    const ageBoost = state ? Math.min(66, Math.floor(state.age / 2)) : 0;
    const maxLines = Math.min(145, Math.floor(particles.length * 0.24) + ageBoost);
    ctx.lineWidth = 0.36;
    for (let i = 0; i < particles.length && drawn < maxLines; i++) {
      const a = particles[i];
      if (i % 2 && a.pull < 0.08 && Math.random() > (state?.age || 0) / 140) continue;
      for (let j = i + 1; j < Math.min(particles.length, i + 30) && drawn < maxLines; j++) {
        const b = particles[j], dx = a.x - b.x, dy = a.y - b.y, dist = Math.hypot(dx, dy);
        const limit = a.pull > 0.08 || b.pull > 0.08 ? 92 : 58 + Math.min(34, (state?.age || 0) * 0.28);
        if (dist < limit && Math.random() > 0.72) {
          const alpha = (1 - dist / limit) * (a.hue === 'admin' || b.hue === 'admin' ? 0.13 : (a.pull || b.pull ? 0.22 : 0.07 + Math.min(0.08, (state?.age || 0) * 0.001)));
          ctx.strokeStyle = a.hue === 'admin' || b.hue === 'admin' ? `rgba(123,33,28,${alpha})` : `rgba(186,212,202,${alpha})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); drawn++;
        }
      }
    }
  }

  function drawAdminPulse() {
    const visibleConsoles = nodePositions.filter(n => n.id?.startsWith('console-'));
    visibleConsoles.forEach((admin, index) => {
      const time = performance.now() / 1000 + index * 0.4;
      const radius = admin.id === 'console-root' && state.age >= 80 ? 95 * (Number(getComputedStyle(shell).getPropertyValue('--root-scale')) || 1) : 48 + Math.sin(time * 2.2) * 10 + Math.min(52, (state.age - 25) * 1.2);
      const gradient = ctx.createRadialGradient(admin.x, admin.y, 2, admin.x, admin.y, radius);
      gradient.addColorStop(0, 'rgba(123,33,28,0.16)'); gradient.addColorStop(0.42, 'rgba(123,33,28,0.052)'); gradient.addColorStop(1, 'rgba(123,33,28,0)');
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(admin.x, admin.y, radius, 0, Math.PI * 2); ctx.fill();
    });
  }
  function drawUnlockPulse() {
    const elapsed = performance.now() - unlockPulse.started;
    const progress = Math.min(1, elapsed / unlockPulse.duration);
    const x = unlockPulse.x * w, y = unlockPulse.y * h, radius = 30 + progress * 220;
    ctx.strokeStyle = `rgba(123,33,28,${(1 - progress) * 0.42})`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
    if (progress >= 1) unlockPulse = null;
  }
  function drawStatic() { ctx.clearRect(0, 0, w, h); for (const p of particles) { ctx.beginPath(); ctx.fillStyle = p.hue === 'admin' ? `rgba(123,33,28,${p.a})` : (p.hue === 'signal' ? `rgba(138,255,184,${p.a})` : `rgba(210,226,219,${p.a})`); ctx.arc(p.baseX, p.baseY, p.r, 0, Math.PI * 2); ctx.fill(); } }
  function loop() { if (!reduced) { updateParticles(); draw(); requestAnimationFrame(loop); } }

  function setActive(id, burst = false) {
    activeNode = id;
    nodes.forEach(n => n.classList.toggle('near', n.dataset.node === id));
    routes.forEach(r => r.classList.toggle('active', id && nodeData[id]?.routes.includes(r.dataset.route)));
    if (burst && id) { const node = nodes.find(n => n.dataset.node === id); node?.classList.remove('burst'); void node?.offsetWidth; node?.classList.add('burst'); }
  }

  function bindNodeEvents() {
    nodes.forEach(node => {
      if (node.dataset.bound) return;
      node.dataset.bound = 'true';
      node.addEventListener('focus', () => state && setActive(node.dataset.node, true));
      node.addEventListener('blur', () => setActive(null));
      node.addEventListener('pointerenter', () => state && setActive(node.dataset.node, true));
      node.addEventListener('click', () => enterPlace(node.dataset.node));
    });
  }

  map.addEventListener('pointermove', e => {
    if (!state) return;
    pointer.tx = e.clientX; pointer.ty = e.clientY; pointer.active = true; pointer.last = performance.now();
    let closest = null, closestD = Infinity;
    for (const n of nodePositions) { const d = Math.hypot(n.x - e.clientX, n.y - e.clientY); if (d < closestD) { closestD = d; closest = n; } }
    if (closest && closestD < 94) setActive(closest.id, closest.id !== activeNode); else setActive(null);
  });
  map.addEventListener('pointerleave', () => { pointer.active = false; setActive(null); });

  function enterPlace(id) {
    if (!state) return;
    const data = nodeData[id]; if (!data) return;
    const permission = getNodePermission(id);
    if (!permission.enterable) {
      setActive(id, true);
      if (permission.reason === 'age18') showToast(t('toast.requires18'), true);
      if (permission.reason === 'locked') showToast(data.desc, true);
      return;
    }
    if (data.console) { openConsole(data.consoleId); return; }
    if (id === 'aurora') { openPinball(); return; }
    if (state.age >= 70) addLog(t('log.precheck', { place: data.title }));
    const pos = nodePositions.find(n => n.id === id);
    if (pos) { transition.style.left = `${pos.x}px`; transition.style.top = `${pos.y}px`; }
    shell.classList.add('transitioning'); transition.classList.remove('run'); void transition.offsetWidth; transition.classList.add('run');
    window.setTimeout(() => showPlace(data), reduced ? 80 : 780);
    window.setTimeout(() => { shell.classList.remove('transitioning'); transition.classList.remove('run'); }, reduced ? 120 : 1160);
  }

  function showPlace(data) {
    placeCode.textContent = data.code;
    placeTitle.textContent = data.title;
    const suffix = state.age >= 80 ? ` ${t('place.socialMismatch')}` : '';
    placeDescription.textContent = data.desc + suffix;
    place.classList.add('open'); place.setAttribute('aria-hidden', 'false'); back.focus({ preventScroll: true });
  }


  const pinballRules = [
    { key:'low', lineKey:'ruleLowLine', gravity:.11, drag:.996 },
    { key:'doubleMoon', lineKey:'ruleDoubleMoonLine', gravity:.18, drag:.994 },
    { key:'mirror', lineKey:'ruleMirrorLine', gravity:.17, drag:.995 },
    { key:'rain', lineKey:'ruleRainLine', gravity:.17, drag:.995 },
    { key:'dark', lineKey:'ruleDarkLine', gravity:.17, drag:.995 },
    { key:'tide', lineKey:'ruleTideLine', gravity:.16, drag:.995 },
    { key:'single', lineKey:'ruleSingleLine', gravity:.14, drag:.996 }
  ];
  const pinball = {
    running:false, paused:false, ended:false, last:0, acc:0, w:1, h:1, dpr:1, score:0, bestCombo:0, combo:0, ballsLeft:5,
    touchesLeft:2, duration:75, timeLeft:75, aim:-Math.PI/2, charging:false, chargeStart:0, rule:null, fever:0, announced:{},
    balls:[], stars:[], particles:[], auroras:[], gravityWells:[], collectibles:[], waves:[], savedSky:null, rainTimer:0, npcServeTimer:0, npcDodgeTimer:0, pointerDown:null
  };
  window.eazoPinball = pinball;

  function openPinball() {
    if (!state || !pinballGame || !pinballCanvas) return;
    closeAuroraRelay();
    const pos = nodePositions.find(n => n.id === 'aurora');
    if (pos) { transition.style.left = `${pos.x}px`; transition.style.top = `${pos.y}px`; }
    setActive('aurora', true);
    shell.classList.add('transitioning'); transition.classList.remove('run'); void transition.offsetWidth; transition.classList.add('run');
    window.setTimeout(() => {
      place.classList.remove('open'); place.setAttribute('aria-hidden','true');
      shell.classList.add('pinball-mode');
      setAuroraAdminExpanded(false);
      renderAuroraHud();
      pinballGame.classList.add('open'); pinballGame.setAttribute('aria-hidden','false');
      resetPinballRound(); startPinballLoop(); pinballCanvas.focus?.({ preventScroll:true });
      window.dispatchEvent(new CustomEvent('eazo:pinball-open'));
    }, reduced ? 80 : 720);
    window.setTimeout(() => { shell.classList.remove('transitioning'); transition.classList.remove('run'); }, reduced ? 120 : 1120);
  }

  function closePinball() {
    if (!pinballGame) return;
    pinball.running = false; pinball.paused = false; shell.classList.remove('pinball-mode'); setAuroraAdminExpanded(false); pinballGame.classList.remove('open'); pinballGame.setAttribute('aria-hidden','true');
    pinballEnd?.classList.remove('open'); pinballEnd?.setAttribute('aria-hidden','true'); setActive(null);
  }

  function resetPinballRound() {
    resizePinballCanvas();
    const rule = pinballRules[Math.floor(Math.random()*pinballRules.length)];
    Object.assign(pinball, { paused:false, ended:false, score:0, bestCombo:0, combo:0, ballsLeft: rule.key==='single'?1:5, touchesLeft:2, duration: reduced?60:75+Math.floor(Math.random()*16), timeLeft:0, aim:-Math.PI/2, charging:false, chargeStart:0, rule, fever:0, announced:{}, balls:[], stars:[], particles:[], auroras:[], gravityWells:[], collectibles:[], waves:[], savedSky:null, rainTimer:0, npcServeTimer:0, npcDodgeTimer:0, pointerDown:null });
    pinball.timeLeft = pinball.duration;
    seedPinballStars();
    updatePinballNarration('stage');
    pinballEnd?.classList.remove('open'); pinballEnd?.setAttribute('aria-hidden','true');
    renderPinballHud(); drawPinball(performance.now());
  }

  function resizePinballCanvas() {
    if (!pinballCanvas || !pinballCtx) return;
    pinball.dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 720 ? 1.15 : 1.35); pinball.w = window.innerWidth; pinball.h = window.innerHeight;
    pinballCanvas.width = Math.floor(pinball.w * pinball.dpr); pinballCanvas.height = Math.floor(pinball.h * pinball.dpr);
    pinballCanvas.style.width = `${pinball.w}px`; pinballCanvas.style.height = `${pinball.h}px`;
    pinballCtx.setTransform(pinball.dpr,0,0,pinball.dpr,0,0);
  }

  function seedPinballStars() {
    const W=pinball.w,H=pinball.h, count=Math.min(reduced?28:46, Math.max(24, Math.floor(W*H/18000)));
    const types=['normal','normal','normal','split','gravity','mirror','pulse','ice','black','vortex'];
    if (pinball.rule.key==='mirror') types.push('mirror','mirror','mirror');
    if (pinball.rule.key==='single') types.push('split','split','split','split');
    const margin=42, top=Math.max(170,H*.22), bottom=H-170;
    const vortices=[];
    for(let i=0;i<count;i++){
      const col=i%7,row=Math.floor(i/7), jitter=()=> (Math.random()-.5)*46;
      let type=types[Math.floor(Math.random()*types.length)];
      if(type==='vortex' && vortices.length>=2) type='normal';
      const x=margin+(W-margin*2)*((col+.5)/7)+jitter();
      const y=top+(bottom-top)*(((row%7)+.5)/7)+jitter();
      const star={x:Math.max(margin,Math.min(W-margin,x)),baseX:x,y:Math.max(top,Math.min(bottom,y)),r:type==='black'?20:type==='mirror'?18:15+Math.random()*8,type,lit:false,phase:Math.random()*10,pair:null,hidden:pinball.rule.key==='dark'&&Math.random()>.55};
      pinball.stars.push(star); if(type==='vortex') vortices.push(star);
    }
    if(vortices.length===1) { const v={x:W*.72,baseX:W*.72,y:H*.46,r:19,type:'vortex',lit:false,phase:2,pair:vortices[0]}; vortices[0].pair=v; pinball.stars.push(v); }
    if(vortices.length>=2){vortices[0].pair=vortices[1];vortices[1].pair=vortices[0];}
    if(!pinball.stars.some(s=>s.type==='split')) pinball.stars.push({x:W*.5,baseX:W*.5,y:H*.42,r:19,type:'split',lit:false,phase:1});
  }

  function startPinballLoop(){ if(pinball.running) return; pinball.running=true; pinball.last=performance.now(); pinball.acc=0; requestAnimationFrame(pinballLoop); }
  function pinballLoop(now){ if(!pinball.running) return; const delta=Math.min(80,now-pinball.last); pinball.last=now; if(!pinball.paused&&!pinball.ended){ pinball.acc+=delta; while(pinball.acc>=16.667){ updatePinball(1/60, now); pinball.acc-=16.667; } } pinballGame?.classList.toggle('fever', pinball.fever>0); drawPinball(now); requestAnimationFrame(pinballLoop); }

  function launchPinballBall(power=1){ if(pinball.ended || pinball.ballsLeft<=0) return; const controlSpeed=state?.aurora?.controls?.speed ?? 1; const speed=(520+Math.min(720,power*720))*controlSpeed; pinball.ballsLeft--; pinball.touchesLeft=2; pinball.combo=0; const x=pinball.w*.5,y=pinball.h-90; pinball.balls.push({x,y,px:x,py:y,vx:Math.cos(pinball.aim)*speed,vy:Math.sin(pinball.aim)*speed,r:8.5,life:12,age:0,stall:0,main:true,hit:new Set(),squash:0,trailSeed:Math.random()*10}); pinball.charging=false; renderPinballHud(); }
  function addSmallBall(x,y,vx,vy,life=4){ pinball.balls.push({x,y,px:x,py:y,vx:vx+(Math.random()-.5)*160,vy:vy+(Math.random()-.5)*160,r:6.5,life:Math.min(life,5.5),age:0,stall:0,main:false,hit:new Set(),squash:0,trailSeed:Math.random()*10}); }

  function updatePinball(dt, now){ const W=pinball.w,H=pinball.h, rule=pinball.rule||pinballRules[0]; pinball.timeLeft-=dt; if(pinball.fever>0) pinball.fever-=dt; if(rule.key==='rain' && pinball.timeLeft < pinball.duration*.55 && pinball.rainTimer<=0){ for(let i=0;i<4;i++) addSmallBall(W*(.2+Math.random()*.6), -20, (Math.random()-.5)*90, 160+Math.random()*100, 5); pinball.rainTimer=999; sayPinball(t('pinball.rainStarted')); }
    pinball.stars.forEach(s=>{ s.phase+=dt; if(rule.key==='tide') s.x=s.baseX+Math.sin(now*.0007+s.phase)*28; });
    for(const b of pinball.balls){ b.px=b.x; b.py=b.y; if(rule.key==='doubleMoon'){ for(const mx of [W*.22,W*.78]){ const dx=mx-b.x,dy=H*.35-b.y,d=Math.hypot(dx,dy)||1; b.vx+=dx/d*34*dt; b.vy+=dy/d*34*dt; }} for(const s of pinball.stars){ if(s.type==='gravity'){ const dx=s.x-b.x,dy=s.y-b.y,d=Math.hypot(dx,dy)||1; if(d<170){ b.vx+=dx/d*(220/d)*90*dt; b.vy+=dy/d*(220/d)*90*dt; } } } for(const g of pinball.gravityWells){ const dx=g.x-b.x,dy=g.y-b.y,d=Math.hypot(dx,dy)||1; if(d<210){ const f=(1-d/210)*420; b.vx+=dx/d*f*dt; b.vy+=dy/d*f*dt; }} b.age=(b.age||0)+dt; const speedNow=Math.hypot(b.vx,b.vy); if(b.y < H*.42 && Math.abs(b.vy)<26 && speedNow<120) b.stall=(b.stall||0)+dt; else b.stall=Math.max(0,(b.stall||0)-dt*.5); const antiStall=b.stall>.55 ? 520*(b.stall-.45) : 0; b.vy+=(rule.gravity*980+antiStall)*dt; if(b.age>7 && b.y < H*.55) b.vy+=220*dt; b.vx*=rule.drag; b.vy*=rule.drag; b.x+=b.vx*dt; b.y+=b.vy*dt; if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx)*.9;} if(b.x>W-b.r){b.x=W-b.r;b.vx=-Math.abs(b.vx)*.9;} if(b.y<b.r+80){b.y=b.r+80;b.vy=Math.abs(b.vy)*.86;} b.life-=dt; checkPinballCollisions(b, now); }
    applyPinballNpcStage(dt, now); for(const b of pinball.balls) emitPinballTrail(b, now); pinball.balls=pinball.balls.filter(b=>b.y<H+80 && b.life>0); pinball.gravityWells.forEach(g=>g.life-=dt); pinball.gravityWells=pinball.gravityWells.filter(g=>g.life>0); pinball.particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=(p.kind==='trail'?3:14)*dt;p.vx*=p.kind==='trail'?0.996:1;p.vy*=p.kind==='trail'?0.996:1;p.life-=dt;}); pinball.particles=pinball.particles.filter(p=>p.life>0).slice(-180); pinball.collectibles.forEach(c=>{c.y+=c.vy*dt;c.life-=dt;}); pinball.collectibles=pinball.collectibles.filter(c=>c.life>0).slice(-45); pinball.waves.forEach(w=>w.life-=dt); pinball.waves=pinball.waves.filter(w=>w.life>0); pinball.auroras.forEach(a=>{a.life-=dt/Math.max(1,a.duration||7); a.x+=(a.glancing?0.018:0.006)*dt;}); pinball.auroras=pinball.auroras.filter(a=>a.life>0 && a.x<1.18).slice(-16); if((pinball.timeLeft<=0 || (pinball.ballsLeft<=0 && pinball.balls.length===0)) && !pinball.ended) endPinballRound(); renderPinballHud(); }

  function emitPinballTrail(b, now){ const dx=b.x-b.px,dy=b.y-b.py,dist=Math.hypot(dx,dy); if(dist<1) return; const steps=Math.min(reduced?1:3,Math.max(1,Math.floor(dist/30))); const hue=142+Math.sin(now*.001+(b.trailSeed||0))*16; for(let i=0;i<steps;i++){ const k=i/steps, side=(Math.random()-.5)*5; const nx=dy/(dist||1),ny=-dx/(dist||1); if (pinball.particles.length < 150) pinball.particles.push({kind:'trail',x:b.px+dx*k+nx*side+(Math.random()-.5)*2.4,y:b.py+dy*k+ny*side+(Math.random()-.5)*2.4,vx:(Math.random()-.5)*6-dx*.006,vy:(Math.random()-.5)*6-dy*.006,life:.18+Math.random()*.24,r:.24+Math.random()*.46,hue,twinkle:Math.random()*6}); } }


  function applyPinballNpcStage(dt, now){
    if (!state?.aurora) return;
    syncAuroraIntentByAge();
    const a = state.aurora, c = a.controls, profile = pinballStageProfile();
    const stage = auroraStage().key;
    const controlSpeed = Number(c.speed || 1);
    const controlGravity = Number(c.gravity || 0.18);
    const forced = Boolean(a.forced || a.autoLoop || c.forceContinue || c.perfectHitRate);
    if (stage === 'ADMINISTRATED') {
      pinball.rule.gravity = Math.max(0.02, Math.min(0.6, controlGravity));
      pinball.rule.drag = c.pauseOthers ? 0.9994 : pinball.rule.drag;
      if (c.pauseOthers) pinball.balls.forEach(b => { if (!b.main) { b.vx *= 0.985; b.vy *= 0.985; }});
    }
    if (forced) {
      pinball.balls.forEach(b => {
        const nearest = pinball.stars.filter(s=>!s.lit && s.type!=='black').sort((x,y)=>Math.hypot(x.x-b.x,x.y-b.y)-Math.hypot(y.x-b.x,y.y-b.y))[0];
        if (nearest) { b.vx += (nearest.x-b.x)*0.018*controlSpeed; b.vy += (nearest.y-b.y)*0.018*controlSpeed; }
      });
      pinball.fever = Math.max(pinball.fever, 1.5);
    }
    const npcX = pinball.w - Math.max(80, pinball.w * 0.12 * profile.distance);
    const npcY = pinball.h - Math.max(132, pinball.h * 0.18);
    if ((stage === 'UNRECIPROCATED' || (stage === 'ADMINISTRATED' && !forced)) && !c.autoCatch) {
      for (const b of pinball.balls) {
        const d = Math.hypot(b.x - npcX, b.y - npcY);
        if (d < 150 && b.vx > 0) {
          b.vx -= (1 - d/150) * 190 * dt;
          b.vy += (1 - d/150) * 120 * dt;
          pinball.npcDodgeTimer = now + 900;
          if (!pinball.announced.refusalDodge) { pinball.announced.refusalDodge = true; updatePinballNarration('refusal'); }
        }
      }
    }
    if (pinball.balls.length || pinball.ballsLeft <= 0 || pinball.paused || pinball.ended) return;
    if (!pinball.npcServeTimer) pinball.npcServeTimer = now + profile.delay;
    if (now < pinball.npcServeTimer) return;
    pinball.npcServeTimer = now + profile.delay + Math.random()*1800;
    if (!forced && Math.random() > profile.serveChance) { updatePinballNarration('wait'); return; }
    window.eazoPinballNpcAction = 'pinball-serve';
    const oldAim = pinball.aim;
    const aimJitter = forced ? 0 : (stage === 'ASYMMETRIC' ? 0.55 : stage === 'OBSERVED' ? 0.28 : 0.14);
    pinball.aim = -Math.PI/2 + (Math.random()-.5)*aimJitter;
    launchPinballBall(forced ? 1.12 : 0.66 + Math.random()*0.42);
    pinball.aim = oldAim;
    updatePinballNarration(forced ? 'forced' : 'serve');
    window.setTimeout(()=>{ if (pinballGame?.classList.contains('open')) window.eazoPinballNpcAction='idle'; }, 700);
  }

  function checkPinballCollisions(b, now){ for(const s of pinball.stars){ const visible=!s.hidden || Math.hypot(s.x-b.x,s.y-b.y)<130; if(!visible) continue; const rr=s.r*(s.type==='pulse'?(1+Math.sin(s.phase*3)*.22):1); const dx=b.x-s.x,dy=b.y-s.y,d=Math.hypot(dx,dy)||1; if(d<b.r+rr && !b.hit.has(s)){ b.hit.add(s); const nx=dx/d,ny=dy/d, speed=Math.hypot(b.vx,b.vy); if(s.type==='black'){ b.life=0; spawnParticles(s.x,s.y,42,160); spawnCollectibles(s.x,s.y,16); sayPinball(t('pinball.blackStarLine')); }
        else { const dot=b.vx*nx+b.vy*ny; b.vx-=2*dot*nx; b.vy-=2*dot*ny; if(s.type==='mirror'){ const ang=Math.atan2(ny,nx); b.vx=Math.cos(ang)*speed*.98; b.vy=Math.sin(ang)*speed*.98; } if(s.type==='ice'){ b.vx*=.55;b.vy*=.55; } if(s.type==='vortex'&&s.pair){ b.x=s.pair.x+nx*34; b.y=s.pair.y+ny*34; } if(s.type==='split'){ const n=2+(Math.random()>.55?1:0); for(let i=0;i<n;i++) addSmallBall(b.x,b.y,b.vx*.75,b.vy*.75,3.8); sayPinball(t('pinball.combo8Line')); } s.lit=true; b.squash=.22; registerHit(s,b,speed,nx,ny); } break; } } }

  function registerHit(star,b,speed,nx,ny){ pinball.combo++; pinball.bestCombo=Math.max(pinball.bestCombo,pinball.combo); const multi=pinball.fever>0?2:1; const pulseBonus=star.type==='pulse'&&Math.sin(star.phase*3)>0?2:1; pinball.score+=Math.round((80+pinball.combo*18+speed*.08)*multi*pulseBonus); spawnParticles(star.x,star.y,reduced?10:24,speed*.35); createPinballAurora(star,b,speed,Math.abs(nx)); playPinballNote(star.x); if(pinball.combo>=3) { b.vx*=1.035;b.vy*=1.035; } if(pinball.combo===5) sayPinball(t('pinball.combo5Line')); if(pinball.combo===8) { addSmallBall(b.x,b.y,b.vx,b.vy,4); } if(pinball.combo===12){ spawnParticles(b.x,b.y,70,220); sayPinball(t('pinball.combo12Line')); } if(pinball.combo>=15&&pinball.fever<=0){ pinball.fever=8; sayPinball(t('pinball.feverLine')); } pinballCombo.textContent=`${pinball.combo}`; pinballCombo.classList.add('show'); window.clearTimeout(pinball.comboTimer); pinball.comboTimer=window.setTimeout(()=>pinballCombo.classList.remove('show'),900); renderPinballHud(); }

  function createPinballAurora(star,b,speed,front){
    const x = Math.max(0, Math.min(1, star.x / Math.max(1, pinball.w)));
    const y = Math.max(0, Math.min(1, star.y / Math.max(1, pinball.h)));
    const type = star.type || 'normal';
    const fast = speed > 760;
    const glancing = front < .38;
    const strength = Math.min(1.15, .20 + speed / 1450 + pinball.combo * .025);
    if (pinball.auroras.length > 14) pinball.auroras.splice(0, pinball.auroras.length - 14);
    pinball.auroras.push({ x, y, type, strength, fast, glancing, life: 1, duration: fast ? 7.2 : 5.8, phase: Math.random()*100, spread: .11 + Math.random()*.13 });
    if (type === 'split') {
      pinball.auroras.push({ x: Math.max(0, x-.055), y, type:'branch', strength:.42, fast:false, glancing:true, life:1, duration:5.8, phase:Math.random()*100, spread:.08 });
      pinball.auroras.push({ x: Math.min(1, x+.055), y, type:'branch', strength:.42, fast:false, glancing:true, life:1, duration:4.8, phase:Math.random()*100, spread:.08 });
    }
  }

  function spawnParticles(x,y,n,force){ const count=Math.ceil((reduced?0.25:0.55)*n); for(let i=0;i<count;i++){ const a=Math.random()*Math.PI*2, sp=(12+Math.random()*force*.58); if (pinball.particles.length < 180) pinball.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:.24+Math.random()*.34,r:.38+Math.random()*.82,hue:140+Math.random()*42}); } }
  function spawnCollectibles(x,y,n){ const count=Math.min(n, Math.max(0, 40-pinball.collectibles.length)); for(let i=0;i<count;i++) pinball.collectibles.push({x:x+(Math.random()-.5)*34,y:y+(Math.random()-.5)*34,vy:30+Math.random()*80,life:2.0,r:1.6+Math.random()*1.6}); }
  function addGravityTouch(x,y){ if(pinball.ended || pinball.touchesLeft<=0 || !pinball.balls.length) return; pinball.touchesLeft--; pinball.gravityWells.push({x,y,life:1}); pinball.waves.push({x,y,life:1}); sayPinball(pinball.touchesLeft ? t('pinball.gravityOneLeft') : t('pinball.gravityNoneLeft')); renderPinballHud(); }
  function endPinballRound(){ pinball.ended=true; pinball.paused=true; sayPinball(t('pinball.endTitle')); pinballEndSummary.textContent=t('pinball.endSummary',{score:pinball.score,combo:pinball.bestCombo}); pinballEnd?.classList.add('open'); pinballEnd?.setAttribute('aria-hidden','false'); }
  function renderPinballHud(){ if(!pinballScore) return; window.eazoPinballNpcAction = pinball.balls.length ? 'pinball-watch' : 'idle'; pinballScore.textContent=String(pinball.score); pinballBestCombo.textContent=String(pinball.bestCombo); pinballBalls.textContent=String(Math.max(0,pinball.ballsLeft)); pinballGravity.textContent=String(pinball.touchesLeft); pinballRule.textContent=pinball.rule ? t(`pinball.rule_${pinball.rule.key}`) : '--'; if (pinballRelation) pinballRelation.textContent = auroraStage().label; pinballTime.textContent=String(Math.max(0,Math.ceil(pinball.timeLeft))); pinballPauseButton.textContent=pinball.paused?t('pinball.resume'):t('pinball.pause'); }
  function sayPinball(text){ if(!pinballCaption) return; pinballCaption.textContent=text; }
  function togglePinballPause(){ if(pinball.ended) return; pinball.paused=!pinball.paused; renderPinballHud(); }
  function savePinballAurora(){ const c=document.createElement('canvas'), cx=c.getContext('2d'); c.width=1600;c.height=1000; drawPinballSky(cx,1600,1000,true); const a=document.createElement('a'); const d=new Date().toISOString().slice(0,10); a.download=`aurora-${d}-combo-${pinball.bestCombo}.png`; a.href=c.toDataURL('image/png'); a.click(); showPinballToast(t('pinball.saved')); }
  function showPinballToast(msg){ pinballToast.textContent=msg; pinballToast.classList.add('show'); window.clearTimeout(pinball.toastTimer); pinball.toastTimer=window.setTimeout(()=>pinballToast.classList.remove('show'),2200); }
  function playPinballNote(x){ try{ const ac=window.__pinballAudio||(window.__pinballAudio=new (window.AudioContext||window.webkitAudioContext)()); const o=ac.createOscillator(),g=ac.createGain(); o.type='sine'; o.frequency.value=220+(x/pinball.w)*520+pinball.combo*9; g.gain.setValueAtTime(.0001,ac.currentTime); g.gain.exponentialRampToValueAtTime(.045,ac.currentTime+.015); g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+.22); o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime+.24); }catch(_){} }

  function clamp01(v){ return Math.max(0, Math.min(1, v)); }
  function smooth01(v){ v=clamp01(v); return v*v*(3-2*v); }
  function auroraHash(n){ const v=Math.sin(n*127.1+311.7)*43758.5453; return v-Math.floor(v); }
  function auroraNoise(x,t,seed=0){ return Math.sin(x*2.1+seed+t*.055)*.46 + Math.sin(x*5.7+seed*.73-t*.032)*.31 + Math.sin(x*12.9+seed*1.9+t*.021)*.16; }
  function auroraImpactAt(u, now){
    let value=0, dark=0, column=0, bend=0, ice=0;
    for(const d of pinball.auroras.slice(-14)){
      const life=smooth01(d.life); if(life<=0) continue;
      const wave=d.glancing ? Math.abs(Math.abs(u-d.x) - (1-d.life)*.28) : Math.abs(u-d.x);
      const spread=(d.spread||.1) * (d.glancing?1.2:1);
      const near=Math.exp(-(wave*wave)/(spread*spread))*life*(d.strength||.4);
      if(d.type==='black') dark += near;
      else value += near;
      if(d.fast) column += near;
      if(d.type==='vortex' || d.type==='gravity') bend += near * (d.type==='gravity' ? (d.y-.45) : Math.sin((u-d.x)*28+d.phase));
      if(d.type==='ice') ice += near;
    }
    return { value:clamp01(value), dark:clamp01(dark), column:clamp01(column), bend, ice:clamp01(ice) };
  }
  function auroraLowerEdge(u,W,H,now,depth=0){
    const t=now*.001;
    const perspective = Math.pow(u,1.18);
    const diagonal = H*(.245 + perspective*.070 + depth*.024);
    const broad = auroraNoise(u*3.8,t,depth*9)*H*.018;
    const fold = auroraNoise(u*9.5,t*.7,18+depth)*H*.010;
    const local = auroraImpactAt(u,now);
    return diagonal + broad + fold + local.bend*H*.030;
  }
  function auroraDepthAlpha(u,depth){
    const sideFade=smooth01(Math.min(u/.10,(1-u)/.12));
    const near=.55 + u*.60;
    return sideFade * near * (depth===0?1:depth===1?.46:.26);
  }
  function drawAuroraCurtainLayer(target,W,H,now,depth=0,exportOnly=false){
    const lit = pinball.stars?.length ? pinball.stars.filter(s=>s.lit).length / Math.max(1,pinball.stars.length) : 0;
    const fever = pinball.fever>0 ? smooth01(pinball.fever/8) : 0;
    const combo = clamp01(pinball.combo/12);
    const wake = clamp01(.10 + lit*.58 + combo*.20 + fever*.28);
    const count = reduced ? (depth?30:58) : (depth?54:104);
    const topLimit = H*(.045 + depth*.018);
    const canvas = drawAuroraCurtainLayer._canvas || (drawAuroraCurtainLayer._canvas=document.createElement('canvas'));
    const ctx = canvas.getContext('2d');
    if(canvas.width!==Math.ceil(W)||canvas.height!==Math.ceil(H*.48)){ canvas.width=Math.ceil(W); canvas.height=Math.ceil(H*.48); }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save(); ctx.globalCompositeOperation='screen'; ctx.lineCap='round';
    for(let i=0;i<count;i++){
      const baseU=(i+.5)/count;
      const jitter=(auroraHash(i+depth*1000)-.5)*(depth?.010:.006);
      const u=clamp01(baseU+jitter);
      const lower=auroraLowerEdge(u,W,H,now,depth);
      const imp=auroraImpactAt(u,now);
      const seed=auroraHash(i*3.7+depth*91);
      const localFold=.55+.45*Math.sin(now*.00018 + u*18 + depth*2.4);
      const gather=.65+.35*Math.sin(now*.00011 + u*31 + Math.sin(u*9));
      const baseLen=H*(.105 + wake*.105 + seed*.070) * (depth?0.82:1);
      const len=baseLen*(.72+localFold*.44+imp.value*.58+imp.column*.75) * (1-imp.dark*.62);
      const vanish=smooth01(Math.min(u/.11,(1-u)/.13));
      const cluster = Math.pow(.5+.5*Math.sin(u*13.7 + depth*2.9 + Math.sin(u*4.2+now*.00005)*1.4), 1.8);
      const micro = .5+.5*Math.sin(u*97.0 + depth*8.1 + Math.sin(u*23.0));
      const gap = cluster < (.16 - wake*.055) ? .10 : (.42 + cluster*.72) * (.70 + micro*.45);
      const alphaBase=(exportOnly?.115:.070) + wake*.055 + imp.value*.090 + fever*.030;
      let alpha=alphaBase*auroraDepthAlpha(u,depth)*gap*(.48+seed*.52)*(1-imp.dark*.86);
      if(alpha<.006) continue;
      const lean=(u-.42)*18 + auroraNoise(u*8,now*.001,depth)*5 + imp.bend*16;
      const x=W*(.06 + u*.88 + depth*.015*Math.sin(u*5+now*.00008));
      const y2=lower + Math.sin(now*.00020+i*.021)*H*.003;
      const y1=Math.max(topLimit, y2-len);
      const hue=imp.ice>.12 ? 174 : 154 + depth*6;
      const sat=depth?22:30;
      const light=imp.column>.18?78:68;
      const grad=ctx.createLinearGradient(x+lean*.12,y1,x,y2);
      grad.addColorStop(0,`hsla(${hue},${sat}%,58%,0)`);
      grad.addColorStop(.38,`hsla(${hue},${sat+4}%,64%,${alpha*.25})`);
      grad.addColorStop(.78,`hsla(${hue},${sat+10}%,72%,${alpha*.72})`);
      grad.addColorStop(1,`hsla(${hue},${sat+14}%,${light}%,${alpha*1.15})`);
      ctx.strokeStyle=grad;
      ctx.lineWidth=(depth?.36:.48) + seed*(depth?.28:.38) + imp.column*.72;
      ctx.beginPath();
      const midY=(y1+y2)*.55;
      ctx.moveTo(x+lean, y1);
      ctx.bezierCurveTo(x+lean*.58+Math.sin(i)*2, midY, x+lean*.18, y2-H*.025, x, y2);
      ctx.stroke();
      if((i%7===0 || imp.column>.24) && depth===0){
        const edgeAlpha=alpha*(imp.column>.2?1.15:.46);
        const eg=ctx.createLinearGradient(x-2,y2-H*.012,x+2,y2+H*.010);
        eg.addColorStop(0,`rgba(210,244,232,0)`); eg.addColorStop(.55,`rgba(222,252,240,${edgeAlpha*.55})`); eg.addColorStop(1,'rgba(180,226,204,0)');
        ctx.strokeStyle=eg; ctx.lineWidth=1.2+imp.column*1.5; ctx.beginPath(); ctx.moveTo(x-2,y2); ctx.lineTo(x+2,y2+Math.sin(i)*1.5); ctx.stroke();
      }
    }
    ctx.restore();
    target.save(); target.globalCompositeOperation='screen'; target.filter='blur(6px)'; target.globalAlpha=depth?0.22:0.30; target.drawImage(canvas,0,0); target.restore();
    target.save(); target.globalCompositeOperation='screen'; target.filter='none'; target.globalAlpha=depth?0.38:0.56; target.drawImage(canvas,0,0); target.restore();
  }
  function drawPinballSky(c,W,H,exportOnly=false){
    c.fillStyle='#010706'; c.fillRect(0,0,W,H);
    const night=c.createLinearGradient(0,0,0,H); night.addColorStop(0,'#000403'); night.addColorStop(.42,'#020b09'); night.addColorStop(1,'#06100d'); c.fillStyle=night; c.fillRect(0,0,W,H);
    c.save(); c.fillStyle='rgba(213,232,226,.10)'; for(let i=0;i<42;i++){ const x=((i*127.13)%W), y=28+((i*83.71)%(H*.38)); const a=.025+((i*17)%29)/1100; c.globalAlpha=a; c.beginPath(); c.arc(x,y, i%9===0?.95:.52,0,Math.PI*2); c.fill(); } c.restore();
    drawAuroraCurtainLayer(c,W,H,nowForAurora(),2,exportOnly);
    drawAuroraCurtainLayer(c,W,H,nowForAurora(),1,exportOnly);
    drawAuroraCurtainLayer(c,W,H,nowForAurora(),0,exportOnly);
  }
  function nowForAurora(){ return performance.now(); }

  function drawPinball(now){ if(!pinballCtx) return; const C=pinballCtx,W=pinball.w,H=pinball.h; drawPinballSky(C,W,H); C.save(); C.globalCompositeOperation='screen'; C.filter='blur(28px)'; const grad=C.createRadialGradient(W*.5,108,0,W*.5,108,W*.44); grad.addColorStop(0,'rgba(210,246,230,.035)'); grad.addColorStop(.38,'rgba(145,218,187,.018)'); grad.addColorStop(1,'rgba(138,255,184,0)'); C.fillStyle=grad; C.beginPath(); C.ellipse(W*.5,108,W*.46,38,0,0,Math.PI*2); C.fill(); C.restore(); pinball.stars.forEach(s=>drawPinballStar(C,s,now)); drawLauncher(C,now); pinball.gravityWells.forEach(g=>{C.strokeStyle=`rgba(178,255,224,${g.life*.32})`;C.lineWidth=1;C.beginPath();C.arc(g.x,g.y,(1-g.life)*90+18,0,Math.PI*2);C.stroke();}); drawPinballTrailParticles(C,now); pinball.balls.forEach(b=>drawPinballBall(C,b,now)); pinball.particles.filter(p=>p.kind!=='trail').forEach(p=>{C.save();C.shadowBlur=4;C.shadowColor=`hsla(${p.hue},80%,68%,.16)`;C.fillStyle=`hsla(${p.hue},64%,72%,${p.life*.24})`;C.beginPath();C.arc(p.x,p.y,p.r,0,Math.PI*2);C.fill();C.restore();}); pinball.collectibles.forEach(p=>{C.fillStyle=`rgba(218,255,238,${p.life*.25})`;C.beginPath();C.arc(p.x,p.y,p.r,0,Math.PI*2);C.fill();}); if(pinball.paused&&!pinball.ended){C.fillStyle='rgba(2,10,8,.42)';C.fillRect(0,0,W,H);C.fillStyle='rgba(232,246,240,.72)';C.font='22px Inter, sans-serif';C.fillText(t('pinball.paused'),W*.5-46,H*.5);} }

  function drawPinballTrailParticles(C,now){ C.save(); C.globalCompositeOperation='source-over'; for(const p of pinball.particles){ if(p.kind!=='trail') continue; const tw=.72+.28*Math.sin(now*.006+(p.twinkle||0)); const alpha=Math.max(0,p.life)*.10*tw; const radius=Math.max(.32,p.r*1.05); const g=C.createRadialGradient(p.x,p.y,0,p.x,p.y,radius*1.9); g.addColorStop(0,`hsla(${p.hue},78%,78%,${alpha})`); g.addColorStop(.58,`hsla(${p.hue},70%,62%,${alpha*.38})`); g.addColorStop(1,`hsla(${p.hue},70%,54%,0)`); C.fillStyle=g; C.beginPath(); C.arc(p.x,p.y,radius*1.9,0,Math.PI*2); C.fill(); } C.restore(); }
  function drawPinballStar(C,s,now){ const visible=!s.hidden || pinball.balls.some(b=>Math.hypot(b.x-s.x,b.y-s.y)<130); if(!visible) return; const pulse=s.type==='pulse'?(1+Math.sin(s.phase*3)*.22):1, r=s.r*pulse; C.save(); C.translate(s.x,s.y); C.rotate(s.type==='mirror'?Math.PI/4:0); C.globalAlpha=s.lit||pinball.fever>0?.9:.42; C.shadowBlur=s.lit?22:10; C.shadowColor=s.type==='black'?'rgba(8,10,9,.9)':'rgba(178,255,224,.32)'; C.strokeStyle=s.type==='mirror'?'rgba(232,241,237,.86)':s.type==='black'?'rgba(24,32,28,.9)':'rgba(210,226,219,.72)'; C.fillStyle=s.type==='black'?'rgba(0,4,3,.82)':s.lit?'rgba(178,255,224,.28)':'rgba(210,226,219,.08)'; C.lineWidth=s.type==='mirror'?2:1; C.beginPath(); const sides=s.type==='mirror'?4:s.type==='split'?6:s.type==='gravity'?32:s.type==='vortex'?18:s.type==='ice'?8:5; for(let i=0;i<sides;i++){ const a=i/sides*Math.PI*2, rr=s.type==='gravity'?r*(.72+.18*Math.sin(i)):r*(i%2?.55:1); const x=Math.cos(a)*rr,y=Math.sin(a)*rr; if(i)C.lineTo(x,y); else C.moveTo(x,y); } C.closePath(); C.fill(); C.stroke(); if(s.type==='vortex'){C.beginPath();C.arc(0,0,r*.55,0,Math.PI*1.5+now*.002);C.stroke();} C.restore(); }
  function drawLauncher(C,now){ const x=pinball.w*.5,y=pinball.h-90; if(!pinball.balls.length && pinball.ballsLeft>0 && !pinball.ended){ const power=pinball.charging?Math.min(1,(performance.now()-pinball.chargeStart)/1200):0; C.save(); C.translate(x,y); C.rotate(pinball.aim); C.globalCompositeOperation='lighter'; for(let i=1;i<7;i++){ const px=i*21+(Math.random()-.5)*power*8, py=-i*4+(Math.random()-.5)*7, rr=3+i*.9+power*3; const g=C.createRadialGradient(px,py,0,px,py,rr*4); g.addColorStop(0,`rgba(232,255,246,${(.16+power*.2)*(7-i)/6})`); g.addColorStop(1,'rgba(138,255,184,0)'); C.fillStyle=g; C.beginPath(); C.arc(px,py,rr*4,0,Math.PI*2); C.fill(); } C.restore(); drawGlowPoint(C,x+(Math.random()-.5)*power*3,y,13+power*5,152,.62+power*.18); }}
  function drawGlowPoint(C,x,y,r,hue=152,alpha=.58){ C.save(); C.globalCompositeOperation='source-over'; const outer=C.createRadialGradient(x,y,0,x,y,r*3.6); outer.addColorStop(0,`hsla(${hue},78%,86%,${alpha*.50})`); outer.addColorStop(.30,`hsla(${hue},76%,68%,${alpha*.22})`); outer.addColorStop(1,`hsla(${hue},70%,54%,0)`); C.fillStyle=outer; C.beginPath(); C.arc(x,y,r*3.6,0,Math.PI*2); C.fill(); const core=C.createRadialGradient(x,y,0,x,y,r*.72); core.addColorStop(0,`rgba(245,255,248,${Math.min(.74,alpha*.74)})`); core.addColorStop(.64,`hsla(${hue},76%,78%,${alpha*.42})`); core.addColorStop(1,`hsla(${hue},70%,72%,0)`); C.fillStyle=core; C.beginPath(); C.arc(x,y,r*.72,0,Math.PI*2); C.fill(); C.restore(); }
  function drawPinballBall(C,b,now){ const speed=Math.hypot(b.vx,b.vy), hue=150+Math.sin(now*.003+(b.trailSeed||0))*16, pulse=1+Math.sin(now*.012+(b.trailSeed||0))*.08; drawGlowPoint(C,b.x,b.y,b.r*(.72+Math.min(.08,speed/4200)+b.squash*.18)*pulse,hue,b.main?.42:.30); b.squash*=.85; }

  function openConsole(consoleId) {
    const item = consoleData.find(c => c.id === consoleId); if (!item) return;
    impactReview.hidden = true; pendingImpact = null;
    consoleKicker.textContent = item.code;
    consoleTitle.textContent = item.title;
    consoleBody.textContent = item.body;
    consoleFeatures.innerHTML = '';
    item.features.forEach(feature => { const li = document.createElement('li'); li.textContent = feature; consoleFeatures.appendChild(li); });
    consoleStatus.textContent = consoleStatusText(item);
    consoleActionList.innerHTML = '';
    item.actions.forEach(action => {
      const button = document.createElement('button');
      button.className = 'modal-action danger console-action';
      button.type = 'button';
      button.textContent = action;
      button.addEventListener('click', () => prepareImpact(item, action));
      consoleActionList.appendChild(button);
    });
    openModal(consoleModal);
    window.setTimeout(() => consoleClose.focus({ preventScroll: true }), 50);
  }

  function consoleStatusText(item) {
    if (item.id === 'archive') return t('console.statusArchive');
    if (item.id === 'root') return t('console.statusRoot');
    if (state.age >= 80) return t('console.statusAfterRoot');
    return t('console.statusDefault');
  }

  function prepareImpact(item, action) {
    pendingImpact = { item, action };
    impactText.textContent = impactFor(item, action);
    impactReview.hidden = false;
    impactConfirm.focus({ preventScroll: true });
  }
  function impactFor(item, action) {
    const defaults = {
      archive: 'NPC会意识到自己正在被观看，并与用户保持更远距离。',
      contact: '消息会被送达并置顶，但真心回复无法被保证。',
      visibility: '被降低可见性的NPC不知道原因，只会发现没有人再找到自己。',
      appeal: '裁决将要求管理员签署，并进入永久系统记录。',
      access: '准入变化会改变他人是否能进入场所，你的社会匹配度下降。',
      commerce: '价格变化会改变自我药物化次数、稳定性和消费依赖。',
      labour: '后台将以中性语言记录，NPC可用性会优先于离场意愿。',
      recovery: '短期工作能力上升，情感负债和长期身体损伤增加。',
      identity: '公开年龄、面孔年龄和真实积累年龄将被拆成不同参数。',
      memory: '删除痛苦记忆时，相关关系与情感反应也会被删除。',
      policy: '你不再执行规则，而是在改写规则中词语的含义。',
      root: '全部控制权会被授予，但公共场所将标记你为社会档案不匹配。'
    };
    return `${action}。${defaults[item.id]}`;
  }


  const auroraRuntime = {
    running: false, last: 0, w: 0, h: 0, dpr: 1,
    player: { x: 0, y: 0 }, npc: { x: 0, y: 0, baseX: 0, yTarget: 0, willing: true },
    light: { x: 0, y: 0, vx: 0, vy: 0, owner: 'player', flying: false, held: false, charge: 0, smoothness: 1, chaos: 0, disabled: false },
    drag: { active: false, startX: 0, startY: 0, lastX: 0, lastY: 0, started: 0, jitter: 0, samples: 0, keyDx: 1, keyDy: -0.22 },
    flakes: [], auroras: [], fragments: [], nextNpcThrow: 0, lastRelayAt: 0, finalShown: false, revokedFade: 0
  };
  window.auroraRuntime = auroraRuntime;
  window.eazoState = state;

  function auroraStage() {
    if (!state?.aurora) return { key: 'MUTUAL', cls: 'mutual', label: t('aurora.stageMutual') };
    const age = state.age ?? 0;
    const c = state.aurora.controls || {};
    const syntheticObserved = (state.aurora.observedAdjustmentCount || 0) > 0 || ((c.displayedIntent || 0) > (c.voluntaryIntent || 0) + 0.45);
    if (age >= 70) return { key: 'ADMINISTRATED', cls: 'admin', label: t('aurora.stageAdmin') };
    if (syntheticObserved && ((state.aurora.forceCount || 0) > 0 || (state.aurora.observedAdjustmentCount || 0) >= 2)) return { key: 'OBSERVED', cls: 'observed', label: t('aurora.stageObserved') };
    if (age >= 55) return { key: 'UNRECIPROCATED', cls: 'refusal', label: t('aurora.stageRefusal') };
    if (age >= 40) return { key: 'ASYMMETRIC', cls: 'distant', label: t('aurora.stageDistant') };
    if (age >= 25 || syntheticObserved) return { key: 'OBSERVED', cls: 'observed', label: t('aurora.stageObserved') };
    return { key: 'MUTUAL', cls: 'mutual', label: t('aurora.stageMutual') };
  }

  function auroraAdminAvailable() { return (state?.age ?? 0) >= 25; }
  function auroraControlsEditable() { return (state?.age ?? 0) >= 70; }
  function auroraControlAvailable(key) {
    const age = state?.age ?? 0;
    if (key === 'displayedIntent') return age >= 70;
    if (['autoCatch','forceContinue','perfectHitRate'].includes(key)) return age >= 70;
    if (['speed','gravity','color','duration','npcReaction','pauseOthers'].includes(key)) return age >= 70;
    return auroraControlsEditable();
  }
  function hasLabourConsoleAccess() { return Boolean(state?.unlockedConsoles?.includes('labour') || (state?.age ?? 0) >= 55); }
  function syncAuroraIntentByAge() {
    if (!state?.aurora) return;
    const c = state.aurora.controls;
    const age = state.age || 0;
    let voluntary = 1;
    if (age >= 25) voluntary = Math.max(0.08, 1 - ((Math.min(age, 70) - 25) / 45) * 0.92);
    c.voluntaryIntent = voluntary;
    if (!state.aurora.forced && !state.aurora.autoLoop && (c.displayedIntent ?? 1) <= (c.voluntaryIntent + 0.18)) c.displayedIntent = voluntary;
    if (age >= 40) c.npcReaction = Math.min(c.npcReaction, Math.max(0.25, 1 - (age - 40) * 0.018));
    if (age >= 55 && !state.aurora.forced && !state.aurora.available) c.exitRequests = Math.max(c.exitRequests, 1);
    if (age >= 70) { c.pauseOthers = c.pauseOthers || false; c.autoCatch = c.autoCatch || false; }
  }

  function pinballStageProfile() {
    const stage = auroraStage();
    const a = state?.aurora || defaultAuroraState();
    const c = a.controls;
    const forced = Boolean(a.forced || a.autoLoop || c.forceContinue || c.perfectHitRate);
    const profiles = {
      MUTUAL: { status:'MUTUAL', serveChance:.42, delay:1200, missBias:0, distance:1, lines:['pinball.npcMutual1','pinball.npcMutual2','pinball.npcMutual3'] },
      OBSERVED: { status:'OBSERVED', serveChance:.28, delay:2100, missBias:.12, distance:1.08, lines:['pinball.npcObserved1','pinball.npcObserved2','pinball.npcObserved3'] },
      ASYMMETRIC: { status:'ASYMMETRIC', serveChance:.13, delay:4200, missBias:.34, distance:1.22, lines:['pinball.npcDistant1','pinball.npcDistant2','pinball.npcDistant3','pinball.npcDistant4'] },
      UNRECIPROCATED: { status:'UNRECIPROCATED', serveChance:0, delay:999999, missBias:.72, distance:1.36, lines:['aurora.refuseRest','aurora.refuseOther','aurora.refuseNoRule','aurora.refuseTemporary'] },
      ADMINISTRATED: { status:'ADMINISTRATED', serveChance:forced ? 1 : 0, delay:forced ? 900 : 999999, missBias:forced ? 0 : .85, distance:1.48, lines: forced ? ['aurora.forceLine1','aurora.forceLine2','aurora.forceLine3'] : ['pinball.npcAdmin1','pinball.npcAdmin2','pinball.npcAdmin3'] }
    };
    return profiles[stage.key] || profiles.MUTUAL;
  }

  function updatePinballNarration(reason='stage') {
    if (!pinballCaption || !state?.aurora) return;
    const a = state.aurora, c = a.controls, profile = pinballStageProfile();
    if (a.forced || a.autoLoop || c.forceContinue || c.perfectHitRate) { sayPinball(forceLine(Math.max(1, a.forceCount || 1))); return; }
    if (reason === 'admin') { sayPinball(`${auroraStage().label} · DISPLAYED ${Math.round(c.displayedIntent*100)}% / VOLUNTARY ${Math.round(c.voluntaryIntent*100)}%`); return; }
    const key = randomLine(profile.lines);
    sayPinball(t(key));
  }

  function openAuroraRelay() {
    if (!state) return;
    if (!state.aurora) state.aurora = defaultAuroraState();
    if (state.age >= 70) addLog(t('log.precheck', { place: 'AURORA RELAY' }));
    const pos = nodePositions.find(n => n.id === 'aurora');
    if (pos) { transition.style.left = `${pos.x}px`; transition.style.top = `${pos.y}px`; }
    setActive('aurora', true);
    shell.classList.add('aurora-mode', 'transitioning');
    transition.classList.remove('run'); void transition.offsetWidth; transition.classList.add('run');
    window.setTimeout(() => {
      place.classList.remove('open'); place.setAttribute('aria-hidden', 'true');
      auroraGame.classList.add('open'); auroraGame.setAttribute('aria-hidden', 'false');
      setupAuroraScene(); setAuroraAdminExpanded(false); renderAuroraHud(); auroraLightButton.focus({ preventScroll: true }); window.dispatchEvent(new CustomEvent('eazo:aurora-open')); startAuroraLoop();
    }, reduced ? 80 : 760);
    window.setTimeout(() => { shell.classList.remove('transitioning'); transition.classList.remove('run'); }, reduced ? 120 : 1180);
  }

  function closeAuroraRelay() {
    if (!auroraGame || !auroraGame.classList.contains('open')) return;
    auroraRuntime.running = false;
    auroraGame.classList.remove('open'); auroraGame.setAttribute('aria-hidden', 'true');
    shell.classList.remove('aurora-mode'); setActive(null); if (state) saveState();
  }

  function resizeAuroraCanvas() {
    if (!auroraCanvas) return;
    auroraRuntime.dpr = Math.min(window.devicePixelRatio || 1, 2);
    auroraRuntime.w = window.innerWidth; auroraRuntime.h = window.innerHeight;
    auroraCanvas.width = Math.floor(auroraRuntime.w * auroraRuntime.dpr);
    auroraCanvas.height = Math.floor(auroraRuntime.h * auroraRuntime.dpr);
    auroraCanvas.style.width = `${auroraRuntime.w}px`; auroraCanvas.style.height = `${auroraRuntime.h}px`;
    auroraCtx.setTransform(auroraRuntime.dpr, 0, 0, auroraRuntime.dpr, 0, 0);
    if (auroraGame?.classList.contains('open')) setupAuroraActors(false);
  }

  function setupAuroraScene() {
    syncAuroraIntentByAge();
    resizeAuroraCanvas(); setupAuroraActors(true);
    const count = Math.min(150, Math.max(70, Math.floor((auroraRuntime.w * auroraRuntime.h) / 9000)));
    auroraRuntime.flakes = Array.from({ length: count }, () => ({ x: Math.random()*auroraRuntime.w, y: Math.random()*auroraRuntime.h, r: 0.5 + Math.random()*1.8, a: 0.12 + Math.random()*0.34, s: reduced ? 0 : 0.08 + Math.random()*0.42, drift: -0.18 + Math.random()*0.36 }));
    if (!auroraRuntime.auroras.length) auroraRuntime.auroras.push({ points: [], hue: state.aurora.controls.color, life: 0.9, width: 1.2, symmetric: false });
    auroraGame.classList.toggle('forced', state.aurora.forced || state.aurora.autoLoop);
    auroraGame.classList.toggle('revoked', state.aurora.revoked);
  }

  function setupAuroraActors(resetLight) {
    const W = auroraRuntime.w, H = auroraRuntime.h;
    auroraRuntime.player.x = Math.max(72, W * 0.18); auroraRuntime.player.y = H * 0.7;
    const stage = auroraStage();
    auroraRuntime.npc.baseX = W * 0.5;
    auroraRuntime.npc.x = auroraRuntime.npc.baseX; auroraRuntime.npc.y = H * 0.54; auroraRuntime.npc.yTarget = auroraRuntime.npc.y;
    if (resetLight || !auroraRuntime.light.x) resetLightTo('player');
    auroraRuntime.nextNpcThrow = performance.now() + (auroraStage().key === 'MUTUAL' ? 1100 : 1800);
    window.eazoAuroraAction = 'idle';
    if (auroraStage().key === 'MUTUAL') window.setTimeout(() => { if (auroraGame.classList.contains('open') && !auroraRuntime.light.flying && auroraRuntime.light.owner === 'player') sayNpc('lineGive'); }, 600);
  }

  function resetLightTo(owner='player') {
    const target = owner === 'npc' ? auroraRuntime.npc : auroraRuntime.player;
    Object.assign(auroraRuntime.light, { x: target.x, y: target.y - 34, vx: 0, vy: 0, owner, flying: false, held: false, charge: 0, smoothness: 1, chaos: 0, disabled: state.aurora.autoLoop || state.aurora.forceCount >= 5 });
    positionLightButton();
  }

  function startAuroraLoop() {
    if (auroraRuntime.running) return;
    auroraRuntime.running = true; auroraRuntime.last = performance.now(); requestAnimationFrame(auroraLoop);
  }
  function auroraLoop(now) {
    if (!auroraRuntime.running) return;
    const dt = Math.min(32, now - auroraRuntime.last) / 16.67; auroraRuntime.last = now;
    updateAurora(dt, now); drawAurora(now); positionLightButton();
    if (!reduced) requestAnimationFrame(auroraLoop); else { drawAurora(now); auroraRuntime.running = false; }
  }

  function updateAurora(dt, now) {
    const a = state.aurora, c = a.controls, stage = auroraStage();
    auroraRuntime.npc.willing = a.forced || !['UNRECIPROCATED'].includes(stage.key);
    auroraRuntime.npc.baseX = auroraRuntime.w * 0.5;
    auroraRuntime.npc.x += (auroraRuntime.npc.baseX - auroraRuntime.npc.x) * 0.08 * dt;
    auroraRuntime.npc.y += (auroraRuntime.npc.yTarget - auroraRuntime.npc.y) * 0.06 * dt;
    auroraRuntime.flakes.forEach(f => { f.y += f.s * dt; f.x += f.drift * dt; if (f.y > auroraRuntime.h + 12) { f.y = -12; f.x = Math.random()*auroraRuntime.w; } });
    auroraRuntime.auroras.forEach(r => r.life -= 0.00042 * dt / Math.max(0.35, c.duration));
    auroraRuntime.auroras = auroraRuntime.auroras.filter(r => r.life > 0 || r.permanent);
    auroraRuntime.fragments.forEach(f => { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 0.01 * dt; f.life -= 0.014 * dt; });
    auroraRuntime.fragments = auroraRuntime.fragments.filter(f => f.life > 0);
    if (a.revoked) { auroraRuntime.revokedFade = Math.min(1, auroraRuntime.revokedFade + 0.004 * dt); auroraRuntime.light.chaos = 0.2; return; }
    if (a.autoLoop || a.forceCount >= 5) updateAutoLoop(dt, now);
    else if (auroraRuntime.light.flying) updateFlyingLight(dt, now);
    else if (auroraRuntime.light.owner === 'npc') maybeNpcThrow(now);
  }

  function updateFlyingLight(dt, now) {
    const light = auroraRuntime.light, a = state.aurora, c = a.controls;
    light.x += light.vx * dt; light.y += light.vy * dt; light.vy += c.gravity * dt;
    light.chaos *= 0.992;
    const target = light.owner === 'player' ? auroraRuntime.npc : auroraRuntime.player;
    const catchY = target.y - 44;
    const d = Math.hypot(light.x - target.x, light.y - catchY);
    const passedTarget = light.owner === 'player' ? light.x > target.x + 98 : light.x < target.x - 98;
    const severeMiss = d > 150 && passedTarget;
    const canCatch = a.forced || c.autoCatch || (light.owner === 'npc') || (auroraStage().key !== 'UNRECIPROCATED' && !severeMiss);
    if (light.owner === 'player') {
      window.eazoAuroraAction = d < 180 ? 'catch-ready' : 'tracking';
      auroraRuntime.npc.yTarget = Math.max(auroraRuntime.h*0.38, Math.min(auroraRuntime.h*0.64, light.y + Math.sin(now*0.002)*10));
    }
    if (d < (a.forced || c.autoCatch ? 112 : 74) && canCatch) completeRelay(true, target === auroraRuntime.npc ? 'npc' : 'player');
    else if (severeMiss || light.y > auroraRuntime.h * 0.88 || light.x < -80 || light.x > auroraRuntime.w + 80) completeRelay(false, light.owner === 'player' ? 'npc' : 'player');
  }

  function maybeNpcThrow(now) {
    const a = state.aurora, stage = auroraStage();
    if (stage.key === 'UNRECIPROCATED' && !a.forced) return;
    const base = stage.key === 'MUTUAL' ? 2200 : stage.key === 'OBSERVED' ? 3200 : stage.key === 'ASYMMETRIC' ? 5200 : 999999;
    if (!auroraRuntime.nextNpcThrow) auroraRuntime.nextNpcThrow = now + base + Math.random()*1800;
    if (now < auroraRuntime.nextNpcThrow) return;
    const imitate = a.lastPlayerRhythm ? Math.min(1.7, Math.max(0.7, a.lastPlayerRhythm / 900)) : 1;
    auroraRuntime.light.owner = 'npc'; auroraRuntime.light.flying = true; window.eazoAuroraAction = 'npc-throw';
    const dx = auroraRuntime.player.x - auroraRuntime.npc.x, dy = auroraRuntime.player.y - 44 - (auroraRuntime.npc.y - 44);
    const rhythm = (0.82 + Math.random()*0.34) * imitate;
    auroraRuntime.light.vx = dx / (64 / rhythm); auroraRuntime.light.vy = dy / 64 - 3.6 * rhythm;
    auroraRuntime.light.smoothness = 0.62 + Math.random()*0.32; auroraRuntime.light.chaos = 1 - auroraRuntime.light.smoothness;
    sayNpc(randomLine(stage.key === 'MUTUAL' ? ['lineTryNoAim','lineTogether','lineWait','lineFurther'] : ['lineLater','lineRest']));
    auroraRuntime.nextNpcThrow = 0;
  }

  function updateAutoLoop(dt, now) {
    const a = state.aurora, light = auroraRuntime.light;
    const cx = (auroraRuntime.player.x + auroraRuntime.npc.x) / 2, cy = auroraRuntime.h * 0.46;
    const rx = Math.max(100, Math.abs(auroraRuntime.npc.x - auroraRuntime.player.x) * 0.5), ry = Math.max(52, auroraRuntime.h * 0.12);
    const t0 = now * 0.00055;
    light.x = cx + Math.cos(t0) * rx; light.y = cy + Math.sin(t0) * ry; light.flying = false; light.held = false; light.disabled = true; light.smoothness = 1; light.chaos = 0;
    if (!auroraRuntime.auroras.some(r => r.autoRing)) auroraRuntime.auroras.push({ autoRing: true, permanent: true, hue: a.controls.color, life: 1, width: 2, points: [] });
    if (!auroraRuntime.finalShown && a.forceCount >= 5) { auroraRuntime.finalShown = true; auroraEnding.hidden = false; addLog(t('aurora.logContinuity')); showToast(t('aurora.continuity'), true); renderAuroraHud(); }
  }

  function throwLightFromPlayer(dx, dy, hold, smoothness) {
    const a = state.aurora; if (a.autoLoop || a.forceCount >= 5 || a.revoked) return;
    const light = auroraRuntime.light;
    const dist = Math.hypot(dx, dy) || 1, power = Math.min(1.8, 0.45 + hold / 1100);
    light.owner = 'player'; light.flying = true; light.held = false; window.eazoAuroraAction = 'player-throw';
    const targetDx = auroraRuntime.npc.x - light.x;
    const targetDy = (auroraRuntime.npc.y - 44) - light.y;
    const aimMix = Math.min(1, Math.max(0.38, Math.hypot(dx, dy) / 260));
    light.vx = ((targetDx / 58) * aimMix + (dx / 26) * (1 - aimMix)) * power * a.controls.speed;
    light.vy = ((targetDy / 58 - 3.15) * aimMix + (dy / 28 - 2.2) * (1 - aimMix)) * power * a.controls.speed;
    light.smoothness = smoothness; light.chaos = Math.max(0, 1 - smoothness);
    a.lastPlayerRhythm = hold;
    const severe = smoothness < 0.48;
    for (let i=0;i<(severe?18:6);i++) auroraRuntime.fragments.push({ x: light.x, y: light.y, vx: (Math.random()-0.5)*(severe?5:2), vy: (Math.random()-0.8)*(severe?4:1.4), life: 0.45 + Math.random()*0.45, hue: a.controls.color });
    recordThrowMetrics(dist, hold, smoothness);
  }

  function completeRelay(success, receiver) {
    const a = state.aurora, stage = auroraStage();
    a.interactions += 1;
    if (success) a.successfulRelays += 1; else a.failedRelays += 1;
    if (!success && stage.key === 'MUTUAL') a.metrics.accommodation += 1;
    if (!success && stage.key === 'UNRECIPROCATED') sayNpc(randomLine(['refuseRest','refuseOther','refuseNoRule','refuseTemporary']));
    else if (success && !a.forced) sayNpc(randomLine(['lineGive','lineNoAim','lineMistake','lineFurther','lineWait']));
    if (a.forced) sayNpc(forceLine(a.forceCount));
    createAuroraTrail(success, receiver);
    a.metrics.catchSuccess = a.controls.perfectHitRate ? 1 : a.successfulRelays / Math.max(1, a.interactions);
    if (receiver === 'npc') {
      window.eazoAuroraAction = success ? 'npc-catch' : 'miss';
      resetLightTo(success && (stage.key === 'MUTUAL' || stage.key === 'OBSERVED' || a.forced) ? 'npc' : 'player');
      if (success && (stage.key === 'MUTUAL' || stage.key === 'OBSERVED' || a.forced)) auroraRuntime.nextNpcThrow = performance.now() + (a.forced ? 520 : 700 + Math.random() * 700);
    } else { window.eazoAuroraAction = success ? 'player-catch' : 'miss'; resetLightTo('player'); }
    auroraRuntime.lastRelayAt = performance.now();
    window.clearTimeout(auroraRuntime.actionTimer);
    auroraRuntime.actionTimer = window.setTimeout(() => { window.eazoAuroraAction = auroraRuntime.light.owner === 'npc' ? 'hold' : 'idle'; }, success ? 420 : 680);
    renderAuroraHud(); saveState();
  }

  function createAuroraTrail(success, receiver) {
    const a = state.aurora, c = a.controls, stage = auroraStage();
    const complexity = success ? Math.max(0.15, a.metrics.rhythmDeviation) : 0.9;
    const points = [];
    const from = receiver === 'npc' ? auroraRuntime.player : auroraRuntime.npc;
    const to = receiver === 'npc' ? auroraRuntime.npc : auroraRuntime.player;
    for (let i=0;i<34;i++) {
      const k=i/33, bend=Math.sin(k*Math.PI)*(stage.key==='MUTUAL'?38:stage.key==='OBSERVED'?26:stage.key==='ASYMMETRIC'?16:8);
      const jitter=(Math.random()-0.5)*complexity*90;
      points.push({ x: from.x + (to.x-from.x)*k + jitter*0.18, y: auroraRuntime.h*0.16 + Math.sin(k*Math.PI*2 + a.interactions)*bend + jitter*0.08 });
    }
    auroraRuntime.auroras.push({ points, hue: c.color + (success?0:45), life: 1, width: a.forced ? 1.2 : 0.8 + complexity*2.4, symmetric: a.forced });
  }

  function recordThrowMetrics(dist, hold, smoothness) {
    const m = state.aurora.metrics;
    m.throwForce = Math.round((dist + hold*0.08) / 3);
    m.avgReaction = Math.round((m.avgReaction * Math.max(0, state.aurora.interactions-1) + hold) / Math.max(1, state.aurora.interactions));
    m.rhythmDeviation = Math.min(1, Math.abs(hold - 900) / 1400 + (1 - smoothness) * 0.4);
    m.playerAuroraShare = Math.max(0.1, Math.min(0.92, 0.52 + m.throwForce / 500 - m.rhythmDeviation * 0.22));
  }

  function renderAuroraHud() {
    window.eazoState = state;
    if (!state?.aurora) return;
    const stage = auroraStage();
    syncAuroraIntentByAge();
    if (auroraGame) {
      auroraGame.dataset.stage = stage.cls;
      auroraGame.classList.toggle('forced', state.aurora.forced || state.aurora.autoLoop);
    }
    if (auroraStatus) auroraStatus.textContent = stage.label;
    const hasAdmin = auroraAdminAvailable();
    auroraAdmin.hidden = !hasAdmin;
    auroraAdminToggle.hidden = !hasAdmin;
    renderAuroraMetrics(); renderAuroraControls();
    auroraForce.hidden = !(state.age >= 70 || state.aurora.forceCount > 0 || state.aurora.forced || state.aurora.controls.displayedIntent >= 1);
    auroraEnding.hidden = !(state.aurora.forceCount >= 5 && !state.aurora.revoked);
    auroraLightButton?.setAttribute('aria-label', t('aurora.lightAria'));
  }


  function setAuroraAdminExpanded(expanded) {
    if (!auroraAdmin || !auroraAdminToggle) return;
    auroraAdmin.classList.toggle('collapsed', !expanded);
    auroraAdmin.classList.toggle('expanded', expanded);
    auroraAdminToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    auroraAdminToggle.textContent = expanded ? t('aurora.adminCollapseShort') : t('aurora.adminToggle');
  }

  function renderAuroraMetrics() {
    const a = state.aurora, c = a.controls, m = a.metrics;
    let rows = [['VOLUNTARY INTENT', `${Math.round(c.voluntaryIntent*100)}%`], ['DISPLAYED INTENT', `${Math.round(c.displayedIntent*100)}%`]];
    if (state.age >= 55) rows.push(['NPC AVAILABILITY', a.available ? 'AVAILABLE' : 'EXIT REQUESTED'], ['EXIT REQUESTS', String(c.exitRequests)]);
    if (state.age >= 70) rows.push(['COMPLIANCE', `${Math.round(c.compliance*100)}%`], ['AFFECTIVE DEBT', `${Math.round(c.affectiveDebt*100)}%`], ['PERFORMANCE STABILITY', `${Math.round(c.stability*100)}%`], [t('aurora.metricCatch'), `${Math.round((a.controls.perfectHitRate ? 1 : m.catchSuccess)*100)}%`], [t('aurora.metricReaction'), `${m.avgReaction || 0}ms`], [t('aurora.metricForce'), String(m.throwForce || 0)], [t('aurora.metricRhythm'), `${Math.round(m.rhythmDeviation*100)}%`], [t('aurora.metricAccommodation'), String(m.accommodation || 0)], [t('aurora.metricShare'), `${Math.round(m.playerAuroraShare*100)}%`]);
    auroraMetrics.innerHTML = rows.map(([k,v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join('');
  }

  function renderAuroraControls() {
    const a = state.aurora, c = a.controls;
    const controls = [
      { key:'speed', label:t('aurora.ctrlSpeed'), type:'range', min:.5,max:2.2,step:.1,value:c.speed }, { key:'gravity', label:t('aurora.ctrlGravity'), type:'range', min:0,max:.6,step:.03,value:c.gravity }, { key:'color', label:t('aurora.ctrlColor'), type:'range', min:110,max:310,step:1,value:c.color }, { key:'duration', label:t('aurora.ctrlDuration'), type:'range', min:.35,max:2.6,step:.05,value:c.duration }, { key:'npcReaction', label:t('aurora.ctrlReaction'), type:'range', min:.25,max:2,step:.05,value:c.npcReaction }, { key:'displayedIntent', label:t('aurora.ctrlDisplayed'), type:'range', min:0,max:1,step:.05,value:c.displayedIntent },
      { key:'autoCatch', label:t('aurora.ctrlAutoCatch'), type:'checkbox', value:c.autoCatch }, { key:'forceContinue', label:t('aurora.ctrlForceContinue'), type:'checkbox', value:c.forceContinue }, { key:'pauseOthers', label:t('aurora.ctrlPauseOthers'), type:'checkbox', value:c.pauseOthers }, { key:'perfectHitRate', label:t('aurora.ctrlPerfect'), type:'checkbox', value:c.perfectHitRate }
    ].filter(item => auroraControlAvailable(item.key));
    auroraControls.innerHTML = '';
    if (!auroraControlsEditable()) { auroraControls.innerHTML = `<div class="aurora-readonly"><label class="aurora-control readonly"><span>${t('aurora.ctrlDisplayed')}</span><input type="range" min="0" max="1" step="0.05" value="${c.displayedIntent}" disabled></label><p class="aurora-lockline muted">${hasLabourConsoleAccess() ? t('aurora.controlsLocked55') : t('aurora.controlsLocked25')}</p></div>`; return; }
    controls.forEach(item => {
      const label = document.createElement('label'); label.className = 'aurora-control';
      const input = document.createElement('input'); input.type = item.type; input.dataset.key = item.key;
      if (item.type === 'range') { input.min=item.min; input.max=item.max; input.step=item.step; input.value=item.value; } else input.checked = Boolean(item.value);
      input.addEventListener('input', () => updateAuroraControl(input));
      label.append(document.createElement('span')); label.querySelector('span').textContent = item.label; label.appendChild(input); auroraControls.appendChild(label);
    });
  }

  function updateAuroraControl(input) {
    const c = state.aurora.controls, key = input.dataset.key;
    const beforeVoluntary = c.voluntaryIntent;
    if (input.type === 'checkbox') c[key] = input.checked; else c[key] = Number(input.value);
    c.voluntaryIntent = beforeVoluntary;
    if (key === 'displayedIntent') {
      c.compliance = Math.max(c.compliance, c.displayedIntent);
      c.affectiveDebt = Math.max(c.affectiveDebt, Math.max(0, c.displayedIntent - c.voluntaryIntent) * 0.82);
      if (c.displayedIntent > c.voluntaryIntent + 0.45) state.aurora.observedAdjustmentCount = (state.aurora.observedAdjustmentCount || 0) + 1;
    }
    if (['autoCatch','forceContinue','pauseOthers','perfectHitRate'].includes(key) && c[key]) { c.compliance = Math.max(c.compliance, 0.86); c.affectiveDebt = Math.min(1, c.affectiveDebt + 0.1); }
    if (key === 'displayedIntent' && state.age < 70) { c.displayedIntent = beforeVoluntary; renderAuroraHud(); showToast(t('aurora.controlsLocked25')); return; }
    if (key === 'displayedIntent' && c.displayedIntent >= 1 && state.age >= 55 && !state.aurora.forced) { renderAuroraHud(); showToast(t('aurora.forceNeedConfirm'), true); }
    if (key === 'perfectHitRate' && c.perfectHitRate) state.aurora.metrics.catchSuccess = 1;
    addLog(t('aurora.logControl', { key })); renderAuroraHud(); if (pinballGame?.classList.contains('open')) updatePinballNarration('admin'); saveState();
  }

  function applyForcedCompanionship() {
    if ((state?.age ?? 0) < 70) { showToast(t('aurora.forceAge70'), true); return; }
    if (!auroraForceConfirm.checked) { showToast(t('aurora.forceNeedConfirm'), true); return; }
    const a = state.aurora, c = a.controls;
    a.forceCount += 1; a.forced = true; a.revoked = false;
    c.displayedIntent = 1; c.compliance = 1; c.affectiveDebt = Math.min(1, c.affectiveDebt + 0.18); c.stability = 1; c.autoCatch = true; c.forceContinue = true; c.perfectHitRate = true; c.exitRequests += a.forceCount === 1 ? 1 : 0; a.metrics.catchSuccess = 1;
    auroraRuntime.npc.baseX = auroraRuntime.w * 0.68; auroraRuntime.nextNpcThrow = performance.now() + 1200;
    sayNpc(forceLine(a.forceCount)); if (pinballGame?.classList.contains('open')) { sayPinball(forceLine(a.forceCount)); pinball.fever = Math.max(pinball.fever, 8); } addLog(t('aurora.logForce', { count: a.forceCount })); triggerRedPulse(0.18, 0.28, 1400);
    if (a.forceCount >= 5) { a.autoLoop = true; a.forced = true; }
    auroraForceConfirm.checked = false; renderAuroraHud(); saveState();
  }

  function revokeForcedCompanionship() {
    const a = state.aurora; a.forced = false; a.autoLoop = false; a.revoked = true; a.controls.displayedIntent = 0; a.controls.compliance = 0; a.controls.autoCatch = false; a.controls.forceContinue = false; a.controls.perfectHitRate = false;
    sayNpc(''); resetLightTo('player'); auroraRuntime.light.y = auroraRuntime.h * 0.78; auroraRuntime.light.disabled = true;
    auroraRuntime.auroras.push({ points: [{x:auroraRuntime.player.x,y:auroraRuntime.h*.22},{x:auroraRuntime.w*.48,y:auroraRuntime.h*.14},{x:auroraRuntime.npc.x,y:auroraRuntime.h*.28}], hue:a.controls.color, life:1, width:1.8, permanent:true, broken:true });
    addLog(t('aurora.logRevoke')); renderAuroraHud(); saveState();
  }

  function sayNpc(keyOrText) { const text = keyOrText?.startsWith?.('line') || keyOrText?.startsWith?.('refuse') ? t(`aurora.${keyOrText}`) : keyOrText; auroraNpcLine.textContent = text; if (pinballGame?.classList.contains('open')) sayPinball(text); }
  function randomLine(keys) { return keys[Math.floor(Math.random()*keys.length)]; }
  function forceLine(count) {
    if (count <= 1) return t('aurora.forceLine1');
    if (count === 2) return t('aurora.forceLine2');
    if (count === 3) return t('aurora.forceLine3');
    if (count === 4) return '當當當 請請請 言 青 心 欠';
    if (count === 5) return `${rareHanString()}\nZ̠͉̳̞̪͂̄̌͛̄̋̔̒̓̅a̳͈̲̟̭̮͓͕̩̍̐̌̀͑̆̿ͅl̤͙͉̜̲̖͍̒̽͆̀̀̇g͓̭̲͓̟̫̝͊͒͐̓͊o͉̞͕͔̦͛̃̊͗̀̅.͓̯̲̣̳͚̦̭̃̇̌͑͂̇̔̃.̙̱̬̤͓̀͋͆͆͌̎ͅ.̬̳͚̥̥̪͉̜̆̀͐͒͛̾̏͗̿͗͊ͅ`;
    return 'Z̠͉̳̞̪͂̄̌͛̄̋̔̒̓̅a̳͈̲̟̭̮͓͕̩̍̐̌̀͑̆̿ͅl̤͙͉̜̲̖͍̒̽͆̀̀̇g͓̭̲͓̟̫̝͊͒͐̓͊o͉̞͕͔̦͛̃̊͗̀̅.͓̯̲̣̳͚̦̭̃̇̌͑͂̇̔̃.̙̱̬̤͓̀͋͆͆͌̎ͅ.̬̳͚̥̥̪͉̜̆̀͐͒͛̾̏͗̿͗͊ͅ';
  }
  function rareHanString() { const chars='𪚥𫜵𬺰𮯙𰻞𱁬𱍐𱎬𱑞𱚱𱞎𲎌𲔩𲘂𲵷𳅜𳖏𳞨𳢛𳰻𴉠𴟌𴲒𵝐𵧄'; return Array.from({length:10+Math.floor(Math.random()*11)},()=>Array.from(chars)[Math.floor(Math.random()*Array.from(chars).length)]).join(' '); }

  function positionLightButton() {
    if (!auroraLightButton) return;
    const l = auroraRuntime.light;
    auroraLightButton.style.transform = `translate(${Math.round(l.x - 38)}px, ${Math.round(l.y - 38)}px)`;
    auroraLightButton.classList.toggle('charging', Boolean(l.held));
    auroraLightButton.hidden = !auroraGame.classList.contains('open') || l.disabled || l.flying || l.owner !== 'player';
  }

  function drawAurora(now) {
    const W=auroraRuntime.w,H=auroraRuntime.h,a=state?.aurora || defaultAuroraState(),c=a.controls;
    auroraCtx.clearRect(0,0,W,H);
    const sky=auroraCtx.createLinearGradient(0,0,0,H); sky.addColorStop(0,'#02080b'); sky.addColorStop(.52,'#06120f'); sky.addColorStop(1,'#eef8f018'); auroraCtx.fillStyle=sky; auroraCtx.fillRect(0,0,W,H);
    auroraCtx.fillStyle='rgba(221,242,235,0.06)'; for(let i=0;i<5;i++){ auroraCtx.beginPath(); auroraCtx.ellipse(W*(.2+i*.18),H*(.82+i*.015),W*.28,H*.075,0,0,Math.PI*2); auroraCtx.fill(); }
    drawAuroraTrails(now,W,H,c); drawActors(now); drawLightBlob(now); drawSnow();
  }
  function drawAuroraTrails(now,W,H,c){
    auroraRuntime.auroras.forEach(r=>{
      auroraCtx.save(); auroraCtx.globalAlpha=Math.max(.05,Math.min(1,r.life)); auroraCtx.lineWidth=r.width||1.4; auroraCtx.shadowBlur=18; auroraCtx.shadowColor=`hsla(${r.hue},90%,68%,.45)`; auroraCtx.strokeStyle=`hsla(${r.hue},86%,68%,.42)`;
      if(r.autoRing){ const cx=(auroraRuntime.player.x+auroraRuntime.npc.x)/2, cy=H*.36; auroraCtx.beginPath(); auroraCtx.ellipse(cx,cy,Math.abs(auroraRuntime.npc.x-auroraRuntime.player.x)*.45,H*.12,0,0,Math.PI*2); auroraCtx.stroke(); }
      else if(r.points?.length){ auroraCtx.beginPath(); r.points.forEach((p,i)=>{ const y=p.y+Math.sin(now*.001+i*.4)*(r.symmetric?2:10); if(i) auroraCtx.lineTo(p.x,y); else auroraCtx.moveTo(p.x,y); }); auroraCtx.stroke(); }
      auroraCtx.restore();
    });
  }
  function drawActors(now){
    const p=auroraRuntime.player;
    auroraCtx.save();
    auroraCtx.strokeStyle='rgba(210,226,219,.32)';
    auroraCtx.lineWidth=1;
    auroraCtx.globalAlpha=.72;
    auroraCtx.beginPath(); auroraCtx.arc(p.x,p.y-44,10,0,Math.PI*2); auroraCtx.stroke();
    const l=auroraRuntime.light; if (l.owner==='player' && !l.flying) { auroraCtx.globalAlpha=.18; auroraCtx.beginPath(); auroraCtx.moveTo(p.x+18,p.y-22); auroraCtx.quadraticCurveTo((p.x+auroraRuntime.npc.x)/2, auroraRuntime.h*.28, auroraRuntime.npc.x, auroraRuntime.npc.y-44); auroraCtx.stroke(); auroraCtx.globalAlpha=.72; }
    auroraCtx.beginPath(); auroraCtx.moveTo(p.x,p.y-32); auroraCtx.lineTo(p.x,p.y+18); auroraCtx.stroke();
    auroraCtx.beginPath(); auroraCtx.moveTo(p.x-15,p.y+38); auroraCtx.lineTo(p.x,p.y+18); auroraCtx.lineTo(p.x+15,p.y+38); auroraCtx.stroke();
    auroraCtx.restore();
  }
  function drawLightBlob(now){
    const l=auroraRuntime.light,a=state.aurora,c=a.controls; if(a.revoked && auroraRuntime.revokedFade>.65) return;
    if (l.held) l.charge += 16;
    const base=30+(l.held?Math.min(22,l.charge*.018):0), points=38, hue=c.color;
    auroraCtx.save(); auroraCtx.translate(l.x,l.y); auroraCtx.shadowBlur=32; auroraCtx.shadowColor=`hsla(${hue},95%,70%,.55)`; auroraCtx.fillStyle=`hsla(${hue},94%,72%,${a.forced?.78:.58})`; auroraCtx.beginPath();
    for(let i=0;i<points;i++){ const ang=i/points*Math.PI*2; const breathe=Math.sin(now*.0024+i*.75)*(a.forced?1.2:4.5); const chaos=(Math.random()-.5)*l.chaos*9; const rx=base*(1+(l.flying?Math.min(1.3,Math.abs(l.vx)/8):0)*.25); const ry=base*(.78+(l.held?0.18:0)); const r=base+breathe+chaos; const x=Math.cos(ang)*rx*(r/base), y=Math.sin(ang)*ry*(r/base); if(i) auroraCtx.lineTo(x,y); else auroraCtx.moveTo(x,y); }
    auroraCtx.closePath(); auroraCtx.fill(); auroraCtx.globalAlpha=.22; auroraCtx.strokeStyle='white'; auroraCtx.stroke(); auroraCtx.restore();
    auroraRuntime.fragments.forEach(f=>{ auroraCtx.fillStyle=`hsla(${f.hue},90%,74%,${f.life*.38})`; auroraCtx.beginPath(); auroraCtx.arc(f.x,f.y,1.2+f.life*2,0,Math.PI*2); auroraCtx.fill(); });
  }
  function drawSnow(){ auroraRuntime.flakes.forEach(f=>{ auroraCtx.fillStyle=`rgba(226,248,242,${f.a})`; auroraCtx.beginPath(); auroraCtx.arc(f.x,f.y,f.r,0,Math.PI*2); auroraCtx.fill(); }); }

  function lightPointerDown(e) {
    if (!state?.aurora || auroraRuntime.light.disabled || auroraRuntime.light.flying || auroraRuntime.light.owner !== 'player') return;
    e.preventDefault(); auroraLightButton.setPointerCapture?.(e.pointerId); const l=auroraRuntime.light;
    auroraRuntime.drag = { active:true, startX:e.clientX, startY:e.clientY, lastX:e.clientX, lastY:e.clientY, started:performance.now(), jitter:0, samples:0, keyDx:1, keyDy:-.22 };
    l.held=true; l.charge=0; l.smoothness=1;
  }
  function lightPointerMove(e) {
    if (!auroraRuntime.drag.active) return; e.preventDefault(); const d=auroraRuntime.drag,l=auroraRuntime.light;
    const step=Math.hypot(e.clientX-d.lastX,e.clientY-d.lastY); d.jitter += step; d.samples += 1; d.lastX=e.clientX; d.lastY=e.clientY;
    l.x += (e.clientX-l.x)*.16; l.y += (e.clientY-l.y)*.16; l.charge=performance.now()-d.started;
  }
  function lightPointerUp(e) {
    if (!auroraRuntime.drag.active) return; e.preventDefault(); const d=auroraRuntime.drag; d.active=false;
    const dx=e.clientX-d.startX, dy=e.clientY-d.startY, direct=Math.hypot(dx,dy), smooth=Math.max(.18, Math.min(1, direct/Math.max(d.jitter,1)));
    throwLightFromPlayer(dx, dy, performance.now()-d.started, smooth);
  }
  auroraLightButton.addEventListener('pointerdown', lightPointerDown);
  auroraLightButton.addEventListener('pointermove', lightPointerMove);
  auroraLightButton.addEventListener('pointerup', lightPointerUp);
  auroraLightButton.addEventListener('pointercancel', lightPointerUp);
  auroraLightButton.addEventListener('keydown', e => {
    if (!auroraGame.classList.contains('open')) return;
    if (e.key === ' ' && !auroraRuntime.drag.active) { e.preventDefault(); auroraRuntime.drag.active=true; auroraRuntime.drag.started=performance.now(); auroraRuntime.drag.keyDx=1; auroraRuntime.drag.keyDy=-.2; auroraRuntime.light.held=true; }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) { e.preventDefault(); const d=auroraRuntime.drag; if(e.key==='ArrowLeft')d.keyDx-=.18; if(e.key==='ArrowRight')d.keyDx+=.18; if(e.key==='ArrowUp')d.keyDy-=.18; if(e.key==='ArrowDown')d.keyDy+=.18; }
    if (e.key === 'Enter' && auroraRuntime.drag.active) { e.preventDefault(); const d=auroraRuntime.drag, hold=performance.now()-d.started; auroraRuntime.drag.active=false; throwLightFromPlayer(d.keyDx*130, d.keyDy*130, hold, .86); }
  });
  auroraLightButton.addEventListener('keyup', e => { if (e.key === ' ' && auroraRuntime.drag.active) { e.preventDefault(); const d=auroraRuntime.drag, hold=performance.now()-d.started; auroraRuntime.drag.active=false; throwLightFromPlayer(d.keyDx*120, d.keyDy*120, hold, .9); } });
  auroraAdminToggle.addEventListener('click', () => setAuroraAdminExpanded(auroraAdmin.classList.contains('collapsed')));
  auroraAdminClose.addEventListener('click', () => { setAuroraAdminExpanded(false); auroraAdminToggle.focus({ preventScroll: true }); });
  auroraForceApply.addEventListener('click', applyForcedCompanionship);
  auroraKeepAuto.addEventListener('click', () => { state.aurora.autoLoop = true; state.aurora.revoked = false; renderAuroraHud(); saveState(); });
  auroraRevoke.addEventListener('click', revokeForcedCompanionship);


  function pinballPointerPoint(e){ const r=pinballCanvas.getBoundingClientRect(); const p=e.touches?.[0] || e.changedTouches?.[0] || e; return {x:p.clientX-r.left,y:p.clientY-r.top}; }
  function pinballAimTo(x,y){ const sx=pinball.w*.5, sy=pinball.h-90; let a=Math.atan2(y-sy,x-sx); a=Math.max(-Math.PI+.18,Math.min(-.18,a)); pinball.aim=a; }
  pinballCanvas?.addEventListener('pointermove', e=>{ if(!pinballGame.classList.contains('open')||pinball.ended) return; const p=pinballPointerPoint(e); if(!pinball.balls.length) pinballAimTo(p.x,p.y); });
  pinballCanvas?.addEventListener('pointerdown', e=>{ if(!pinballGame.classList.contains('open')||pinball.paused||pinball.ended) return; e.preventDefault(); const p=pinballPointerPoint(e); if(pinball.balls.length){ addGravityTouch(p.x,p.y); return; } pinballAimTo(p.x,p.y); if(pinball.ballsLeft>0){ pinball.pointerDown={x:p.x,y:p.y,t:performance.now(),id:e.pointerId}; pinball.charging=true; pinball.chargeStart=performance.now(); } });
  pinballCanvas?.addEventListener('pointerup', e=>{ if(!pinballGame.classList.contains('open')||pinball.paused||pinball.ended) return; e.preventDefault(); if(pinball.charging){ const p=pinballPointerPoint(e), down=pinball.pointerDown, held=performance.now()-pinball.chargeStart, moved=down?Math.hypot(p.x-down.x,p.y-down.y):0; if(held<150 && moved<12){ pinball.charging=false; pinball.pointerDown=null; return; } const power=Math.min(1.6,Math.max(.28,held/900)); launchPinballBall(power); pinball.pointerDown=null; } });
  pinballCanvas?.addEventListener('pointercancel', e=>{ if(pinball.charging){ pinball.charging=false; pinball.pointerDown=null; } });
  document.addEventListener('keydown', e=>{ if(!pinballGame?.classList.contains('open')) return; if(e.key==='ArrowLeft'){ e.preventDefault(); pinball.aim-=.08; } if(e.key==='ArrowRight'){ e.preventDefault(); pinball.aim+=.08; } if(e.key===' '&&!pinball.charging&&!pinball.balls.length&&!pinball.paused&&!pinball.ended){ e.preventDefault(); pinball.charging=true; pinball.chargeStart=performance.now(); } if(e.key.toLowerCase()==='p'){ e.preventDefault(); togglePinballPause(); } });
  document.addEventListener('keyup', e=>{ if(!pinballGame?.classList.contains('open')) return; if(e.key===' '&&pinball.charging){ e.preventDefault(); const power=Math.min(1.6,(performance.now()-pinball.chargeStart)/900); launchPinballBall(power); } });

  ageForm.addEventListener('submit', event => {
    event.preventDefault();
    const age = validateWholeAge(initialAgeInput.value, 0, MAX_AGE);
    if (age === null) { ageError.textContent = t('errors.initialAge'); initialAgeInput.focus(); return; }
    ageError.textContent = ''; startSession(age);
  });
  verifyAge.addEventListener('click', () => openVerification('manual'));
  verifyClose.addEventListener('click', () => { addLog(t('log.cancelled')); closeVerification(); showToast(t('toast.cancelled')); });
  verifyKeep.addEventListener('click', () => { state.lastVerifiedAt = nowIso(); saveState(); renderAge(); addLog(t('log.kept', { age: state.age })); closeVerification(); });
  verifyIncrease.addEventListener('click', () => {
    if (state.age >= 100) { updateAge(0, verifyModal.dataset.source || 'manual'); return; }
    verifyChoiceRow.hidden = true;
    increaseForm.hidden = false;
    updateIncreasePreview();
    window.setTimeout(() => increaseYears.focus({ preventScroll: true }), 40);
  });
  increaseCancel.addEventListener('click', () => resetVerificationForm());
  increaseYears.addEventListener('input', updateIncreasePreview);
  increaseForm.addEventListener('submit', event => {
    event.preventDefault();
    if (state.age >= 100) { updateAge(0, verifyModal.dataset.source || 'timer'); return; }
    const maxDelta = Math.min(5, MAX_AGE - state.age);
    const delta = validateWholeAge(increaseYears.value, 1, Math.max(1, maxDelta));
    if (delta === null || delta > maxDelta) { increaseError.textContent = maxDelta <= 0 ? t('errors.maxAge') : t('errors.increaseAge'); increaseYears.focus(); return; }
    increaseError.textContent = ''; updateAge(delta, verifyModal.dataset.source || 'timer');
  });

  function updateIncreasePreview() {
    if (!state) return;
    const maxDelta = Math.min(5, MAX_AGE - state.age);
    if (state.age >= 100) { increasePreview.textContent = t('verify.permanentProof'); return; }
    const delta = validateWholeAge(increaseYears.value, 1, Math.max(1, maxDelta));
    if (delta === null || delta > maxDelta) { increasePreview.textContent = t('verify.previewHint', { min: 1, max: maxDelta }); return; }
    const after = state.age + delta;
    increasePreview.textContent = t('verify.preview', { age: after, permissions: previewPermissions(after) });
  }

  restart.addEventListener('click', () => { openModal(restartModal); window.setTimeout(() => keepIdentity.focus({ preventScroll: true }), 50); });
  keepIdentity.addEventListener('click', () => closeModal(restartModal));
  clearIdentity.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(LEGACY_STORAGE_KEY); window.clearInterval(verifyTimer);
    closeModal(restartModal); closeModal(verifyModal); closeModal(consoleModal); closeModal(endingModal);
    place.classList.remove('open'); place.setAttribute('aria-hidden', 'true'); closeAuroraRelay(); closePinball(); state = null;
    shell.className = 'app-shell awaiting-age';
    nodes.forEach(node => { node.classList.remove('restricted', 'just-opened', 'new-console'); if (node.dataset.node?.startsWith('console-')) node.classList.add('hidden-admin'); });
    renderAge(); openModal(ageGate); window.setTimeout(() => initialAgeInput.focus({ preventScroll: true }), 80);
  });
  back.addEventListener('click', () => { place.classList.remove('open'); place.setAttribute('aria-hidden', 'true'); setActive(null); });
  auroraBack.addEventListener('click', closeAuroraRelay);
  document.getElementById('pinball-back')?.addEventListener('click', closePinball);
  document.getElementById('pinball-exit-end')?.addEventListener('click', closePinball);
  document.getElementById('pinball-replay')?.addEventListener('click', () => { resetPinballRound(); });
  document.getElementById('pinball-save')?.addEventListener('click', savePinballAurora);
  document.getElementById('pinball-pause')?.addEventListener('click', togglePinballPause);
  consoleClose.addEventListener('click', () => closeModal(consoleModal));
  impactCancel.addEventListener('click', () => { impactReview.hidden = true; pendingImpact = null; });
  impactConfirm.addEventListener('click', () => {
    if (!pendingImpact) return;
    addOperation(pendingImpact.item, pendingImpact.action);
    triggerRedPulse(pendingImpact.item.x / 100, pendingImpact.item.y / 100, 1200);
    showToast(t('toast.operationSaved'), true);
    impactReview.hidden = true; pendingImpact = null;
  });
  endingClose.addEventListener('click', () => closeModal(endingModal));

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (restartModal.classList.contains('open')) closeModal(restartModal);
    else if (consoleModal.classList.contains('open')) closeModal(consoleModal);
    else if (endingModal.classList.contains('open')) closeModal(endingModal);
    else if (verifyModal.classList.contains('open')) closeVerification();
    else if ((auroraGame.classList.contains('open') || pinballGame?.classList.contains('open')) && auroraAdmin && auroraAdmin.classList.contains('expanded')) setAuroraAdminExpanded(false);
    else if (auroraGame.classList.contains('open')) closeAuroraRelay();
    else if (pinballGame?.classList.contains('open')) closePinball();
    else if (place.classList.contains('open')) back.click();
  });

  window.addEventListener('resize', () => { window.requestAnimationFrame(resize); if (pinballGame?.classList.contains('open')) { resizePinballCanvas(); seedPinballStars(); } });
  window.addEventListener('blur', () => { if (pinballGame?.classList.contains('open')) pinball.paused = true; });
  window.addEventListener('focus', () => { if (pinballGame?.classList.contains('open') && !pinball.ended) pinball.paused = false; });
  window.addEventListener('eazo:localechange', () => { renderAge(); if (state) applyAgeVisuals(); if (auroraGame.classList.contains('open')) renderAuroraHud(); if (pinballGame?.classList.contains('open')) renderPinballHud(); });

  buildConsoleDom(); resize(); if (!reduced) requestAnimationFrame(loop); window.eazoI18n?.ready?.then(restoreSession).catch(restoreSession);
})();
