import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* M–04 夜间超市 — 把商品作为货架上的真实 3D 物件呈现（而非商品预览弹窗）。
 *  - 支持多个 3D 商品：酒瓶 / 电子烟(VRU–18) / 能量饮料。
 *  - 每个商品在货架卡里内联一个缓慢自转的半透明模型（约 12 秒一圈，hover 提速）。
 *  - 点击后同一物体放大进入全屏「聚焦状态」：原页面暗化+景深模糊，非矩形弹窗。
 *  - 聚焦态可拖动 360° 旋转、滚轮/双指轻微缩放；空白/Esc 关闭。
 *  - 材质统一替换为忧郁雾感冷绿 ghost 材质 + 克制线框轮廓。
 *  - 每个模型只下载一次并共享；隐藏/离开视口/关闭时暂停渲染。
 *
 * 暴露：window.eazoMarketModel = {
 *   MODEL_ITEMS,              // Set of item ids that use 3D
 *   isModel(id),
 *   mountShelf(id, canvas),   // 货架卡内联模型
 *   unmountShelf(),           // 卸载全部货架模型
 *   openFocus(id, sourceEl),  // 从货架放大进入聚焦
 *   closeFocus(),
 *   isFocusOpen()
 * }
 */

const MODEL_URLS = {
  alcohol: './3d-model/alcohol.glb',
  cigarettes: './3d-model/vru-18.glb',
  energy: './3d-model/energy.glb',
  lottery: './3d-model/lottery.glb',
  silence: './3d-model/silence.glb'
};
const MODEL_ITEMS = new Set(Object.keys(MODEL_URLS));
function isModel(id) { return MODEL_ITEMS.has(id); }

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.matchMedia('(max-width: 720px), (pointer: coarse)').matches;
const PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 1.5);

// ── ghost 材质：忧郁、雾感、半透明冷绿 ────────────────────────────────────
function makeGhostMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#7fb8a5'),
    emissive: new THREE.Color('#173a31'),
    emissiveIntensity: 0.18,
    transparent: true,
    opacity: 0.48,
    roughness: 0.62,
    metalness: 0.05,
    transmission: 0.22,
    thickness: 0.8,
    ior: 1.18,
    clearcoat: 0.08,
    clearcoatRoughness: 0.75,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}
function stylizeModel(model) {
  model.traverse((object) => {
    if (!object.isMesh) return;
    if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose?.());
    else object.material?.dispose?.();
    object.material = makeGhostMaterial();
    object.castShadow = false;
    object.receiveShadow = false;
    object.renderOrder = 2;
  });
}
function addGhostOutline(model) {
  const outline = model.clone(true);
  outline.traverse((object) => {
    if (!object.isMesh) return;
    object.material = new THREE.MeshBasicMaterial({
      color: '#b4dfcf', transparent: true, opacity: 0.055,
      wireframe: true, depthWrite: false
    });
    object.renderOrder = 1;
  });
  outline.scale.multiplyScalar(1.006);
  return outline;
}
function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0x9bcdbb, 0x020806, 0.75));
  const key = new THREE.DirectionalLight(0xb3e1d1, 1.15); key.position.set(3, 4, 5); scene.add(key);
  const rim = new THREE.PointLight(0x497d70, 0.7, 10); rim.position.set(-3, 1, -2); scene.add(rim);
}
function fitModelToView(model, targetSize) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  const largest = Math.max(size.x, size.y, size.z) || 1;
  model.scale.setScalar(targetSize / largest);
}
// 构建一个包含模型+线框轮廓的 group（已归一化居中）
function buildStyledGroup(sceneClone, targetSize) {
  const model = sceneClone;
  stylizeModel(model);
  const wrapper = new THREE.Group();
  wrapper.add(model);
  const outline = addGhostOutline(model);
  fitModelToView(model, targetSize);
  outline.position.copy(model.position);
  outline.scale.copy(model.scale).multiplyScalar(1.006);
  wrapper.add(outline);
  return wrapper;
}

