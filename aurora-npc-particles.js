import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_URL = './3d-model/spectral-humanoid-v1.glb';
const canvas = document.getElementById('pinball-npc-model') || document.getElementById('pinball-npc-particles') || document.getElementById('aurora-npc-particles');
const game = document.getElementById('aurora-game');
const pinballGame = document.getElementById('pinball-game');

const state = {
  renderer: null,
  scene: null,
  camera: null,
  root: null,
  mixer: null,
  clock: new THREE.Clock(),
  bounds: null,
  loaded: false,
  loading: false,
  error: false,
  lastW: 0,
  lastH: 0,
  actionBlend: 0,
  throwBlend: 0,
  reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  materials: [],
  lastFrame: 0,
  lastStageKey: '',
  lastVisible: true
};

const isMobile = window.matchMedia('(max-width: 720px), (pointer: coarse)').matches;
// Pixel ratio: desktop max 1.25, mobile max 1. antialias only on capable desktops.
const NPC_PIXEL_RATIO = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.25);
const NPC_ANTIALIAS = !isMobile && !state.reduced && (window.devicePixelRatio || 1) <= 1.5;

function npcTargetFps() {
  // Follow the app performance tier when available; hard cap 30 desktop / 20 mobile.
  const tier = window.eazoPerfTier || 'high';
  const desktop = tier === 'low' ? 20 : tier === 'medium' ? 26 : 30;
  const mobile = tier === 'low' ? 14 : tier === 'medium' ? 18 : 20;
  return isMobile ? mobile : desktop;
}

function isOpen() {
  return Boolean(game?.classList.contains('open') || pinballGame?.classList.contains('open'));
}

function isNpcVisible() {
  if (!canvas || !isOpen()) return false;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) return false;
  return true;
}

function initRenderer() {
  if (!canvas || state.renderer) return;
  state.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: NPC_ANTIALIAS, powerPreference: 'high-performance' });
  state.renderer.setClearColor(0x000000, 0);
  state.renderer.outputColorSpace = THREE.SRGBColorSpace;
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.renderer.toneMappingExposure = 1.08;
  state.scene = new THREE.Scene();
  state.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  state.camera.position.set(0, 0.18, 5.8);
  const key = new THREE.DirectionalLight(0xdfffee, 1.65);
  key.position.set(2.3, 3.2, 4.6);
  const fill = new THREE.HemisphereLight(0xb7fff0, 0x06110d, 1.1);
  const rim = new THREE.DirectionalLight(0x82ffc2, 0.9);
  rim.position.set(-3.5, 1.8, -2.4);
  state.scene.add(fill, key, rim);
  resize();
}

function resize() {
  if (!canvas || !state.renderer || !state.camera) return;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width || 1));
  const h = Math.max(1, Math.floor(rect.height || 1));
  if (w === state.lastW && h === state.lastH) return;
  state.lastW = w;
  state.lastH = h;
  state.renderer.setPixelRatio(NPC_PIXEL_RATIO);
  state.renderer.setSize(w, h, false);
  state.camera.aspect = w / h;
  state.camera.updateProjectionMatrix();
  frameModel();
}

function frameModel() {
  if (!state.root || !state.bounds || !state.camera) return;
  const size = state.bounds.size;
  const largest = Math.max(size.x, size.y, size.z, 0.001);
  const fov = THREE.MathUtils.degToRad(state.camera.fov);
  const distance = (largest * 0.58) / Math.tan(fov / 2);
  const pinballOpen = pinballGame?.classList.contains('open');
  state.camera.position.set(0, pinballOpen ? 0.08 : 0.14, distance * (pinballOpen ? 1.24 : 1.08));
  state.camera.near = Math.max(0.01, distance / 80);
  state.camera.far = Math.max(80, distance * 8);
  state.camera.lookAt(0, pinballOpen ? 0.04 : 0.12, 0);
  state.camera.updateProjectionMatrix();
}

function normalizeModel(root) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z, 0.001);
  root.position.sub(center);
  root.scale.setScalar(3.4 / largest);
  root.rotation.y = Math.PI;
  root.updateMatrixWorld(true);
  const normalized = new THREE.Box3().setFromObject(root);
  state.bounds = { box: normalized, size: normalized.getSize(new THREE.Vector3()), center: normalized.getCenter(new THREE.Vector3()) };
  root.position.y -= state.bounds.box.min.y + 1.68;
  root.updateMatrixWorld(true);
}

function makeTransparentMaterial(source, index) {
  const material = source?.clone?.() || new THREE.MeshStandardMaterial();
  material.transparent = true;
  material.opacity = 0.34;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.color = new THREE.Color().setHSL(index % 2 ? 0.43 : 0.38, 0.42, 0.78);
  material.emissive = new THREE.Color(0x6fffb4);
  material.emissiveIntensity = 0.16;
  material.roughness = Math.min(1, material.roughness ?? 0.72);
  material.metalness = Math.min(0.12, material.metalness ?? 0.02);
  return material;
}

