import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  PlaneGeometry,
  RingGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  type BakedGeometry,
  COLUMNS,
  type Detail,
  MIXED_FACE,
  OCCLUSION_MIN,
  OCCLUSION_SIZE,
  type Part,
  STOREY,
  SURFACES,
  TILE_ROWS,
  type Tile,
  edge,
  edgeVolume,
  facadeGeometry,
  gated,
  inWindowBay,
  occluders,
  packGeometry,
  partKey,
  pieceGeometry,
  standsIn,
  storeyGeometry,
  surfaceOf,
  surroundings,
  tileParts,
} from './facade';
import type { OcclusionBake } from './occlusion';
import { pigeonGeometry } from './pigeon';
import type { Patch, RebarBlocks } from './Rebar';
import type { TraceKind } from './traces';
import reach from './reach.json';

const BLOCKLESS_COLUMNS = [0, 1];
const DUCT_COLUMNS = [-2, 3];
const GRILLE_COLUMNS = [-1, 0, 1];
const LADDER_COLUMNS = [-1, 2];
const DETAIL_ROWS = { full: 5, reduced: 11 };
const REBAR_ROWS = { below: 1, above: 3 };
const TRACE_ROWS = { below: 1, above: 8 };
const CABLE_ROWS = { below: 2, near: 8, above: 16 };
const CABLE_SEGMENTS = { near: 128, far: 24 };
const SEEN_ROWS = {
  pigeons: 4,
  grilles: 3,
  boards: 3,
  motes: 4,
  spouts: 7,
  ducts: 12,
  rungs: 8,
  rungStains: 3,
  letters: 8,
};

const PUFFS = 16;
const LEAK_PIECES = 4;
const MOTES = 12;
const PIGEONS = 3;
const PIGEON_ROWS = { near: 2 };
const WIRES = 13;
const FASTENERS = 8;
const SPOUT_DROPS = 8;
const SPOUT_RINGS = 128;
const SPOUT_PARTS = [0, 1, 2, 2, 3, 4, 5, 6, 7, 8];
const DUCT_RINGS = 36;
const GRILLE_BARS = 63;
const BOARDS = 14;
const RUNGS = 12;
const LETTERS = 20;
const RUNG_ROWS = { near: 3 };
const RUNG_SIDES = { near: 8, far: 4 };
const RUNG_KNOTS = {
  near: [0, 0, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4, 5, 5],
  far: [0, 0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 5],
};

const PATCH = 0.6;
const LIFT = 0.02;
const FACES = [
  new Vector3(0, 0, 1),
  new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, -1, 0),
];

export type Occlusion = 'tiles' | 'blockless' | 'left' | 'right';
export type Census = { role: number; min: [number, number, number] };
export type FacadeMesh = {
  geometry: BakedGeometry;
  surface: number;
  occlusion: Occlusion;
  census: Census | null;
};
export type TraceGeometry = { kind: TraceKind; geometry: BakedGeometry };
export type TowerGeometry = { facade: FacadeMesh[]; rebar: RebarBlocks; traces: TraceGeometry[] };

const BAY_COLUMNS = Array.from(
  { length: COLUMNS.right - COLUMNS.left },
  (_, index) => COLUMNS.left + 1 + index,
);
const BLOCKED_COLUMNS = BAY_COLUMNS.filter((column) => !BLOCKLESS_COLUMNS.includes(column));
export const TRACE_COLUMNS = [COLUMNS.left, ...BAY_COLUMNS];

export function towerGeometry(): {
  geometry: TowerGeometry;
  occlusion: Record<Occlusion, OcclusionBake>;
} {
  const parts = tileParts('full');
  const windows = parts.filter(inWindowBay);
  const blockless = parts.filter((part) => !part.protrudes);
  const leftEdge = edge(-1, windows);
  const rightEdge = edge(1, windows);
  const volume = (around: Part[], { min, size }: { min: Vector3; size: Vector3 }) => ({
    solids: occluders(around),
    corner: min,
    extent: size,
  });
  const concrete = (list: Part[]) =>
    occluders(list).filter((part) => surfaceOf(part) === SURFACES.concrete);
  const around = occluders(surroundings(parts));
  const rebarGroups = [
    { parts: concrete(parts), around, columns: BLOCKED_COLUMNS },
    {
      parts: concrete(blockless),
      around: occluders(surroundings(blockless)),
      columns: BLOCKLESS_COLUMNS,
    },
    { parts: concrete(windows), around, columns: [COLUMNS.left] },
    { parts: leftEdge.parts, around: occluders(leftEdge.around), columns: [COLUMNS.left] },
    { parts: rightEdge.parts, around: occluders(rightEdge.around), columns: [COLUMNS.right + 1] },
  ];
  return {
    geometry: {
      facade: partBands().flatMap(bandMeshes),
      rebar: {
        groups: rebarGroups.map(({ parts, around, columns }) => ({
          patches: parts.flatMap((part) => exposedPatches(part, around)),
          columns,
        })),
        rows: TILE_ROWS.filter((row) => row >= -REBAR_ROWS.below && row < REBAR_ROWS.above),
      },
      traces: traceGeometries(),
    },
    occlusion: {
      tiles: volume(surroundings(parts), { min: OCCLUSION_MIN, size: OCCLUSION_SIZE }),
      blockless: volume(surroundings(blockless), { min: OCCLUSION_MIN, size: OCCLUSION_SIZE }),
      left: volume(leftEdge.around, edgeVolume(-1)),
      right: volume(rightEdge.around, edgeVolume(1)),
    },
  };
}