// ── 共享 GLTF：每个模型只下载一次 ─────────────────────────────────────────
const cache = {};       // id -> THREE.Scene
const loading = {};     // id -> Promise
async function loadModel(id) {
  if (cache[id]) return cache[id].clone(true);
  if (!loading[id]) {
    loading[id] = new GLTFLoader().loadAsync(MODEL_URLS[id]).then((gltf) => {
      cache[id] = gltf.scene || gltf.scenes?.[0];
      return cache[id];
    });
  }
  const scene = await loading[id];
  if (!scene) throw new Error('no scene');
  return scene.clone(true);
}

// =============================================================================
// 货架内联模型（每个 3D 商品一个 renderer）：缓慢自转，鼠标经过稍快
// =============================================================================
const SHELF_BASE = (Math.PI * 2) / 12;     // 每 12 秒一圈
const SHELF_HOVER = SHELF_BASE * 2.2;
const SHELF_TARGET = 1.9;

const shelves = [];   // 每个元素是一个 shelf 实例

function makeShelfInstance(id, canvas) {
  const inst = {
    id, canvas, renderer: null, scene: null, camera: null,
    wrapper: null, running: false, raf: 0, last: 0, lastW: 0, lastH: 0,
    speed: SHELF_BASE, targetSpeed: SHELF_BASE, io: null, hostEl: null,
    onEnter: null, onLeave: null
  };
  return inst;
}

async function mountShelf(id, canvas) {
  if (!isModel(id) || !canvas) return;
  const inst = makeShelfInstance(id, canvas);
  const fallback = canvas.parentElement?.querySelector('.market-model-fallback');
  try {
    inst.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !isMobile, powerPreference: 'high-performance' });
    inst.renderer.setClearColor(0x000000, 0);
    inst.renderer.setPixelRatio(PIXEL_RATIO);
    inst.renderer.outputColorSpace = THREE.SRGBColorSpace;
    inst.scene = new THREE.Scene();
    inst.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    inst.camera.position.set(0, 0.15, 4.4);
    inst.camera.lookAt(0, 0, 0);
    addLights(inst.scene);
    const model = await loadModel(id);
    inst.wrapper = buildStyledGroup(model, SHELF_TARGET);
    inst.scene.add(inst.wrapper);
    shelfResize(inst);
    inst.hostEl = canvas.closest('.market-item') || canvas.parentElement;
    if (inst.hostEl) {
      inst.onEnter = () => { inst.targetSpeed = SHELF_HOVER; };
      inst.onLeave = () => { inst.targetSpeed = SHELF_BASE; };
      inst.hostEl.addEventListener('pointerenter', inst.onEnter);
      inst.hostEl.addEventListener('pointerleave', inst.onLeave);
    }
    inst.io = new IntersectionObserver((entries) => {
      for (const e of entries) { if (e.isIntersecting) shelfStart(inst); else shelfStop(inst); }
    }, { threshold: 0.05 });
    inst.io.observe(canvas);
    shelves.push(inst);
    shelfStart(inst);
  } catch (err) {
    console.warn('[market-model] shelf load failed:', id, err);
    if (fallback) { fallback.hidden = false; fallback.setAttribute('aria-hidden', 'false'); }
  }
}
function shelfResize(inst) {
  if (!inst.canvas || !inst.renderer || !inst.camera) return;
  const r = inst.canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width || 1)), h = Math.max(1, Math.floor(r.height || 1));
  if (w === inst.lastW && h === inst.lastH) return;
  inst.lastW = w; inst.lastH = h;
  inst.renderer.setSize(w, h, false);
  inst.camera.aspect = w / h; inst.camera.updateProjectionMatrix();
}
function shelfFrame(inst, now) {
  if (!inst.running) return;
  if (now - inst.last >= 1000 / 30) {
    const dt = inst.last ? Math.min(0.1, (now - inst.last) / 1000) : 0.016;
    inst.last = now;
    shelfResize(inst);
    inst.speed += (inst.targetSpeed - inst.speed) * 0.06;
    if (inst.wrapper && !reduced) inst.wrapper.rotation.y += inst.speed * dt;
    if (inst.renderer && inst.scene && inst.camera) inst.renderer.render(inst.scene, inst.camera);
  }
  inst.raf = requestAnimationFrame((t) => shelfFrame(inst, t));
}
function shelfStart(inst) { if (inst.running || !inst.renderer) return; inst.running = true; inst.last = 0; inst.raf = requestAnimationFrame((t) => shelfFrame(inst, t)); }
function shelfStop(inst) { inst.running = false; if (inst.raf) { cancelAnimationFrame(inst.raf); inst.raf = 0; } }
function unmountShelf() {
  for (const inst of shelves) {
    shelfStop(inst);
    if (inst.io) inst.io.disconnect();
    if (inst.hostEl) {
      if (inst.onEnter) inst.hostEl.removeEventListener('pointerenter', inst.onEnter);
      if (inst.onLeave) inst.hostEl.removeEventListener('pointerleave', inst.onLeave);
    }
    inst.renderer?.dispose?.();
  }
  shelves.length = 0;
}

