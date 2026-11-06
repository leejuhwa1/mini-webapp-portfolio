/* ASMR DOORS — 햇살 홀
   정면 곡선 벽에 문 6개가 나란히. 크림·버터 벽 + 피치 웨인스코팅 + 꿀색 마루 + 로즈 베이지 러그,
   펜던트 조명, 옆벽 높은 창으로 햇살 줄기와 먼지 반짝이. 절대 어둡지 않게. */
import * as THREE from 'three';
import { createDoor } from './doors.js';
import { ROOMS, STAR } from './rooms.js';

export const HALL_TEX = [
  'herringbone_parquet_diff', 'herringbone_parquet_nor_gl',
  'beige_wall_001_diff', 'beige_wall_001_nor_gl',
  'polar_fleece_nor_gl', 'wood_table_001_nor_gl'
];

const C = { x: 0, z: 1.5 };        // 곡선 벽의 중심
const R = 7.5, H = 4.4;            // 반지름, 천장 높이
const ARC = THREE.MathUtils.degToRad(80);
const SIDE_X = R * Math.sin(ARC);  // 옆벽 x
const ARC_END_Z = C.z - R * Math.cos(ARC);
const BACK_Z = 6.8;
const DEPTH = 0.42;                // 벽 속 문틀 깊이
const DOOR_ANGLES = [-45, -27, -9, 9, 27, 45].map(THREE.MathUtils.degToRad);
const RUG = { x: 0, z: 1.9, rx: 3.3, rz: 2.3 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function onArc(alpha, r) { return { x: C.x + r * Math.sin(alpha), z: C.z - r * Math.cos(alpha) }; }

function rugTexture(kit) {
  return kit.canvasTex(1024, 1024, (g, W) => {
    const c = W / 2;
    const ring = (r, col) => { g.fillStyle = col; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fill(); };
    ring(510, '#f3d9cc'); ring(486, '#e7b0a3'); ring(452, '#fbe8dc'); ring(440, '#e9b6a9'); ring(330, '#efc3b6');
    // 작은 하트·점 무늬
    g.fillStyle = '#fbe8dc';
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2, r = 395;
      const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2); g.scale(0.9, 0.9);
      g.beginPath(); g.moveTo(0, 10); g.bezierCurveTo(-18, -4, -10, -20, 0, -9); g.bezierCurveTo(10, -20, 18, -4, 0, 10); g.fill();
      g.restore();
    }
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2;
      g.beginPath(); g.arc(c + Math.cos(a) * 250, c + Math.sin(a) * 250, 9, 0, Math.PI * 2); g.fill();
    }
    ring(120, '#f7d4c8');
    g.strokeStyle = '#e7a999'; g.lineWidth = 10;
    g.beginPath(); g.arc(c, c, 120, 0, Math.PI * 2); g.stroke();
    // 실 결
    g.globalAlpha = 0.07; g.strokeStyle = '#8a5a50'; g.lineWidth = 1;
    for (let y = 0; y < W; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + 2); g.stroke(); }
    g.globalAlpha = 1;
  });
}

function skyWindowTexture(kit) {
  return kit.canvasTex(128, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#7fc3ff'); gr.addColorStop(0.55, '#bfe3ff'); gr.addColorStop(1, '#f4fbff');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.85)';
    [[40, 70, 26], [70, 64, 30], [96, 76, 20], [30, 150, 16], [54, 146, 20]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
  });
}

function paintingTexture(kit, seed) {
  return kit.canvasTex(256, 320, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, seed ? '#ffd1dc' : '#bfe4ff'); sky.addColorStop(1, seed ? '#fff1d6' : '#fff6e8');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = seed ? '#fff3b0' : '#fffbe6'; g.beginPath(); g.arc(seed ? 180 : 70, 90, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = seed ? '#b9dfb0' : '#a9dcc4'; g.beginPath(); g.ellipse(80, 250, 190, 70, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = seed ? '#9fd09a' : '#8fcfb3'; g.beginPath(); g.ellipse(220, 270, 170, 70, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(20 + i * 17, 245 + Math.sin(i) * 14, 3, 0, Math.PI * 2); g.fill(); }
  });
}

