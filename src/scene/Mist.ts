import {
  Color,
  CustomBlending,
  GLSL3,
  HalfFloatType,
  type IUniform,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  type PerspectiveCamera,
  PlaneGeometry,
  RawShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import vertexShader from '../shaders/backdrop.vert';
import fragmentShader from '../shaders/mist.frag';
import overShader from '../shaders/mist-over.frag';
import { palette } from '../core/palette';
import { MIST_LAYER } from './layers';

export class Mist extends Mesh<PlaneGeometry, RawShaderMaterial> {
  readonly target = new WebGLRenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
  readonly over: Mesh<PlaneGeometry, RawShaderMaterial>;
  readonly gaze: Vector4;
  private uniforms;
  private camera = new OrthographicCamera();

  constructor(uniforms: Record<string, IUniform>) {
    const own = {
      uMistSize: { value: new Vector2(1, 1) },
      uViewer: { value: new Vector3() },
      uViewToWorld: { value: new Matrix4() },
      uClipToView: { value: new Matrix4() },
      uGaze: { value: new Vector4() },
      uOchre: { value: new Color(palette.ochre).convertLinearToSRGB() },
    };
    super(
      new PlaneGeometry(2, 2),
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: { ...uniforms, ...own },
      }),
    );
    this.uniforms = own;
    this.gaze = own.uGaze.value;
    this.frustumCulled = false;
    this.layers.set(MIST_LAYER);
    this.camera.layers.set(MIST_LAYER);

    this.over = new Mesh(
      new PlaneGeometry(2, 2),
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader: overShader,
        uniforms: { uMist: { value: this.target.texture }, uResolution: uniforms.uResolution! },
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.over.frustumCulled = false;
    this.over.renderOrder = 3;
  }

  fit(width: number, height: number): void {
    this.target.setSize(width, height);
    this.uniforms.uMistSize.value.set(width, height);
  }

  render(renderer: WebGLRenderer, view: PerspectiveCamera): void {
    this.uniforms.uViewer.value.setFromMatrixPosition(view.matrixWorld);
    this.uniforms.uViewToWorld.value.copy(view.matrixWorld);
    this.uniforms.uClipToView.value.copy(view.projectionMatrixInverse);
    const target = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this, this.camera);
    renderer.setRenderTarget(target);
  }
}
