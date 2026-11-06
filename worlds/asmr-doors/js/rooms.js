/* ASMR DOORS — 방 6개 데이터 + 3D 생성 (+ 숨겨진 별빛 방)
   방마다 질감은 2~3종만 쓰고 나머지는 색·러프니스·코드 형태로 표현한다. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createDoor } from './doors.js';
import { ROOM_INFO, STAR_INFO, playObject } from './audio.js';

/* 방별 질감 (장면 하나 2MB 이하) */
const TEX = {
  slime: ['marble_01_diff', 'marble_01_nor_gl', 'beige_wall_001_diff', 'beige_wall_001_nor_gl', 'wood_table_001_diff', 'wood_table_001_nor_gl', 'sand_01_diff'],
  diary: ['herringbone_parquet_diff', 'herringbone_parquet_nor_gl', 'beige_wall_001_diff', 'beige_wall_001_nor_gl', 'wood_table_001_diff', 'wood_table_001_nor_gl'],
  cafe: ['floor_tiles_06_diff', 'floor_tiles_06_nor_gl', 'marble_01_diff', 'marble_01_nor_gl', 'beige_wall_001_diff', 'beige_wall_001_nor_gl', 'wood_table_001_nor_gl'],
  attic: ['roof_planks_diff', 'roof_planks_nor_gl', 'polar_fleece_nor_gl', 'beige_wall_001_diff', 'beige_wall_001_nor_gl', 'wood_table_001_nor_gl'],
  camp: ['sparse_grass_diff', 'wood_table_001_diff', 'wood_table_001_nor_gl', 'polar_fleece_nor_gl'],
  ocean: ['sand_01_diff', 'wood_table_001_nor_gl'],
  star: ['polar_fleece_nor_gl', 'wood_table_001_nor_gl']
};
export const ROOMS = ROOM_INFO.map((r) => Object.assign({}, r, { tex: TEX[r.id] }));
export const STAR = Object.assign({}, STAR_INFO, { tex: TEX.star });

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const portrait = () => window.innerHeight > window.innerWidth;   // 세로 폰: 한 걸음 뒤에서 탁자 전체가 보이게
const sound = (info, id) => playObject(info, info.objects.find((o) => o.id === id)) || 0;

export function buildRoom(kit, info) {
  const B = { slime: buildSlime, diary: buildDiary, cafe: buildCafe, attic: buildAttic, camp: buildCamp, ocean: buildOcean, star: buildStar }[info.id];
  const sc = B(kit, info);
  sc.id = info.id; sc.info = info; sc.isRoom = true; sc.texKeys = info.tex;
  sc.eye = sc.eye || 1.5;
  // 작은 방은 같은 빛이라도 더 밝다 → 방마다 빛·환경광을 낮춰 하얗게 뜨지 않게
  const lk = sc.lightK ?? 0.62, ek = sc.envK ?? 0.5;
  sc.scene.traverse((o) => { if (o.isLight) o.intensity *= lk; });
  kit.envScale(sc.scene, ek);
  return sc;
}

/* ===================================================================== */
/* 공용 조각 */

function addUV1(g, sx = 4, sy = sx) {
  g.setAttribute('uv1', g.attributes.uv.clone());
  const u = g.attributes.uv1;
  for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * sx, u.getY(i) * sy);
  return g;
}
function fleece(kit) {
  const t = kit.tex.get('polar_fleece_nor_gl').clone();
  t.channel = 1; t.needsUpdate = true; t.userData.owned = true;
  return t;
}
/* 회벽: 질감의 밝기 결만 살리고 색은 두 색 사이로 정확히 입힌다 */
function wallMaterial(kit, a, b, stripes) {
  const m = new THREE.MeshStandardMaterial({
    map: kit.tex.get('beige_wall_001_diff'), normalMap: kit.tex.get('beige_wall_001_nor_gl'), normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.92, envMapIntensity: 0.7
  });
  const o = { luma: { a, b, lo: 0.25, hi: 0.75, detail: 0.9 } };
  if (stripes) o.stripes = stripes;
  kit.patch(m, o);
  return m;
}

/* 들어온 문 (방 안쪽에서 본 모습). 탭하면 홀로 */
function backDoor(kit, scene, o) {
  const depth = o.wall ? (o.depth ?? 0.3) : 0.17;
  const d = createDoor({
    color: o.color, frame: o.frame ?? '#fffaf2', glow: o.glow ?? '#ffe3a6', glowBase: o.glowBase ?? 0.3, depth,
    lightZ: o.wall ? -(depth - 0.12) : -0.035, normalMap: kit.tex.get('wood_table_001_nor_gl'), w: o.w ?? 0.98, h: o.h ?? 2.08, small: o.small
  });
  const nx = Math.sin(o.ry), nz = Math.cos(o.ry);
  const off = o.wall ? depth - 0.085 : 0;
  d.group.position.set(o.x + nx * off, 0, o.z + nz * off);
  d.group.rotation.y = o.ry;
  scene.add(d.group);
  return { door: d, back: true, id: 'back', label: '← 홀로', target: 'hall', x: d.group.position.x, z: d.group.position.z, nx, nz };
}

/* 4×4 방 껍데기: 바닥·벽·천장·몰딩·들어온 문 */
function shell(kit, scene, o) {
  const W = o.w ?? 4, D = o.d ?? 4, H = o.h ?? 2.8;
  const fg = kit.uv(new THREE.PlaneGeometry(W, D), W / (o.floorTile ?? 1.2), D / (o.floorTile ?? 1.2));
  fg.rotateX(-Math.PI / 2);
  kit.mesh(fg, o.floorMat, { cast: false, parent: scene });
  const cg = new THREE.PlaneGeometry(W, D); cg.rotateX(Math.PI / 2);
  kit.mesh(cg, o.ceilMat || kit.std('#fffaf3', 0.95), { p: [0, H, 0], cast: false, parent: scene });
  const trim = kit.std(o.trim ?? '#fffaf2', 0.45);
  const walls = [[W, 0, -D / 2, 0], [W, 0, D / 2, Math.PI], [D, -W / 2, 0, Math.PI / 2], [D, W / 2, 0, -Math.PI / 2]];
  walls.forEach(([len, x, z, ry]) => {
    const g = kit.uv(new THREE.PlaneGeometry(len, H), len / (o.wallTile ?? 1.6), H / (o.wallTile ?? 1.6));
    kit.mesh(g, o.wallMat, { p: [x, H / 2, z], r: [0, ry, 0], cast: false, parent: scene });
    const nx = Math.sin(ry), nz = Math.cos(ry);
    if (o.wainMat) kit.mesh(new THREE.BoxGeometry(len, o.wainH, 0.04), o.wainMat, { p: [x + nx * 0.02, o.wainH / 2, z + nz * 0.02], r: [0, ry, 0], cast: false, parent: scene });
    kit.mesh(new THREE.BoxGeometry(len, 0.12, 0.05), trim, { p: [x + nx * 0.045, 0.06, z + nz * 0.045], r: [0, ry, 0], cast: false, parent: scene });
    if (o.wainMat) kit.mesh(new THREE.BoxGeometry(len, 0.045, 0.06), trim, { p: [x + nx * 0.05, o.wainH, z + nz * 0.05], r: [0, ry, 0], cast: false, parent: scene });
    kit.mesh(new THREE.BoxGeometry(len, 0.1, 0.09), trim, { p: [x + nx * 0.045, H - 0.05, z + nz * 0.045], r: [0, ry, 0], cast: false, parent: scene });
  });
  const door = backDoor(kit, scene, { x: 0, z: D / 2, ry: Math.PI, color: o.doorColor, wall: true });
  return { W, D, H, door };
}

/* 창문: 하늘 그라디언트 + 틀 + 커튼 */
function roomWindow(kit, scene, o) {
  const g = new THREE.Group();
  g.position.set(o.x, o.y, o.z); g.rotation.y = o.ry || 0;
  const sky = kit.canvasTex(128, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, o.top || '#8fd0ff'); gr.addColorStop(1, o.bot || '#fff4e0');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    if (o.clouds !== false) {
      c.fillStyle = 'rgba(255,255,255,.75)';
      [[36, 80, 22], [62, 72, 28], [90, 84, 18], [80, 170, 14], [100, 166, 18]].forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); });
    }
    if (o.paint) o.paint(c, w, h);
  });
  const b = o.bright ?? 1.15;
  kit.mesh(new THREE.PlaneGeometry(o.w, o.h), new THREE.MeshBasicMaterial({ map: sky, color: new THREE.Color(b, b, b) }), { p: [0, o.h / 2, 0.005], cast: false, parent: g });
  const fm = kit.std(o.frame || '#fffaf2', 0.4);
  const t = 0.06;
  [[o.w + t * 2, t, 0, -t / 2], [o.w + t * 2, t, 0, o.h + t / 2]].forEach(([w, h, x, y]) => kit.mesh(new THREE.BoxGeometry(w, h, 0.08), fm, { p: [x, y, 0.03], cast: false, parent: g }));
  [[-o.w / 2 - t / 2], [o.w / 2 + t / 2]].forEach(([x]) => kit.mesh(new THREE.BoxGeometry(t, o.h, 0.08), fm, { p: [x, o.h / 2, 0.03], cast: false, parent: g }));
  kit.mesh(new THREE.BoxGeometry(0.03, o.h, 0.04), fm, { p: [0, o.h / 2, 0.03], cast: false, parent: g });
  kit.mesh(new THREE.BoxGeometry(o.w, 0.03, 0.04), fm, { p: [0, o.h * 0.55, 0.03], cast: false, parent: g });
  kit.mesh(new THREE.BoxGeometry(o.w + 0.24, 0.04, 0.16), fm, { p: [0, -0.06, 0.07], cast: false, parent: g });
  if (o.curtain) {
    const cm = new THREE.MeshStandardMaterial({ color: o.curtain, roughness: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
    for (const s of [-1, 1]) {
      const cgeo = new THREE.PlaneGeometry(0.42, o.h + 0.5, 18, 1);
      const p = cgeo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 34) * 0.025 + 0.02);
      cgeo.computeVertexNormals();
      kit.mesh(cgeo, cm, { p: [s * (o.w / 2 + 0.18), o.h / 2 + 0.05, 0.1], cast: false, parent: g });
    }
    kit.mesh(new THREE.CylinderGeometry(0.012, 0.012, o.w + 1.1, 8), kit.std('#d9b46a', 0.3, { metalness: 1 }), { p: [0, o.h + 0.28, 0.12], r: [0, 0, Math.PI / 2], cast: false, parent: g });
  }
  scene.add(g);
  return g;
}

function lights(kit, scene, o) {
  scene.add(new THREE.HemisphereLight(o.sky, o.ground, o.hemi ?? 1));
  const s = kit.shadowLight(o.sunColor || '#fff4e8', o.sun ?? 1.6, o.sunPos, o.sunTarget || [0, 0.8, -0.8], o.size ?? 3.2);
  scene.add(s, s.target);
  const pts = (o.points || []).map(([c, i, x, y, z]) => { const p = new THREE.PointLight(c, i, 0, 2); p.position.set(x, y, z); scene.add(p); return p; });
  return { sun: s, points: pts };
}

function roomConstrain(W, D, colliders, extra) {
  return (p) => {
    p.x = clamp(p.x, -W / 2 + 0.4, W / 2 - 0.4);
    p.z = clamp(p.z, -D / 2 + 0.4, D / 2 - 0.45);
    for (const c of colliders) {
      if (c.r) {
        const ex = p.x - c.x, ez = p.z - c.z, d = Math.hypot(ex, ez), m = c.r + 0.22;
        if (d < m && d > 1e-4) { p.x = c.x + ex / d * m; p.z = c.z + ez / d * m; }
      } else {
        const hx = c.hx + 0.22, hz = c.hz + 0.22, ox = hx - Math.abs(p.x - c.x), oz = hz - Math.abs(p.z - c.z);
        if (ox > 0 && oz > 0) { if (ox < oz) p.x = c.x + Math.sign(p.x - c.x || 1) * hx; else p.z = c.z + Math.sign(p.z - c.z || 1) * hz; }
      }
    }
    if (extra) extra(p);
  };
}

function table(kit, parent, o) {
  const g = new THREE.Group(); g.position.set(o.x, 0, o.z);
  kit.mesh(kit.uv(new THREE.BoxGeometry(o.w, o.t ?? 0.05, o.d), o.w / 1.2, o.d / 1.2), o.top, { p: [0, o.h - (o.t ?? 0.05) / 2, 0], parent: g });
  const lx = o.w / 2 - 0.08, lz = o.d / 2 - 0.08;
  [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]].forEach(([x, z]) => kit.mesh(new THREE.CylinderGeometry(0.025, 0.02, o.h - 0.05, 12), o.leg, { p: [x, (o.h - 0.05) / 2, z], parent: g }));
  parent.add(g);
  return g;
}

function obj(id, center, radius, meshes, tap, extra = {}) { return Object.assign({ id, center, radius, meshes, tap }, extra); }

/* 출렁이는 스프링 (눌림 → 출렁) */
function wobble(kit, m, amt = 0.4, dur = 0.95, base = null) {
  const b = base || m.userData.base || (m.userData.base = m.scale.clone());
  return kit.tween(dur, (k, raw) => {
    const o = Math.exp(-raw * 4.5) * Math.cos(raw * 17);
    m.scale.set(b.x * (1 + amt * 0.65 * o), b.y * (1 - amt * o), b.z * (1 + amt * 0.65 * o));
  }, kit.ease.linear).then(() => m.scale.copy(b));
}
function shake(kit, m, amt = 0.12, dur = 0.7) {
  const r0 = m.rotation.clone();
  return kit.tween(dur, (k, raw) => {
    const e = Math.exp(-raw * 4) * Math.sin(raw * 38);
    m.rotation.z = r0.z + e * amt; m.rotation.x = r0.x + e * amt * 0.5;
  }, kit.ease.linear).then(() => m.rotation.copy(r0));
}

/* 불꽃 셰이더 (모닥불·촛불) */
function fireMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBoost: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime, uBoost; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float ns(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1.,0.)), f.x), mix(h(i+vec2(0.,1.)), h(i+vec2(1.,1.)), f.x), f.y); }
      void main(){
        vec2 uv = vUv; uv.x -= 0.5;
        float n = ns(vec2(uv.x*4.0, uv.y*3.0 - uTime*2.4))*0.6 + ns(vec2(uv.x*9.0, uv.y*7.0 - uTime*4.2))*0.4;
        float w = 0.42*(1.0 - uv.y*0.9) + 0.02;
        float shape = 1.0 - smoothstep(w*0.55, w, abs(uv.x + (n-0.5)*0.22*uv.y));
        float f = shape * smoothstep(0.0, 0.12, uv.y) * smoothstep(1.0, 0.35, uv.y + (1.0-n)*0.35);
        f *= (0.75 + n*0.6) * (1.0 + uBoost*0.6);
        vec3 col = mix(vec3(1.0,0.28,0.04), vec3(1.0,0.72,0.24), clamp(f*1.3, 0.0, 1.0));
        col = mix(col, vec3(1.0,0.96,0.82), clamp((f-0.75)*2.5, 0.0, 1.0));
        gl_FragColor = vec4(col * f * 2.2, 1.0);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false
  });
}

