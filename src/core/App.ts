import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { Loop, type Frame } from './Loop';
import { Quality } from './Quality';
import { palette } from './palette';
import { Grain } from '../post/Grain';

export class App {
  readonly quality = new Quality(() => this.resize());

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(22, 1, 0.1, 100);
  private loop = new Loop((frame) => this.update(frame));
  private grain = new Grain();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(new Color(palette.bg), 0);

    this.camera.position.z = 10;
    this.scene.add(this.grain);

    canvas.addEventListener('webglcontextlost', () => setPageState('no-webgl', true));
    canvas.addEventListener('webglcontextrestored', () => setPageState('no-webgl', false));

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  start(): void {
    this.loop.start();
  }

  setStageLive(live: boolean): void {
    setPageState('stage-live', live);
    this.renderer.setClearAlpha(live ? 1 : 0);
  }

  private update({ dt, time, frameMs }: Frame): void {
    this.quality.measure(frameMs, dt);
    this.grain.update(time);
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const { innerWidth: width, innerHeight: height, devicePixelRatio } = window;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quality.settings.maxPixelRatio));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}

export function setPageState(name: 'no-webgl' | 'stage-live', on: boolean): void {
  document.documentElement.classList.toggle(name, on);
}
