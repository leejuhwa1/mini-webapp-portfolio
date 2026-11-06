/* ASMR DOORS — 1인칭 조작
   모바일: 왼쪽 절반 플로팅 조이스틱 + 오른쪽 절반 드래그 둘러보기 + 짧은 탭 = 누르기
   PC: WASD/방향키 + 마우스 드래그(포인터 잠금 없음) + 클릭 */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

export class FPControls {
  constructor(dom, ui, opts = {}) {
    this.dom = dom;
    this.ui = ui;                      // { joy, knob }
    this.onTap = opts.onTap || (() => {});
    this.onStep = opts.onStep || (() => {});
    this.onAction = opts.onAction || (() => {});
    this.onBack = opts.onBack || (() => {});
    this.onFirstMove = opts.onFirstMove || (() => {});
    this.reduced = !!opts.reduced;

    this.x = 0; this.z = 0; this.yaw = 0; this.pitch = 0;
    this.eye = 1.55;
    this.speed = 2.0;                  // m/s → 한 걸음(0.75m)당 약 0.37초
    this.enabled = true;
    this.minPitch = -Math.PI / 3; this.maxPitch = Math.PI / 3;

    // 걷기 흔들림 & 발소리
    this.phase = 0; this.bobAmt = 0; this.stepIndex = 0; this.wasMoving = false;
    this.bobY = 0; this.bobX = 0;

    this.keys = new Set();
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.look = { id: null, lx: 0, ly: 0 };
    this.downs = new Map();            // 탭 판정용
    this.auto = null;                  // 자동 걷기
    this.moved = false;

    this._bind();
  }