// =============================================================================
// 全屏聚焦状态：拖拽旋转 + 滚轮缩放（按需加载对应模型）
// =============================================================================
const FOCUS_TARGET = 2.0;
const focus = {
  layer: null, canvas: null, renderer: null, scene: null, camera: null,
  wrapper: null, running: false, raf: 0, open: false, sourceEl: null, id: null
};
const drag = { dragging: false, pointerId: null, prevX: 0, prevY: 0, velX: 0, velY: 0, zoom: 4.4 };

function initFocusRenderer() {
  if (focus.renderer) return;
  focus.canvas = document.getElementById('vru-focus-canvas');
  if (!focus.canvas) return;
  focus.renderer = new THREE.WebGLRenderer({ canvas: focus.canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  focus.renderer.setClearColor(0x000000, 0);
  focus.renderer.setPixelRatio(PIXEL_RATIO);
  focus.renderer.outputColorSpace = THREE.SRGBColorSpace;
  focus.scene = new THREE.Scene();
  focus.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  addLights(focus.scene);
  bindFocusPointer();
}
async function setFocusModel(id) {
  if (focus.wrapper) { focus.scene.remove(focus.wrapper); focus.wrapper = null; }
  const model = await loadModel(id);
  focus.wrapper = buildStyledGroup(model, FOCUS_TARGET);
  focus.scene.add(focus.wrapper);
  focus.id = id;
}
function focusResize() {
  if (!focus.canvas || !focus.renderer || !focus.camera) return;
  const r = focus.canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width || 1)), h = Math.max(1, Math.floor(r.height || 1));
  focus.renderer.setSize(w, h, false);
  focus.camera.aspect = w / h; focus.camera.updateProjectionMatrix();
}
function focusFrame() {
  if (!focus.running) return;
  if (!drag.dragging) {
    drag.velX *= 0.92; drag.velY *= 0.90;
    if (Math.abs(drag.velX) < 0.0002) drag.velX = reduced ? 0 : 0.0012;
  }
  if (focus.wrapper) {
    focus.wrapper.rotation.y += drag.velX;
    focus.wrapper.rotation.x = THREE.MathUtils.clamp(focus.wrapper.rotation.x + drag.velY, -0.45, 0.45);
  }
  if (focus.camera) focus.camera.position.z = drag.zoom;
  if (focus.renderer && focus.scene && focus.camera) focus.renderer.render(focus.scene, focus.camera);
  focus.raf = requestAnimationFrame(focusFrame);
}
function focusStart() { if (focus.running) return; focus.running = true; focus.raf = requestAnimationFrame(focusFrame); }
function focusStop() { focus.running = false; if (focus.raf) { cancelAnimationFrame(focus.raf); focus.raf = 0; } }

