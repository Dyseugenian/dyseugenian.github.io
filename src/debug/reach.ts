import {
  Color,
  FrontSide,
  GLSL3,
  Group,
  type IUniform,
  Mesh,
  PerspectiveCamera,
  RawShaderMaterial,
  Scene,
  WebGLRenderTarget,
} from 'three';
import facadeVertex from '../shaders/facade.vert';
import reachFragment from '../shaders/reach.frag';
import type { App } from '../core/App';
import { driftExtent } from '../scene/Drift';
import { PITCH, SWAY, VIEW } from '../scene/Tower';
import {
  COLUMNS,
  type Part,
  TILE_HEIGHT,
  TILE_ROWS,
  type Tile,
  edge,
  facadeGeometry,
  grid,
  inWindowBay,
  partKey,
  pieceGeometry,
  soft,
  standsIn,
  storeyGeometry,
  tileParts,
} from '../scene/facade';
import { TRACE_COLUMNS, partBands, traceLayouts } from '../scene/towerGeometry';
import { SHADERS, type TraceKind } from '../scene/traces';

const PIXELS = 2.1e6;
const ASPECT = { min: 0.4, max: 3.6 };
const CORNER_ASPECTS = [ASPECT.min, 1, ASPECT.max];
const GRID_ASPECTS = [ASPECT.min, 16 / 9, ASPECT.max];
const RANDOM_ASPECTS = 9;
const LIFTS = [0, 0.25, 0.5, 0.75].map((part) => part * TILE_HEIGHT);
const GRID = { x: 5, y: 3, pitch: 5 };
const RANDOM_POSES = 800;
const SEEDS = 4096;
const WORLDS = [0, 1, -1];
const TRACE_FLAG = 1 << 23;
const MESH_SHIFT = 12;
const TRACE_ROWS = [-2, ...TILE_ROWS];
const ROW_BASE = 2;

type Pose = {
  x: number;
  y: number;
  pitch: number;
  yaw: number;
  roll: number;
  zoom: number;
  aspect: number;
  lift: number;
  seed: number;
  time: number;
  world: number;
};
type Source = { band: string; key: string };
type Rows = Record<number, number[]>;
type Spans = Record<number, [number, number]>;
export type Reach = {
  parts: Record<string, Record<string, Record<number, Spans>>>;
  traces: Record<string, Spans>;
};

const PART_VERTEX = tagged(
  facadeVertex.replace(
    '  if (uPresence > 0.5) {',
    '  if (aRole > 2.5 && aRole < 6.5 && uForce != 0.0) shown = step(0.0, uForce);\n  if (uPresence > 0.5) {',
  ),
  'uniform float uForce;\nout vec3 vFace;\nflat out vec2 vTileId;',
  'vFace = normal;\n  vTileId = aTile;',
);

function tagged(vertexShader: string, declarations: string, statements: string): string {
  return vertexShader.replace('void main() {', `${declarations}\nvoid main() {\n  ${statements}`);
}

function partMaterial(
  uniforms: Record<string, IUniform>,
  mesh: number,
  force: IUniform,
  part: Part,
): RawShaderMaterial {
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: PART_VERTEX,
    fragmentShader: reachFragment,
    uniforms: { ...uniforms, uMesh: { value: mesh }, uForce: force },
    depthWrite: !soft(part),
  });
}

function traceMaterial(
  uniforms: Record<string, IUniform>,
  kind: TraceKind,
  mesh: number,
): RawShaderMaterial {
  const [vertexShader, , options] = SHADERS[kind];
  const lit = vertexShader.replace('  if (dot(lamp, lamp) < 1e-4) return;\n', '');
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: tagged(lit, 'flat out vec2 vTileId;', 'vTileId = aTile;'),
    fragmentShader: reachFragment,
    defines: { ...options.defines, TRACE: 1 },
    uniforms: { ...uniforms, uMesh: { value: mesh } },
    depthWrite: false,
    side: options.side ?? FrontSide,
  });
}

function combinations<T>(axes: T[][]): T[][] {
  return axes.reduce<T[][]>(
    (heads, axis) => heads.flatMap((head) => axis.map((value) => [...head, value])),
    [[]],
  );
}

