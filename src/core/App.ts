import {
  type Camera,
  type Line,
  MathUtils,
  type Mesh,
  type Object3D,
  PerspectiveCamera,
  type Points,
  Scene,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import { FreeFly } from './FreeFly';
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
const WARM_UP_MS = 4;

type Drawn = Mesh | Points | Line;
type WarmUp = { objects: Drawn[]; camera: Camera; done: () => void };

function isDrawn(object: Object3D): object is Drawn {
  return 'geometry' in object;
}

export class App {
  readonly quality = new Quality(() => this.applyQuality());

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(22, 1, 0.1, 100);
  private loop = new Loop((frame) => this.update(frame));
  private target = new WebGLRenderTarget(1, 1, { samples: 2 });
  private warmUpTarget = new WebGLRenderTarget(1, 1);
  private warmUps: WarmUp[] = [];
  private input = new Input();
  private roleText = new RoleText(this.input);
  private film = new Film(this.target.texture, this.roleText.uniforms);
  readonly logo = new Logo(this.input);
  private tower = new Tower(this.input);
  private isTowerRevealed = false;
  private towerFade = 0;
  private background = beneathGrain(palette.bg);

  constructor(
    canvas: HTMLCanvasElement,
    context: WebGL2RenderingContext,
    private onlyBuilding = false,
  ) {
    this.renderer = new WebGLRenderer({ canvas, context });
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    this.renderer.autoClear = false;

    this.camera.position.z = 10;
    this.logo.visible = false;
    this.tower.visible = false;
    this.scene.add(this.logo);
    if (onlyBuilding) {
      setPageState('building', true);
      this.roleText.uniforms.uRolesOpacity.value = 0;
    }

    canvas.addEventListener('webglcontextlost', () => setPageState('no-webgl', true));
    canvas.addEventListener('webglcontextrestored', () => setPageState('no-webgl', false));

    window.addEventListener('resize', () => this.resize());
    this.applyQuality();
    if (onlyBuilding) this.tower.fly(new FreeFly(canvas));
  }

  async start(): Promise<void> {
    await this.renderer.compileAsync(this.film, this.camera);
    this.loop.start();
  }

  async compile(): Promise<void> {
    await this.renderer.compileAsync(this.scene, this.camera);
    await this.warmUp(this.scene, this.camera);
  }

  async loadTower(): Promise<void> {
    await this.tower.load(this.renderer);
    await this.warmUp(this.tower, this.tower.camera);
  }

  revealTower(): void {
    this.isTowerRevealed = true;
  }

  setStageLive(live: boolean): void {
    setPageState('stage-live', live);
    this.logo.visible = live && !this.onlyBuilding;
    this.tower.visible = live;
  }

  private warmUp(root: Object3D, camera: Camera): Promise<void> {
    const objects: Drawn[] = [];
    root.traverse((object) => {
      if (isDrawn(object)) objects.push(object);
    });
    return new Promise((done) => this.warmUps.push({ objects, camera, done }));
  }

  private drawWarmUps(): void {
    const deadline = performance.now() + WARM_UP_MS;
    while (this.warmUps.length > 0 && performance.now() < deadline) {
      const warmUp = this.warmUps[0]!;
      const object = warmUp.objects.shift();
      if (object === undefined) {
        this.warmUps.shift();
        warmUp.done();
        continue;
      }
      const { frustumCulled } = object;
      if (frustumCulled && object.geometry.boundingSphere === null) {
        object.geometry.computeBoundingSphere();
      }
      object.frustumCulled = false;
      this.renderer.setRenderTarget(this.warmUpTarget);
      this.renderer.render(object, warmUp.camera);
      object.frustumCulled = frustumCulled;
    }
  }

  private update({ dt, time }: Frame): void {
    this.drawWarmUps();
    if (this.isTowerRevealed) {
      this.towerFade = Math.min(this.towerFade + dt / TOWER_FADE_SECONDS, 1);
      const opacity = MathUtils.smootherstep(this.towerFade, 0, 1);
      this.tower.setOpacity(opacity);
      this.logo.stars.uniforms.uOpacity.value = 1 - opacity;
      this.logo.stars.visible = opacity < 1;
      this.tower.update(dt);
    }
    this.logo.update(dt);
    if (!this.onlyBuilding) this.roleText.update(dt);
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

export function setPageState(name: 'no-webgl' | 'stage-live' | 'building', on: boolean): void {
  document.documentElement.classList.toggle(name, on);
}
