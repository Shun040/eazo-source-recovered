import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* S–03 semi-transparent 3D NPC.
 * Renders the spectral-humanoid GLB on #snow-npc-model, positioned at the
 * NPC's field location. Opacity / glow / wary-turn driven by window.eazoSnowNpc
 * (published each frame from snow.js). Frame-capped, stops when hidden. */

const MODEL_URL = './3d-model/spectral-humanoid-v1.glb';
const canvas = document.getElementById('snow-npc-model');
const gameEl = document.getElementById('snow-game');

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.matchMedia('(max-width: 720px), (pointer: coarse)').matches;
const PIXEL_RATIO = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.25);

const S = {
  renderer: null, scene: null, camera: null, root: null, bounds: null,
  materials: [], loaded: false, loading: false, error: false,
  lastW: 0, lastH: 0, lastFrame: 0, lastKey: '', flashPulse: 0
};

function npcState() { return window.eazoSnowNpc || null; }
function isOpen() { return Boolean(gameEl?.classList.contains('open') && npcState()?.open); }

function targetFps() { const tier = window.eazoPerfTier || 'high'; return isMobile ? (tier === 'low' ? 14 : 20) : (tier === 'low' ? 20 : 30); }

function isVisible() {
  if (!canvas || !isOpen()) return false;
  const r = canvas.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function initRenderer() {
  if (!canvas || S.renderer) return;
  S.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !isMobile && !reduced, powerPreference: 'high-performance' });
  S.renderer.setClearColor(0x000000, 0);
  S.renderer.outputColorSpace = THREE.SRGBColorSpace;
  S.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  S.renderer.toneMappingExposure = 1.02;
  S.scene = new THREE.Scene();
  S.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  S.camera.position.set(0, 0.1, 6);
  const key = new THREE.DirectionalLight(0xd6ffe8, 1.4); key.position.set(2, 3, 4.6);
  const fill = new THREE.HemisphereLight(0x9effe0, 0x04120c, 1.05);
  const rim = new THREE.DirectionalLight(0x74ffbe, 0.85); rim.position.set(-3.4, 1.6, -2.6);
  S.scene.add(fill, key, rim);
  resize();
}

function resize() {
  if (!canvas || !S.renderer || !S.camera) return;
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width || 1)), h = Math.max(1, Math.floor(r.height || 1));
  if (w === S.lastW && h === S.lastH) return;
  S.lastW = w; S.lastH = h;
  S.renderer.setPixelRatio(PIXEL_RATIO);
  S.renderer.setSize(w, h, false);
  S.camera.aspect = w / h;
  S.camera.updateProjectionMatrix();
  frameModel();
}

function makeMaterial(src, i) {
  const m = src?.clone?.() || new THREE.MeshStandardMaterial();
  m.transparent = true; m.opacity = 0.32; m.depthWrite = false; m.side = THREE.DoubleSide;
  m.color = new THREE.Color().setHSL(i % 2 ? 0.44 : 0.4, 0.4, 0.76);
  m.emissive = new THREE.Color(0x6bffb0); m.emissiveIntensity = 0.16;
  m.roughness = Math.min(1, m.roughness ?? 0.7); m.metalness = Math.min(0.12, m.metalness ?? 0.02);
  return m;
}

async function loadModel() {
  if (S.loaded || S.loading || S.error) return;
  S.loading = true;
  try {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    const root = gltf.scene || gltf.scenes?.[0];
    if (!root) throw new Error('no scene');
    let i = 0; S.materials = [];
    root.traverse(obj => {
      if (!obj.isMesh) return;
      obj.castShadow = obj.receiveShadow = false;
      if (Array.isArray(obj.material)) obj.material = obj.material.map(mm => makeMaterial(mm, i++));
      else obj.material = makeMaterial(obj.material, i++);
      (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(mm => S.materials.push(mm));
    });
    normalizeModel(root);
    root.name = 'snow-semi-transparent-npc';
    S.root = root; S.scene.add(root); S.loaded = true;
    frameModel();
  } catch (err) {
    S.error = true; console.warn('[SNOW NPC] model load failed', err);
  } finally { S.loading = false; }
}

function normalizeModel(root) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z, 0.001);
  root.position.sub(center);
  root.scale.setScalar(2.1 / largest);
  S.baseScale = 2.1 / largest;
  root.rotation.y = 0;
  root.updateMatrixWorld(true);
  const nb = new THREE.Box3().setFromObject(root);
  S.bounds = { box: nb, size: nb.getSize(new THREE.Vector3()) };
  root.position.y -= nb.min.y + 1.6;
  root.updateMatrixWorld(true);
}

function frameModel() {
  if (!S.root || !S.bounds || !S.camera) return;
  const size = S.bounds.size;
  const largest = Math.max(size.x, size.y, size.z, 0.001);
  const fov = THREE.MathUtils.degToRad(S.camera.fov);
  // Pull the camera further back (×2.6) so the model reads small, and aim
  // above the model's centre so the whole body sits in the lower half.
  const distance = (largest * 0.6) / Math.tan(fov / 2) * 2.6;
  S.camera.position.set(0, 0.45, distance);
  S.camera.near = Math.max(0.01, distance / 80);
  S.camera.far = Math.max(80, distance * 8);
  S.camera.lookAt(0, 0.45, 0);
  S.camera.updateProjectionMatrix();
}

function updateModel(now) {
  if (!S.root) return;
  const ns = npcState() || {};
  const disp = ns.display ?? 1, wary = ns.wary || 0, flash = ns.flash || 0;
  // opacity from displayed willingness (surface warmth); low → nearly vanished
  const base = 0.14 + disp * 0.34;
  const opacity = Math.min(0.7, base + flash * 0.18);
  const emissive = 0.12 + disp * 0.2 + flash * 0.3;
  const key = `${opacity.toFixed(2)}|${emissive.toFixed(2)}`;
  if (key !== S.lastKey) { S.lastKey = key; for (const m of S.materials) { m.opacity = opacity; m.emissiveIntensity = emissive; } }
  // position the model horizontally to match NPC's field x; wary → turn away & recede
  const nx = (ns.nx ?? 0.5) - 0.5;                 // -0.5..0.5
  S.root.position.x = nx * 2.4 + wary * 0.35;
  S.root.position.z = -wary * 0.8;                 // steps back when wary
  S.root.rotation.y = -wary * 0.6 + (reduced ? 0 : Math.sin(now * 0.0005) * 0.05);
  S.root.position.y = -1.6 + (reduced ? 0 : Math.sin(now * 0.0012) * 0.04) + flash * 0.05;
  S.root.scale.setScalar((S.baseScale || 1) * (1 - wary * 0.08 + flash * 0.03));
}

function animate(now = 0) {
  requestAnimationFrame(animate);
  if (!canvas || document.hidden || !isVisible()) { S.lastFrame = now; return; }
  const interval = 1000 / targetFps();
  if (now - S.lastFrame < interval) return;
  S.lastFrame = now;
  initRenderer(); resize(); loadModel();
  if (!S.renderer || !S.scene || !S.camera) return;
  updateModel(now);
  S.renderer.render(S.scene, S.camera);
}

window.addEventListener('resize', resize);
if (canvas) animate();