function poses(): Pose[] {
  const extent = driftExtent();
  const range = {
    x: SWAY.shift + extent.x,
    y: extent.y,
    pitch: SWAY.pitch + extent.pitch,
    yaw: extent.yaw,
    roll: extent.roll,
    zoom: extent.zoom,
  };
  const pose = (at: Partial<Pose>): Pose => ({
    x: 0,
    y: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    zoom: 0,
    aspect: 1,
    lift: 0,
    seed: Math.floor(Math.random() * SEEDS),
    time: Math.random() * 600,
    world: 0,
    ...at,
  });
  const signs = [-1, 1];
  const corners = combinations([signs, signs, signs, signs, signs, signs]).flatMap(
    ([x, y, pitch, yaw, roll, zoom]) =>
      combinations<number>([CORNER_ASPECTS, LIFTS, WORLDS]).map(([aspect, lift, world]) =>
        pose({
          x: x! * range.x,
          y: y! * range.y,
          pitch: pitch! * range.pitch,
          yaw: yaw! * range.yaw,
          roll: roll! * range.roll,
          zoom: zoom! * range.zoom,
          aspect,
          lift,
          world,
        }),
      ),
  );
  const steps = (count: number) =>
    Array.from({ length: count }, (_, index) => (2 * index) / (count - 1) - 1);
  const sweep = combinations<number>([
    steps(GRID.x),
    steps(GRID.y),
    steps(GRID.pitch),
    GRID_ASPECTS,
    LIFTS,
  ]).map(([x, y, pitch, aspect, lift]) =>
    pose({ x: x! * range.x, y: y! * range.y, pitch: pitch! * range.pitch, aspect, lift }),
  );
  const aspects = Array.from({ length: RANDOM_ASPECTS }, (_, index) =>
    Math.exp(
      Math.log(ASPECT.min) +
        ((Math.log(ASPECT.max) - Math.log(ASPECT.min)) * index) / (RANDOM_ASPECTS - 1),
    ),
  );
  const spread = () => Math.random() * 2 - 1;
  const scattered = Array.from({ length: RANDOM_POSES }, () =>
    pose({
      x: spread() * range.x,
      y: spread() * range.y,
      pitch: spread() * range.pitch,
      yaw: spread() * range.yaw,
      roll: spread() * range.roll,
      zoom: spread() * range.zoom,
      aspect: aspects[Math.floor(Math.random() * aspects.length)]!,
      lift: Math.random() * TILE_HEIGHT,
    }),
  );
  return [...corners, ...sweep, ...scattered];
}

function scan(seen: Uint8Array, pixels: Uint8Array, traces: boolean): void {
  for (let at = 0; at < pixels.length; at += 4) {
    if (pixels[at + 3] === 0) continue;
    const id = pixels[at]! | (pixels[at + 1]! << 8) | (pixels[at + 2]! << 16);
    if (((id & TRACE_FLAG) !== 0) === traces) seen[id] = 1;
  }
}

function spans(rows: Rows): Spans {
  return Object.fromEntries(
    Object.entries(rows).map(([column, list]) => [column, [Math.min(...list), Math.max(...list)]]),
  );
}

function collect(seen: Uint8Array, sources: Source[], kinds: TraceKind[]): Reach {
  const parts: Record<string, Record<string, Record<number, Rows>>> = {};
  const traces: Record<string, Rows> = {};
  for (const { band, key } of sources) (parts[band] ??= {})[key] ??= {};
  for (let id = 0; id < seen.length; id++) {
    if (seen[id] === 0) continue;
    const column = ((id >> 6) & 7) - 3;
    const row = (id & 63) - ROW_BASE;
    const mesh = (id >> MESH_SHIFT) & 2047;
    if (id & TRACE_FLAG) {
      ((traces[kinds[mesh]!] ??= {})[column] ??= []).push(row);
    } else {
      const { band, key } = sources[mesh]!;
      const face = (id >> 9) & 7;
      const rows = ((parts[band]![key]![face] ??= {})[column] ??= []);
      if (!rows.includes(row)) rows.push(row);
    }
  }
  return {
    parts: Object.fromEntries(
      Object.entries(parts).map(([band, keyed]) => [
        band,
        Object.fromEntries(
          Object.entries(keyed).map(([key, faces]) => [
            key,
            Object.fromEntries(Object.entries(faces).map(([face, rows]) => [face, spans(rows)])),
          ]),
        ),
      ]),
    ),
    traces: Object.fromEntries(Object.entries(traces).map(([kind, rows]) => [kind, spans(rows)])),
  };
}