/* 별 (점) */
function starPoints(n, radius, upperOnly = true, sizeMul = 1) {
  const pos = new Float32Array(n * 3), sz = new Float32Array(n), ph = new Float32Array(n), col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    let y = Math.random(); if (!upperOnly) y = y * 2 - 1; else y = 0.06 + y * 0.94;
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(a) * r * radius; pos[i * 3 + 1] = y * radius; pos[i * 3 + 2] = Math.sin(a) * r * radius;
    sz[i] = (Math.random() < 0.08 ? 3.2 : 1.2 + Math.random() * 1.6) * sizeMul; ph[i] = Math.random() * 6.28;
    c.setHSL(0.58 + Math.random() * 0.12, 0.4, 0.85 + Math.random() * 0.15);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPR: { value: Math.min(2, window.devicePixelRatio || 1) }, uBright: { value: 1 } },
    vertexShader: `attribute float aSize; attribute float aPh; attribute vec3 aCol; uniform float uTime, uPR; varying float vA; varying vec3 vC;
      void main(){ vA = 0.55 + 0.45 * sin(uTime * (1.2 + fract(aPh) * 2.0) + aPh * 7.0); vC = aCol;
        gl_PointSize = aSize * uPR * (0.8 + 0.4 * vA); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uBright; varying float vA; varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(vC * a * vA * 1.6 * uBright, 1.0);
      #include <colorspace_fragment>
    }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

/* ===================================================================== */
/* 🫧 1. 슬라임 공방 — 파스텔 핑크·라벤더 작업대, 유리병, 반짝이 */
function buildSlime(kit, info) {
  const { tex, mesh, std } = kit;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f3e8ff');
  scene.environment = kit.roomEnv;
  const marbleD = tex.get('marble_01_diff'), marbleN = tex.get('marble_01_nor_gl');
  const floorMat = new THREE.MeshStandardMaterial({ map: marbleD, normalMap: marbleN, roughness: 0.2 });
  kit.patch(floorMat, { luma: { a: '#dcc3e6', b: '#fbf1fb', lo: 0.25, hi: 0.6, detail: 0.85 } });
  const wallMat = wallMaterial(kit, '#e3d3fb', '#f3eaff');
  const wainMat = std('#ffd6e5', 0.55, { normalMap: tex.get('wood_table_001_nor_gl'), normalScale: new THREE.Vector2(0.2, 0.2) });
  const sh = shell(kit, scene, { floorMat, wallMat, wainMat, wainH: 0.95, doorColor: info.door, floorTile: 1.3 });
  const L = lights(kit, scene, {
    sky: '#f8eeff', ground: '#ffd9e8', hemi: 1.05, sunColor: '#fff3f7', sun: 1.9, sunPos: [-2.6, 4.2, 1.2],
    points: [['#ffc2e0', 1.6, -1.1, 2.3, -1.2], ['#fff1dc', 5, 0.5, 2.5, 0.2]]
  });
  roomWindow(kit, scene, { x: -1.98, y: 1.0, z: -0.3, ry: Math.PI / 2, w: 0.95, h: 1.15, top: '#a8d8ff', bot: '#ffe3f0', curtain: '#ffd1e4' });

  // 작업대
  const top = new THREE.MeshStandardMaterial({ map: marbleD, normalMap: marbleN, roughness: 0.14 });
  kit.patch(top, { luma: { a: '#e9dcef', b: '#ffffff', lo: 0.25, hi: 0.6, detail: 0.9 } });
  table(kit, scene, { x: 0, z: -0.85, w: 1.75, d: 0.72, h: 0.8, top, leg: std('#f5b8d0', 0.4) });
  const TY = 0.8;
  // 선반 + 유리병
  const shelfMat = new THREE.MeshStandardMaterial({ color: '#fff3f7', normalMap: tex.get('wood_table_001_nor_gl'), normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.45 });
  [1.45, 1.86].forEach((y) => mesh(new THREE.BoxGeometry(1.5, 0.035, 0.24), shelfMat, { p: [0, y, -1.86], parent: scene }));
  const glassMat = kit.phys({ color: '#ffffff', roughness: 0.06, transparent: true, opacity: 0.32, clearcoat: 1, envMapIntensity: 1.3 });
  const jarGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.16, 24), lidGeo = new THREE.CylinderGeometry(0.064, 0.064, 0.03, 24), fillGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.09, 24);
  const jarCols = ['#ffb3d1', '#a6eadf', '#d6c2ff', '#fff0a6', '#bde0ff', '#ffc9a6', '#c9f2b9'];
  for (let i = 0; i < 9; i++) {
    const y = i < 5 ? 1.47 : 1.88, x = i < 5 ? -0.56 + i * 0.28 : -0.42 + (i - 5) * 0.28;
    const c = jarCols[i % jarCols.length];
    mesh(fillGeo, kit.phys({ color: c, roughness: 0.2, clearcoat: 1, emissive: c, emissiveIntensity: 0.12 }), { p: [x, y + 0.065, -1.86], parent: scene });
    mesh(jarGeo, glassMat, { p: [x, y + 0.098, -1.86], parent: scene, cast: false });
    mesh(lidGeo, std(pick(['#ffffff', '#f7b6cf', '#cbb6f4']), 0.4), { p: [x, y + 0.19, -1.86], parent: scene });
  }
  // 네온 하트 (벽)
  const hp = [];
  for (let i = 0; i <= 64; i++) { const t = i / 64 * Math.PI * 2; hp.push(V(16 * Math.pow(Math.sin(t), 3) * 0.012, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 0.012, 0)); }
  const neon = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp, true), 120, 0.009, 8, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.9, 1.6), toneMapped: false }), { p: [0.95, 2.35, -1.96], cast: false, parent: scene });
  const neonGlow = kit.glow('#ff8fc8', 0.9, 0.45); neonGlow.position.set(0.95, 2.33, -1.9); scene.add(neonGlow);

  const objects = [], fx = kit.particles(scene, { max: 220 });

  /* 동그란 슬라임 덩어리 */
  const plateGeo = kit.lathe([[0, 0], [0.16, 0], [0.18, 0.012], [0.185, 0.02]], 40);
  mesh(plateGeo, std('#ffffff', 0.25), { p: [-0.58, TY, -0.78], parent: scene });
  const blob = mesh(new THREE.SphereGeometry(0.13, 48, 32), kit.phys({ color: '#a8eadc', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.6, sheenColor: new THREE.Color('#ffffff') }), { p: [-0.58, TY + 0.012, -0.78], s: [1, 0.6, 1], parent: scene });
  blob.geometry.translate(0, 0.12, 0);
  const sparkleIn = kit.particles(scene, { max: 30 });
  objects.push(obj('blob', V(-0.58, TY + 0.08, -0.78), 0.15, [blob], () => {
    sound(info, 'blob');
    const b = blob.userData.base || (blob.userData.base = blob.scale.clone());
    kit.tween(0.1, (k) => blob.scale.set(b.x * (1 + 0.3 * k), b.y * (1 - 0.42 * k), b.z * (1 + 0.3 * k)), kit.ease.out)
      .then(() => wobble(kit, blob, 0.42, 1.0, b));
    fx.emit(V(-0.58, TY + 0.06, -0.78), { n: 10, colors: ['#a8eadc', '#ffffff', '#ffc6dc'], speed: 0.5, up: 0.8, size: 0.018, life: 0.7, gravity: -1.2 });
  }));

  /* 쭉 늘어나는 슬라임 */
  const strMat = kit.phys({ color: '#ffadc9', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.5, sheenColor: new THREE.Color('#fff0f6') });
  mesh(new THREE.BoxGeometry(0.36, 0.012, 0.18), std('#ffffff', 0.3), { p: [-0.16, TY + 0.006, -0.93], parent: scene });
  const str = mesh(new THREE.CapsuleGeometry(0.05, 0.12, 10, 24), strMat, { p: [-0.16, TY + 0.06, -0.93], r: [0, 0, Math.PI / 2], s: [1, 1, 0.85], parent: scene });
  let strBusy = false;
  objects.push(obj('stretch', V(-0.16, TY + 0.06, -0.93), 0.14, [str], () => {
    const d = sound(info, 'stretch');
    fx.emit(V(-0.16, TY + 0.08, -0.93), { n: 6, colors: ['#ffadc9', '#fff2a6', '#ffffff'], speed: 0.35, up: 0.8, size: 0.016, life: 0.8 });
    if (strBusy) return;
    strBusy = true;
    const dur = clamp(d || 2, 1.4, 2.6);
    kit.tween(dur, (k, raw) => {
      const s = Math.sin(Math.PI * Math.min(1, raw * 1.05));
      const pull = 1 + 2.1 * s;
      str.scale.set(1 / Math.sqrt(1 + 0.9 * s), pull, 0.85 / Math.sqrt(1 + 0.9 * s));
      str.position.y = TY + 0.06 + 0.04 * s;
    }, kit.ease.linear).then(() => { str.scale.set(1, 1, 0.85); str.position.y = TY + 0.06; strBusy = false; wobble(kit, str, 0.12, 0.6); });
  }));

  /* 키네틱 샌드 + 칼 */
  const sandMat = new THREE.MeshStandardMaterial({ map: tex.get('sand_01_diff'), roughness: 1 });
  kit.patch(sandMat, { luma: { a: '#9f86d6', b: '#e8dcff', lo: 0.06, hi: 0.32, detail: 0.7 } });
  const tray = new THREE.Group(); tray.position.set(0.32, TY, -0.78); scene.add(tray);
  mesh(new THREE.BoxGeometry(0.4, 0.02, 0.26), std('#ffffff', 0.35), { p: [0, 0.01, 0], parent: tray });
  [[0, 0.03, 0.125, 0.4, 0.04, 0.012], [0, 0.03, -0.125, 0.4, 0.04, 0.012], [0.195, 0.03, 0, 0.012, 0.04, 0.26], [-0.195, 0.03, 0, 0.012, 0.04, 0.26]]
    .forEach(([x, y, z, w, h, d]) => mesh(new THREE.BoxGeometry(w, h, d), std('#ffffff', 0.35), { p: [x, y, z], parent: tray }));
  const FULL = 0.27, X0 = -0.15, SW = 0.042;
  const blockGeo = kit.uv(new THREE.BoxGeometry(1, 0.12, 0.15), 0.6, 0.3); blockGeo.translate(0.5, 0.06, 0);
  const block = mesh(blockGeo, sandMat, { p: [X0, 0.02, 0], s: [FULL, 1, 1], parent: tray });
  const knife = new THREE.Group(); knife.visible = false; tray.add(knife);
  mesh(new THREE.BoxGeometry(0.004, 0.11, 0.17), std('#eef2f7', 0.15, { metalness: 1 }), { p: [0, 0.055, 0], parent: knife });
  mesh(new THREE.BoxGeometry(0.02, 0.03, 0.22), std('#ffb3cf', 0.4), { p: [0, 0.12, 0], parent: knife });
  let cuts = 0, width = FULL;
  objects.push(obj('sand', V(0.3, TY + 0.08, -0.78), 0.17, [tray], () => {
    sound(info, 'sand');
    if (cuts >= 5) {
      cuts = 0; const w0 = width; width = FULL;
      kit.tween(0.45, (k) => { block.scale.x = w0 + (FULL - w0) * k; }, kit.ease.out);
      fx.emit(V(0.32, TY + 0.1, -0.78), { n: 14, colors: ['#e8dcff', '#ffffff', '#c7b3f5'], speed: 0.6, up: 1, size: 0.016, life: 0.8 });
      return;
    }
    cuts++;
    const nw = width - SW; width = nw;
    const cx = X0 + nw;
    knife.visible = true; knife.position.set(cx, 0.17, 0);
    kit.tween(0.2, (k) => { knife.position.y = 0.17 - 0.16 * k; }, kit.ease.in).then(() => {
      block.scale.x = nw;
      const slice = mesh(kit.uv(new THREE.BoxGeometry(SW, 0.12, 0.15), 0.1, 0.3), sandMat, { p: [cx + SW / 2, 0.08, 0], parent: tray });
      slice.geometry.translate(0, 0.0, 0);
      fx.emit(V(0.32 + cx, TY + 0.06, -0.78), { n: 8, colors: ['#c7b3f5', '#e8dcff'], speed: 0.4, up: 0.5, size: 0.012, life: 0.6, gravity: -2, additive: false });
      kit.tween(0.55, (k) => { slice.rotation.z = -1.35 * k; slice.position.x = cx + SW / 2 + 0.05 * k; slice.position.y = 0.08 - 0.02 * k; }, kit.ease.in)
        .then(() => kit.wait(0.6)).then(() => { tray.remove(slice); slice.geometry.dispose(); });
      kit.tween(0.22, (k) => { knife.position.y = 0.01 + 0.17 * k; }, kit.ease.out).then(() => { knife.visible = false; });
    });
  }));

  /* 뽁뽁이 시트 */
  const wrap = new THREE.Group(); wrap.position.set(0.68, TY + 0.004, -0.8); scene.add(wrap);
  const sheet = mesh(new THREE.BoxGeometry(0.3, 0.004, 0.36), kit.phys({ color: '#ffffff', transparent: true, opacity: 0.55, roughness: 0.25 }), { parent: wrap, cast: false });
  const COLS = 5, ROWS = 6, NB = COLS * ROWS;
  const bub = new THREE.InstancedMesh(new THREE.SphereGeometry(0.024, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    kit.phys({ color: '#ffffff', transparent: true, opacity: 0.6, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.6 }), NB);
  bub.castShadow = true;
  wrap.add(bub);
  const popped = new Array(NB).fill(false);
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  const cellPos = (i) => V(-0.11 + (i % COLS) * 0.055, 0.002, -0.14 + Math.floor(i / COLS) * 0.056);
  function setBubble(i, flat) {
    pv.copy(cellPos(i)); sv.set(flat ? 1.12 : 1, flat ? 0.12 : 0.62, flat ? 1.12 : 1);
    m4.compose(pv, q0, sv); bub.setMatrixAt(i, m4);
    bub.setColorAt(i, new THREE.Color(flat ? '#e8e2f2' : '#ffffff'));
    bub.instanceMatrix.needsUpdate = true; if (bub.instanceColor) bub.instanceColor.needsUpdate = true;
  }
  for (let i = 0; i < NB; i++) setBubble(i, false);
  let refilling = false;
  objects.push(obj('wrap', V(0.68, TY + 0.03, -0.8), 0.19, [wrap], (hit) => {
    if (refilling) return;
    let idx = hit && hit.object === bub && hit.instanceId != null ? hit.instanceId : -1;
    if (idx < 0 || popped[idx]) {
      const lp = hit ? wrap.worldToLocal(hit.point.clone()) : V(0, 0, 0);
      let bd = 1e9; idx = -1;
      for (let i = 0; i < NB; i++) { if (popped[i]) continue; const d = cellPos(i).distanceTo(lp); if (d < bd) { bd = d; idx = i; } }
    }
    if (idx < 0) return;
    popped[idx] = true; setBubble(idx, true);
    sound(info, 'wrap');
    const wp = wrap.localToWorld(cellPos(idx));
    fx.emit(wp, { n: 5, colors: ['#ffffff', '#e9f6ff'], speed: 0.4, up: 0.9, size: 0.012, life: 0.4, gravity: -1 });
    if (popped.every(Boolean)) {
      refilling = true;
      kit.wait(0.45).then(() => kit.tween(0.35, (k) => { wrap.scale.setScalar(1 - k * 0.9); wrap.position.x = 0.68 + 0.25 * k; }, kit.ease.in))
        .then(() => { for (let i = 0; i < NB; i++) { popped[i] = false; setBubble(i, false); } return kit.tween(0.4, (k) => { wrap.scale.setScalar(0.1 + 0.9 * k); wrap.position.x = 0.93 - 0.25 * k; }, kit.ease.out); })
        .then(() => { refilling = false; });
    }
  }));

  let glitT = 0;
  return {
    scene, exposure: 1.0, shadowLight: L.sun, doors: [sh.door], objects,
    bloom: { threshold: 1.35, strength: 0.3 },
    spawn: () => (portrait() ? { x: 0, z: 1.05, yaw: 0, pitch: -0.34 } : { x: 0, z: 0.5, yaw: 0, pitch: -0.44 }),
    constrain: roomConstrain(4, 4, [{ x: 0, z: -0.85, hx: 0.88, hz: 0.36 }]),
    floorAt: () => 'tile',
    update(dt, t) {
      neonGlow.material.opacity = 0.38 + 0.08 * Math.sin(t * 3.1);
      glitT -= dt;
      if (glitT < 0 && !kit.reduced) {
        glitT = 0.25;
        sparkleIn.emit(V(rand(-1.4, 1.4), rand(1.0, 2.3), rand(-1.6, 0.4)), { n: 1, colors: ['#fff6c8', '#ffd6ec', '#e3d4ff'], speed: 0.05, up: 0.2, gravity: -0.02, drag: 0.2, life: 3, size: 0.02 });
      }
    },
    dispose() { fx.dispose(); sparkleIn.dispose(); }
  };
}

/* ===================================================================== */
/* ✏️ 2. 다꾸 책상 — 따뜻한 원목 책상, 스탠드 조명, 펼친 다이어리 */
const PW = 0.58, PD = 0.39, CW = 1024, CH = 688;
function paperBase(g) {
  g.fillStyle = '#fffdf6'; g.fillRect(0, 0, CW, CH);
  const sp = g.createLinearGradient(CW / 2 - 70, 0, CW / 2 + 70, 0);
  sp.addColorStop(0, 'rgba(120,90,60,0)'); sp.addColorStop(0.5, 'rgba(120,90,60,.16)'); sp.addColorStop(1, 'rgba(120,90,60,0)');
  g.fillStyle = sp; g.fillRect(CW / 2 - 70, 0, 140, CH);
  g.strokeStyle = 'rgba(140,170,210,.35)'; g.lineWidth = 2;
  for (let y = 110; y < CH - 30; y += 34) { g.beginPath(); g.moveTo(40, y); g.lineTo(CW / 2 - 40, y); g.moveTo(CW / 2 + 40, y); g.lineTo(CW - 40, y); g.stroke(); }
  g.fillStyle = 'rgba(210,140,160,.55)'; g.font = '600 30px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  g.fillText('11 . 07', 52, 72);
  g.fillStyle = 'rgba(150,170,120,.6)'; g.fillText('today ♡', CW / 2 + 52, 72);
}
function heartPath(cx, cy, s) { const p = []; for (let i = 0; i <= 60; i++) { const t = i / 60 * Math.PI * 2; p.push([cx + 16 * Math.pow(Math.sin(t), 3) * s, cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s]); } return p; }
function starPath(cx, cy, r) { const p = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return p; }
function loopPath(cx, cy, len) { const p = []; for (let i = 0; i <= 90; i++) { const t = i / 90; p.push([cx - len / 2 + t * len + Math.cos(t * 26) * 16, cy + Math.sin(t * 26) * 16]); } return p; }
function wavePath(cx, cy, len) { const p = []; for (let i = 0; i <= 60; i++) { const t = i / 60; p.push([cx - len / 2 + t * len, cy + Math.sin(t * Math.PI * 4) * 14]); } return p; }
function flowerPath(cx, cy, r) { const p = []; for (let i = 0; i <= 120; i++) { const a = i / 120 * Math.PI * 2, rr = r * Math.abs(Math.cos(a * 2.5)) + r * 0.15; p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return p; }

function buildDiary(kit, info) {
  const { tex, mesh, std } = kit;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#fbf1e2');
  scene.environment = kit.roomEnv;
  const woodD = tex.get('wood_table_001_diff'), woodN = tex.get('wood_table_001_nor_gl');
  const floorMat = new THREE.MeshStandardMaterial({ map: tex.get('herringbone_parquet_diff'), normalMap: tex.get('herringbone_parquet_nor_gl'), color: new THREE.Color(1.05, 0.95, 0.84), roughness: 0.5 });
  const wallMat = wallMaterial(kit, '#eef0dc', '#fbfbef', { freq: 6, tint: '#d6e8c4', amt: 0.6 });
  const wainMat = std('#fff6e6', 0.5, { normalMap: woodN, normalScale: new THREE.Vector2(0.2, 0.2) });
  const sh = shell(kit, scene, { floorMat, wallMat, wainMat, wainH: 0.85, doorColor: info.door, floorTile: 1.5 });
  const L = lights(kit, scene, {
    sky: '#fff3e2', ground: '#d9c09c', hemi: 0.95, sunColor: '#ffd6a4', sun: 1.8, sunPos: [1.4, 3.2, -3.4], sunTarget: [0, 0.7, -0.6],
    points: [['#ffcf8a', 0.45, -0.5, 1.2, -0.98], ['#fff1dc', 3.0, 0.3, 2.4, 0.6]]
  });
  roomWindow(kit, scene, { x: 0.2, y: 1.18, z: -1.98, w: 1.05, h: 0.95, top: '#b9c6ff', bot: '#ffd2a8', curtain: '#f3f7e8', bright: 1.2 });

  const deskTop = new THREE.MeshStandardMaterial({ map: woodD, normalMap: woodN, color: new THREE.Color(1.6, 1.42, 1.28), roughness: 0.42 });
  const TY = 0.78;
  table(kit, scene, { x: 0, z: -0.88, w: 1.65, d: 0.74, h: TY, top: deskTop, leg: deskTop });
  mesh(new THREE.BoxGeometry(0.42, 0.18, 0.66), deskTop, { p: [0.55, TY - 0.14, -0.88], parent: scene });
  mesh(new THREE.SphereGeometry(0.014, 12, 8), std('#e3c27a', 0.3, { metalness: 1 }), { p: [0.55, TY - 0.14, -0.54], parent: scene });

  // 스탠드 조명
  const lamp = new THREE.Group(); lamp.position.set(-0.64, TY, -1.08); scene.add(lamp);
  const sage = std('#a9c99a', 0.45), brassM = std('#e1c48a', 0.3, { metalness: 1 });
  mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.025, 24), sage, { p: [0, 0.012, 0], parent: lamp });
  const arm = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.42, 8), brassM, { p: [0.03, 0.22, 0.02], r: [0.15, 0, -0.15], parent: lamp });
  arm.castShadow = true;
  const shadeG = kit.lathe([[0.02, 0], [0.05, -0.01], [0.11, -0.1], [0.12, -0.12]], 32);
  mesh(shadeG, std('#b8d6a8', 0.5, { side: THREE.DoubleSide, emissive: '#ffd59a', emissiveIntensity: 0.15 }), { p: [0.1, 0.45, 0.07], r: [0.35, 0, -0.5], parent: lamp });
  mesh(new THREE.SphereGeometry(0.03, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 1.2), toneMapped: false }), { p: [0.13, 0.39, 0.09], cast: false, parent: lamp });
  const lampGlow = kit.glow('#ffd79a', 0.55, 0.55); lampGlow.position.set(-0.51, TY + 0.38, -0.99); scene.add(lampGlow);
  // 펜 꽂이 머그 + 책 + 작은 화분
  mesh(kit.lathe([[0, 0], [0.045, 0], [0.05, 0.1], [0.046, 0.1], [0.041, 0.006], [0, 0.006]], 28), std('#ffd3dd', 0.35), { p: [0.66, TY, -1.12], parent: scene });
  ['#7fb0ff', '#ff9fb8', '#ffd36e'].forEach((c, i) => mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.17, 6), std(c, 0.4), { p: [0.65 + i * 0.012, TY + 0.13, -1.12 + (i - 1) * 0.01], r: [(i - 1) * 0.15, 0, (i - 1) * 0.12], parent: scene }));
  ['#c9b6e9', '#f6c3a8', '#a8d4c8'].forEach((c, i) => mesh(new THREE.BoxGeometry(0.2, 0.035, 0.27), std(c, 0.6), { p: [0.05 + i * 0.006, TY + 0.018 + i * 0.036, -1.16], r: [0, (i - 1) * 0.08, 0], parent: scene }));
  mesh(kit.lathe([[0, 0], [0.04, 0], [0.05, 0.06], [0.048, 0.065]], 20), std('#f3e2d0', 0.6), { p: [0.32, TY, -1.12], parent: scene });
  for (let i = 0; i < 6; i++) mesh(new THREE.SphereGeometry(0.022, 10, 8), std('#7fbf7a', 0.6), { p: [0.32 + Math.cos(i) * 0.02, TY + 0.075 + (i % 2) * 0.02, -1.12 + Math.sin(i) * 0.02], s: [1, 1.4, 1], parent: scene });

  /* 다이어리 (펼친 상태) — 페이지는 캔버스 텍스처 */
  const diary = new THREE.Group(); diary.position.set(-0.04, TY, -0.82); diary.rotation.y = 0.04; scene.add(diary);
  mesh(new THREE.BoxGeometry(PW + 0.04, 0.016, PD + 0.03), std('#e8a9b8', 0.6), { p: [0, 0.008, 0], parent: diary });
  const pageCanvas = document.createElement('canvas'); pageCanvas.width = CW; pageCanvas.height = CH;
  const pg = pageCanvas.getContext('2d');
  const committed = document.createElement('canvas'); committed.width = CW; committed.height = CH;
  const cg = committed.getContext('2d');
  paperBase(cg); pg.drawImage(committed, 0, 0);
  const pageTex = new THREE.CanvasTexture(pageCanvas); pageTex.colorSpace = THREE.SRGBColorSpace; pageTex.anisotropy = 8; pageTex.userData.owned = true;
  const pageGeo = new THREE.PlaneGeometry(PW, PD, 24, 1);
  const pageY = (x) => 0.006 + 0.016 * Math.sin(Math.PI * Math.min(1, Math.abs(x) / (PW / 2)) * 0.5 + 0.0) * (1 - Math.abs(x) / (PW / 2) * 0.55) + (Math.abs(x) < 0.01 ? -0.004 : 0);
  { const p = pageGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, pageY(p.getX(i))); pageGeo.computeVertexNormals(); }
  pageGeo.rotateX(-Math.PI / 2);
  const pages = mesh(pageGeo, new THREE.MeshStandardMaterial({ map: pageTex, roughness: 0.85 }), { p: [0, 0.018, 0], parent: diary });
  pages.castShadow = false;
  const toLocal = (px, py) => V((px / CW - 0.5) * PW, 0.018 + pageY((px / CW - 0.5) * PW) + 0.003, (py / CH - 0.5) * PD);
  const anims = new Set();
  let dirty = false;
  function startAnim(dur, draw) {
    return new Promise((res) => anims.add({ t: 0, dur, draw, res }));
  }

  // 페이지 모서리 (넘기기)
  const cornerShape = new THREE.Shape(); cornerShape.moveTo(0, 0); cornerShape.lineTo(-0.05, 0); cornerShape.lineTo(0, 0.05); cornerShape.closePath();
  const cornerGeo = new THREE.ShapeGeometry(cornerShape); cornerGeo.rotateX(-Math.PI / 2);
  const corner = mesh(cornerGeo, std('#f3ead8', 0.8, { side: THREE.DoubleSide }), { p: [PW / 2 - 0.004, 0.032, PD / 2 - 0.004], r: [0, 0, 0.25], parent: diary });
  const cornerHit = mesh(new THREE.BoxGeometry(0.14, 0.04, 0.12), new THREE.MeshBasicMaterial(), { p: [PW / 2 - 0.05, 0.03, PD / 2 - 0.05], parent: diary, cast: false });
  cornerHit.visible = false;
  const flipGeo = new THREE.PlaneGeometry(PW / 2, PD, 12, 1); flipGeo.translate(PW / 4, 0, 0); flipGeo.rotateX(-Math.PI / 2);
  const flipPage = mesh(flipGeo, std('#fffcf2', 0.85, { side: THREE.DoubleSide }), { p: [0, 0.03, 0], parent: diary });
  flipPage.visible = false;
  let flipping = false;

  // 마스킹테이프 롤
  const tapeCols = ['#ffb7c9', '#a9dcff', '#c8f0b6', '#ffe08a', '#d9c6ff', '#ffc8a6'];
  const roll = new THREE.Group(); roll.position.set(-0.56, TY + 0.048, -0.62); roll.rotation.y = 0.4; scene.add(roll);
  const rollMat = std('#ffb7c9', 0.6);
  mesh(new THREE.TorusGeometry(0.034, 0.014, 14, 36), rollMat, { r: [0, 0, 0], s: [1, 1, 1.6], parent: roll });
  mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.044, 24, 1, true), std('#e8d2b0', 0.8, { side: THREE.DoubleSide }), { r: [Math.PI / 2, 0, 0], parent: roll });
  const rollHit = mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial(), { parent: roll, cast: false }); rollHit.visible = false;

  // 연필
  const pencil = new THREE.Group(); scene.add(pencil);
  const pbody = new THREE.Group(); pencil.add(pbody);
  mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.15, 6), std('#ffd66b', 0.45), { p: [0, 0.1, 0], parent: pbody });
  mesh(new THREE.ConeGeometry(0.0075, 0.025, 6), std('#f2d4ad', 0.7), { p: [0, 0.0125, 0], r: [Math.PI, 0, 0], parent: pbody });
  mesh(new THREE.ConeGeometry(0.0028, 0.008, 6), std('#4b4650', 0.5), { p: [0, 0.003, 0], r: [Math.PI, 0, 0], parent: pbody });
  mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.014, 12), std('#d8dbe2', 0.3, { metalness: 1 }), { p: [0, 0.182, 0], parent: pbody });
  mesh(new THREE.CylinderGeometry(0.0078, 0.0078, 0.016, 12), std('#ff9fb8', 0.7), { p: [0, 0.197, 0], parent: pbody });
  const restPos = V(0.42, TY + 0.008, -0.6), restQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.5, Math.PI / 2 - 0.02, 'YXZ'));
  // 누운 연필은 끝(촉)이 원점 → 몸통이 +y로 뻗어 있으므로 Z축 회전으로 눕힌다
  pencil.position.copy(restPos); pencil.quaternion.copy(restQ);
  const pencilHit = mesh(new THREE.BoxGeometry(0.22, 0.05, 0.06), new THREE.MeshBasicMaterial(), { p: [0.34, TY + 0.02, -0.56], r: [0, 0.5, 0], parent: scene, cast: false });
  pencilHit.visible = false;
  const drawQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0.3, -0.25, 'YXZ'));
  let drawing = false;

  // 스티커 시트
  const stickerTex = kit.canvasTex(256, 340, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,.06)'; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12);
    const draws = [['heart', '#ff9fbf'], ['star', '#ffd66b'], ['cloud', '#a9d8ff'], ['heart', '#c9b2ff'], ['star', '#9fe0c4'], ['cloud', '#ffc8d8']];
    draws.forEach(([k, c], i) => drawSticker(g, k, c, 64 + (i % 2) * 128, 66 + Math.floor(i / 2) * 104, 1.0));
  });
  const stickerSheet = mesh(new THREE.BoxGeometry(0.13, 0.003, 0.17), [std('#ffffff', 0.5), std('#ffffff', 0.5), new THREE.MeshStandardMaterial({ map: stickerTex, roughness: 0.4 }), std('#ffffff', 0.5), std('#ffffff', 0.5), std('#ffffff', 0.5)],
    { p: [0.58, TY + 0.003, -0.9], r: [0, -0.2, 0], parent: scene });

  function drawSticker(g, kind, color, x, y, s) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = '#ffffff'; g.fillStyle = color;
    g.shadowColor = 'rgba(0,0,0,.12)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
    g.beginPath();
    if (kind === 'heart') { heartPath(0, 0, 2.3).forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); }
    else if (kind === 'star') { starPath(0, 0, 38).forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); }
    else { g.arc(-16, 6, 18, Math.PI * 0.5, Math.PI * 1.5); g.arc(0, -8, 22, Math.PI, 0); g.arc(20, 4, 16, Math.PI * 1.5, Math.PI * 0.5); g.closePath(); }
    g.closePath(); g.stroke(); g.shadowColor = 'transparent'; g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(-10, -10, 6, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  function drawTape(g, tp, k) {
    g.save(); g.translate(tp.x, tp.y); g.rotate(tp.a);
    const len = tp.len * k;
    g.beginPath(); g.moveTo(0, -tp.w / 2);
    for (let i = 0; i <= 6; i++) g.lineTo((i % 2) * 5, -tp.w / 2 + i * tp.w / 6);
    g.lineTo(len, tp.w / 2);
    if (k >= 1) for (let i = 6; i >= 0; i--) g.lineTo(len - (i % 2) * 5, -tp.w / 2 + i * tp.w / 6);
    else g.lineTo(len, -tp.w / 2);
    g.closePath(); g.clip();
    g.globalAlpha = 0.82; g.fillStyle = tp.c; g.fillRect(-10, -tp.w, len + 20, tp.w * 2);
    g.globalAlpha = 0.5; g.fillStyle = '#ffffff';
    if (tp.pat === 0) for (let x = 8; x < len; x += 22) { g.beginPath(); g.arc(x, 0, 4, 0, Math.PI * 2); g.fill(); }
    else if (tp.pat === 1) for (let x = -20; x < len; x += 18) g.fillRect(x, -tp.w, 7, tp.w * 2);
    else { g.fillRect(-10, -3, len + 20, 6); }
    g.restore();
  }
  function drawStroke(g, pts, k) {
    const n = Math.max(2, Math.floor(pts.length * k));
    g.save(); g.strokeStyle = 'rgba(80,72,90,.85)'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); pts.slice(0, n).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.restore();
  }
  const randSpot = () => ({ x: rand(90, CW - 90), y: rand(130, CH - 90) });

  const objects = [];
  objects.push(obj('tape', V(-0.56, TY + 0.05, -0.62), 0.07, [roll], () => {
    const d = sound(info, 'tape');
    const c = pick(tapeCols);
    rollMat.color.set(c);
    kit.tween(0.45, (k) => { roll.rotation.x = k * Math.PI * 4; roll.position.y = TY + 0.048 + Math.sin(k * Math.PI) * 0.03; }, kit.ease.out);
    const sp = randSpot();
    const tp = { x: sp.x - 120, y: sp.y, a: rand(-0.45, 0.45), len: rand(220, 340), w: rand(42, 56), c, pat: (Math.random() * 3) | 0 };
    startAnim(clamp(d * 0.55, 0.35, 0.7), (g, k) => drawTape(g, tp, k));
  }, { reach: 3.0 }));
  objects.push(obj('pencil', V(0.36, TY + 0.03, -0.58), 0.09, [pencilHit, pencil], () => {
    const d = sound(info, 'pencil');
    if (drawing) return;
    drawing = true;
    const sp = randSpot();
    const kind = (Math.random() * 5) | 0;
    const pts = kind === 0 ? heartPath(sp.x, sp.y, 2.4) : kind === 1 ? starPath(sp.x, sp.y, 40) : kind === 2 ? loopPath(sp.x, sp.y, 220) : kind === 3 ? wavePath(sp.x, sp.y, 240) : flowerPath(sp.x, sp.y, 44);
    const dur = clamp(d || 1, 0.7, 1.6);
    const tip = (k) => { const i = Math.min(pts.length - 1, Math.floor(pts.length * k)); return diary.localToWorld(toLocal(pts[i][0], pts[i][1])); };
    const p0 = pencil.position.clone();
    kit.tween(0.22, (k) => { pencil.position.lerpVectors(p0, tip(0), k); pencil.quaternion.slerpQuaternions(restQ, drawQ, k); }, kit.ease.inOut)
      .then(() => {
        const follow = { t: 0 };
        kit.tween(dur, (k) => { follow.t = k; pencil.position.copy(tip(k)); }, kit.ease.linear);
        return startAnim(dur, (g, k) => drawStroke(g, pts, k));
      })
      .then(() => { const p1 = pencil.position.clone(); return kit.tween(0.3, (k) => { pencil.position.lerpVectors(p1, restPos, k); pencil.quaternion.slerpQuaternions(drawQ, restQ, k); }); })
      .then(() => { drawing = false; });
  }, { reach: 3.0 }));
  objects.push(obj('flip', V(-0.04 + PW / 2 - 0.05, TY + 0.03, -0.82 + PD / 2 - 0.05), 0.07, [cornerHit, corner], () => {
    if (flipping) return;
    flipping = true;
    sound(info, 'flip');
    flipPage.visible = true;
    let cleared = false;
    kit.tween(0.75, (k) => {
      flipPage.rotation.z = Math.PI * k;
      flipPage.position.y = 0.03 + Math.sin(Math.PI * k) * 0.02;
      if (!cleared && k > 0.5) { cleared = true; anims.forEach((a) => a.res()); anims.clear(); cg.clearRect(0, 0, CW, CH); paperBase(cg); dirty = true; }
    }, kit.ease.inOut).then(() => { flipPage.visible = false; flipPage.rotation.z = 0; flipping = false; });
  }, { reach: 3.0 }));
  objects.push(obj('sticker', V(0.58, TY + 0.01, -0.9), 0.09, [stickerSheet], () => {
    // 스티커는 소리 없이 장식 효과만
    const sp = randSpot();
    const kind = pick(['heart', 'star', 'cloud']), col = pick(['#ff9fbf', '#ffd66b', '#a9d8ff', '#c9b2ff', '#9fe0c4', '#ffc8d8']);
    startAnim(0.28, (g, k) => drawSticker(g, kind, col, sp.x, sp.y, (k < 0.7 ? k / 0.7 * 1.2 : 1.2 - (k - 0.7) / 0.3 * 0.2) * 1.15));
    fx.emit(diary.localToWorld(toLocal(sp.x, sp.y)), { n: 9, colors: ['#fff3b0', '#ffffff', col], speed: 0.35, up: 1.0, size: 0.012, life: 0.6, gravity: -0.6 });
    shake(kit, stickerSheet, 0.08, 0.4);
  }, { reach: 3.0 }));
  const fx = kit.particles(scene, { max: 120 });

  return {
    scene, exposure: 1.02, shadowLight: L.sun, doors: [sh.door], objects,
    bloom: { threshold: 1.35, strength: 0.3 },
    spawn: () => (portrait() ? { x: 0, z: 1.0, yaw: 0, pitch: -0.4 } : { x: 0, z: 0.45, yaw: 0, pitch: -0.5 }),
    constrain: roomConstrain(4, 4, [{ x: 0, z: -0.88, hx: 0.85, hz: 0.38 }]),
    floorAt: () => 'wood',
    update(dt, t) {
      lampGlow.material.opacity = 0.5 + 0.03 * Math.sin(t * 7);
      if (anims.size || dirty) {
        pg.drawImage(committed, 0, 0);
        anims.forEach((a) => {
          a.t += dt;
          const k = Math.min(1, a.t / a.dur);
          if (k >= 1) { a.draw(cg, 1); anims.delete(a); a.res(); dirty = true; } else a.draw(pg, k);
        });
        if (dirty) { pg.drawImage(committed, 0, 0); anims.forEach((a) => a.draw(pg, Math.min(1, a.t / a.dur))); dirty = false; }
        pageTex.needsUpdate = true;
      }
    },
    dispose() { fx.dispose(); anims.forEach((a) => a.res()); anims.clear(); }
  };
}

/* ===================================================================== */
/* 🍰 3. 디저트 카페 — 크림색 타일, 진열장 속 케이크, 창밖 오후 햇살 */
function buildCafe(kit, info) {
  const { tex, mesh, std } = kit;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#fff0ee');
  scene.environment = kit.roomEnv;
  const floorMat = new THREE.MeshStandardMaterial({ map: tex.get('floor_tiles_06_diff'), normalMap: tex.get('floor_tiles_06_nor_gl'), roughness: 0.28 });
  kit.patch(floorMat, { luma: { a: '#f4a9bf', b: '#fff6ec', lo: 0.07, hi: 0.2, detail: 0.85 } });
  const wallMat = wallMaterial(kit, '#fbe1e2', '#fff3ef');
  const tileTex = kit.canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e9ddd0'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) {
      const x = c * 64 + (r % 2) * 32 + 3, y = r * 32 + 3;
      const gr = g.createLinearGradient(x, y, x, y + 26);
      gr.addColorStop(0, '#fffaf2'); gr.addColorStop(1, '#fbefe3');
      g.fillStyle = gr; g.beginPath(); g.roundRect ? g.roundRect(x, y, 58, 26, 5) : g.rect(x, y, 58, 26); g.fill();
    }
  });
  const wainMat = new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.18, normalMap: tex.get('beige_wall_001_nor_gl'), normalScale: new THREE.Vector2(0.15, 0.15) });
  const sh = shell(kit, scene, { floorMat, wallMat, wainMat, wainH: 1.05, doorColor: info.door, floorTile: 1.25, wallTile: 0.5 });
  const L = lights(kit, scene, {
    sky: '#fff4ef', ground: '#f7cfc4', hemi: 1.05, sunColor: '#ffeccc', sun: 2.6, sunPos: [3.8, 3.6, -0.2], sunTarget: [0, 0.8, -0.9],
    points: [['#ffd9a8', 2.2, -0.45, 2.05, -0.95], ['#ffd9a8', 2.2, 0.55, 2.05, -0.95]]
  });
  roomWindow(kit, scene, { x: 1.98, y: 1.05, z: -0.35, ry: -Math.PI / 2, w: 1.3, h: 1.3, top: '#8cc8ff', bot: '#fff1d6', curtain: '#ffd6e2', bright: 1.3 });
  const beamM = kit.beam('#fff2d2', 0.24);
  const bS = V(1.95, 1.7, -0.45), bE = V(0.9, 0.0, -1.55);
  const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, bS.distanceTo(bE), 8, 1, true), beamM);
  bm.position.copy(bS).add(bE).multiplyScalar(0.5); bm.quaternion.setFromUnitVectors(V(0, 1, 0), bS.clone().sub(bE).normalize()); bm.renderOrder = 4; scene.add(bm);
  // 칠판 메뉴
  const menu = kit.canvasTex(512, 360, (g, w, h) => {
    g.fillStyle = '#4b5a54'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#d9b98a'; g.lineWidth = 16; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#fff7ec'; g.textAlign = 'center';
    g.font = '700 42px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'; g.fillText('오늘의 디저트 ♡', w / 2, 82);
    g.font = '500 30px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ['딸기 쇼트케이크', '바닐라 마카롱', '핸드드립 커피', '딸기우유 라떼'].forEach((t, i) => g.fillText(t, w / 2, 150 + i * 50));
  });
  mesh(new THREE.PlaneGeometry(0.8, 0.56), new THREE.MeshStandardMaterial({ map: menu, roughness: 0.9 }), { p: [-0.75, 1.75, -1.97], cast: false, parent: scene });
  // 펜던트 유리 조명
  [-0.45, 0.55].forEach((x) => {
    mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.6, 6), std('#d9b46a', 0.3, { metalness: 1 }), { p: [x, 2.5, -0.95], cast: false, parent: scene });
    mesh(new THREE.SphereGeometry(0.09, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.6, 1.25), toneMapped: false }), { p: [x, 2.15, -0.95], cast: false, parent: scene });
    const gl = kit.glow('#ffe0b0', 0.7, 0.5); gl.position.set(x, 2.15, -0.95); scene.add(gl);
  });

  // 카운터
  const marble = new THREE.MeshStandardMaterial({ map: tex.get('marble_01_diff'), normalMap: tex.get('marble_01_nor_gl'), roughness: 0.12 });
  kit.patch(marble, { luma: { a: '#e7dcd8', b: '#ffffff', lo: 0.25, hi: 0.6, detail: 0.9 } });
  const TY = 0.92;
  mesh(kit.uv(new THREE.BoxGeometry(1.8, 0.05, 0.66), 1.4, 0.6), marble, { p: [0, TY - 0.025, -1.0], parent: scene });
  mesh(new THREE.BoxGeometry(1.74, TY - 0.05, 0.6), std('#ffc9d6', 0.5), { p: [0, (TY - 0.05) / 2, -1.02], parent: scene });
  for (let i = 0; i < 7; i++) mesh(new THREE.BoxGeometry(0.02, TY - 0.2, 0.01), std('#fff2f5', 0.5), { p: [-0.75 + i * 0.25, (TY - 0.05) / 2, -0.715], parent: scene, cast: false });
  mesh(new THREE.BoxGeometry(1.8, 0.03, 0.02), std('#e3c27a', 0.3, { metalness: 1 }), { p: [0, 0.06, -0.71], parent: scene, cast: false });

  // 진열장 + 케이크
  const caseG = new THREE.Group(); caseG.position.set(-1.62, 0, -0.1); scene.add(caseG);
  mesh(new THREE.BoxGeometry(0.62, 0.8, 1.2), std('#fff3f6', 0.5), { p: [0, 0.4, 0], parent: caseG });
  mesh(new THREE.BoxGeometry(0.6, 0.5, 1.16), kit.phys({ color: '#ffffff', transparent: true, opacity: 0.18, roughness: 0.02, clearcoat: 1 }), { p: [0, 1.05, 0], parent: caseG, cast: false });
  mesh(new THREE.BoxGeometry(0.62, 0.03, 1.2), std('#e3c27a', 0.3, { metalness: 1 }), { p: [0, 1.31, 0], parent: caseG });
  const cake = (z, c1, c2) => {
    const g = new THREE.Group(); g.position.set(0, 0.8, z); caseG.add(g);
    mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 32), std('#ffffff', 0.3), { p: [0, 0.012, 0], parent: g });
    mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 32), std(c1, 0.6), { p: [0, 0.05, 0], parent: g });
    mesh(new THREE.CylinderGeometry(0.087, 0.087, 0.014, 32), std('#fffaf0', 0.5), { p: [0, 0.082, 0], parent: g });
    mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.045, 32), std(c2, 0.6), { p: [0, 0.111, 0], parent: g });
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      mesh(new THREE.SphereGeometry(0.014, 10, 8), std('#ffffff', 0.5), { p: [Math.cos(a) * 0.06, 0.14, Math.sin(a) * 0.06], parent: g });
      if (i % 2 === 0) mesh(new THREE.ConeGeometry(0.012, 0.022, 10), std('#ff4d6d', 0.35), { p: [Math.cos(a) * 0.06, 0.162, Math.sin(a) * 0.06], r: [Math.PI, 0, 0], parent: g });
    }
  };
  cake(-0.35, '#fff1d6', '#ffd1dc'); cake(0, '#f7d9b8', '#fff5e6'); cake(0.35, '#e9d7ff', '#fff0f5');

  const objects = [], fx = kit.particles(scene, { max: 160 }), crumbs = kit.particles(scene, { max: 80, additive: false, hard: true });

  /* 핸드드립 주전자 + 드리퍼 */
  const drip = new THREE.Group(); drip.position.set(-0.62, TY, -0.98); scene.add(drip);
  const server = mesh(kit.lathe([[0, 0], [0.055, 0], [0.065, 0.04], [0.06, 0.09], [0.045, 0.12], [0.05, 0.13]], 28), kit.phys({ color: '#ffffff', transparent: true, opacity: 0.3, roughness: 0.03, clearcoat: 1 }), { p: [0.1, 0, 0], parent: drip, cast: false });
  const coffee = mesh(new THREE.CylinderGeometry(0.056, 0.054, 0.04, 24), std('#5a3423', 0.15), { p: [0.1, 0.022, 0], s: [1, 1, 1], parent: drip });
  mesh(kit.lathe([[0.03, 0], [0.04, 0.005], [0.075, 0.07], [0.08, 0.075]], 28), std('#ffffff', 0.25, { side: THREE.DoubleSide }), { p: [0.1, 0.13, 0], parent: drip });
  const kettle = new THREE.Group(); kettle.position.set(-0.07, 0, -0.03); drip.add(kettle);
  const rose = std('#e7b9a8', 0.28, { metalness: 1 });
  const kbody = new THREE.Group(); kbody.position.set(0.05, 0, 0); kettle.add(kbody);
  mesh(kit.lathe([[0, 0], [0.06, 0], [0.068, 0.04], [0.064, 0.1], [0.04, 0.125], [0.02, 0.13]], 28), rose, { p: [-0.05, 0, 0], parent: kbody });
  mesh(new THREE.SphereGeometry(0.012, 10, 8), rose, { p: [-0.05, 0.138, 0], parent: kbody });
  const spoutCurve = new THREE.CatmullRomCurve3([V(0.0, 0.02, 0), V(0.05, 0.05, 0), V(0.075, 0.13, 0), V(0.105, 0.16, 0)]);
  mesh(new THREE.TubeGeometry(spoutCurve, 24, 0.006, 8, false), rose, { p: [0, 0, 0], parent: kbody });
  mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 20, Math.PI * 1.2), rose, { p: [-0.11, 0.07, 0], r: [0, 0, Math.PI * 0.4], parent: kbody });
  const spoutTip = new THREE.Object3D(); spoutTip.position.set(0.105, 0.16, 0); kbody.add(spoutTip);
  const dripHit = mesh(new THREE.BoxGeometry(0.34, 0.26, 0.2), new THREE.MeshBasicMaterial(), { p: [0.02, 0.12, 0], parent: drip, cast: false }); dripHit.visible = false;
  const stream = mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 1, 6), kit.phys({ color: '#d6efff', transparent: true, opacity: 0.6, roughness: 0.05 }), { parent: scene, cast: false });
  stream.visible = false;
  let dripBusy = false, coffeeLv = 1;
  objects.push(obj('drip', V(-0.6, TY + 0.1, -0.98), 0.14, [drip], () => {
    const d = sound(info, 'drip');
    if (dripBusy) return;
    dripBusy = true;
    const dur = clamp(d || 2.2, 1.6, 2.6);
    kit.tween(0.35, (k) => { kettle.rotation.z = -0.62 * k; kettle.position.y = 0.06 * k; }, kit.ease.inOut).then(() => {
      const a = new THREE.Vector3(), b = V(-0.52, TY + 0.2, -0.98);
      spoutTip.getWorldPosition(a);
      stream.visible = true;
      const len = Math.max(0.02, a.y - b.y);
      stream.scale.set(1, len, 1); stream.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      stream.rotation.z = Math.atan2(a.x - b.x, a.y - b.y) * -1;
      let dropT = 0;
      return kit.tween(dur - 0.6, (k, raw) => {
        stream.material.opacity = 0.45 + 0.15 * Math.sin(raw * 60);
        if (raw > dropT) { dropT += 0.12; fx.emit(V(-0.52, TY + 0.115, -0.98), { n: 1, colors: ['#7a4a30'], speed: 0.01, up: 0, vy: -0.2, gravity: -3, life: 0.25, size: 0.008, alpha: 0.9 }); }
        coffeeLv = Math.min(2.4, coffeeLv + 0.004);
        coffee.scale.y = coffeeLv; coffee.position.y = 0.002 + 0.02 * coffeeLv;
      }, kit.ease.linear);
    }).then(() => {
      stream.visible = false;
      return kit.tween(0.35, (k) => { kettle.rotation.z = -0.62 * (1 - k); kettle.position.y = 0.06 * (1 - k); }, kit.ease.inOut);
    }).then(() => { if (coffeeLv > 2.3) { coffeeLv = 1; coffee.scale.y = 1; coffee.position.y = 0.022; } dripBusy = false; });
  }));

  /* 휘핑크림 볼 + 거품기 */
  const whisk = new THREE.Group(); whisk.position.set(-0.24, TY, -0.95); scene.add(whisk);
  mesh(kit.lathe([[0, 0], [0.05, 0], [0.1, 0.03], [0.12, 0.08], [0.125, 0.085]], 32), std('#bfeadb', 0.25, { side: THREE.DoubleSide }), { parent: whisk });
  const cream = mesh(kit.lathe([[0, 0.09], [0.04, 0.085], [0.08, 0.07], [0.105, 0.05], [0.11, 0.03], [0, 0.03]], 32), kit.phys({ color: '#fffdf8', roughness: 0.55, sheen: 1, sheenColor: new THREE.Color('#ffffff') }), { parent: whisk });
  cream.scale.set(1, 0.6, 1);
  const wsk = new THREE.Group(); wsk.position.set(0.02, 0.06, 0); wsk.rotation.z = -0.35; whisk.add(wsk);
  mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.12, 12), std('#ffb7c9', 0.5), { p: [0, 0.2, 0], parent: wsk });
  const wire = std('#e9edf2', 0.2, { metalness: 1 });
  for (let i = 0; i < 4; i++) {
    const w = mesh(new THREE.TorusGeometry(0.035, 0.0018, 6, 28), wire, { p: [0, 0.1, 0], r: [0, i * Math.PI / 4, 0], s: [1, 2.0, 1], parent: wsk });
    w.castShadow = false;
  }
  let creamLv = 0, whiskBusy = false;
  objects.push(obj('whisk', V(-0.24, TY + 0.1, -0.95), 0.14, [whisk], () => {
    const d = sound(info, 'whisk');
    fx.emit(V(-0.24, TY + 0.12, -0.95), { n: 6, colors: ['#ffffff', '#fff6e0'], speed: 0.4, up: 0.8, size: 0.01, life: 0.5, gravity: -1.5 });
    if (whiskBusy) return;
    whiskBusy = true;
    const from = creamLv; creamLv = creamLv >= 3 ? 0 : creamLv + 1;
    const s0 = 0.6 + from * 0.28, s1 = 0.6 + creamLv * 0.28;
    kit.tween(clamp(d || 1.5, 1.0, 1.8), (k, raw) => {
      wsk.rotation.y += 0.55;
      wsk.position.x = 0.02 + Math.cos(raw * 40) * 0.012; wsk.position.z = Math.sin(raw * 40) * 0.012;
      cream.scale.set(1 + (s1 - 0.6) * 0.15 * k, s0 + (s1 - s0) * k, 1 + (s1 - 0.6) * 0.15 * k);
    }, kit.ease.linear).then(() => { whiskBusy = false; });
  }));

  /* 얼음 든 유리컵 */
  const ice = new THREE.Group(); ice.position.set(0.08, TY, -0.92); scene.add(ice);
  mesh(kit.lathe([[0, 0], [0.042, 0], [0.05, 0.16], [0.047, 0.16], [0.039, 0.006], [0, 0.006]], 32), kit.phys({ color: '#ffffff', transparent: true, opacity: 0.28, roughness: 0.03, clearcoat: 1, envMapIntensity: 1.5 }), { parent: ice, cast: false });
  mesh(new THREE.CylinderGeometry(0.044, 0.038, 0.1, 28), kit.phys({ color: '#ffc6d6', roughness: 0.3, sheen: 0.4, transparent: true, opacity: 0.92 }), { p: [0, 0.056, 0], parent: ice });
  const cubes = [];
  for (let i = 0; i < 3; i++) {
    const c = mesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), kit.phys({ color: '#f2fbff', transparent: true, opacity: 0.7, roughness: 0.05, clearcoat: 1 }), { p: [Math.cos(i * 2.1) * 0.015, 0.1 + i * 0.012, Math.sin(i * 2.1) * 0.015], r: [i, i * 0.7, 0.3], parent: ice, cast: false });
    c.userData.p0 = c.position.clone();
    cubes.push(c);
  }
  mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.22, 8), std('#ff9fb8', 0.4), { p: [0.02, 0.15, 0], r: [0, 0, -0.25], parent: ice });
  objects.push(obj('ice', V(0.08, TY + 0.08, -0.92), 0.08, [ice], () => {
    sound(info, 'ice');
    shake(kit, ice, 0.16, 0.8);
    kit.tween(0.8, (k, raw) => {
      cubes.forEach((c, i) => { const e = Math.exp(-raw * 4) * 0.008; c.position.set(c.userData.p0.x + Math.sin(raw * 50 + i) * e, c.userData.p0.y + Math.abs(Math.sin(raw * 40 + i * 2)) * e, c.userData.p0.z + Math.cos(raw * 45 + i) * e); });
    }, kit.ease.linear);
  }));

  /* 찻잔과 스푼 */
  const tea = new THREE.Group(); tea.position.set(0.38, TY, -0.95); scene.add(tea);
  mesh(kit.lathe([[0, 0], [0.08, 0], [0.09, 0.012], [0.095, 0.016]], 36), std('#ffffff', 0.2), { parent: tea });
  mesh(kit.lathe([[0, 0.012], [0.03, 0.012], [0.05, 0.03], [0.058, 0.07], [0.06, 0.075], [0.056, 0.075], [0.052, 0.04], [0.03, 0.018], [0, 0.018]], 36), std('#ffffff', 0.18, { side: THREE.DoubleSide }), { parent: tea });
  mesh(new THREE.TorusGeometry(0.06, 0.003, 6, 40), std('#e3c27a', 0.3, { metalness: 1 }), { p: [0, 0.075, 0], r: [Math.PI / 2, 0, 0], parent: tea, cast: false });
  mesh(new THREE.TorusGeometry(0.018, 0.005, 8, 16, Math.PI * 1.3), std('#ffffff', 0.2), { p: [0.066, 0.05, 0], r: [0, 0, -Math.PI * 0.65], parent: tea });
  const teaSurf = mesh(new THREE.CircleGeometry(0.053, 32), std('#c98b4e', 0.08), { p: [0, 0.062, 0], r: [-Math.PI / 2, 0, 0], parent: tea, cast: false });
  const spoon = new THREE.Group(); spoon.position.set(0.02, 0.07, 0); tea.add(spoon);
  const silver = std('#e9edf2', 0.15, { metalness: 1 });
  mesh(new THREE.BoxGeometry(0.006, 0.12, 0.003), silver, { p: [0, 0.05, 0], parent: spoon });
  mesh(new THREE.SphereGeometry(0.012, 12, 8), silver, { p: [0, -0.012, 0], s: [1, 1.4, 0.4], parent: spoon });
  spoon.rotation.z = 0.35;
  objects.push(obj('spoon', V(0.38, TY + 0.06, -0.95), 0.09, [tea], () => {
    sound(info, 'spoon');
    kit.tween(1.0, (k) => {
      const a = k * Math.PI * 2 * 2.5;
      spoon.position.set(Math.cos(a) * 0.022, 0.07, Math.sin(a) * 0.022);
      spoon.rotation.set(Math.sin(a) * 0.3, 0, 0.35 + Math.cos(a) * 0.1);
      teaSurf.scale.setScalar(1 + Math.sin(k * 30) * 0.01);
    }, kit.ease.inOut).then(() => { spoon.position.set(0.02, 0.07, 0); spoon.rotation.set(0, 0, 0.35); });
  }));

  /* 마카롱 접시 */
  const mac = new THREE.Group(); mac.position.set(0.68, TY, -0.92); scene.add(mac);
  mesh(kit.lathe([[0, 0], [0.11, 0], [0.13, 0.012], [0.135, 0.018]], 40), std('#ffffff', 0.2), { parent: mac });
  mesh(new THREE.TorusGeometry(0.128, 0.003, 6, 48), std('#ffb7c9', 0.4), { p: [0, 0.016, 0], r: [Math.PI / 2, 0, 0], parent: mac, cast: false });
  const macCols = ['#ffb7c9', '#c8f0b6', '#d9c6ff', '#ffe08a', '#a9dcff', '#ffc8a6'];
  const shellFull = new THREE.SphereGeometry(0.028, 24, 12); shellFull.scale(1, 0.42, 1);
  const shellBit = new THREE.SphereGeometry(0.028, 24, 12, 0.7, Math.PI * 1.55); shellBit.scale(1, 0.42, 1);
  const fillFull = new THREE.CylinderGeometry(0.024, 0.024, 0.009, 24), fillBit = new THREE.CylinderGeometry(0.024, 0.024, 0.009, 24, 1, false, 0.7, Math.PI * 1.55);
  const macs = macCols.map((c, i) => {
    const g = new THREE.Group();
    const a = i / 5 * Math.PI * 2;
    if (i < 5) g.position.set(Math.cos(a) * 0.07, 0.03, Math.sin(a) * 0.07); else g.position.set(0, 0.045, 0);
    g.rotation.y = rand(0, 6);
    const m = std(c, 0.55, { side: THREE.DoubleSide });
    const top = mesh(shellFull, m, { p: [0, 0.012, 0], parent: g });
    const bot = mesh(shellFull, m, { p: [0, -0.002, 0], parent: g });
    const fil = mesh(fillFull, std('#fff8ec', 0.6), { p: [0, 0.005, 0], parent: g });
    mac.add(g);
    return { g, top, bot, fil, bitten: false, c };
  });
  objects.push(obj('macaron', V(0.68, TY + 0.04, -0.92), 0.12, [mac], () => {
    sound(info, 'macaron');
    const next = macs.find((m) => !m.bitten);
    if (!next) {
      macs.forEach((m) => { m.bitten = false; m.top.geometry = shellFull; m.bot.geometry = shellFull; m.fil.geometry = fillFull; m.g.scale.setScalar(0.01); kit.tween(0.35, (k) => m.g.scale.setScalar(0.01 + 0.99 * k), kit.ease.out); });
      fx.emit(V(0.68, TY + 0.08, -0.92), { n: 14, colors: ['#fff3b0', '#ffffff', '#ffd1df'], speed: 0.6, up: 1, size: 0.014, life: 0.7 });
      return;
    }
    next.bitten = true;
    next.top.geometry = shellBit; next.bot.geometry = shellBit; next.fil.geometry = fillBit;
    wobble(kit, next.g, 0.15, 0.4);
    const wp = new THREE.Vector3(); next.g.getWorldPosition(wp);
    crumbs.emit(wp, { n: 10, colors: [next.c, '#fff8ec'], speed: 0.35, up: 0.9, size: 0.008, life: 0.6, gravity: -2.5 });
  }));

  return {
    scene, exposure: 1.0, shadowLight: L.sun, doors: [sh.door], objects,
    bloom: { threshold: 1.35, strength: 0.3 },
    spawn: () => (portrait() ? { x: 0, z: 1.05, yaw: 0, pitch: -0.27 } : { x: 0, z: 0.5, yaw: 0, pitch: -0.38 }),
    constrain: roomConstrain(4, 4, [{ x: 0, z: -1.0, hx: 0.9, hz: 0.34 }, { x: -1.62, z: -0.1, hx: 0.31, hz: 0.6 }]),
    floorAt: () => 'tile',
    update(dt, t) { beamM.uniforms.uTime.value = t; },
    dispose() { fx.dispose(); crumbs.dispose(); }
  };
}

/* ===================================================================== */
/* 🌧️ 4. 비 오는 다락방 — 경사진 천장, 둥근 창, 담요와 쿠션, 촛불 */
function rainGlassMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uRain: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime, uRain; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      void main(){
        vec2 uv = vUv;
        float cols = 30.0;
        float id = floor(uv.x * cols);
        float r = h(vec2(id, 3.0));
        float sp = 0.18 + r * 0.35;
        float y = fract(uv.y * 1.3 + uTime * sp * (0.7 + uRain * 1.6) + r * 7.0);
        float xw = abs(fract(uv.x * cols) - 0.5);
        float head = smoothstep(0.0, 0.03, y) * smoothstep(0.09, 0.03, y);
        float trail = smoothstep(0.5, 0.05, y) * 0.25;
        float streak = smoothstep(0.12, 0.0, xw) * (head + trail) * step(0.35 - uRain * 0.3, r);
        vec2 c = uv * vec2(16.0, 16.0); vec2 ci = floor(c); vec2 cf = fract(c) - 0.5;
        vec2 o = vec2(h(ci + 1.7), h(ci + 9.2)) - 0.5;
        float dots = smoothstep(0.13, 0.05, length(cf - o * 0.6)) * step(0.6 - uRain * 0.3, h(ci));
        float a = streak * (0.7 + uRain) + dots * 0.6;
        vec3 col = vec3(0.82, 0.9, 1.0) * a;
        gl_FragColor = vec4(col, clamp(0.12 + a * 0.6, 0.0, 0.85));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false
  });
}

function buildAttic(kit, info) {
  const { tex, mesh, std } = kit;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2d3446');
  scene.environment = kit.roomEnv;
  const W = 4, D = 4, KNEE = 1.25, RIDGE = 3.05;
  const plankD = tex.get('roof_planks_diff'), plankN = tex.get('roof_planks_nor_gl');
  const floorMat = new THREE.MeshStandardMaterial({ map: plankD, normalMap: plankN, color: new THREE.Color(1.18, 1.06, 0.96), roughness: 0.65 });
  const roofMat = new THREE.MeshStandardMaterial({ map: plankD, normalMap: plankN, color: new THREE.Color(1.35, 1.28, 1.22), roughness: 0.8, side: THREE.DoubleSide });
  const wallMat = wallMaterial(kit, '#adc1de', '#cddaee');
  const fN = fleece(kit);
  // 바닥
  const fg = kit.uv(new THREE.PlaneGeometry(W, D), 2.2, 2.2); fg.rotateX(-Math.PI / 2); fg.rotateY(Math.PI / 2);
  mesh(fg, floorMat, { cast: false, parent: scene });
  // 낮은 옆벽(무릎벽)
  [[-W / 2, Math.PI / 2], [W / 2, -Math.PI / 2]].forEach(([x, ry]) => {
    mesh(kit.uv(new THREE.PlaneGeometry(D, KNEE), D / 1.6, KNEE / 1.6), wallMat, { p: [x, KNEE / 2, 0], r: [0, ry, 0], cast: false, parent: scene });
    mesh(new THREE.BoxGeometry(D, 0.1, 0.05), std('#fffaf2', 0.5), { p: [x + Math.sign(-x) * 0.025, 0.05, 0], r: [0, ry, 0], cast: false, parent: scene });
  });
  // 경사 지붕 (질감: 지붕 널빤지)
  const slope = Math.hypot(W / 2, RIDGE - KNEE), ang = Math.atan2(RIDGE - KNEE, W / 2);
  [-1, 1].forEach((s) => {
    const g = kit.uv(new THREE.PlaneGeometry(D, slope), D / 1.6, slope / 1.6);
    const m = mesh(g, roofMat, { cast: false, parent: scene });
    m.position.set(s * W / 4, (KNEE + RIDGE) / 2, 0);
    m.rotation.set(0, s * Math.PI / 2, 0);
    m.rotateX(-(Math.PI / 2 - ang));
    // 서까래
    for (let i = 0; i < 4; i++) {
      const r = mesh(new THREE.BoxGeometry(0.08, 0.1, slope), std('#b48a64', 0.7, { normalMap: plankN }), { parent: scene });
      r.position.set(s * W / 4 * 0.97, (KNEE + RIDGE) / 2 - 0.05, -1.5 + i * 1.0);
      r.rotation.set(0, 0, 0); r.rotation.x = 0;
      r.rotation.set(0, 0, s * (Math.PI / 2 - ang));
      r.rotateX(Math.PI / 2);
      r.castShadow = false;
    }
  });
  mesh(new THREE.BoxGeometry(0.14, 0.14, D), std('#a07a58', 0.7, { normalMap: plankN }), { p: [0, RIDGE - 0.05, 0], cast: false, parent: scene });
  // 박공벽(앞·뒤): 앞벽에는 둥근 창 구멍
  const WIN_Y = 1.62, WIN_R = 0.44;
  const gable = (hole) => {
    const s = new THREE.Shape();
    s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(W / 2, KNEE); s.lineTo(0, RIDGE); s.lineTo(-W / 2, KNEE); s.closePath();
    if (hole) { const p = new THREE.Path(); p.absarc(0, WIN_Y, WIN_R, 0, Math.PI * 2, true); s.holes.push(p); }
    const g = new THREE.ShapeGeometry(s, 32);
    const pa = g.attributes.position, u = g.attributes.uv;
    for (let i = 0; i < pa.count; i++) u.setXY(i, pa.getX(i) / 1.6, pa.getY(i) / 1.6);
    return g;
  };
  mesh(gable(true), wallMat, { p: [0, 0, -D / 2], cast: false, parent: scene });
  mesh(gable(false), wallMat, { p: [0, 0, D / 2], r: [0, Math.PI, 0], cast: false, parent: scene });
  const door = backDoor(kit, scene, { x: 0, z: D / 2, ry: Math.PI, color: info.door, wall: true, h: 1.95 });

  // 둥근 창 + 빗물 유리 + 바깥 하늘 + 먹구름
  const frameM = std('#fffaf2', 0.45);
  mesh(new THREE.TorusGeometry(WIN_R + 0.02, 0.045, 12, 48), frameM, { p: [0, WIN_Y, -D / 2 + 0.03], cast: false, parent: scene });
  mesh(new THREE.BoxGeometry(0.03, WIN_R * 2, 0.03), frameM, { p: [0, WIN_Y, -D / 2 + 0.02], cast: false, parent: scene });
  mesh(new THREE.BoxGeometry(WIN_R * 2, 0.03, 0.03), frameM, { p: [0, WIN_Y, -D / 2 + 0.02], cast: false, parent: scene });
  const glass = mesh(new THREE.CircleGeometry(WIN_R + 0.01, 48), rainGlassMaterial(), { p: [0, WIN_Y, -D / 2 + 0.008], cast: false, parent: scene });
  glass.renderOrder = 3;
  const storm = kit.canvasTex(256, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#47536e'); gr.addColorStop(0.6, '#7b88a3'); gr.addColorStop(1, '#a9b4c8');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(220,230,245,.25)'; g.lineWidth = 1.5;
    for (let i = 0; i < 90; i++) { const x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 4, y + 18); g.stroke(); }
  });
  const skyM = new THREE.MeshBasicMaterial({ map: storm, color: new THREE.Color(1, 1, 1) });
  mesh(new THREE.PlaneGeometry(6, 4), skyM, { p: [0, 1.7, -D / 2 - 2.2], cast: false, parent: scene });
  const bolt = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 1.4), new THREE.MeshBasicMaterial({
    map: kit.canvasTex(64, 256, (g) => { g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.shadowColor = '#bcd4ff'; g.shadowBlur = 12; g.beginPath(); g.moveTo(36, 0); g.lineTo(24, 80); g.lineTo(40, 110); g.lineTo(22, 190); g.lineTo(34, 256); g.stroke(); }),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  }));
  bolt.position.set(0.35, 1.3, -D / 2 - 1.6); bolt.visible = false; scene.add(bolt);
  const cloud = new THREE.Group(); cloud.position.set(0.05, 2.02, -D / 2 - 1.15); scene.add(cloud);
  const cloudM = new THREE.MeshStandardMaterial({ color: '#5a647c', roughness: 1, emissive: '#2a3142', emissiveIntensity: 0.6 });
  [[0, 0, 0, 0.26], [-0.25, -0.05, 0.05, 0.2], [0.26, -0.04, 0, 0.21], [0.1, 0.12, -0.05, 0.2], [-0.12, 0.1, 0.02, 0.17]].forEach(([x, y, z, r]) => mesh(new THREE.SphereGeometry(r, 20, 14), cloudM, { p: [x, y, z], parent: cloud, cast: false }));
  const cloudHit = mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshBasicMaterial(), { parent: cloud, cast: false }); cloudHit.visible = false;
  const glassHit = mesh(new THREE.CircleGeometry(WIN_R, 24), new THREE.MeshBasicMaterial(), { p: [0, WIN_Y, -D / 2 + 0.05], cast: false, parent: scene }); glassHit.visible = false;

  // 빛: 창밖 흐린 빛(그림자) + 촛불 + 꼬마전구
  scene.add(new THREE.HemisphereLight('#c9d8f0', '#6e5a4a', 0.8));
  const winLight = kit.shadowLight('#d4e2ff', 1.2, [0.4, 2.4, -4.0], [0, 0.3, 0.2], 3.0);
  scene.add(winLight, winLight.target);
  const candleL = new THREE.PointLight('#ffae5c', 3.2, 0, 2); candleL.position.set(0.78, 0.62, -1.15); scene.add(candleL);
  const fairyL = new THREE.PointLight('#ffd59a', 2.2, 0, 2); fairyL.position.set(0, 2.5, 0); scene.add(fairyL);
  // 꼬마전구 줄
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 1.0), toneMapped: false }), 26);
  const mm = new THREE.Matrix4();
  for (let i = 0; i < 26; i++) {
    const t = i / 25, z = -1.85 + t * 3.7, x = Math.sin(t * Math.PI * 3) * 0.25;
    const y = RIDGE - 0.22 - Math.sin(t * Math.PI * 3 % Math.PI) * 0.18;
    mm.makeTranslation(x, y, z); bulbs.setMatrixAt(i, mm);
  }
  scene.add(bulbs);

  // 창가 의자(벤치) + 쿠션 + 담요 + 책
  const benchM = std('#fff3e6', 0.5, { normalMap: tex.get('wood_table_001_nor_gl'), normalScale: new THREE.Vector2(0.2, 0.2) });
  mesh(new THREE.BoxGeometry(1.5, 0.42, 0.55), benchM, { p: [0, 0.21, -1.68], parent: scene });
  const softM = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, normalMap: fN, normalScale: new THREE.Vector2(0.9, 0.9) });
  mesh(addUV1(new THREE.BoxGeometry(1.46, 0.1, 0.52), 6), softM('#c9d6f2'), { p: [0, 0.47, -1.68], parent: scene });
  [[-0.5, '#f6c9d6'], [0.45, '#fff0c9']].forEach(([x, c]) => mesh(addUV1(new THREE.SphereGeometry(0.17, 20, 14), 3), softM(c), { p: [x, 0.66, -1.84], s: [1.1, 0.95, 0.45], r: [0.15, 0, x > 0 ? -0.2 : 0.2], parent: scene }));
  // 담요: 주름진 판
  const blGeo = addUV1(new THREE.PlaneGeometry(0.75, 0.62, 24, 20), 5);
  { const p = blGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(x * 18) * 0.012 + Math.cos(y * 14 + x * 4) * 0.01 + (1 - Math.abs(y) / 0.31) * 0.03); } blGeo.computeVertexNormals(); }
  blGeo.rotateX(-Math.PI / 2);
  const plaid = kit.canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f7d6e0'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.45)'; for (let i = 0; i < 8; i++) { g.fillRect(i * 32 + 10, 0, 8, h); g.fillRect(0, i * 32 + 10, w, 8); }
    g.fillStyle = 'rgba(190,160,220,.35)'; for (let i = 0; i < 4; i++) { g.fillRect(i * 64 + 26, 0, 4, h); g.fillRect(0, i * 64 + 26, w, 4); }
  });
  const blanket = mesh(blGeo, new THREE.MeshStandardMaterial({ map: plaid, normalMap: fN, normalScale: new THREE.Vector2(1, 1), roughness: 0.97, side: THREE.DoubleSide }), { p: [-0.25, 0.535, -1.62], r: [0, 0.2, 0], parent: scene });
  ['#c9b6e9', '#a8d4c8', '#f6c3a8'].forEach((c, i) => mesh(new THREE.BoxGeometry(0.22, 0.04, 0.16), std(c, 0.6), { p: [0.5, 0.54 + i * 0.04, -1.55], r: [0, i * 0.2, 0], parent: scene }));
  // 바닥 러그
  const rugG = addUV1(new THREE.CircleGeometry(0.8, 48), 6); rugG.rotateX(-Math.PI / 2);
  mesh(rugG, new THREE.MeshStandardMaterial({ color: '#a7b5da', roughness: 1, normalMap: fN }), { p: [0, 0.006, -0.75], cast: false, parent: scene });

  // 촛불 (나무 상자 위)
  const crate = mesh(kit.uv(new THREE.BoxGeometry(0.34, 0.4, 0.34), 0.4, 0.4), new THREE.MeshStandardMaterial({ map: plankD, normalMap: plankN, color: new THREE.Color(1.1, 0.95, 0.85), roughness: 0.8 }), { p: [0.82, 0.2, -1.12], parent: scene });
  mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.13, 24), std('#fff6e4', 0.6, { emissive: '#ffb066', emissiveIntensity: 0.15 }), { p: [0.82, 0.465, -1.12], parent: scene });
  mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.012, 24), std('#e3c27a', 0.3, { metalness: 1 }), { p: [0.82, 0.406, -1.12], parent: scene });
  const flameMat = fireMaterial();
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.12), flameMat);
  flame.geometry.translate(0, 0.06, 0);
  flame.position.set(0.82, 0.53, -1.12); flame.renderOrder = 5; scene.add(flame);
  const candleGlow = kit.glow('#ffb35c', 0.6, 0.55); candleGlow.position.set(0.82, 0.6, -1.12); scene.add(candleGlow);

  // 풍경 (창 옆 지붕에 매달림)
  const chime = new THREE.Group(); chime.position.set(-0.62, 2.18, -1.62); scene.add(chime);
  mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.3, 4), std('#ffffff', 0.6), { p: [0, 0.15, 0], parent: chime, cast: false });
  mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 24), std('#fff3e6', 0.5), { parent: chime });
  const rodM = std('#e9e2d6', 0.18, { metalness: 1 });
  const rods = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, len = 0.2 + (i % 3) * 0.06;
    const pv = new THREE.Group(); pv.position.set(Math.cos(a) * 0.055, -0.01, Math.sin(a) * 0.055); chime.add(pv);
    mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.06, 4), std('#ffffff', 0.6), { p: [0, -0.03, 0], parent: pv, cast: false });
    mesh(new THREE.CylinderGeometry(0.007, 0.007, len, 10), rodM, { p: [0, -0.06 - len / 2, 0], parent: pv });
    rods.push({ pv, ph: Math.random() * 6, amp: 0 });
  }
  const sail = mesh(new THREE.CircleGeometry(0.035, 20), std('#ffd1e0', 0.6, { side: THREE.DoubleSide }), { p: [0, -0.36, 0], parent: chime });
  const chimeHit = mesh(new THREE.BoxGeometry(0.26, 0.42, 0.26), new THREE.MeshBasicMaterial(), { p: [0, -0.18, 0], parent: chime, cast: false }); chimeHit.visible = false;

  const objects = [], fx = kit.particles(scene, { max: 140 });
  const rainGlass = glass.material.uniforms;
  let rain = 0, flameBoost = 0, chimeT = 9, flashK = 0;
  objects.push(obj('window', V(0, WIN_Y - 0.18, -D / 2 + 0.05), 0.3, [glassHit], () => {
    sound(info, 'window');
    rain = 1;
  }, { reach: 3.6 }));
  objects.push(obj('cloud', V(0.05, 2.02, -D / 2 - 1.15), 0.3, [cloud], () => {
    kit.audio.sfx('thunder', rand(0.5, 1.0));
    kit.lightning();
    bolt.visible = true; flashK = 1;
    kit.wait(0.18).then(() => { bolt.visible = false; });
  }, { reach: 4.4, priority: 1 }));
  objects.push(obj('candle', V(0.82, 0.55, -1.12), 0.1, [crate, flame], () => {
    sound(info, 'candle');
    flameBoost = 1;
    fx.emit(V(0.82, 0.62, -1.12), { n: 8, colors: ['#ffcf7a', '#ff9a4a', '#fff2c8'], speed: 0.25, up: 1.6, gravity: 0.4, life: 0.8, size: 0.012 });
  }, { reach: 3.2 }));
  objects.push(obj('chime', V(-0.62, 1.95, -1.62), 0.16, [chime], () => {
    sound(info, 'chime');
    chimeT = 0;
    rods.forEach((r) => { r.amp = rand(0.25, 0.4); r.ph = Math.random() * 6; });
  }, { reach: 3.4 }));
  objects.push(obj('blanket', V(-0.25, 0.56, -1.62), 0.3, [blanket], () => {
    sound(info, 'blanket');
    const b = blanket.userData.base || (blanket.userData.base = blanket.scale.clone());
    kit.tween(0.14, (k) => blanket.scale.set(b.x * (1 + 0.04 * k), b.y * (1 - 0.6 * k), b.z), kit.ease.out).then(() => wobble(kit, blanket, 0.35, 0.8, b));
  }, { reach: 3.2 }));

  return {
    scene, exposure: 1.08, lightK: 0.9, envK: 0.45, shadowLight: winLight, doors: [door], objects,
    bloom: { threshold: 1.1, strength: 0.4 },
    spawn: () => ({ x: 0, z: 0.9, yaw: 0, pitch: -0.12 }),
    constrain: roomConstrain(W, D, [{ x: 0, z: -1.68, hx: 0.75, hz: 0.28 }, { x: 0.82, z: -1.12, r: 0.22 }], (p) => {
      // 경사 지붕 아래 머리 닿는 곳은 피한다
      const lim = W / 2 - 0.75; p.x = clamp(p.x, -lim, lim);
    }),
    floorAt: () => 'wood',
    update(dt, t, api) {
      rainGlass.uTime.value = t;
      rain = Math.max(0, rain - dt / 3.2);
      rainGlass.uRain.value = rain;
      flameBoost = Math.max(0, flameBoost - dt / 1.4);
      flameMat.uniforms.uTime.value = t; flameMat.uniforms.uBoost.value = flameBoost;
      const fl = 1 + Math.sin(t * 13) * 0.06 + Math.sin(t * 23.7) * 0.05;
      flame.scale.set(1 + flameBoost * 0.5, fl * (1 + flameBoost * 0.9), 1);
      const cam = api.camera.position;
      flame.rotation.y = Math.atan2(cam.x - flame.position.x, cam.z - flame.position.z);
      candleL.intensity = 1.5 * fl * (1 + flameBoost * 0.8);
      candleGlow.material.opacity = 0.5 * fl * (1 + flameBoost * 0.5);
      chimeT += dt;
      rods.forEach((r, i) => {
        const e = Math.exp(-chimeT * 1.2) * r.amp + 0.02;
        r.pv.rotation.x = Math.sin(t * (3.1 + i * 0.4) + r.ph) * e;
        r.pv.rotation.z = Math.cos(t * (2.7 + i * 0.3) + r.ph) * e;
      });
      sail.rotation.y = Math.sin(t * 1.3) * 0.4;
      if (flashK > 0) { flashK = Math.max(0, flashK - dt * 2.5); winLight.intensity = 1.2 + flashK * 9; skyM.color.setScalar(1 + flashK * 1.5); }
    },
    dispose() { fx.dispose(); }
  };
}

/* ===================================================================== */
/* 🏕️ 5. 밤 캠핑 — 남색 밤하늘, 텐트, 모닥불, 숲 실루엣, 반딧불 */
function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uShine: { value: 0 } }]),
    vertexShader: `varying vec2 vUv;
      #include <common>
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime, uShine; varying vec2 vUv;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        float f = vUv.y * 10.0 - uTime * 0.7;
        float w = sin(f * 3.0 + sin(vUv.x * 11.0 + uTime) * 1.6) * 0.5 + 0.5;
        float w2 = sin(f * 5.3 - vUv.x * 7.0 + uTime * 1.9) * 0.5 + 0.5;
        float gl = pow(w * w2, 7.0) * (0.9 + uShine * 3.0);
        vec3 col = mix(vec3(0.02, 0.05, 0.13), vec3(0.07, 0.15, 0.3), w) + vec3(0.7, 0.82, 1.0) * gl;
        float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
        gl_FragColor = vec4(col, edge);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, fog: true
  });
}