async function loadModel() {
  if (!canvas || state.loaded || state.loading || state.error) return;
  state.loading = true;
  canvas.dataset.loading = 'true';
  initRenderer();
  try {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    const root = gltf.scene;
    let meshIndex = 0;
    state.materials = [];
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.frustumCulled = false;
      obj.castShadow = false;
      obj.receiveShadow = false;
      if (Array.isArray(obj.material)) obj.material = obj.material.map(m => makeTransparentMaterial(m, meshIndex++));
      else obj.material = makeTransparentMaterial(obj.material, meshIndex++);
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => state.materials.push(m));
    });
    normalizeModel(root);
    state.root = new THREE.Group();
    state.root.add(root);
    state.root.name = 'semi-transparent-npc-model';
    state.scene.add(state.root);
    frameModel();
    state.loaded = true;
    canvas.dataset.model = 'spectral-humanoid-v1-transparent-glb';
  } catch (err) {
    state.error = true;
    canvas.dataset.error = 'model-load-failed';
    console.warn('[AURORA NPC] transparent model failed to load', err);
  } finally {
    state.loading = false;
    delete canvas.dataset.loading;
  }
}

function currentStage() {
  const age = Number(window.eazoState?.age || 0);
  const aurora = window.eazoState?.aurora || {};
  if (aurora.forced || aurora.autoLoop) return 'forced';
  if (age >= 70) return 'admin';
  if (age >= 55) return 'refusal';
  if (age >= 40) return 'distant';
  if (age >= 25) return 'observed';
  return 'mutual';
}

function actionLevels(now) {
  const action = window.eazoAuroraAction || window.eazoPinballNpcAction || 'idle';
  let catchTarget = 0;
  let throwTarget = 0;
  if (action === 'catch-ready' || action === 'tracking' || action === 'pinball-watch') catchTarget = 0.48;
  if (action === 'npc-catch') catchTarget = 0.9;
  if (action === 'npc-throw' || action === 'pinball-serve') throwTarget = 0.85;
  const speed = state.reduced ? 1 : 0.08;
  state.actionBlend += (catchTarget - state.actionBlend) * speed;
  state.throwBlend += (throwTarget - state.throwBlend) * (state.reduced ? 1 : 0.11);
  return { catch: state.actionBlend, throw: state.throwBlend, wave: state.reduced ? 0 : Math.sin(now * 0.0014) };
}

function updateModel(now) {
  if (!state.root) return;
  const stage = currentStage();
  const pinballOpen = pinballGame?.classList.contains('open');
  const a = actionLevels(now);
  const fever = Math.max(0, Number(window.eazoPinball?.fever || 0));
  const forced = stage === 'forced';
  const opacity = forced ? 0.66 : stage === 'refusal' ? 0.22 : stage === 'distant' ? 0.27 : stage === 'observed' ? 0.31 : 0.38;
  // Only rewrite material uniforms when stage or fever bucket changes (not every frame).
  const feverBucket = fever > 0 ? 1 : 0;
  const matKey = stage + '|' + feverBucket;
  if (matKey !== state.lastStageKey) {
    state.lastStageKey = matKey;
    const targetOpacity = Math.min(0.72, opacity + (fever ? 0.08 : 0));
    const targetEmissive = forced ? 0.42 : fever ? 0.28 : 0.16;
    for (const m of state.materials) { m.opacity = targetOpacity; m.emissiveIntensity = targetEmissive; }
  }
  const stageTurn = stage === 'refusal' ? -0.45 : stage === 'admin' ? 0.08 : stage === 'distant' ? -0.16 : 0;
  state.root.rotation.y = stageTurn + Math.sin(now * 0.00055) * (state.reduced ? 0 : 0.055);
  state.root.rotation.z = (stage === 'refusal' ? -0.035 : 0) + a.throw * 0.035 - a.catch * 0.02;
  state.root.position.x = pinballOpen ? (stage === 'refusal' ? 0.1 : 0) : 0;
  state.root.position.y = Math.sin(now * 0.0012) * (state.reduced ? 0 : 0.035) + a.catch * 0.06;
  state.root.scale.setScalar(1 + (forced ? 0.045 : 0) + a.throw * 0.025 + (fever ? 0.035 : 0));
}

function animate(now = 0) {
  requestAnimationFrame(animate);
  if (!canvas || document.hidden || !isNpcVisible()) { state.lastFrame = now; return; }
  // Frame-rate cap (30fps desktop / 20fps mobile, follows perf tier).
  const interval = 1000 / npcTargetFps();
  if (now - state.lastFrame < interval) return;
  state.lastFrame = now;
  initRenderer();
  resize();
  loadModel();
  if (!state.renderer || !state.scene || !state.camera) return;
  updateModel(now);
  state.renderer.render(state.scene, state.camera);
}

window.addEventListener('resize', resize);
window.addEventListener('eazo:aurora-open', () => { initRenderer(); loadModel(); resize(); });
window.addEventListener('eazo:pinball-open', () => { initRenderer(); loadModel(); resize(); });

if (canvas) animate();
