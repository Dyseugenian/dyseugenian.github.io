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
  Texture,
  TextureLoader,
  Vector2,
} from 'three';
import densityUrl from '../assets/halo-density.png';
import vertexShader from '../shaders/halo.vert';
import fragmentShader from '../shaders/halo.frag';
import { Spring } from '../core/Spring';
import { palette } from '../core/palette';

const DENSITY_EXTENT = 252 / 140;
const EDGE_REACH = 0.7;
const LEAN_REACH = 3;

const turn = new Matrix4();

export class Halo extends Points<BufferGeometry, RawShaderMaterial> {
  tilt = 18;
  roll = -2;
  maxLean = 8;

  readonly uniforms;
  readonly loaded: Promise<void>;

  private pointerX = new Spring(60, 15.5);
  private pointerY = new Spring(60, 15.5);
  private push = new Spring(20, 9);
  private leanX = new Spring(40, 9);
  private leanY = new Spring(40, 9);
  private discMatrix = new Matrix4();

  constructor(count: number) {
    const uniforms = {
      uDisc: { value: new Matrix3() },
      uDensity: { value: new Texture() },
      uDensityExtent: { value: DENSITY_EXTENT },
      uDensityGain: { value: 1.75 },
      uVariation: { value: 0.25 },
      uEdgeReach: { value: EDGE_REACH },
      uPupilFade: { value: 0.2 },
      uOuterFade: { value: 0.6 },
      uOuterWobble: { value: 0.2 },
      uEdgeScatter: { value: 0.25 },
      uSpill: { value: 0.06 },
      uSpillBelow: { value: 0.05 },
      uSpillSides: { value: 0.06 },
      uBottomGrowth: { value: 0.3 },
      uSideGrowth: { value: 0.08 },
      uTopGrowth: { value: 0.15 },
      uSpillFalloff: { value: 0.15 },
      uScatter: { value: 2.0 },
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uPupilStretch: { value: 1.15 },
      uWingLength: { value: 0.52 },
      uWingWidth: { value: 0.3 },
      uWingFlick: { value: 0 },
      uWingAngle: { value: -0.27 },
      uInnerRadius: { value: 0.75 },
      uOuterRadius: { value: 2.05 },
      uFall: { value: 0.1 },
      uOrbitSpeed: { value: 0.12 },
      uDrift: { value: 1 },
      uFlicker: { value: 0.2 },
      uBreath: { value: 0.08 },
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
      depthTest: false,
      depthWrite: false,
    });

    super(createSpecks(count), material);
    this.uniforms = uniforms;
    this.frustumCulled = false;
    this.loaded = new TextureLoader().loadAsync(densityUrl).then((density) => {
      uniforms.uDensity.value = density;
    });
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

    const leanX = this.leanX.update(dt);
    const leanY = this.leanY.update(dt);
    this.rotation.set(leanX, leanY, 0, 'YXZ');
    this.discMatrix
      .makeRotationY(leanY)
      .multiply(turn.makeRotationX(leanX))
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
  const duration = new Float32Array(count);
  const look = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    orbit.set([Math.random(), Math.random() * Math.PI * 2, Math.random()], i * 3);
    duration[i] = 30 + Math.random() * 40;
    look.set([randomSize(), Math.random(), Math.random()], i * 3);
  }

  return new BufferGeometry()
    .setAttribute('position', new BufferAttribute(orbit, 3))
    .setAttribute('aDuration', new BufferAttribute(duration, 1))
    .setAttribute('aLook', new BufferAttribute(look, 3));
}

function randomSize(): number {
  const roll = Math.random();
  return roll < 0.55 ? 1 : roll < 0.85 ? 2 : 3;
}
