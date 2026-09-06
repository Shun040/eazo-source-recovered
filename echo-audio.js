/* V–09 ECHO CALIBRATION — Web Audio rhythm voices. No audio files.
 * Two rhythmic voices: SIGNAL (low sine) and PLAYER (higher short tick).
 * As negotiation converges, the two tones drift toward each other in
 * frequency; a forced unification snaps them to identical pitch, then
 * cuts to silence. Volume is restrained. When canned silence is active,
 * playback is muted (visual-only). Oscillators are stopped on exit.
 *
 *   window.eazoEchoAudio = {
 *     unlock(), setEnabled(bool), isEnabled(), toggle(),
 *     markOpen(bool),
 *     signalTick({strength}), playerTick({strength,early}),
 *     setConvergence(0..1),           // 0 far apart .. 1 aligned
 *     forcedUnify(), silenceAll(),
 *     suspend(), resumeIfOpen(), dispose(), debug()
 *   }
 */
(() => {
  "use strict";

  let ac = null;
  let master = null;
  const bus = {};
  let unlocked = false;
  let enabled = true;
  let opened = false;
  let convergence = 0;      // 0..1, drives how close the two pitches are

  // base frequencies: signal low, player higher; converge toward a midpoint
  const SIGNAL_LOW = 174;   // Hz far
  const PLAYER_HIGH = 392;  // Hz far
  const MID = 262;          // convergence target (~C4)

  function signalFreq() { return SIGNAL_LOW + (MID - SIGNAL_LOW) * convergence; }
  function playerFreq() { return PLAYER_HIGH + (MID - PLAYER_HIGH) * convergence; }

  function silence() { return !!window.eazoFx?.silenceActive?.(); }

  async function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.4;
      master.connect(ac.destination);
      bus.signal = ac.createGain(); bus.signal.gain.value = 0.5; bus.signal.connect(master);
      bus.player = ac.createGain(); bus.player.gain.value = 0.55; bus.player.connect(master);
    }
    if (ac.state === "suspended") { try { await ac.resume(); } catch (_e) {} }
    try {
      const b = ac.createBuffer(1, 1, ac.sampleRate);
      const s = ac.createBufferSource(); s.buffer = b; s.connect(master); s.start(0);
    } catch (_e) {}
    unlocked = ac.state === "running";
  }

  function ready() {
    if (!enabled || !ac) return false;
    if (silence()) return false;         // canned silence: visual-only
    if (ac.state === "running") { unlocked = true; return true; }
    return false;
  }

  // ── SIGNAL voice: soft low sine pulse ──
  function signalTick({ strength = 0.6 } = {}) {
    if (!ready()) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(signalFreq(), now);
    const peak = 0.05 + strength * 0.06;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    osc.connect(g); g.connect(bus.signal);
    osc.start(now); osc.stop(now + 0.36);
  }

  // ── PLAYER voice: brighter, shorter tick ──
  function playerTick({ strength = 0.6, early = false } = {}) {
    if (!ready()) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = early ? "triangle" : "sine";   // early/steal-beat reads slightly harsher
    osc.frequency.setValueAtTime(playerFreq(), now);
    const peak = 0.045 + strength * 0.06;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(g); g.connect(bus.player);
    osc.start(now); osc.stop(now + 0.22);
  }

  function setConvergence(v) { convergence = Math.max(0, Math.min(1, v || 0)); }

  // ── Forced unification: both snap to the same pitch, one loud unison, then silence ──
  function forcedUnify() {
    if (!ready()) { silenceAll(); return; }
    const now = ac.currentTime;
    [bus.signal, bus.player].forEach((b, i) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(MID, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
      g.gain.setValueAtTime(0.12, now + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      osc.connect(g); g.connect(b);
      osc.start(now); osc.stop(now + 0.95);
    });
    // then cut to silence
    silenceAll(1.0);
  }

  function silenceAll(after = 0) {
    if (!ac) return;
    const t = ac.currentTime + Math.max(0, after);
    bus.signal?.gain.setTargetAtTime(0.0, t, 0.2);
    bus.player?.gain.setTargetAtTime(0.0, t, 0.2);
  }
  function restoreLevels() {
    if (!ac) return;
    const t = ac.currentTime;
    bus.signal?.gain.setTargetAtTime(0.5, t, 0.3);
    bus.player?.gain.setTargetAtTime(0.55, t, 0.3);
  }

  function setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem("eazo.echo.sound", enabled ? "1" : "0"); } catch (_e) {}
    if (!enabled) { if (master && ac) master.gain.setTargetAtTime(0.0, ac.currentTime, 0.05); }
    else if (ac) { master.gain.setTargetAtTime(0.4, ac.currentTime, 0.1); restoreLevels(); }
    return enabled;
  }
  function isEnabled() { return enabled; }
  function toggle() { return setEnabled(!enabled); }

  function markOpen(v) {
    opened = !!v;
    if (opened) { convergence = 0; if (ac && enabled) restoreLevels(); }
    else silenceAll();
  }
  function suspend() { if (ac && ac.state === "running") { try { ac.suspend(); } catch (_e) {} } }
  async function resumeIfOpen() {
    if (!ac || !opened || !enabled) return;
    if (ac.state === "suspended") return;   // wait for next gesture
    unlocked = ac.state === "running";
  }
  function dispose() { markOpen(false); }

  function debug() {
    return { hasContext: !!ac, state: ac?.state || "none", unlocked, enabled, opened, convergence, silence: silence() };
  }

  try { const v = localStorage.getItem("eazo.echo.sound"); if (v === "0") enabled = false; } catch (_e) {}

  document.addEventListener("visibilitychange", () => { if (document.hidden) suspend(); else resumeIfOpen(); });

  window.eazoEchoAudio = {
    unlock, setEnabled, isEnabled, toggle,
    markOpen, signalTick, playerTick, setConvergence,
    forcedUnify, silenceAll, suspend, resumeIfOpen, dispose, debug,
    get unlocked() { return unlocked; }
  };
})();
