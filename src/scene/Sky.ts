import {
  GLSL3,
  type IUniform,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RawShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import vertexShader from '../shaders/backdrop.vert';
import fragmentShader from '../shaders/sky.frag';
import { SKY_LAYER } from './layers';

export class Sky extends Mesh<PlaneGeometry, RawShaderMaterial> {
  readonly target = new WebGLRenderTarget(1, 1, { depthBuffer: false });
  private camera = new OrthographicCamera();

  constructor(uniforms: Record<string, IUniform>) {
    super(
      new PlaneGeometry(2, 2),
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: { ...uniforms, uSkySize: { value: new Vector2(1, 1) } },
      }),
    );
    this.frustumCulled = false;
    this.layers.set(SKY_LAYER);
    this.camera.layers.set(SKY_LAYER);
  }

  fit(width: number, height: number): void {
    this.target.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
    this.material.uniforms.uSkySize!.value.set(this.target.width, this.target.height);
  }

  render(renderer: WebGLRenderer): void {
    const target = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this, this.camera);
    renderer.setRenderTarget(target);
  }
}
