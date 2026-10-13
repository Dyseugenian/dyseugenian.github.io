import {
  Color,
  CustomBlending,
  GLSL3,
  Group,
  LatheGeometry,
  Mesh,
  OneFactor,
  Quaternion,
  RawShaderMaterial,
  SrcColorFactor,
  Vector2,
  Vector3,
  ZeroFactor,
  type IUniform,
} from 'three';
import vertexShader from '../shaders/bottle.vert';
import fragmentShader from '../shaders/bottle.frag';
import { palette } from '../core/palette';
import { BAY } from './facade';

const PERIOD = 5;
const FIRST_DROP = 2;
const GRAVITY = 9.81;
const SIDES = 32;
const DROP_HEIGHT = { min: 22, max: 60 };
const RELEASE_Z = { min: -1.3, max: -0.9 };
const CLOSE_CHANCE = 0.3;
const CLOSE_PASS = { min: 0.22, max: 0.6 };
const BEAM_PASS = { ahead: { min: -0.9, max: 1.1 }, aside: 1.3 };
const HIDDEN = new Vector3(0, -1000, 0);

const BEER = [
  [0, 0],
  [0.028, 0],
  [0.031, 0.004],
  [0.031, 0.12],
  [0.029, 0.145],
  [0.022, 0.17],
  [0.015, 0.185],
  [0.0125, 0.2],
  [0.0125, 0.228],
  [0.0145, 0.231],
  [0.0145, 0.239],
  [0.011, 0.24],
  [0.0095, 0.232],
];
const WINE = [
  [0, 0],
  [0.034, 0],
  [0.0375, 0.005],
  [0.0375, 0.19],
  [0.035, 0.21],
  [0.025, 0.235],
  [0.017, 0.25],
  [0.0145, 0.265],
  [0.0145, 0.288],
  [0.0165, 0.291],
  [0.0165, 0.3],
  [0.012, 0.3],
  [0.0105, 0.292],
];

type Spin = {
  base: Quaternion;
  first: Vector3;
  firstRate: number;
  second: Vector3;
  tilt: number;
  roll: number;
  settle: number;
};