function onFocusDown(e) {
  drag.dragging = true; drag.pointerId = e.pointerId;
  drag.prevX = e.clientX; drag.prevY = e.clientY;
  focus.canvas.setPointerCapture?.(e.pointerId);
  e.stopPropagation();
}
function onFocusMove(e) {
  if (!drag.dragging || e.pointerId !== drag.pointerId) return;
  const dx = e.clientX - drag.prevX, dy = e.clientY - drag.prevY;
  drag.velX = dx * 0.006; drag.velY = dy * 0.004;
  drag.prevX = e.clientX; drag.prevY = e.clientY;
}
function onFocusUp(e) { if (e.pointerId !== drag.pointerId) return; drag.dragging = false; drag.pointerId = null; }
function onFocusWheel(e) { e.preventDefault(); drag.zoom = THREE.MathUtils.clamp(drag.zoom + e.deltaY * 0.002, 3.2, 6.2); }
let focusPointerBound = false;
function bindFocusPointer() {
  if (focusPointerBound || !focus.canvas) return;
  focus.canvas.addEventListener('pointerdown', onFocusDown);
  focus.canvas.addEventListener('pointermove', onFocusMove);
  focus.canvas.addEventListener('pointerup', onFocusUp);
  focus.canvas.addEventListener('pointercancel', onFocusUp);
  focus.canvas.addEventListener('wheel', onFocusWheel, { passive: false });
  focusPointerBound = true;
}

async function openFocus(id, sourceEl) {
  if (!isModel(id)) return false;
  focus.layer = document.getElementById('vru-focus');
  if (!focus.layer) return false;
  focus.sourceEl = sourceEl || document.querySelector(`.market-item[data-id="${id}"] .market-model-slot`);
  if (focus.sourceEl) {
    const rect = focus.sourceEl.getBoundingClientRect();
    focus.layer.style.setProperty('--source-x', `${rect.left + rect.width / 2}px`);
    focus.layer.style.setProperty('--source-y', `${rect.top + rect.height / 2}px`);
  }
  initFocusRenderer();
  await setFocusModel(id);
  drag.zoom = 4.4; drag.velX = 0; drag.velY = 0;
  if (focus.wrapper) focus.wrapper.rotation.set(0, 0, 0);
  focus.layer.classList.add('open');
  focus.layer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('model-focus-open');
  focus.open = true;
  requestAnimationFrame(() => { focusResize(); focusStart(); });
  return true;
}
function closeFocus() {
  if (!focus.open) return;
  focus.open = false;
  focusStop();
  if (focus.layer) {
    focus.layer.classList.remove('open');
    focus.layer.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.remove('model-focus-open');
  focus.sourceEl?.closest('.market-item')?.focus?.({ preventScroll: true });
}
function isFocusOpen() { return focus.open; }

function bindFocusLayer() {
  const layer = document.getElementById('vru-focus');
  if (!layer || layer.dataset.bound) return;
  layer.dataset.bound = '1';
  layer.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#vru-focus-canvas, .model-focus-actions, .model-focus-close, .model-focus-meta')) return;
    closeFocus();
  });
  layer.querySelector('.model-focus-close')?.addEventListener('click', (e) => { e.stopPropagation(); closeFocus(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && focus.open) closeFocus(); });
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { shelves.forEach(shelfStop); focusStop(); }
  else { shelves.forEach((i) => { if (i.renderer) shelfStart(i); }); if (focus.open) focusStart(); }
});

if (document.readyState !== 'loading') bindFocusLayer();
else document.addEventListener('DOMContentLoaded', bindFocusLayer);

window.eazoMarketModel = {
  MODEL_ITEMS, isModel,
  mountShelf, unmountShelf,
  openFocus, closeFocus, isFocusOpen,
  mountViewer, unmountViewer
};

// =============================================================================
// 内联可交互查看器：缓慢自转 + 拖拽 360° 旋转 + 滚轮缩放（用于彩票弹层等）
// =============================================================================
const viewer = {
  id: null, canvas: null, renderer: null, scene: null, camera: null,
  wrapper: null, running: false, raf: 0, lastW: 0, lastH: 0
};
const vdrag = { dragging: false, pointerId: null, prevX: 0, prevY: 0, velX: 0, velY: 0, zoom: 4.4 };
const VIEWER_TARGET = 1.7;

