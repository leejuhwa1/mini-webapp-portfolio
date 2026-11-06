/* ASMR DOORS — 오디오 엔진 (녹음 로더 + Web Audio 합성)
   이전 2D 버전의 합성 코드를 ES 모듈로 옮기고, 3D용 발소리·문 소리 흐름을 다듬었다. */

const SOUND_DIR = 'assets/sounds/';
const MAX_VOICES = 6;

const seq = (p, n) => Array.from({ length: n }, (_, i) => `${p}-${i + 1}`);
export const FILES = {
  press: seq('slime-press', 5), stretch: seq('slime-stretch', 2), sand: seq('sand-cut', 7), pop: seq('bubble-pop', 6),
  tape: seq('tape-tear', 2), pencil: seq('pencil', 3), flip: ['paper-flip-1']
};

/* 방 정보(이름·문 색·소리). 3D 방 생성(rooms.js)과 WebGL 대체 화면이 함께 쓴다. */
export const ROOM_INFO = [
  { id: 'slime', emoji: '🫧', name: '슬라임 공방', amb: 'slime', door: '#d9c9f7', pitch: 1.04, floor: 'tile',
    files: [...FILES.press, ...FILES.stretch, ...FILES.sand, ...FILES.pop],
    objects: [
      { id: 'blob', label: '동그란 슬라임', group: 'press' },
      { id: 'stretch', label: '쭉 늘어나는 슬라임', group: 'stretch' },
      { id: 'sand', label: '키네틱 샌드', group: 'sand' },
      { id: 'wrap', label: '뽁뽁이 시트', group: 'pop' }] },
  { id: 'diary', emoji: '✏️', name: '다꾸 책상', amb: 'diary', door: '#cdeab0', pitch: 0.97, floor: 'wood',
    files: [...FILES.tape, ...FILES.pencil, ...FILES.flip],
    objects: [
      { id: 'tape', label: '마스킹테이프', group: 'tape' },
      { id: 'pencil', label: '연필', group: 'pencil' },
      { id: 'flip', label: '페이지 넘기기', group: 'flip' },
      { id: 'sticker', label: '스티커 (소리 없음)', none: true }] },
  { id: 'cafe', emoji: '🍰', name: '디저트 카페', amb: 'cafe', door: '#ffcfdc', pitch: 1.1, floor: 'tile', files: [],
    objects: [
      { id: 'ice', label: '얼음 유리컵', sfx: 'ice' }, { id: 'spoon', label: '찻잔과 스푼', sfx: 'spoon' },
      { id: 'drip', label: '핸드드립', sfx: 'drip' }, { id: 'whisk', label: '휘핑크림', sfx: 'whisk' },
      { id: 'macaron', label: '마카롱', sfx: 'crunch' }] },
  { id: 'attic', emoji: '🌧️', name: '비 오는 다락방', amb: 'attic', door: '#bfe1fa', pitch: 0.9, floor: 'wood', files: [],
    objects: [
      { id: 'window', label: '둥근 창문', sfx: 'rain' }, { id: 'cloud', label: '먹구름', sfx: 'thunder' },
      { id: 'candle', label: '촛불', sfx: 'candle' }, { id: 'chime', label: '풍경', sfx: 'chime' },
      { id: 'blanket', label: '담요', sfx: 'blanket' }] },
  { id: 'camp', emoji: '🏕️', name: '밤 캠핑', amb: 'camp', door: '#b9d4a8', pitch: 0.94, floor: 'grass', files: [],
    objects: [
      { id: 'fire', label: '모닥불', sfx: 'fire' }, { id: 'bush', label: '풀숲', sfx: 'cricket' },
      { id: 'stream', label: '시냇물', sfx: 'stream' }, { id: 'owl', label: '부엉이', sfx: 'owl' },
      { id: 'mallow', label: '마시멜로', sfx: 'sizzle' }] },
  { id: 'ocean', emoji: '🐚', name: '바닷속 방', amb: 'ocean', door: '#a9e4e0', pitch: 1.0, floor: 'sand', files: [],
    objects: [
      { id: 'shell', label: '조개', sfx: 'drop' }, { id: 'wave', label: '수면의 빛', sfx: 'wave' },
      { id: 'whale', label: '고래', sfx: 'whale' }, { id: 'coral', label: '산호', sfx: 'bubbles' },
      { id: 'jelly', label: '해파리', sfx: 'jelly' }] }
];
export const STAR_INFO = { id: 'star', emoji: '✨', name: '별빛 방', amb: 'star', door: '#e6dcff', pitch: 1.18, bell: true, floor: 'carpet', files: [], objects: [] };

export function playObject(room, o) {
  if (o.group) return audio.playGroup(room.id + ':' + o.group, FILES[o.group]);
  if (o.sfx) return audio.sfx(o.sfx);
  return 0;
}

/* ===================================================================== */
const A = {};
let ctx = null, master, sfxBus, ambBus, stepBus, revIn;
const noise = {};
let muted = false;
let voices = [];
const elVoices = [];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const vary = (v, p) => v * (1 + rand(-p, p));

A.ready = () => !!ctx;
A.isMuted = () => muted;
A.now = () => (ctx ? ctx.currentTime : 0);

