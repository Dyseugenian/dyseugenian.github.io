import { BufferAttribute, BufferGeometry, GLSL3, Mesh, RawShaderMaterial } from 'three';
import vertexShader from '../shaders/fullscreen.vert';
import fragmentShader from '../shaders/grain.frag';

const GRAIN_FPS = 24;

export class Grain extends Mesh<BufferGeometry, RawShaderMaterial> {
  private uniforms;

  constructor() {
    const uniforms = {
      uTime: { value: 0 },
      uAmount: { value: 0.08 },
      uFps: { value: GRAIN_FPS },
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

    super(fullscreenTriangle(), material);
    this.uniforms = uniforms;
    this.frustumCulled = false;
  }

  update(time: number): void {
    this.uniforms.uTime.value = time;
  }
}

function fullscreenTriangle(): BufferGeometry {
  const corners = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
  return new BufferGeometry().setAttribute('position', new BufferAttribute(corners, 3));
}
