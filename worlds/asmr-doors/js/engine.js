/* ASMR DOORS — 엔진: 렌더러·루프·품질 자동 조절·장면 전환·공용 도구(kit) */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FPControls, wrapAngle } from './controls.js';
import { buildMeadow, MEADOW_TEX } from './meadow.js';
import { buildHall, HALL_TEX } from './hall.js';
import { ROOMS, STAR, buildRoom } from './rooms.js';

const $ = (id) => document.getElementById(id);
const coarse = matchMedia('(pointer: coarse)').matches;
const isMobile = coarse || Math.min(screen.width, screen.height) < 600;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const VISIT_KEY = 'asmrdoors.visited';
const TEX_DIR = 'assets/textures/';

export const ease = {
  linear: (k) => k,
  inOut: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  in: (k) => k * k,
  out: (k) => 1 - (1 - k) * (1 - k),
  sine: (k) => 0.5 - Math.cos(Math.PI * k) / 2
};

export async function start({ audio, onProgress, onReady, onFail }) {
  /* ---------- 렌더러 ---------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: 'high-performance', alpha: false });
  } catch (e) { console.warn('[ASMR DOORS] WebGL 시작 실패', e); onFail(); return; }

  const Q = {
    pr: isMobile ? 1.5 : 2,
    shadow: isMobile ? 512 : 2048,
    shadows: true,
    grass: 1,
    bloom: !isMobile,
    level: 0
  };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('stage').appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2600);
  function fitCamera() {
    const w = window.innerWidth, h = window.innerHeight, aspect = w / h;
    let v = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(64) / 2) / aspect);
    v = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(v), 56, 86);
    camera.fov = v; camera.aspect = aspect; camera.updateProjectionMatrix();
  }
  fitCamera();

  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  /* ---------- 질감 로더 (캐시 + 장면별 해제) ---------- */
  const texCache = new Map();
  const pinned = new Set([...MEADOW_TEX, ...HALL_TEX]);
  const tLoader = new THREE.TextureLoader();
  const aniso = Math.min(isMobile ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
  function texEntry(key) {
    let e = texCache.get(key);
    if (e) return e;
    e = {};
    let resolve;
    e.p = new Promise((r) => { resolve = r; });
    e.tex = tLoader.load(TEX_DIR + key + '_1k.jpg', () => { e.done = true; resolve(e.tex); }, undefined, () => {
      console.warn('[ASMR DOORS] 질감을 불러오지 못했어요:', key);
      e.done = true; resolve(e.tex);
    });
    e.tex.wrapS = e.tex.wrapT = THREE.RepeatWrapping;
    e.tex.anisotropy = aniso;
    if (key.endsWith('_diff')) e.tex.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, e);
    return e;
  }
  const tex = {
    get: (key) => texEntry(key).tex,
    load: (keys, onEach) => Promise.all((keys || []).map((k) => texEntry(k).p.then((t) => { if (onEach) onEach(); return t; }))),
    prefetch: (keys) => { (keys || []).forEach(texEntry); },
    release(keys) {
      (keys || []).forEach((k) => {
        if (pinned.has(k)) return;
        const e = texCache.get(k);
        if (e) { e.tex.dispose(); texCache.delete(k); }
      });
    }
  };

  /* ---------- 트윈 (렌더 루프 시간 기준) ---------- */
  const tweens = new Set();
  let scopeId = 'boot';
  function tween(dur, fn, ez = ease.inOut) {
    return new Promise((res) => {
      tweens.add({ t: 0, dur: Math.max(0.0001, dur), fn, ez, res, scope: scopeId });
    });
  }
  const wait = (s) => tween(s, () => {}, ease.linear);
  function cancelTweens(scope) {
    tweens.forEach((tw) => { if (tw.scope === scope) { tweens.delete(tw); tw.res(); } });
  }

  /* ---------- 공용 텍스처/재질 도구 ---------- */
  const glowCanvasTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.5)');
    gr.addColorStop(0.65, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  function uv(geo, sx, sy = sx) {
    const a = geo.attributes.uv;
    for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * sx, a.getY(i) * sy);
    a.needsUpdate = true;
    return geo;
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    t.userData.owned = true;
    return t;
  }
  function std(color, rough = 0.6, extra = {}) {
    return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: 0 }, extra));
  }
  function phys(params) { return new THREE.MeshPhysicalMaterial(params); }
  function mesh(geo, mat, o = {}) {
    const m = new THREE.Mesh(geo, mat);
    if (o.p) m.position.set(o.p[0], o.p[1], o.p[2]);
    if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
    if (o.s != null) { if (typeof o.s === 'number') m.scale.setScalar(o.s); else m.scale.set(o.s[0], o.s[1], o.s[2]); }
    m.castShadow = o.cast ?? true; m.receiveShadow = o.recv ?? true;
    if (o.parent) o.parent.add(m);
    return m;
  }
  function lathe(pts, segs = 32) {
    return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), segs);
  }
  function glow(color = '#fff2c8', size = 1, opacity = 0.7) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowCanvasTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false
    }));
    s.scale.setScalar(size);
    s.renderOrder = 5;
    return s;
  }

  /* 재질 패치: 질감 밝기→두 색 섞기(luma), 세로 줄무늬 벽지(stripes), 물결 빛(caustics) */
  function patch(mat, o) {
    const key = 'p' + JSON.stringify(o);
    mat.customProgramCacheKey = () => key;
    if (o.caustics) mat.userData.uTime = { value: 0 };
    const uA = { value: new THREE.Color(o.luma ? o.luma.a : '#fff') };
    const uB = { value: new THREE.Color(o.luma ? o.luma.b : '#fff') };
    mat.onBeforeCompile = (sh) => {
      let frag = sh.fragmentShader;
      if (o.luma) {
        sh.uniforms.uLA = uA; sh.uniforms.uLB = uB;
        const L = o.luma;
        frag = 'uniform vec3 uLA;\nuniform vec3 uLB;\n' + frag.replace('#include <map_fragment>', `
#ifdef USE_MAP
  vec4 texelColor = texture2D( map, vMapUv );
  float lum = dot( texelColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  ${L.macro ? `float lumM = dot( texture2D( map, vMapUv * ${L.macro.toFixed(4)} + vec2(0.37, 0.71) ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) ); lum = mix( lum, lumM, 0.4 );` : ''}
  float lk = smoothstep( ${L.lo.toFixed(4)}, ${L.hi.toFixed(4)}, lum );
  diffuseColor.rgb *= mix( uLA, uLB, lk ) * ( ${(L.detail ?? 0.85).toFixed(3)} + ${(1 - (L.detail ?? 0.85)).toFixed(3)} * 2.0 * lk );
#endif`);
      }
      if (o.stripes) {
        const s = o.stripes;
        frag = frag.replace('#include <color_fragment>', `#include <color_fragment>
#ifdef USE_MAP
  float stp = smoothstep( 0.46, 0.5, abs( fract( vMapUv.x * ${s.freq.toFixed(3)} ) - 0.5 ) );
  diffuseColor.rgb *= mix( vec3(1.0), vec3(${new THREE.Color(s.tint || '#f2e3c8').toArray().map((v) => v.toFixed(3)).join(',')}), stp * ${(s.amt ?? 0.6).toFixed(3)} );
#endif`);
      }
      if (o.caustics) {
        sh.uniforms.uTime = mat.userData.uTime;
        sh.vertexShader = 'varying vec3 vWPosC;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWPosC = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
        frag = 'uniform float uTime;\nvarying vec3 vWPosC;\n' + frag.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    vec2 cp = vWPosC.xz * ${(o.caustics.scale ?? 1.7).toFixed(3)};
    float c1 = sin( cp.x * 3.1 + uTime * 1.3 + sin( cp.y * 2.3 + uTime ) );
    float c2 = sin( cp.y * 2.7 - uTime * 1.1 + sin( cp.x * 1.9 - uTime * 0.7 ) );
    float cc = pow( abs( c1 + c2 ) * 0.5, 3.0 );
    totalEmissiveRadiance += vec3( 0.55, 0.95, 1.0 ) * cc * ${(o.caustics.amt ?? 0.35).toFixed(3)};
  }`);
      }
      sh.fragmentShader = frag;
    };
    mat.needsUpdate = true;
    return mat;
  }

  /* 가짜 볼륨 광(가산 원뿔): 시선과 평행한 가장자리는 옅게 */
  function beam(color = '#fff1c8', opacity = 0.35) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          float edge = pow( abs( dot( normalize(vN), normalize(vV) ) ), 1.8 );
          float along = smoothstep( 0.0, 0.25, vUv.y ) * ( 0.3 + 0.7 * vUv.y );
          float sh = 0.85 + 0.15 * sin( uTime * 0.6 + vUv.x * 18.0 );
          // 가산 빛은 화면 공간에서 그대로 더한다 (sRGB 인코딩이 옅은 값을 과하게 키우지 않게)
          gl_FragColor = vec4( uColor * edge * along * uOpacity * sh, 1.0 );
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false
    });
  }

  /* 그라디언트 하늘 돔 */
  function dome(top, mid, bottom, radius = 60) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uTop: { value: new THREE.Color(top) }, uMid: { value: new THREE.Color(mid) }, uBot: { value: new THREE.Color(bottom) } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(uMid, uTop, pow(h, 0.7)) : mix(uMid, uBot, pow(-h, 0.5));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false
    });
    const d = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), m);
    d.renderOrder = -10;
    return d;
  }

  /* 파티클 풀 (반짝이, 불티, 부스러기, 기포) */
  const particleSystems = new Set();
  let pScale = 400;
  function particles(scene, o = {}) {
    const max = o.max || 260;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), al = new Float32Array(max), sz = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: pScale } },
      vertexShader: `attribute vec3 aColor; attribute float aAlpha; attribute float aSize; uniform float uScale; varying vec3 vC; varying float vA;
        void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.05, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, ${o.hard ? '0.32' : '0.0'}, d) * vA; if (a < 0.01) discard;
          gl_FragColor = vec4(vC, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: false
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; pts.renderOrder = 6;
    scene.add(pts);
    const P = [];
    for (let i = 0; i < max; i++) P.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, size: 0, a: 1 });
    let head = 0;
    const tmpC = new THREE.Color();
    const sys = {
      mat,
      emit(p, e = {}) {
        const n = reduced ? Math.ceil((e.n || 12) / 2) : (e.n || 12);
        const colors = e.colors || ['#ffffff'];
        for (let k = 0; k < n; k++) {
          const i = head; head = (head + 1) % max;
          const q = P[i];
          const sp = (e.speed ?? 0.8) * (0.4 + Math.random() * 0.8);
          const th = Math.random() * Math.PI * 2, up = e.up ?? 0.6;
          const sprd = e.spread ?? 1;
          q.vx = Math.cos(th) * sp * sprd + (e.vx || 0); q.vz = Math.sin(th) * sp * sprd + (e.vz || 0);
          q.vy = (up + Math.random() * up) * sp + (e.vy || 0);
          q.g = e.gravity ?? -1.6; q.drag = e.drag ?? 1.2;
          q.max = q.life = (e.life ?? 0.9) * (0.7 + Math.random() * 0.6);
          q.size = (e.size ?? 0.035) * (0.6 + Math.random() * 0.8);
          q.a = e.alpha ?? 1;
          const j = e.jitter ?? 0.03;
          pos[i * 3] = p.x + (Math.random() - 0.5) * j * 2; pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * j * 2; pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * j * 2;
          tmpC.set(colors[(Math.random() * colors.length) | 0]);
          col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
        }
        geo.attributes.aColor.needsUpdate = true;
      },
      update(dt) {
        let any = false;
        for (let i = 0; i < max; i++) {
          const q = P[i];
          if (q.life <= 0) { if (al[i] !== 0) { al[i] = 0; any = true; } continue; }
          any = true;
          q.life -= dt;
          const dg = Math.exp(-q.drag * dt);
          q.vx *= dg; q.vz *= dg; q.vy = q.vy * dg + q.g * dt;
          pos[i * 3] += q.vx * dt; pos[i * 3 + 1] += q.vy * dt; pos[i * 3 + 2] += q.vz * dt;
          const k = Math.max(0, q.life / q.max);
          al[i] = q.a * Math.min(1, k * 2.5);
          sz[i] = q.size * (0.6 + 0.4 * k);
        }
        if (any) {
          geo.attributes.position.needsUpdate = true; geo.attributes.aAlpha.needsUpdate = true; geo.attributes.aSize.needsUpdate = true;
        }
      },
      dispose() { particleSystems.delete(sys); geo.dispose(); mat.dispose(); scene.remove(pts); }
    };
    particleSystems.add(sys);
    return sys;
  }

  /* 글자 판(명패 등) */
  function label(text, o = {}) {
    const W = o.cw || 512, H = o.ch || 160;
    const t = canvasTex(W, H, (g) => {
      const r = o.radius ?? 36;
      g.fillStyle = o.bg || '#fff8ea';
      g.beginPath(); g.moveTo(r, 6); g.arcTo(W - 6, 6, W - 6, H - 6, r); g.arcTo(W - 6, H - 6, 6, H - 6, r); g.arcTo(6, H - 6, 6, 6, r); g.arcTo(6, 6, W - 6, 6, r); g.closePath(); g.fill();
      if (o.border !== false) { g.lineWidth = 8; g.strokeStyle = o.border || '#e9c46a'; g.stroke(); }
      g.fillStyle = o.color || '#5b4630';
      g.font = `700 ${o.font || 64}px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, W / 2, H / 2 + 4);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w || 0.62, (o.w || 0.62) * H / W), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
    return m;
  }

  /* 실시간 그림자를 만드는 빛 (장면마다 1개) */
  function shadowLight(color, intensity, pos, target, size = 6) {
    const l = new THREE.DirectionalLight(color, intensity);
    l.position.set(pos[0], pos[1], pos[2]);
    l.target.position.set(target[0], target[1], target[2]);
    l.castShadow = Q.shadows;
    const c = l.shadow.camera;
    c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.near = 0.5; c.far = 80;
    l.shadow.mapSize.set(Q.shadow, Q.shadow);
    l.shadow.bias = -0.0004; l.shadow.normalBias = 0.025;
    l.shadow.radius = 3;
    return l;
  }

  function envScale(scene, k) {
    scene.traverse((o) => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach((m) => { if (m && m.isMeshStandardMaterial) m.envMapIntensity = (m.userData.envBase ?? 1) * k; });
    });
  }

  /* 방문 기록 (숨겨진 일곱 번째 문) */
  const visited = new Set();
  try { (JSON.parse(localStorage.getItem(VISIT_KEY) || '[]') || []).forEach((v) => visited.add(v)); } catch (e) { /* 무시 */ }
  function visit(id) {
    if (visited.has(id) || !ROOMS.some((r) => r.id === id)) return;
    visited.add(id);
    try { localStorage.setItem(VISIT_KEY, JSON.stringify([...visited])); } catch (e) { /* 무시 */ }
  }

  /* 화면 연출 */
  const flashEl = $('flash');
  function flash(kind = 'gold') { flashEl.className = kind === 'gold' ? '' : kind; }
  let toastTimer = 0;
  function toast(msg, ms = 2600, night = false) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.toggle('night', night);
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), ms);
  }
  async function lightning() {
    flash('white');
    flashEl.style.opacity = '0.85';
    await wait(0.06);
    flashEl.style.opacity = '0.1';
    await wait(0.07);
    flashEl.style.opacity = '0.6';
    await tween(0.35, (k) => { flashEl.style.opacity = String(0.6 * (1 - k)); });
    flashEl.style.opacity = '0';
  }

  const kit = {
    THREE, renderer, pmrem, roomEnv, isMobile, reduced, Q, audio,
    tex, tween, wait, ease, uv, canvasTex, std, phys, mesh, lathe, glow, glowTex: glowCanvasTex,
    patch, beam, dome, particles, label, shadowLight, envScale,
    visited, visit, toast, lightning,
    camera
  };

  /* ---------- PC 전용 블룸 ---------- */
  let composer = null, renderPass = null, bloomPass = null;
  async function setupBloom() {
    if (!Q.bloom) return;
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'),
        import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'),
        import('three/addons/postprocessing/OutputPass.js')
      ]);
      composer = new EffectComposer(renderer);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(window.innerWidth, window.innerHeight);
      renderPass = new RenderPass(new THREE.Scene(), camera);
      bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.55, 0.9);
      composer.addPass(renderPass); composer.addPass(bloomPass); composer.addPass(new OutputPass());
      if (cur) applyBloom(cur);
    } catch (e) { console.warn('[ASMR DOORS] 블룸 없이 진행', e); composer = null; }
  }
  function applyBloom(sc) {
    if (!bloomPass) return;
    const b = sc.bloom || {};
    bloomPass.strength = b.strength ?? 0.3;
    bloomPass.threshold = b.threshold ?? 1.3;
    bloomPass.radius = b.radius ?? 0.45;
    renderPass.scene = sc.scene;
  }

  /* ---------- 조작 ---------- */
  const ui = {
    action: $('actionBtn'), back: $('backBtn'), backB: $('backBottom'), title: $('roomTitle'),
    tapHint: $('tapHint'), soundWait: $('soundWait'), hint: $('hint'), joy: $('joy')
  };
  const controls = new FPControls(renderer.domElement, { joy: ui.joy, knob: ui.joy.querySelector('.joy-knob') }, {
    reduced,
    onTap: (x, y) => onTap(x, y),
    onStep: (foot) => { if (cur && !busy) audio.step(cur.floorAt(controls.x, controls.z), foot); },
    onAction: () => { if (activeDoor && !busy) enterDoor(activeDoor); },
    onBack: () => backToHall(),
    onFirstMove: () => hideHint()
  });

  /* ---------- 장면 관리 ---------- */
  const built = {};
  let cur = null, busy = false, activeDoor = null, time = 0;
  const roomById = (id) => ROOMS.find((r) => r.id === id) || (id === STAR.id ? STAR : null);
  const texFor = (id) => (id === 'meadow' ? MEADOW_TEX : id === 'hall' ? HALL_TEX : (roomById(id) || {}).tex || []);

  function prepare(sc) {
    sc.pickables = [];
    (sc.doors || []).forEach((d) => {
      d.fx = d.x + d.nx * 1.15; d.fz = d.z + d.nz * 1.15;
      d.look = new THREE.Vector3(d.x, 1.35, d.z);
      d.door.hits.forEach((m) => { m.userData.pick = { kind: 'door', ref: d }; sc.pickables.push(m); });
    });
    (sc.objects || []).forEach((o) => {
      (o.meshes || []).forEach((root) => root.traverse((m) => {
        if (m.isMesh || m.isSprite || m.isInstancedMesh) { m.userData.pick = { kind: 'obj', ref: o }; sc.pickables.push(m); }
      }));
    });
    return sc;
  }

  async function getScene(id, onEach) {
    await tex.load(texFor(id), onEach);
    if (id === 'meadow' || id === 'hall') {
      if (!built[id]) {
        scopeId = id;
        built[id] = prepare(id === 'meadow' ? buildMeadow(kit) : buildHall(kit));
      }
      return built[id];
    }
    const info = roomById(id);
    scopeId = id;
    return prepare(buildRoom(kit, info));
  }

  function disposeRoom(sc) {
    cancelTweens(sc.id);
    if (sc.dispose) sc.dispose();
    sc.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach((m) => {
        for (const k in m) { const v = m[k]; if (v && v.isTexture && v.userData && v.userData.owned) v.dispose(); }
        m.dispose();
      });
    });
    tex.release(sc.texKeys || []);
  }

  const focusSprite = glow('#fff6d8', 0.5, 0.0);
  focusSprite.material.depthTest = false;
  focusSprite.renderOrder = 20;

  function switchTo(sc, fromId) {
    if (cur && cur.exit) cur.exit();
    cur = sc;
    scopeId = sc.id;
    const sp = sc.spawn(fromId);
    controls.setPose(sp.x, sp.z, sp.yaw, sp.pitch ?? 0);
    controls.eye = sc.eye || 1.55;
    renderer.toneMappingExposure = sc.exposure ?? 1;
    if (sc.shadowLight) {
      const l = sc.shadowLight;
      l.castShadow = Q.shadows;
      if (l.shadow.mapSize.x !== Q.shadow) { if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } l.shadow.mapSize.set(Q.shadow, Q.shadow); }
    }
    if (sc.setGrass) sc.setGrass(Q.grass);
    applyBloom(sc);
    sc.scene.add(focusSprite);
    focusSprite.visible = false;
    activeDoor = null;
    ui.action.classList.add('hidden');
    ui.tapHint.classList.add('hidden');
    const room = !!sc.isRoom;
    ui.back.classList.toggle('hidden', !room);
    ui.backB.classList.toggle('hidden', !room);
    ui.title.classList.toggle('hidden', !room);
    if (room) {
      ui.title.textContent = sc.info.emoji + ' ' + sc.info.name;
      ui.title.style.animation = 'none'; void ui.title.offsetWidth; ui.title.style.animation = '';
      const files = sc.info.files || [];
      if (files.length && !audio.filesLoaded(files)) {
        ui.soundWait.classList.remove('hidden');
        audio.loadFiles(files).then(() => ui.soundWait.classList.add('hidden'));
      } else ui.soundWait.classList.add('hidden');
    } else ui.soundWait.classList.add('hidden');
    if (sc.enter) sc.enter(fromId);
    camera.position.set(controls.x, controls.eye, controls.z);
    graceT = 3;
  }

  function ambFor(id) { return id === 'meadow' ? 'meadow' : id === 'hall' ? 'hall' : (roomById(id) || {}).amb; }

  function prefetchRoom(info) {
    if (!info || info._pref) return;
    info._pref = true;
    tex.prefetch(info.tex);
    audio.loadFiles(info.files || []);
  }

  /* ---------- 문 열기: 딸깍 → 끼이익(문이 실제로 열림) → 빛 '스으' + 흰빛 페이드 → 장면 전환 ---------- */
  async function enterDoor(d) {
    if (busy || !cur) return;
    if (d.locked && d.locked()) { audio.rattle(); wiggle(d); return; }
    busy = true;
    controls.enabled = false; controls.cancelAuto();
    ui.action.classList.add('hidden'); ui.tapHint.classList.add('hidden'); focusSprite.visible = false;
    hideHint();
    const door = d.door;
    const target = d.target;
    tex.prefetch(texFor(target));
    if (roomById(target)) audio.loadFiles(roomById(target).files || []);

    const y0 = controls.yaw, p0 = controls.pitch;
    const ty = Math.atan2(-(d.x - controls.x), -(d.z - controls.z));
    const dist0 = Math.hypot(d.x - controls.x, d.z - controls.z);
    const tp = Math.atan2(1.1 - controls.eye, Math.max(0.6, dist0)) * 0.5;
    audio.doorOpen(d.pitch || 1, !!d.bell);
    tween(0.42, (k) => { controls.yaw = wrapAngle(y0 + wrapAngle(ty - y0) * k); controls.pitch = p0 + (tp - p0) * k; });
    // 0 ~ 0.15: 손잡이 돌림 (딸깍)
    await tween(0.15, (k) => door.setKnob(k), ease.out);
    // 0.15 ~ 0.9: 문이 경첩 기준으로 열림 (끼이익과 동시에)
    tween(0.75, (k) => door.setOpen(k), ease.sine).then(() => door.setKnob(0));
    await wait(0.35);
    // 0.5 ~: 빛이 쏟아지며 들어갈 장면의 배경음이 문틈에서 커짐
    audio.setLeak(null);
    audio.setAmbience(ambFor(target), 1.0);
    const sx = controls.x, sz = controls.z;
    const ex = d.x + d.nx * 0.25, ez = d.z + d.nz * 0.25;
    flash('gold');
    const walk = tween(0.68, (k) => { controls.x = sx + (ex - sx) * k; controls.z = sz + (ez - sz) * k; }, ease.in);
    const fl = tween(0.65, (k) => { flashEl.style.opacity = String(k); }, ease.in);
    await Promise.all([walk, fl]);
    flashEl.style.opacity = '1';

    let slow = setTimeout(() => ui.soundWait.classList.remove('hidden'), 400);
    if (!roomById(target) || !(roomById(target).files || []).length) ui.soundWait.textContent = '여는 중…';
    let next;
    try { next = await getScene(target); }
    catch (e) { console.warn('[ASMR DOORS] 장면을 만들지 못했어요', e); next = null; }
    clearTimeout(slow);
    ui.soundWait.textContent = '소리 준비 중…';
    ui.soundWait.classList.add('hidden');
    door.setOpen(0); door.setKnob(0);
    if (!next) { flashEl.style.opacity = '0'; busy = false; controls.enabled = true; audio.setAmbience(ambFor(cur.id), 0.6); return; }

    const prev = cur;
    switchTo(next, prev.id);
    if (prev.isRoom) disposeRoom(prev);
    try { renderer.compile(next.scene, camera); } catch (e) { /* 무시 */ }
    await wait(0.08);
    await tween(0.6, (k) => { flashEl.style.opacity = String(1 - k); }, ease.out);
    flashEl.style.opacity = '0';
    busy = false; controls.enabled = true;
  }

  async function backToHall() {
    if (busy || !cur || !cur.isRoom) return;
    busy = true; controls.enabled = false; controls.cancelAuto();
    ui.tapHint.classList.add('hidden'); focusSprite.visible = false;
    audio.doorClose(0.5);
    flash('cream');
    await tween(0.35, (k) => { flashEl.style.opacity = String(k); }, ease.in);
    audio.setAmbience('hall', 1);
    const hall = await getScene('hall');
    const prev = cur;
    switchTo(hall, prev.id);
    disposeRoom(prev);
    await wait(0.05);
    await tween(0.55, (k) => { flashEl.style.opacity = String(1 - k); }, ease.out);
    flashEl.style.opacity = '0';
    busy = false; controls.enabled = true;
  }

  function wiggle(d) {
    const p = d.door.pivot, base = p.rotation.y;
    tween(0.35, (k) => { p.rotation.y = base + Math.sin(k * Math.PI * 6) * 0.012 * (1 - k); }, ease.linear).then(() => { p.rotation.y = base; });
  }

  ui.action.addEventListener('click', () => { if (activeDoor && !busy) enterDoor(activeDoor); });
  ui.back.addEventListener('click', backToHall);
  ui.backB.addEventListener('click', backToHall);

  /* ---------- 탭 → 레이캐스트 ---------- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function onTap(cx, cy) {
    if (busy || !cur) return;
    ndc.set(cx / window.innerWidth * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(cur.pickables, false);
    // 가까운 순서지만, 우선순위가 높은 물건(예: 창 너머 먹구름)이 있으면 그쪽을 고른다
    let chosen = null;
    for (const h of hits) {
      const p = h.object.userData.pick;
      if (!p) continue;
      const pr = (p.kind === 'obj' && p.ref.priority) || 0;
      if (!chosen || pr > chosen.pr) chosen = { h, p, pr };
    }
    for (const h of chosen ? [chosen.h] : []) {
      const p = h.object.userData.pick;
      if (p.kind === 'door') {
        const d = p.ref;
        if (d.back) { backToHall(); return; }
        if (d.locked && d.locked()) { audio.rattle(); wiggle(d); return; }
        const far = Math.hypot(controls.x - d.fx, controls.z - d.fz);
        const front = (controls.x - d.x) * d.nx + (controls.z - d.z) * d.nz;
        if (far > 0.7 || front < 0.3) controls.walkTo(d.fx, d.fz, { stop: 0.2, face: d.look, done: () => enterDoor(d) });
        else enterDoor(d);
        return;
      }
      if (p.kind === 'obj') {
        const o = p.ref;
        const dist = camera.position.distanceTo(o.center);
        if (dist > (o.reach || 3.3)) {
          const dx = o.center.x - controls.x, dz = o.center.z - controls.z, dd = Math.hypot(dx, dz) || 1;
          const keep = Math.min(dd, o.stand || 1.4);
          controls.walkTo(o.center.x - dx / dd * keep, o.center.z - dz / dd * keep, { stop: 0.2, face: o.center, done: () => tapObj(o, h) });
        } else tapObj(o, h);
        return;
      }
    }
  }
  function tapObj(o, hit) {
    if (!cur) return;
    try { o.tap(hit); } catch (e) { console.warn('[ASMR DOORS] 물건 반응 오류', o.id, e); }
    o.tapped = true;
    if (cur.isRoom) visit(cur.id);
  }

  /* ---------- 문 앞 감지 · 프리페치 · 새어 나오는 소리 ---------- */
  function proximity(dt) {
    let best = null, bd = 1e9, leak = null, ld = 1e9;
    const lx = -Math.sin(controls.yaw), lz = -Math.cos(controls.yaw);
    for (const d of cur.doors || []) {
      const dx = controls.x - d.x, dz = controls.z - d.z;
      const dist = Math.hypot(dx, dz);
      const front = dx * d.nx + dz * d.nz;
      const open = !(d.locked && d.locked());
      const facing = dist < 0.01 ? 1 : -(dx * lx + dz * lz) / dist;   // 문 쪽을 보고 있을 때만 버튼
      if (!busy && !d.back && open && front > 0.1 && dist < 2.5 && facing > 0.35 && dist < bd) { best = d; bd = dist; }
      if (d.info && front > 0 && dist < 3.6 && dist < ld) { leak = d; ld = dist; }
      if (d.info && front > 0 && dist < 4.5) prefetchRoom(d.info);
      d.door.update(dt, time, d === best);
    }
    if (cur.id === 'meadow') {
      const d = cur.doors[0];
      if (d && Math.hypot(controls.x - d.x, controls.z - d.z) < 9) tex.prefetch(HALL_TEX);
    }
    if (!busy) audio.setLeak(cur.id === 'hall' && leak && !(leak.locked && leak.locked()) ? leak.info.amb : null);
    if (best !== activeDoor) {
      activeDoor = best;
      if (best && !busy) {
        ui.action.textContent = best.label;
        ui.action.classList.remove('hidden');
      } else ui.action.classList.add('hidden');
    }
  }

  /* ---------- 화면 가운데 근처 물건: 빛 테두리 + "탭!" ---------- */
  const fwd = new THREE.Vector3(), tmpV = new THREE.Vector3();
  function focus() {
    const objs = cur.objects || [];
    if (busy || !objs.length) { focusSprite.visible = false; ui.tapHint.classList.add('hidden'); return; }
    camera.getWorldDirection(fwd);
    let best = null, bestA = 1e9;
    for (const o of objs) {
      if (o.hidden) continue;
      tmpV.copy(o.center).sub(camera.position);
      const dist = tmpV.length();
      if (dist > (o.reach || 3.3) + 0.4) continue;
      const a = fwd.angleTo(tmpV);
      const lim = 0.2 + Math.atan2(o.radius, dist);
      if (a < lim && a < bestA) { best = o; bestA = a; }
    }
    if (!best) { focusSprite.visible = false; ui.tapHint.classList.add('hidden'); return; }
    focusSprite.visible = true;
    focusSprite.position.copy(best.center);
    focusSprite.scale.setScalar(best.radius * 3.4);
    focusSprite.material.opacity = 0.2 + 0.08 * Math.sin(time * 3.2);
    if (!best.tapped) {
      tmpV.copy(best.center); tmpV.y += best.radius * 1.1;
      tmpV.project(camera);
      if (tmpV.z < 1) {
        ui.tapHint.style.left = ((tmpV.x * 0.5 + 0.5) * window.innerWidth) + 'px';
        ui.tapHint.style.top = ((-tmpV.y * 0.5 + 0.5) * window.innerHeight) + 'px';
        ui.tapHint.classList.remove('hidden');
      }
    } else ui.tapHint.classList.add('hidden');
  }

  /* ---------- 안내 ---------- */
  let hintTimer = 0;
  function showHint() {
    ui.hint.textContent = isMobile ? '← 여기를 끌어서 걸어보세요\n오른쪽을 끌면 둘러볼 수 있어요' : 'WASD로 걷고, 드래그로 둘러봐요\n문이나 물건은 클릭!';
    ui.hint.style.whiteSpace = 'pre-line';
    ui.hint.classList.remove('hidden');
    hintTimer = setTimeout(hideHint, 9000);
  }
  function hideHint() { clearTimeout(hintTimer); ui.hint.classList.add('hidden'); }

  /* ---------- 품질 자동 조절: 40fps 미만이 이어지면 풀잎·그림자·해상도를 낮춘다 ---------- */
  let fAcc = 0, fN = 0, low = 0, graceT = 4;
  function degrade() {
    Q.level++;
    if (Q.level === 1) { Q.grass = 0.6; if (cur.setGrass) cur.setGrass(Q.grass); }
    else if (Q.level === 2) {
      if (Q.shadow > 512) Q.shadow = 1024 >= Q.shadow ? 512 : 1024; else Q.shadows = false;
      if (cur.shadowLight) {
        const l = cur.shadowLight; l.castShadow = Q.shadows;
        if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
        l.shadow.mapSize.set(Q.shadow, Q.shadow);
      }
    } else if (Q.level === 3) {
      Q.pr = Math.max(1, Q.pr - 0.35);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
      if (composer) composer.setPixelRatio(renderer.getPixelRatio());
      onResize();
    } else if (Q.level === 4) {
      composer = null; Q.bloom = false;
      Q.grass = 0.35; if (cur.setGrass) cur.setGrass(Q.grass);
      Q.shadows = false; if (cur.shadowLight) cur.shadowLight.castShadow = false;
    } else if (Q.level === 5) {
      Q.pr = 1; renderer.setPixelRatio(1); onResize();
    }
  }
  function fpsMonitor(dt) {
    if (graceT > 0) { graceT -= dt; fAcc = 0; fN = 0; return; }
    fAcc += dt; fN++;
    if (fAcc >= 2) {
      const fps = fN / fAcc;
      if (fps < 40) low++; else low = 0;
      if (low >= 2 && Q.level < 5) { degrade(); low = 0; graceT = 2; }
      fAcc = 0; fN = 0;
    }
  }

  /* ---------- 루프 ---------- */
  let last = performance.now(), rafId = 0, running = true;
  const api = { camera, controls, kit, get time() { return time; } };
  function loop(now) {
    rafId = requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    frame(dt, true);
  }
  function frame(dt, live) {
    time += dt;
    tweens.forEach((tw) => {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      try { tw.fn(tw.ez(k), k); } catch (e) { console.warn(e); }
      if (k >= 1) { tweens.delete(tw); tw.res(); }
    });
    if (!cur) return;
    controls.update(dt, busy ? null : cur.constrain);
    controls.applyTo(camera);
    cur.update(dt, time, api);
    particleSystems.forEach((s) => s.update(dt));
    proximity(dt);
    focus();
    if (composer && !(cur.bloom && cur.bloom.off)) composer.render(dt); else renderer.render(cur.scene, camera);
    if (live) fpsMonitor(dt);
  }

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    fitCamera();
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    pScale = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    particleSystems.forEach((s) => { s.mat.uniforms.uScale.value = pScale; });
  }
  window.addEventListener('resize', onResize);
  onResize();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; cancelAnimationFrame(rafId); }
    else if (!running) { running = true; last = performance.now(); rafId = requestAnimationFrame(loop); }
  });
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); toast('화면을 다시 불러와 주세요', 4000); });

  /* ---------- 첫 장면: 잔디밭 ---------- */
  const firstKeys = MEADOW_TEX;
  let loaded = 0;
  const meadow = await getScene('meadow', () => { loaded++; onProgress(0.15 + 0.7 * loaded / firstKeys.length); });
  onProgress(0.9);
  switchTo(meadow, null);
  try { renderer.compile(meadow.scene, camera); } catch (e) { /* 무시 */ }
  onProgress(1);
  $('ui').classList.remove('hidden');
  rafId = requestAnimationFrame(loop);
  onReady();
  setTimeout(showHint, 900);
  setupBloom();

  // 디버그/검수용 최소 노출
  window.__asmrDoors = { kit, controls, step: (k = 1, dt = 1 / 30) => { for (let i = 0; i < k; i++) frame(dt, false); }, get bloom() { return bloomPass; }, get scene() { return cur && cur.id; }, get sc() { return cur; }, get quality() { return Q; }, go: async (id) => { const sc = await getScene(id); const prev = cur; switchTo(sc, prev.id); if (prev.isRoom) disposeRoom(prev); audio.setAmbience(ambFor(id), 0.5); } };
}
