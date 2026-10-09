import {
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
import { Film, beneathGrain } from '../post/Film';
import { RoleText } from '../post/RoleText';
import { Logo } from '../scene/Logo';
import { Tower } from '../scene/Tower';

const MAX_DRAWING_PIXELS = 3840 * 2160;
const TOWER_FADE_SECONDS = 2.5;

export class App {
  readonly quality = new Quality(() => this.applyQuality());

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(22, 1, 0.1, 100);
  private loop = new Loop((frame) => this.update(frame));
  private target = new WebGLRenderTarget(1, 1, { samples: 2 });
  private input = new Input();
  private roleText = new RoleText(this.input);
  private film = new Film(this.target.texture, this.roleText.uniforms);
  readonly logo = new Logo(this.input);
  private tower = new Tower(this.input);
  private isTowerRevealed = false;
  private towerFade = 0;
  private background = beneathGrain(palette.bg);

  constructor(canvas: HTMLCanvasElement, context: WebGL2RenderingContext) {
    this.renderer = new WebGLRenderer({ canvas, context });
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    this.renderer.autoClear = false;

    this.camera.position.z = 10;
    this.logo.visible = false;
    this.tower.visible = false;
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

  loadTower(): Promise<void> {
    return this.tower.load(this.renderer);
  }

  revealTower(): void {
    this.isTowerRevealed = true;
  }

  setStageLive(live: boolean): void {
    setPageState('stage-live', live);
    this.logo.visible = live;
    this.tower.visible = live;
  }

  private update({ dt, time }: Frame): void {
    if (this.isTowerRevealed) {
      this.towerFade = Math.min(this.towerFade + dt / TOWER_FADE_SECONDS, 1);
      const opacity = MathUtils.smootherstep(this.towerFade, 0, 1);
      this.tower.setOpacity(opacity);
      this.logo.stars.uniforms.uOpacity.value = 1 - opacity;
      this.logo.stars.visible = opacity < 1;
      this.tower.update(dt);
    }
    this.logo.update(dt);
    this.roleText.update(dt);
    this.film.update(time);
    this.renderer.setRenderTarget(this.target);
    this.renderer.setClearColor(this.background);
    this.renderer.clear();
    if (this.isTowerRevealed) {
      this.renderer.render(this.tower, this.tower.camera);
      this.renderer.clearDepth();
    }
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
    this.roleText.setSize(x, y);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.tower.fit(this.camera.aspect, x, y);

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