type Spans = Record<string, number[]>;
type Faces = Record<string, Spans>;
const REACH = reach as {
  parts: Record<string, Record<string, Faces>>;
  traces: Record<string, Spans>;
};
const MESH_BUDGET = { fixed: 12, full: 8, reduced: 6, distant: 6, left: 3, right: 3 };

export type PartBand = {
  name: Detail | 'fixed' | 'left' | 'right';
  parts: Part[];
  columns: number[];
  rows: number[];
  occlusion?: Occlusion;
};

export function partBands(): PartBand[] {
  const bands: [Detail, number[]][] = [
    ['full', TILE_ROWS.filter((row) => row < DETAIL_ROWS.full)],
    ['reduced', TILE_ROWS.filter((row) => row >= DETAIL_ROWS.full && row < DETAIL_ROWS.reduced)],
    ['distant', TILE_ROWS.filter((row) => row >= DETAIL_ROWS.reduced)],
  ];
  const fittings = (parts: Part[]) => parts.filter((part) => surfaceOf(part) === SURFACES.fittings);
  const full = tileParts('full');
  const windows = full.filter(inWindowBay);
  return [
    {
      name: 'fixed',
      parts: full.filter((part) => surfaceOf(part) !== SURFACES.fittings),
      columns: TRACE_COLUMNS,
      rows: TILE_ROWS,
    },
    ...bands.map(([name, rows]): PartBand => ({
      name,
      parts: fittings(tileParts(name)),
      columns: TRACE_COLUMNS,
      rows,
    })),
    {
      name: 'left',
      parts: edge(-1, windows).parts,
      columns: [COLUMNS.left],
      rows: TILE_ROWS,
      occlusion: 'left',
    },
    {
      name: 'right',
      parts: edge(1, windows).parts,
      columns: [COLUMNS.right + 1],
      rows: TILE_ROWS,
      occlusion: 'right',
    },
  ];
}

function spanTiles(spans: Spans | undefined, columns: number[], rows: number[]): Tile[] {
  if (spans === undefined) return [];
  return Object.entries(spans).flatMap(([column, [first, last]]) => {
    const at = Number(column);
    if (!columns.includes(at)) return [];
    return rows.filter((row) => row >= first! && row <= last!).map((row): Tile => [at, row]);
  });
}

type Group = {
  gating: string;
  tiles: Map<string, Tile>;
  pieces: BufferGeometry[];
  triangles: number;
};

function tileKey(tiles: Tile[]): string {
  return tiles
    .map(([column, row]) => column + ',' + row)
    .sort()
    .join(' ');
}

function gatingKey(part: Part): string {
  const storey = gated(part) ? Math.floor(part.min.y / STOREY + 0.01) : 0;
  return [gated(part) ? part.role : 0, storey, surfaceOf(part), inWindowBay(part) ? 1 : 0].join(
    ' ',
  );
}

function variants(band: PartBand, tiles: Tile[]): [Occlusion, Tile[]][] {
  if (band.occlusion) return [[band.occlusion, tiles]];
  return (['tiles', 'blockless'] as const).map((occlusion) => [
    occlusion,
    tiles.filter(([column]) => BLOCKLESS_COLUMNS.includes(column) === (occlusion === 'blockless')),
  ]);
}

