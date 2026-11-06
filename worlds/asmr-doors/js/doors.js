/* ASMR DOORS — 코드로 만든 패널 문
   문틀 + 6판 패널 문짝 + 금색 손잡이. 경첩 기준으로 실제로 회전하며 열리고,
   문 안쪽 발광 면 + 문틈/바닥 빛 번짐 + 가짜 볼륨 광(가산 혼합)으로 빛이 쏟아진다. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const leafCache = new Map();
const frameCache = new Map();

function uvMeters(geo, sx, sy) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  return geo;
}

/* 6판 패널 문짝 (양면), 크기별로 한 번만 만든다 */
function leafGeometry(w, h, t) {
  const key = [w, h, t].join('|');
  if (leafCache.has(key)) return leafCache.get(key);
  const parts = [uvMeters(new THREE.BoxGeometry(w, h, t), w, h).toNonIndexed()];
  const m = w * 0.13, gx = w * 0.1;
  const colW = (w - 2 * m - gx) / 2;
  const usable = h - 2 * m - 2 * gx;
  const rows = [0.2, 0.47, 0.33].map((r) => r * usable);   // 위(짧음) · 가운데(김) · 아래
  const bevel = Math.min(0.02, colW * 0.12);
  let y = h / 2 - m;
  rows.forEach((rh) => {
    for (let c = 0; c < 2; c++) {
      const cx = -w / 2 + m + colW / 2 + c * (colW + gx);
      const cy = y - rh / 2;
      const pw = colW - bevel * 2, ph = rh - bevel * 2;
      const shape = new THREE.Shape();
      shape.moveTo(-pw / 2, -ph / 2); shape.lineTo(pw / 2, -ph / 2); shape.lineTo(pw / 2, ph / 2); shape.lineTo(-pw / 2, ph / 2); shape.closePath();
      const panel = new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.009, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
      for (const side of [1, -1]) {
        const g = panel.clone();
        g.translate(0, 0, t / 2 - 0.006);
        if (side < 0) g.rotateY(Math.PI);
        g.translate(cx, cy, 0);
        parts.push(g);
      }
      panel.dispose();
    }
    y -= rh + gx;
  });
  const geo = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  leafCache.set(key, geo);
  return geo;
}

function frameGeometry(w, h, fw, fd) {
  const key = [w, h, fw, fd].join('|');
  if (frameCache.has(key)) return frameCache.get(key);
  const parts = [];
  const fz = 0.085 - fd / 2;   // 문틀 앞면은 항상 z=+0.085, 깊으면 뒤로 두꺼워진다(벽 속 문틀)
  const add = (g, x, y, z) => { g.translate(x, y, z + fz); parts.push(g.toNonIndexed()); };
  add(uvMeters(new THREE.BoxGeometry(fw, h + fw, fd), fw, h), -(w / 2 + fw / 2), (h + fw) / 2, 0);
  add(uvMeters(new THREE.BoxGeometry(fw, h + fw, fd), fw, h), w / 2 + fw / 2, (h + fw) / 2, 0);
  add(uvMeters(new THREE.BoxGeometry(w + fw * 2, fw, fd), w, fw), 0, h + fw / 2, 0);
  // 위 장식 머리돌 + 몰딩
  add(uvMeters(new THREE.BoxGeometry(w + fw * 2 + 0.1, 0.05, fd + 0.05), w, 0.05), 0, h + fw + 0.025, 0);
  add(uvMeters(new THREE.BoxGeometry(w + fw * 2 + 0.04, 0.035, fd + 0.025), w, 0.04), 0, h + fw + 0.067, 0);
  // 기둥 아래 받침
  add(uvMeters(new THREE.BoxGeometry(fw + 0.03, 0.14, fd + 0.02), fw, 0.14), -(w / 2 + fw / 2), 0.07, 0);
  add(uvMeters(new THREE.BoxGeometry(fw + 0.03, 0.14, fd + 0.02), fw, 0.14), w / 2 + fw / 2, 0.07, 0);
  const geo = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  frameCache.set(key, geo);
  return geo;
}