export async function measureReach(app: App): Promise<void> {
  const { renderer } = app;
  const tower = app.tower!;
  const uniforms = tower.materialUniforms;
  const force = { value: 0 };
  const sources: Source[] = [];
  const parts = new Group();
  const addPart = (band: string, part: Part, tiles: Tile[]) => {
    const material = partMaterial(uniforms, sources.length, force, part);
    const mesh = new Mesh(facadeGeometry([pieceGeometry({ part, faces: null })], tiles), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = soft(part) ? 1 : 0;
    sources.push({ band, key: partKey(part) });
    parts.add(mesh);
  };
  for (const { name, parts: list, rows } of partBands()) {
    if (name === 'left' || name === 'right') continue;
    for (const part of list) {
      const columns = TRACE_COLUMNS.filter((column) => standsIn(part, column));
      addPart(name, part, grid(columns, rows));
    }
  }
  const windows = tileParts('full').filter(inWindowBay);
  for (const part of edge(-1, windows).parts)
    addPart('left', part, grid([COLUMNS.left], TILE_ROWS));
  for (const part of edge(1, windows).parts) {
    addPart('right', part, grid([COLUMNS.right + 1], TILE_ROWS));
  }
  const traces = new Group();
  const kinds: TraceKind[] = [];
  for (const { kind, shape, columns, count } of traceLayouts()) {
    if (kinds.includes(kind)) continue;
    const material = traceMaterial(uniforms, kind, kinds.length);
    const mesh = new Mesh(storeyGeometry(shape, grid(columns, TRACE_ROWS), count), material);
    mesh.frustumCulled = false;
    kinds.push(kind);
    traces.add(mesh);
  }
  const partScene = new Scene().add(parts);
  const traceScene = new Scene().add(traces);

  const camera = new PerspectiveCamera(VIEW.fov, 1, 0.1, 400);
  const targets = new Map<number, { target: WebGLRenderTarget; pixels: Uint8Array }>();
  const seen = new Uint8Array(1 << 24);
  const list = poses();
  const started = performance.now();
  for (const [index, pose] of list.entries()) {
    let drawn = targets.get(pose.aspect);
    if (!drawn) {
      const height = Math.round(Math.sqrt(PIXELS / pose.aspect));
      const width = Math.round(height * pose.aspect);
      drawn = {
        target: new WebGLRenderTarget(width, height),
        pixels: new Uint8Array(width * height * 4),
      };
      targets.set(pose.aspect, drawn);
    }
    const { target, pixels } = drawn;
    camera.aspect = pose.aspect;
    camera.fov = VIEW.fov + pose.zoom;
    camera.updateProjectionMatrix();
    camera.position.set(pose.x, pose.y, VIEW.distance);
    camera.rotation.set(PITCH + pose.pitch, pose.yaw, pose.roll, 'YXZ');
    camera.updateMatrixWorld();
    parts.position.y = traces.position.y = -pose.lift;
    force.value = pose.world;
    const draw = (scene: Scene, clear: boolean) => {
      const climbed = uniforms.uTilesClimbed!.value as number;
      const time = uniforms.uTime!.value as number;
      const { x: width, y: height } = uniforms.uResolution!.value;
      const clearColor = renderer.getClearColor(new Color());
      const clearAlpha = renderer.getClearAlpha();
      uniforms.uTilesClimbed!.value = pose.seed;
      uniforms.uTime!.value = pose.time;
      uniforms.uResolution!.value.set(target.width, target.height);
      renderer.setRenderTarget(target);
      if (clear) {
        renderer.setClearColor(0, 0);
        renderer.clear();
      }
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.setClearColor(clearColor, clearAlpha);
      uniforms.uTilesClimbed!.value = climbed;
      uniforms.uTime!.value = time;
      uniforms.uResolution!.value.set(width, height);
    };
    draw(partScene, true);
    await renderer.readRenderTargetPixelsAsync(target, 0, 0, target.width, target.height, pixels);
    scan(seen, pixels, false);
    draw(traceScene, false);
    await renderer.readRenderTargetPixelsAsync(target, 0, 0, target.width, target.height, pixels);
    scan(seen, pixels, true);
    if (index % 200 === 0) console.log(`reach: ${index} of ${list.length}`);
  }
  const reach = collect(seen, sources, kinds);
  const seconds = (performance.now() - started) / 1000;
  for (const { target } of targets.values()) target.dispose();
  for (const scene of [partScene, traceScene]) {
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        object.material.dispose();
      }
    });
  }
  Object.assign(window, { reach });
  console.log(`reach: ${list.length} poses in ${seconds.toFixed(0)} s`);
}
