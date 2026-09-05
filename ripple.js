/* EAZO — ALCOHOL RING-WAVE REFRACTION (WebGL layer)
 * A full-viewport WebGL canvas sampled from the live art canvas (#starfield
 * and, when open, the active game canvas). A fragment shader displaces the
 * sampled UV around each active ring-wave source, so the background, star
 * points and game canvas genuinely bend outward from the click position.
 *
 * The ring wave itself is NEVER drawn — no circles, discs, outlines or glow.
 * Only the sampled art is warped. DOM buttons and real hit areas stay put.
 *
 * Public API (window.eazoRipple):
 *   start()               begin the render loop + attach the overlay
 *   stop()                tear down loop, listeners, GL resources
 *   spawn(x, y, factor)   add a wave source (x,y in 0..1, y up); factor 0..1
 *   setStrength(a)        global 0..1 multiplier from the alcohol envelope
 */
(() => {
  "use strict";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = window.matchMedia("(max-width: 720px)").matches;
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

  // Fewer sources + lower resolution on mobile, but distortion is NOT removed.
  // Safari renders at most 4 simultaneous sources; other browsers up to 6.
  const MAX_WAVES = mobile ? 3 : (isSafari ? 4 : 6);
  const RES_SCALE = mobile ? 0.6 : 1.0;   // internal render scale

  const WAVE = {
    speed: 0.28,      // ring radius growth (uv / s)
    width: 0.045,     // ring thickness (gaussian sigma, uv)
    strength: 0.012,  // peak uv displacement
    lifetime: 3.5,    // seconds
    frequency: 95.0,  // ripple spatial frequency
  };

  let canvas = null, gl = null, program = null;
  let tex = null, quadBuf = null;
  let raf = 0, running = false;
  let dpr = 1, vw = 0, vh = 0;
  let globalStrength = 0;
  const waves = [];      // { x, y, startedAt }
  const loc = {};        // uniform locations

  // ── art source: topmost visible art canvas (game canvas or starfield) ──
  function sourceCanvas() {
    const ids = ["aurora-canvas", "pinball-canvas", "snow-field"];
    for (const id of ids) {
      const c = document.getElementById(id);
      if (c && c.width > 0 && c.offsetParent !== null) return c;
    }
    return document.getElementById("starfield");
  }

  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = vec2((aPos.x + 1.0) * 0.5, (aPos.y + 1.0) * 0.5);
      gl_Position = vec4(aPos, 0.0, 1.0);
    }`;

  // Up to MAX_WAVES ring sources packed into arrays.
  const FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform float uAspect;
    uniform float uStrength;
    uniform int   uCount;
    uniform vec2  uCenter[${MAX_WAVES}];
    uniform float uRadius[${MAX_WAVES}];
    uniform float uOpacity[${MAX_WAVES}];
    const float WIDTH = ${WAVE.width.toFixed(4)};
    const float FREQ  = ${WAVE.frequency.toFixed(1)};
    const float STR   = ${WAVE.strength.toFixed(4)};
    void main() {
      // texture is uploaded flipped so sample with flipped Y
      vec2 uv = vUv;
      for (int i = 0; i < ${MAX_WAVES}; i++) {
        if (i >= uCount) break;
        vec2 delta = uv - uCenter[i];
        delta.x *= uAspect;
        float dist = length(delta);
        float phase = dist - uRadius[i];
        float envelope = exp(-(phase * phase) / (2.0 * WIDTH * WIDTH));
        float ripple = sin(phase * FREQ) * envelope * STR * uOpacity[i] * uStrength;
        vec2 dir = normalize(delta + vec2(0.00001));
        dir.x /= uAspect;
        uv += dir * ripple;
      }
      gl_FragColor = texture2D(uTex, vec2(uv.x, 1.0 - uv.y));
    }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("[ripple] shader error:", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function initGL() {
    canvas = document.createElement("canvas");
    canvas.id = "fx-ripple";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;z-index:2;" +
      "pointer-events:none;opacity:0;transition:opacity .5s ease;";
    // Insert right after #starfield so it sits above the art, below the HUD.
    const shell = document.querySelector(".app-shell");
    (shell || document.body).appendChild(canvas);

    gl = canvas.getContext("webgl", { premultipliedAlpha: false, alpha: true })
      || canvas.getContext("experimental-webgl");
    if (!gl) { console.warn("[ripple] WebGL unavailable"); return false; }

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("[ripple] link error:", gl.getProgramInfoLog(program));
      return false;
    }
    gl.useProgram(program);

    quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    loc.uTex = gl.getUniformLocation(program, "uTex");
    loc.uAspect = gl.getUniformLocation(program, "uAspect");
    loc.uStrength = gl.getUniformLocation(program, "uStrength");
    loc.uCount = gl.getUniformLocation(program, "uCount");
    loc.uCenter = gl.getUniformLocation(program, "uCenter");
    loc.uRadius = gl.getUniformLocation(program, "uRadius");
    loc.uOpacity = gl.getUniformLocation(program, "uOpacity");
    return true;
  }

  function resize() {
    // Device pixel ratio capped at 1.5 (spec) then scaled per device.
    dpr = Math.min(1.5, window.devicePixelRatio || 1) * RES_SCALE;
    vw = window.innerWidth; vh = window.innerHeight;
    const w = Math.max(1, Math.round(vw * dpr));
    const h = Math.max(1, Math.round(vh * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  function frame() {
    if (!running) return;
    resize();
    const src = sourceCanvas();
    if (src && src.width > 0 && src.height > 0) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      } catch (_e) { /* source not yet ready */ }
    }

    const nowP = performance.now();
    // retire dead waves
    for (let i = waves.length - 1; i >= 0; i--) {
      if ((nowP - waves[i].startedAt) / 1000 >= WAVE.lifetime) waves.splice(i, 1);
    }

    const centers = new Float32Array(MAX_WAVES * 2);
    const radii = new Float32Array(MAX_WAVES);
    const opac = new Float32Array(MAX_WAVES);
    const n = Math.min(waves.length, MAX_WAVES);
    for (let i = 0; i < n; i++) {
      const age = (nowP - waves[i].startedAt) / 1000;
      centers[i * 2] = waves[i].x;
      centers[i * 2 + 1] = waves[i].y;
      radii[i] = age * WAVE.speed;
      const k = 1 - age / WAVE.lifetime;
      opac[i] = (k > 0 ? k * k : 0) * waves[i].factor;
    }

    gl.useProgram(program);
    gl.uniform1i(loc.uTex, 0);
    gl.uniform1f(loc.uAspect, vw / (vh || 1));
    gl.uniform1f(loc.uStrength, Math.max(0.0001, globalStrength));
    gl.uniform1i(loc.uCount, n);
    gl.uniform2fv(loc.uCenter, centers);
    gl.uniform1fv(loc.uRadius, radii);
    gl.uniform1fv(loc.uOpacity, opac);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    raf = requestAnimationFrame(frame);
  }

  // ── public API ──
  function start() {
    if (reduced || running) return;
    if (!gl && !initGL()) return;
    running = true;
    canvas.style.opacity = "1";
    // hide the raw art canvas so the warped copy is what the eye sees
    document.documentElement.classList.add("fx-ripple-on");
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    waves.length = 0;
    globalStrength = 0;
    document.documentElement.classList.remove("fx-ripple-on");
    if (canvas) canvas.style.opacity = "0";
  }
  function spawn(x, y, factor) {
    if (reduced) return;
    const w = { x, y, startedAt: performance.now(), factor: factor == null ? 1 : factor };
    if (waves.length >= MAX_WAVES) {
      let oldest = 0;
      for (let i = 1; i < waves.length; i++) {
        if (waves[i].startedAt < waves[oldest].startedAt) oldest = i;
      }
      waves[oldest] = w;
    } else {
      waves.push(w);
    }
  }
  function setStrength(a) { globalStrength = Math.max(0, Math.min(1, a || 0)); }

  window.eazoRipple = { start, stop, spawn, setStrength,
    get running() { return running; } };
})();