function between(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function lathe(profile: number[][]): LatheGeometry {
  const height = profile.reduce((top, [, y]) => Math.max(top, y!), 0);
  const points = profile.map(([radius, y]) => new Vector2(radius, y! - 0.45 * height));
  return new LatheGeometry(points, SIDES);
}

function randomAxis(): Vector3 {
  return new Vector3(between(-1, 1), between(-1, 1), between(-1, 1)).normalize();
}

function level(): Vector3 {
  const angle = between(0, 2 * Math.PI);
  return new Vector3(Math.cos(angle), 0, Math.sin(angle));
}

function spin(): Spin {
  const base = new Quaternion().setFromAxisAngle(randomAxis(), between(0, 2 * Math.PI));
  const sign = Math.random() < 0.5 ? -1 : 1;
  const plain = { base, first: level(), second: level(), tilt: 0, roll: 0, settle: 0 };
  const pattern = Math.floor(Math.random() * 5);
  if (pattern === 0) return { ...plain, firstRate: sign * between(5, 13), roll: between(-3, 3) };
  if (pattern === 1) {
    return {
      ...plain,
      first: randomAxis(),
      firstRate: sign * between(0.5, 2),
      roll: sign * between(15, 30),
    };
  }
  if (pattern === 2) {
    return {
      ...plain,
      base: new Quaternion(),
      first: new Vector3(0, 1, 0),
      firstRate: sign * between(6, 14),
      tilt: Math.PI / 2 + between(-0.2, 0.2),
      roll: between(-2, 2),
    };
  }
  if (pattern === 3) {
    return {
      ...plain,
      base: new Quaternion(),
      first: new Vector3(0, 1, 0),
      firstRate: sign * between(2, 5),
      tilt: between(0.3, 0.9),
      roll: -sign * between(8, 18),
    };
  }
  return {
    ...plain,
    firstRate: sign * between(9, 16),
    roll: between(-1, 1),
    settle: between(0.6, 1.4),
  };
}

export class Bottles extends Group {
  private clock = 0;
  private nextDrop = FIRST_DROP;
  private since = Infinity;
  private flight = 0;
  private start = new Vector3();
  private velocity = new Vector3();
  private spin = spin();
  private tints = [palette.bottleAmber, palette.bottleGreen, palette.glassGreen].map((hex) =>
    new Color(hex).convertLinearToSRGB(),
  );
  private uniforms;
  private turn = new Quaternion();

  constructor(shared: Record<string, IUniform>) {
    super();
    const beer = lathe(BEER);
    const wine = lathe(WINE);
    beer.setAttribute('aWine', wine.getAttribute('position'));
    beer.setAttribute('aWineNormal', wine.getAttribute('normal'));
    wine.dispose();
    this.uniforms = {
      ...shared,
      uVelocity: { value: new Vector3() },
      uShape: { value: 0 },
      uTint: { value: new Color() },
      uLabel: { value: 0 },
      uSeed: { value: 0 },
    };
    const passes = [
      { pass: 0, blendSrc: ZeroFactor, blendDst: SrcColorFactor },
      { pass: 1, blendSrc: OneFactor, blendDst: OneFactor },
    ];
    for (const { pass, blendSrc, blendDst } of passes) {
      const mesh = new Mesh(
        beer,
        new RawShaderMaterial({
          glslVersion: GLSL3,
          vertexShader,
          fragmentShader,
          uniforms: this.uniforms,
          defines: { PASS: pass },
          blending: CustomBlending,
          blendSrc,
          blendDst,
          transparent: true,
          depthWrite: false,
        }),
      );
      mesh.frustumCulled = false;
      mesh.renderOrder = 2 + 0.1 * pass;
      this.add(mesh);
    }
    this.position.copy(HIDDEN);
  }

  update(step: number, eye: Vector3, spot: Vector3): void {
    this.clock += step;
    if (this.clock >= this.nextDrop) {
      this.drop(eye, spot);
      this.nextDrop += PERIOD;
    }
    this.since += step;
    if (this.since > this.flight) {
      this.position.copy(HIDDEN);
      this.uniforms.uVelocity.value.set(0, 0, 0);
      return;
    }
    const t = this.since;
    this.position.copy(this.start).addScaledVector(this.velocity, t);
    this.position.y -= 0.5 * GRAVITY * t * t;
    this.uniforms.uVelocity.value.copy(this.velocity).setY(this.velocity.y - GRAVITY * t);

    const { base, first, firstRate, second, tilt, roll, settle } = this.spin;
    const turned = settle > 0 ? firstRate * settle * (1 - Math.exp(-t / settle)) : firstRate * t;
    this.quaternion.setFromAxisAngle(first, turned);
    this.quaternion.multiply(this.turn.setFromAxisAngle(second, tilt));
    this.quaternion.multiply(base);
    this.quaternion.multiply(this.turn.setFromAxisAngle(new Vector3(0, 1, 0), roll * t));
  }

  private drop(eye: Vector3, spot: Vector3): void {
    const close = Math.random() < CLOSE_CHANCE;
    const pass = new Vector3();
    if (close) {
      const angle = between(Math.PI * 0.85, Math.PI * 2.15);
      const reach = between(CLOSE_PASS.min, CLOSE_PASS.max);
      pass.set(eye.x + Math.cos(angle) * reach, eye.y, eye.z + Math.sin(angle) * reach);
    } else {
      pass.set(
        spot.x + between(-BEAM_PASS.aside, BEAM_PASS.aside),
        eye.y,
        spot.z + between(BEAM_PASS.ahead.min, BEAM_PASS.ahead.max),
      );
    }
    const height = between(DROP_HEIGHT.min, DROP_HEIGHT.max);
    const toss = between(0, 1.5);
    const fall = (toss + Math.sqrt(toss * toss + 2 * GRAVITY * height)) / GRAVITY;
    this.start.set(
      Math.round(pass.x / BAY) * BAY + between(-0.8, 0.8),
      eye.y + height,
      between(RELEASE_Z.min, RELEASE_Z.max),
    );
    this.velocity.set((pass.x - this.start.x) / fall, toss, (pass.z - this.start.z) / fall);
    this.flight = fall + 1;
    this.since = 0;
    this.spin = spin();
    this.uniforms.uShape.value = Math.random() < 0.65 ? 0 : 1;
    this.uniforms.uTint.value.copy(this.tints[Math.floor(Math.random() * this.tints.length)]!);
    this.uniforms.uLabel.value = Math.random() < 0.6 ? 1 : 0;
    this.uniforms.uSeed.value = Math.random();
  }
}
