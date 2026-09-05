import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* B–06 · 共同创造生物 — 抓周物品的 3D 呈现
 *  使用原始 GLB 材质呈现细节（不做 ghost / 粒子处理）。
 *  三件物品平铺在培养框里；拖拽旋转模型（无自动旋转、不移动位置）；
 *  点击（未拖动）触发物品介绍回调。游戏逻辑与按钮结构不变。
 *
 *  暴露：window.eazoCreatureModel = {
 *    hasModel(slotId),
 *    mount(slotEl, slotId),          // 右侧选择缩略图内联 3D
 *    spawnInChamber(container, slotId, opts),  // 培养框内可旋转实例
 *    unmountAll(), clearChamber()
 *  }
 */

const MODEL_URLS = {
  object_fractured_mirror: './3d-model/object_fractured_mirror.glb',
  object_red_thread: './3d-model/object_red_thread.glb',
  object_dormant_seed: './3d-model/object_dormant_seed.glb',
  object_toothless_key: './3d-model/object_toothless_key.glb',
};

/* 每件物品的正面朝向（rotX/rotY/rotZ 弧度）与显示缩放。
 * 镜子=眼睛那一面朝观众；种子=有裂口那一面朝观众。
 * 朝向为初始估计，可按真机微调。 */
const MODEL_CONFIG = {
  object_fractured_mirror: { rotX: 0, rotY: -Math.PI / 2, rotZ: 0, scale: 0.667 },
  object_red_thread:       { rotX: 0, rotY: 0, rotZ: 0, scale: 0.667 },
  object_dormant_seed:     { rotX: 0, rotY: -Math.PI / 2, rotZ: 0, scale: 0.5 },
  object_toothless_key:    { rotX: 0, rotY: Math.PI / 2, rotZ: 0, scale: 0.667 },
  creature_larval:         { rotX: 0, rotY: 0, rotZ: 0, scale: 1.0 },
  creature_juvenile:       { rotX: 0, rotY: 0, rotZ: 0, scale: 1.0 },
  creature_adult:          { rotX: 0, rotY: 0, rotZ: 0, scale: 1.0 },
};

// 生物成长阶段模型（居中大展示）
const CREATURE_URLS = {
  larval: './3d-model/creature_larval.glb',
  juvenile: './3d-model/creature_juvenile.glb',
  adult: './3d-model/creature_adult.glb',
};
function hasCreature(stage) { return Object.prototype.hasOwnProperty.call(CREATURE_URLS, stage); }

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 1.5);

function hasModel(slotId) { return Object.prototype.hasOwnProperty.call(MODEL_URLS, slotId); }

// 归一化居中，保留原始材质
function normalize(model, targetSize) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  model.position.sub(center);
  model.scale.setScalar(targetSize / maxDim);
  model.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
}

// 冷绿实验室灯光，让原始 PBR 材质显出细节
function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xdff0ea, 0x0a1a16, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 4, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xbfe0d6, 0.8); fill.position.set(-4, 1, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x8fc7b8, 0.6); rim.position.set(-2, -2, -4); scene.add(rim);
}

const loader = new GLTFLoader();
const sceneCache = new Map();

function loadModel(slotId) {
  if (sceneCache.has(slotId)) return Promise.resolve(sceneCache.get(slotId));
  const url = MODEL_URLS[slotId];
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => {
      const root = gltf.scene;
      normalize(root, 1.5);
      sceneCache.set(slotId, root);
      resolve(root);
    }, undefined, reject);
  });
}

// 按物品配置应用正面朝向与显示缩放
function applyConfig(group, slotId) {
  const cfg = MODEL_CONFIG[slotId] || {};
  group.rotation.set(cfg.rotX || 0, cfg.rotY || 0, cfg.rotZ || 0);
  group.scale.multiplyScalar(cfg.scale || 1);
}

function makeRenderer() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(PIXEL_RATIO);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  return renderer;
}

// ── 右侧选择缩略图内联 3D（缓慢自转，仅作为按钮图标）──────────
const active = new Set();

