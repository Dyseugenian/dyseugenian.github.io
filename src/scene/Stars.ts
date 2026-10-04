import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  GLSL3,
  MathUtils,
  Points,
  RawShaderMaterial,
  Vector2,
  type Box2,
} from 'three';
import vertexShader from '../shaders/stars.vert';
import fragmentShader from '../shaders/specks.frag';
import { palette } from '../core/palette';

const STARS = { pixelsPerStar: 900, twinkle: [0.3, 1.4], drift: 1 / 60, depth: 0.3 } as const;

export class Stars extends Points<BufferGeometry, RawShaderMaterial> {
  readonly uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uDim: { value: new Color(palette.ochreDim).convertLinearToSRGB() },
    uBright: { value: new Color(palette.ochreHi).convertLinearToSRGB() },
    uBackground: { value: new Color(palette.bg).convertLinearToSRGB() },
    uCenter: { value: new Vector2() },
    uKeepOutMin: { value: new Vector2() },
    uKeepOutMax: { value: new Vector2() },
    uDrift: { value: STARS.drift },
    uDepth: { value: STARS.depth },
  };

  constructor(
    private sphere: { center: Vector2; radius: number },
    private wordmark: Box2,
  ) {
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    super(new BufferGeometry(), material);
    material.uniforms = this.uniforms;
    this.uniforms.uCenter.value.copy(sphere.center);
    this.uniforms.uKeepOutMin.value.copy(wordmark.min);
    this.uniforms.uKeepOutMax.value.copy(wordmark.max);
    this.frustumCulled = false;
    this.renderOrder = -1;
  }

  scatter(view: Box2, screenPixels: number): void {
    const count = Math.round(screenPixels / STARS.pixelsPerStar);
    const positions = new Float32Array(count * 3);
    const stars = new Float32Array(count * 4);
    const point = new Vector2();

    for (let i = 0; i < count; i++) {
      do {
        point.set(
          MathUtils.randFloat(view.min.x, view.max.x),
          MathUtils.randFloat(view.min.y, view.max.y),
        );
      } while (
        point.distanceTo(this.sphere.center) < this.sphere.radius ||
        this.wordmark.containsPoint(point)
      );

      const brightness = Math.random();
      positions.set([point.x, point.y, 0], i * 3);
      stars.set(
        [
          0.3 + 0.6 * brightness ** 3,
          brightness > 0.93 ? 2 : 1,
          Math.random() * Math.PI * 2,
          MathUtils.randFloat(...STARS.twinkle),
        ],
        i * 4,
      );
    }

    this.geometry.dispose();
    this.geometry = new BufferGeometry()
      .setAttribute('position', new BufferAttribute(positions, 3))
      .setAttribute('aStar', new BufferAttribute(stars, 4));
  }

  update(dt: number): void {
    this.uniforms.uTime.value += dt;
  }
}
