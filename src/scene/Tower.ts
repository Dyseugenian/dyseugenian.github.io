import {
  type Camera,
  Color,
  Data3DTexture,
  DataTexture,
  DepthTexture,
  GLSL3,
  Group,
  type InstancedBufferGeometry,
  type IUniform,
  MathUtils,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  RawShaderMaterial,
  Scene,
  type ShaderMaterial,
  Vector2,
  Texture,
  Vector3,
  Vector4,
  type WebGLRenderer,
  WebGLRenderTarget,
  ZeroFactor,
} from 'three';
import vertexShader from '../shaders/facade.vert';
import fragmentShader from '../shaders/facade.frag';
import depthShader from '../shaders/facade-depth.frag';
import censusShader from '../shaders/facade-census.frag';
import lowShader from '../shaders/facade-low.frag';
import type { FreeFly } from '../core/FreeFly';
import type { Input } from '../core/Input';
import { Spring } from '../core/Spring';
import { palette } from '../core/palette';
import { beneathGrain } from '../post/Film';
import { PipeLayout } from './PipeLayout';
import { Presence, type Roll } from './Presence';
import { Rebar } from './Rebar';
import { RoomLight } from './RoomLight';
import { traceMeshes } from './traces';
import { Backdrop } from './Backdrop';
import { Sky } from './Sky';
import { LOW_LAYER, ROOM_LAYER, SKY_LAYER } from './layers';
import { Beacons, beaconSpot } from './Beacons';
import { Drift, STILL } from './Drift';
import { MAP_METERS, bakeConcreteMaps } from './concreteMaps';
import { fbmTexture, noiseTexture } from './noise';
import { Veil } from './Veil';
import type { BakeReply, TowerMaps } from './bake.worker';
import BakeWorker from './bake.worker?worker';
import type { Occlusion, TowerGeometry } from './towerGeometry';
import {
  BAY,
  OCCLUSION_MIN,
  OCCLUSION_SIZE,
  OUTER_X,
  PLANT_EVERY,
  SIDE_X,
  TILE_HEIGHT,
  TILE_ROWS,
  edgeVolume,
  occlusionTexture,
  unpackGeometry,
} from './facade';

export const VIEW = { fov: 64, distance: 6.5, vanish: 0.82 };
export const PITCH = Math.atan(1 / (VIEW.vanish * Math.tan(MathUtils.degToRad(VIEW.fov / 2))));
const CLIMB_SPEED = 0.9;
export const SWAY = { pitch: 0.12, shift: 1 };
const SPOT = { reach: 8, y: -4, z: 3 };
const REDUCED_MOTION_SPEED = 0.1;
const TILE_SEEDS = 4096;
const EXPOSURE = 0.42;
const UP = new Vector3(0, 1, 0);
const BACKLIGHTS = [new Vector3(-1, 1.1, -0.15), new Vector3(1, 1.1, -0.15)] as const;
const BEACON_PERIOD = 2.4;
const TIME_WRAP = 1200 * BEACON_PERIOD;
const CLOCK_LIMIT = 2 ** 15;
const COMPILES_AT_ONCE = 2;
const VOLUMES: Record<Occlusion, { min: Vector3; size: Vector3 }> = {
  tiles: { min: OCCLUSION_MIN, size: OCCLUSION_SIZE },
  blockless: { min: OCCLUSION_MIN, size: OCCLUSION_SIZE },
  left: edgeVolume(-1),
  right: edgeVolume(1),
};

