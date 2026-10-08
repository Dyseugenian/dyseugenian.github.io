import { Color, GLSL3, Mesh, PlaneGeometry, RawShaderMaterial } from 'three';
import vertexShader from '../shaders/backdrop.vert';
import fragmentShader from '../shaders/veil.frag';

export class Veil extends Mesh<PlaneGeometry, RawShaderMaterial> {
  readonly uniforms;

  constructor(color: string) {
    const uniforms = {
      uColor: { value: new Color(color).convertLinearToSRGB() },
      uOpacity: { value: 1 },
    };
    super(
      new PlaneGeometry(2, 2),
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.uniforms = uniforms;
    this.frustumCulled = false;
    this.renderOrder = 3;
  }
}
