import {
  BufferAttribute,
  Color,
  Data3DTexture,
  DataTexture,
  GLSL3,
  Group,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  RawShaderMaterial,
  Scene,
  Vector2,
  Texture,
  Vector3,
  Vector4,
  type WebGLRenderer,
} from 'three';
import vertexShader from '../shaders/facade.vert';
import fragmentShader from '../shaders/facade.frag';
import depthShader from '../shaders/facade-depth.frag';
import type { FreeFly } from '../core/FreeFly';
import type { Input } from '../core/Input';
import { Spring } from '../core/Spring';
import { palette } from '../core/palette';
import { beneathGrain } from '../post/Film';
import { Rebar } from './Rebar';
import { ducts, grilles, pigeons, spouts, traces } from './traces';
import { Backdrop } from './Backdrop';
import { Beacons, beaconSpot } from './Beacons';
import { Drift, STILL } from './Drift';
import { MAP_METERS, bakeConcreteMaps } from './concreteMaps';
import { fbmTexture, noiseTexture } from './noise';
import { Veil } from './Veil';
import type { MapsRequest, TowerMaps } from './bake.worker';
import BakeWorker from './bake.worker?worker';
import {
  BAY,
  type Detail,
  OCCLUSION_MIN,
  OCCLUSION_SIZE,
  EDGE_WIDTH,
  PIER,
  PLANT_EVERY,
  TILE_HEIGHT,
  edge,
  facadeGeometry,
  inWindowBay,
  occluders,
  occlusionTexture,
  SURFACES,
  surroundings,
  surfaceOf,
  tileParts,
  type Part,
} from './facade';

const VIEW = { fov: 64, distance: 6.5, vanish: 0.82 };
const PITCH = Math.atan(1 / (VIEW.vanish * Math.tan(MathUtils.degToRad(VIEW.fov / 2))));
const COLUMNS = { left: -3, right: 3 };
const BLOCKLESS_COLUMNS = [0, 1];
const ROWS = { below: 2, above: 32 };
const DETAIL_ROWS = { full: 5, reduced: 11 };
const REBAR_ROWS = { below: 1, above: 4 };
const TRACE_ROWS = { below: 2, above: 8 };
const CLIMB_SPEED = 0.9;
const SWAY = { pitch: 0.12, shift: 1 };
const SPOT = { reach: 8, y: -4, z: 3 };
const REDUCED_MOTION_SPEED = 0.1;
const TILE_SEEDS = 4096;
const EXPOSURE = 0.42;
const UP = new Vector3(0, 1, 0);
const BACKLIGHTS = [new Vector3(-1, 1.1, -0.15), new Vector3(1, 1.1, -0.15)] as const;
const BEACON_PERIOD = 2.4;

