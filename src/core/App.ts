import { Color, MathUtils, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { Input } from './Input';
import { Loop, type Frame } from './Loop';
import { Quality, TIERS } from './Quality';
import { palette } from './palette';
import { Grain } from '../post/Grain';
import { Logo } from '../scene/Logo';

export class App {
  readonly quality = new Quality(() => this.applyQuality());

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(22, 1, 0.1, 100);
  private loop = new Loop((frame) => this.update(frame));
  private grain = new Grain();
  private input = new Input();
  readonly logo = new Logo(TIERS.high.particles, this.input);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(new Color(palette.bg), 0);

    this.camera.position.z = 10;
    this.logo.visible = false;
    this.scene.add(this.logo, this.grain);

    canvas.addEventListener('webglcontextlost', () => setPageState('no-webgl', true));
    canvas.addEventListener('webglcontextrestored', () => setPageState('no-webgl', false));

    window.addEventListener('resize', () => this.resize());
    this.applyQuality();
  }

  start(): void {
    this.loop.start();
  }

  setStageLive(live: boolean): void {
    setPageState('stage-live', live);
    this.renderer.setClearAlpha(live ? 1 : 0);
    this.logo.visible = live;
  }

  private update({ dt, time, frameMs }: Frame): void {
    this.quality.measure(frameMs, dt);
    this.logo.update(dt);
    this.grain.update(time);
    this.renderer.render(this.scene, this.camera);
  }

  private applyQuality(): void {
    this.logo.halo.setCount(this.quality.settings.particles);
    this.resize();
  }

  private resize(): void {
    const { innerWidth: width, innerHeight: height, devicePixelRatio } = window;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quality.settings.maxPixelRatio));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    const viewHeight =
      2 * this.camera.position.z * Math.tan(MathUtils.degToRad(this.camera.fov / 2));
    this.logo.fit(width, height, viewHeight, this.renderer.getPixelRatio());
  }
}

export function setPageState(name: 'no-webgl' | 'stage-live', on: boolean): void {
  document.documentElement.classList.toggle(name, on);
}