function pieceGroups(band: PartBand): Group[] {
  const table = REACH.parts[band.name]!;
  const groups = new Map<string, Group>();
  for (const part of band.parts) {
    const faces = table[partKey(part)];
    if (faces === undefined) throw new Error('Unmeasured part ' + band.name + ' ' + partKey(part));
    const columns = band.occlusion
      ? band.columns
      : band.columns.filter((column) => standsIn(part, column));
    const byFace = new Map<number, Tile[]>();
    const all = new Map<string, Tile>();
    for (let face = 0; face < MIXED_FACE; face++) {
      const tiles = spanTiles(faces[face], columns, band.rows);
      byFace.set(face, tiles);
      for (const tile of tiles) all.set(tile.join(), tile);
    }
    byFace.set(MIXED_FACE, [...all.values()]);
    const sets = new Map<string, { faces: Set<number>; tiles: Tile[] }>();
    for (const [face, tiles] of byFace) {
      if (tiles.length === 0) continue;
      const key = tileKey(tiles);
      const set = sets.get(key) ?? { faces: new Set<number>(), tiles };
      set.faces.add(face);
      sets.set(key, set);
    }
    for (const [key, { faces: kept, tiles }] of sets) {
      const gating = gatingKey(part);
      const piece = pieceGeometry({ part, faces: kept.size > MIXED_FACE ? null : kept });
      const group = groups.get(gating + ' ' + key) ?? {
        gating,
        tiles: new Map(tiles.map((tile) => [tile.join(), tile])),
        pieces: [],
        triangles: 0,
      };
      group.pieces.push(piece);
      group.triangles += piece.index!.count / 3;
      groups.set(gating + ' ' + key, group);
    }
  }
  return [...groups.values()];
}

function mergeGroups(groups: Group[], budget: number): Group[] {
  const cost = (group: Group) => group.tiles.size * group.triangles;
  while (groups.length > budget) {
    let best: [number, number] | null = null;
    let bestCost = Infinity;
    for (let a = 0; a < groups.length; a++) {
      for (let b = a + 1; b < groups.length; b++) {
        const [one, other] = [groups[a]!, groups[b]!];
        if (one.gating !== other.gating) continue;
        const union = new Set([...one.tiles.keys(), ...other.tiles.keys()]).size;
        const extra = union * (one.triangles + other.triangles) - cost(one) - cost(other);
        if (extra < bestCost) {
          bestCost = extra;
          best = [a, b];
        }
      }
    }
    if (best === null) break;
    const [a, b] = best;
    const [one, other] = [groups[a]!, groups[b]!];
    groups[a] = {
      gating: one.gating,
      tiles: new Map([...one.tiles, ...other.tiles]),
      pieces: [...one.pieces, ...other.pieces],
      triangles: one.triangles + other.triangles,
    };
    groups.splice(b, 1);
  }
  return groups;
}

function bandMeshes(band: PartBand): FacadeMesh[] {
  return mergeGroups(pieceGroups(band), MESH_BUDGET[band.name]).flatMap(({ pieces, tiles }) => {
    const first = pieces[0]!;
    const role = first.getAttribute('aRole').getX(0);
    const min = first.getAttribute('aMin');
    const part: Part = {
      kind: first.getAttribute('aKind').getX(0),
      role,
      min: new Vector3(min.getX(0), min.getY(0), min.getZ(0)),
      max: new Vector3(),
    };
    const census = gated(part) ? { role, min: part.min.toArray() } : null;
    return variants(band, [...tiles.values()]).flatMap(([occlusion, subset]) =>
      subset.length === 0
        ? []
        : [
            {
              geometry: packGeometry(facadeGeometry(pieces, subset)),
              surface: surfaceOf(part),
              occlusion,
              census,
            },
          ],
    );
  });
}

function traceTiles(kind: TraceKind, columns: number[], rows: number[]): Tile[] {
  const last = TILE_ROWS[TILE_ROWS.length - 1]!;
  const spans = Object.fromEntries(
    Object.entries(REACH.traces[kind]!).map(([column, [first, top]]) => [
      column,
      [first!, Math.min(top! + 1, last)],
    ]),
  );
  return spanTiles(spans, columns, rows);
}

function faceFrame(normal: Vector3): [Vector3, Vector3] {
  if (Math.abs(normal.y) > 0.5) return [new Vector3(1, 0, 0), new Vector3(0, 0, 1)];
  if (Math.abs(normal.x) > 0.5) return [new Vector3(0, 0, 1), new Vector3(0, 1, 0)];
  return [new Vector3(1, 0, 0), new Vector3(0, 1, 0)];
}

function covered(point: Vector3, around: Part[]): boolean {
  return around.some(
    ({ min, max }) =>
      point.x > min.x &&
      point.x < max.x &&
      point.y > min.y &&
      point.y < max.y &&
      point.z > min.z &&
      point.z < max.z,
  );
}

