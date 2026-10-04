import {
  BufferAttribute,
  BufferGeometry,
  GLSL3,
  Mesh,
  NoBlending,
  RawShaderMaterial,
  Vector2,
  type Texture,
} from 'three';
import vertexShader from '../shaders/fullscreen.vert';
import fragmentShader from '../shaders/film.frag';

const FILM_FPS = 24;

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

    super(fullscreenTriangle(), material);
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

function fullscreenTriangle(): BufferGeometry {
  const corners = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
  return new BufferGeometry().setAttribute('position', new BufferAttribute(corners, 3));
}
