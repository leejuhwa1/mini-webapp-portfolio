/* ASMR DOORS — 진입 스크립트
   첫 화면에서는 아무것도 받지 않는다. "탭해서 입장" → 오디오 시작 → 엔진·질감을 동적 import. */
const MUTE_KEY = 'asmrdoors.muted';
const $ = (id) => document.getElementById(id);

let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* 저장 불가 → 기본값 */ }

let audio = null;      // js/audio.js 모듈의 엔진
let audioCtx = null;
let started = false;

/* ---------- 🔊 버튼 (모든 장면에서 항상 보임) ---------- */
const soundBtn = $('soundBtn');
function renderSound() {
  soundBtn.textContent = muted ? '🔇' : '🔊';
  soundBtn.setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
}
function toggleSound() {
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* 무시 */ }
  if (audio) audio.setMuted(muted);
  renderSound();
}
soundBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleSound(); });
window.addEventListener('keydown', (e) => {
  if ((e.key === 'm' || e.key === 'M') && !e.repeat) toggleSound();
});
renderSound();

/* ---------- 진행 바 ---------- */
let shown = 0, target = 0, creepTo = 0, raf = 0;
function setProgress(p) { target = Math.max(target, Math.min(100, p)); }
function creep(to) { creepTo = to; }
function tickProgress() {
  if (target < creepTo) target += (creepTo - target) * 0.012;
  shown += (target - shown) * 0.2;
  const v = Math.min(100, Math.round(shown));
  $('ldPct').textContent = String(v);
  $('ldFill').style.width = v + '%';
  raf = requestAnimationFrame(tickProgress);
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

/* ---------- 탭해서 입장 ---------- */
function unlockAudio() {
  // 반드시 탭 이벤트 안에서 동기로 만든다 (iOS/안드로이드 자동재생 정책)
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    const ctx = new AC();
    const b = ctx.createBuffer(1, 1, ctx.sampleRate);
    const s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
    if (ctx.resume) ctx.resume();
    return ctx;
  } catch (e) { return null; }
}

async function enter() {
  if (started) return;
  started = true;
  audioCtx = unlockAudio();

  $('enterBtn').disabled = true;
  $('loader').classList.remove('hidden');
  $('retryBtn').classList.add('hidden');
  raf = requestAnimationFrame(tickProgress);
  setProgress(4); creep(12);

  try {
    const mod = await import('./js/audio.js');
    audio = mod.audio;
    audio.init(audioCtx, muted);
    audio.setAmbience('meadow', 1.6);   // 소리는 바로 시작
    setProgress(12);

    if (!hasWebGL()) { showNoGL(mod); return; }

    creep(58);
    const engine = await import('./js/engine.js');
    setProgress(60); creep(64);
    await engine.start({
      audio,
      onProgress: (p) => setProgress(60 + p * 40),
      onReady: () => {
        setProgress(100);
        setTimeout(() => {
          $('intro').classList.add('out');
          $('loader').classList.add('out');
          setTimeout(() => {
            $('intro').classList.add('hidden');
            $('loader').classList.add('hidden');
            cancelAnimationFrame(raf);
          }, 800);
        }, 250);
      },
      onFail: () => { showNoGL(mod); }
    });
  } catch (err) {
    console.warn('[ASMR DOORS] 세계를 여는 데 실패했어요', err);
    started = false;
    $('enterBtn').disabled = false;
    $('retryBtn').classList.remove('hidden');
    document.querySelector('.ld-text').textContent = '연결이 불안정해요. 다시 시도해 주세요.';
  }
}

$('enterBtn').addEventListener('click', enter);
$('retryBtn').addEventListener('click', () => { location.reload(); });

/* ---------- WebGL 미지원 대체 화면: 소리만 듣는 방 목록 ---------- */
function showNoGL(mod) {
  cancelAnimationFrame(raf);
  $('intro').classList.add('hidden');
  $('loader').classList.add('hidden');
  const box = $('ngRooms'), objs = $('ngObjs');
  box.innerHTML = '';
  const rooms = mod.ROOM_INFO;
  rooms.forEach((r) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = r.emoji + ' ' + r.name;
    b.addEventListener('click', () => {
      box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      audio.loadFiles(r.files);
      audio.setAmbience(r.amb, 1);
      objs.innerHTML = '';
      r.objects.forEach((o) => {
        const ob = document.createElement('button');
        ob.type = 'button';
        ob.textContent = o.label;
        ob.addEventListener('click', () => mod.playObject(r, o));
        objs.appendChild(ob);
      });
    });
    box.appendChild(b);
  });
  $('nogl').classList.remove('hidden');
}

/* 탭을 벗어나면 소리 멈춤, 돌아오면 재개 */
document.addEventListener('visibilitychange', () => {
  if (!audio) return;
  if (document.hidden) audio.suspend(); else audio.resume();
});