let knobGeo = null;
function knobGeometry() {
  if (knobGeo) return knobGeo;
  const pts = [[0, 0], [0.03, 0], [0.032, 0.006], [0.012, 0.01], [0.009, 0.03], [0.014, 0.04], [0.028, 0.05], [0.033, 0.064], [0.027, 0.078], [0.012, 0.086], [0, 0.088]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  knobGeo = new THREE.LatheGeometry(pts, 28);
  knobGeo.rotateX(Math.PI / 2);   // 문 면에서 앞으로(+z) 튀어나오게
  return knobGeo;
}

/* 빛 그라디언트 텍스처 (가산 혼합용) */
let radialTex = null;
function getRadial() {
  if (radialTex) return radialTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  radialTex = new THREE.CanvasTexture(c); radialTex.colorSpace = THREE.SRGBColorSpace;
  return radialTex;
}

/**
 * opts: { w, h, color, frame, knob, glow, glowBase, ajar, normalMap, small, label }
 * 반환: { group, pivot, leaf, hits, setOpen(k), setGlow(k), update(dt,t), front(dist) ... }
 */
export function createDoor(opts = {}) {
  const w = opts.w ?? 1.0, h = opts.h ?? 2.1, t = opts.t ?? 0.05;
  const fw = opts.small ? 0.06 : 0.09, fd = opts.depth ?? (opts.small ? 0.12 : 0.17);
  const group = new THREE.Group();
  const glowCol = new THREE.Color(opts.glow ?? '#ffd27a');

  const nm = opts.normalMap || null;
  const frameMat = new THREE.MeshStandardMaterial({
    color: opts.frame ?? '#fff6e6', roughness: 0.55, metalness: 0,
    normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35)
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: opts.color ?? '#a8e6cf', roughness: 0.5, metalness: 0,
    normalMap: nm, normalScale: new THREE.Vector2(0.45, 0.45)
  });
  const goldMat = new THREE.MeshStandardMaterial({ color: opts.knob ?? '#e9c46a', roughness: 0.22, metalness: 1 });

  const frame = new THREE.Mesh(frameGeometry(w, h, fw, fd), frameMat);
  frame.castShadow = true; frame.receiveShadow = true;
  group.add(frame);

  // 경첩 축 (왼쪽)
  const pivot = new THREE.Group();
  pivot.position.set(-w / 2, 0, 0);
  group.add(pivot);
  const lw = w - 0.012, lh = h - 0.024;
  const leaf = new THREE.Mesh(leafGeometry(lw, lh, t), leafMat);
  leaf.position.set(w / 2, lh / 2 + 0.016, 0);   // 아래에 1.6cm 틈 → 문 아래로 빛이 샌다
  leaf.castShadow = true; leaf.receiveShadow = true;
  pivot.add(leaf);

  // 손잡이 (앞뒤), 장미판 포함
  const knobs = new THREE.Group();
  knobs.position.set(w - 0.1, 1.0 - (opts.small ? 0.42 : 0), 0);
  for (const side of [1, -1]) {
    const k = new THREE.Mesh(knobGeometry(), goldMat);
    k.position.z = side * t / 2;
    if (side < 0) k.rotation.y = Math.PI;
    k.castShadow = true;
    knobs.add(k);
  }
  pivot.add(knobs);
  // 경첩
  const hingeGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.11, 10);
  for (const hy of [0.28, h - 0.3]) {
    const hg = new THREE.Mesh(hingeGeo, goldMat);
    hg.position.set(0.004, hy, t / 2 + 0.004);
    pivot.add(hg);
  }

  // 문 안쪽 발광 면: 문이 열리면 이 빛이 문틀을 가득 채운다
  const lightMat = new THREE.MeshBasicMaterial({ color: glowCol.clone(), transparent: true, opacity: 1, toneMapped: false });
  const lightPlane = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.004, h + 0.002), lightMat);
  lightPlane.position.set(0, h / 2, opts.lightZ ?? -0.035);
  group.add(lightPlane);

  // 문 앞 바닥 빛 번짐
  const floorMat = new THREE.MeshBasicMaterial({ map: getRadial(), color: glowCol.clone(), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(w * 2.6, 2.4), floorMat);
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.position.set(0.05, 0.012, 0.75);
  floorGlow.renderOrder = 2;
  group.add(floorGlow);

  // 가짜 볼륨 광: 문 앞에 겹겹이 퍼지는 가산 빛 안개 (앞으로 갈수록 크고 옅게)
  const beamMat = new THREE.MeshBasicMaterial({ map: getRadial(), color: glowCol.clone(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const beams = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w * (1.7 + i * 0.9), h * (1.2 + i * 0.35)), beamMat);
    b.position.set(0, h * 0.5, 0.18 + i * 0.42);
    b.renderOrder = 3;
    beams.add(b);
  }
  group.add(beams);

  // 가장자리 문틈 빛 (닫혀 있을 때 반짝)
  const gapMat = new THREE.MeshBasicMaterial({ color: glowCol.clone(), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const gapGeo = new THREE.PlaneGeometry(0.012, h - 0.04);
  const gap = new THREE.Mesh(gapGeo, gapMat);
  gap.position.set(w / 2 - 0.004, h / 2, t / 2 + 0.002);
  group.add(gap);
  const gapB = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, 0.014), gapMat);
  gapB.position.set(0, 0.024, t / 2 + 0.003);
  group.add(gapB);

  const hits = [leaf, frame];
  const state = { open: 0, glow: opts.glowBase ?? 0.6, glowTarget: opts.glowBase ?? 0.6, knob: 0, base: opts.glowBase ?? 0.6 };
  const ajar = opts.ajar ?? 0;

  function apply() {
    const a = ajar + (Math.PI * 0.55 - ajar) * state.open;
    pivot.rotation.y = a;
    knobs.rotation.z = -state.knob * 0.6;
    const g = state.glow;
    floorMat.opacity = Math.min(1, 0.12 + g * 0.55 + state.open * 0.6);
    gapMat.opacity = state.open > 0.02 ? 0 : Math.min(1, g * 0.9);
    gap.visible = ajar < 0.01;
    lightMat.color.copy(glowCol).multiplyScalar(0.25 + g * 1.1 + state.open * 1.6);
    beamMat.opacity = state.open * 0.55;
  }
  apply();

  return {
    group, pivot, leaf, frame, hits, w, h, lightPlane, leafMat,
    get openAmount() { return state.open; },
    setOpen(k) { state.open = k; apply(); },
    setKnob(k) { state.knob = k; apply(); },
    setGlow(k) { state.glowTarget = k; },
    setGlowNow(k) { state.glow = state.glowTarget = k; apply(); },
    setBase(k) { state.base = k; },
    setColor(c) { glowCol.set(c); apply(); },
    update(dt, time, focus) {
      const target = state.glowTarget * (0.9 + 0.1 * Math.sin(time * 1.7 + w * 7)) + (focus ? 0.35 : 0);
      state.glow += (target - state.glow) * Math.min(1, dt * 4);
      apply();
    },
    dispose() {
      [frameMat, leafMat, goldMat, lightMat, floorMat, beamMat, gapMat].forEach((m) => m.dispose());
      lightPlane.geometry.dispose(); floorGlow.geometry.dispose(); gapGeo.dispose(); gapB.geometry.dispose(); hingeGeo.dispose();
      beams.children.forEach((b) => b.geometry.dispose());
    }
  };
}
