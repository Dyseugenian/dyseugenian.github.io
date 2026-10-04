import {
  BufferGeometry,
  GLSL3,
  Mesh,
  NoBlending,
  PlaneGeometry,
  RawShaderMaterial,
  Vector2,
  type Texture,
} from 'three';
import vertexShader from '../shaders/film.vert';
import fragmentShader from '../shaders/film.frag';

const FILM_FPS = 24;
const WARP_GRID = { columns: 160, rows: 90 };

export class Film extends Mesh<BufferGeometry, RawShaderMaterial> {
  private uniforms;

  constructor(scene: Texture) {
    const uniforms = {
      uScene: { value: scene },
      uTime: { value: 0 },
      uFps: { value: FILM_FPS },
      uResolution: { value: new Vector2(1, 1) },
      uPixelRatio: { value: 1 },
      uGrain: { value: 0.08 },
      uWarp: { value: 3 },
      uAberration: { value: 6 },
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
