import {
  Color,
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
import type { Input } from '../core/Input';
import { Spring } from '../core/Spring';
import { palette } from '../core/palette';
import { Cables } from './Cables';
import { Backdrop } from './Backdrop';
import { Beacons, beaconSpot } from './Beacons';
import { MAP_METERS, bakeConcreteMaps } from './concreteMaps';
import {
  BAY,
  OCCLUSION_MIN,
  OCCLUSION_SIZE,
  EDGE_WIDTH,
  PIER,
  PLANT_EVERY,
  TILE_HEIGHT,
  bakeOcclusion,
  edge,
  facadeGeometry,
  surroundings,
  tileParts,
} from './facade';

const VIEW = { fov: 64, narrowestFov: 45, distance: 6.5, vanish: 0.82 };
const COLUMNS = { left: -3, right: 3 };
const ROWS = { below: 2, above: 32 };
const CLIMB_SPEED = 0.9;
const SWAY = { pitch: 0.04, yaw: 0.06 };
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
  };
  private facadeUniforms = {
    uClimb: { value: 0 },
    uTilesClimbed: { value: 0 },
    uBeacon: { value: 0 },
  };
  private building = new Group();
  private material: RawShaderMaterial;
  private lift = 0;
  private pitch = 0;
  private swayPitch = new Spring(4, 5);
  private swayYaw = new Spring(4, 5);
  private projected = new Vector3();

  constructor(private input: Input) {
    super();
    const parts = tileParts();
    const windows = parts.filter((part) => part.min.x >= PIER.max.x);
    const outerX = (COLUMNS.right + 1) * BAY + PIER.min.x + EDGE_WIDTH;
    const spot = beaconSpot(outerX);
    const uniforms = {
      ...this.uniforms,
      ...this.facadeUniforms,
      uConcrete: { value: new Color(palette.concrete).convertLinearToSRGB() },
      uLamp: { value: new Color(palette.lamp).convertLinearToSRGB() },
      uLampSoft: { value: new Color(palette.lampSoft).convertLinearToSRGB() },
      uLampCool: { value: new Color(palette.lampCool).convertLinearToSRGB() },
      uLampCold: { value: new Color(palette.lampCold).convertLinearToSRGB() },
      uSalt: { value: new Color(palette.salt).convertLinearToSRGB() },
      uGrime: { value: new Color(palette.grime).convertLinearToSRGB() },
      uRust: { value: new Color(palette.rust).convertLinearToSRGB() },
      uBeaconColor: { value: new Color(palette.beacon).convertLinearToSRGB() },
      uNewsprint: { value: new Color(palette.newsprint).convertLinearToSRGB() },
      uNewsprintAged: { value: new Color(palette.newsprintAged).convertLinearToSRGB() },
      uAppliance: { value: new Color(palette.appliance).convertLinearToSRGB() },
      uBay: { value: BAY },
      uTileHeight: { value: TILE_HEIGHT },
      uPlantEvery: { value: PLANT_EVERY },
      uOuterX: { value: outerX },
      uBeaconSpot: { value: spot },
      uSurface: { value: new Texture() },
      uSurfaceMeters: { value: MAP_METERS },
      uLight: { value: new Vector3(-0.45, 0.7, 0.55).normalize() },
      uFogDensity: { value: 0.022 },
    };
    const facadeMaterial = (occlusion: Texture, min: Vector3, size: Vector3) =>
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: {
          ...uniforms,
          uOcclusion: { value: occlusion },
          uOcclusionMin: { value: min },
          uOcclusionSize: { value: size },
        },
      });
    const material = (this.material = facadeMaterial(
      bakeOcclusion(surroundings(parts)),
      OCCLUSION_MIN,
      OCCLUSION_SIZE,
    ));
    const rows = Array.from({ length: ROWS.below + ROWS.above }, (_, index) => index - ROWS.below);
    const columns = Array.from(
      { length: COLUMNS.right - COLUMNS.left },
      (_, index) => COLUMNS.left + 1 + index,
    );
    const meshes = [
      new Mesh(facadeGeometry(parts, columns, rows), material),
      new Mesh(facadeGeometry(windows, [COLUMNS.left], rows), material),
    ];
    for (const [outward, column] of [
      [-1, COLUMNS.left],
      [1, COLUMNS.right + 1],
    ] as const) {
      const { parts, occlusion, min, size } = edge(outward, windows);
      meshes.push(
        new Mesh(facadeGeometry(parts, [column], rows), facadeMaterial(occlusion, min, size)),
      );
    }
    for (const mesh of meshes) mesh.frustumCulled = false;
    this.building.add(...meshes, new Beacons(spot, rows, uniforms), new Cables(rows, uniforms));
    this.camera.position.z = VIEW.distance;
    this.add(new Backdrop(this.uniforms), this.building);
  }

  bakeSurface(renderer: WebGLRenderer): void {
    this.material.uniforms.uSurface!.value = bakeConcreteMaps(renderer);
  }

  fit(aspect: number, width: number, height: number): void {
    this.uniforms.uResolution.value.set(width, height);
    const narrowest = Math.tan(MathUtils.degToRad(VIEW.narrowestFov / 2)) / aspect;
    const halfFov = Math.max(Math.tan(MathUtils.degToRad(VIEW.fov / 2)), narrowest);
    this.camera.fov = MathUtils.radToDeg(2 * Math.atan(halfFov));
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.pitch = Math.atan(1 / (VIEW.vanish * halfFov));
  }

  update(dt: number): void {
    const { pointer, isPointerInside, reducedMotion } = this.input;
    const follow = isPointerInside && !reducedMotion;
    this.swayPitch.target = follow ? pointer.y * SWAY.pitch : 0;
    this.swayYaw.target = follow ? -pointer.x * SWAY.yaw : 0;
    this.camera.rotation.set(
      this.pitch + this.swayPitch.update(dt),
      this.swayYaw.update(dt),
      0,
      'YXZ',
    );
    this.camera.updateMatrixWorld();

    const step = reducedMotion ? dt * REDUCED_MOTION_SPEED : dt;
    this.uniforms.uTime.value += step;
    this.facadeUniforms.uClimb.value += step * CLIMB_SPEED;
    this.lift += step * CLIMB_SPEED;
    if (this.lift >= TILE_HEIGHT) {
      this.lift -= TILE_HEIGHT;
      this.facadeUniforms.uTilesClimbed.value =
        (this.facadeUniforms.uTilesClimbed.value + 1) % TILE_SEEDS;
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

  private onScreen(direction: Vector3): [number, number] {
    const { x: width, y: height } = this.uniforms.uResolution.value;
    this.projected.copy(direction).multiplyScalar(1e4).add(this.camera.position);
    this.projected.project(this.camera);
    return [((this.projected.x + 1) / 2) * width, ((this.projected.y + 1) / 2) * height];
  }
}