function buildCamp(kit, info) {
  const { tex, mesh, std } = kit;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0f1533');
  scene.environment = kit.roomEnv;
  scene.fog = new THREE.FogExp2('#1a2148', 0.06);
  scene.add(kit.dome('#070b24', '#2b2f6e', '#3b3567', 40));
  const stars = starPoints(1100, 36, true); scene.add(stars);
  const moon = mesh(new THREE.CircleGeometry(1.4, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.55, 1.3), toneMapped: false, fog: false }), { p: [-12, 17, -26], cast: false, parent: scene });
  moon.lookAt(0, 1.5, 0);
  const moonGlow = kit.glow('#cfd8ff', 12, 0.5); moonGlow.position.copy(moon.position); moonGlow.material.fog = false; scene.add(moonGlow);

  const groundMat = new THREE.MeshStandardMaterial({ map: tex.get('sparse_grass_diff'), roughness: 1 });
  kit.patch(groundMat, { luma: { a: '#16301c', b: '#4b7a3e', lo: 0.03, hi: 0.2, macro: 0.09, detail: 0.8 } });
  const gg = kit.uv(new THREE.CircleGeometry(26, 64), 26 / 1.8); gg.rotateX(-Math.PI / 2);
  mesh(gg, groundMat, { cast: false, parent: scene });

  // 숲 실루엣 (침엽수, 한 덩어리)
  const treeParts = [];
  for (let i = 0; i < 34; i++) {
    const a = i / 34 * Math.PI * 2 + rand(-0.08, 0.08), r = rand(6.5, 12);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, s = rand(0.8, 1.4);
    if (z > 1.5 && Math.abs(x) < 3) continue;
    for (let k = 0; k < 3; k++) { const c = new THREE.ConeGeometry((1.3 - k * 0.32) * s, 1.9 * s, 9); c.translate(x, (1.4 + k * 1.05) * s, z); treeParts.push(c.toNonIndexed()); }
    const tr = new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1.2 * s, 6); tr.translate(x, 0.6 * s, z); treeParts.push(tr.toNonIndexed());
  }
  const treesGroup = new THREE.Group(); scene.add(treesGroup);
  const treeMat = std('#16302a', 0.95);
  treesGroup.add(new THREE.Mesh(mergeGeometries(treeParts), treeMat));
  treeParts.forEach((g) => g.dispose());

  const L = lights(kit, scene, { sky: '#4d5aa0', ground: '#1a2420', hemi: 0.7, sunColor: '#b9c8ff', sun: 0.9, sunPos: [-5, 8, -6], sunTarget: [0, 0, -0.6], size: 4 });
  const fireL = new THREE.PointLight('#ff9a4a', 7, 0, 2); fireL.position.set(0.35, 0.45, -0.95); scene.add(fireL);
  const tentL = new THREE.PointLight('#ffb66b', 0.8, 0, 2); tentL.position.set(-1.3, 0.45, -1.55); scene.add(tentL);

  const woodD = tex.get('wood_table_001_diff'), woodN = tex.get('wood_table_001_nor_gl');
  const fN = fleece(kit);
  const objects = [], fx = kit.particles(scene, { max: 220 });

  /* 텐트 */
  const tent = new THREE.Group(); tent.position.set(-1.3, 0, -1.6); tent.rotation.y = 0.45; scene.add(tent);
  const tentMat = new THREE.MeshStandardMaterial({ color: '#d8c4a2', roughness: 0.95, normalMap: fN, normalScale: new THREE.Vector2(0.6, 0.6), side: THREE.DoubleSide, emissive: '#ff9a4a', emissiveIntensity: 0.03 });
  const TW = 0.75, TH = 1.05, TL = 1.4, slant = Math.hypot(TW, TH);
  [-1, 1].forEach((s) => {
    const g = addUV1(new THREE.PlaneGeometry(TL, slant), 4);
    const m = mesh(g, tentMat, { parent: tent });
    m.rotation.set(0, Math.PI / 2, 0); m.rotateX(-s * (Math.PI / 2 - Math.atan2(TH, TW)));
    m.position.set(s * TW / 2, TH / 2, 0);
  });
  const triS = new THREE.Shape(); triS.moveTo(-TW, 0); triS.lineTo(TW, 0); triS.lineTo(0, TH); triS.closePath();
  mesh(addUV1(new THREE.ShapeGeometry(triS), 3), tentMat, { p: [0, 0, -TL / 2], parent: tent });
  const inner = new THREE.Shape(); inner.moveTo(-TW * 0.55, 0); inner.lineTo(TW * 0.55, 0); inner.lineTo(0, TH * 0.68); inner.closePath();
  mesh(new THREE.ShapeGeometry(inner), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.95, 0.5), toneMapped: false }), { p: [0, 0.002, TL / 2 - 0.05], parent: tent, cast: false });
  const flapS = new THREE.Shape(); flapS.moveTo(0, 0); flapS.lineTo(TW, 0); flapS.lineTo(0, TH); flapS.closePath();
  [-1, 1].forEach((s) => { const f = mesh(addUV1(new THREE.ShapeGeometry(flapS), 3), tentMat, { parent: tent }); f.position.set(s * TW * 0.5, 0, TL / 2 + 0.01); f.scale.set(s * 0.5, 0.5, 1); f.rotation.y = s * 0.35; });
  const tentGlow = kit.glow('#ffb66b', 1.3, 0.35); tentGlow.position.set(-1.3, 0.4, -1.4); scene.add(tentGlow);

  /* 모닥불 */
  const fire = new THREE.Group(); fire.position.set(0.35, 0, -0.95); scene.add(fire);
  const stoneM = std('#7d7f86', 0.9);
  for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2; mesh(new THREE.DodecahedronGeometry(0.075, 0), stoneM, { p: [Math.cos(a) * 0.3, 0.04, Math.sin(a) * 0.3], r: [i, i * 2, 0], s: [1, 0.7, 1], parent: fire }); }
  const logM = new THREE.MeshStandardMaterial({ map: woodD, normalMap: woodN, color: new THREE.Color(0.9, 0.75, 0.65), roughness: 0.85 });
  for (let i = 0; i < 4; i++) { const lg = mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.42, 10), logM, { parent: fire }); lg.position.set(0, 0.12, 0); lg.rotation.set(0.75, i * Math.PI / 2 + 0.3, 0); lg.translateY(0.05); }
  mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.45, 0.12), toneMapped: false }), { p: [0, 0.02, 0], r: [-Math.PI / 2, 0, 0], parent: fire, cast: false });
  const fireMat = fireMaterial();
  const flames = [];
  for (let i = 0; i < 2; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.7), fireMat);
    f.geometry.translate(0, 0.35, 0); f.position.set((i - 0.5) * 0.06, 0.06, (i - 0.5) * 0.04); f.renderOrder = 5;
    fire.add(f); flames.push(f);
  }
  const fireGlow = kit.glow('#ff8a3c', 2.2, 0.6); fireGlow.position.set(0.35, 0.35, -0.95); scene.add(fireGlow);
  const fireHit = mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.7, 12), new THREE.MeshBasicMaterial(), { p: [0, 0.35, 0], parent: fire, cast: false }); fireHit.visible = false;

  /* 마시멜로 꼬치 */
  const mallow = new THREE.Group(); scene.add(mallow);
  const sA = V(1.05, 0.04, -0.4), sB = V(0.52, 0.42, -0.84);
  const stick = mesh(new THREE.CylinderGeometry(0.006, 0.008, sA.distanceTo(sB), 6), std('#8a6244', 0.8), { parent: mallow });
  stick.position.copy(sA).add(sB).multiplyScalar(0.5); stick.quaternion.setFromUnitVectors(V(0, 1, 0), sB.clone().sub(sA).normalize());
  const mMat = std('#fffaf2', 0.7);
  const mBody = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.045, 18), mMat, { parent: mallow });
  mBody.position.copy(sB).addScaledVector(sB.clone().sub(sA).normalize(), -0.01); mBody.quaternion.copy(stick.quaternion);
  const mallowHit = mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial(), { parent: mallow, cast: false }); mallowHit.position.copy(mBody.position); mallowHit.visible = false;
  let toast = 0;
  const raw = new THREE.Color('#fffaf2'), gold = new THREE.Color('#d9934a'), burnt = new THREE.Color('#7a4a2a');

  /* 풀숲 */
  const bush = new THREE.Group(); bush.position.set(-1.55, 0, -0.25); scene.add(bush);
  const bushM = std('#2f5a33', 0.85);
  [[0, 0.22, 0, 0.3], [0.25, 0.16, 0.1, 0.22], [-0.22, 0.17, 0.05, 0.24], [0.05, 0.38, -0.05, 0.2], [0.1, 0.14, 0.22, 0.18]].forEach(([x, y, z, r]) => mesh(new THREE.IcosahedronGeometry(r, 2), bushM, { p: [x, y, z], parent: bush }));
  for (let i = 0; i < 7; i++) mesh(new THREE.SphereGeometry(0.018, 8, 6), std('#f7f1ff', 0.6, { emissive: '#d9ccff', emissiveIntensity: 0.4 }), { p: [rand(-0.3, 0.3), rand(0.2, 0.5), rand(-0.1, 0.3)], parent: bush, cast: false });

  /* 시냇물 */
  const sg = new THREE.PlaneGeometry(0.9, 9, 1, 60);
  { const p = sg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.sin(y * 0.5) * 0.5); } }
  sg.rotateX(-Math.PI / 2);
  const waterM = waterMaterial();
  const stream = mesh(sg, waterM, { p: [2.25, 0.015, -0.8], cast: false, recv: false, parent: scene });
  stream.renderOrder = 2;
  for (let i = 0; i < 16; i++) { const z = -4.5 + i * 0.6, x = 2.25 + Math.sin(-z * 0.5 + 0.4) * 0.5 + (i % 2 ? 0.48 : -0.48); mesh(new THREE.DodecahedronGeometry(rand(0.05, 0.1), 0), stoneM, { p: [x, 0.03, z - 0.8], s: [1, 0.6, 1], parent: scene }); }
  const streamHit = mesh(new THREE.BoxGeometry(1.1, 0.1, 4), new THREE.MeshBasicMaterial(), { p: [2.25, 0.05, -0.8], parent: scene, cast: false }); streamHit.visible = false;
  let shine = 0;

  /* 나뭇가지 위 부엉이 */
  const owlTree = new THREE.Group(); owlTree.position.set(1.55, 0, -2.25); scene.add(owlTree);
  const barkM = new THREE.MeshStandardMaterial({ map: woodD, normalMap: woodN, color: new THREE.Color(0.75, 0.62, 0.55), roughness: 0.9 });
  mesh(new THREE.CylinderGeometry(0.1, 0.15, 3.2, 10), barkM, { p: [0, 1.6, 0], parent: owlTree });
  mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.8, 8), barkM, { p: [-0.32, 1.75, 0.1], r: [0, 0, 1.35], parent: owlTree });
  mesh(new THREE.IcosahedronGeometry(0.75, 2), std('#1f3d33', 0.9), { p: [0, 3.0, 0], s: [1, 0.8, 1], parent: owlTree });
  const owl = new THREE.Group(); owl.position.set(-0.45, 1.79, 0.12); owlTree.add(owl);
  const owlM = std('#9b7a5e', 0.85), bellyM = std('#e9d7bf', 0.9);
  mesh(new THREE.SphereGeometry(0.1, 24, 16), owlM, { p: [0, 0.1, 0], s: [1, 1.25, 0.9], parent: owl });
  mesh(new THREE.SphereGeometry(0.075, 20, 14), bellyM, { p: [0, 0.08, 0.04], s: [1, 1.2, 0.7], parent: owl });
  const head = new THREE.Group(); head.position.set(0, 0.23, 0); owl.add(head);
  mesh(new THREE.SphereGeometry(0.085, 24, 16), owlM, { s: [1.1, 0.95, 0.95], parent: head });
  [-1, 1].forEach((s) => mesh(new THREE.ConeGeometry(0.025, 0.06, 8), owlM, { p: [s * 0.06, 0.08, 0], r: [0, 0, -s * 0.4], parent: head }));
  const lids = [];
  [-1, 1].forEach((s) => {
    mesh(new THREE.CircleGeometry(0.032, 20), std('#fff6e0', 0.5), { p: [s * 0.036, 0.0, 0.078], parent: head, cast: false });
    mesh(new THREE.SphereGeometry(0.02, 14, 10), std('#ffb23e', 0.25, { emissive: '#ffb23e', emissiveIntensity: 0.6 }), { p: [s * 0.036, 0.0, 0.08], s: [1, 1, 0.4], parent: head, cast: false });
    mesh(new THREE.SphereGeometry(0.01, 10, 8), std('#1a1414', 0.2), { p: [s * 0.036, 0.0, 0.089], parent: head, cast: false });
    const lidGeo = new THREE.SphereGeometry(0.037, 16, 12); lidGeo.translate(0, -0.037, 0);
    const lid = mesh(lidGeo, owlM, { p: [s * 0.036, 0.036, 0.074], s: [1, 0.06, 0.75], parent: head, cast: false });
    lids.push(lid);
  });
  mesh(new THREE.ConeGeometry(0.012, 0.03, 8), std('#e9a23b', 0.4), { p: [0, -0.035, 0.085], r: [Math.PI + 0.3, 0, 0], parent: head, cast: false });
  const owlHit = mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial(), { p: [0, 0.15, 0], parent: owl, cast: false }); owlHit.visible = false;
  const owlWorld = V(1.55 - 0.45, 1.95, -2.25 + 0.12);

  objects.push(obj('fire', V(0.35, 0.35, -0.95), 0.3, [fire], () => {
    sound(info, 'fire');
    fireBoost = 1;
    fx.emit(V(0.35, 0.3, -0.95), { n: 26, colors: ['#ffb347', '#ff7b2e', '#ffe08a'], speed: 0.5, up: 2.2, gravity: 0.6, drag: 0.8, life: 1.4, size: 0.018 });
  }, { reach: 3.4 }));
  objects.push(obj('bush', V(-1.55, 0.25, -0.25), 0.35, [bush], () => {
    sound(info, 'bush');
    shake(kit, bush, 0.12, 0.9);
    fx.emit(V(-1.55, 0.4, -0.25), { n: 12, colors: ['#e9ff8a', '#c6ff6a', '#fff7b0'], speed: 0.4, up: 0.8, gravity: 0.15, drag: 0.6, life: 2.2, size: 0.02 });
  }, { reach: 3.2 }));
  objects.push(obj('stream', V(2.2, 0.05, -0.6), 0.5, [streamHit], () => {
    sound(info, 'stream');
    shine = 1;
    for (let i = 0; i < 3; i++) fx.emit(V(2.25 + rand(-0.3, 0.3), 0.06, rand(-1.8, 0.4)), { n: 6, colors: ['#dbe8ff', '#ffffff'], speed: 0.15, up: 0.6, gravity: -0.2, life: 1.0, size: 0.016 });
  }, { reach: 3.6, stand: 1.6 }));
  objects.push(obj('owl', owlWorld, 0.18, [owl], () => {
    sound(info, 'owl');
    const blink = (k) => lids.forEach((l) => { l.scale.y = 0.06 + 0.94 * Math.sin(Math.PI * k); });
    kit.tween(0.22, blink, kit.ease.linear).then(() => kit.wait(0.12)).then(() => kit.tween(0.22, blink, kit.ease.linear));
    const tilt = rand(0.3, 0.45) * (Math.random() < 0.5 ? -1 : 1);
    kit.tween(1.4, (k) => { head.rotation.z = Math.sin(Math.PI * k) * tilt; head.rotation.y = Math.sin(Math.PI * k) * 0.2; }, kit.ease.inOut);
  }, { reach: 5.0 }));
  objects.push(obj('mallow', mBody.position.clone(), 0.07, [mallow], () => {
    sound(info, 'mallow');
    toast = Math.min(1.25, toast + 0.34);
    if (toast > 1.2) { toast = 0; }
    const c = toast < 1 ? raw.clone().lerp(gold, toast) : gold.clone().lerp(burnt, (toast - 1) * 4);
    mMat.color.copy(c);
    fx.emit(mBody.position, { n: 6, colors: ['#ffffff', '#fff3c8'], speed: 0.15, up: 1.2, gravity: 0.3, life: 0.7, size: 0.012, alpha: 0.6 });
  }, { reach: 3.2, priority: 1 }));

  let fireBoost = 0, emberT = 0, flyT = 0;
  const backD = backDoor(kit, scene, { x: 0, z: 2.55, ry: Math.PI, color: info.door, glowBase: 0.55 });

  return {
    scene, exposure: 1.15, lightK: 1, envK: 0.25, shadowLight: L.sun, doors: [backD], objects,
    bloom: { threshold: 0.95, strength: 0.5, radius: 0.5 },
    spawn: () => ({ x: 0, z: 1.25, yaw: 0, pitch: -0.18 }),
    constrain: (p) => {
      const cx = 0, cz = 0.2, r = Math.hypot(p.x - cx, p.z - cz), lim = 2.35;
      if (r > lim) { p.x = cx + (p.x - cx) / r * lim; p.z = cz + (p.z - cz) / r * lim; }
      const fxd = Math.hypot(p.x - 0.35, p.z + 0.95); if (fxd < 0.65) { p.x = 0.35 + (p.x - 0.35) / fxd * 0.65; p.z = -0.95 + (p.z + 0.95) / fxd * 0.65; }
      const td = Math.hypot(p.x + 1.3, p.z + 1.6); if (td < 1.0) { p.x = -1.3 + (p.x + 1.3) / td * 1.0; p.z = -1.6 + (p.z + 1.6) / td * 1.0; }
      if (Math.abs(p.x) < 0.75 && p.z > 2.0) p.z = 2.0;
    },
    floorAt: () => 'grass',
    update(dt, t, api) {
      stars.material.uniforms.uTime.value = t;
      fireMat.uniforms.uTime.value = t;
      fireBoost = Math.max(0, fireBoost - dt / 2);
      fireMat.uniforms.uBoost.value = fireBoost;
      const cam = api.camera.position;
      flames.forEach((f, i) => { f.rotation.y = Math.atan2(cam.x - 0.35, cam.z + 0.95) + i * 0.5; f.scale.set(1 + fireBoost * 0.4, 1 + fireBoost * 0.8 + Math.sin(t * 9 + i) * 0.05, 1); });
      const fl = 1 + Math.sin(t * 11) * 0.08 + Math.sin(t * 17.3) * 0.06;
      fireL.intensity = 3.6 * fl * (1 + fireBoost * 0.6);
      fireGlow.material.opacity = 0.55 * fl * (1 + fireBoost * 0.4);
      tentGlow.material.opacity = 0.32 + Math.sin(t * 2.1) * 0.03;
      waterM.uniforms.uTime.value = t;
      shine = Math.max(0, shine - dt / 3);
      waterM.uniforms.uShine.value = shine;
      emberT -= dt;
      if (emberT < 0) { emberT = kit.reduced ? 0.5 : 0.16; fx.emit(V(0.35 + rand(-0.08, 0.08), 0.35, -0.95 + rand(-0.08, 0.08)), { n: 1, colors: ['#ffb347', '#ff7b2e'], speed: 0.1, up: 3, gravity: 0.25, drag: 0.6, life: 1.6, size: 0.012 }); }
      flyT -= dt;
      if (flyT < 0) { flyT = kit.reduced ? 1.2 : 0.4; fx.emit(V(rand(-2.2, 2.4), rand(0.3, 1.4), rand(-2.6, 0.8)), { n: 1, colors: ['#e9ff8a', '#d4ff70'], speed: 0.12, up: 0.3, gravity: 0.02, drag: 0.3, life: 3.5, size: 0.022 }); }
    },
    dispose() { fx.dispose(); }
  };
}

