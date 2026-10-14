import {
  ArrayCamera,
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
import { RenderScale } from './RenderScale';
import { palette } from './palette';
import { Film, beneathGrain } from '../post/Film';
import { RoleText } from '../post/RoleText';
import { Logo } from '../scene/Logo';
import { Tower } from '../scene/Tower';
import { LOW_LAYER, ROOM_LAYER, SKY_LAYER, TOWER_LAYER } from '../scene/layers';

const MAX_DRAWING_PIXELS = 3840 * 2160;
const TOWER_FADE_SECONDS = 2.5;
const WARM_UP_MS = 4;
const OFFSCREEN_LAYERS = [LOW_LAYER, ROOM_LAYER, SKY_LAYER];

type Drawn = Mesh | Points | Line;
type WarmUp = { objects: Drawn[]; camera: Camera; done: () => void };

function isDrawn(object: Object3D): object is Drawn {
  return 'geometry' in object;
}

export class App {
  readonly quality = new Quality(() => this.applyQuality());

  readonly renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(22, 1, 0.1, 100);
  private loop = new Loop((frame) => this.update(frame));
  private target = new WebGLRenderTarget(1, 1, { samples: 2, resolveDepthBuffer: false });
  private warmUpTarget = new WebGLRenderTarget(1, 1);
  private warmUps: WarmUp[] = [];
  private input = new Input();
  private roleText = new RoleText(this.input);
  private film = new Film(this.target.texture, this.roleText.uniforms);
  readonly logo = new Logo(this.input);
  readonly tower = new Tower(this.input);
  private view = new ArrayCamera([this.tower.camera, this.camera]);
  private renderScale: RenderScale;
  private isTowerRevealed = false;
  private isRestoring = false;
  private towerFade = 0;
  private background = beneathGrain(palette.bg);
  private logoBox = document.querySelector<HTMLElement>('.logo-box')!;

  constructor(
    canvas: HTMLCanvasElement,
    context: WebGL2RenderingContext,
    private onlyBuilding = false,
  ) {
    this.renderer = new WebGLRenderer({ canvas, context });
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    this.renderer.autoClear = false;
    this.renderScale = new RenderScale(context);

    this.camera.position.z = 10;
    this.camera.updateMatrixWorld();
    this.tower.camera.layers.set(TOWER_LAYER);
    this.logo.visible = false;
    this.tower.visible = false;
    this.scene.add(this.logo);
    if (onlyBuilding) {
      setPageState('building', true);
      this.roleText.uniforms.uRolesOpacity.value = 0;
    }

    canvas.addEventListener('webglcontextlost', () => {
      this.isRestoring = true;
      setPageState('no-webgl', true);
    });
    canvas.addEventListener('webglcontextrestored', async () => {
      this.renderScale.attach(context);
      await this.renderer.compileAsync(this.film, this.camera);
      await this.renderer.compileAsync(this.logo, this.camera, this.scene);
      await this.warmUp(this.logo, this.camera);
      if (this.isTowerRevealed) {
        await this.tower.restore(this.renderer);
        await this.warmUpTower();
      }
      this.isRestoring = false;
      setPageState('no-webgl', false);
    });

    new ResizeObserver(() => this.resize()).observe(canvas);
    this.watchPixelRatio();
    window.addEventListener('scroll', () => this.logo.place(this.logoBox.getBoundingClientRect()), {
      passive: true,
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.tower.rebase();
    });
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
    this.tower.traverse((object) => {
      if (!OFFSCREEN_LAYERS.some((layer) => object.layers.isEnabled(layer))) {
        object.layers.set(TOWER_LAYER);
      }
    });
    await this.warmUpTower();
  }

  private warmUpTower(): Promise<void> {
    const camera = this.tower.camera.clone();
    for (const layer of OFFSCREEN_LAYERS) camera.layers.enable(layer);
    return this.warmUp(this.tower, camera);
  }

  revealTower(): void {
    this.isTowerRevealed = true;
    this.scene.add(this.tower);
  }

  pinScale(scale: number): void {
    this.renderScale.pin(scale);
    this.rescale();
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
      this.renderer.setRenderTarget(this.tower.offscreenTarget(object) ?? this.warmUpTarget);
      this.renderer.render(object, warmUp.camera);
      object.frustumCulled = frustumCulled;
    }
  }

  private update({ dt, time }: Frame): void {
    if (this.isRestoring) {
      this.drawWarmUps();
      return;
    }
    if (this.renderScale.update(dt, this.isTowerRevealed)) this.rescale();
    this.renderScale.beginFrame();
    this.drawWarmUps();
    if (this.isTowerRevealed) {
      this.towerFade = Math.min(this.towerFade + dt / TOWER_FADE_SECONDS, 1);
      const opacity = MathUtils.smootherstep(this.towerFade, 0, 1);
      this.tower.setOpacity(opacity);
      this.logo.stars.uniforms.uOpacity.value = 1 - opacity;
      this.logo.stars.visible = opacity < 1;
      this.tower.update(dt);
      this.tower.renderOffscreen(this.renderer);
    }
    this.logo.update(dt);
    if (!this.onlyBuilding) this.roleText.update(dt);
    this.film.update(time);
    this.renderer.setRenderTarget(this.target);
    this.renderer.setClearColor(this.background);
    this.renderer.clear();
    this.renderer.render(this.scene, this.view);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.film, this.camera);
    this.renderScale.endFrame();
  }

  private applyQuality(): void {
    this.resize();
  }

  private watchPixelRatio(): void {
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener(
      'change',
      () => {
        this.resize();
        this.watchPixelRatio();
      },
      { once: true },
    );
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.renderer.domElement;
    this.renderer.setPixelRatio(
      Math.min(
        devicePixelRatio,
        this.quality.settings.maxPixelRatio,
        Math.sqrt(MAX_DRAWING_PIXELS / (width * height)),
      ),
    );
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.view.copy(this.camera);
    this.view.layers.enable(TOWER_LAYER);
    this.input.fit(width, height);
    const { x, y } = this.renderer.getDrawingBufferSize(new Vector2());
    this.film.setSize(x, y, this.renderer.getPixelRatio());
    this.roleText.setSize(x, y, width, height);
    const viewHeight =
      2 * this.camera.position.z * Math.tan(MathUtils.degToRad(this.camera.fov / 2));
    this.logo.fit(
      width,
      height,
      viewHeight,
      this.logoBox.getBoundingClientRect(),
      this.quality.settings.particles,
    );
    this.rescale();
  }

  private rescale(): void {
    const { x, y } = this.renderer.getDrawingBufferSize(new Vector2());
    const { scale } = this.renderScale;
    this.target.setSize(Math.round(x * scale), Math.round(y * scale));
    this.tower.fit(this.camera.aspect, this.target.width, this.target.height);
    this.logo.setPixelRatio(this.renderer.getPixelRatio() * scale);
  }
}

export function setPageState(name: 'no-webgl' | 'stage-live' | 'building', on: boolean): void {
  document.documentElement.classList.toggle(name, on);
}