  _bind() {
    const d = this.dom;
    d.addEventListener('pointerdown', (e) => this._down(e));
    window.addEventListener('pointermove', (e) => this._move(e), { passive: false });
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('pointercancel', (e) => this._up(e, true));
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        this.keys.add(k); this.auto = null; e.preventDefault();
      } else if ((k === 'e' || k === 'enter' || k === ' ') && !e.repeat) { this.onAction(); e.preventDefault(); }
      else if (k === 'escape') this.onBack();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this._joyEnd(); this.look.id = null; });
  }

  _down(e) {
    if (!this.enabled) return;
    const touch = e.pointerType !== 'mouse';
    this.downs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 });
    try { this.dom.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    if (touch && e.clientX < window.innerWidth * 0.5 && this.joy.id === null) {
      this.joy.id = e.pointerId; this.joy.ox = e.clientX; this.joy.oy = e.clientY; this.joy.x = 0; this.joy.y = 0;
      this.ui.joy.style.left = e.clientX + 'px'; this.ui.joy.style.top = e.clientY + 'px';
      this.ui.knob.style.transform = 'translate(0px,0px)';
      this.ui.joy.classList.remove('hidden');
    } else if (this.look.id === null && (touch || e.button === 0)) {
      this.look.id = e.pointerId; this.look.lx = e.clientX; this.look.ly = e.clientY;
    }
  }

  _move(e) {
    const dn = this.downs.get(e.pointerId);
    if (dn) dn.moved = Math.max(dn.moved, Math.hypot(e.clientX - dn.x, e.clientY - dn.y));
    if (e.pointerId === this.joy.id) {
      const max = 50;
      let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
      const m = Math.hypot(dx, dy);
      if (m > max) { dx *= max / m; dy *= max / m; }
      this.joy.x = dx / max; this.joy.y = -dy / max;
      this.ui.knob.style.transform = `translate(${dx}px,${dy}px)`;
      if (m > 8) { this.auto = null; this._firstMove(); }
      e.preventDefault();
    } else if (e.pointerId === this.look.id && this.enabled) {
      const dx = e.clientX - this.look.lx, dy = e.clientY - this.look.ly;
      this.look.lx = e.clientX; this.look.ly = e.clientY;
      if (dn && dn.moved < 6) return;  // 아주 작은 떨림은 무시 (탭 판정 보호)
      const s = e.pointerType === 'mouse' ? 0.0042 : 0.0058;
      this.yaw += dx * s;
      this.pitch = clamp(this.pitch + dy * s, this.minPitch, this.maxPitch);
      this.yaw = wrapAngle(this.yaw);
      if (this.auto && this.auto.lookOnly) this.auto = null;
      e.preventDefault();
    }
  }

  _up(e, cancel) {
    const dn = this.downs.get(e.pointerId);
    this.downs.delete(e.pointerId);
    if (e.pointerId === this.joy.id) this._joyEnd();
    if (e.pointerId === this.look.id) this.look.id = null;
    if (!cancel && dn && this.enabled) {
      const dt = performance.now() - dn.t;
      if (dt < 320 && dn.moved < 12) this.onTap(e.clientX, e.clientY);
    }
  }

  _joyEnd() {
    this.joy.id = null; this.joy.x = 0; this.joy.y = 0;
    this.ui.joy.classList.add('hidden');
  }

  _firstMove() { if (!this.moved) { this.moved = true; this.onFirstMove(); } }

  setPose(x, z, yaw, pitch = 0) {
    this.x = x; this.z = z; this.yaw = wrapAngle(yaw); this.pitch = pitch;
    this.auto = null; this.phase = 0; this.bobAmt = 0; this.wasMoving = false;
  }

  /* 자동 걷기: 문이나 물건을 탭하면 그쪽으로 걸어가며 바라본다 */
  walkTo(x, z, opts = {}) {
    this.auto = { x, z, stop: opts.stop ?? 0.15, face: opts.face || null, done: opts.done || null, t: 0, stuck: 0, lastD: 1e9 };
  }
  faceTo(px, py, pz, done) {
    this.auto = { lookOnly: true, face: { x: px, y: py, z: pz }, done, t: 0 };
  }
  cancelAuto() { this.auto = null; }

  _yawTo(px, pz) { return Math.atan2(-(px - this.x), -(pz - this.z)); }

  /* 매 프레임: 이동 → 충돌 → 흔들림 → 발소리 */
  update(dt, constrain) {
    let ix = 0, iy = 0;
    if (this.enabled) {
      const k = this.keys;
      if (k.has('w') || k.has('arrowup')) iy += 1;
      if (k.has('s') || k.has('arrowdown')) iy -= 1;
      if (k.has('a') || k.has('arrowleft')) ix -= 1;
      if (k.has('d') || k.has('arrowright')) ix += 1;
      if (ix || iy) this._firstMove();
      if (this.joy.id !== null) {
        const m = Math.hypot(this.joy.x, this.joy.y);
        if (m > 0.12) { ix += this.joy.x; iy += this.joy.y; }
      }
    }
    let mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }

    let vx = 0, vz = 0;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    if (mag > 0.01) {
      this.auto = null;
      // 앞 = (-sin, -cos), 오른쪽 = (cos, -sin)
      vx = (-sin * iy + cos * ix) * this.speed;
      vz = (-cos * iy - sin * ix) * this.speed;
    } else if (this.auto && this.enabled) {
      const a = this.auto;
      a.t += dt;
      if (a.lookOnly) {
        const ty = this._yawTo(a.face.x, a.face.z);
        const tp = Math.atan2(a.face.y - this.eye, Math.hypot(a.face.x - this.x, a.face.z - this.z));
        this.yaw = wrapAngle(this.yaw + wrapAngle(ty - this.yaw) * Math.min(1, dt * 6));
        this.pitch += (clamp(tp, this.minPitch, this.maxPitch) - this.pitch) * Math.min(1, dt * 6);
        if (Math.abs(wrapAngle(ty - this.yaw)) < 0.02 || a.t > 1.2) { this.auto = null; if (a.done) a.done(); }
      } else {
        const dx = a.x - this.x, dz = a.z - this.z, d = Math.hypot(dx, dz);
        if (d <= a.stop) {
          if (a.face) { const f = a.face; this.auto = null; this.faceTo(f.x, f.y, f.z, a.done); }
          else { this.auto = null; if (a.done) a.done(); }
        } else {
          const sp = this.speed * 0.95 * Math.min(1, d / 0.5 + 0.3);
          vx = dx / d * sp; vz = dz / d * sp;
          // 걸어가는 방향을 부드럽게 바라본다
          const ty = Math.atan2(-dx, -dz);
          this.yaw = wrapAngle(this.yaw + wrapAngle(ty - this.yaw) * Math.min(1, dt * 4));
          this.pitch += ((a.face ? -0.12 : -0.08) - this.pitch) * Math.min(1, dt * 2);
          // 막혀서 못 가면 포기
          if (d > a.lastD - 0.004) a.stuck += dt; else a.stuck = 0;
          a.lastD = d;
          if (a.stuck > 0.8 || a.t > 12) { this.auto = null; if (a.face) this.faceTo(a.face.x, a.face.y, a.face.z, a.done); }
        }
      }
    }

    const px = this.x, pz = this.z;
    this.x += vx * dt; this.z += vz * dt;
    if (constrain) { const p = { x: this.x, z: this.z }; constrain(p); this.x = p.x; this.z = p.z; }
    const dist = Math.hypot(this.x - px, this.z - pz);
    const moving = dist > 0.0004 && (mag > 0.01 || (this.auto && !this.auto.lookOnly));

    // 머리 흔들림: 걸음 하나 = 위상 π, 가장 낮은 지점(π/2 + kπ)에서 발소리
    if (moving) {
      if (!this.wasMoving) this.phase = Math.PI / 2 - Math.PI * 0.55;  // 첫 발은 금방
      const stepLen = 0.75;
      const before = Math.floor((this.phase - Math.PI / 2) / Math.PI);
      this.phase += dist / stepLen * Math.PI;
      const after = Math.floor((this.phase - Math.PI / 2) / Math.PI);
      if (after > before) { this.stepIndex++; this.onStep(this.stepIndex % 2); }
      this.bobAmt += (1 - this.bobAmt) * Math.min(1, dt * 8);
    } else {
      this.bobAmt += (0 - this.bobAmt) * Math.min(1, dt * 6);
    }
    this.wasMoving = moving;
    const amp = this.reduced ? 0.004 : 0.022;
    this.bobY = Math.cos(2 * this.phase) * amp * this.bobAmt;
    this.bobX = Math.sin(this.phase) * amp * 0.5 * this.bobAmt;
    return moving;
  }

  applyTo(camera) {
    const c = Math.cos(this.yaw);
    camera.position.set(this.x + c * this.bobX, this.eye + this.bobY, this.z - Math.sin(this.yaw) * this.bobX);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
