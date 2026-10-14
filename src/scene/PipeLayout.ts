import {
  Float32BufferAttribute,
  FloatType,
  GLSL3,
  InstancedBufferGeometry,
  type IUniform,
  type Mesh,
  NearestFilter,
  OrthographicCamera,
  Points,
  RawShaderMaterial,
  Scene,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import vertexShader from '../shaders/spout-layout.vert';
import fragmentShader from '../shaders/spout-layout.frag';

const TEXELS = 28;

type Laid = {
  points: Points<InstancedBufferGeometry>;
  drawn: InstancedBufferGeometry;
  target: WebGLRenderTarget;
};

export class PipeLayout {
  private scene = new Scene();
  private camera = new OrthographicCamera();
  private laid: Laid[] = [];

  constructor(private uniforms: Record<string, IUniform>) {}

  lay({ geometry, material }: Mesh<InstancedBufferGeometry, RawShaderMaterial>): void {
    const rows = geometry.getAttribute('aTile').count;
    const target = new WebGLRenderTarget(TEXELS, rows, {
      depthBuffer: false,
      type: FloatType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
    });
    const slots = new InstancedBufferGeometry();
    slots.setAttribute('position', new Float32BufferAttribute(new Float32Array(TEXELS * 3), 3));
    slots.setAttribute('aTile', geometry.getAttribute('aTile'));
    slots.setAttribute('aStorey', geometry.getAttribute('aStorey'));
    const points = new Points(
      slots,
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        defines: { ...material.defines, LAID_OUT: false },
        uniforms: { ...this.uniforms, uLayoutRows: { value: rows } },
      }),
    );
    points.frustumCulled = false;
    material.uniforms.uPipeLayout!.value = target.texture;
    this.scene.add(points);
    this.laid.push({ points, drawn: geometry, target });
  }

  async compile(renderer: WebGLRenderer): Promise<void> {
    await renderer.compileAsync(this.scene, this.camera);
  }

  render(renderer: WebGLRenderer): void {
    const current = renderer.getRenderTarget();
    for (const { points, drawn, target } of this.laid) {
      points.geometry.instanceCount = drawn.instanceCount;
      renderer.setRenderTarget(target);
      renderer.render(points, this.camera);
    }
    renderer.setRenderTarget(current);
  }
}
