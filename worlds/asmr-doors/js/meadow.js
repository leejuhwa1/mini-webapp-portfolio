/* ASMR DOORS — 잔디밭: 물리 기반 하늘 + 지평선까지 이어지는 들판 + 바람에 흔들리는 풀잎 + 민트색 문 하나 */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createDoor } from './doors.js';

export const MEADOW_TEX = ['sparse_grass_diff', 'wood_table_001_nor_gl'];

const SUN_ELEV = 38, SUN_AZ = 32;   // 해는 시작 위치의 등 뒤 오른쪽 → 문 앞면이 밝다
const PLAY_R = 27;

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function hillHeight(x, z) {
  const r = Math.hypot(x, z);
  if (r < 55) return 0;
  const k = Math.min(1, (r - 55) / 120);
  const n = Math.sin(x * 0.011) * Math.cos(z * 0.013) * 0.6 + Math.sin(x * 0.023 + 1.3) * 0.25 + Math.cos(z * 0.019 + x * 0.007) * 0.35;
  return k * k * (16 + n * 18) + Math.max(0, n) * k * 8;
}

/* 풀잎 3개짜리 덤불 하나의 형태 */
function clumpGeometry(rand) {
  const pos = [], tt = [], idx = [];
  const segs = 4;
  for (let b = 0; b < 3; b++) {
    const a = b * Math.PI * 2 / 3 + rand() * 0.8;
    const ox = (rand() - 0.5) * 0.09, oz = (rand() - 0.5) * 0.09;
    const dx = Math.cos(a), dz = Math.sin(a);
    const sx = -dz, sz = dx;
    const lean = 0.12 + rand() * 0.22;
    const w = 0.03 + rand() * 0.018;
    const hs = 0.72 + rand() * 0.4;
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const cx = ox + dx * lean * t * t, cz = oz + dz * lean * t * t, cy = t * hs;
      if (i === segs) { pos.push(cx, cy, cz); tt.push(t); break; }
      const ww = w * Math.pow(1 - t, 0.75) * 0.5;
      pos.push(cx - sx * ww, cy, cz - sz * ww, cx + sx * ww, cy, cz + sz * ww);
      tt.push(t, t);
    }
    for (let i = 0; i < segs - 1; i++) {
      const v = base + i * 2;
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
    const v = base + (segs - 1) * 2;
    idx.push(v, v + 1, v + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1));
  g.setIndex(idx);
  return g;
}