function vResize() {
  if (!viewer.canvas || !viewer.renderer || !viewer.camera) return;
  const r = viewer.canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width || 1)), h = Math.max(1, Math.floor(r.height || 1));
  if (w === viewer.lastW && h === viewer.lastH) return;
  viewer.lastW = w; viewer.lastH = h;
  viewer.renderer.setSize(w, h, false);
  viewer.camera.aspect = w / h; viewer.camera.updateProjectionMatrix();
}
function vFrame() {
  if (!viewer.running) return;
  vResize();
  if (!vdrag.dragging) {
    vdrag.velX *= 0.92; vdrag.velY *= 0.90;
    if (Math.abs(vdrag.velX) < 0.0002) vdrag.velX = reduced ? 0 : 0.0016;
  }
  if (viewer.wrapper) {
    viewer.wrapper.rotation.y += vdrag.velX;
    viewer.wrapper.rotation.x = THREE.MathUtils.clamp(viewer.wrapper.rotation.x + vdrag.velY, -0.45, 0.45);
  }
  if (viewer.camera) viewer.camera.position.z = vdrag.zoom;
  if (viewer.renderer && viewer.scene && viewer.camera) viewer.renderer.render(viewer.scene, viewer.camera);
  viewer.raf = requestAnimationFrame(vFrame);
}
function vDown(e) { vdrag.dragging = true; vdrag.pointerId = e.pointerId; vdrag.prevX = e.clientX; vdrag.prevY = e.clientY; viewer.canvas.setPointerCapture?.(e.pointerId); }
function vMove(e) { if (!vdrag.dragging || e.pointerId !== vdrag.pointerId) return; vdrag.velX = (e.clientX - vdrag.prevX) * 0.006; vdrag.velY = (e.clientY - vdrag.prevY) * 0.004; vdrag.prevX = e.clientX; vdrag.prevY = e.clientY; }
function vUp(e) { if (e.pointerId !== vdrag.pointerId) return; vdrag.dragging = false; vdrag.pointerId = null; }
function vWheel(e) { e.preventDefault(); vdrag.zoom = THREE.MathUtils.clamp(vdrag.zoom + e.deltaY * 0.002, 3.2, 6.2); }
let viewerBound = false;
async function mountViewer(id, canvas) {
  if (!isModel(id) || !canvas) return;
  unmountViewer();
  viewer.id = id; viewer.canvas = canvas;
  try {
    viewer.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    viewer.renderer.setClearColor(0x000000, 0);
    viewer.renderer.setPixelRatio(PIXEL_RATIO);
    viewer.renderer.outputColorSpace = THREE.SRGBColorSpace;
    viewer.scene = new THREE.Scene();
    viewer.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    viewer.camera.position.set(0, 0.15, 4.4);
    addLights(viewer.scene);
    const model = await loadModel(id);
    viewer.wrapper = buildStyledGroup(model, VIEWER_TARGET);
    viewer.scene.add(viewer.wrapper);
    vdrag.zoom = 4.4; vdrag.velX = 0; vdrag.velY = 0;
    if (!viewerBound) {
      canvas.addEventListener('pointerdown', vDown);
      canvas.addEventListener('pointermove', vMove);
      canvas.addEventListener('pointerup', vUp);
      canvas.addEventListener('pointercancel', vUp);
      canvas.addEventListener('wheel', vWheel, { passive: false });
      viewerBound = true;
    }
    vResize();
    viewer.running = true;
    viewer.raf = requestAnimationFrame(vFrame);
  } catch (err) {
    console.warn('[market-model] viewer load failed:', id, err);
  }
}
function unmountViewer() {
  viewer.running = false;
  if (viewer.raf) { cancelAnimationFrame(viewer.raf); viewer.raf = 0; }
  if (viewer.wrapper && viewer.scene) { viewer.scene.remove(viewer.wrapper); viewer.wrapper = null; }
  viewer.lastW = 0; viewer.lastH = 0;
}