function mount(slotEl, slotId) {
  if (!hasModel(slotId) || !slotEl) return Promise.resolve(false);
  const renderer = makeRenderer();
  const rect = slotEl.getBoundingClientRect();
  renderer.setSize(Math.max(40, rect.width || 54), Math.max(40, rect.height || 54), false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 3.4);
  addLights(scene);

  const ctrl = { renderer, raf: 0, stopped: false, group: null, ro: null };

  return loadModel(slotId).then((tpl) => {
    const group = tpl.clone(true);
    applyConfig(group, slotId);
    scene.add(group);
    ctrl.group = group;
    const code = slotEl.querySelector('.placeholder-code');
    slotEl.replaceChildren(renderer.domElement);
    if (code) slotEl.appendChild(code);
    slotEl.dataset.modelStatus = 'loaded';

    const ro = new ResizeObserver(() => {
      const r = slotEl.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) {
        renderer.setSize(r.width, r.height, false);
        camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
      }
    });
    ro.observe(slotEl); ctrl.ro = ro;

    function frame() {
      if (ctrl.stopped) return;
      if (!document.hidden) {
        if (!reduced) group.rotation.y += 0.006;
        renderer.render(scene, camera);
      }
      ctrl.raf = requestAnimationFrame(frame);
    }
    ctrl.raf = requestAnimationFrame(frame);
    active.add(ctrl);
    return true;
  }).catch(() => { renderer.dispose(); return false; });
}

// ── 培养框内实例：平铺摆放，拖拽旋转（无自动旋转），点击触发介绍 ──
const chamberInstances = new Set();