export class Tower extends Scene {
  readonly camera = new PerspectiveCamera(VIEW.fov, 1, 0.1, 400);
  readonly low = new WebGLRenderTarget(1, 1, { count: 4, depthTexture: new DepthTexture(1, 1) });
  private lowCamera = new PerspectiveCamera();
  private uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uVanish: { value: new Vector2() },
    uBacklights: { value: new Vector4() },
    uSky: { value: new Color(palette.sky).convertLinearToSRGB() },
    uHaze: { value: new Color(palette.haze).convertLinearToSRGB() },
    uRim: { value: new Color(palette.rim).convertLinearToSRGB() },
    uExposure: { value: EXPOSURE },
    uNoise: { value: noiseTexture() },
    uFbm: { value: new DataTexture() },
    uSurface: { value: new Texture() },
  };
  private facadeUniforms = {
    uClimb: { value: 0 },
    uTilesClimbed: { value: 0 },
    uBeacon: { value: 0 },
    uSpot: { value: new Vector3(0, SPOT.y, SPOT.z) },
  };
  private roomUniforms = {
    uLamp: { value: new Color(palette.lamp).convertLinearToSRGB() },
    uLampSoft: { value: new Color(palette.lampSoft).convertLinearToSRGB() },
    uLampCool: { value: new Color(palette.lampCool).convertLinearToSRGB() },
    uLampCold: { value: new Color(palette.lampCold).convertLinearToSRGB() },
    uBay: { value: BAY },
    uTileHeight: { value: TILE_HEIGHT },
    uPlantEvery: { value: PLANT_EVERY },
    uOuterX: { value: OUTER_X },
  };
  private building = new Group();
  private sky = new Sky(this.uniforms);
  private roomLight = new RoomLight({
    ...this.uniforms,
    ...this.facadeUniforms,
    ...this.roomUniforms,
  });
  readonly materialUniforms: Record<string, IUniform>;
  private rebar: Rebar;
  private presence = new Presence(this.facadeUniforms.uTilesClimbed);
  private pipeLayout: PipeLayout;
  private pipesClimbed = -1;
  private facadeMeshes: Mesh<InstancedBufferGeometry>[] = [];
  private ahead: Roll | null = null;
  private renderer!: WebGLRenderer;
  private occlusion: Record<Occlusion, { value: Data3DTexture }> = {
    tiles: { value: new Data3DTexture() },
    blockless: { value: new Data3DTexture() },
    left: { value: new Data3DTexture() },
    right: { value: new Data3DTexture() },
  };
  private baking = bakeTower();
  private veil = new Veil(beneathGrain(palette.bg));
  private lift = 0;
  private swayPitch = new Spring(4, 5);
  private aim = new Spring(9, 6);
  private shift = new Spring(9, 6);
  private drift = new Drift();
  private spot = new Spring(4, 4);
  private projected = new Vector3();
  private flight: FreeFly | null = null;

  constructor(private input: Input) {
    super();
    this.materialUniforms = {
      ...this.uniforms,
      ...this.facadeUniforms,
      ...this.presence.uniforms,
      ...this.roomUniforms,
      ...this.roomLight.uniforms,
      uConcrete: { value: new Color(palette.concrete).convertLinearToSRGB() },
      uConcreteWarm: { value: new Color(palette.concreteWarm).convertLinearToSRGB() },
      uSalt: { value: new Color(palette.salt).convertLinearToSRGB() },
      uGrime: { value: new Color(palette.grime).convertLinearToSRGB() },
      uCableGrey: { value: new Color(palette.cableGrey).convertLinearToSRGB() },
      uRust: { value: new Color(palette.rust).convertLinearToSRGB() },
      uMoss: { value: new Color(palette.moss).convertLinearToSRGB() },
      uBeaconColor: { value: new Color(palette.beacon).convertLinearToSRGB() },
      uSpotColor: { value: new Color(palette.spot).convertLinearToSRGB() },
      uGlassGreen: { value: new Color(palette.glassGreen).convertLinearToSRGB() },
      uNewsprint: { value: new Color(palette.newsprint).convertLinearToSRGB() },
      uNewsprintAged: { value: new Color(palette.newsprintAged).convertLinearToSRGB() },
      uAppliance: { value: new Color(palette.appliance).convertLinearToSRGB() },
      uLinen: { value: new Color(palette.linen).convertLinearToSRGB() },
      uDenim: { value: new Color(palette.denim).convertLinearToSRGB() },
      uMadder: { value: new Color(palette.madder).convertLinearToSRGB() },
      uCoral: { value: new Color(palette.coral).convertLinearToSRGB() },
      uSideX: { value: SIDE_X },
      uBeaconSpot: { value: beaconSpot(OUTER_X) },
      uSurfaceMeters: { value: MAP_METERS },
      uLight: { value: new Vector3(-0.45, 0.7, 0.55).normalize() },
      uFogDensity: { value: 0.022 },
      uSkyMap: { value: this.sky.target.texture },
      uLowLayer: { value: this.low.textures[0] },
      uLowAir: { value: this.low.textures[1] },
      uLowShape: { value: this.low.textures[2] },
      uLowMask: { value: this.low.textures[3] },
      uLowDepth: { value: this.low.depthTexture },
      uLowSize: { value: new Vector2(1, 1) },
      uDepthRange: { value: new Vector2(this.camera.near, this.camera.far) },
    };
    this.rebar = new Rebar(this.materialUniforms);
    this.pipeLayout = new PipeLayout(this.materialUniforms);
    this.building.add(
      new Beacons(beaconSpot(OUTER_X), TILE_ROWS, this.materialUniforms),
      this.rebar,
    );
    this.camera.position.z = VIEW.distance;
    this.add(
      this.sky,
      this.roomLight,
      new Backdrop(this.materialUniforms),
      this.building,
      this.veil,
    );
  }

  async load(renderer: WebGLRenderer): Promise<void> {
    this.renderer = renderer;
    this.build(await this.baking.geometry);
    const [maps, surface] = await Promise.all([
      this.baking.maps,
      bakeConcreteMaps(renderer),
      compileInTurns(renderer, this, this.camera),
      this.presence.compile(renderer),
      this.pipeLayout.compile(renderer),
    ]);
    this.applyRoll(await this.presence.take(renderer, 0));
    this.takeAhead(1);
    this.uniforms.uFbm.value = fbmTexture(maps.fbm);
    this.uniforms.uSurface.value = surface;
    renderer.initTexture(this.uniforms.uFbm.value);
    for (const name of Object.keys(this.occlusion) as Occlusion[]) {
      this.occlusion[name].value = occlusionTexture(maps.occlusion[name]);
      renderer.initTexture(this.occlusion[name].value);
    }
  }

  private build({ facade, rebar, traces }: TowerGeometry): void {
    const materials = new Map<string, RawShaderMaterial>();
    const lowMaterials = new Map<number, RawShaderMaterial>();
    const depthMaterial = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: depthShader,
      uniforms: this.materialUniforms,
      colorWrite: false,
    });
    const censusMaterial = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: censusShader,
      uniforms: this.materialUniforms,
    });
    for (const { geometry: baked, surface, occlusion, census } of facade) {
      const key = `${occlusion} ${surface}`;
      const material = materials.get(key) ?? this.facadeMaterial(surface, occlusion);
      materials.set(key, material);
      const lowMaterial = lowMaterials.get(surface) ?? this.lowMaterial(surface);
      lowMaterials.set(surface, lowMaterial);
      const geometry = unpackGeometry(baked);
      const mesh = new Mesh(geometry, material);
      const low = new Mesh(geometry, lowMaterial);
      const lowDepth = new Mesh(geometry, depthMaterial);
      mesh.renderOrder = low.renderOrder = 1;
      low.layers.set(LOW_LAYER);
      lowDepth.layers.set(LOW_LAYER);
      const passes = [lowDepth, low, new Mesh(geometry, depthMaterial), mesh];
      for (const pass of passes) pass.frustumCulled = false;
      this.facadeMeshes.push(...passes);
      this.building.add(...passes);
      if (census) {
        this.presence.watch(mesh, {
          material: censusMaterial,
          vertex: [
            { name: 'aRole', value: [census.role] },
            { name: 'aMin', value: census.min },
          ],
        });
      }
    }
    this.rebar.fill(rebar);
    const traced = traceMeshes(traces, this.materialUniforms);
    for (const mesh of traced) {
      const { material } = mesh;
      const multiplied = material.blendDst === ZeroFactor;
      this.presence.watch(
        mesh,
        multiplied
          ? {
              material: new RawShaderMaterial({
                glslVersion: GLSL3,
                vertexShader: material.vertexShader,
                fragmentShader: material.fragmentShader,
                uniforms: material.uniforms,
              }),
              vertex: [],
            }
          : undefined,
      );
      if (mesh.material.defines.LAID_OUT) this.pipeLayout.lay(mesh);
    }
    this.building.add(...traced);
  }

  private applyRoll(roll: Roll): void {
    this.presence.apply(roll);
    this.pipesClimbed = -1;
    for (const mesh of this.facadeMeshes) mesh.visible = mesh.geometry.instanceCount > 0;
  }

  private facadeMaterial(surface: number, occlusion: Occlusion): RawShaderMaterial {
    const { min, size } = VOLUMES[occlusion];
    return new RawShaderMaterial({
      defines: { SURFACE: surface },
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        ...this.materialUniforms,
        uOcclusion: this.occlusion[occlusion],
        uBlocklessOcclusion: this.occlusion[occlusion === 'tiles' ? 'blockless' : occlusion],
        uOcclusionMin: { value: min },
        uOcclusionSize: { value: size },
      },
    });
  }

  private lowMaterial(surface: number): RawShaderMaterial {
    return new RawShaderMaterial({
      defines: { SURFACE: surface },
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: lowShader,
      uniforms: this.materialUniforms,
    });
  }

  offscreenTarget(object: Object3D): WebGLRenderTarget | null {
    if (object.layers.isEnabled(SKY_LAYER)) return this.sky.target;
    if (object.layers.isEnabled(ROOM_LAYER)) return this.roomLight.target;
    return object.layers.isEnabled(LOW_LAYER) ? this.low : null;
  }

  async restore(renderer: WebGLRenderer): Promise<void> {
    const [surface] = await Promise.all([
      bakeConcreteMaps(renderer),
      compileInTurns(renderer, this, this.camera),
      this.presence.compile(renderer),
      this.pipeLayout.compile(renderer),
    ]);
    this.uniforms.uSurface.value = surface;
    this.pipesClimbed = -1;
  }

  renderOffscreen(renderer: WebGLRenderer): void {
    this.sky.render(renderer);
    this.roomLight.render(renderer, this.facadeUniforms.uTilesClimbed.value);
    if (this.pipesClimbed !== this.facadeUniforms.uTilesClimbed.value) {
      this.pipeLayout.render(renderer);
      this.pipesClimbed = this.facadeUniforms.uTilesClimbed.value;
    }
    this.lowCamera.copy(this.camera);
    this.lowCamera.layers.set(LOW_LAYER);
    const target = renderer.getRenderTarget();
    renderer.setRenderTarget(this.low);
    renderer.setClearColor(0, 0);
    renderer.clear();
    renderer.render(this, this.lowCamera);
    renderer.setRenderTarget(target);
  }

  rebase(): void {
    this.uniforms.uTime.value %= TIME_WRAP;
    this.facadeUniforms.uClimb.value =
      this.facadeUniforms.uTilesClimbed.value * TILE_HEIGHT + this.lift;
  }

  setOpacity(opacity: number): void {
    this.veil.uniforms.uOpacity.value = 1 - opacity;
    this.veil.visible = opacity < 1;
  }

  fit(aspect: number, width: number, height: number): void {
    this.uniforms.uResolution.value.set(width, height);
    this.sky.fit(width, height);
    this.low.setSize(Math.ceil(width / 2), Math.ceil(height / 2));
    this.materialUniforms.uLowSize!.value.set(this.low.width, this.low.height);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  fly(flight: FreeFly): void {
    this.flight = flight;
    flight.pitch = PITCH;
  }

  update(dt: number): void {
    const { reducedMotion } = this.input;
    const step = reducedMotion ? dt * REDUCED_MOTION_SPEED : dt;
    this.uniforms.uTime.value += step;
    const climb = this.flight ? this.flyCamera(dt, this.flight) : this.followPointer(dt) * step;
    this.facadeUniforms.uClimb.value += climb;
    this.lift += climb;
    const { uTilesClimbed } = this.facadeUniforms;
    while (this.lift >= TILE_HEIGHT || this.lift < 0) {
      const up = this.lift >= TILE_HEIGHT ? 1 : -1;
      this.lift -= up * TILE_HEIGHT;
      uTilesClimbed.value = (uTilesClimbed.value + up + TILE_SEEDS) % TILE_SEEDS;
      this.rebar.climb(uTilesClimbed.value);
      this.turnRoll(uTilesClimbed.value);
    }
    this.building.position.y = -this.lift;
    if (
      this.uniforms.uTime.value > CLOCK_LIMIT ||
      Math.abs(this.facadeUniforms.uClimb.value) > CLOCK_LIMIT
    )
      this.rebase();

    const phase = (this.uniforms.uTime.value / BEACON_PERIOD) % 1;
    this.facadeUniforms.uBeacon.value =
      MathUtils.smoothstep(phase, 0, 0.08) * (1 - MathUtils.smoothstep(phase, 0.3, 0.55));

    this.uniforms.uVanish.value.set(...this.onScreen(UP));
    this.uniforms.uBacklights.value.set(
      ...this.onScreen(BACKLIGHTS[0]),
      ...this.onScreen(BACKLIGHTS[1]),
    );
  }

  private turnRoll(tilesClimbed: number): void {
    if (this.ahead?.tilesClimbed === tilesClimbed) {
      this.applyRoll(this.ahead);
    } else {
      this.applyRoll(this.presence.whole(tilesClimbed));
      this.presence.take(this.renderer, tilesClimbed).then((roll) => {
        if (roll.tilesClimbed === this.facadeUniforms.uTilesClimbed.value) this.applyRoll(roll);
      });
    }
    this.ahead = null;
    this.takeAhead((tilesClimbed + 1) % TILE_SEEDS);
  }

  private takeAhead(tilesClimbed: number): void {
    this.presence.take(this.renderer, tilesClimbed).then((roll) => {
      const current = this.facadeUniforms.uTilesClimbed.value;
      if (roll.tilesClimbed === (current + 1) % TILE_SEEDS) this.ahead = roll;
    });
  }

  private flyCamera(dt: number, flight: FreeFly): number {
    const moved = flight.update(dt);
    this.camera.position.x += moved.x;
    this.camera.position.z += moved.z;
    this.camera.rotation.set(flight.pitch, flight.yaw, 0, 'YXZ');
    this.camera.fov = VIEW.fov;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    return moved.y;
  }

  private followPointer(dt: number): number {
    const { pointer, isPointerInside, reducedMotion } = this.input;
    const follow = isPointerInside && !reducedMotion;
    const drift = reducedMotion ? STILL : this.drift.update(dt);
    this.swayPitch.target = follow ? pointer.y * SWAY.pitch : 0;
    const towardEdge = 1 - (1 - Math.abs(pointer.x)) ** 3;
    this.aim.target = follow ? Math.sign(pointer.x) * towardEdge * SWAY.shift : 0;
    this.shift.target = this.aim.update(dt);
    this.camera.position.set(this.shift.update(dt) + drift.x, drift.y, VIEW.distance);
    this.camera.rotation.set(
      PITCH + this.swayPitch.update(dt) + drift.pitch,
      drift.yaw,
      drift.roll,
      'YXZ',
    );
    this.spot.target = follow ? pointer.x * SPOT.reach : 0;
    this.facadeUniforms.uSpot.value.x = this.spot.update(dt);
    this.camera.fov = VIEW.fov + drift.zoom;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    return CLIMB_SPEED * drift.pace;
  }

  private onScreen(direction: Vector3): [number, number] {
    const { x: width, y: height } = this.uniforms.uResolution.value;
    this.projected.copy(direction).multiplyScalar(1e4).add(this.camera.position);
    this.projected.project(this.camera);
    return [((this.projected.x + 1) / 2) * width, ((this.projected.y + 1) / 2) * height];
  }
}

