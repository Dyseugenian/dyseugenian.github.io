import {
  BufferGeometry,
  Color,
  GLSL3,
  Mesh,
  NoBlending,
  PlaneGeometry,
  RawShaderMaterial,
  Vector2,
  type IUniform,
  type Texture,
} from 'three';
import vertexShader from '../shaders/film.vert';
import fragmentShader from '../shaders/film.frag';

const FILM_FPS = 24;
const GRAIN = 0.08;
const WARP_GRID = { columns: 160, rows: 90 };

export function beneathGrain(color: string): Color {
  return new Color(color)
    .convertLinearToSRGB()
    .addScalar(-GRAIN / 4)
    .multiplyScalar(1 / (1 - GRAIN / 2));
}

export class Film extends Mesh<BufferGeometry, RawShaderMaterial> {
  readonly focus: Vector2;
  private uniforms;

  constructor(scene: Texture, bloom: Texture, roleUniforms: Record<string, IUniform>) {
    const uniforms = {
      ...roleUniforms,
      uScene: { value: scene },
      uBloom: { value: bloom },
      uTime: { value: 0 },
      uFps: { value: FILM_FPS },
      uResolution: { value: new Vector2(1, 1) },
      uPixelRatio: { value: 1 },
      uGrain: { value: GRAIN },
      uWarp: { value: 3 },
      uAberration: { value: 6 },
      uFocus: { value: new Vector2(0.5, 0.5) },
    };
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    });

    super(new PlaneGeometry(2, 2, WARP_GRID.columns, WARP_GRID.rows), material);
    this.uniforms = uniforms;
    this.focus = uniforms.uFocus.value;
    this.frustumCulled = false;
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.uniforms.uResolution.value.set(width, height);
    this.uniforms.uPixelRatio.value = pixelRatio;
  }

  update(time: number): void {
    this.uniforms.uTime.value = time;
  }
}
