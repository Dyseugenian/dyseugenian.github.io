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
      uDensityGain: { value: 1.5 },
      uVariation: { value: 0.25 },
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uPupilStretch: { value: 1.15 },
      uInnerRadius: { value: 0.85 },
      uOuterRadius: { value: 1.85 },
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
  const orbit = new Float32Array(count * 2);
  const life = new Float32Array(count * 2);
  const look = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    orbit.set([Math.random(), Math.random() * Math.PI * 2], i * 2);
    life.set([Math.random(), 30 + Math.random() * 40], i * 2);
    look.set([randomSize(), Math.random(), Math.random()], i * 3);
  }

  return new BufferGeometry()
    .setAttribute('position', new BufferAttribute(orbit, 2))
    .setAttribute('aLife', new BufferAttribute(life, 2))
    .setAttribute('aLook', new BufferAttribute(look, 3));
}

function randomSize(): number {
  const roll = Math.random();
  return roll < 0.55 ? 1 : roll < 0.85 ? 2 : 3;
}
