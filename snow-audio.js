/* S–03 · 没有规则的雪仗 — 空间音效系统 / SPATIAL SNOW AUDIO
 * -----------------------------------------------------------------------------
 * 无光雪原的近距离身体感：踩雪、揉雪、投掷、飞行、落地、远处环境。
 * 安静、寒冷、空旷。没有背景音乐，没有明显循环点，没有卡通/射击音效。
 *
 * 全程 Web Audio API 程序化生成，无网络音频文件。仅在首次真实用户交互后启动。
 * 通过 window.eazoSnowAudio 暴露给 snow.js 调用。Safari 兼容 webkitAudioContext。
 *
 *   window.eazoSnowAudio = {
 *     unlock(),                                  // 首次用户操作时调用
 *     setEnabled(bool), isEnabled(), toggle(),   // 声音开关
 *     openingSteps(), stopOpening(),             // 进入雪原：由远及近的脚步
 *     distantStep({gain,pan}),                   // 回合之间的远处脚步
 *     knead({speed}), kneadStop(),               // 揉雪（拖动）
 *     throwBall({power,x,size}),                 // 投掷
 *     land({power,x,size,surface}),              // 落地/破裂（surface: soft|hard|ball|npc）
 *     startAmbience(), stopAmbience(),
 *     setWillingness(real),                      // NPC 真实意愿 0..1
 *     suspend(), resumeIfOpen(), dispose()
 *   }
 */