function spawnInChamber(container, slotId, opts = {}) {
  if (!hasModel(slotId) || !container) return Promise.resolve(null);

  const host = document.createElement('div');
  host.className = 'creature-chamber-object';
  host.dataset.modelSlot = slotId;
  host.style.position = 'absolute';
  host.style.width = (opts.size || 34) + '%';
  host.style.height = (opts.size || 34) + '%';
  host.style.left = (opts.left != null ? opts.left : 50) + '%';
  host.style.top = (opts.top != null ? opts.top : 50) + '%';
  host.style.transform = 'translate(-50%, -50%)';
  host.style.cursor = 'grab';
  host.style.touchAction = 'none';
  container.appendChild(host);

  const renderer = makeRenderer();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 1.9);   // 更近 → 模型约 2 倍大
  addLights(scene);

  const ctrl = { renderer, raf: 0, stopped: false, group: null, ro: null, host };

  function sizeToHost() {
    const r = host.getBoundingClientRect();
    const w = Math.max(20, r.width), h = Math.max(20, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  return loadModel(slotId).then((tpl) => {
    const group = tpl.clone(true);
    applyConfig(group, slotId);
    scene.add(group);
    ctrl.group = group;
    ctrl.slotId = slotId;
    host.appendChild(renderer.domElement);
    sizeToHost();
    const ro = new ResizeObserver(sizeToHost);
    ro.observe(host); ctrl.ro = ro;

    // ── 拖拽旋转模型（不移动位置、无自动旋转）；未拖动=点击介绍 ──
    let dragging = false, moved = false, px = 0, py = 0;
    function onDown(e) {
      dragging = true; moved = false;
      host.style.cursor = 'grabbing';
      host.classList.add('picked');
      px = e.clientX; py = e.clientY;
      host.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      const dx = e.clientX - px, dy = e.clientY - py;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      group.rotation.y += dx * 0.01;
      group.rotation.x += dy * 0.01;
      px = e.clientX; py = e.clientY;
    }
    function onUp(e) {
      if (!dragging) return;
      dragging = false;
      host.style.cursor = 'grab';
      host.classList.remove('picked');
      host.releasePointerCapture?.(e.pointerId);
      if (!moved && typeof opts.onSelect === 'function') opts.onSelect(slotId);
    }
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    ctrl._cleanup = () => {
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
    };

    function frame() {
      if (ctrl.stopped) return;
      if (!document.hidden) renderer.render(scene, camera);
      ctrl.raf = requestAnimationFrame(frame);
    }
    ctrl.raf = requestAnimationFrame(frame);
    chamberInstances.add(ctrl);
    return ctrl;
  }).catch(() => { renderer.dispose(); host.remove(); return null; });
}

function disposeCtrl(ctrl) {
  ctrl.stopped = true;
  cancelAnimationFrame(ctrl.raf);
  ctrl.ro?.disconnect();
  ctrl._cleanup?.();
  ctrl.renderer.dispose();
  ctrl.host?.remove();
}

function clearChamber() {
  chamberInstances.forEach(disposeCtrl);
  chamberInstances.clear();
}

// 移除培养框内某件物品的实例（用于取消选择）
function removeFromChamber(slotId) {
  chamberInstances.forEach((ctrl) => {
    if (ctrl.slotId === slotId) {
      disposeCtrl(ctrl);
      chamberInstances.delete(ctrl);
    }
  });
}

function unmountAll() {
  clearChamber();
  active.forEach(disposeCtrl);
  active.clear();
  clearCreature();
}

// ── 生物成长阶段：居中大展示，可拖拽旋转，缓慢自转 ──
const creatureInstances = new Set();

// 把模型本体调半透明，并从其表面顶点采样出冷绿粒子体现体积
function makeGhostly(group, targetCount = 200000) {
  group.updateWorldMatrix(true, true);
  const src = [];       // 采样源顶点（group 局部坐标）
  const tmp = new THREE.Vector3();
  const bodyMats = [];  // 本体材质，供悬停切换
  const bodyMeshes = [];
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    // 本体默认隐藏（框外为粒子形态），悬停时显现为绿色半透明体
    o.visible = false;
    bodyMeshes.push(o);
    // 取消原贴图，替换为绿色半透明材质
    const green = new THREE.MeshStandardMaterial({
      color: 0xb8e63a,
      emissive: 0xaadc32,
      emissiveIntensity: 1.15,
      transparent: false,
      opacity: 1,
      depthWrite: true,
      roughness: 0.7,
      metalness: 0.0,
    });
    o.material = green;
    bodyMats.push(green);
    // 收集顶点（转换到 group 局部空间）
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      tmp.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      o.localToWorld(tmp);
      group.worldToLocal(tmp);
      src.push(tmp.x, tmp.y, tmp.z);
    }
  });
  if (!src.length) return null;

  const srcCount = src.length / 3;
  const count = targetCount;  // 允许超采样顶点，靠抖动铺满表面
  const positions = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);  // 飞散目标位置
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const s = (Math.floor(Math.random() * srcCount)) * 3;
    // 沿采样点做轻微抖动，形成体积感薄雾
    const j = 0.008;
    const bx = src[s]     + (Math.random() - 0.5) * j;
    const by = src[s + 1] + (Math.random() - 0.5) * j;
    const bz = src[s + 2] + (Math.random() - 0.5) * j;
    positions[i * 3]     = bx;
    positions[i * 3 + 1] = by;
    positions[i * 3 + 2] = bz;
    // 飞散：沿随机方向向外扩散
    const dir = new THREE.Vector3(
      (Math.random() - 0.5),
      (Math.random() - 0.5),
      (Math.random() - 0.5)
    ).normalize();
    const spread = 0.9 + Math.random() * 1.1;
    scatter[i * 3]     = bx + dir.x * spread;
    scatter[i * 3 + 1] = by + dir.y * spread;
    scatter[i * 3 + 2] = bz + dir.z * spread;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xc6f04a,
    size: 0.0032,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.userData.phases = phases;
  points.userData.basePos = positions.slice();
  points.userData.scatterPos = scatter;
  group.add(points);
  return { points, bodyMeshes, bodyMats };
}

function loadCreature(stage) {
  const cacheKey = 'creature_' + stage;
  if (sceneCache.has(cacheKey)) return Promise.resolve(sceneCache.get(cacheKey));
  const url = CREATURE_URLS[stage];
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => {
      const root = gltf.scene;
      normalize(root, 1.5);
      sceneCache.set(cacheKey, root);
      resolve(root);
    }, undefined, reject);
  });
}

