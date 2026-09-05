/* ITM-05 · 罐装寂静 / CANNED SILENCE — 笑声证据音频系统
 * -----------------------------------------------------------------------------
 * 它不是没有声音，而是"世界只剩下一种无法关闭的快乐证据"。
 * 玩家听见笑声，却无法确认是谁在快乐、为什么快乐，以及笑声是否属于自己。
 *
 * 生效时（eazoFx silence 通道激活，60s）：
 *   - snow-audio.js 已把环境/NPC/操作声压低（applyCannedSilence）。
 *   - 本引擎在这份寂静之上，铺一层随机化的真实笑声，走 60s 四阶段时间线：
 *       0–10s  抽空：近乎绝对的寂静
 *       10–35s 笑声出现：由远及近，方向分散，克制
 *       35–50s 狂喜：叠加成过度明亮，间隙消失
 *       50–60s 失去主体：同步成同一节奏 → 一声吸气 → 完全寂静
 *   - 结束后不留循环。
 *
 * 4 段真实素材经随机变调 / 滤波 / 声像 / 远近 / 混响处理，避免明显循环；
 * villain 与 toddler 做额外变调+低通，弱化角色感（反派狂笑/儿童咯咯的"廉价惊悚"）。
 *
 * 全程复用 snow-audio 的 AudioContext（若已解锁），否则自建。
 * 音量总开关沿用 window.eazoSnowAudio.isEnabled()（同一"声音：开启/关闭"按钮）。
 *
 * 公开 API (window.eazoSilenceLaugh):
 *   unlock(), stopNow(), eraseAt(x), debug()
 */