(() => {
  "use strict";

  let audioContext = null;
  let masterGain = null;
  let audioUnlocked = false;
  let enabled = true;              // 显示为开启，但需首次交互后才真正发声
  let opened = false;              // 游戏是否处于打开状态
  let willingness = 1;             // NPC 真实意愿 0..1（由 snow.js 推送）

  // ── 音频总线 ──────────────────────────────────────────────────────────────
  const buses = {};

  // ── 复用的噪声缓冲池（避免每次都创建长 Buffer）────────────────────────────
  let noisePool = [];             // 若干个不同"种子"的短噪声，循环复用
  const POOL_SIZE = 8;
  let poolIdx = 0;

  // 同时播放的短音效上限
  let activeVoices = 0;
  const MAX_VOICES = 12;

  // 节流与计时器
  let kneadTimer = 0;             // 揉雪连续声（每秒最多 8 次）
  let lastKneadAt = 0;
  let openingTimers = [];
  let ambienceNodes = null;
  let betweenTimer = 0;

  const isMobile = window.matchMedia?.("(max-width: 720px), (pointer: coarse)")?.matches || false;

  // ── 程序化连续噪声缓冲（略微低通的白噪声，避免刺耳）─────────────────────────
  function createNoiseBuffer(duration = 0.35) {
    const sampleRate = audioContext.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.72 + white * 0.28;   // 让噪声稍微连续
      const envelope = Math.pow(1 - i / length, 2);
      data[i] = previous * envelope;
    }
    return buffer;
  }
  // 一段稍长、无包络的连续噪声，用于环境层与揉雪层（可循环）
  function createLoopNoise(duration = 2.2) {
    const sampleRate = audioContext.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.85 + white * 0.15;
      data[i] = previous;
    }
    return buffer;
  }

  function buildPool() {
    noisePool = [];
    for (let i = 0; i < POOL_SIZE; i++) noisePool.push(createNoiseBuffer(0.22 + Math.random() * 0.2));
  }
  function nextNoise() {
    if (!noisePool.length) buildPool();
    poolIdx = (poolIdx + 1) % noisePool.length;
    // 连续两次不同种子
    return noisePool[poolIdx];
  }

  // ── 初始化 ────────────────────────────────────────────────────────────────
  async function unlock() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioContext = new AudioContextClass();
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.55;
      masterGain.connect(audioContext.destination);
      // 总线
      buses.master = masterGain;
      buses.ambience = audioContext.createGain();
      buses.player = audioContext.createGain();
      buses.npc = audioContext.createGain();
      buses.interface = audioContext.createGain();
      buses.ambience.gain.value = 0.12;
      buses.player.gain.value = 0.65;
      buses.npc.gain.value = 0.32;
      buses.interface.gain.value = 0.18;
      buses.ambience.connect(masterGain);
      buses.player.connect(masterGain);
      buses.npc.connect(masterGain);
      buses.interface.connect(masterGain);
      buildPool();
    }
    if (audioContext.state === "suspended") {
      try { await audioContext.resume(); } catch (_e) {}
    }
    // iOS/Safari: 必须在用户手势内同步 start 一个节点才能彻底解锁音频。
    try {
      const b = audioContext.createBuffer(1, 1, audioContext.sampleRate);
      const s = audioContext.createBufferSource();
      s.buffer = b; s.connect(masterGain); s.start(0);
    } catch (_e) {}
    audioUnlocked = audioContext.state === "running";
    // 打开且解锁后，启动环境层
    if (audioUnlocked && enabled && opened) { startAmbience(); scheduleBetweenSteps(); }
  }

  function ready() {
    if (!enabled || !audioContext) return false;
    if (audioContext.state === "running") { audioUnlocked = true; return true; }
    return false;
  }
  // 供控制台自查：window.eazoSnowAudio.debug()
  function debug() {
    return {
      hasContext: !!audioContext,
      state: audioContext?.state || "none",
      unlocked: audioUnlocked,
      enabled, opened, willingness,
      masterGain: masterGain?.gain.value,
      ambience: !!ambienceNodes,
      voices: activeVoices,
      silence: !!window.eazoFx?.silenceActive?.()
    };
  }

  // 立体声挂载（兼容缺失 StereoPanner 的 Safari）
  function pannerConnect(lastNode, pan, bus) {
    if (pan !== 0 && audioContext.createStereoPanner) {
      const p = audioContext.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      lastNode.connect(p); p.connect(bus);
    } else {
      lastNode.connect(bus);
    }
  }

  function trackVoice(node, endAt) {
    activeVoices++;
    node.onended = () => { activeVoices = Math.max(0, activeVoices - 1); };
    // 兜底：万一 onended 不触发
    const ms = Math.max(0, (endAt - audioContext.currentTime) * 1000) + 200;
    setTimeout(() => { if (node.onended) { /* handled */ } }, ms);
  }

  // ── 踩雪：三层（高频雪粒摩擦 + 中频雪层 + 极轻低频压雪）────────────────────
  function playSnowStep({ intensity = 0.5, pan = 0 } = {}) {
    if (!ready() || activeVoices >= MAX_VOICES) return;
    const now = audioContext.currentTime;
    const source = audioContext.createBufferSource();
    source.buffer = nextNoise();
    source.playbackRate.value = 0.94 + Math.random() * 0.12;   // ±8% 音高附近

    const highpass = audioContext.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 450 + Math.random() * 350;
    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 2800 + Math.random() * 1600;

    const gain = audioContext.createGain();
    const jitter = 0.85 + Math.random() * 0.3;                 // ±15% 音量
    const peak = (0.05 + intensity * 0.09) * jitter;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    source.connect(highpass); highpass.connect(lowpass); lowpass.connect(gain);
    pannerConnect(gain, pan, buses.player);
    const end = now + 0.3;
    source.start(now); source.stop(end);
    trackVoice(source, end);

    // 极轻低频压雪层（表现身体重量，音量非常低）
    playSnowCompression(intensity);
  }

  function playSnowCompression(intensity = 0.5) {
    if (!ready()) return;
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(105, now);
    oscillator.frequency.exponentialRampToValueAtTime(58, now + 0.09);
    gain.gain.setValueAtTime(0.018 * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.connect(gain); gain.connect(buses.player);
    oscillator.start(now); oscillator.stop(now + 0.13);
  }

  // ── 进入雪原：远处 3–5 步，由远及近，然后停止 ─────────────────────────────
  function openingSteps() {
    stopOpening();
    if (!ready()) return;
    // 意愿越低，脚步越少越远（低意愿几乎没有观察者）
    const full = [
      { delay: 350,  gain: 0.18, pan: -0.35 },
      { delay: 920,  gain: 0.24, pan: 0.25 },
      { delay: 1510, gain: 0.32, pan: -0.16 },
      { delay: 2180, gain: 0.42, pan: 0.12 }
    ];
    let steps = full;
    if (willingness < 0.4) steps = full.slice(0, 2).map(s => ({ ...s, gain: s.gain * 0.5 }));
    else if (willingness < 0.7) steps = full.slice(0, 3);
    for (const s of steps) {
      const id = setTimeout(() => {
        // 意愿越低高频越少（脚步更闷、更远）
        playSnowStep({ intensity: s.gain * (0.6 + willingness * 0.6), pan: s.pan });
      }, s.delay);
      openingTimers.push(id);
    }
  }
  function stopOpening() { openingTimers.forEach(clearTimeout); openingTimers = []; }

  // ── 回合之间：偶尔一两步远处脚步（意愿高时）────────────────────────────────
  function distantStep({ gain = 0.22, pan = 0 } = {}) {
    if (!ready()) return;
    if (willingness < 0.3) return;                    // 意愿低：脚步彻底消失
    // 意愿越低高频越少、越远
    const hp = willingness > 0.6 ? 1 : 0.65;
    playSnowStep({ intensity: gain * hp, pan });
  }

  // ── 揉雪：连续但不规则的雪粒摩擦（每秒最多 8 次）───────────────────────────
  function knead({ speed = 0 } = {}) {
    if (!ready()) return;
    const now = performance.now();
    if (now - lastKneadAt < 125) return;              // 限制 8 次/秒
    lastKneadAt = now;
    kneadGrain(speed);
  }
  function kneadGrain(speed) {
    if (!ready() || activeVoices >= MAX_VOICES) return;
    const now = audioContext.currentTime;
    const fast = Math.min(1, speed);                  // 归一化速度 0..1
    const source = audioContext.createBufferSource();
    source.buffer = nextNoise();
    source.playbackRate.value = 0.9 + fast * 0.4 + Math.random() * 0.08;

    const hp = audioContext.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 500 + fast * 700 + Math.random() * 200;   // 越快频率越高
    const lp = audioContext.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400 + fast * 1800;

    const gain = audioContext.createGain();
    const peak = 0.02 + fast * 0.055;                 // 轻微移动只有细小雪粒声
    const dur = 0.09 + Math.random() * 0.08;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    source.connect(hp); hp.connect(lp); lp.connect(gain);
    pannerConnect(gain, (Math.random() - 0.5) * 0.3, buses.player);
    const end = now + dur + 0.05;
    source.start(now); source.stop(end);
    trackVoice(source, end);

    // 快速拖动时加入明显压雪声
    if (fast > 0.55 && Math.random() < 0.4) playSnowCompression(0.4 + fast * 0.4);
  }
  function kneadStop() { lastKneadAt = 0; }

  // ── 投掷：短促空气掠过声 ───────────────────────────────────────────────────
  function throwBall({ power = 0.5, x = 0.5, size = 0.4 } = {}) {
    if (!ready() || activeVoices >= MAX_VOICES) return;
    const now = audioContext.currentTime;
    const source = audioContext.createBufferSource();
    source.buffer = createNoiseBuffer(0.18 + power * 0.2);
    // 大雪球更低更厚，小雪球更快更高频
    source.playbackRate.value = 1.1 - size * 0.35;

    const filter = audioContext.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 700 + (1 - power) * 1200 - size * 300;
    filter.Q.value = 0.7;

    const gain = audioContext.createGain();
    const peak = 0.04 + power * 0.08;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2 + power * 0.16);

    source.connect(filter); filter.connect(gain);
    pannerConnect(gain, (x - 0.5) * 1.6, buses.player);       // 跟随水平位置
    const end = now + 0.4 + power * 0.2;
    source.start(now); source.stop(end);
    trackVoice(source, end);
  }

  // ── 落地与破裂：低频扑 + 中频压雪 + 高频散开 ──────────────────────────────
  function land({ power = 0.5, x = 0.5, size = 0.4, surface = "soft" } = {}) {
    if (!ready()) return;
    const now = audioContext.currentTime;
    const pan = (x - 0.5) * 1.6;

    // 表面参数
    let hpF = 300, lpF = 2600, thumpF = 70, dur = 0.22, atk = 0.012, thumpGain = 0.05;
    if (surface === "hard") { hpF = 700; lpF = 3600; dur = 0.14; thumpF = 95; thumpGain = 0.03; }   // 短促、干燥、稍高频
    else if (surface === "ball") { lpF = 3000; dur = 0.18; }        // 会额外加碎裂声
    else if (surface === "npc") { thumpGain = 0.015; dur = 0.16; }  // 擦过 NPC：很轻，不是人体被击中
    // 大雪球更低沉，小雪球更尖锐
    thumpF *= (1 - size * 0.35);
    lpF *= (0.85 + (1 - size) * 0.4);

    // 低频扑
    if (activeVoices < MAX_VOICES) {
      const osc = audioContext.createOscillator();
      const g = audioContext.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(thumpF, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(28, thumpF * 0.5), now + 0.1);
      const tg = thumpGain * (0.5 + power * 0.7) * (0.7 + size * 0.6);
      g.gain.setValueAtTime(tg, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
      osc.connect(g);
      pannerConnect(g, pan, surface === "npc" ? buses.npc : buses.player);
      osc.start(now); osc.stop(now + 0.14);
    }

    // 中频压雪 + 高频散开
    if (activeVoices < MAX_VOICES) {
      const source = audioContext.createBufferSource();
      source.buffer = nextNoise();
      source.playbackRate.value = 0.9 + Math.random() * 0.2;
      const hp = audioContext.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = hpF;
      const lp = audioContext.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = lpF;
      const g = audioContext.createGain();
      const peak = (0.035 + power * 0.06) * (surface === "npc" ? 0.4 : 1);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      source.connect(hp); hp.connect(lp); lp.connect(g);
      pannerConnect(g, pan, surface === "npc" ? buses.npc : buses.player);
      const end = now + dur + 0.05;
      source.start(now); source.stop(end);
      trackVoice(source, end);
    }

    // 撞到另一个雪球：极短碎裂声
    if (surface === "ball" && activeVoices < MAX_VOICES) {
      const source = audioContext.createBufferSource();
      source.buffer = nextNoise();
      source.playbackRate.value = 1.3;
      const bp = audioContext.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 3200; bp.Q.value = 1.2;
      const g = audioContext.createGain();
      g.gain.setValueAtTime(0.03, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      source.connect(bp); bp.connect(g);
      pannerConnect(g, pan, buses.player);
      source.start(now + 0.005); source.stop(now + 0.1);
    }
  }

  // ── 环境层：低频风 + 极远处雪粒（两层不同长度缓慢交叉，无明显循环点）───────
  function startAmbience() {
    if (!ready() || ambienceNodes) return;
    if (window.eazoFx?.silenceActive?.()) return;    // 罐装寂静：不启动环境
    const now = audioContext.currentTime;

    // 层 A：低频风
    const windSrc = audioContext.createBufferSource();
    windSrc.buffer = createLoopNoise(3.7);
    windSrc.loop = true;
    const windLp = audioContext.createBiquadFilter(); windLp.type = "lowpass"; windLp.frequency.value = 220;
    const windGain = audioContext.createGain(); windGain.gain.value = 0.0;
    windSrc.connect(windLp); windLp.connect(windGain); windGain.connect(buses.ambience);

    // 层 B：极远处雪粒移动（不同长度，避免同步循环点）
    const grainSrc = audioContext.createBufferSource();
    grainSrc.buffer = createLoopNoise(5.3);
    grainSrc.loop = true;
    const grainHp = audioContext.createBiquadFilter(); grainHp.type = "highpass"; grainHp.frequency.value = 1200;
    const grainLp = audioContext.createBiquadFilter(); grainLp.type = "lowpass"; grainLp.frequency.value = 4200;
    const grainGain = audioContext.createGain(); grainGain.gain.value = 0.0;
    grainSrc.connect(grainHp); grainHp.connect(grainLp); grainLp.connect(grainGain); grainGain.connect(buses.ambience);

    windSrc.start(now); grainSrc.start(now);
    // 缓慢淡入
    windGain.gain.setTargetAtTime(0.5, now, 2.0);
    grainGain.gain.setTargetAtTime(0.12, now, 3.0);

    // 缓慢交叉调制（LFO 改变两层增益，制造无循环感）
    const lfoTimer = setInterval(() => {
      if (!audioContext) return;
      const t = audioContext.currentTime;
      windGain.gain.setTargetAtTime(0.3 + Math.random() * 0.35, t, 3.5);
      grainGain.gain.setTargetAtTime(0.05 + Math.random() * 0.14, t, 4.0);
    }, 4200);

    ambienceNodes = { windSrc, grainSrc, windGain, grainGain, lfoTimer };
  }
  function stopAmbience() {
    if (!ambienceNodes) return;
    const { windSrc, grainSrc, lfoTimer } = ambienceNodes;
    clearInterval(lfoTimer);
    try { windSrc.stop(); } catch (_e) {}
    try { grainSrc.stop(); } catch (_e) {}
    ambienceNodes = null;
  }

  // ── NPC 意愿联动 ──────────────────────────────────────────────────────────
  function setWillingness(real) {
    willingness = Math.max(0, Math.min(1, real ?? 1));
    if (!ready()) return;
    const t = audioContext.currentTime;
    // 意愿低 → 环境更平更远、NPC 相关声（远处脚步）减弱；玩家操作声保留
    if (buses.npc) buses.npc.gain.setTargetAtTime(0.12 + willingness * 0.24, t, 1.0);
    if (buses.ambience) buses.ambience.gain.setTargetAtTime(0.08 + willingness * 0.06, t, 1.5);
    // 意愿越低，回合之间的远处脚步越稀疏
    scheduleBetweenSteps();
  }
  function scheduleBetweenSteps() {
    clearTimeout(betweenTimer);
    if (!ready() || !opened || willingness < 0.3) return;
    const base = 9000 + (1 - willingness) * 20000;   // 意愿越低间隔越长
    betweenTimer = setTimeout(() => {
      if (Math.random() < 0.3 + willingness * 0.4) distantStep({ gain: 0.16 + willingness * 0.14, pan: (Math.random() - 0.5) * 0.7 });
      scheduleBetweenSteps();
    }, base + Math.random() * base * 0.5);
  }

  // ── 罐装寂静联动 ──────────────────────────────────────────────────────────
  function applyCannedSilence() {
    if (!audioContext) return;
    const active = !!window.eazoFx?.silenceActive?.();
    const t = audioContext.currentTime;
    if (active) {
      // 停止环境风声、远处脚步、非必要提示；保留投掷/碰撞的极弱触觉反馈
      stopAmbience();
      clearTimeout(betweenTimer);
      buses.ambience?.gain.setTargetAtTime(0.0, t, 0.4);
      buses.npc?.gain.setTargetAtTime(0.0, t, 0.4);
      buses.player?.gain.setTargetAtTime(0.22, t, 0.4);   // 降低而非销毁
    } else {
      buses.ambience?.gain.setTargetAtTime(0.08 + willingness * 0.06, t, 0.8);
      buses.npc?.gain.setTargetAtTime(0.12 + willingness * 0.24, t, 0.8);
      buses.player?.gain.setTargetAtTime(0.65, t, 0.8);
      if (opened) startAmbience();
      scheduleBetweenSteps();
    }
  }
  window.eazoFx?.subscribe?.(applyCannedSilence);
  window.addEventListener("eazo:fxready", () => window.eazoFx?.subscribe?.(applyCannedSilence));

  // ── 开关 ──────────────────────────────────────────────────────────────────
  function setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem("eazo.snow.sound", enabled ? "1" : "0"); } catch (_e) {}
    if (!enabled) {
      // 立即停止，不留残留循环
      stopAmbience();
      stopOpening();
      clearTimeout(betweenTimer);
      if (masterGain) masterGain.gain.setTargetAtTime(0.0, audioContext.currentTime, 0.05);
    } else if (audioContext) {
      masterGain.gain.setTargetAtTime(0.55, audioContext.currentTime, 0.1);
      if (ready() && opened) { startAmbience(); scheduleBetweenSteps(); }
    }
    return enabled;
  }
  function isEnabled() { return enabled; }
  function toggle() { return setEnabled(!enabled); }

  // ── 打开/关闭/生命周期 ────────────────────────────────────────────────────
  function markOpen(v) {
    opened = !!v;
    if (opened) {
      if (ready()) { startAmbience(); scheduleBetweenSteps(); applyCannedSilence(); }
    } else {
      stopAmbience(); stopOpening(); clearTimeout(betweenTimer); kneadStop();
    }
  }
  function suspend() {
    stopAmbience(); stopOpening(); clearTimeout(betweenTimer);
    if (audioContext && audioContext.state === "running") { try { audioContext.suspend(); } catch (_e) {} }
  }
  async function resumeIfOpen() {
    if (!audioContext || !opened || !enabled) return;
    // 页面从后台返回：若 suspended，等待下一次用户操作再恢复（不自动补播）
    if (audioContext.state === "suspended") return;
    audioUnlocked = audioContext.state === "running";
    if (ready()) { startAmbience(); scheduleBetweenSteps(); }
  }
  function dispose() { markOpen(false); }

  // 恢复用户开关偏好（默认开启）
  try { const v = localStorage.getItem("eazo.snow.sound"); if (v === "0") enabled = false; } catch (_e) {}

  // 页面可见性：隐藏时暂停非必要环境；返回后不补播
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { stopAmbience(); stopOpening(); clearTimeout(betweenTimer); }
    else resumeIfOpen();
  });

  window.eazoSnowAudio = {
    unlock,
    setEnabled, isEnabled, toggle,
    openingSteps, stopOpening,
    distantStep,
    knead, kneadStop,
    throwBall, land,
    startAmbience, stopAmbience,
    setWillingness,
    markOpen, suspend, resumeIfOpen, dispose,
    debug,
    get unlocked() { return audioUnlocked; }
  };
})();