/* ---------- 초기화: world.js가 탭 순간 만든 AudioContext를 받는다 ---------- */
A.init = function (existing, startMuted) {
  muted = !!startMuted;
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  if (existing) ctx = existing;
  else {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { ctx = null; return; }
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 12; comp.ratio.value = 3;
  comp.attack.value = 0.005; comp.release.value = 0.2;
  master.connect(comp); comp.connect(ctx.destination);

  sfxBus = gain(0.9, master);
  ambBus = gain(0.3, master);   // 배경음은 마스터 대비 약 30%
  stepBus = gain(0.5, master);  // 발소리: 배경음보다 크게, 물건보다 작게

  // 가벼운 리버브(교차 피드백 딜레이)
  revIn = ctx.createGain();
  const d1 = ctx.createDelay(1.5), d2 = ctx.createDelay(1.5);
  d1.delayTime.value = 0.13; d2.delayTime.value = 0.21;
  const fb1 = gain(0.42), fb2 = gain(0.38);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
  const revOut = gain(0.45, sfxBus);
  revIn.connect(lp); lp.connect(d1); lp.connect(d2);
  d1.connect(fb1); fb1.connect(d2); d2.connect(fb2); fb2.connect(d1);
  d1.connect(revOut); d2.connect(revOut);

  makeNoise();
  if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
};

function gain(v, dest) {
  const g = ctx.createGain(); g.gain.value = v;
  if (dest) g.connect(dest);
  return g;
}

function makeNoise() {
  const len = Math.floor(ctx.sampleRate * 2);
  ['white', 'pink', 'brown'].forEach((kind) => {
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    noise[kind] = buf;
  });
}

/* ---------- 합성 부품 ---------- */
function noiseSrc(kind, loop) {
  const s = ctx.createBufferSource();
  s.buffer = noise[kind || 'white'];
  s.loop = !!loop;
  return s;
}
function nz(kind, t, dur, vol, dest, o = {}) {
  const s = noiseSrc(kind, true);
  const f = ctx.createBiquadFilter();
  f.type = o.type || 'bandpass';
  f.frequency.setValueAtTime(o.f || 1000, t);
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
  f.Q.value = o.Q == null ? 1 : o.Q;
  const g = ctx.createGain();
  const at = o.attack || 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + at);
  if (o.hold) g.gain.setValueAtTime(vol, t + at + o.hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
  return { src: s, filter: f, gain: g };
}
function tone(freq, t, dur, vol, dest, o = {}) {
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide, t + (o.glideT || dur));
  const g = ctx.createGain();
  const at = o.attack || 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + at);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(dest);
  osc.start(t); osc.stop(t + dur + 0.05);
  return { osc, gain: g };
}
// 동시 재생 제한(최대 6): 넘치면 가장 오래된 소리를 빠르게 줄인다
function voice(dur, vol) {
  const g = gain(vol == null ? 1 : vol, sfxBus);
  const t = ctx.currentTime;
  const v = { g, end: t + dur, stop: null };
  voices = voices.filter((x) => x.end > t);
  voices.push(v);
  if (voices.length > MAX_VOICES) {
    const old = voices.shift();
    try { old.g.gain.setTargetAtTime(0, t, 0.02); } catch (e) { /* 무시 */ }
    if (old.stop) old.stop();
  }
  setTimeout(() => { try { g.disconnect(); } catch (e) { /* 무시 */ } }, (dur + 1.5) * 1000);
  return g;
}
function send(node, amount) {
  const g = gain(amount == null ? 0.5 : amount, revIn);
  node.connect(g);
}
function running() { return ctx && ctx.state === 'running' && !document.hidden; }

/* ---------- 녹음 파일 로더 ---------- */
const cache = {};
function decode(ab) {
  return new Promise((res, rej) => {
    try {
      const p = ctx.decodeAudioData(ab, res, rej);
      if (p && p.then) p.then(res, rej);
    } catch (e) { rej(e); }
  });
}
function loadOne(name) {
  if (cache[name]) return cache[name].p;
  const url = SOUND_DIR + name + '.mp3';
  const entry = { url };
  cache[name] = entry;
  entry.p = (ctx ? fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).then(decode)
    : Promise.reject(new Error('no audio context')))
    .then((buf) => { entry.buf = buf; })
    .catch((e) => {
      entry.fail = true;
      console.warn('[ASMR DOORS] 소리 파일을 불러오지 못했어요:', url, e && e.message);
    });
  return entry.p;
}
A.loadFiles = (names) => (names && names.length ? Promise.all(names.map(loadOne)) : Promise.resolve());
A.filesLoaded = (names) => (names || []).every((n) => cache[n] && (cache[n].buf || cache[n].fail));

const lastPick = {};
// 그룹에서 랜덤 재생(직전 파일 피하기), 속도 ±4%, 볼륨 ±10%
A.playGroup = function (groupKey, names) {
  if (!names || !names.length) return 0;
  let n = names[0];
  if (names.length > 1) {
    let tries = 0;
    do { n = pick(names); tries++; } while (n === lastPick[groupKey] && tries < 8);
  }
  lastPick[groupKey] = n;
  return A.playFile(n);
};
A.playFile = function (name) {
  if (!ctx) return 0;
  const e = cache[name];
  if (!e) { loadOne(name); return 0; }
  if (!e.buf) return 0;
  const rate = vary(1, 0.04), vol = vary(1, 0.1);
  const dur = e.buf.duration / rate;
  const g = voice(dur, vol);
  const s = ctx.createBufferSource();
  s.buffer = e.buf; s.playbackRate.value = rate;
  s.connect(g); s.start();
  voices[voices.length - 1].stop = () => { try { s.stop(ctx.currentTime + 0.05); } catch (x) { /* 무시 */ } };
  return dur;
};

