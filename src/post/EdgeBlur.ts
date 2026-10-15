import {
  GLSL3,
  Mesh,
  NoBlending,
  PlaneGeometry,
  RawShaderMaterial,
  Vector2,
  type Texture,
} from 'three';
import vertexShader from '../shaders/backdrop.vert';
import fragmentShader from '../shaders/edge-blur.frag';
import { FILM_FPS } from './Film';

export class EdgeBlur extends Mesh<PlaneGeometry, RawShaderMaterial> {
  readonly focus: Vector2;
  private uniforms;

  constructor(source: Texture) {
    const uniforms = {
      uSource: { value: source },
      uResolution: { value: new Vector2(1, 1) },
      uPixelRatio: { value: 1 },
      uFrame: { value: 0 },
      uFocus: { value: new Vector2(0.5, 0.5) },
    };
    super(
      new PlaneGeometry(2, 2),
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms,
        blending: NoBlending,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.uniforms = uniforms;
    this.focus = uniforms.uFocus.value;
    this.frustumCulled = false;
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.uniforms.uResolution.value.set(width, height);
    this.uniforms.uPixelRatio.value = pixelRatio;
  }

  update(time: number): void {
    this.uniforms.uFrame.value = Math.floor(time * FILM_FPS);
  }
}
