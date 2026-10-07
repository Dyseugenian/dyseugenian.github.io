import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  GLSL3,
  MathUtils,
  Points,
  RawShaderMaterial,
  type IUniform,
} from 'three';
import vertexShader from '../shaders/infall.vert';
import fragmentShader from '../shaders/specks.frag';
import { palette } from '../core/palette';

const INFALL = {
  start: [4, 12],
  end: [1.25, 1.85],
  life: [14, 32],
  spin: [0.12, 0.35],
} as const;

export class Infall extends Points<BufferGeometry, RawShaderMaterial> {
  readonly uniforms;

  constructor(maxCount: number, stretch: IUniform<number>) {
    const uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uOpacity: { value: 1 },
      uStretch: stretch,
      uDim: { value: new Color(palette.ochreDim).convertLinearToSRGB() },
      uHi: { value: new Color(palette.ochreHi).convertLinearToSRGB() },
      uBackground: { value: new Color(palette.bg).convertLinearToSRGB() },
    };
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms,
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    super(createSpecks(maxCount), material);
    this.uniforms = uniforms;
    this.frustumCulled = false;
  }

  setCount(count: number): void {
    this.geometry.setDrawRange(0, count);
  }

  update(dt: number): void {
    this.uniforms.uTime.value += dt;
  }
}

function createSpecks(count: number): BufferGeometry {
  const path = new Float32Array(count * 3);
  const motion = new Float32Array(count * 3);
  const look = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    path.set(
      [MathUtils.randFloat(...INFALL.start), Math.random() * Math.PI * 2, Math.random()],
      i * 3,
    );
    motion.set(
      [
        MathUtils.randFloat(...INFALL.life),
        MathUtils.randFloat(...INFALL.spin),
        MathUtils.randFloat(...INFALL.end),
      ],
      i * 3,
    );
    look.set([Math.random() < 0.8 ? 1 : 2, Math.random()], i * 2);
  }

  return new BufferGeometry()
    .setAttribute('position', new BufferAttribute(path, 3))
    .setAttribute('aMotion', new BufferAttribute(motion, 3))
    .setAttribute('aLook', new BufferAttribute(look, 2));
}