/* ---------- 소리 켜기/끄기 ---------- */
A.setMuted = function (m) {
  muted = !!m;
  if (ctx) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
  elVoices.forEach((a) => { a.volume = muted ? 0 : 0.85; });
};
A.suspend = () => { if (ctx && ctx.state === 'running') ctx.suspend(); };
A.resume = () => { if (ctx && ctx.state === 'suspended') ctx.resume(); };

/* ---------- 배경음 (모두 합성) ---------- */
class Amb {
  constructor() {
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.nodes = []; this.timers = []; this.kids = []; this.alive = true; this.hooks = {};
  }
  keep(n) { this.nodes.push(n); return n; }
  every(minMs, maxMs, fn) {
    const loop = () => {
      if (!this.alive) return;
      if (running()) fn(ctx.currentTime + 0.02);
      this.timers.push(setTimeout(loop, rand(minMs, maxMs)));
    };
    this.timers.push(setTimeout(loop, rand(minMs, maxMs) * 0.5));
  }
  stop(fade) {
    if (!this.alive) return;
    this.alive = false;
    this.timers.forEach(clearTimeout);
    this.kids.forEach((k) => k.stop(fade));
    const t = ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => {
      this.nodes.forEach((n) => { try { n.stop(); } catch (e) { /* 무시 */ } });
      try { this.out.disconnect(); } catch (e) { /* 무시 */ }
    }, fade * 1000 + 150);
  }
}
function bed(amb, kind, ftype, freq, Q, vol, lfoRate, lfoDepth) {
  const s = amb.keep(noiseSrc(kind, true));
  const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = Q;
  const g = gain(vol);
  s.connect(f); f.connect(g); g.connect(amb.out);
  if (lfoRate) {
    const l = amb.keep(ctx.createOscillator()); l.frequency.value = lfoRate;
    const lg = gain(vol * lfoDepth); l.connect(lg); lg.connect(g.gain); l.start();
  }
  s.start(0, Math.random() * 1.5);
  return { f, g };
}
function bird(t, dest, vol) {
  const n = 2 + ((Math.random() * 3) | 0);
  const base = rand(2600, 3600);
  for (let i = 0; i < n; i++) {
    const tt = t + i * rand(0.09, 0.16);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(base, tt);
    o.frequency.exponentialRampToValueAtTime(base * rand(1.25, 1.5), tt + 0.04);
    o.frequency.exponentialRampToValueAtTime(base * rand(0.9, 1.05), tt + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(vol, tt + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.1);
    o.connect(g); g.connect(dest); o.start(tt); o.stop(tt + 0.12);
  }
}
function bell(freq, t, dur, vol, dest, rev) {
  const g = gain(1, dest);
  tone(freq, t, dur, vol, g, { attack: 0.003 });
  tone(freq * 2.01, t, dur * 0.6, vol * 0.35, g, { attack: 0.003 });
  tone(freq * 2.76, t, dur * 0.35, vol * 0.18, g, { attack: 0.002 });
  if (rev !== false) send(g, 0.6);
  return g;
}

const AMB = {
  meadow(a) {
    const w = bed(a, 'pink', 'lowpass', 520, 0.5, 0.55, 0.09, 0.6);
    const w2 = bed(a, 'brown', 'lowpass', 260, 0.7, 0.5, 0.05, 0.5);
    a.hooks.gust = () => {
      const t = ctx.currentTime;
      [w.g.gain, w2.g.gain].forEach((p) => {
        const v = p.value; p.cancelScheduledValues(t); p.setValueAtTime(v, t);
        p.linearRampToValueAtTime(v * 3.2, t + 1.0); p.linearRampToValueAtTime(v, t + 3.5);
      });
      w.f.frequency.cancelScheduledValues(t);
      w.f.frequency.setValueAtTime(520, t);
      w.f.frequency.linearRampToValueAtTime(1600, t + 1.1);
      w.f.frequency.linearRampToValueAtTime(520, t + 3.6);
    };
    a.every(2600, 7000, (t) => bird(t, a.out, rand(0.05, 0.1)));
  },
  hall(a) {
    bed(a, 'brown', 'lowpass', 300, 0.7, 0.22, 0.04, 0.3);
    const pad = gain(1, a.out);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(pad);
    const chords = [[261.6, 329.6, 392, 493.9], [349.2, 440, 523.3, 659.3], [220, 261.6, 329.6, 392], [293.7, 349.2, 440, 523.3]];
    const oscs = chords[0].map((f, i) => {
      const o = a.keep(ctx.createOscillator()); o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = f; o.detune.value = rand(-6, 6);
      const g = gain(0.045); o.connect(g); g.connect(lp); o.start();
      return o;
    });
    let ci = 0;
    a.every(7000, 9000, (t) => {
      ci = (ci + 1) % chords.length;
      oscs.forEach((o, i) => o.frequency.setTargetAtTime(chords[ci][i], t, 1.2));
    });
    const outside = ctx.createBiquadFilter(); outside.type = 'lowpass'; outside.frequency.value = 2400; outside.connect(a.out);
    a.every(4500, 11000, (t) => bird(t, outside, rand(0.04, 0.07)));
  },
  slime(a) {
    bed(a, 'brown', 'lowpass', 220, 0.7, 0.5, 0.05, 0.3);
    a.every(4500, 10000, (t) => { const g = gain(1, a.out); bell(rand(2600, 3600), t, 1.1, 0.06, g); });
  },
  diary(a) {
    bed(a, 'brown', 'lowpass', 240, 0.7, 0.45, 0.04, 0.2);
    let tick = 0;
    a.every(1000, 1000, (t) => {
      tick ^= 1;
      nz('white', t, 0.025, 0.05, a.out, { type: 'bandpass', f: tick ? 3400 : 2700, Q: 6, attack: 0.001 });
    });
  },
  cafe(a) {
    bed(a, 'pink', 'bandpass', 420, 0.8, 0.55, 0.13, 0.4);
    bed(a, 'pink', 'bandpass', 950, 1.4, 0.22, 0.21, 0.6);
    a.every(3000, 8000, (t) => bell(rand(2200, 3200), t, 0.4, 0.03, a.out, false));
    a.every(9000, 16000, (t) => nz('white', t, 2.2, 0.05, a.out, { type: 'highpass', f: 3000, Q: 0.5, attack: 0.6, hold: 0.8 }));
  },
  attic(a) {
    const r = bed(a, 'pink', 'highpass', 700, 0.4, 0.7, 0.07, 0.2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
    r.g.disconnect(); r.g.connect(lp); lp.connect(a.out);
    a.hooks.rain = () => {
      const t = ctx.currentTime, p = r.g.gain;
      p.cancelScheduledValues(t); p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(1.6, t + 0.6); p.linearRampToValueAtTime(0.7, t + 3.2);
      lp.frequency.cancelScheduledValues(t); lp.frequency.setValueAtTime(lp.frequency.value, t);
      lp.frequency.linearRampToValueAtTime(11000, t + 0.6); lp.frequency.linearRampToValueAtTime(6000, t + 3.2);
    };
    a.every(90, 420, (t) => nz('white', t, rand(0.015, 0.04), rand(0.04, 0.12), a.out, { type: 'bandpass', f: rand(1800, 4200), Q: 3, attack: 0.001 }));
  },
  camp(a) {
    bed(a, 'pink', 'lowpass', 380, 0.6, 0.5, 0.07, 0.7);
    const o = a.keep(ctx.createOscillator()); o.frequency.value = 4500;
    const g1 = gain(0), g2 = gain(0.012);
    const l1 = a.keep(ctx.createOscillator()); l1.type = 'square'; l1.frequency.value = 26;
    const l1g = gain(0.5); l1.connect(l1g); l1g.connect(g1.gain);
    const l2 = a.keep(ctx.createOscillator()); l2.frequency.value = 0.7;
    const l2g = gain(0.012); l2.connect(l2g); l2g.connect(g2.gain);
    o.connect(g1); g1.connect(g2); g2.connect(a.out);
    o.start(); l1.start(); l2.start();
    a.every(500, 1600, (t) => nz('white', t, rand(0.004, 0.012), rand(0.02, 0.05), a.out, { type: 'highpass', f: 2500, attack: 0.001 }));
  },
  ocean(a) {
    bed(a, 'brown', 'lowpass', 170, 0.8, 0.9, 0.08, 0.6);
    bed(a, 'pink', 'lowpass', 420, 0.5, 0.18, 0.05, 0.8);
    a.every(2500, 6000, (t) => {
      const n = 2 + ((Math.random() * 3) | 0);
      for (let i = 0; i < n; i++) tone(rand(400, 800), t + i * 0.08, 0.07, 0.02, a.out, { glide: rand(1000, 1700), glideT: 0.05 });
    });
  },
  star(a) {
    // 숨겨진 방: 6개 방의 배경음을 아주 작게 섞은 자장가 믹스
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.connect(a.out);
    ['slime', 'diary', 'cafe', 'attic', 'camp', 'ocean'].forEach((k) => {
      const kid = makeAmb(k);
      const kg = gain(0.32); kid.out.connect(kg); kg.connect(lp);
      kid.out.gain.value = 1;
      a.kids.push(kid);
    });
    const scale = [523.3, 587.3, 659.3, 784, 880, 1046.5];
    const mel = [0, 2, 4, 2, 3, 1, 0, 2, 4, 5, 4, 2];
    let i = 0;
    a.every(1150, 1150, (t) => { bell(scale[mel[i % mel.length]], t, 1.8, 0.05, a.out); i++; });
  }
};
function makeAmb(name) {
  const a = new Amb();
  if (AMB[name]) AMB[name](a);
  return a;
}

let curAmb = null, curAmbName = null, leak = null, leakName = null;
A.setAmbience = function (name, fade = 1) {
  if (!ctx || name === curAmbName) return;
  if (curAmb) curAmb.stop(fade);
  curAmbName = name; curAmb = null;
  if (!name) return;
  curAmb = makeAmb(name);
  curAmb.out.connect(ambBus);
  const t = ctx.currentTime;
  curAmb.out.gain.setValueAtTime(0, t);
  curAmb.out.gain.linearRampToValueAtTime(1, t + fade);
};
A.ambHook = (name) => { if (curAmb && curAmb.hooks[name]) curAmb.hooks[name](); };

// 홀: 문 앞에 서면 그 방 배경음이 문틈으로 작게 새어 나옴
A.setLeak = function (name) {
  if (!ctx || name === leakName) return;
  if (leak) leak.stop(0.6);
  leak = null; leakName = name;
  if (!name) return;
  leak = makeAmb(name);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 0.5;
  const g = gain(0.45);
  leak.out.connect(lp); lp.connect(g); g.connect(ambBus);
  const t = ctx.currentTime;
  leak.out.gain.setValueAtTime(0, t);
  leak.out.gain.linearRampToValueAtTime(1, t + 0.8);
};

/* ---------- 발소리: 걸음(머리 흔들림의 아래 지점)마다 한 번 ---------- */
function stepGrass(foot) {
  const t = ctx.currentTime;
  const f = vary(foot ? 3300 : 2800, 0.15);
  const d = vary(0.1, 0.15);
  nz('white', t, d, vary(0.5, 0.15), stepBus, { type: 'bandpass', f, Q: 1.1, attack: 0.008 });
  nz('pink', t + 0.012, d * 0.8, vary(0.22, 0.15), stepBus, { type: 'bandpass', f: f * 0.55, Q: 1.5, attack: 0.01 });
  tone(vary(foot ? 85 : 75, 0.1), t, 0.06, 0.12, stepBus, { attack: 0.004 });
}
function stepIndoor(foot, carpet, tile) {
  const t = ctx.currentTime;
  const cut = carpet ? vary(650, 0.12) : vary(tile ? 1400 : 1150, 0.12);
  const d = carpet ? vary(0.085, 0.12) : vary(0.065, 0.12);
  nz('pink', t, d, carpet ? 0.42 : 0.5, stepBus, { type: 'lowpass', f: cut, Q: 0.8, attack: 0.003 });
  tone(vary(foot ? 112 : 98, 0.08), t, carpet ? 0.08 : 0.07, carpet ? 0.3 : 0.38, stepBus, { attack: 0.003, glide: 70, glideT: 0.07 });
  if (!carpet) nz('white', t, 0.018, tile ? 0.09 : 0.06, stepBus, { type: 'bandpass', f: tile ? 3400 : 2600, Q: 3, attack: 0.001 });
}
function stepSand(foot) {
  const t = ctx.currentTime;
  nz('pink', t, vary(0.13, 0.15), vary(0.35, 0.15), stepBus, { type: 'lowpass', f: vary(foot ? 900 : 780, 0.15), Q: 0.6, attack: 0.02 });
  nz('white', t + 0.01, 0.07, 0.05, stepBus, { type: 'bandpass', f: 2200, Q: 1, attack: 0.01 });
}
A.step = function (kind, foot) {
  if (!running()) return;
  if (kind === 'grass') stepGrass(foot);
  else if (kind === 'sand') stepSand(foot);
  else stepIndoor(foot, kind === 'carpet', kind === 'tile');
};

/* ---------- 문 소리: 딸깍(0) → 끼이익(0.15~0.9) → 빛 '스으'(0.5~) ---------- */
A.doorOpen = function (pitch = 1, withBell = false) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.01;
  const out = voice(2.6, 1);
  // 1) 손잡이 딸깍 두 번 (30ms 간격)
  [0, 0.03].forEach((dt, i) => {
    tone(2300 * pitch * (i ? 0.85 : 1), t + dt, 0.02, 0.25, out, { attack: 0.001 });
    nz('white', t + dt, 0.015, 0.3, out, { type: 'highpass', f: 3500, attack: 0.001 });
  });
  // 2) 끼이익: 톱니파 → 밴드패스, 불규칙 피치 글라이드 + 스틱슬립 떨림
  const cs = t + 0.15, cd = rand(0.68, 0.78);
  const saw = ctx.createOscillator(); saw.type = 'sawtooth';
  const steps = 14, curve = new Float32Array(steps);
  const f0 = 300 * pitch * rand(0.95, 1.05), f1 = 550 * pitch * rand(0.95, 1.05);
  for (let i = 0; i < steps; i++) {
    const k = i / (steps - 1);
    curve[i] = (f0 + (f1 - f0) * Math.pow(k, 0.8)) * (1 + rand(-0.06, 0.06));
  }
  saw.frequency.setValueCurveAtTime(curve, cs, cd);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100 * pitch; bp.Q.value = 2.2;
  const soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 2400;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.0001, cs);
  cg.gain.linearRampToValueAtTime(0.13, cs + 0.08);
  cg.gain.setValueAtTime(0.12, cs + cd - 0.2);
  cg.gain.exponentialRampToValueAtTime(0.0001, cs + cd);
  const trem = ctx.createGain(); trem.gain.value = 0.6;
  const lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.setValueAtTime(rand(16, 22), cs);
  lfo.frequency.linearRampToValueAtTime(rand(26, 34), cs + cd);
  const lfoG = gain(0.4); lfo.connect(lfoG); lfoG.connect(trem.gain);
  saw.connect(bp); bp.connect(soft); soft.connect(trem); trem.connect(cg); cg.connect(out);
  saw.start(cs); saw.stop(cs + cd + 0.05); lfo.start(cs); lfo.stop(cs + cd + 0.05);
  nz('pink', cs, cd, 0.12, out, { type: 'bandpass', f: 700 * pitch, Q: 1.2, attack: 0.1, hold: cd * 0.5 });
  // 3) 빛이 쏟아지며 스으 (0.5초~), 끼이익 꼬리와 겹쳐 자연스럽게 이어짐
  nz('pink', t + 0.5, 1.7, 0.35, out, { type: 'lowpass', f: 350, f2: 3200, Q: 0.7, attack: 0.55 });
  nz('white', t + 0.6, 1.4, 0.06, out, { type: 'highpass', f: 5000, Q: 0.5, attack: 0.5 });
  tone(523.3 * pitch, t + 0.62, 1.5, 0.025, out, { attack: 0.4 });
  tone(784 * pitch, t + 0.7, 1.4, 0.018, out, { attack: 0.4 });
  if (withBell) {
    const bg = gain(1, out);
    bell(1318.5, t + 0.6, 2.4, 0.16, bg);
    bell(1975.5, t + 0.75, 2.0, 0.07, bg);
  }
};
A.doorClose = function (vol = 0.55) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.01;
  const out = voice(0.6, vol);
  tone(150, t, 0.12, 0.5, out, { glide: 90, glideT: 0.1 });
  nz('brown', t, 0.09, 0.6, out, { type: 'lowpass', f: 500, attack: 0.002 });
  nz('white', t + 0.07, 0.02, 0.25, out, { type: 'bandpass', f: 3200, Q: 4, attack: 0.001 });
  tone(2600, t + 0.07, 0.025, 0.12, out, { attack: 0.001 });
};
// 잠긴 문 손잡이 달그락
A.rattle = function () {
  if (!ctx) return;
  const t = ctx.currentTime + 0.01, out = voice(0.4, 0.4);
  for (let i = 0; i < 3; i++) {
    tone(2100 + i * 140, t + i * 0.06, 0.02, 0.15, out, { attack: 0.001 });
    nz('white', t + i * 0.06, 0.02, 0.18, out, { type: 'bandpass', f: 3000, Q: 3, attack: 0.001 });
  }
};

