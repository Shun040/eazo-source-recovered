/* BGM · 静默星图背景音乐系统（单曲版）
 * -----------------------------------------------------------------------------
 * 全程只用一首无缝循环：music-starmap-full（2:36，48k 立体声 → 96k mp3）。
 * 不随场所切换曲目，进入任何界面都是同一首背景音乐。
 *
 * 音量总开关沿用 window.eazoSnowAudio（同一"声音：开启/关闭"按钮 + localStorage）。
 *
 * 罐装寂静（eazoFx silence 通道激活）期间：
 *   背景音乐【暂停】（保留播放进度），把声场完全让给 silence-laugh 的笑声证据；
 *   silence 结束后【从暂停处继续】播放，而不是从头开始。
 *
 * 公开 API (window.eazoMusic):
 *   unlock(), setEnabled(bool), isEnabled(), refresh(), debug()
 */
(() => {
  "use strict";

  const TRACK_URL = "./media/audio/music-starmap-full.mp3";

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches || false;
  const isMobile = window.matchMedia?.("(max-width: 720px), (pointer: coarse)")?.matches || false;

  const TARGET_VOL = 1.0;   // 背景音乐目标音量（满音量）
  const DUCK_VOL = 0.16;    // 进入含音效的小游戏时压低到此音量，避免盖住游戏音效
  const FADE_MS = 900;

  // 这些游戏有自己的实时音效，背景音乐需让位（压低而非静音）
  const DUCK_MODES = ["pinball-mode", "snow-mode"];
  function gameActive() {
    const shell = document.querySelector(".app-shell");
    if (!shell) return false;
    return DUCK_MODES.some((c) => shell.classList.contains(c));
  }

  let el = null;             // 单个 HTMLAudioElement（循环）
  let fadeRAF = 0;
  let unlocked = false;
  let silenceDucking = false;

  const MUSIC_KEY = "eazo.music.on";   // 背景音乐专属开关（独立于笑声/音效开关）
  let musicOn = true;
  try { if (localStorage.getItem(MUSIC_KEY) === "0") musicOn = false; } catch (_e) {}

  function soundEnabled() { return musicOn; }

  function fx() { return window.eazoFx || null; }
  function silenceActive() {
    const f = fx(); if (!f) return false;
    if (typeof f.has === "function") return !!f.has("silence");
    if (typeof f.snapshot === "function") return (f.snapshot().effects || []).some((e) => e.id === "silence");
    return false;
  }

  function ensureEl() {
    if (el) return el;
    el = new Audio();
    el.src = TRACK_URL;
    el.loop = true;
    el.preload = "none";
    el.volume = 0;
    return el;
  }

  function fadeTo(target, ms, onDone) {
    ensureEl();
    cancelAnimationFrame(fadeRAF);
    const from = el.volume;
    const to = Math.max(0, Math.min(1, target));
    if (Math.abs(from - to) < 0.001) { el.volume = to; if (onDone) onDone(); return; }
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / Math.max(1, ms));
      try { el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); } catch (_e) {}
      if (k < 1) fadeRAF = requestAnimationFrame(step);
      else if (onDone) onDone();
    };
    fadeRAF = requestAnimationFrame(step);
  }

  // 应用音乐状态：尊重开关；罐装寂静期间暂停并保留进度，结束后从原处继续
  function apply() {
    ensureEl();
    const enabled = soundEnabled() && !reduced;
    const ducking = silenceActive();
    silenceDucking = ducking;

    if (!enabled) {
      // 关闭声音：淡出并暂停（保留进度）
      fadeTo(0, 250, () => { try { el.pause(); } catch (_e) {} });
      return;
    }

    if (ducking) {
      // 罐装寂静：淡出后暂停（不重置 currentTime），把声场让给笑声
      fadeTo(0, 500, () => { try { el.pause(); } catch (_e) {} });
      return;
    }

    if (!unlocked) return;   // 尚未获得用户手势，暂不 play()

    // 正常播放：从当前 currentTime 继续（暂停处恢复），淡入。
    // 若正处在带音效的小游戏中，压低音量给游戏音效让路。
    if (el.paused) { const pr = el.play(); if (pr && pr.catch) pr.catch(() => {}); }
    fadeTo(gameActive() ? DUCK_VOL : TARGET_VOL, FADE_MS);
  }

  // ── 解锁（首个用户手势内）──────────────────────────────────────────────────
  function unlock() {
    if (unlocked) { apply(); return; }
    unlocked = true;
    apply();
  }

  // ── fx silence 通道订阅（笑声覆盖背景音乐）──────────────────────────────────
  function subscribeFx() {
    const f = fx();
    if (f?.subscribe) f.subscribe(apply);
  }

  function setEnabled(on) {
    musicOn = !!on;
    try { localStorage.setItem(MUSIC_KEY, musicOn ? "1" : "0"); } catch (_e) {}
    window.__musicLastEnabled = musicOn;
    if (musicOn) unlock();   // 开启时确保已解锁并播放
    else apply();
    return musicOn;
  }
  function isEnabled() { return musicOn; }
  function toggle() { return setEnabled(!musicOn); }

  // ── 生命周期钩子 ────────────────────────────────────────────────────────────
  ["pointerdown", "keydown", "touchstart"].forEach((ev) =>
    window.addEventListener(ev, unlock, { passive: true }));

  window.addEventListener("eazo:fxready", subscribeFx);

  // 页面可见性：隐藏时暂停（保留进度），返回后从原处继续
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (el) { try { el.pause(); } catch (_e) {} } }
    else if (unlocked) apply();
  });

  // 轮询兜底：声音开关 / silence / 游戏音效场景变化（不依赖事件必达）
  setInterval(() => {
    if (!unlocked) return;
    const enabled = soundEnabled();
    const ducking = silenceActive();
    const gaming = gameActive();
    if (enabled !== window.__musicLastEnabled || ducking !== silenceDucking || gaming !== window.__musicLastGaming) {
      window.__musicLastEnabled = enabled;
      window.__musicLastGaming = gaming;
      apply();
    }
  }, 700);

  function syncToggleBtn() {
    const btn = document.getElementById("music-toggle");
    if (!btn) return;
    btn.setAttribute("aria-pressed", musicOn ? "true" : "false");
    btn.classList.toggle("is-off", !musicOn);
    const i18n = window.eazoI18n;
    const on = i18n?.t ? i18n.t("music.on") : "♪ 音乐：开";
    const off = i18n?.t ? i18n.t("music.off") : "♪ 音乐：关";
    btn.textContent = musicOn ? on : off;
    btn.setAttribute("data-i18n", musicOn ? "music.on" : "music.off");
  }

  function bindToggle() {
    const btn = document.getElementById("music-toggle");
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => { toggle(); syncToggleBtn(); });
    syncToggleBtn();
  }

  let shellObserver = null;
  function observeShell() {
    const shell = document.querySelector(".app-shell");
    if (!shell || shellObserver || typeof MutationObserver === "undefined") return;
    shellObserver = new MutationObserver(() => { if (unlocked) apply(); });
    shellObserver.observe(shell, { attributes: true, attributeFilter: ["class"] });
  }

  function init() {
    subscribeFx();
    bindToggle();
    observeShell();
    window.__musicLastEnabled = soundEnabled();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.addEventListener("eazo:localechange", syncToggleBtn);

  function debug() {
    return {
      unlocked, silenceDucking,
      enabled: soundEnabled(),
      paused: el ? el.paused : null,
      currentTime: el ? +el.currentTime.toFixed(2) : null,
      volume: el ? +el.volume.toFixed(2) : null,
    };
  }

  window.eazoMusic = { unlock, refresh: apply, setEnabled, isEnabled, toggle, debug };
})();
