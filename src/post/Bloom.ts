import {
  AddEquation,
  type Camera,
  CustomBlending,
  GLSL3,
  HalfFloatType,
  Mesh,
  NoBlending,
  OneFactor,
  PlaneGeometry,
  RawShaderMaterial,
  type Texture,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import vertexShader from '../shaders/backdrop.vert';
import downShader from '../shaders/bloom-down.frag';
import upShader from '../shaders/bloom-up.frag';

const LEVELS = 5;

export class Bloom {
  readonly down: Mesh<PlaneGeometry, RawShaderMaterial>;
  readonly up: Mesh<PlaneGeometry, RawShaderMaterial>;
  private levels = Array.from(
    { length: LEVELS },
    () => new WebGLRenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType }),
  );

  private sceneTexel = new Vector2();

  constructor(private scene: Texture) {
    const quad = new PlaneGeometry(2, 2);
    this.down = new Mesh(
      quad,
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader: downShader,
        uniforms: {
          uSource: { value: scene },
          uTexel: { value: new Vector2() },
          uTarget: { value: new Vector2() },
          uFirst: { value: 1 },
        },
        blending: NoBlending,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.up = new Mesh(
      quad,
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader: upShader,
        uniforms: {
          uSource: { value: null },
          uTexel: { value: new Vector2() },
          uTarget: { value: new Vector2() },
        },
        blending: CustomBlending,
        blendEquation: AddEquation,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.down.frustumCulled = false;
    this.up.frustumCulled = false;
  }

  get texture(): Texture {
    return this.levels[0]!.texture;
  }

  setSize(width: number, height: number): void {
    this.sceneTexel.set(1 / width, 1 / height);
    this.levels.forEach((level, i) =>
      level.setSize(
        Math.max(1, Math.round(width / 2 ** (i + 1))),
        Math.max(1, Math.round(height / 2 ** (i + 1))),
      ),
    );
  }

  render(renderer: WebGLRenderer, camera: Camera): void {
    const down = this.down.material.uniforms;
    const up = this.up.material.uniforms;
    let source = this.scene;
    let texel = this.sceneTexel;
    this.levels.forEach((level, i) => {
      down.uSource!.value = source;
      down.uTexel!.value.copy(texel);
      down.uFirst!.value = i === 0 ? 1 : 0;
      down.uTarget!.value.set(1 / level.width, 1 / level.height);
      renderer.setRenderTarget(level);
      renderer.render(this.down, camera);
      source = level.texture;
      texel = down.uTarget!.value;
    });
    for (let i = LEVELS - 1; i > 0; i--) {
      const from = this.levels[i]!;
      up.uSource!.value = from.texture;
      up.uTexel!.value.set(1 / from.width, 1 / from.height);
      up.uTarget!.value.set(1 / this.levels[i - 1]!.width, 1 / this.levels[i - 1]!.height);
      renderer.setRenderTarget(this.levels[i - 1]!);
      renderer.render(this.up, camera);
    }
  }
}