async function compileInTurns(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
): Promise<void> {
  const seen = new Set<ShaderMaterial>();
  const objects: { object: Object3D; shaderLength: number }[] = [];
  scene.traverse((object) => {
    if (!('material' in object)) return;
    const materials = [object.material as ShaderMaterial | ShaderMaterial[]].flat();
    if (materials.every((material) => seen.has(material))) return;
    let shaderLength = 0;
    for (const material of materials) {
      seen.add(material);
      shaderLength += material.vertexShader.length + material.fragmentShader.length;
    }
    objects.push({ object, shaderLength });
  });
  objects.sort((a, b) => b.shaderLength - a.shaderLength);
  let next = 0;
  const compileNext = async (): Promise<void> => {
    while (next < objects.length) {
      await renderer.compileAsync(objects[next++]!.object, camera, scene);
    }
  };
  await Promise.all(Array.from({ length: COMPILES_AT_ONCE }, compileNext));
}

function bakeTower(): { geometry: Promise<TowerGeometry>; maps: Promise<TowerMaps> } {
  const worker = new BakeWorker();
  const reply = <Baked>(pick: (reply: BakeReply) => Baked | undefined) =>
    new Promise<Baked>((resolve, reject) => {
      worker.addEventListener('message', ({ data }: MessageEvent<BakeReply>) => {
        const baked = pick(data);
        if (baked !== undefined) resolve(baked);
      });
      worker.addEventListener('error', reject);
    });
  return {
    geometry: reply((data) => ('geometry' in data ? data.geometry : undefined)),
    maps: reply((data) => ('maps' in data ? data.maps : undefined)),
  };
}