/* ===================================================================== */
/* 🐚 6. 바닷속 방 — 청록 그라디언트, 빛줄기, 산호, 조개, 해파리, 먼 고래 */
function surfaceMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmp: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime, uAmp; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * 14.0;
        float a = sin(p.x * 1.3 + uTime * 0.9 + sin(p.y * 1.1 + uTime * 0.7) * (1.4 + uAmp * 1.5));
        float b = sin(p.y * 1.7 - uTime * 0.8 + sin(p.x * 0.9 - uTime * 0.6) * (1.2 + uAmp * 1.5));
        float c = pow(abs(a + b) * 0.5, 2.0 - uAmp * 0.8);
        float r = length(vUv - 0.5) * 2.0;
        vec3 col = mix(vec3(0.08, 0.32, 0.36), vec3(0.55, 0.85, 0.88), c) * (0.5 + uAmp * 0.5);
        gl_FragColor = vec4(col * smoothstep(1.0, 0.4, r), 1.0);
      }`,
    side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  });
}

function buildOcean(kit, info) {
  const { tex, mesh, std } = kit;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1c8fa0');
  scene.environment = kit.roomEnv;
  scene.fog = new THREE.FogExp2('#2aa3b3', 0.11);
  scene.add(kit.dome('#8ff0f0', '#2aa7b8', '#0f5f73', 30));

  const sandMat = new THREE.MeshStandardMaterial({ map: tex.get('sand_01_diff'), roughness: 0.95 });
  kit.patch(sandMat, { luma: { a: '#9c8a64', b: '#cdbd98', lo: 0.05, hi: 0.3, macro: 0.1, detail: 0.8 }, caustics: { scale: 1.6, amt: 0.22 } });
  const sgeo = kit.uv(new THREE.CircleGeometry(16, 64), 16 / 1.4); sgeo.rotateX(-Math.PI / 2);
  { const p = sgeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, Math.sin(x * 1.3) * Math.cos(z * 1.1) * 0.03 + Math.max(0, Math.hypot(x, z) - 4) * 0.12); } sgeo.computeVertexNormals(); }
  mesh(sgeo, sandMat, { cast: false, parent: scene });

  const L = lights(kit, scene, { sky: '#c2f7ff', ground: '#e6d4a6', hemi: 1.15, sunColor: '#e8fdff', sun: 2.3, sunPos: [0.8, 6, 0.6], sunTarget: [0, 0, -1], size: 3.5,
    points: [['#7fe8ff', 1.2, -0.6, 1.0, -0.5], ['#f2a6ff', 1.1, 0.15, 2.0, -1.1]] });

  // 빛줄기
  const beamM = kit.beam('#c8f7ff', 0.13);
  const beams = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.32, 5, 12, 1, true), beamM);
    b.position.set(-2.2 + i * 0.9, 2.1, -1.8 - (i % 3) * 0.9); b.rotation.set(0.12, 0, 0.22 - i * 0.03); b.renderOrder = 4;
    b.userData.ph = i * 1.7;
    scene.add(b); beams.push(b);
  }
  // 수면
  const surfM = surfaceMaterial();
  const surf = mesh(new THREE.PlaneGeometry(12, 12), surfM, { p: [0, 3.5, -1], r: [Math.PI / 2, 0, 0], cast: false, parent: scene });
  surf.renderOrder = -2;

  // 바위
  const rockM = std('#6f8e97', 0.85);
  const rock = (x, z, s, sy = 0.6) => mesh(new THREE.DodecahedronGeometry(s, 1), rockM, { p: [x, s * sy * 0.5, z], s: [1, sy, 1], r: [0, rand(0, 3), 0], parent: scene });
  rock(-0.6, -0.95, 0.32, 0.75); rock(0.75, -1.35, 0.3, 0.6); rock(-1.7, -1.8, 0.45, 0.7); rock(1.9, -0.6, 0.38, 0.6); rock(1.3, -2.6, 0.55, 0.7);

  // 해초 (마디 사슬)
  const kelps = [];
  const kelpM = std('#4fae7c', 0.7, { side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    let parent = new THREE.Group(); const root = parent;
    root.position.set(rand(-2.2, 2.2), 0, rand(-2.8, -1.6)); scene.add(root);
    const segs = [];
    for (let k = 0; k < 7; k++) {
      const s = new THREE.Group(); s.position.y = k ? 0.22 : 0; parent.add(s);
      mesh(new THREE.PlaneGeometry(0.09, 0.24), kelpM, { p: [0, 0.11, 0], parent: s, cast: false });
      segs.push(s); parent = s;
    }
    kelps.push({ segs, ph: rand(0, 6) });
  }

  const objects = [], fx = kit.particles(scene, { max: 240 });

  /* 산호 */
  const coral = new THREE.Group(); coral.position.set(0.75, 0.16, -1.3); scene.add(coral);
  const coralCols = ['#ff8fab', '#ffb38a', '#c9a2ff'];
  const branch = (parent, len, r, depth, col) => {
    const m = mesh(new THREE.CapsuleGeometry(r, len, 4, 10), std(col, 0.75, { emissive: col, emissiveIntensity: 0.12 }), { p: [0, len / 2, 0], parent });
    if (depth <= 0) return;
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group(); g.position.y = len * 0.9; g.rotation.set(rand(-0.6, 0.6), rand(0, 6), (i ? 1 : -1) * rand(0.35, 0.7)); parent.add(g);
      branch(g, len * 0.72, r * 0.78, depth - 1, col);
    }
    return m;
  };
  [[0, 0, 0], [0.18, -0.04, 0.1], [-0.16, -0.05, 0.08]].forEach(([x, y, z], i) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.z = (i - 1) * 0.3; coral.add(g); branch(g, 0.16, 0.022, 2, coralCols[i]); });
  const brain = mesh(new THREE.IcosahedronGeometry(0.12, 3), std('#ffcf8a', 0.8), { p: [-0.12, 0.02, 0.18], s: [1, 0.7, 1], parent: coral });
  { const p = brain.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const v = V(p.getX(i), p.getY(i), p.getZ(i)); v.multiplyScalar(1 + Math.sin(v.x * 70) * Math.sin(v.z * 70) * 0.05); p.setXYZ(i, v.x, v.y, v.z); } brain.geometry.computeVertexNormals(); }
  const coralHit = mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial(), { p: [0, 0.2, 0.05], parent: coral, cast: false }); coralHit.visible = false;

  /* 조개 + 진주 */
  const clam = new THREE.Group(); clam.position.set(-0.6, 0.27, -0.92); clam.rotation.y = 0.5; scene.add(clam);
  const shellMat = kit.phys({ color: '#ffd1dc', roughness: 0.35, iridescence: 0.9, iridescenceIOR: 1.3, sheen: 0.4, sheenColor: new THREE.Color('#ffffff'), side: THREE.DoubleSide });
  const half = (top) => {
    const g = new THREE.SphereGeometry(0.13, 40, 12, 0, Math.PI * 2, top ? 0 : Math.PI / 2, Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + Math.cos(a * 14) * 0.04; p.setX(i, x * k); p.setZ(i, z * k); }
    g.scale(1, 0.32, 0.85); g.translate(0, 0, 0.11); g.computeVertexNormals();
    return g;
  };
  const lower = new THREE.Group(); lower.position.z = -0.11; clam.add(lower);
  mesh(half(false), shellMat, { parent: lower });
  const upper = new THREE.Group(); upper.position.z = -0.11; clam.add(upper);
  mesh(half(true), shellMat, { parent: upper });
  const pearl = mesh(new THREE.SphereGeometry(0.03, 24, 16), kit.phys({ color: '#fffaf5', roughness: 0.12, clearcoat: 1, iridescence: 0.4, sheen: 1, sheenColor: new THREE.Color('#ffe9f5'), emissive: '#ffffff', emissiveIntensity: 0.05 }), { p: [0, 0.015, 0.0], parent: clam });
  const pearlGlow = kit.glow('#fff4fb', 0.35, 0); pearlGlow.position.set(0, 0.03, 0); clam.add(pearlGlow);
  let clamBusy = false;

  /* 해파리 */
  const jelly = new THREE.Group(); jelly.position.set(0.15, 1.55, -1.45); scene.add(jelly);
  const bell = mesh(new THREE.SphereGeometry(0.16, 36, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), kit.phys({ color: '#f6cdff', roughness: 0.15, transparent: true, opacity: 0.6, emissive: '#d49cff', emissiveIntensity: 0.45, side: THREE.DoubleSide, clearcoat: 1 }), { s: [1, 0.8, 1], parent: jelly, cast: false });
  const jGlow = kit.glow('#f0b8ff', 0.7, 0.45); jGlow.position.y = 0.02; jelly.add(jGlow);
  const tentM = new THREE.LineBasicMaterial({ color: '#f6d6ff', transparent: true, opacity: 0.75 });
  const tents = [];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2, r = 0.1;
    const pts = new Float32Array(14 * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const line = new THREE.Line(g, tentM); line.frustumCulled = false; jelly.add(line);
    tents.push({ g, a, r, ph: rand(0, 6), len: rand(0.35, 0.6) });
  }
  const jellyHit = mesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshBasicMaterial(), { p: [0, -0.04, 0], parent: jelly, cast: false }); jellyHit.visible = false;
  let jellyLift = 0, jellyGlow = 0;

  /* 먼 고래 */
  const whale = new THREE.Group(); whale.position.set(-5, 2.6, -8.5); scene.add(whale);
  const whaleM = std('#3c6f8e', 0.6);
  mesh(new THREE.SphereGeometry(1, 32, 20), whaleM, { s: [2.3, 0.72, 0.8], parent: whale, cast: false });
  mesh(new THREE.SphereGeometry(0.9, 24, 16), std('#d9eef2', 0.7), { p: [0.4, -0.25, 0], s: [1.9, 0.45, 0.62], parent: whale, cast: false });
  const tail = new THREE.Group(); tail.position.set(-2.1, 0.05, 0); whale.add(tail);
  mesh(new THREE.ConeGeometry(0.42, 1.2, 16), whaleM, { p: [-0.5, 0, 0], r: [0, 0, Math.PI / 2], parent: tail, cast: false });
  [-1, 1].forEach((s) => mesh(new THREE.SphereGeometry(0.5, 16, 10), whaleM, { p: [-1.15, 0, s * 0.38], s: [0.55, 0.08, 1], r: [0, s * 0.5, 0], parent: tail, cast: false }));
  [-1, 1].forEach((s) => mesh(new THREE.SphereGeometry(0.4, 14, 10), whaleM, { p: [0.6, -0.35, s * 0.62], s: [1, 0.1, 0.45], r: [s * 0.5, -0.4, 0], parent: whale, cast: false }));
  const whaleHit = mesh(new THREE.SphereGeometry(2.2, 10, 8), new THREE.MeshBasicMaterial(), { parent: whale, cast: false }); whaleHit.visible = false;
  let whaleSwim = null;
  const whaleCenter = V(0, 0, 0);

  /* 작은 물고기 떼 */
  const fishGeo = new THREE.ConeGeometry(0.035, 0.12, 8); fishGeo.rotateZ(-Math.PI / 2);
  const tailG = new THREE.ConeGeometry(0.03, 0.05, 4); tailG.rotateZ(Math.PI / 2); tailG.translate(-0.08, 0, 0);
  const fishMesh = new THREE.InstancedMesh(mergeGeometries([fishGeo.toNonIndexed(), tailG.toNonIndexed()]), std('#ffffff', 0.4, { emissiveIntensity: 0.1 }), 16);
  const fishCols = ['#ffd36e', '#ff9fb8', '#9fe0ff', '#c9b2ff'];
  const fish = [];
  for (let i = 0; i < 16; i++) { fishMesh.setColorAt(i, new THREE.Color(fishCols[i % 4])); fish.push({ r: rand(1.6, 2.6), y: rand(0.9, 2.3), sp: rand(0.25, 0.45) * (i % 2 ? 1 : -1), ph: rand(0, 6) }); }
  scene.add(fishMesh);
  const fm4 = new THREE.Matrix4(), fq = new THREE.Quaternion(), fe = new THREE.Euler(), fpv = new THREE.Vector3(), fsv = V(1, 1, 1);

  objects.push(obj('shell', V(-0.6, 0.3, -0.92), 0.14, [clam], () => {
    sound(info, 'shell');
    fx.emit(V(-0.6, 0.33, -0.92), { n: 10, colors: ['#e6fbff', '#ffffff'], speed: 0.2, up: 1.6, gravity: 0.8, drag: 0.6, life: 1.6, size: 0.016 });
    if (clamBusy) return;
    clamBusy = true;
    kit.tween(0.5, (k) => { upper.rotation.x = -0.95 * k; pearlGlow.material.opacity = 0.7 * k; }, kit.ease.out)
      .then(() => kit.wait(2.2))
      .then(() => kit.tween(0.8, (k) => { upper.rotation.x = -0.95 * (1 - k); pearlGlow.material.opacity = 0.7 * (1 - k); }, kit.ease.inOut))
      .then(() => { clamBusy = false; });
  }, { reach: 3.0 }));
  objects.push(obj('wave', V(0, 3.4, -1.0), 0.8, [surf], () => {
    sound(info, 'wave');
    kit.tween(4, (k) => { surfM.uniforms.uAmp.value = Math.sin(Math.PI * k); }, kit.ease.linear);
  }, { reach: 99, hidden: false }));
  objects.push(obj('whale', whaleCenter, 1.6, [whale], () => {
    sound(info, 'whale');
    if (whaleSwim) return;
    const x0 = whale.position.x;
    whaleSwim = kit.tween(11, (k) => { whale.position.x = x0 + (6 - x0) * k; whale.position.y = 2.6 + Math.sin(k * Math.PI * 2) * 0.4; }, kit.ease.inOut)
      .then(() => kit.tween(9, (k) => { whale.position.x = 6 - 11 * k; }, kit.ease.inOut))
      .then(() => { whaleSwim = null; });
  }, { reach: 99 }));
  objects.push(obj('coral', V(0.75, 0.35, -1.25), 0.3, [coral], () => {
    sound(info, 'coral');
    for (let i = 0; i < 3; i++) fx.emit(V(0.75 + rand(-0.15, 0.15), 0.4, -1.25 + rand(-0.1, 0.1)), { n: 5, colors: ['#e6fbff', '#ffffff', '#c8f5ff'], speed: 0.12, up: 2.4, gravity: 1.0, drag: 0.5, life: 2.0, size: 0.02 });
    wobble(kit, coral, 0.08, 0.7);
  }, { reach: 3.0 }));
  objects.push(obj('jelly', V(0.15, 1.5, -1.45), 0.22, [jelly], () => {
    sound(info, 'jelly');
    jellyGlow = 1;
    kit.tween(1.6, (k) => { jellyLift = 0.5 * k; }, kit.ease.out).then(() => kit.tween(3.5, (k) => { jellyLift = 0.5 * (1 - k); }, kit.ease.inOut));
  }, { reach: 3.2 }));

  let bubT = 0;
  const backD = backDoor(kit, scene, { x: 0, z: 2.45, ry: Math.PI, color: info.door, glowBase: 0.5 });

  return {
    scene, exposure: 1.0, lightK: 0.8, envK: 0.5, shadowLight: L.sun, doors: [backD], objects,
    bloom: { threshold: 1.3, strength: 0.35 },
    spawn: () => ({ x: 0, z: 1.15, yaw: 0, pitch: -0.12 }),
    constrain: (p) => {
      const r = Math.hypot(p.x, p.z + 0.3), lim = 2.3;
      if (r > lim) { p.x = p.x / r * lim; p.z = (p.z + 0.3) / r * lim - 0.3; }
      [[-0.6, -0.92, 0.45], [0.75, -1.3, 0.45]].forEach(([x, z, m]) => { const d = Math.hypot(p.x - x, p.z - z); if (d < m) { p.x = x + (p.x - x) / d * m; p.z = z + (p.z - z) / d * m; } });
      if (Math.abs(p.x) < 0.75 && p.z > 1.95) p.z = 1.95;
    },
    floorAt: () => 'sand',
    update(dt, t, api) {
      sandMat.userData.uTime.value = t;
      beamM.uniforms.uTime.value = t;
      surfM.uniforms.uTime.value = t;
      beams.forEach((b) => { b.rotation.z = 0.2 + Math.sin(t * 0.3 + b.userData.ph) * 0.06; });
      kelps.forEach((k) => k.segs.forEach((s, i) => { s.rotation.z = Math.sin(t * 0.9 + k.ph + i * 0.5) * 0.12; s.rotation.x = Math.cos(t * 0.7 + k.ph + i * 0.4) * 0.08; }));
      // 해파리
      jellyGlow = Math.max(0, jellyGlow - dt / 2.5);
      const pulse = Math.sin(t * 2.2);
      jelly.position.y = 1.55 + Math.sin(t * 0.8) * 0.06 + jellyLift;
      bell.scale.set(1 + pulse * 0.06, 0.8 - pulse * 0.07, 1 + pulse * 0.06);
      bell.material.emissiveIntensity = 0.45 + jellyGlow * 1.2;
      jGlow.material.opacity = 0.4 + jellyGlow * 0.5;
      tents.forEach((tn) => {
        const a = tn.g.attributes.position;
        for (let i = 0; i < 14; i++) {
          const k = i / 13;
          a.setXYZ(i, Math.cos(tn.a) * tn.r * (1 - k * 0.4) + Math.sin(t * 1.6 + tn.ph + k * 4) * 0.03 * k, -0.02 - k * tn.len, Math.sin(tn.a) * tn.r * (1 - k * 0.4) + Math.cos(t * 1.3 + tn.ph + k * 3) * 0.03 * k);
        }
        a.needsUpdate = true;
      });
      // 고래: 평소엔 멀리서 천천히
      if (!whaleSwim) whale.position.x += Math.sin(t * 0.1) * dt * 0.2;
      tail.rotation.y = Math.sin(t * 1.2) * 0.25;
      whaleCenter.copy(whale.position);
      // 물고기
      fish.forEach((f, i) => {
        const a = t * f.sp + f.ph;
        fpv.set(Math.cos(a) * f.r, f.y + Math.sin(t * 0.8 + i) * 0.1, -1.4 + Math.sin(a) * f.r * 0.6);
        fe.set(0, -a + (f.sp > 0 ? -Math.PI / 2 : Math.PI / 2), Math.sin(t * 6 + i) * 0.1);
        fq.setFromEuler(fe); fm4.compose(fpv, fq, fsv); fishMesh.setMatrixAt(i, fm4);
      });
      fishMesh.instanceMatrix.needsUpdate = true;
      bubT -= dt;
      if (bubT < 0) { bubT = kit.reduced ? 0.8 : 0.3; fx.emit(V(rand(-2, 2), 0.1, rand(-2.5, 0)), { n: 1, colors: ['#e6fbff', '#ffffff'], speed: 0.05, up: 2, gravity: 0.5, drag: 0.4, life: 3, size: 0.018, alpha: 0.7 }); }
    },
    dispose() { fx.dispose(); }
  };
}

/* ===================================================================== */
/* ✨ 숨겨진 별빛 방 — 6개 방 배경음 자장가 믹스 + "오늘도 수고했어요" */
function buildStar(kit, info) {
  const { mesh, std } = kit;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1b1640');
  scene.environment = kit.roomEnv;
  scene.add(kit.dome('#120e33', '#3a2f7a', '#5a3f86', 6));
  const stars = starPoints(900, 5.5, false, 1.2); scene.add(stars);
  const fN = fleece(kit);
  const floorG = addUV1(new THREE.CircleGeometry(3.2, 64), 10); floorG.rotateX(-Math.PI / 2);
  mesh(floorG, new THREE.MeshStandardMaterial({ color: '#cfc2ff', roughness: 1, normalMap: fN }), { cast: false, parent: scene });
  scene.add(new THREE.HemisphereLight('#a99cff', '#3a2a5f', 0.9));
  const s = kit.shadowLight('#d8ccff', 0.7, [1, 4, 1], [0, 0, -0.5], 3); scene.add(s, s.target);
  const lamp = new THREE.PointLight('#ffd9a0', 1.6, 0, 2); lamp.position.set(0, 1.3, -0.6); scene.add(lamp);
  // 쿠션
  [[-0.7, '#ffd1e0'], [0.1, '#fff0c9'], [0.85, '#d9ccff']].forEach(([x, c]) => mesh(addUV1(new THREE.SphereGeometry(0.32, 24, 16), 3), new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, normalMap: fN }), { p: [x, 0.16, -1.2 + Math.abs(x) * 0.2], s: [1.2, 0.5, 1], parent: scene }));
  // 떠 있는 별들
  const starShape = new THREE.Shape();
  for (let i = 0; i <= 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.045 : 0.1; if (!i) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
  starGeo.center();
  const starM = std('#ffe08a', 0.3, { emissive: '#ffcc55', emissiveIntensity: 0.9, metalness: 0.2 });
  const fx = kit.particles(scene, { max: 120 });
  const floaters = [];
  const objects = [];
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.42;
    const g = new THREE.Group(); g.position.set(Math.cos(a) * 1.5, 1.0 + (i % 3) * 0.35, Math.sin(a) * 1.5 - 0.2); scene.add(g);
    mesh(starGeo, starM, { parent: g, cast: false });
    const gl = kit.glow('#ffe7a8', 0.5, 0.45); g.add(gl);
    const hit = mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial(), { parent: g, cast: false }); hit.visible = false;
    const f = { g, y0: g.position.y, ph: i * 0.9, spin: 0 };
    floaters.push(f);
    objects.push(obj('star' + i, g.position, 0.12, [g], () => {
      kit.audio.sfx('twinkle');
      f.spin = 1;
      fx.emit(g.position, { n: 12, colors: ['#fff3b0', '#ffffff', '#d9ccff'], speed: 0.5, up: 0.6, gravity: -0.2, life: 1.0, size: 0.02 });
    }, { reach: 3.4 }));
  }
  const backD = backDoor(kit, scene, { x: 0, z: 2.2, ry: Math.PI, color: info.door, glowBase: 0.4, w: 0.62, h: 1.3, small: true });
  let msgTimer = 0;
  return {
    scene, exposure: 1.1, lightK: 1, envK: 0.35, shadowLight: s, doors: [backD], objects,
    bloom: { threshold: 0.95, strength: 0.5 },
    spawn: () => ({ x: 0, z: 1.0, yaw: 0, pitch: 0.08 }),
    constrain: (p) => { const r = Math.hypot(p.x, p.z), lim = 2.2; if (r > lim) { p.x *= lim / r; p.z *= lim / r; } },
    floorAt: () => 'carpet',
    enter() { msgTimer = setTimeout(() => kit.toast('오늘도 수고했어요', 6500, true), 1300); },
    exit() { clearTimeout(msgTimer); },
    update(dt, t) {
      stars.material.uniforms.uTime.value = t;
      stars.rotation.y = t * 0.02;
      floaters.forEach((f) => {
        f.g.position.y = f.y0 + Math.sin(t * 0.9 + f.ph) * 0.08;
        f.spin = Math.max(0, f.spin - dt * 0.7);
        f.g.rotation.y = Math.sin(t * 0.6 + f.ph) * 0.5 + f.spin * 12;
      });
    },
    dispose() { fx.dispose(); clearTimeout(msgTimer); }
  };
}