function grassMaterial(size) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector2() }, uSize: { value: size },
      uWind: { value: new THREE.Vector2(0.78, 0.62) },
      uGust: { value: 0 }, uGustT: { value: 0 }, uGustO: { value: new THREE.Vector2() },
      uHole: { value: new THREE.Vector3(0.62, -2.35, 0.55) },
      uBase: { value: new THREE.Color('#2f6a1e') }, uTip: { value: new THREE.Color('#b9e26c') },
      uLight: { value: 1.9 }
    }]),
    vertexShader: `
      attribute vec4 aOff; attribute float aT;
      uniform float uTime, uSize, uGust, uGustT; uniform vec2 uCam, uWind, uGustO; uniform vec3 uHole;
      varying float vH; varying float vVar; varying float vShade;
      #include <common>
      #include <fog_pars_vertex>
      void main(){
        vec2 wp = mod(aOff.xy - uCam + 0.5 * uSize, uSize) - 0.5 * uSize + uCam;
        float d = length(wp - uCam);
        float fade = 1.0 - smoothstep(uSize * 0.3, uSize * 0.48, d);
        float hole = smoothstep(uHole.z * 0.35, uHole.z, length(wp - uHole.xy));
        float H = aOff.z * fade * mix(0.25, 1.0, hole);
        float c = cos(aOff.w), s = sin(aOff.w);
        vec3 p = position;
        p.xz = mat2(c, -s, s, c) * p.xz;
        float hn = p.y;
        float ph = uTime * 1.5 + wp.x * 0.32 + wp.y * 0.21;
        float w = sin(ph) * 0.55 + sin(ph * 0.53 + 1.7) * 0.3 + sin(uTime * 3.3 + wp.x * 1.9 + wp.y) * 0.08;
        vec2 bend = uWind * (0.22 + 0.16 * w);
        float front = uGustT * 9.0;
        float gd = length(wp - uGustO);
        float gk = uGust * smoothstep(front + 1.5, front - 3.0, gd);
        bend += normalize(wp - uGustO + vec2(0.001)) * gk * 1.25;
        float ba = length(bend);
        vec2 bd = bend / max(ba, 0.0001);
        float ang = min(ba, 1.35) * hn;
        p.xz *= mix(0.55, 1.0, fade);
        vec3 lp = vec3(p.x, hn * H * cos(ang), p.z);
        lp.xz += bd * hn * H * sin(ang);
        vec3 world = vec3(wp.x, 0.0, wp.y) + lp;
        vec4 mvPosition = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vH = aT; vVar = fract(sin(dot(aOff.xy, vec2(12.9898, 78.233))) * 43758.5453);
        vShade = 0.85 + 0.15 * w;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 uBase, uTip; uniform float uLight;
      varying float vH; varying float vVar; varying float vShade;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        vec3 col = mix(uBase, uTip, smoothstep(0.0, 1.0, vH));
        col *= mix(vec3(0.86, 1.0, 0.78), vec3(1.12, 1.04, 0.86), vVar);
        float ao = 0.42 + 0.58 * smoothstep(0.0, 0.7, vH);
        col *= ao * uLight * vShade;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    side: THREE.DoubleSide,
    fog: true
  });
}

function cloudTexture(seed) {
  const r = rng(seed);
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 70 + r() * 370, y = 120 + (r() - 0.5) * 70 - Math.sin((x - 70) / 370 * Math.PI) * 45;
    const rad = 34 + r() * 62 * Math.sin((x - 40) / 430 * Math.PI);
    const gr = g.createRadialGradient(x, y - rad * 0.2, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.55, 'rgba(250,252,255,0.75)'); gr.addColorStop(1, 'rgba(235,242,252,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  // 아래쪽은 살짝 푸른 그늘
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, 90, 0, 220);
  sh.addColorStop(0, 'rgba(200,215,235,0)'); sh.addColorStop(1, 'rgba(176,196,226,0.55)');
  g.fillStyle = sh; g.fillRect(0, 0, 512, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.owned = true;
  return t;
}

function rainbowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uOp: { value: 0 }, uIn: { value: 0 }, uOut: { value: 1 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uOp, uIn, uOut; varying vec2 vP;
      vec3 band(float t){
        vec3 c = mix(vec3(0.58,0.35,0.95), vec3(0.3,0.55,1.0), smoothstep(0.0,0.2,t));
        c = mix(c, vec3(0.35,0.9,0.55), smoothstep(0.2,0.4,t));
        c = mix(c, vec3(1.0,0.95,0.4), smoothstep(0.4,0.6,t));
        c = mix(c, vec3(1.0,0.62,0.3), smoothstep(0.6,0.8,t));
        c = mix(c, vec3(1.0,0.38,0.42), smoothstep(0.8,1.0,t));
        return c; }
      void main(){
        float r = length(vP); float t = clamp((r - uIn) / (uOut - uIn), 0.0, 1.0);
        float a = sin(t * 3.14159) * uOp * smoothstep(0.0, 0.25, vP.y / uOut);
        gl_FragColor = vec4(band(t), a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, fog: false, toneMapped: false
  });
}

export function buildMeadow(kit) {
  const { tex, isMobile, reduced } = kit;
  const scene = new THREE.Scene();
  const rand = rng(20261107);

  /* ---------- 하늘 + 하늘로 만든 환경맵 ---------- */
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - SUN_ELEV), THREE.MathUtils.degToRad(SUN_AZ));
  const skyParams = (s) => {
    const u = s.material.uniforms;
    u.turbidity.value = 2.0; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.86;
    u.sunPosition.value.copy(sunDir);
    // Sky.js 자체 감마 곡선 때문에 sRGB 출력에서 하늘이 바래 보인다 → 대비·채도를 되살린다
    s.material.fragmentShader = s.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );',
      'vec3 sc = pow( retColor, vec3( 1.9 ) ) * 1.9; float sl = dot( sc, vec3( 0.2126, 0.7152, 0.0722 ) ); sc = mix( vec3( sl ), sc, 1.25 ); gl_FragColor = vec4( sc, 1.0 );');
  };
  const sky = new Sky(); sky.scale.setScalar(2000); skyParams(sky);
  scene.add(sky);
  const envScene = new THREE.Scene();
  const sky2 = new Sky(); sky2.scale.setScalar(100); skyParams(sky2); envScene.add(sky2);
  const env = kit.pmrem.fromScene(envScene, 0.02).texture;
  sky2.geometry.dispose(); sky2.material.dispose();
  scene.environment = env;
  scene.fog = new THREE.Fog('#cfe3f2', 40, 520);

  /* ---------- 빛: 해(그림자 1개) + 하늘/땅 반사광 ---------- */
  const sun = kit.shadowLight('#fff0d8', 2.7, [0, 0, 0], [0, 0, 0], isMobile ? 13 : 18);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#cfe8ff', '#6f9a4a', 0.55));

  /* ---------- 땅: 지평선까지 + 멀리 완만한 언덕 ---------- */
  const groundGeo = new THREE.PlaneGeometry(1600, 1600, 128, 128);
  groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, hillHeight(gp.getX(i), gp.getZ(i)));
  groundGeo.computeVertexNormals();
  kit.uv(groundGeo, 1600 / 3.4);
  const groundMat = new THREE.MeshStandardMaterial({ map: tex.get('sparse_grass_diff'), roughness: 1, metalness: 0, envMapIntensity: 0.45 });
  kit.patch(groundMat, { luma: { a: '#3f7d2b', b: '#a9dc66', lo: 0.03, hi: 0.2, macro: 0.071, detail: 0.8 } });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  /* ---------- 풀잎: 카메라 주변을 감싸는 InstancedMesh, 셰이더로 바람에 흔들림 ---------- */
  const size = isMobile ? 26 : 36;
  const N = isMobile ? 4600 : 13000;            // 덤불 1개 = 풀잎 3개 → 모바일 약 1.4만 / PC 약 3.9만
  const clump = clumpGeometry(rand);
  const grassMat = grassMaterial(size);
  const grass = new THREE.InstancedMesh(clump, grassMat, N);
  const off = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    off[i * 4] = rand() * size; off[i * 4 + 1] = rand() * size;
    off[i * 4 + 2] = 0.24 + Math.pow(rand(), 1.6) * 0.34;
    off[i * 4 + 3] = rand() * Math.PI * 2;
  }
  clump.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  grass.frustumCulled = false;
  scene.add(grass);

  /* ---------- 들꽃 ---------- */
  const petal = new THREE.Shape();
  for (let i = 0; i <= 60; i++) {
    const a = i / 60 * Math.PI * 2, r = 0.026 * (0.55 + 0.45 * Math.abs(Math.cos(a * 2.5)));
    if (i === 0) petal.moveTo(Math.cos(a) * r, Math.sin(a) * r); else petal.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const petalGeo = new THREE.ShapeGeometry(petal); petalGeo.rotateX(-Math.PI / 2);
  const centerGeo = new THREE.SphereGeometry(0.008, 8, 6); centerGeo.translate(0, 0.004, 0);
  const FN = isMobile ? 220 : 420;
  const flowers = new THREE.InstancedMesh(petalGeo, new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.06 }), FN);
  const centers = new THREE.InstancedMesh(centerGeo, new THREE.MeshStandardMaterial({ color: '#ffc93c', roughness: 0.6 }), FN);
  const fcols = ['#ffffff', '#fff7fb', '#ffd6e7', '#fff3a8', '#e9dcff'];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < FN; i++) {
    let x, z;
    do { const a = rand() * Math.PI * 2, r = 2 + Math.sqrt(rand()) * 24; x = Math.cos(a) * r; z = Math.sin(a) * r; } while (Math.abs(x) < 1 && Math.abs(z) < 1);
    e.set((rand() - 0.5) * 0.6, rand() * Math.PI, (rand() - 0.5) * 0.6);
    q.setFromEuler(e); v.set(x, 0.22 + rand() * 0.22, z); sc.setScalar(0.8 + rand() * 0.7);
    m4.compose(v, q, sc);
    flowers.setMatrixAt(i, m4); centers.setMatrixAt(i, m4);
    flowers.setColorAt(i, new THREE.Color(fcols[(rand() * fcols.length) | 0]));
  }
  scene.add(flowers, centers);

  /* ---------- 먼 나무들 (두 덩어리로 합침) ---------- */
  const trunks = [], crowns = [];
  const tcol = new THREE.Color(), ccol = new THREE.Color();
  for (let i = 0; i < 22; i++) {
    let a = rand() * Math.PI * 2;
    if (Math.abs(Math.sin(a)) > 0.92 && Math.cos(a) < 0.3) a += 0.6;   // 문 바로 뒤 정면은 비워 둔다
    const r = 70 + rand() * 120, x = Math.cos(a) * r, z = Math.sin(a) * r, y = hillHeight(x, z);
    const s = 0.8 + rand() * 0.9;
    const tr = new THREE.CylinderGeometry(0.22 * s, 0.34 * s, 4.2 * s, 7); tr.translate(x, y + 2.1 * s, z);
    tcol.set('#6b4c35'); const tn = tr.attributes.position.count; tr.setAttribute('color', new THREE.Float32BufferAttribute(new Array(tn).fill(0).flatMap(() => [tcol.r, tcol.g, tcol.b]), 3));
    trunks.push(tr.toNonIndexed ? tr : tr);
    const blobs = 3 + ((rand() * 3) | 0);
    ccol.setHSL(0.27 + rand() * 0.06, 0.45 + rand() * 0.15, 0.24 + rand() * 0.08);
    for (let b = 0; b < blobs; b++) {
      const cg = new THREE.IcosahedronGeometry((2.2 + rand() * 1.4) * s, 2);
      cg.translate(x + (rand() - 0.5) * 2.4 * s, y + (4.6 + rand() * 2.2) * s, z + (rand() - 0.5) * 2.4 * s);
      const cn = cg.attributes.position.count;
      const arr = new Float32Array(cn * 3);
      const f = 0.85 + rand() * 0.3;
      // 덩어리마다 한 가지 톤 + 아래쪽은 살짝 어둡게 (각진 얼룩 없이)
      for (let k = 0; k < cn; k++) {
        const sh = 0.8 + 0.2 * Math.min(1, Math.max(0, cg.attributes.position.getY(k) - y - 3.2 * s) / (3 * s));
        arr[k * 3] = ccol.r * f * sh; arr[k * 3 + 1] = ccol.g * f * sh; arr[k * 3 + 2] = ccol.b * f * sh;
      }
      cg.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      crowns.push(cg);
    }
  }
  const trunkGeo = mergeGeometries(trunks.map((g) => (g.index ? g.toNonIndexed() : g)));
  const crownGeo = mergeGeometries(crowns.map((g) => (g.index ? g.toNonIndexed() : g)));
  trunks.forEach((g) => g.dispose()); crowns.forEach((g) => g.dispose());
  scene.add(new THREE.Mesh(trunkGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
  scene.add(new THREE.Mesh(crownGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, envMapIntensity: 0.6 })));

  /* ---------- 부드러운 구름 스프라이트 ---------- */
  const cloudTex = [cloudTexture(11), cloudTexture(29), cloudTexture(47)];
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.SpriteMaterial({ map: cloudTex[i % 3], color: new THREE.Color(2.5, 2.5, 2.6), transparent: true, opacity: 0.95, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m);
    const a = -Math.PI / 2 + (rand() - 0.5) * Math.PI * 1.7;
    const r = 520 + rand() * 520;
    s.position.set(Math.cos(a) * r, 140 + rand() * 210, Math.sin(a) * r);
    const w = 260 + rand() * 300;
    s.scale.set(w, w * 0.5, 1);
    s.userData.speed = 1.5 + rand() * 2.5;
    s.renderOrder = -5;
    scene.add(s); clouds.push(s);
  }

  /* ---------- 문: 크림색 문틀 + 연한 민트색 나무 문, 동그란 금색 손잡이 ---------- */
  const nm = tex.get('wood_table_001_nor_gl');
  const door = createDoor({ color: '#76cfae', frame: '#fff0da', glow: '#ffe2a6', glowBase: 0.22, normalMap: nm, w: 1.0, h: 2.12 });
  scene.add(door.group);
  // 문 앞 디딤돌 하나
  const step = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.06, 28), new THREE.MeshStandardMaterial({ color: '#a9a294', roughness: 0.9 }));
  step.scale.set(1.25, 1, 0.75); step.position.set(0.02, 0.02, 0.62); step.receiveShadow = true; step.castShadow = true;
  scene.add(step);

  /* ---------- 숨겨진 요소 ②: 문 뒤편의 네잎클로버 ---------- */
  const clover = new THREE.Group();
  const heart = new THREE.Shape();
  heart.moveTo(0, 0); heart.bezierCurveTo(-0.55, 0.45, -0.5, 1.05, 0, 0.78); heart.bezierCurveTo(0.5, 1.05, 0.55, 0.45, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(heart, 10); leafGeo.scale(0.055, 0.055, 0.055);
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3fa34a', roughness: 0.55, side: THREE.DoubleSide, emissive: '#1f6b25', emissiveIntensity: 0.25 });
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(leafGeo, leafMat);
    l.rotation.order = 'YXZ'; l.rotation.y = i * Math.PI / 2 + 0.3; l.rotation.x = -1.15;
    l.castShadow = true;
    clover.add(l);
  }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.16, 6), leafMat);
  stem.position.y = -0.08; clover.add(stem);
  clover.position.set(0.62, 0.17, -2.35);
  scene.add(clover);
  const cloverGlow = kit.glow('#fffbd0', 0.32, 0.3); cloverGlow.position.set(0.62, 0.2, -2.35); scene.add(cloverGlow);
  const cloverHit = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial());
  cloverHit.visible = false; cloverHit.position.copy(clover.position);
  scene.add(cloverHit);

  /* 무지개 */
  const rIn = 300, rOut = 345;
  const rainbow = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 128, 1, 0, Math.PI), rainbowMaterial());
  rainbow.material.uniforms.uIn.value = rIn; rainbow.material.uniforms.uOut.value = rOut;
  rainbow.visible = false; rainbow.renderOrder = -4;
  scene.add(rainbow);

  kit.envScale(scene, 0.5);
  const motes = kit.particles(scene, { max: 90 });
  let moteT = 0;
  let gust = { on: false, t: 0 }, bow = { on: false, t: 0 }, cloverSpin = 0;

  const cloverObj = {
    id: 'clover', center: new THREE.Vector3(0.62, 0.2, -2.35), radius: 0.12, reach: 3.0, stand: 1.0, hidden: true,
    meshes: [cloverHit],
    tap() {
      if (gust.on) return;
      kit.audio.sfx('gust');
      gust = { on: true, t: 0 };
      grassMat.uniforms.uGustO.value.set(clover.position.x, clover.position.z);
      // 지금 바라보는 쪽 하늘에 무지개
      const cam = kit.camera;
      const dir = new THREE.Vector3(); cam.getWorldDirection(dir); dir.y = 0; dir.normalize();
      rainbow.position.set(cam.position.x + dir.x * 700, -120, cam.position.z + dir.z * 700);
      rainbow.lookAt(cam.position.x, -120, cam.position.z);
      bow = { on: true, t: 0 }; rainbow.visible = true;
      cloverSpin = 1;
      motes.emit(clover.position, { n: 22, colors: ['#fff7c2', '#ffffff', '#c9f7b7'], speed: 0.9, up: 1.2, life: 1.4, gravity: 0.2, size: 0.03 });
    }
  };

  const doors = [{ door, id: 'meadow-door', label: '들어가기', target: 'hall', pitch: 1.0, x: 0, z: 0, nx: 0, nz: 1 }];

  function constrain(p) {
    const r = Math.hypot(p.x, p.z);
    if (r > PLAY_R) { p.x *= PLAY_R / r; p.z *= PLAY_R / r; }
    // 문(문틀) 충돌: 얇은 상자
    const hx = 0.72, hz = 0.32;
    if (Math.abs(p.x) < hx && Math.abs(p.z) < hz) {
      const ox = hx - Math.abs(p.x), oz = hz - Math.abs(p.z);
      if (ox < oz) p.x = Math.sign(p.x || 1) * hx; else p.z = Math.sign(p.z || 1) * hz;
    }
  }

  return {
    id: 'meadow', scene, exposure: 0.52, eye: 1.55, debug: { sky, clouds, groundMat, grassMat, sun },
    bloom: { off: true },
    shadowLight: sun,
    doors, objects: [cloverObj],
    spawn(from) {
      if (from === 'hall') return { x: 0, z: 2.3, yaw: Math.PI, pitch: -0.05 };
      return { x: 0, z: 12, yaw: 0, pitch: 0.0 };
    },
    constrain,
    floorAt: () => 'grass',
    setGrass(f) { grass.count = Math.max(500, Math.floor(N * f)); },
    update(dt, t, api) {
      const c = api.controls;
      const u = grassMat.uniforms;
      u.uTime.value = reduced ? t * 0.4 : t;
      u.uCam.value.set(c.x, c.z);
      // 해 그림자는 사람을 따라간다
      sun.position.set(c.x + sunDir.x * 40, sunDir.y * 40, c.z + sunDir.z * 40);
      sun.target.position.set(c.x, 0, c.z);
      clouds.forEach((s) => { s.position.x += s.userData.speed * dt; if (s.position.x > 1100) s.position.x -= 2200; });
      if (gust.on) {
        gust.t += dt;
        u.uGustT.value = gust.t;
        u.uGust.value = gust.t < 2.2 ? 1 : Math.max(0, 1 - (gust.t - 2.2) / 2.2);
        if (gust.t > 4.6) { gust.on = false; u.uGust.value = 0; }
      }
      if (bow.on) {
        bow.t += dt;
        const k = bow.t < 1.6 ? bow.t / 1.6 : bow.t < 6 ? 1 : Math.max(0, 1 - (bow.t - 6) / 2.5);
        rainbow.material.uniforms.uOp.value = k * 0.5;
        if (bow.t > 8.6) { bow.on = false; rainbow.visible = false; }
      }
      if (cloverSpin > 0) { cloverSpin = Math.max(0, cloverSpin - dt * 0.8); clover.rotation.y += dt * 9 * cloverSpin; }
      clover.rotation.z = Math.sin(t * 1.6) * 0.06;
      cloverGlow.material.opacity = 0.18 + 0.12 * Math.sin(t * 2.4);
      // 문 주변을 떠다니는 작은 빛
      moteT -= dt;
      if (moteT < 0 && !reduced) {
        moteT = 0.35;
        motes.emit({ x: (Math.random() - 0.5) * 3, y: 0.4 + Math.random() * 1.6, z: (Math.random() - 0.5) * 3 + 0.5 },
          { n: 1, colors: ['#fff6cf', '#ffffff'], speed: 0.08, up: 0.4, gravity: 0.03, drag: 0.2, life: 4, size: 0.025, alpha: 0.8 });
      }
    },
    dispose() { /* 잔디밭은 캐시 유지 */ }
  };
}
