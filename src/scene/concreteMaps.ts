import {
  Camera,
  GLSL3,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  PlaneGeometry,
  RawShaderMaterial,
  RepeatWrapping,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import vertexShader from '../shaders/backdrop.vert';
import fragmentShader from '../shaders/concrete-maps.frag';

export const MAP_METERS = 2;
const MAP_SIZE = 1024;

export function bakeConcreteMaps(renderer: WebGLRenderer): Texture {
  const target = new WebGLRenderTarget(MAP_SIZE, MAP_SIZE, {
    wrapS: RepeatWrapping,
    wrapT: RepeatWrapping,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: true,
    anisotropy: renderer.capabilities.getMaxAnisotropy(),
    depthBuffer: false,
  });
  const quad = new Mesh(
    new PlaneGeometry(2, 2),
    new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: { uSize: { value: MAP_SIZE }, uMeters: { value: MAP_METERS } },
      depthTest: false,
      depthWrite: false,
    }),
  );
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(quad, new Camera());
  renderer.setRenderTarget(previous);
  quad.geometry.dispose();
  quad.material.dispose();
  return target.texture;
}