function sunPatchTexture(kit) {
  return kit.canvasTex(128, 256, (g, w, h) => {
    g.filter = 'blur(10px)';
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(24, h - 24); g.lineTo(24, 70); g.arc(w / 2, 70, w / 2 - 24, Math.PI, 0); g.lineTo(w - 24, h - 24); g.closePath(); g.fill();
    g.filter = 'none';
    g.globalCompositeOperation = 'destination-out';
    g.fillRect(w / 2 - 3, 40, 6, h);
    g.fillRect(0, h * 0.55, w, 6);
  });
}

export function buildHall(kit) {
  const { tex, mesh, std, reduced } = kit;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#fbeedd');
  scene.environment = kit.roomEnv;

  const wallN = tex.get('beige_wall_001_nor_gl');
  const woodN = tex.get('wood_table_001_nor_gl');
  const fleeceN = tex.get('polar_fleece_nor_gl').clone();
  fleeceN.channel = 1; fleeceN.needsUpdate = true; fleeceN.userData.owned = true;

  /* ---------- 빛: 밝고 포근하게 ---------- */
  scene.add(new THREE.HemisphereLight('#fff7ea', '#f0c9a2', 1.25));
  const sun = kit.shadowLight('#ffe6bf', 1.7, [-13, 9.5, 3.4], [0, 0, 2.2], 10);
  scene.add(sun, sun.target);
  const pend = [[0, 3.05, -1.4, 16], [-3.1, 3.05, 3.6, 10], [3.1, 3.05, 3.6, 10]];
  pend.forEach(([x, y, z, i]) => { const p = new THREE.PointLight('#ffd9a0', i, 0, 2); p.position.set(x, y, z); scene.add(p); });

  /* ---------- 바닥: 꿀색 헤링본 마루 ---------- */
  const floorW = SIDE_X * 2 + 0.4, floorD = BACK_Z - (C.z - R) + 0.4;
  const floorGeo = kit.uv(new THREE.PlaneGeometry(floorW, floorD), floorW / 2.4, floorD / 2.4);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    map: tex.get('herringbone_parquet_diff'), normalMap: tex.get('herringbone_parquet_nor_gl'),
    color: new THREE.Color(1.22, 1.08, 0.9), roughness: 0.42, envMapIntensity: 0.8
  });
  mesh(floorGeo, floorMat, { p: [0, 0, (BACK_Z + C.z - R) / 2], cast: false, parent: scene });

  /* ---------- 벽: 크림·버터 줄무늬 벽지 + 피치 웨인스코팅 + 흰 몰딩 ---------- */
  const wallMat = new THREE.MeshStandardMaterial({
    map: tex.get('beige_wall_001_diff'), normalMap: wallN, normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.6
  });
  kit.patch(wallMat, { luma: { a: '#f7e2bd', b: '#fff6df', lo: 0.25, hi: 0.75, detail: 0.9 }, stripes: { freq: 13, tint: '#f8e7c4', amt: 0.5 } });
  const wainMat = new THREE.MeshStandardMaterial({ color: '#f6cdb8', roughness: 0.6, normalMap: woodN, normalScale: new THREE.Vector2(0.25, 0.25), side: THREE.DoubleSide });
  const trimMat = std('#fffaf2', 0.45);
  const arcLen = R * ARC * 2;

  // 곡선 벽 (Cylinder: x = r sinθ, z = r cosθ → -z 방향이 θ=π)
  const cyl = (r, h, mat, y) => {
    const g = new THREE.CylinderGeometry(r, r, h, 96, 1, true, Math.PI - ARC, ARC * 2);
    kit.uv(g, arcLen / 2.4, h / 2.4);
    return mesh(g, mat, { p: [C.x, y, C.z], cast: false, parent: scene });
  };
  cyl(R, H, wallMat, H / 2);
  cyl(R - 0.04, 1.1, wainMat, 0.55);
  cyl(R - 0.07, 0.16, trimMat, 0.08);
  // 몰딩 (토러스 조각): rotateX(π/2) 후 rotateY(α) → 시작각 φ' = -α
  const torusArc = (r, tube, y, mat) => {
    const g = new THREE.TorusGeometry(r, tube, 8, 120, ARC * 2);
    g.rotateX(Math.PI / 2); g.rotateY(Math.PI / 2 + ARC);
    return mesh(g, mat, { p: [C.x, y, C.z], cast: false, parent: scene });
  };
  torusArc(R - 0.05, 0.035, 1.12, trimMat);
  torusArc(R - 0.06, 0.07, H - 0.06, trimMat);

  // 옆벽·뒷벽 (평면 + 웨인스코팅 + 몰딩)
  const flatWall = (len, x, z, ry) => {
    const g = kit.uv(new THREE.PlaneGeometry(len, H), len / 2.4, H / 2.4);
    mesh(g, wallMat, { p: [x, H / 2, z], r: [0, ry, 0], cast: false, parent: scene });
    const nx = Math.sin(ry), nz = Math.cos(ry);
    mesh(new THREE.BoxGeometry(len, 1.1, 0.06), wainMat, { p: [x + nx * 0.03, 0.55, z + nz * 0.03], r: [0, ry, 0], cast: false, parent: scene });
    mesh(new THREE.BoxGeometry(len, 0.07, 0.1), trimMat, { p: [x + nx * 0.06, 1.12, z + nz * 0.06], r: [0, ry, 0], cast: false, parent: scene });
    mesh(new THREE.BoxGeometry(len, 0.16, 0.1), trimMat, { p: [x + nx * 0.06, 0.08, z + nz * 0.06], r: [0, ry, 0], cast: false, parent: scene });
    mesh(new THREE.BoxGeometry(len, 0.14, 0.16), trimMat, { p: [x + nx * 0.07, H - 0.07, z + nz * 0.07], r: [0, ry, 0], cast: false, parent: scene });
  };
  const sideLen = BACK_Z - ARC_END_Z;
  flatWall(sideLen, -SIDE_X, (BACK_Z + ARC_END_Z) / 2, Math.PI / 2);
  flatWall(sideLen, SIDE_X, (BACK_Z + ARC_END_Z) / 2, -Math.PI / 2);
  flatWall(SIDE_X * 2, 0, BACK_Z, Math.PI);

  // 천장: 따뜻한 흰색
  const ceil = mesh(new THREE.PlaneGeometry(floorW, floorD), std('#fff8ee', 0.95), { p: [0, H, (BACK_Z + C.z - R) / 2], r: [Math.PI / 2, 0, 0], cast: false, parent: scene });
  ceil.receiveShadow = false;

  /* ---------- 옆벽 높은 아치 창 + 햇살 줄기 + 바닥 햇빛 무늬 ---------- */
  const skyMat = new THREE.MeshBasicMaterial({ map: skyWindowTexture(kit), color: new THREE.Color(1.25, 1.25, 1.25) });
  const winShape = (w, h) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); s.lineTo(-w / 2, 0);
    return s;
  };
  const winW = 1.05, winH = 1.9, winY = 2.0;
  const glassGeo = new THREE.ShapeGeometry(winShape(winW, winH), 16);
  { // 창 UV를 0~1로
    const p = glassGeo.attributes.position, u = glassGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) u.setXY(i, p.getX(i) / winW + 0.5, p.getY(i) / winH);
  }
  const outer = winShape(winW + 0.16, winH + 0.08); outer.holes.push(new THREE.Path(winShape(winW, winH).getPoints(24)));
  const frameGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.08, bevelEnabled: false, curveSegments: 16 });
  frameGeo.translate(0, -0.04, 0);
  const muntin = new THREE.BoxGeometry(0.04, winH - 0.05, 0.05), muntinH = new THREE.BoxGeometry(winW, 0.04, 0.05);
  const beamMat = kit.beam('#fff0cc', 0.42);
  const patchMat = new THREE.MeshBasicMaterial({ map: sunPatchTexture(kit), color: '#fff0c9', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const windows = [2.35, 5.05];
  const sunDir = new THREE.Vector3(13, -9.5, -1.2).normalize();
  for (const side of [-1, 1]) {
    for (const wz of windows) {
      const g = new THREE.Group();
      g.position.set(side * (SIDE_X - 0.02), winY, wz);
      g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(new THREE.Mesh(glassGeo, skyMat));
      mesh(frameGeo, trimMat, { parent: g, cast: false });
      mesh(muntin, trimMat, { p: [0, (winH - 0.05) / 2, 0.03], parent: g, cast: false });
      mesh(muntinH, trimMat, { p: [0, winH * 0.55, 0.03], parent: g, cast: false });
      mesh(new THREE.BoxGeometry(winW + 0.3, 0.06, 0.22), trimMat, { p: [0, -0.06, 0.08], parent: g, cast: false });
      scene.add(g);
      if (side < 0) {
        // 햇살 줄기: 창에서 바닥으로 비스듬히
        const start = new THREE.Vector3(-SIDE_X + 0.05, winY + winH * 0.55, wz);
        const t = (0 - start.y) / sunDir.y;
        const end = start.clone().addScaledVector(sunDir, t);
        const len = start.distanceTo(end);
        const bg = new THREE.CylinderGeometry(0.62, 0.95, len, 4, 1, true);
        bg.rotateY(Math.PI / 4);
        const b = new THREE.Mesh(bg, beamMat);
        b.position.copy(start).add(end).multiplyScalar(0.5);
        b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), start.clone().sub(end).normalize());
        b.scale.set(1, 1, 0.7);
        b.renderOrder = 4;
        scene.add(b);
        const pg = new THREE.PlaneGeometry(1.3, 2.6);
        const pm = new THREE.Mesh(pg, patchMat);
        pm.rotation.x = -Math.PI / 2; pm.rotation.z = Math.PI / 2;
        pm.position.set(end.x - 0.2, 0.014, end.z);
        pm.renderOrder = 2;
        scene.add(pm);
      }
    }
  }

  /* ---------- 펜던트 조명 ---------- */
  const shadeGeo = kit.lathe([[0.02, 0.0], [0.07, -0.02], [0.17, -0.14], [0.24, -0.27], [0.25, -0.29]], 40);
  const shadeMat = std('#fff3dd', 0.5, { side: THREE.DoubleSide, emissive: '#ffcf8a', emissiveIntensity: 0.25 });
  const brass = std('#d9b46a', 0.3, { metalness: 1 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.45), toneMapped: false });
  pend.forEach(([x, , z]) => {
    const cordLen = 0.95;
    mesh(new THREE.CylinderGeometry(0.006, 0.006, cordLen, 6), brass, { p: [x, H - cordLen / 2, z], cast: false, parent: scene });
    mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.03, 20), brass, { p: [x, H - 0.015, z], cast: false, parent: scene });
    mesh(shadeGeo, shadeMat, { p: [x, H - cordLen, z], cast: false, parent: scene });
    mesh(new THREE.SphereGeometry(0.055, 16, 12), bulbMat, { p: [x, H - cordLen - 0.2, z], cast: false, parent: scene });
    const gl = kit.glow('#ffe1a8', 1.4, 0.5); gl.position.set(x, H - cordLen - 0.22, z); scene.add(gl);
  });

  /* ---------- 러그 (로즈 베이지, 원단 질감) ---------- */
  const rugGeo = new THREE.CircleGeometry(1, 96);
  rugGeo.setAttribute('uv1', rugGeo.attributes.uv.clone());
  kit.uv(rugGeo, 1); // uv 그대로
  { const u1 = rugGeo.attributes.uv1; for (let i = 0; i < u1.count; i++) u1.setXY(i, u1.getX(i) * 9, u1.getY(i) * 6); }
  rugGeo.rotateX(-Math.PI / 2);
  const rugMat = new THREE.MeshStandardMaterial({ map: rugTexture(kit), normalMap: fleeceN, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.96, envMapIntensity: 0.4 });
  mesh(rugGeo, rugMat, { p: [RUG.x, 0.008, RUG.z], s: [RUG.rx, 1, RUG.rz], cast: false, parent: scene });

  /* ---------- 가운데 작은 원탁 + 꽃병 ---------- */
  const tableG = new THREE.Group(); tableG.position.set(RUG.x, 0, RUG.z);
  const cream = std('#fffaf0', 0.35, { normalMap: woodN, normalScale: new THREE.Vector2(0.2, 0.2) });
  mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.045, 48), cream, { p: [0, 0.74, 0], parent: tableG });
  mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.72, 16), brass, { p: [0, 0.37, 0], parent: tableG });
  mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.03, 32), brass, { p: [0, 0.015, 0], parent: tableG });
  const vaseGeo = kit.lathe([[0, 0], [0.07, 0], [0.11, 0.06], [0.12, 0.13], [0.08, 0.22], [0.05, 0.27], [0.06, 0.3], [0.055, 0.31]], 32);
  mesh(vaseGeo, std('#f7c6d4', 0.25), { p: [0, 0.765, 0], parent: tableG });
  const petals = ['#ffffff', '#ffd1df', '#fff1a8', '#ffc2d4', '#e9dcff', '#ffffff', '#ffd9b8'];
  const stemMat = std('#6aa85a', 0.7);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2, r = 0.05 + (i % 3) * 0.035;
    const tip = new THREE.Vector3(Math.cos(a) * r * 2.2, 1.2 + (i % 4) * 0.05, Math.sin(a) * r * 2.2);
    const base = new THREE.Vector3(0, 1.0, 0);
    const len = tip.distanceTo(base);
    const st = mesh(new THREE.CylinderGeometry(0.004, 0.005, len, 5), stemMat, { parent: tableG, cast: false });
    st.position.copy(tip).add(base).multiplyScalar(0.5);
    st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(base).normalize());
    mesh(new THREE.SphereGeometry(0.04 + (i % 2) * 0.012, 14, 10), std(petals[i % petals.length], 0.6), { p: [tip.x, tip.y, tip.z], s: [1, 0.8, 1], parent: tableG });
  }
  scene.add(tableG);

  /* ---------- 창가 벤치 + 쿠션, 화분, 액자 ---------- */
  const cushionMat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, normalMap: fleeceN, normalScale: new THREE.Vector2(0.8, 0.8) });
  const addUV1 = (g, s = 4) => { g.setAttribute('uv1', g.attributes.uv.clone()); const u = g.attributes.uv1; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * s, u.getY(i) * s); return g; };
  const colliders = [{ type: 'c', x: RUG.x, z: RUG.z, r: 0.62 }];
  for (const side of [-1, 1]) {
    const bx = side * (SIDE_X - 0.36), bz = (windows[0] + windows[1]) / 2;
    const bench = new THREE.Group(); bench.position.set(bx, 0, bz); bench.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    mesh(new THREE.BoxGeometry(1.7, 0.4, 0.5), cream, { p: [0, 0.2, 0], parent: bench });
    mesh(addUV1(new THREE.BoxGeometry(1.62, 0.12, 0.46)), cushionMat(side < 0 ? '#bfe8d6' : '#ffd0dc'), { p: [0, 0.46, 0], parent: bench });
    for (let i = 0; i < 2; i++) {
      const pl = mesh(addUV1(new THREE.SphereGeometry(0.2, 20, 14)), cushionMat(i ? '#fff3c4' : (side < 0 ? '#ffd0dc' : '#d9c9f7')), { p: [-0.5 + i * 0.95, 0.66, -0.12], s: [1, 0.85, 0.42], parent: bench });
      pl.rotation.z = (i ? -1 : 1) * 0.2;
    }
    scene.add(bench);
    colliders.push({ type: 'b', x: bx, z: bz, hx: 0.3, hz: 0.9 });
  }
  const potGeo = kit.lathe([[0, 0], [0.2, 0], [0.24, 0.05], [0.27, 0.42], [0.3, 0.46], [0.28, 0.48]], 32);
  const potMat = std('#f3e2d0', 0.55);
  const leafMat = std('#5fa35a', 0.55, { side: THREE.DoubleSide });
  const leafGeo = new THREE.SphereGeometry(0.16, 12, 8); leafGeo.scale(0.45, 0.06, 1.0); leafGeo.translate(0, 0, 0.15);
  const plantAt = (x, z, s) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
    mesh(potGeo, potMat, { parent: g });
    mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 24), std('#6b5240', 1), { p: [0, 0.44, 0], parent: g, cast: false });
    for (let i = 0; i < 14; i++) {
      const lf = mesh(leafGeo, leafMat, { parent: g });
      lf.position.set(0, 0.5 + (i % 5) * 0.12, 0);
      lf.rotation.set(-0.5 - (i % 3) * 0.3, i * 2.4, 0);
      lf.scale.setScalar(1.2 + (i % 4) * 0.25);
    }
    scene.add(g);
    colliders.push({ type: 'c', x, z, r: 0.42 * s + 0.15 });
  };
  plantAt(-(SIDE_X - 0.55), ARC_END_Z + 0.55, 1.1);
  plantAt(SIDE_X - 0.55, ARC_END_Z + 1.3, 1.0);
  plantAt(-(SIDE_X - 0.55), BACK_Z - 0.55, 1.25);
  plantAt(SIDE_X - 0.55, BACK_Z - 0.55, 1.25);
  const goldFrame = std('#e3c27a', 0.35, { metalness: 0.9 });
  [-3.1, 3.1].forEach((x, i) => {
    const g = new THREE.Group(); g.position.set(x, 2.2, BACK_Z - 0.04); g.rotation.y = Math.PI;
    mesh(new THREE.BoxGeometry(0.86, 1.06, 0.05), goldFrame, { parent: g, cast: false });
    mesh(new THREE.PlaneGeometry(0.72, 0.92), new THREE.MeshStandardMaterial({ map: paintingTexture(kit, i), roughness: 0.8 }), { p: [0, 0, 0.027], parent: g, cast: false });
    scene.add(g);
  });

  /* ---------- 문 6개 (테마 파스텔) + 숨겨진 일곱 번째 문 + 들어온 민트색 문 ---------- */
  const doors = [];
  const doorR = R - 0.33;
  ROOMS.forEach((info, i) => {
    const a = DOOR_ANGLES[i];
    const p = onArc(a, doorR);
    const ajar = 0.12;
    const d = createDoor({ color: info.door, frame: '#fffaf2', glow: '#ffc94d', glowBase: 0.8, ajar, depth: DEPTH, lightZ: -0.2, normalMap: woodN, w: 1.0, h: 2.15 });
    d.group.position.set(p.x, 0, p.z);
    d.group.rotation.y = -a;
    scene.add(d.group);
    const plaque = kit.label(`${info.emoji} ${info.name}`, { w: 0.72, font: 58 });
    plaque.position.set(0, 2.58, 0.1);
    d.group.add(plaque);
    const nx = -Math.sin(a), nz = Math.cos(a);
    doors.push({ door: d, id: info.id, info, label: `들어가기 · ${info.emoji} ${info.name}`, target: info.id, pitch: info.pitch, x: p.x, z: p.z, nx, nz });
  });
  // 숨겨진 일곱 번째 문: 오른쪽 구석, 작고 빛 없는 문
  {
    const a = THREE.MathUtils.degToRad(70.5);
    const p = onArc(a, R - 0.17);
    const d = createDoor({ color: '#efeaff', frame: '#fffaf2', glow: '#d8ccff', glowBase: 0, small: true, depth: 0.2, lightZ: -0.07, normalMap: woodN, w: 0.6, h: 1.28 });
    d.group.position.set(p.x, 0, p.z);
    d.group.rotation.y = -a;
    scene.add(d.group);
    doors.push({
      door: d, id: 'star', info: STAR, label: `들어가기 · ${STAR.emoji}`, target: 'star', pitch: STAR.pitch, bell: true,
      x: p.x, z: p.z, nx: -Math.sin(a), nz: Math.cos(a), seventh: true,
      locked: () => kit.visited.size < 6
    });
  }
  // 등 뒤: 들어온 민트색 문 (밖으로)
  {
    const d = createDoor({ color: '#84d6b8', frame: '#fffaf2', glow: '#e9f6ff', glowBase: 0.5, depth: DEPTH, lightZ: -0.2, normalMap: woodN, w: 1.0, h: 2.12 });
    d.group.position.set(0, 0, BACK_Z - (DEPTH - 0.085));
    d.group.rotation.y = Math.PI;
    scene.add(d.group);
    doors.push({ door: d, id: 'out', label: '밖으로', target: 'meadow', pitch: 1.0, x: 0, z: d.group.position.z, nx: 0, nz: -1 });
  }

  function refreshSeventh() {
    const d = doors.find((x) => x.seventh);
    const open = kit.visited.size >= 6;
    d.door.setColor(open ? '#d8ccff' : '#1e1a2a');
    d.door.setGlow(open ? 0.9 : 0);
    d.door.setGlowNow(open ? 0.9 : 0);
  }
  refreshSeventh();

  /* ---------- 떠다니는 먼지 반짝이 ---------- */
  const dust = kit.particles(scene, { max: 180 });
  let dustT = 0;

  function constrain(p) {
    p.x = clamp(p.x, -SIDE_X + 0.5, SIDE_X - 0.5);
    p.z = Math.min(p.z, BACK_Z - 0.5);
    const dx = p.x - C.x, dz = p.z - C.z;
    const r = Math.hypot(dx, dz), lim = R - 0.82;
    if (dz < 0 && r > lim) { p.x = C.x + dx / r * lim; p.z = C.z + dz / r * lim; }
    for (const c of colliders) {
      if (c.type === 'c') {
        const ex = p.x - c.x, ez = p.z - c.z, d = Math.hypot(ex, ez), m = c.r + 0.25;
        if (d < m && d > 0.0001) { p.x = c.x + ex / d * m; p.z = c.z + ez / d * m; }
      } else {
        const hx = c.hx + 0.25, hz = c.hz + 0.25, ox = hx - Math.abs(p.x - c.x), oz = hz - Math.abs(p.z - c.z);
        if (ox > 0 && oz > 0) { if (ox < oz) p.x = c.x + Math.sign(p.x - c.x || 1) * hx; else p.z = c.z + Math.sign(p.z - c.z || 1) * hz; }
      }
    }
  }

  return {
    id: 'hall', scene, exposure: 1.0, eye: 1.55,
    bloom: { threshold: 1.45, strength: 0.32, radius: 0.45 },
    shadowLight: sun, doors, objects: [],
    spawn(from) {
      const d = doors.find((x) => x.target === from);
      if (d && from !== 'meadow') return { x: d.x + d.nx * 1.55, z: d.z + d.nz * 1.55, yaw: Math.atan2(-d.nx, -d.nz), pitch: -0.04 };
      return { x: 0, z: BACK_Z - 1.15, yaw: 0, pitch: -0.07 };
    },
    enter() { refreshSeventh(); },
    constrain,
    floorAt(x, z) { const a = (x - RUG.x) / RUG.rx, b = (z - RUG.z) / RUG.rz; return a * a + b * b < 1 ? 'carpet' : 'wood'; },
    update(dt, t) {
      beamMat.uniforms.uTime.value = t;
      dustT -= dt;
      if (dustT < 0) {
        dustT = reduced ? 0.4 : 0.13;
        const wz = windows[(Math.random() * 2) | 0] + (Math.random() - 0.5) * 1.2;
        const k = Math.random();
        dust.emit({ x: -SIDE_X + 0.6 + k * 4.6, y: 3.0 - k * 2.4 + (Math.random() - 0.5) * 0.8, z: wz },
          { n: 1, colors: ['#fff4d0', '#ffffff', '#ffe7b0'], speed: 0.05, up: 0.3, gravity: -0.01, drag: 0.1, life: 6, size: 0.022, alpha: 0.9, jitter: 0.2 });
      }
    }
  };
}