export class Tower extends Scene {
  readonly camera = new PerspectiveCamera(VIEW.fov, 1, 0.1, 400);
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
  private building = new Group();
  private rebar: Rebar;
  private pigeons: Mesh;
  private occlusion = { value: new Data3DTexture() };
  private blocklessOcclusion = { value: new Data3DTexture() };
  private leftOcclusion = { value: new Data3DTexture() };
  private rightOcclusion = { value: new Data3DTexture() };
  private maps: Promise<TowerMaps>;
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
    const parts = tileParts('full');
    const windows = parts.filter(inWindowBay);
    const blockless = parts.filter((part) => !part.protrudes);
    const leftEdge = edge(-1, windows);
    const rightEdge = edge(1, windows);
    const occlusionBake = (around: Part[], min: Vector3, size: Vector3) => ({
      solids: occluders(around),
      corner: min,
      extent: size,
    });
    this.maps = bakeMaps({
      occlusion: occlusionBake(surroundings(parts), OCCLUSION_MIN, OCCLUSION_SIZE),
      blocklessOcclusion: occlusionBake(surroundings(blockless), OCCLUSION_MIN, OCCLUSION_SIZE),
      leftOcclusion: occlusionBake(leftEdge.around, leftEdge.min, leftEdge.size),
      rightOcclusion: occlusionBake(rightEdge.around, rightEdge.min, rightEdge.size),
    });
    const outerX = (COLUMNS.right + 1) * BAY + PIER.min.x + EDGE_WIDTH;
    const spot = beaconSpot(outerX);
    const uniforms = {
      ...this.uniforms,
      ...this.facadeUniforms,
      uConcrete: { value: new Color(palette.concrete).convertLinearToSRGB() },
      uConcreteWarm: { value: new Color(palette.concreteWarm).convertLinearToSRGB() },
      uLamp: { value: new Color(palette.lamp).convertLinearToSRGB() },
      uLampSoft: { value: new Color(palette.lampSoft).convertLinearToSRGB() },
      uLampCool: { value: new Color(palette.lampCool).convertLinearToSRGB() },
      uLampCold: { value: new Color(palette.lampCold).convertLinearToSRGB() },
      uSalt: { value: new Color(palette.salt).convertLinearToSRGB() },
      uGrime: { value: new Color(palette.grime).convertLinearToSRGB() },
      uCableGrey: { value: new Color(palette.cableGrey).convertLinearToSRGB() },
      uRust: { value: new Color(palette.rust).convertLinearToSRGB() },
      uMoss: { value: new Color(palette.moss).convertLinearToSRGB() },
      uBeaconColor: { value: new Color(palette.beacon).convertLinearToSRGB() },
      uSpotColor: { value: new Color(palette.spot).convertLinearToSRGB() },
      uNewsprint: { value: new Color(palette.newsprint).convertLinearToSRGB() },
      uNewsprintAged: { value: new Color(palette.newsprintAged).convertLinearToSRGB() },
      uAppliance: { value: new Color(palette.appliance).convertLinearToSRGB() },
      uLinen: { value: new Color(palette.linen).convertLinearToSRGB() },
      uDenim: { value: new Color(palette.denim).convertLinearToSRGB() },
      uMadder: { value: new Color(palette.madder).convertLinearToSRGB() },
      uSheenGreen: { value: new Color(palette.sheenGreen).convertLinearToSRGB() },
      uSheenPurple: { value: new Color(palette.sheenPurple).convertLinearToSRGB() },
      uCoral: { value: new Color(palette.coral).convertLinearToSRGB() },
      uBay: { value: BAY },
      uTileHeight: { value: TILE_HEIGHT },
      uPlantEvery: { value: PLANT_EVERY },
      uOuterX: { value: outerX },
      uBeaconSpot: { value: spot },
      uSurfaceMeters: { value: MAP_METERS },
      uLight: { value: new Vector3(-0.45, 0.7, 0.55).normalize() },
      uFogDensity: { value: 0.022 },
    };
    const facadeMaterial = (
      surface: number,
      occlusion: { value: Texture },
      min: Vector3,
      size: Vector3,
    ) =>
      new RawShaderMaterial({
        defines: { SURFACE: surface },
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: {
          ...uniforms,
          uOcclusion: occlusion,
          uOcclusionMin: { value: min },
          uOcclusionSize: { value: size },
        },
      });
    const surfaces = Object.values(SURFACES);
    const materials = surfaces.map((surface) =>
      facadeMaterial(surface, this.occlusion, OCCLUSION_MIN, OCCLUSION_SIZE),
    );
    const blocklessMaterials = surfaces.map((surface) =>
      facadeMaterial(surface, this.blocklessOcclusion, OCCLUSION_MIN, OCCLUSION_SIZE),
    );
    const rows = Array.from({ length: ROWS.below + ROWS.above }, (_, index) => index - ROWS.below);
    const columns = Array.from(
      { length: COLUMNS.right - COLUMNS.left },
      (_, index) => COLUMNS.left + 1 + index,
    );
    const blocked = columns.filter((column) => !BLOCKLESS_COLUMNS.includes(column));
    const bands: [Detail, number[]][] = [
      ['full', rows.filter((row) => row < DETAIL_ROWS.full)],
      ['reduced', rows.filter((row) => row >= DETAIL_ROWS.full && row < DETAIL_ROWS.reduced)],
      ['distant', rows.filter((row) => row >= DETAIL_ROWS.reduced)],
    ];
    const meshes = bands.flatMap(([detail, band]) => {
      const banded = tileParts(detail);
      return surfaces.flatMap((surface) => {
        const material = materials[surface]!;
        const parts = banded.filter((part) => surfaceOf(part) === surface);
        return [
          new Mesh(facadeGeometry(parts, blocked, band), material),
          new Mesh(facadeGeometry(parts, BLOCKLESS_COLUMNS, band), blocklessMaterials[surface]!),
          new Mesh(facadeGeometry(parts.filter(inWindowBay), [COLUMNS.left], band), material),
        ];
      });
    });
    for (const [{ parts, min, size }, column, occlusion] of [
      [leftEdge, COLUMNS.left, this.leftOcclusion],
      [rightEdge, COLUMNS.right + 1, this.rightOcclusion],
    ] as const) {
      meshes.push(
        new Mesh(
          facadeGeometry(parts, [column], rows),
          facadeMaterial(SURFACES.concrete, occlusion, min, size),
        ),
      );
    }
    const concrete = (list: Part[]) =>
      occluders(list).filter((part) => surfaceOf(part) === SURFACES.concrete);
    const around = occluders(surroundings(parts));
    this.rebar = new Rebar(
      [
        { parts: concrete(parts), around, columns: blocked },
        {
          parts: concrete(blockless),
          around: occluders(surroundings(blockless)),
          columns: BLOCKLESS_COLUMNS,
        },
        { parts: concrete(windows), around, columns: [COLUMNS.left] },
        { parts: leftEdge.parts, around: occluders(leftEdge.around), columns: [COLUMNS.left] },
        {
          parts: rightEdge.parts,
          around: occluders(rightEdge.around),
          columns: [COLUMNS.right + 1],
        },
      ],
      rows.filter((row) => row >= -REBAR_ROWS.below && row < REBAR_ROWS.above),
      uniforms,
    );
    const traceColumns = [COLUMNS.left, ...columns];
    const traceRows = rows.filter((row) => row >= -TRACE_ROWS.below && row < TRACE_ROWS.above);
    this.pigeons = pigeons(traceColumns, traceRows, uniforms);
    const depthMaterial = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: depthShader,
      uniforms,
      colorWrite: false,
    });
    const depthMeshes = meshes.map((mesh) => new Mesh(mesh.geometry, depthMaterial));
    for (const mesh of meshes) mesh.renderOrder = 1;
    for (const mesh of [...meshes, ...depthMeshes]) mesh.frustumCulled = false;
    this.building.add(
      ...depthMeshes,
      ...meshes,
      new Beacons(spot, rows, uniforms),
      this.rebar,
      ...spouts(traceColumns, traceRows, uniforms),
      grilles(traceColumns, traceRows, uniforms),
      ...ducts(traceColumns, rows, uniforms),
      ...traces(traceColumns, traceRows, uniforms),
      this.pigeons,
    );
    this.camera.position.z = VIEW.distance;
    this.add(new Backdrop(this.uniforms), this.building, this.veil);
  }

  async load(renderer: WebGLRenderer): Promise<void> {
    const [maps, surface] = await Promise.all([
      this.maps,
      bakeConcreteMaps(renderer),
      renderer.compileAsync(this, this.camera),
    ]);
    this.uniforms.uFbm.value = fbmTexture(maps.fbm);
    this.uniforms.uSurface.value = surface;
    this.occlusion.value = occlusionTexture(maps.occlusion);
    this.blocklessOcclusion.value = occlusionTexture(maps.blocklessOcclusion);
    this.leftOcclusion.value = occlusionTexture(maps.leftOcclusion);
    this.rightOcclusion.value = occlusionTexture(maps.rightOcclusion);
    this.pigeons.geometry.setIndex(new BufferAttribute(maps.pigeon.index, 1));
    for (const { name, array, itemSize } of maps.pigeon.attributes) {
      this.pigeons.geometry.setAttribute(name, new BufferAttribute(array, itemSize));
    }
    for (const texture of [
      this.uniforms.uFbm,
      this.occlusion,
      this.blocklessOcclusion,
      this.leftOcclusion,
      this.rightOcclusion,
    ]) {
      renderer.initTexture(texture.value);
    }
  }

  setOpacity(opacity: number): void {
    this.veil.uniforms.uOpacity.value = 1 - opacity;
    this.veil.visible = opacity < 1;
  }

  fit(aspect: number, width: number, height: number): void {
    this.uniforms.uResolution.value.set(width, height);
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
    }
    this.building.position.y = -this.lift;

    const phase = (this.uniforms.uTime.value / BEACON_PERIOD) % 1;
    this.facadeUniforms.uBeacon.value =
      MathUtils.smoothstep(phase, 0, 0.08) * (1 - MathUtils.smoothstep(phase, 0.3, 0.55));

    this.uniforms.uVanish.value.set(...this.onScreen(UP));
    this.uniforms.uBacklights.value.set(
      ...this.onScreen(BACKLIGHTS[0]),
      ...this.onScreen(BACKLIGHTS[1]),
    );
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

function bakeMaps(request: MapsRequest): Promise<TowerMaps> {
  const worker = new BakeWorker();
  worker.postMessage(request);
  return new Promise((resolve, reject) => {
    worker.addEventListener('message', (event: MessageEvent<TowerMaps>) => {
      worker.terminate();
      resolve(event.data);
    });
    worker.addEventListener('error', reject);
  });
}
