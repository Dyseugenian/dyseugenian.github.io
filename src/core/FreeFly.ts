import { MathUtils, Vector3 } from 'three';

const SPEED = 4;
const BOOST = 5;
const EASE = 8;
const LOOK = 0.0022;
const LOOK_LIMIT = 1.55;
const KEYS: Record<string, [number, number, number]> = {
  KeyW: [0, 0, 1],
  ArrowUp: [0, 0, 1],
  KeyS: [0, 0, -1],
  ArrowDown: [0, 0, -1],
  KeyD: [1, 0, 0],
  ArrowRight: [1, 0, 0],
  KeyA: [-1, 0, 0],
  ArrowLeft: [-1, 0, 0],
  KeyE: [0, 1, 0],
  Space: [0, 1, 0],
  KeyQ: [0, -1, 0],
  KeyC: [0, -1, 0],
};

export class FreeFly {
  yaw = 0;
  pitch = 0;
  private held = new Set<string>();
  private velocity = new Vector3();
  private wanted = new Vector3();
  private forward = new Vector3();
  private right = new Vector3();
  private moved = new Vector3();

  constructor(surface: HTMLElement) {
    window.addEventListener('click', () => surface.requestPointerLock());
    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement !== surface) return;
      this.yaw -= event.movementX * LOOK;
      this.pitch = MathUtils.clamp(this.pitch - event.movementY * LOOK, -LOOK_LIMIT, LOOK_LIMIT);
    });
    window.addEventListener('keydown', (event) => {
      if (event.code in KEYS || event.code.startsWith('Shift')) event.preventDefault();
      this.held.add(event.code);
    });
    window.addEventListener('keyup', (event) => this.held.delete(event.code));
    window.addEventListener('blur', () => this.held.clear());
  }

  update(dt: number): Vector3 {
    const { forward, right, wanted } = this;
    forward.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    wanted.set(0, 0, 0);
    for (const code of this.held) {
      const [across, up, ahead] = KEYS[code] ?? [0, 0, 0];
      wanted.addScaledVector(right, across).addScaledVector(forward, ahead);
      wanted.y += up;
    }
    if (wanted.lengthSq() > 1) wanted.normalize();
    const boosted = this.held.has('ShiftLeft') || this.held.has('ShiftRight');
    wanted.multiplyScalar(SPEED * (boosted ? BOOST : 1));
    this.velocity.lerp(wanted, 1 - Math.exp(-EASE * dt));
    return this.moved.copy(this.velocity).multiplyScalar(dt);
  }
}
