import {
  BufferAttribute,
  BufferGeometry,
  Color,
  GLSL3,
  Matrix3,
  Points,
  RawShaderMaterial,
  Vector3,
} from 'three';
import vertexShader from '../shaders/spray-circle.vert';
import fragmentShader from '../shaders/specks.frag';
import { palette } from '../core/palette';

export class SprayCircle extends Points<BufferGeometry, RawShaderMaterial> {
  readonly uniforms;

  constructor(radius: number, count: number) {
    const uniforms = {
      uFrame: { value: new Matrix3() },
      uCenter: { value: new Vector3() },
      uDrop: { value: 0 },
      uRadius: { value: radius },
      uHideBehind: { value: 0 },
      uSpin: { value: 0 },
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
      transparent: true,
      depthWrite: false,
    });

    super(createStroke(count), material);
    this.uniforms = uniforms;
    this.frustumCulled = false;
  }

  update(dt: number): void {
    this.uniforms.uTime.value += dt;
  }
}

function createStroke(count: number): BufferGeometry {
  const stroke = new Float32Array(count * 3);
  const look = new Float32Array(count * 3);
  const waves = Array.from({ length: 4 }, (_, i) => ({
    frequency: 2 + i * 3 + Math.floor(Math.random() * 3),
    phase: Math.random() * Math.PI * 2,
  }));

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const pressure = waves.reduce((sum, w) => sum + Math.sin(angle * w.frequency + w.phase), 0) / 4;
    stroke.set([angle, bellRandom() * 0.012, bellRandom() * 0.01], i * 3);
    look.set(
      [
        Math.random() < 0.6 ? 1 : 2,
        Math.min(1, Math.max(0.1, 0.65 + pressure * 0.5 + (Math.random() - 0.5) * 0.4)),
        Math.random(),
      ],
      i * 3,
    );
  }

  return new BufferGeometry()
    .setAttribute('position', new BufferAttribute(stroke, 3))
    .setAttribute('aLook', new BufferAttribute(look, 3));
}

function bellRandom(): number {
  return (Math.random() + Math.random() + Math.random()) / 1.5 - 1;
}
