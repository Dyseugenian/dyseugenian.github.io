import { Color, GLSL3, Mesh, PlaneGeometry, RawShaderMaterial } from 'three';
import vertexShader from '../shaders/decal.vert';
import fragmentShader from '../shaders/shade.frag';
import { palette } from '../core/palette';

export class Shade extends Mesh<PlaneGeometry, RawShaderMaterial> {
  readonly uniforms;

  constructor(radius: number, strength: number) {
    const uniforms = {
      uColor: { value: new Color(palette.void).convertLinearToSRGB() },
      uStrength: { value: strength },
      uOpacity: { value: 1 },
    };
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    super(new PlaneGeometry(2 * radius, 2 * radius), material);
    this.uniforms = uniforms;
    this.renderOrder = -1;
  }
}