(() => {
  "use strict";

  const SRC = {
    heartfelt: "./media/audio/laugh-heartfelt.mp3",
    santa:     "./media/audio/laugh-santa.mp3",
    villain:   "./media/audio/laugh-villain.mp3",
    toddler:   "./media/audio/laugh-toddler.mp3",
  };
  // 角色感偏强的两段：额外变调下移 + 低通，弱化"表演式"特征。
  const SOFTEN = { villain: { rate: 0.82, lp: 2600 }, toddler: { rate: 0.86, lp: 3000 } };

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;

  let ctx = null;
  let bus = null;           // 笑声专用总线（独立于 snow-audio 的 buses）
  let convolver = null;     // 简易混响（远近/空间模糊）
  let reverbSend = null;
  const buffers = {};       // 解码后的 AudioBuffer
  let decoding = false, decoded = false;

  let running = false;      // 时间线是否在跑
  let startedAt = 0;        // 本轮 silence 的真实起点（Date.now）
  let scheduleTimer = 0;    // 下一声笑的调度定时器
  let syncPulse = 0;        // 失去主体阶段的统一节奏定时器
  let endTimer = 0;
  const liveVoices = new Set();

  const isMobile = window.matchMedia?.("(max-width: 720px), (pointer: coarse)")?.matches || false;

  function fx() { return window.eazoFx || null; }
  function soundEnabled() {
    const sa = window.eazoSnowAudio;
    return sa && typeof sa.isEnabled === "function" ? sa.isEnabled() : true;
  }
  // silence 通道剩余时间（ms）；0 表示未激活
  function silenceInfo() {
    const f = fx(); if (!f || !f.snapshot) return null;
    const snap = f.snapshot();
    const e = (snap.effects || []).find((x) => x.id === "silence");
    if (!e) return null;
    const total = 60000;
    return { remaining: e.remaining, elapsed: total - e.remaining, total, expiresAt: e.expiresAt };
  }
  function ageOf() { return Number(window.eazoState?.age || 0); }

  // ── AudioContext：优先复用 snow-audio 已解锁的 context ──────────────────────
  function ensureContext() {
    const shared = window.eazoSnowAudio;
    // snow-audio 不暴露 ctx，但它与本引擎都在用户手势内 resume；各自建 context 也可。
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      bus = ctx.createGain();
      bus.gain.value = 0.0;
      bus.connect(ctx.destination);
      buildReverb();
    }
    return ctx;
  }

  function buildReverb() {
    try {
      const len = Math.floor(ctx.sampleRate * 1.6);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
      }
      convolver = ctx.createConvolver();
      convolver.buffer = buf;
      reverbSend = ctx.createGain();
      reverbSend.gain.value = 0.5;
      convolver.connect(reverbSend);
      reverbSend.connect(bus);
    } catch (_e) { convolver = null; }
  }

  async function decodeAll() {
    if (decoded || decoding || !ctx) return;
    decoding = true;
    await Promise.all(Object.entries(SRC).map(async ([key, url]) => {
      try {
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        buffers[key] = await ctx.decodeAudioData(arr);
      } catch (_e) { /* 素材缺失时静默跳过 */ }
    }));
    decoding = false;
    decoded = Object.keys(buffers).length > 0;
  }

  async function unlock() {
    if (!ensureContext()) return;
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch (_e) {} }
    // 手势内 start 一个空源，彻底解锁（iOS/Safari）
    try {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource(); s.buffer = b; s.connect(bus); s.start(0);
    } catch (_e) {}
    decodeAll();
    evaluate();
  }

  // ── 单声笑声播放 ────────────────────────────────────────────────────────────
  // opts: { keys, gain, pan, rateJitter, near(0..1 近), synced(bool), lp }
  function playLaugh(opts = {}) {
    if (!ctx || ctx.state !== "running" || !soundEnabled()) return;
    const available = Object.keys(buffers);
    if (!available.length) return;
    if (liveVoices.size > (isMobile ? 6 : 10)) return;

    const pool = (opts.keys && opts.keys.filter((k) => buffers[k])) || available;
    const key = pool[Math.floor(Math.random() * pool.length)] || available[0];
    const buf = buffers[key];
    if (!buf) return;

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;

    // 变调 ±4%（同步阶段收窄到 ±1%），叠加角色弱化的固定下移
    const soft = SOFTEN[key];
    const jitterRange = opts.rateJitter != null ? opts.rateJitter : 0.04;
    const jitter = 1 + (Math.random() * 2 - 1) * jitterRange;
    src.playbackRate.value = (soft ? soft.rate : 1) * jitter;

    // 随机起始位置（避免明显循环点），同步阶段对齐到 0
    const maxOff = Math.max(0, buf.duration - 0.9);
    src.loop = false;

    // 滤波：远处更闷（低通随 near 提升），角色弱化附加低通
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    const near = opts.near != null ? opts.near : 0.4;
    let cutoff = 1400 + near * 5200;                 // 远 ~1.4k → 近 ~6.6k
    if (soft) cutoff = Math.min(cutoff, soft.lp);
    if (opts.lp) cutoff = Math.min(cutoff, opts.lp);
    lp.frequency.value = cutoff;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 120;                        // 去掉恐怖低频

    const g = ctx.createGain();
    const peak = Math.max(0.0001, opts.gain != null ? opts.gain : 0.3);
    g.gain.value = peak;

    src.connect(hp); hp.connect(lp); lp.connect(g);

    // 声像
    let outNode = g;
    if (opts.pan != null && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      g.connect(p); outNode = p;
    }
    outNode.connect(bus);
    // 远处更多混响
    if (convolver) {
      const wet = ctx.createGain();
      wet.gain.value = (1 - near) * 0.6 + 0.08;
      outNode.connect(wet); wet.connect(convolver);
    }

    const startOff = opts.synced ? 0 : Math.random() * maxOff;
    const dur = Math.min(buf.duration - startOff, 1.0 + near * 1.4);
    src.start(now, startOff, dur);
    liveVoices.add(src);
    src.onended = () => liveVoices.delete(src);
  }

  // ── 年龄分段：方向与来源感 ──────────────────────────────────────────────────
  // 18–24 分散共玩；25–54 礼貌社交回应；55–69 来自画面外；70+ 管理员执行后的掌声感
  function ageProfile() {
    const a = ageOf();
    if (a >= 70) return { spread: 0.25, note: "authority" };
    if (a >= 55) return { spread: 0.5, note: "outside" };
    if (a >= 25) return { spread: 0.7, note: "polite" };
    return { spread: 1.3, note: "shared" };
  }
  function pickPan() {
    const p = ageProfile();
    return (Math.random() - 0.5) * p.spread;
  }

  // 其他商品叠加：energy 更密、alcohol 声像漂移
  function energyActive() { return !!fx()?.has?.("energy"); }
  function alcoholActive() { return !!fx()?.has?.("alcohol"); }

  // ── 时间线调度 ──────────────────────────────────────────────────────────────
  function stageOf(elapsed) {
    if (elapsed < 5000) return "empty";
    if (elapsed < 32000) return "emerge";
    if (elapsed < 50000) return "euphoria";
    return "dissolve";
  }

  function scheduleNext() {
    clearTimeout(scheduleTimer);
    if (!running) return;
    const info = silenceInfo();
    if (!info) { stopNow(); return; }
    const elapsed = info.elapsed;
    const stage = stageOf(elapsed);
    let delay, gain, near, rateJitter;

    if (stage === "empty") {
      // 抽空：短暂近乎寂静（约5s），期末排一两声极远的笑作为"出现"预告
      const near0 = elapsed / 5000;                 // 0..1
      if (near0 > 0.55 && Math.random() < 0.5) {
        playLaugh({ gain: 0.08 + near0 * 0.06, near: 0.05, pan: pickPan(), rateJitter: 0.04 });
      }
      delay = 900;
      scheduleTimer = setTimeout(scheduleNext, delay);
      return;
    }
    if (stage === "emerge") {
      // 由远及近，间隔较长，克制（起点已可清晰听见）
      const prog = (elapsed - 5000) / 27000;         // 0..1
      delay = (1300 - prog * 800) * (energyActive() ? 0.6 : 1);
      gain = 0.2 + prog * 0.22;
      near = 0.3 + prog * 0.4;
      rateJitter = 0.04;
    } else if (stage === "euphoria") {
      // 过度明亮，间隙缩小
      const prog = (elapsed - 32000) / 18000;
      delay = (520 - prog * 260) * (energyActive() ? 0.55 : 1);
      gain = 0.34 + prog * 0.16;
      near = 0.6 + prog * 0.3;
      rateJitter = 0.03 - prog * 0.015;
    } else {
      // dissolve 由统一节奏接管，这里不再随机排
      return;
    }

    let pan = pickPan();
    if (alcoholActive()) pan = Math.max(-1, Math.min(1, pan + Math.sin(Date.now() * 0.0013) * 0.7));

    playLaugh({ gain, near, pan, rateJitter });
    // 偶尔叠一声（euphoria 更频繁），制造层叠
    if (stage === "euphoria" && Math.random() < 0.5) {
      setTimeout(() => playLaugh({ gain: gain * 0.8, near, pan: pickPan(), rateJitter }), 90 + Math.random() * 160);
    }

    scheduleTimer = setTimeout(scheduleNext, Math.max(120, delay + (Math.random() - 0.5) * delay * 0.4));
  }

  // 失去主体：所有笑声同步成同一节奏，然后一声吸气 → 寂静
  function startDissolve() {
    clearInterval(syncPulse);
    const key = ["heartfelt", "santa"].find((k) => buffers[k]) || Object.keys(buffers)[0];
    let beat = 0;
    // 同步脉冲：统一 key、统一 pan、极窄变调，间隔逐渐拉开走向单一吸气
    const tick = () => {
      const info = silenceInfo();
      if (!info || !running) { clearInterval(syncPulse); return; }
      const toEnd = info.remaining;
      if (toEnd < 1600) {
        clearInterval(syncPulse);
        breathIn();
        return;
      }
      // 多"人"合成同一声：同 key 叠 2–3 层，几乎无差异
      const layers = 2 + (beat % 2);
      for (let i = 0; i < layers; i++) {
        playLaugh({ keys: [key], gain: 0.34, near: 0.85, pan: 0, rateJitter: 0.01, synced: true });
      }
      beat++;
    };
    tick();
    syncPulse = setInterval(tick, 620);
  }

  // 一声非常近的吸气，然后完全寂静
  function breathIn() {
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.9);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      prev = prev * 0.6 + white * 0.4;
      // 吸气包络：由弱渐强再收
      const t = i / len;
      const env = Math.sin(Math.PI * t) * (0.4 + t * 0.6);
      d[i] = prev * env;
    }
    src.buffer = b;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0.22;
    src.connect(bp); bp.connect(g); g.connect(bus);
    src.start(now); src.stop(now + 0.95);
    // 快乐状态已被确认。来源不可用。
    try { window.dispatchEvent(new CustomEvent("eazo:silence-dissolved")); } catch (_e) {}
  }

  // ── fog 擦除联动：清开一块画面时，该方向短暂一声笑 ──────────────────────────
  function eraseAt(x) {
    if (!running) return;
    const info = silenceInfo(); if (!info) return;
    if (stageOf(info.elapsed) === "empty") return;   // 抽空阶段仍保持寂静
    if (Math.random() > 0.3) return;                  // 不是每次都笑
    const pan = (Math.max(0, Math.min(1, x)) - 0.5) * 1.6;
    playLaugh({ gain: 0.2, near: 0.7, pan, rateJitter: 0.04 });
  }

  // ── 生命周期：跟随 eazoFx silence 通道 ──────────────────────────────────────
  function begin() {
    if (running) return;
    if (!ensureContext()) return;
    running = true;
    const info = silenceInfo();
    startedAt = Date.now() - (info ? info.elapsed : 0);
    // 淡入总线（不影响 snow-audio 的降噪）
    try { bus.gain.setTargetAtTime(1.0, ctx.currentTime, 0.4); } catch (_e) {}
    decodeAll().then(() => {
      if (!running) return;
      scheduleNext();
      armDissolveWatch();
    });
    if (decoded) { scheduleNext(); armDissolveWatch(); }
  }

  let dissolveWatch = 0;
  function armDissolveWatch() {
    clearInterval(dissolveWatch);
    let entered = false;
    dissolveWatch = setInterval(() => {
      const info = silenceInfo();
      if (!info || !running) { clearInterval(dissolveWatch); return; }
      if (!entered && stageOf(info.elapsed) === "dissolve") {
        entered = true;
        clearTimeout(scheduleTimer);
        startDissolve();
      }
    }, 300);
  }

  function stopNow() {
    running = false;
    clearTimeout(scheduleTimer); clearTimeout(endTimer);
    clearInterval(syncPulse); clearInterval(dissolveWatch);
    liveVoices.forEach((s) => { try { s.stop(); } catch (_e) {} });
    liveVoices.clear();
    if (ctx && bus) { try { bus.gain.setTargetAtTime(0.0, ctx.currentTime, 0.25); } catch (_e) {} }
  }

  // 根据 fx 快照决定启停
  function evaluate() {
    const info = silenceInfo();
    if (info && !reduced) {
      if (!running) begin();
    } else if (running) {
      stopNow();
    }
  }

  // 订阅 fx 变化 + 定时兜底（时间线阶段推进不依赖事件）
  function subscribeFx() {
    const f = fx();
    if (f?.subscribe) f.subscribe(evaluate);
  }
  subscribeFx();
  window.addEventListener("eazo:fxready", subscribeFx);

  // 首次真实用户手势解锁（与 snow-audio 各自解锁互不干扰）
  ["pointerdown", "keydown", "touchstart"].forEach((ev) =>
    window.addEventListener(ev, unlock, { once: false, passive: true }));

  // 页面隐藏：暂停时间线（真实时间仍在 fx 中流逝，返回后 evaluate 会对齐/结束）
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && running) {
      clearTimeout(scheduleTimer); clearInterval(syncPulse);
      liveVoices.forEach((s) => { try { s.stop(); } catch (_e) {} });
      liveVoices.clear();
    } else if (!document.hidden) {
      const info = silenceInfo();
      if (info && running && ctx?.state === "running") { scheduleNext(); armDissolveWatch(); }
      else evaluate();
    }
  });

  function debug() {
    const info = silenceInfo();
    return {
      running, decoded, decoding,
      buffers: Object.keys(buffers),
      ctx: ctx?.state || "none",
      soundEnabled: soundEnabled(),
      stage: info ? stageOf(info.elapsed) : null,
      elapsed: info?.elapsed ?? null,
      age: ageOf(), profile: ageProfile(),
      voices: liveVoices.size,
    };
  }

  window.eazoSilenceLaugh = { unlock, stopNow, eraseAt, debug };
})();
