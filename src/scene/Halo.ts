import {
  BufferAttribute,
  BufferGeometry,
  Color,
  GLSL3,
  MathUtils,
  Matrix3,
  Matrix4,
  Points,
  RawShaderMaterial,
  Vector2,
} from 'three';
import vertexShader from '../shaders/halo.vert';
import fragmentShader from '../shaders/specks.frag';
import { Spring } from '../core/Spring';
import { palette } from '../core/palette';

const CLUSTER_SIZE = 150;
const CLUSTER_SHARE = 0.6;
const LEAN_REACH = 3;

const turn = new Matrix4();

export class Halo extends Points<BufferGeometry, RawShaderMaterial> {
  tilt = 18;
  roll = -2;
  maxLean = 8;

  readonly uniforms;

  private pointerX = new Spring(60, 15.5);
  private pointerY = new Spring(60, 15.5);
  private push = new Spring(20, 9);
  private leanX = new Spring(40, 9);
  private leanY = new Spring(40, 9);
  private discMatrix = new Matrix4();

  constructor(count: number) {
    const uniforms = {
      uDisc: { value: new Matrix3() },
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uInnerRadius: { value: 0.8 },
      uOuterRadius: { value: 1.6 },
      uRadialPower: { value: 1.5 },
      uFallRadius: { value: 0.3 },
      uThickness: { value: 0.7 },
      uLensRadius: { value: 0.96 },
      uOrbitSpeed: { value: 0.2 },
      uDrift: { value: 1 },
      uFlicker: { value: 0.35 },
      uBreath: { value: 0.08 },
      uBeaming: { value: 0.3 },
      uBrightness: { value: 1.6 },
      uPointer: { value: new Vector2() },
      uPush: { value: 0 },
      uPushRadius: { value: 0.45 },
      uPushStrength: { value: 0.14 },
      uDim: { value: new Color(palette.ochreDim).convertLinearToSRGB() },
      uOchre: { value: new Color(palette.ochre).convertLinearToSRGB() },
      uHi: { value: new Color(palette.ochreHi).convertLinearToSRGB() },
    };
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      depthWrite: false,
    });

    super(createSpecks(count), material);
    this.uniforms = uniforms;
    this.frustumCulled = false;
  }

  setCount(count: number): void {
    this.geometry.setDrawRange(0, count);
  }

  update(dt: number, pointer: Vector2 | null): void {
    if (pointer) {
      this.pointerX.target = pointer.x;
      this.pointerY.target = pointer.y;
    }
    this.push.target = pointer ? 1 : 0;
    this.leanX.target = pointer ? -this.leanToward(pointer.y) : 0;
    this.leanY.target = pointer ? this.leanToward(pointer.x) : 0;

    this.discMatrix
      .makeRotationY(this.leanY.update(dt))
      .multiply(turn.makeRotationX(this.leanX.update(dt)))
      .multiply(turn.makeRotationZ(MathUtils.degToRad(this.roll)))
      .multiply(turn.makeRotationX(MathUtils.degToRad(this.tilt - 90)));

    const { uniforms } = this;
    uniforms.uDisc.value.setFromMatrix4(this.discMatrix);
    uniforms.uTime.value += dt;
    uniforms.uPointer.value.set(this.pointerX.update(dt), this.pointerY.update(dt));
    uniforms.uPush.value = this.push.update(dt);
  }

  private leanToward(offset: number): number {
    return MathUtils.clamp(offset / LEAN_REACH, -1, 1) * MathUtils.degToRad(this.maxLean);
  }
}

function createSpecks(count: number): BufferGeometry {
  const orbit = new Float32Array(count * 3);
  const life = new Float32Array(count * 2);
  const look = new Float32Array(count * 3);

  let cluster = randomOrbit();
  for (let i = 0; i < count; i++) {
    if (i % CLUSTER_SIZE === 0) cluster = randomOrbit();
    const speck = Math.random() < CLUSTER_SHARE ? nearOrbit(cluster) : randomOrbit();
    orbit.set([speck.radius, speck.angle, bellRandom()], i * 3);
    life.set([speck.phase, speck.duration], i * 2);
    look.set(
      [Math.random() < 0.65 ? 1 : 2, 0.15 + Math.random() ** 2 * 0.85, Math.random()],
      i * 3,
    );
  }

  return new BufferGeometry()
    .setAttribute('position', new BufferAttribute(orbit, 3))
    .setAttribute('aLife', new BufferAttribute(life, 2))
    .setAttribute('aLook', new BufferAttribute(look, 3));
}

interface Orbit {
  radius: number;
  angle: number;
  phase: number;
  duration: number;
}

function randomOrbit(): Orbit {
  return {
    radius: Math.random(),
    angle: Math.random() * Math.PI * 2,
    phase: Math.random(),
    duration: 40 + Math.random() * 50,
  };
}

function nearOrbit(cluster: Orbit): Orbit {
  return {
    radius: MathUtils.clamp(cluster.radius + bellRandom() * 0.04, 0, 1),
    angle: cluster.angle + bellRandom() * 0.15,
    phase: cluster.phase + bellRandom() * 0.01,
    duration: cluster.duration,
  };
}

function bellRandom(): number {
  return (Math.random() + Math.random() + Math.random()) / 1.5 - 1;
}
