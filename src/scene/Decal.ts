import {
  AdditiveBlending,
  GLSL3,
  Mesh,
  PlaneGeometry,
  RawShaderMaterial,
  Texture,
  TextureLoader,
} from 'three';
import vertexShader from '../shaders/decal.vert';
import fragmentShader from '../shaders/decal.frag';

export class Decal extends Mesh<PlaneGeometry, RawShaderMaterial> {
  readonly uniforms;
  readonly loaded: Promise<Texture>;

  constructor(url: string, width: number, height: number) {
    const uniforms = {
      uMap: { value: new Texture() },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
    };
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms,
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    super(new PlaneGeometry(width, height), material);
    this.uniforms = uniforms;
    this.loaded = new TextureLoader().loadAsync(url).then((map) => {
      uniforms.uMap.value = map;
      return map;
    });
  }
}