function exposedPatches(part: Part, around: Part[]): Patch[] {
  return FACES.flatMap((normal) => {
    const [right, up] = faceFrame(normal);
    const axis = new Vector3(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
    const plane = axis.dot(normal.x + normal.y + normal.z > 0 ? part.max : part.min);
    const low = [part.min.dot(right), part.min.dot(up)] as const;
    const size = [part.max.dot(right) - low[0], part.max.dot(up) - low[1]] as const;
    const counts = size.map((length) => Math.max(Math.round(length / PATCH), 1));
    const patches: Patch[] = [];
    for (let i = 0; i < counts[0]!; i++) {
      for (let j = 0; j < counts[1]!; j++) {
        const u = [low[0] + (i * size[0]) / counts[0]!, low[0] + ((i + 1) * size[0]) / counts[0]!];
        const v = [low[1] + (j * size[1]) / counts[1]!, low[1] + ((j + 1) * size[1]) / counts[1]!];
        const samples = [
          [0.5, 0.5],
          [0.15, 0.15],
          [0.85, 0.15],
          [0.15, 0.85],
          [0.85, 0.85],
        ].map(([s, t]) =>
          right
            .clone()
            .multiplyScalar(u[0]! + s! * (u[1]! - u[0]!))
            .addScaledVector(up, v[0]! + t! * (v[1]! - v[0]!))
            .addScaledVector(axis, plane)
            .addScaledVector(normal, LIFT),
        );
        if (samples.some((point) => covered(point, around))) continue;
        patches.push({
          low: part.min.toArray(),
          high: part.max.toArray(),
          protrudes: part.protrudes ? 1 : 0,
          role: (normal.z > 0 ? part.front : undefined) ?? part.role ?? 0,
          normal: normal.toArray(),
          right: right.toArray(),
          up: up.toArray(),
          bounds: [u[0]!, v[0]!, u[1]!, v[1]!],
        });
      }
    }
    return patches;
  });
}

function spoutShape() {
  const pieces = [
    new CylinderGeometry(1, 1, 1, 16, SPOUT_RINGS, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    new CylinderGeometry(1.35, 1.35, 0.03, 16).rotateX(Math.PI / 2).translate(0, 0, 0.015),
    new CylinderGeometry(1.1, 1.1, 0.06, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.03),
    new RingGeometry(1, 1.1, 16),
    new CylinderGeometry(1.16, 1.16, 1, 16).rotateX(Math.PI / 2),
    new CylinderGeometry(1.16, 1.16, 1, 16).rotateX(Math.PI / 2),
    new CylinderGeometry(1, 1, 1, 16).rotateX(Math.PI / 2),
    new CylinderGeometry(1, 1, 1, 16).rotateX(Math.PI / 2),
    new BoxGeometry(1, 1, 1),
    new BoxGeometry(1, 1, 1),
  ].map((piece, index) => {
    piece.deleteAttribute('uv');
    const count = piece.getAttribute('position').count;
    const part = SPOUT_PARTS[index]!;
    piece.setAttribute('aPart', new Float32BufferAttribute(new Float32Array(count).fill(part), 1));
    return piece;
  });
  const shape = mergeGeometries(pieces)!;
  for (const piece of pieces) piece.dispose();
  return shape;
}

function ductFittingShape() {
  const pieces = [
    new CylinderGeometry(1, 1, 1, 24, 1, true),
    new BoxGeometry(1, 1, 1),
    new BoxGeometry(1, 1, 1),
    new RingGeometry(1, 1.35, 24),
  ].map((piece, part) => {
    const plain = piece.toNonIndexed();
    plain.deleteAttribute('uv');
    const count = plain.getAttribute('position').count;
    plain.setAttribute('aPart', new Float32BufferAttribute(new Float32Array(count).fill(part), 1));
    return plain;
  });
  const shape = mergeGeometries(pieces)!;
  for (const piece of pieces) piece.dispose();
  return shape;
}

function rungShape(sides: number, knots: number[]): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const columns = sides + 1;
  knots.forEach((knot, ring) => {
    const tip = ring === 0 || ring === knots.length - 1 ? 1 : 0;
    for (let side = 0; side < columns; side++) positions.push(side / sides, knot, tip);
  });
  for (let ring = 0; ring < knots.length - 1; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = ring * columns + side;
      indices.push(a, a + 1, a + columns, a + 1, a + 1 + columns, a + columns);
    }
  }
  return new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute(positions, 3))
    .setIndex(indices);
}

