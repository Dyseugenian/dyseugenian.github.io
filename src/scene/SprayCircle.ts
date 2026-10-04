import {
  BufferAttribute,
  BufferGeometry,
  Color,
  GLSL3,
  Matrix3,
  Points,
  MathUtils,
  RawShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import vertexShader from '../shaders/spray-circle.vert';
import fragmentShader from '../shaders/specks.frag';
import { palette } from '../core/palette';

const RIPPLES = 6;
const RIPPLE = {
  chance: 0.5,
  gap: [3.4, 7.9],
  duration: [2, 3.2],
  waveSeconds: [0.9, 1.6],
  span: [0.1, 0.28],
  waves: [1.6, 3.2],
  strength: [0.5, 1],
} as const;

const BENDS = 4;
const BEND = {
  reach: 0.2,
  push: 2.5,
  stiffness: 70,
  damping: 5,
  width: 0.45,
  limit: 0.3,
  merge: 0.5,
};

const BREAK = {
  looseness: 0.6,
  scatterSeconds: 4.5,
  width: 0.25,
  minSpeed: 0.8,
  fullSpeed: 8,
  cooldown: 0.06,
  ripple: 0.4,
};

const STRAY = {
  perSecond: 4,
  strength: [0.3, 1],
  inward: 0.3,
} as const;

interface Ripple {
  shape: Vector4;
  wave: Vector4;
  nextTime: number;
  broken: boolean;
}

interface Bend {
  angle: number;
  offset: Vector2;
  velocity: Vector2;
}

const CONTACT_SAMPLES = 6;

const toPointer = new Vector2();
const contact = new Vector2();
const nearest = new Vector2();
const normal = new Vector2();
const force = new Vector2();

export class SprayCircle extends Points<BufferGeometry, RawShaderMaterial> {
  readonly uniforms;
  private ripples: Ripple[] = Array.from({ length: RIPPLES }, () => ({
    shape: new Vector4(),
    wave: new Vector4(),
    nextTime: Math.random() * RIPPLE.gap[0],
    broken: true,
  }));
  private bends: Bend[] = Array.from({ length: BENDS }, () => ({
    angle: 0,
    offset: new Vector2(),
    velocity: new Vector2(),
  }));
  private lastBreakTime = -Infinity;
  private strays = 0;

  constructor(radius: number, count: number) {
    const uniforms = {
      uFrame: { value: new Matrix3() },
      uCenter: { value: new Vector3() },
      uDrop: { value: 0 },
      uRadius: { value: radius },
      uHideBehind: { value: 0 },
      uFlow: { value: 0 },
      uRipple: { value: 0.1 },
      uRippleShapes: { value: [] as Vector4[] },
      uRippleWaves: { value: [] as Vector4[] },
      uBendAngles: { value: new Array<number>(BENDS).fill(0) },
      uBendOffsets: { value: [] as Vector2[] },
      uBendWidth: { value: BEND.width / radius },
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uDim: { value: new Color(palette.ochreDim).convertLinearToSRGB() },
      uBright: { value: new Color(palette.ochre).convertLinearToSRGB() },
    };
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms,
      defines: { RIPPLES, BENDS, SCATTER_SECONDS: BREAK.scatterSeconds },
      transparent: true,
      depthWrite: false,
    });

    super(createStroke(count), material);
    this.uniforms = uniforms;
    uniforms.uRippleShapes.value = this.ripples.map((ripple) => ripple.shape);
    uniforms.uRippleWaves.value = this.ripples.map((ripple) => ripple.wave);
    uniforms.uBendOffsets.value = this.bends.map((bend) => bend.offset);
    this.frustumCulled = false;
  }

  update(dt: number, pointer: Vector2 | null, pointerVelocity: Vector2): void {
    const time = (this.uniforms.uTime.value += dt);
    this.ripples.forEach((ripple) => this.updateRipple(ripple, time));
    for (this.strays += dt * STRAY.perSecond; this.strays >= 1; this.strays--) this.stray(time);
    if (pointer) this.pushAt(pointer, pointerVelocity, dt);

    this.bends.forEach((bend, i) => {
      force.copy(bend.offset).multiplyScalar(-BEND.stiffness);
      force.addScaledVector(bend.velocity, -BEND.damping);
      bend.velocity.addScaledVector(force, dt);
      bend.offset.addScaledVector(bend.velocity, dt).clampLength(0, BEND.limit);
      this.uniforms.uBendAngles.value[i] = bend.angle;
    });
  }

  private updateRipple(ripple: Ripple, time: number): void {
    const { shape, wave } = ripple;
    if (time >= ripple.nextTime) {
      ripple.nextTime = time + MathUtils.randFloat(...RIPPLE.gap);
      if (Math.random() < RIPPLE.chance) {
        shape.set(
          Math.random() * Math.PI * 2,
          time,
          MathUtils.randFloat(...RIPPLE.duration),
          MathUtils.randFloat(...RIPPLE.span),
        );
        wave.set(
          MathUtils.randFloat(...RIPPLE.waves),
          MathUtils.randFloat(...RIPPLE.waveSeconds),
          Math.random() < 0.5 ? -1 : 1,
          MathUtils.randFloat(...RIPPLE.strength),
        );
        ripple.broken = false;
      }
    }

    if (!ripple.broken && time >= shape.y + shape.z * 0.3) {
      this.breakAt(shape.x, shape.w, wave.w * BREAK.ripple, null);
      ripple.broken = true;
    }
  }

  private stray(time: number): void {
    const stroke = this.geometry.getAttribute('position');
    const breaks = this.geometry.getAttribute('aBreak');
    const i = Math.floor(Math.random() * stroke.count);
    if (time - breaks.getX(i) < BREAK.scatterSeconds) return;

    const [ux, uy, , vx, vy] = this.uniforms.uFrame.value.elements;
    const angle = angleAt(stroke.getX(i), time, this.uniforms.uFlow.value);
    const outward = Math.atan2(
      uy * Math.cos(angle) + vy * Math.sin(angle),
      ux * Math.cos(angle) + vx * Math.sin(angle),
    );
    const push = Math.random() < STRAY.inward ? outward + Math.PI : outward;
    breaks.setXYZW(i, time, push, MathUtils.randFloat(...STRAY.strength), 1);
    breaks.needsUpdate = true;
  }

  private breakAt(angle: number, width: number, strength: number, push: number | null): void {
    const time = this.uniforms.uTime.value;
    const flow = this.uniforms.uFlow.value;
    const stroke = this.geometry.getAttribute('position');
    const loose = this.geometry.getAttribute('aLoose');
    const breaks = this.geometry.getAttribute('aBreak');
    let changed = false;

    for (let i = 0; i < stroke.count; i++) {
      const start = stroke.getX(i);
      if (time - breaks.getX(i) < BREAK.scatterSeconds) continue;

      const gap = angleBetween(angle, angleAt(start, time, flow));
      const reach = Math.min(1, strength) * Math.exp(-(gap * gap) / (width * width));
      if (loose.getX(i) > Math.min(1, reach * BREAK.looseness)) continue;

      breaks.setXYZW(i, time, push ?? 0, reach, push === null ? 0 : 1);
      changed = true;
    }
    if (changed) breaks.needsUpdate = true;
  }

  private pushAt(pointer: Vector2, pointerVelocity: Vector2, dt: number): void {
    const { uFrame, uCenter, uDrop, uRadius, uHideBehind } = this.uniforms;
    const [ux, uy, uz, vx, vy, vz, nx, ny, nz] = uFrame.value.elements;
    const radius = uRadius.value;
    const cx = uCenter.value.x - uDrop.value * nx;
    const cy = uCenter.value.y - uDrop.value * ny;
    const cz = uCenter.value.z - uDrop.value * nz;

    const det = (ux * vy - vx * uy) * radius * radius;
    let angle = 0;
    let distance = Infinity;
    for (let k = 0; k <= CONTACT_SAMPLES; k++) {
      contact.copy(pointer).addScaledVector(pointerVelocity, (-dt * k) / CONTACT_SAMPLES);
      toPointer.set(contact.x - cx, contact.y - cy);
      const qx = ((vy * toPointer.x - vx * toPointer.y) * radius) / det;
      const qy = ((ux * toPointer.y - uy * toPointer.x) * radius) / det;
      const sampleAngle = Math.atan2(qy, qx);
      nearest.set(
        cx + (ux * Math.cos(sampleAngle) + vx * Math.sin(sampleAngle)) * radius,
        cy + (uy * Math.cos(sampleAngle) + vy * Math.sin(sampleAngle)) * radius,
      );
      if (nearest.distanceTo(contact) < distance) {
        distance = nearest.distanceTo(contact);
        angle = sampleAngle;
      }
    }

    const closeness = 1 - MathUtils.smoothstep(distance, BEND.reach * 0.3, BEND.reach);
    if (closeness <= 0) return;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    nearest.set(cx + (ux * cos + vx * sin) * radius, cy + (uy * cos + vy * sin) * radius);

    const z = cz + (uz * cos + vz * sin) * radius;
    const behindSphere =
      z < uCenter.value.z &&
      Math.hypot(nearest.x - uCenter.value.x, nearest.y - uCenter.value.y) < uHideBehind.value;
    if (behindSphere) return;

    normal.set(uy * -sin + vy * cos, -(ux * -sin + vx * cos)).normalize();
    const along = normal.dot(pointerVelocity) * Math.sqrt(pointerVelocity.length());
    force.copy(normal).multiplyScalar(along * BEND.push * closeness);

    const bend = this.bendNear(angle);
    bend.angle += angleBetween(bend.angle, angle) * Math.min(1, dt * 10);
    bend.velocity.addScaledVector(force, dt);

    const speed = pointerVelocity.length();
    const time = this.uniforms.uTime.value;
    if (speed > BREAK.minSpeed && time - this.lastBreakTime > BREAK.cooldown) {
      const strength = closeness * Math.min(1, speed / BREAK.fullSpeed);
      const push = Math.atan2(pointerVelocity.y, pointerVelocity.x);
      this.breakAt(angle, BREAK.width / radius, strength, push);
      this.lastBreakTime = time;
    }
  }

  private bendNear(angle: number): Bend {
    const close = this.bends.find((bend) => Math.abs(angleBetween(bend.angle, angle)) < BEND.merge);
    if (close) return close;

    const calmest = this.bends.reduce((a, b) =>
      a.offset.length() + a.velocity.length() < b.offset.length() + b.velocity.length() ? a : b,
    );
    calmest.angle = angle;
    return calmest;
  }
}