/* ---------- 방 물건 합성 소리 ---------- */
const S = {};
S.ice = () => {
  const t = ctx.currentTime, out = voice(1, 0.9);
  const n = 3 + ((Math.random() * 4) | 0);
  let tt = t;
  for (let i = 0; i < n; i++) {
    tt += rand(0.04, 0.13);
    const k = 2 + ((Math.random() * 3) | 0);
    for (let j = 0; j < k; j++) tone(rand(2000, 5000), tt, rand(0.05, 0.13), rand(0.06, 0.13), out, { attack: 0.001 });
    nz('white', tt, 0.02, 0.05, out, { type: 'highpass', f: 4000, attack: 0.001 });
  }
  send(out, 0.25);
  return 0.8;
};
S.spoon = () => {
  const t = ctx.currentTime, out = voice(1.3, 0.8);
  const hits = 2 + ((Math.random() * 2) | 0);
  for (let i = 0; i < hits; i++) {
    const tt = t + i * rand(0.24, 0.32), f = rand(1700, 2100);
    [1, 2.76, 5.4].forEach((m, j) => tone(f * m, tt, 0.3 - j * 0.07, 0.12 / (j + 1), out, { attack: 0.001 }));
    nz('white', tt - 0.08 > t ? tt - 0.08 : t, 0.12, 0.03, out, { type: 'bandpass', f: 2500, Q: 1, attack: 0.04 });
  }
  send(out, 0.3);
  return 1;
};
S.drip = () => {
  const t = ctx.currentTime, out = voice(2.6, 0.9);
  const s = noiseSrc('pink', true);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 3;
  const l = ctx.createOscillator(); l.frequency.value = rand(6, 9);
  const lg = gain(350); l.connect(lg); lg.connect(f.frequency);
  const l2 = ctx.createOscillator(); l2.frequency.value = rand(2.3, 3.3);
  const l2g = gain(200); l2.connect(l2g); l2g.connect(f.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.15);
  g.gain.setValueAtTime(0.32, t + 1.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random()); s.stop(t + 2.05); l.start(t); l.stop(t + 2.05); l2.start(t); l2.stop(t + 2.05);
  tone(650, t + 2.05, 0.14, 0.25, out, { glide: 1500, glideT: 0.04 });
  send(out, 0.2);
  return 2.2;
};
S.whisk = () => {
  const t = ctx.currentTime, out = voice(1.7, 0.9);
  const s = noiseSrc('white', true);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 1.8;
  const l = ctx.createOscillator(); l.frequency.value = 7; const lg = gain(900); l.connect(lg); lg.connect(f.frequency);
  const am = ctx.createGain(); am.gain.value = 0.5;
  const l2 = ctx.createOscillator(); l2.type = 'triangle'; l2.frequency.value = 7; const l2g = gain(0.5); l2.connect(l2g); l2g.connect(am.gain);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.4, t + 0.1);
  g.gain.setValueAtTime(0.4, t + 1.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
  s.connect(f); f.connect(am); am.connect(g); g.connect(out);
  [s, l, l2].forEach((n) => { n.start(t); n.stop(t + 1.55); });
  return 1.5;
};
S.crunch = () => {
  const t = ctx.currentTime, out = voice(0.5, 0.9);
  const n = 6 + ((Math.random() * 5) | 0);
  for (let i = 0; i < n; i++) {
    const tt = t + Math.pow(Math.random(), 1.5) * 0.25;
    nz('white', tt, rand(0.015, 0.04), rand(0.2, 0.45), out, { type: 'highpass', f: rand(1200, 3500), Q: 0.7, attack: 0.001 });
  }
  nz('brown', t, 0.12, 0.4, out, { type: 'lowpass', f: 700, attack: 0.003 });
  return 0.35;
};
S.rain = () => {
  A.ambHook('rain');
  const t = ctx.currentTime, out = voice(3, 0.9);
  for (let i = 0; i < 16; i++) {
    const tt = t + rand(0, 2.6);
    tone(rand(1400, 2600), tt, 0.05, rand(0.04, 0.09), out, { attack: 0.001, glide: rand(2600, 3400), glideT: 0.02 });
    nz('white', tt, 0.015, 0.07, out, { type: 'bandpass', f: 3500, Q: 2, attack: 0.001 });
  }
  return 3;
};
S.thunder = (delay) => {
  const t = ctx.currentTime + (delay == null ? 0.7 : delay), out = voice(5, 1);
  const s = noiseSrc('brown', true);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(220, t); f.frequency.linearRampToValueAtTime(110, t + 3.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.9, t + 0.25);
  g.gain.linearRampToValueAtTime(0.55, t + 0.8); g.gain.linearRampToValueAtTime(0.75, t + 1.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
  const am = ctx.createGain(); am.gain.value = 0.7;
  const l = ctx.createOscillator(); l.frequency.value = rand(2.5, 4); const lg = gain(0.3); l.connect(lg); lg.connect(am.gain);
  s.connect(f); f.connect(am); am.connect(g); g.connect(out);
  s.start(t, Math.random()); s.stop(t + 3.9); l.start(t); l.stop(t + 3.9);
  nz('pink', t, 0.3, 0.25, out, { type: 'lowpass', f: 900, attack: 0.01 });
  return 4;
};
S.candle = () => {
  const t = ctx.currentTime, out = voice(1, 0.8);
  for (let i = 0; i < 5; i++) nz('white', t + rand(0, 0.25), rand(0.004, 0.012), rand(0.15, 0.3), out, { type: 'highpass', f: rand(1500, 4000), attack: 0.001 });
  nz('pink', t + 0.05, 0.75, 0.28, out, { type: 'lowpass', f: 600, f2: 300, attack: 0.25 });
  return 0.8;
};
S.chime = () => {
  const t = ctx.currentTime, out = voice(2.6, 0.8);
  const notes = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093];
  const n = 3 + ((Math.random() * 3) | 0);
  for (let i = 0; i < n; i++) bell(pick(notes), t + i * rand(0.12, 0.25), 2, 0.09, out);
  return 2.4;
};
S.blanket = () => {
  const t = ctx.currentTime, out = voice(0.8, 0.9);
  nz('brown', t, 0.55, 0.5, out, { type: 'lowpass', f: 380, Q: 0.4, attack: 0.12 });
  nz('pink', t, 0.4, 0.08, out, { type: 'lowpass', f: 900, attack: 0.1 });
  return 0.6;
};
S.fire = () => {
  const t = ctx.currentTime, out = voice(2.3, 0.9);
  for (let i = 0; i < 28; i++) {
    nz('white', t + rand(0, 2), rand(0.003, 0.012), rand(0.1, 0.4), out, { type: 'highpass', f: rand(1000, 4500), attack: 0.0005 });
  }
  nz('brown', t, 2.1, 0.45, out, { type: 'lowpass', f: 260, attack: 0.3, hold: 1.2 });
  return 2.1;
};
S.cricket = () => {
  const t = ctx.currentTime, out = voice(1.8, 0.8);
  for (let c = 0; c < 3; c++) {
    const ct = t + c * rand(0.42, 0.55), f = rand(4300, 4900);
    for (let p = 0; p < 3; p++) tone(f, ct + p * 0.045, 0.028, 0.08, out, { attack: 0.004 });
  }
  return 1.6;
};
S.stream = () => {
  const t = ctx.currentTime, out = voice(3.3, 0.9);
  for (let i = 0; i < 3; i++) {
    const s = noiseSrc('pink', true);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = rand(700, 2400); f.Q.value = rand(3, 7);
    const l = ctx.createOscillator(); l.frequency.value = rand(1.5, 5); const lg = gain(rand(200, 600)); l.connect(lg); lg.connect(f.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.4, t + 0.4);
    g.gain.setValueAtTime(0.4, t + 2.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random()); s.stop(t + 3.05); l.start(t); l.stop(t + 3.05);
  }
  for (let j = 0; j < 7; j++) tone(rand(500, 900), t + rand(0.2, 2.6), 0.05, 0.03, out, { glide: rand(1200, 1800), glideT: 0.04 });
  return 3;
};
S.owl = () => {
  const t = ctx.currentTime, out = voice(1.8, 0.9);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(out);
  const hoo = (tt, f, d) => {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(f * 1.04, tt); o.frequency.exponentialRampToValueAtTime(f * 0.94, tt + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.35, tt + 0.08);
    g.gain.setValueAtTime(0.32, tt + d * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, tt + d);
    o.connect(g); g.connect(lp); o.start(tt); o.stop(tt + d + 0.05);
    nz('pink', tt, d, 0.03, lp, { type: 'bandpass', f: f * 2, Q: 2, attack: 0.08 });
  };
  hoo(t, rand(360, 390), 0.32);
  hoo(t + 0.5, rand(320, 345), 0.75);
  send(out, 0.3);
  return 1.4;
};
S.sizzle = () => {
  const t = ctx.currentTime, out = voice(1.3, 0.8);
  nz('white', t, 1.1, 0.22, out, { type: 'highpass', f: 3200, Q: 0.5, attack: 0.08, hold: 0.5 });
  for (let i = 0; i < 12; i++) nz('white', t + rand(0, 0.9), 0.008, rand(0.1, 0.2), out, { type: 'bandpass', f: rand(3000, 7000), Q: 2, attack: 0.0005 });
  return 1.1;
};
S.drop = () => {
  const t = ctx.currentTime, out = voice(0.6, 0.9);
  tone(420, t, 0.16, 0.35, out, { glide: 1650, glideT: 0.06 });
  tone(700, t + 0.12, 0.1, 0.12, out, { glide: 1900, glideT: 0.04 });
  send(out, 0.4);
  return 0.4;
};
S.wave = () => {
  const t = ctx.currentTime, out = voice(4.4, 1);
  const s = noiseSrc('pink', true);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(350, t); f.frequency.linearRampToValueAtTime(2400, t + 1.8); f.frequency.linearRampToValueAtTime(500, t + 4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.6, t + 1.7); g.gain.linearRampToValueAtTime(0.0001, t + 4);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random()); s.stop(t + 4.05);
  return 4;
};
S.whale = () => {
  const t = ctx.currentTime, out = voice(5.5, 1);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(out);
  const dl = ctx.createDelay(2); dl.delayTime.value = 0.55;
  const fb = gain(0.45); const wet = gain(0.5, out);
  lp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet);
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(400, t + 1.4);
  o.frequency.exponentialRampToValueAtTime(200, t + 3);
  const vib = ctx.createOscillator(); vib.frequency.value = 5; const vg = gain(6); vib.connect(vg); vg.connect(o.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.5);
  g.gain.setValueAtTime(0.3, t + 2.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.1);
  o.connect(g); g.connect(lp);
  const o2 = ctx.createOscillator(); o2.type = 'triangle';
  o2.frequency.setValueAtTime(75, t); o2.frequency.exponentialRampToValueAtTime(200, t + 1.4); o2.frequency.exponentialRampToValueAtTime(100, t + 3);
  const g2 = gain(0.08); o2.connect(g2); g2.connect(g);
  [o, o2, vib].forEach((n) => { n.start(t); n.stop(t + 3.2); });
  setTimeout(() => { try { fb.disconnect(); } catch (e) { /* 무시 */ } }, 6000);
  return 3.2;
};
S.bubbles = () => {
  const t = ctx.currentTime, out = voice(1.2, 0.9);
  const n = 6 + ((Math.random() * 5) | 0);
  for (let i = 0; i < n; i++) {
    const tt = t + i * rand(0.06, 0.11), f = rand(300, 600);
    tone(f, tt, 0.07, rand(0.1, 0.18), out, { glide: f * rand(2.2, 3.2), glideT: 0.05 });
  }
  send(out, 0.3);
  return 1;
};
S.jelly = () => {
  const t = ctx.currentTime, out = voice(2.6, 0.9);
  bell(rand(980, 1120), t, 2.3, 0.15, out);
  return 2.3;
};
S.gust = () => {
  A.ambHook('gust');
  const t = ctx.currentTime, out = voice(3.6, 1);
  nz('pink', t, 3.4, 0.55, out, { type: 'bandpass', f: 300, f2: 900, Q: 0.6, attack: 1.1, hold: 0.6 });
  nz('white', t + 0.3, 2.6, 0.08, out, { type: 'highpass', f: 4000, attack: 0.9 });
  return 3.4;
};
S.twinkle = () => {
  const t = ctx.currentTime, out = voice(2, 0.7);
  const notes = [1568, 1760, 2093, 2349, 2637];
  bell(pick(notes), t, 1.6, 0.08, out);
  bell(pick(notes) * 0.5, t + 0.12, 1.4, 0.05, out);
  return 1.6;
};

A.sfx = function (name, arg) {
  if (!ctx || !S[name]) return 0;
  try { return S[name](arg) || 0; } catch (e) { console.warn('[ASMR DOORS] sfx', name, e); return 0; }
};

export const audio = A;
