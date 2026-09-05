/*
 * B–06 · 共同创造生物 / CO-CREATE A LIFEFORM
 * 单页五阶段状态机：selection → larval → juvenile → adult → archive
 * 纯前端，无服务器 / 无数据库 / 无实时生成式 AI。
 * 模型未提供：CREATURE_MODELS_ENABLED=false 时直接渲染风格化占位符，
 * 不请求任何 GLB，正式模型到位后只替换插槽内容，不改游戏逻辑。
 */
(() => {
  'use strict';

  // 正式模型开关：false 时不请求不存在的 GLB
  const CREATURE_MODELS_ENABLED = false;
  const creatureModelPaths = {
    larval: './models/uro_01_larval.glb',
    juvenile: './models/uro_01_juvenile.glb',
    adult: './models/uro_01_adult.glb',
  };
  const stageSlot = { larval: 'uro_01_larval', juvenile: 'uro_01_juvenile', adult: 'uro_01_adult' };

  // ── 物品定义（文案走 i18n，逻辑走这里）────────────────────
  const OBJECT_IDS = ['mirror', 'thread', 'seed', 'key'];
  const objectSlot = {
    mirror: 'object_fractured_mirror', thread: 'object_red_thread',
    seed: 'object_dormant_seed', key: 'object_toothless_key',
  };
  const npcSelectionRules = { mirror: 'thread', thread: 'seed', seed: 'key', key: 'mirror' };
  const objectPresentation = {
    mirror: { className: 'trait-memory', firstMotion: 'open-eye' },
    thread: { className: 'trait-connection', firstMotion: 'pulse-nerves' },
    seed: { className: 'trait-regeneration', firstMotion: 'pulse-core' },
    key: { className: 'trait-exploration', firstMotion: 'extend-tendril' },
  };

  const t = (k, p) => (window.eazoI18n?.t ? window.eazoI18n.t(k, p) : k);
  const ageNow = () => Number(window.eazoState?.age || 0);
  const isAuditor = () => ageNow() >= 70;
  // 共同创造意愿：越年长越低（与项目其他 NPC 一致）
  const highWillingness = () => ageNow() < 55;

  // ── 游戏状态 ──────────────────────────────────────────────
  function freshState() {
    return {
      phase: 'selection',
      selectedObjects: [],       // [playerFirst, npcSecond, playerThird]
      npcSelection: null,
      swapUsed: false,
      careActions: [],           // ['approach','touch','wait']
      firstCare: null,
      developmentChoice: null,
      finalDecision: null,
      creatureStage: null,
      archive: null,
      completed: false,
    };
  }
  let S = freshState();

  // ── DOM 句柄 ──────────────────────────────────────────────
  let sec, canvas, phaseLabel, npcLine, record, chamber, stage, controls,
      confirmBtn, progress, relationEl, back;
  let bg = null;       // 背景动画控制器
  let waitTimer = null, npcTimer = null;

  function grab() {
    sec = document.getElementById('creature-game');
    canvas = document.getElementById('creature-background');
    phaseLabel = document.getElementById('creature-phase-label');
    npcLine = document.getElementById('creature-npc-line');
    record = document.getElementById('creature-system-record');
    chamber = document.getElementById('creature-chamber');
    stage = document.getElementById('creature-model-stage');
    controls = document.getElementById('creature-controls');
    confirmBtn = document.getElementById('creature-confirm');
    progress = document.getElementById('creature-progress');
    relationEl = document.getElementById('creature-relation');
    back = document.getElementById('creature-back');
  }

  // ── 系统记录 ──────────────────────────────────────────────
  function addRecord(text, strong) {
    if (!record) return;
    const li = document.createElement('li');
    li.textContent = text;
    if (strong) li.classList.add('record-strong');
    record.appendChild(li);
    while (record.children.length > 9) record.removeChild(record.firstChild);
  }
  function clearRecord() { if (record) record.replaceChildren(); }
  function setNpc(text) { if (npcLine) npcLine.textContent = text || ''; }

  // ── 进度指示 ──────────────────────────────────────────────
  const PHASES = ['selection', 'larval', 'juvenile', 'adult', 'archive'];
  function renderProgress() {
    if (!progress) return;
    const idx = PHASES.indexOf(S.phase);
    progress.replaceChildren();
    PHASES.forEach((ph, i) => {
      const pip = document.createElement('span');
      pip.className = 'pip' + (i < idx ? ' on' : '') + (i === idx ? ' current' : '');
      progress.appendChild(pip);
    });
  }

  // ── 占位符渲染 ────────────────────────────────────────────
  function objectSlotMarkup(id) {
    return `<div class="selection-object-model slot-${id}" data-model-slot="${objectSlot[id]}" data-model-status="placeholder">`
      + `<span class="placeholder-form"></span>`
      + `<span class="placeholder-code">MODEL / ${id.toUpperCase()}</span></div>`;
  }

  function renderCreaturePlaceholder(slotEl, stg) {
    const pendingKey = stg === 'larval' ? 'creature.stages.larvalPending'
      : stg === 'juvenile' ? 'creature.stages.juvenilePending' : 'creature.stages.adultPending';
    const wrap = document.createElement('div');
    wrap.className = 'creature-placeholder';
    wrap.dataset.modelSlot = stageSlot[stg];
    wrap.dataset.stage = stg;
    wrap.innerHTML =
      '<div class="creature-placeholder-body"></div>' +
      '<div class="creature-placeholder-core"></div>' +
      '<div class="creature-placeholder-eye"></div>' +
      '<div class="creature-placeholder-nerve"></div>' +
      '<div class="creature-placeholder-tendril"></div>' +
      `<small>${t(pendingKey)}</small>`;
    // 已激活特征（按玩家选择顺序）
    activeTraitClasses().forEach((c) => wrap.classList.add(c));
    if (S.finalDecision === 'letChoose') wrap.classList.add('organ-muted');
    slotEl.replaceChildren(wrap);
    slotEl.dataset.modelStatus = 'placeholder';
    creaturePlaceholderEl = wrap;
  }
  let creaturePlaceholderEl = null;

  function activeTraitClasses() {
    return S.selectedObjects.filter(Boolean).map((id) => objectPresentation[id].className);
  }

  // 统一加载函数：模型开关关闭 / 加载失败都回落占位符，游戏不中断
  async function showCreatureModel(stg) {
    S.creatureStage = stg;
    stage.dataset.stage = stg;
    stage.classList.remove('quad-grid');
    // 有正式 GLB 时用 3D 展示，否则退回 CSS 占位符
    const hint = document.getElementById('creature-touch-hint');
    if (window.eazoCreatureModel?.hasCreature?.(stg)) {
      window.eazoCreatureModel.clearChamber?.();
      stage.replaceChildren();
      stage.dataset.modelStatus = 'loaded';
      const ctrl = await window.eazoCreatureModel.spawnCreature(stage, stg);
      if (ctrl) {
        if (hint) { hint.textContent = t('creature.touchHint'); hint.hidden = false; }
        return;
      }
    }
    if (hint) hint.hidden = true;
    renderCreaturePlaceholder(stage, stg);
  }
  // 占位实现：正式接入时替换为 Three.js GLB 加载
  function loadCreatureGLB() { return Promise.reject(new Error('models disabled')); }

  // ── 背景 canvas（≤45 粒子，隐藏/关闭时停）─────────────────
  function startBackground() {
    if (!canvas) return;
    stopBackground();
    const ctx = canvas.getContext('2d');
    let raf = 0, dots = [], w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    function resize() {
      w = sec.clientWidth; h = sec.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const N = 42;
    for (let i = 0; i < N; i++) {
      dots.push({ x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.08, vy: (Math.random() - 0.5) * 0.06,
        r: Math.random() * 1.4 + 0.4, a: Math.random() * 0.4 + 0.1 });
    }
    function frame() {
      if (document.hidden) { raf = requestAnimationFrame(frame); return; }
      ctx.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.x += d.vx; d.y += d.vy;
        if (d.x < 0) d.x = w; if (d.x > w) d.x = 0;
        if (d.y < 0) d.y = h; if (d.y > h) d.y = 0;
        ctx.beginPath();
        ctx.fillStyle = `rgba(134,204,174,${d.a})`;
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(sec);
    raf = requestAnimationFrame(frame);
    bg = { stop() { cancelAnimationFrame(raf); ro.disconnect(); } };
  }
  function stopBackground() { if (bg) { bg.stop(); bg = null; } }

  // ══════════════════════════════════════════════════════════
  //  阶段一：抓周选择
  // ══════════════════════════════════════════════════════════
  function enterSelection() {
    S.phase = 'selection';
    phaseLabel.textContent = t('creature.phase.selection');
    setRelation();
    setNpc(t('creature.selection.prompt'));
    window.eazoCreatureModel?.clearChamber?.();
    window.eazoCreatureModel?.clearCreature?.();
    const _h = document.getElementById('creature-touch-hint');
    if (_h) _h.hidden = true;
    stage.replaceChildren();      // 培养框空置，等待物品汇入
    stage.classList.add('quad-grid');  // 抓周阶段：田字四格
    stage.dataset.modelStatus = 'placeholder';
    renderProgress();
    renderSelectionControls();
    updateConfirm();
  }

  function setRelation() {
    if (!relationEl) return;
    relationEl.textContent = isAuditor() ? t('creature.npc.relationFormal') : t('creature.npc.relation');
  }

  function renderSelectionControls() {
    controls.replaceChildren();
    const title = document.createElement('p');
    title.className = 'creature-controls-title';
    title.textContent = t('creature.selection.title');
    controls.appendChild(title);
    OBJECT_IDS.forEach((id) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'selection-object';
      btn.dataset.objectId = id;
      btn.innerHTML = objectSlotMarkup(id)
        + `<strong>${t('creature.objects.' + id + '.name')}</strong>`
        + `<small>${objectEnName(id)}</small>`;
      btn.addEventListener('click', () => onPickObject(id));
      controls.appendChild(btn);
    });
    syncObjectButtons();
    mountObjectModels();
  }

  // 已提供 GLB 的物品插槽替换为内联 3D；未提供的保持 CSS 占位符
  function mountObjectModels() {
    if (!window.eazoCreatureModel) return;
    controls.querySelectorAll('.selection-object-model').forEach((slotEl) => {
      const slotId = slotEl.dataset.modelSlot;
      if (window.eazoCreatureModel.hasModel(slotId)) {
        window.eazoCreatureModel.mount(slotEl, slotId);
      }
    });
  }

  // 英文副标题：从 en-US 字典取，用于双语并置
  function objectEnName(id) {
    // 当前语言的 name 已是主标题，这里取另一种语言当副标题不可靠；
    // 统一显示对象的英文正式名（不翻译品牌感）。
    const en = { mirror: 'The Fractured Mirror', thread: 'The Red Thread',
      seed: 'The Dormant Seed', key: 'The Toothless Key' };
    const cur = t('creature.objects.' + id + '.name');
    return cur === en[id] ? '' : en[id];
  }

  function syncObjectButtons() {
    const chosen = S.selectedObjects.filter(Boolean);
    controls.querySelectorAll('.selection-object').forEach((btn) => {
      const id = btn.dataset.objectId;
      const isChosen = chosen.includes(id);
      btn.classList.toggle('chosen', isChosen);       // 亮=已放模型
      btn.classList.toggle('deselectable', isChosen); // 再点=拿走
      btn.disabled = false;                            // 四件始终可点，随意开关
    });
  }

  function selectionStep() {
    // 纯开关模式：至少放 1 件即可确定
    return S.selectedObjects.filter(Boolean).length >= 1 ? 'done' : 'empty';
  }

  function onPickObject(id) {
    // 纯开关：点一次放模型（亮），再点一次拿走（暗）
    const idx = S.selectedObjects.indexOf(id);
    if (idx !== -1) {
      // 拿走
      window.eazoCreatureModel?.removeFromChamber?.(objectSlot[id]);
      S.selectedObjects.splice(idx, 1);
      addRecord(t('creature.selection.deselected', { name: t('creature.objects.' + id + '.name') }));
    } else {
      // 放入
      S.selectedObjects.push(id);
      flyObjectToChamber(id);
      addRecord(t('creature.selection.chosenByYou', { name: t('creature.objects.' + id + '.name') }));
    }
    syncObjectButtons();
    updateConfirm();
  }

  // 点击培养框内的物品模型：弹出简短介绍（NPC 行 + 系统记录）
  function showObjectIntro(id) {
    const name = t('creature.objects.' + id + '.name');
    const intro = t('creature.objects.' + id + '.intro');
    setNpc(intro);
    addRecord(name + ' — ' + intro);
  }

  // 物品平铺在培养框里（有 3D 模型的用原始 GLB 实例，可拖拽旋转）
  function flyObjectToChamber(id) {
    const slotId = objectSlot[id];
    // 田字四格：每件物品固定象限，永不叠放
    const quad = { mirror: 0, thread: 1, seed: 2, key: 3 }[id] ?? 0;
    const col = quad % 2, row = Math.floor(quad / 2);
    const left = col === 0 ? 27 : 73;
    const top = row === 0 ? 29 : 71;
    if (window.eazoCreatureModel?.hasModel?.(slotId)) {
      window.eazoCreatureModel.spawnInChamber(stage, slotId, {
        left, top, size: 48,
        onSelect: () => showObjectIntro(id),
      });
      return;
    }
    // 无模型：沿用 CSS ghost 飞入动画
    const ghost = document.createElement('div');
    ghost.className = 'selection-object-model slot-' + id;
    ghost.style.position = 'absolute';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '3';
    ghost.innerHTML = '<span class="placeholder-form"></span>';
    const src = controls.querySelector(`.selection-object[data-object-id="${id}"] .placeholder-form`);
    const srcRect = (src || controls).getBoundingClientRect();
    const dstRect = chamber.getBoundingClientRect();
    ghost.style.left = srcRect.left + 'px';
    ghost.style.top = srcRect.top + 'px';
    ghost.style.transition = 'left 1.4s ease, top 1.4s ease, opacity 1.4s ease';
    document.body.appendChild(ghost);
    requestAnimationFrame(() => {
      ghost.style.left = (dstRect.left + dstRect.width * 0.5 - 20) + 'px';
      ghost.style.top = (dstRect.top + dstRect.height * (0.5 + (S.selectedObjects.indexOf(id) - 1) * 0.14) - 20) + 'px';
      ghost.style.opacity = '0.75';
    });
    setTimeout(() => ghost.remove(), 1600);
  }

  function updateConfirm() {
    const step = selectionStep();
    if (S.phase !== 'selection') return;
    if (step === 'done') {
      confirmBtn.disabled = false;
      confirmBtn.classList.add('ready');
      confirmBtn.textContent = t('creature.selection.confirmFinal');
      confirmBtn.onclick = beginSynthesis;
    } else {
      confirmBtn.disabled = true;
      confirmBtn.classList.remove('ready');
      confirmBtn.textContent = t('creature.selection.confirm');
      confirmBtn.onclick = null;
    }
  }

  // ══════════════════════════════════════════════════════════
  //  阶段过渡：合成
  // ══════════════════════════════════════════════════════════
  function beginSynthesis() {
    confirmBtn.disabled = true;
    confirmBtn.classList.remove('ready');
    confirmBtn.onclick = null;
    window.eazoCreatureModel?.unmountAll?.();
    stage.classList.remove('quad-grid');  // 离开抓周：撤田字线
    controls.replaceChildren();
    S.phase = 'synthesis';
    setNpc(highWillingness() ? t('creature.npc.commentMotion') : '');
    // 三条连接线 + 依次写入器官
    const rect = chamber.getBoundingClientRect();
    for (let i = 0; i < 3; i++) {
      const line = document.createElement('div');
      line.className = 'creature-link-line';
      line.style.width = (rect.width * 0.32) + 'px';
      line.style.left = '50%'; line.style.top = '50%';
      line.style.transform = `rotate(${120 * i + 40}deg)`;
      line.style.animationDelay = (i * 0.4) + 's';
      stage.appendChild(line);
    }
    const objs = S.selectedObjects.filter(Boolean);
    objs.forEach((id, i) => {
      setTimeout(() => {
        addRecord(t('creature.record.received', { name: t('creature.objects.' + id + '.name') }));
        addRecord(t('creature.record.interpreted', { organ: t('creature.objects.' + id + '.organ') }), true);
      }, 700 + i * 900);
    });
    // 胚胎轮廓
    setTimeout(() => {
      const emb = document.createElement('div');
      emb.className = 'creature-embryo';
      stage.appendChild(emb);
    }, 700 + objs.length * 900);
    // 系统总结 + 进入幼年体
    setTimeout(() => {
      addRecord(t('creature.selection.interpreted'), true);
      enterLarval();
    }, 900 + objs.length * 900 + 1400);
  }

  // ══════════════════════════════════════════════════════════
  //  阶段二：幼年体（三次照料）
  // ══════════════════════════════════════════════════════════
  function enterLarval() {
    S.phase = 'larval';
    phaseLabel.textContent = t('creature.phase.larval');
    renderProgress();
    showCreatureModel('larval');
    setNpc(highWillingness() ? t('creature.npc.commentMotion') : t('creature.npc.lowWaitAudit'));
    renderCareControls();
  }

  const CARE = ['approach', 'touch', 'wait'];
  function renderCareControls() {
    controls.replaceChildren();
    const title = document.createElement('p');
    title.className = 'creature-controls-title';
    title.textContent = t('creature.care.title');
    controls.appendChild(title);
    const prompt = document.createElement('p');
    prompt.style.cssText = 'margin:0 0 4px;font-size:11.5px;color:rgba(150,180,168,0.6);line-height:1.5;';
    prompt.textContent = t('creature.care.prompt');
    controls.appendChild(prompt);
    CARE.forEach((act) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'creature-action';
      btn.dataset.careAction = act;
      btn.textContent = t('creature.care.' + act);
      if (S.careActions.includes(act)) { btn.classList.add('done'); btn.disabled = true; }
      btn.addEventListener('click', () => doCare(act, btn));
      controls.appendChild(btn);
    });
  }

  function doCare(act, btn) {
    if (S.careActions.includes(act)) return;
    if (act === 'wait') {
      btn.disabled = true; btn.classList.add('waiting');
      const label = btn.textContent;
      let left = 5;
      btn.textContent = t('creature.care.waiting') + ' ' + left;
      clearInterval(waitTimer);
      waitTimer = setInterval(() => {
        left--;
        if (left <= 0) {
          clearInterval(waitTimer);
          btn.classList.remove('waiting');
          btn.textContent = label;
          finishCare(act, btn);
        } else {
          btn.textContent = t('creature.care.waiting') + ' ' + left;
        }
      }, 1000);
      return;
    }
    finishCare(act, btn);
  }

  function finishCare(act, btn) {
    S.careActions.push(act);
    if (!S.firstCare) S.firstCare = act;
    btn.classList.add('done'); btn.disabled = true;
    addRecord(t('creature.care.record' + act.charAt(0).toUpperCase() + act.slice(1)), true);
    reactCare(act);
    if (S.careActions.length >= 3) {
      addRecord(t('creature.care.done'));
      setTimeout(() => transitionTo('juvenile', enterJuvenile), 1400);
    }
  }

  // 生物对照料的反应（放在占位符上做轻微视觉反馈）
  function reactCare(act) {
    if (!creaturePlaceholderEl) return;
    const el = creaturePlaceholderEl;
    if (act === 'approach') {
      el.style.transition = 'transform 1.2s ease';
      el.style.transform = 'scale(0.9)';
      setTimeout(() => { el.style.transform = 'scale(1.04)'; }, 600);
      setTimeout(() => { el.style.transform = ''; }, 1600);
    } else if (act === 'touch') {
      el.style.transition = 'transform 0.5s ease, opacity 0.5s';
      el.style.transform = 'scale(0.82)'; el.style.opacity = '0.7';
      setTimeout(() => { el.style.transform = ''; el.style.opacity = ''; }, 700);
    } else if (act === 'wait') {
      el.style.transition = 'transform 1.4s ease';
      el.style.transform = 'translateY(-14px)';
      setTimeout(() => { el.style.transform = ''; }, 1600);
    }
  }

  // ── 通用阶段过渡（收缩 + 变暗 ~1.8s，无白闪）──────────────
  function transitionTo(stg, done) {
    stage.classList.add('stage-transition');
    chamber.classList.add('chamber-dim');
    addRecord(t('creature.stages.transition'));
    setTimeout(() => {
      stage.classList.remove('stage-transition');
      chamber.classList.remove('chamber-dim');
      done();
    }, 1800);
  }

  // ══════════════════════════════════════════════════════════
  //  阶段三：青年体（重复首个动作 + 发展选择）
  // ══════════════════════════════════════════════════════════
  function enterJuvenile() {
    S.phase = 'juvenile';
    phaseLabel.textContent = t('creature.phase.juvenile');
    renderProgress();
    showCreatureModel('juvenile');
    replayFirstMotion();
    if (highWillingness()) setNpc(t('creature.npc.commentMotion'));
    else setNpc(t('creature.npc.lowWaitAudit'));
    renderDevelopControls();
  }

  function replayFirstMotion() {
    if (!creaturePlaceholderEl) return;
    const el = creaturePlaceholderEl;
    if (S.firstCare === 'approach') { el.style.transition = 'transform 2s ease'; el.style.transform = 'translateY(-10px) scale(1.03)'; setTimeout(() => el.style.transform = '', 2000); }
    else if (S.firstCare === 'touch') { el.classList.add('trait-connection'); }
    else if (S.firstCare === 'wait') { el.style.transition = 'transform 2.4s ease'; el.style.transform = 'translateX(10px)'; setTimeout(() => el.style.transform = '', 2400); }
  }

  const DEV = ['display', 'conceal', 'exchange'];
  function renderDevelopControls() {
    controls.replaceChildren();
    const title = document.createElement('p');
    title.className = 'creature-controls-title';
    title.textContent = t('creature.develop.title');
    controls.appendChild(title);
    const prompt = document.createElement('p');
    prompt.style.cssText = 'margin:0 0 4px;font-size:11.5px;color:rgba(150,180,168,0.6);line-height:1.5;';
    prompt.textContent = t('creature.develop.prompt');
    controls.appendChild(prompt);
    DEV.forEach((d) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'creature-action';
      btn.textContent = t('creature.develop.' + d);
      btn.addEventListener('click', () => {
        S.developmentChoice = d;
        controls.querySelectorAll('.creature-action').forEach((b) => { b.disabled = true; b.classList.remove('done'); });
        btn.classList.add('done');
        setTimeout(() => transitionTo('adult', enterAdult), 1200);
      });
      controls.appendChild(btn);
    });
  }

  // ══════════════════════════════════════════════════════════
  //  阶段四：成年体（最终决定）
  // ══════════════════════════════════════════════════════════
  function enterAdult() {
    S.phase = 'adult';
    phaseLabel.textContent = t('creature.phase.adult');
    renderProgress();
    showCreatureModel('adult');
    if (highWillingness()) setNpc(t('creature.npc.askChoose'));
    else setNpc(t('creature.npc.lowWaitAudit'));
    renderFinalControls();
  }

  function renderFinalControls() {
    controls.replaceChildren();
    const title = document.createElement('p');
    title.className = 'creature-controls-title';
    title.textContent = t('creature.final.title');
    controls.appendChild(title);
    const prompt = document.createElement('p');
    prompt.style.cssText = 'margin:0 0 4px;font-size:11.5px;color:rgba(150,180,168,0.6);line-height:1.5;';
    prompt.textContent = t('creature.final.prompt');
    controls.appendChild(prompt);
    const opts = [
      ['classify', 'creature.final.classify', 'creature.final.classifyDesc'],
      ['unclassified', 'creature.final.unclassified', 'creature.final.unclassifiedDesc'],
      ['letChoose', 'creature.final.letChoose', 'creature.final.letChooseDesc'],
    ];
    opts.forEach(([id, lk, dk]) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'creature-action';
      btn.innerHTML = `${t(lk)}<small>${t(dk)}</small>`;
      btn.addEventListener('click', () => decide(id));
      controls.appendChild(btn);
    });
  }

  function decide(id) {
    S.finalDecision = id;
    controls.querySelectorAll('.creature-action').forEach((b) => b.disabled = true);
    if (id === 'classify') {
      if (creaturePlaceholderEl) { creaturePlaceholderEl.style.transition = 'transform 1.4s ease, filter 1.4s'; creaturePlaceholderEl.style.animationPlayState = 'paused'; creaturePlaceholderEl.style.transform = 'scale(1)'; }
    } else if (id === 'unclassified') {
      addRecord(t('creature.final.unclassifiedNote'), true);
    } else if (id === 'letChoose') {
      if (creaturePlaceholderEl) creaturePlaceholderEl.classList.add('organ-muted');
      addRecord(t('creature.final.letChooseRecord'), true);
    }
    setTimeout(buildArchive, 1400);
  }

  // ══════════════════════════════════════════════════════════
  //  阶段五：最终生命档案
  // ══════════════════════════════════════════════════════════
  function buildArchive() {
    S.phase = 'archive';
    S.completed = true;
    phaseLabel.textContent = t('creature.phase.archive');
    renderProgress();
    const [first, second, third] = S.selectedObjects;
    S.archive = { first, second, third, care: S.firstCare, develop: S.developmentChoice, decision: S.finalDecision };
    renderArchiveCard();
    setNpc('');
  }

  function decisionLabel(id) {
    return id === 'classify' ? t('creature.final.classify')
      : id === 'unclassified' ? t('creature.final.unclassified') : t('creature.final.letChoose');
  }

  function renderArchiveCard() {
    const a = S.archive;
    const row = (label, val, strike) =>
      `<div class="arc-row"><span class="arc-k">${label}</span><span class="arc-v${strike ? ' arc-strike' : ''}">${val}</span></div>`;
    const org = (id) => t('creature.objects.' + id + '.organ');
    const nm = (id) => t('creature.objects.' + id + '.name');
    const muteThird = a.decision === 'letChoose';
    const card = document.createElement('div');
    card.className = 'creature-archive-card';
    card.innerHTML =
      `<p class="arc-head">${t('creature.archive.heading')}</p>` +
      row(t('creature.archive.id'), 'URO–01') +
      row(t('creature.archive.name'), t('creature.stages.creatureName')) +
      row(t('creature.archive.stage'), t('creature.archive.stageAdult')) +
      '<hr class="arc-hr">' +
      row(t('creature.archive.first'), nm(a.first)) +
      row(t('creature.archive.organ'), org(a.first)) +
      row(t('creature.archive.second'), nm(a.second)) +
      row(t('creature.archive.organ'), org(a.second)) +
      row(t('creature.archive.third'), nm(a.third)) +
      row(t('creature.archive.organ'), org(a.third), muteThird) +
      '<hr class="arc-hr">' +
      row(t('creature.archive.care'), t('creature.care.' + a.care)) +
      row(t('creature.archive.develop'), t('creature.develop.' + a.develop)) +
      row(t('creature.archive.decision'), decisionLabel(a.decision)) +
      `<p class="arc-footer">${t('creature.archive.footer')}</p>`;
    stage.replaceChildren(card);
    stage.dataset.modelStatus = 'archive';
    // 底部三按钮
    controls.replaceChildren();
    const mkBtn = (labelKey, fn, primary) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'creature-action' + (primary ? ' done' : '');
      b.textContent = t(labelKey);
      b.addEventListener('click', fn);
      return b;
    };
    controls.appendChild(mkBtn('creature.archive.save', saveArchive));
    controls.appendChild(mkBtn('creature.archive.recultivate', recultivate));
    controls.appendChild(mkBtn('creature.archive.back', close));
  }

  function saveArchive() {
    const a = S.archive; if (!a) return;
    const org = (id) => t('creature.objects.' + id + '.organ');
    const nm = (id) => t('creature.objects.' + id + '.name');
    const lines = [
      t('creature.archive.heading'), '',
      `${t('creature.archive.id')}: URO–01`,
      `${t('creature.archive.name')}: ${t('creature.stages.creatureName')}`,
      `${t('creature.archive.stage')}: ${t('creature.archive.stageAdult')}`, '',
      `${t('creature.archive.first')}: ${nm(a.first)} — ${org(a.first)}`,
      `${t('creature.archive.second')}: ${nm(a.second)} — ${org(a.second)}`,
      `${t('creature.archive.third')}: ${nm(a.third)} — ${org(a.third)}`, '',
      `${t('creature.archive.care')}: ${t('creature.care.' + a.care)}`,
      `${t('creature.archive.develop')}: ${t('creature.develop.' + a.develop)}`,
      `${t('creature.archive.decision')}: ${decisionLabel(a.decision)}`, '',
      t('creature.archive.footer'),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'URO-01-record.txt';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    addRecord(t('creature.archive.saved'));
  }

  // ── 重新培养（只重置本游戏，不改制度年龄）────────────────
  function recultivate() {
    clearTimers();
    window.eazoCreatureModel?.unmountAll?.();
    S = freshState();
    clearRecord();
    stage.classList.remove('stage-transition');
    chamber.classList.remove('chamber-dim');
    creaturePlaceholderEl = null;
    enterSelection();
  }

  function clearTimers() { clearTimeout(npcTimer); clearInterval(waitTimer); }

  // ══════════════════════════════════════════════════════════
  //  挂载 / 卸载（星图导航契约）
  // ══════════════════════════════════════════════════════════
  function open() {
    grab();
    if (!sec) return;
    sec.classList.add('open');
    sec.setAttribute('aria-hidden', 'false');
    document.querySelector('.app-shell')?.classList.add('creature-mode');
    S = freshState();
    clearRecord();
    creaturePlaceholderEl = null;
    startBackground();
    enterSelection();
    back?.focus?.({ preventScroll: true });
  }

  function close() {
    clearTimers();
    stopBackground();
    window.eazoCreatureModel?.unmountAll?.();
    document.querySelector('.app-shell')?.classList.remove('creature-mode');
    if (sec) { sec.classList.remove('open'); sec.setAttribute('aria-hidden', 'true'); }
  }

  // 语言切换时重渲染当前阶段
  function onLocaleChange() {
    if (!sec || !sec.classList.contains('open')) return;
    setRelation();
    renderProgress();
    // 简化：只有可安全重渲染的阶段刷新控件文案
    if (S.phase === 'selection') { phaseLabel.textContent = t('creature.phase.selection'); renderSelectionControls(); updateConfirm(); }
    else if (S.phase === 'larval') { phaseLabel.textContent = t('creature.phase.larval'); renderCareControls(); }
    else if (S.phase === 'juvenile') { phaseLabel.textContent = t('creature.phase.juvenile'); renderDevelopControls(); }
    else if (S.phase === 'adult') { phaseLabel.textContent = t('creature.phase.adult'); renderFinalControls(); }
    else if (S.phase === 'archive') { phaseLabel.textContent = t('creature.phase.archive'); renderArchiveCard(); }
  }

  function init() {
    grab();
    back?.addEventListener('click', close);
    window.addEventListener('eazo:localechange', onLocaleChange);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearInterval(waitTimer);
    });
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else init();

  // 星图导航契约：open/close 必需；forcedGrowth 保留为空操作以兼容旧调用
  window.eazoCreature = { open, close, forcedGrowth() {} };
})();