export type TraceLayout = {
  kind: TraceKind;
  shape: BufferGeometry;
  columns: number[];
  tiles: Tile[];
  count: number;
};

export function traceLayouts(): TraceLayout[] {
  const traceRows = TILE_ROWS.filter((row) => row >= -TRACE_ROWS.below && row < TRACE_ROWS.above);
  const cableRows = Array.from(
    { length: CABLE_ROWS.below + CABLE_ROWS.above },
    (_, index) => index - CABLE_ROWS.below,
  );
  const below = (rows: number[], last: number) => rows.filter((row) => row < last);
  const quad = new PlaneGeometry(1, 1);
  const box = new BoxGeometry(1, 1, 1);
  const layout = (
    kind: TraceKind,
    shape: BufferGeometry,
    columns: number[],
    rows: number[],
    count: number,
  ): TraceLayout => ({ kind, shape, columns, tiles: traceTiles(kind, columns, rows), count });
  const pipes: [TraceKind, TraceKind][] = [
    ['spouts', 'drips'],
    ['stacks', 'stackDrips'],
    ['runs', 'runDrips'],
  ];
  const cables = (rows: number[], segments: number): TraceLayout[] => [
    layout('wires', new PlaneGeometry(1, 1, 1, segments), TRACE_COLUMNS, rows, WIRES),
    layout('fasteners', box, TRACE_COLUMNS, rows, WIRES * FASTENERS),
  ];
  return [
    ...pipes.flatMap(([pipe, drips]) => [
      layout(pipe, spoutShape(), TRACE_COLUMNS, below(traceRows, SEEN_ROWS.spouts), 1),
      layout(drips, quad, TRACE_COLUMNS, below(traceRows, SEEN_ROWS.spouts), SPOUT_DROPS),
    ]),
    layout('grilles', box, GRILLE_COLUMNS, below(traceRows, SEEN_ROWS.grilles), GRILLE_BARS),
    layout('boards', box, TRACE_COLUMNS, below(traceRows, SEEN_ROWS.boards), BOARDS),
    layout(
      'ducts',
      new CylinderGeometry(1, 1, 1, 24, DUCT_RINGS, true),
      DUCT_COLUMNS,
      below(TILE_ROWS, SEEN_ROWS.ducts),
      2,
    ),
    layout('ductFittings', ductFittingShape(), DUCT_COLUMNS, below(TILE_ROWS, SEEN_ROWS.ducts), 3),
    layout(
      'rungs',
      rungShape(RUNG_SIDES.near, RUNG_KNOTS.near),
      LADDER_COLUMNS,
      below(TILE_ROWS, RUNG_ROWS.near),
      RUNGS,
    ),
    layout(
      'rungs',
      rungShape(RUNG_SIDES.far, RUNG_KNOTS.far),
      LADDER_COLUMNS,
      TILE_ROWS.filter((row) => row >= RUNG_ROWS.near && row < SEEN_ROWS.rungs),
      RUNGS,
    ),
    layout('rungStains', quad, LADDER_COLUMNS, below(TILE_ROWS, SEEN_ROWS.rungStains), 2 * RUNGS),
    layout('letters', quad, TRACE_COLUMNS, below(traceRows, SEEN_ROWS.letters), LETTERS),
    layout('vapour', quad, TRACE_COLUMNS, traceRows, PUFFS),
    layout('leak', quad, TRACE_COLUMNS, traceRows, LEAK_PIECES),
    layout('motes', quad, TRACE_COLUMNS, below(traceRows, SEEN_ROWS.motes), MOTES),
    ...cables(below(cableRows, CABLE_ROWS.near), CABLE_SEGMENTS.near),
    ...cables(
      cableRows.filter((row) => row >= CABLE_ROWS.near),
      CABLE_SEGMENTS.far,
    ),
    layout(
      'pigeons',
      pigeonGeometry('full'),
      TRACE_COLUMNS,
      below(traceRows, PIGEON_ROWS.near),
      PIGEONS,
    ),
    layout(
      'pigeons',
      pigeonGeometry('distant'),
      TRACE_COLUMNS,
      traceRows.filter((row) => row >= PIGEON_ROWS.near && row < SEEN_ROWS.pigeons),
      PIGEONS,
    ),
  ];
}

function traceGeometries(): TraceGeometry[] {
  return traceLayouts().map(({ kind, shape, tiles, count }) => ({
    kind,
    geometry: packGeometry(storeyGeometry(shape, tiles, count)),
  }));
}
