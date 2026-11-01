import {
  Camera,
  FloatType,
  GLSL3,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NearestFilter,
  PlaneGeometry,
  RawShaderMaterial,
  RedFormat,
  RepeatWrapping,
  WebGLRenderTarget,
  type IUniform,
  type Texture,
  type WebGLRenderer,
} from 'three';
import vertexShader from '../shaders/backdrop.vert';
import heightShader from '../shaders/concrete-height.frag';
import fragmentShader from '../shaders/concrete-maps.frag';

export const MAP_METERS = 2;
const MAP_SIZE = 1024;

export async function bakeConcreteMaps(renderer: WebGLRenderer): Promise<Texture> {
  const heights = new WebGLRenderTarget(MAP_SIZE, MAP_SIZE, {
    type: FloatType,
    format: RedFormat,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: false,
  });
  const target = new WebGLRenderTarget(MAP_SIZE, MAP_SIZE, {
    wrapS: RepeatWrapping,
    wrapT: RepeatWrapping,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: true,
    anisotropy: renderer.capabilities.getMaxAnisotropy(),
    depthBuffer: false,
  });
  const geometry = new PlaneGeometry(2, 2);
  const pass = (shader: string, uniforms: Record<string, IUniform>) =>
    new Mesh(
      geometry,
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader: shader,
        uniforms,
        depthTest: false,
        depthWrite: false,
      }),
    );
  const size = { value: MAP_SIZE };
  const height = pass(heightShader, { uSize: size });
  const maps = pass(fragmentShader, {
    uHeight: { value: heights.texture },
    uSize: size,
    uMeters: { value: MAP_METERS },
  });
  const camera = new Camera();
  await Promise.all([renderer.compileAsync(height, camera), renderer.compileAsync(maps, camera)]);
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(heights);
  renderer.render(height, camera);
  renderer.setRenderTarget(target);
  renderer.render(maps, camera);
  renderer.setRenderTarget(previous);
  geometry.dispose();
  height.material.dispose();
  maps.material.dispose();
  heights.dispose();
  return target.texture;
}
