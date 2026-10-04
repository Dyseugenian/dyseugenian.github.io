import {
  Color,
  MathUtils,
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import { Input } from './Input';
import { Loop, type Frame } from './Loop';
import { Quality } from './Quality';
import { palette } from './palette';
import { Film } from '../post/Film';
import { Logo } from '../scene/Logo';

const MAX_DRAWING_PIXELS = 3840 * 2160;

export class App {
  readonly quality = new Quality(() => this.applyQuality());

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(22, 1, 0.1, 100);
  private loop = new Loop((frame) => this.update(frame));
  private target = new WebGLRenderTarget(1, 1);
  private film = new Film(this.target.texture);
  private input = new Input();
  readonly logo = new Logo(this.input);

  constructor(canvas: HTMLCanvasElement, context: WebGL2RenderingContext) {
    this.renderer = new WebGLRenderer({ canvas, context });
    this.renderer.setClearColor(new Color(palette.bg).convertLinearToSRGB());

    this.camera.position.z = 10;
    this.logo.visible = false;
    this.scene.add(this.logo);

    canvas.addEventListener('webglcontextlost', () => setPageState('no-webgl', true));
    canvas.addEventListener('webglcontextrestored', () => setPageState('no-webgl', false));

    window.addEventListener('resize', () => this.resize());
    this.applyQuality();
  }

  start(): void {
    this.loop.start();
  }

  async compile(): Promise<void> {
    await Promise.all([
      this.renderer.compileAsync(this.scene, this.camera),
      this.renderer.compileAsync(this.film, this.camera),
    ]);
  }

  setStageLive(live: boolean): void {
    setPageState('stage-live', live);
    this.logo.visible = live;
  }

  private update({ dt, time }: Frame): void {
    this.logo.update(dt);
    this.film.update(time);
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.film, this.camera);
  }

  private applyQuality(): void {
    this.resize();
  }

  private resize(): void {
    const { innerWidth: width, innerHeight: height, devicePixelRatio } = window;
    this.renderer.setPixelRatio(
      Math.min(
        devicePixelRatio,
        this.quality.settings.maxPixelRatio,
        Math.sqrt(MAX_DRAWING_PIXELS / (width * height)),
      ),
    );
    this.renderer.setSize(width, height, false);
    const { x, y } = this.renderer.getDrawingBufferSize(new Vector2());
    this.target.setSize(x, y);
    this.film.setSize(x, y, this.renderer.getPixelRatio());
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    const viewHeight =
      2 * this.camera.position.z * Math.tan(MathUtils.degToRad(this.camera.fov / 2));
    this.logo.fit(
      width,
      height,
      viewHeight,
      this.renderer.getPixelRatio(),
      this.quality.settings.particles,
    );
  }
}

export function setPageState(name: 'no-webgl' | 'stage-live', on: boolean): void {
  document.documentElement.classList.toggle(name, on);
}