function spawnCreature(container, stage, opts = {}) {
  if (!hasCreature(stage) || !container) return Promise.resolve(null);
  clearCreature();

  const host = document.createElement('div');
  host.className = 'creature-stage-model';
  host.style.position = 'absolute';
  host.style.inset = '0';
  host.style.cursor = 'pointer';
  host.style.touchAction = 'none';
  container.appendChild(host);

  const renderer = makeRenderer();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, opts.distance || 2.6);
  addLights(scene);

  const ctrl = { renderer, raf: 0, stopped: false, group: null, ro: null, host };

  function sizeToHost() {
    const r = host.getBoundingClientRect();
    const w = Math.max(20, r.width), h = Math.max(20, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  return loadCreature(stage).then((tpl) => {
    const group = tpl.clone(true);
    applyConfig(group, 'creature_' + stage);
    scene.add(group);
    ctrl.group = group;
    const ghost = makeGhostly(group);
    const points = ghost?.points || null;
    const bodyMeshes = ghost?.bodyMeshes || [];
    host.appendChild(renderer.domElement);
    sizeToHost();
    const ro = new ResizeObserver(sizeToHost);
    ro.observe(host); ctrl.ro = ro;

    let dragging = false, px = 0, py = 0, userInteracted = false, hovering = false;
    // morph: 0 = 完全飞散粒子云, 1 = 聚合为实体模型
    let morph = 0, morphTarget = 0;
    // 初始：粒子显示、飞散态；本体隐藏
    if (points) {
      const pos = points.geometry.attributes.position;
      const sc = points.userData.scatterPos;
      pos.array.set(sc);
      pos.needsUpdate = true;
    }
    function setHover(on) {
      hovering = on;
      morphTarget = on ? 1 : 0;
    }
    function onEnter() { setHover(true); }
    function onLeave() { setHover(false); }
    host.addEventListener('pointerenter', onEnter);
    host.addEventListener('pointerleave', onLeave);
    function onDown(e) {
      dragging = true; userInteracted = true;
      host.style.cursor = 'pointer';
      px = e.clientX; py = e.clientY;
      host.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      group.rotation.y += (e.clientX - px) * 0.01;
      group.rotation.x += (e.clientY - py) * 0.01;
      px = e.clientX; py = e.clientY;
    }
    function onUp(e) {
      dragging = false;
      host.style.cursor = 'pointer';
      host.releasePointerCapture?.(e.pointerId);
    }
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    ctrl._cleanup = () => {
      host.removeEventListener('pointerenter', onEnter);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
    };

    function frame() {
      if (ctrl.stopped) return;
      if (!document.hidden) {
        if (!reduced && !userInteracted && !dragging) group.rotation.y += 0.004;
        // 平滑过渡 morph
        morph += (morphTarget - morph) * 0.08;
        if (Math.abs(morphTarget - morph) < 0.001) morph = morphTarget;
        // 本体在接近聚合时显现；粒子在聚合完成前可见
        const solid = false;  // 取消实体模型，全程粒子
        bodyMeshes.forEach((m) => { m.visible = false; });
        if (points) {
          points.visible = !solid;
          if (!solid) {
            const t = performance.now() * 0.001;
            // ease: morph 越大越贴近模型表面，越小越飞散
            const e = morph * morph * (3 - 2 * morph);
            points.material.opacity = (0.72 + Math.sin(t * 1.3) * 0.15) * (0.35 + 0.65 * (1 - e * 0.4));
            const pos = points.geometry.attributes.position;
            const base = points.userData.basePos;
            const sc = points.userData.scatterPos;
            const ph = points.userData.phases;
            for (let i = 0; i < ph.length; i++) {
              const k = i * 3;
              const wob = (1 - e) * Math.sin(t * 1.6 + ph[i]) * 0.02;
              const bx = base[k] + Math.sin(t * 1.6 + ph[i]) * 0.004;
              const by = base[k + 1] + Math.sin(t * 1.6 + ph[i]) * 0.004;
              const bz = base[k + 2] + Math.sin(t * 1.6 + ph[i]) * 0.004;
              pos.array[k]     = sc[k]     + (bx - sc[k]) * e + wob;
              pos.array[k + 1] = sc[k + 1] + (by - sc[k + 1]) * e + wob;
              pos.array[k + 2] = sc[k + 2] + (bz - sc[k + 2]) * e + wob;
            }
            pos.needsUpdate = true;
          }
        }
        renderer.render(scene, camera);
      }
      ctrl.raf = requestAnimationFrame(frame);
    }
    ctrl.raf = requestAnimationFrame(frame);
    creatureInstances.add(ctrl);
    return ctrl;
  }).catch((e) => { renderer.dispose(); host.remove(); return null; });
}

function clearCreature() {
  creatureInstances.forEach(disposeCtrl);
  creatureInstances.clear();
}

window.eazoCreatureModel = { hasModel, mount, unmountAll, spawnInChamber, clearChamber, removeFromChamber, hasCreature, spawnCreature, clearCreature };
