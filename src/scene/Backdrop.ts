import { GLSL3, Mesh, PlaneGeometry, RawShaderMaterial, type IUniform } from 'three';
import vertexShader from '../shaders/backdrop.vert';
import fragmentShader from '../shaders/backdrop.frag';

export class Backdrop extends Mesh<PlaneGeometry, RawShaderMaterial> {
  constructor(uniforms: Record<string, IUniform>) {
    super(
      new PlaneGeometry(2, 2),
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.frustumCulled = false;
    this.renderOrder = -1;
  }
}