function createStroke(count: number): BufferGeometry {
  const stroke = new Float32Array(count * 3);
  const look = new Float32Array(count * 3);
  const loose = new Float32Array(count);
  const breaks = new Float32Array(count * 4);
  const waves = Array.from({ length: 4 }, (_, i) => ({
    frequency: 2 + i * 3 + Math.floor(Math.random() * 3),
    phase: Math.random() * Math.PI * 2,
  }));

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const pressure = waves.reduce((sum, w) => sum + Math.sin(angle * w.frequency + w.phase), 0) / 4;
    stroke.set([angle, bellRandom() * 0.012, bellRandom() * 0.015], i * 3);
    look.set(
      [
        randomGrain(),
        Math.min(1, Math.max(0.1, 0.65 + pressure * 0.5 + (Math.random() - 0.5) * 0.7)),
        Math.random(),
      ],
      i * 3,
    );
    loose[i] = Math.random();
    breaks[i * 4] = -1e6;
  }

  return new BufferGeometry()
    .setAttribute('position', new BufferAttribute(stroke, 3))
    .setAttribute('aLook', new BufferAttribute(look, 3))
    .setAttribute('aLoose', new BufferAttribute(loose, 1))
    .setAttribute('aBreak', new BufferAttribute(breaks, 4));
}

function angleAt(start: number, time: number, flow: number): number {
  const track = MathUtils.euclideanModulo(start / Math.PI + time * flow, 1);
  return start < Math.PI ? Math.PI - track * Math.PI : Math.PI + track * Math.PI;
}

function randomGrain(): number {
  const roll = Math.random();
  return roll < 0.75 ? 1 : roll < 0.97 ? 2 : 3;
}

function bellRandom(): number {
  return (Math.random() + Math.random() + Math.random()) / 1.5 - 1;
}

function angleBetween(from: number, to: number): number {
  return MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI;
}
