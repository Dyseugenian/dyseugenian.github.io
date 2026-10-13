import {
  BoxGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  type InstancedBufferGeometry,
  PlaneGeometry,
  RingGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  type BakedGeometry,
  COLUMNS,
  type Detail,
  OCCLUSION_MIN,
  OCCLUSION_SIZE,
  type Part,
  SURFACES,
  TILE_ROWS,
  edge,
  edgeVolume,
  facadeGeometry,
  inWindowBay,
  occluders,
  packGeometry,
  seenIn,
  storeyGeometry,
  surfaceOf,
  surroundings,
  tileParts,
} from './facade';
import type { OcclusionBake } from './occlusion';
import { pigeonGeometry } from './pigeon';
import type { Patch, RebarBlocks } from './Rebar';
import type { TraceKind } from './traces';

const BLOCKLESS_COLUMNS = [0, 1];
const DUCT_COLUMNS = [-2, 3];
const GRILLE_COLUMNS = [-1, 0, 1];
const DETAIL_ROWS = { full: 5, reduced: 11 };
const REBAR_ROWS = { below: 1, above: 4 };
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
};

const PUFFS = 16;
const LEAK_PIECES = 4;
const MOTES = 12;
const PIGEONS = 3;
const WIRES = 13;
const FASTENERS = 8;
const SPOUT_DROPS = 8;
const SPOUT_RINGS = 96;
const DUCT_RINGS = 36;
const GRILLE_BARS = 63;
const BOARDS = 14;

const PATCH = 0.6;
const LIFT = 0.02;
const FACES = [
  new Vector3(0, 0, 1),
  new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, -1, 0),
];

export type Occlusion = 'tiles' | 'blockless' | 'left' | 'right';
export type FacadeMesh = { geometry: BakedGeometry; surface: number; occlusion: Occlusion };
export type TraceGeometry = { kind: TraceKind; geometry: BakedGeometry };
export type TowerGeometry = { facade: FacadeMesh[]; rebar: RebarBlocks; traces: TraceGeometry[] };

const BAY_COLUMNS = Array.from(
  { length: COLUMNS.right - COLUMNS.left },
  (_, index) => COLUMNS.left + 1 + index,
);
const BLOCKED_COLUMNS = BAY_COLUMNS.filter(
  (column) => !BLOCKLESS_COLUMNS.includes(column) && column !== COLUMNS.right,
);
const TRACE_COLUMNS = [COLUMNS.left, ...BAY_COLUMNS];

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
      facade: [
        ...tileMeshes(),
        edgeMesh(leftEdge.parts, COLUMNS.left, 'left'),
        edgeMesh(rightEdge.parts, COLUMNS.right + 1, 'right'),
      ],
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

function runs(parts: Part[], rows: number[]): number[][] {
  const runs: number[][] = [];
  let shown = -1;
  for (const row of rows) {
    const count = seenIn(parts, row, false).length + seenIn(parts, row, true).length;
    if (count !== shown) runs.push([]);
    runs.at(-1)!.push(row);
    shown = count;
  }
  return runs;
}

function tileMeshes(): FacadeMesh[] {
  const bands: [Detail, number[]][] = [
    ['full', TILE_ROWS.filter((row) => row < DETAIL_ROWS.full)],
    ['reduced', TILE_ROWS.filter((row) => row >= DETAIL_ROWS.full && row < DETAIL_ROWS.reduced)],
    ['distant', TILE_ROWS.filter((row) => row >= DETAIL_ROWS.reduced)],
  ];
  return bands.flatMap(([detail, band]) => {
    const banded = tileParts(detail);
    return runs(banded, band).flatMap((run) => {
      const inner = seenIn(banded, run[0]!, false);
      const outermost = seenIn(banded, run[0]!, true);
      const groups: [Part[], number[], Occlusion][] = [
        [inner, BLOCKED_COLUMNS, 'tiles'],
        [outermost, [COLUMNS.right], 'tiles'],
        [inner, BLOCKLESS_COLUMNS, 'blockless'],
        [outermost.filter(inWindowBay), [COLUMNS.left], 'tiles'],
      ];
      return groups.flatMap(([parts, columns, occlusion]) =>
        Object.values(SURFACES).flatMap((surface) => {
          const shown = parts.filter((part) => surfaceOf(part) === surface);
          if (shown.length === 0) return [];
          return [
            { geometry: packGeometry(facadeGeometry(shown, columns, run)), surface, occlusion },
          ];
        }),
      );
    });
  });
}

function edgeMesh(parts: Part[], column: number, occlusion: Occlusion): FacadeMesh {
  return {
    geometry: packGeometry(facadeGeometry(parts, [column], TILE_ROWS)),
    surface: SURFACES.concrete,
    occlusion,
  };
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
  ].map((piece, index) => {
    const part = Math.min(index, 2);
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

function traceGeometries(): TraceGeometry[] {
  const traceRows = TILE_ROWS.filter((row) => row >= -TRACE_ROWS.below && row < TRACE_ROWS.above);
  const cableRows = Array.from(
    { length: CABLE_ROWS.below + CABLE_ROWS.above },
    (_, index) => index - CABLE_ROWS.below,
  );
  const below = (rows: number[], last: number) => rows.filter((row) => row < last);
  const quad = new PlaneGeometry(1, 1);
  const box = new BoxGeometry(1, 1, 1);
  const cables = (rows: number[], segments: number): [TraceKind, InstancedBufferGeometry][] => [
    ['wires', storeyGeometry(new PlaneGeometry(1, 1, 1, segments), TRACE_COLUMNS, rows, WIRES)],
    ['fasteners', storeyGeometry(box, TRACE_COLUMNS, rows, WIRES * FASTENERS)],
  ];
  const geometries: [TraceKind, InstancedBufferGeometry][] = [
    ['spouts', storeyGeometry(spoutShape(), TRACE_COLUMNS, below(traceRows, SEEN_ROWS.spouts), 1)],
    ['drips', storeyGeometry(quad, TRACE_COLUMNS, below(traceRows, SEEN_ROWS.spouts), SPOUT_DROPS)],
    [
      'grilles',
      storeyGeometry(box, GRILLE_COLUMNS, below(traceRows, SEEN_ROWS.grilles), GRILLE_BARS),
    ],
    ['boards', storeyGeometry(box, TRACE_COLUMNS, below(traceRows, SEEN_ROWS.boards), BOARDS)],
    [
      'ducts',
      storeyGeometry(
        new CylinderGeometry(1, 1, 1, 24, DUCT_RINGS, true),
        DUCT_COLUMNS,
        below(TILE_ROWS, SEEN_ROWS.ducts),
        2,
      ),
    ],
    [
      'ductFittings',
      storeyGeometry(ductFittingShape(), DUCT_COLUMNS, below(TILE_ROWS, SEEN_ROWS.ducts), 3),
    ],
    ['vapour', storeyGeometry(quad, TRACE_COLUMNS, traceRows, PUFFS)],
    ['leak', storeyGeometry(quad, TRACE_COLUMNS, traceRows, LEAK_PIECES)],
    ['motes', storeyGeometry(quad, TRACE_COLUMNS, below(traceRows, SEEN_ROWS.motes), MOTES)],
    ...cables(below(cableRows, CABLE_ROWS.near), CABLE_SEGMENTS.near),
    ...cables(
      cableRows.filter((row) => row >= CABLE_ROWS.near),
      CABLE_SEGMENTS.far,
    ),
    [
      'pigeons',
      storeyGeometry(pigeonGeometry(), TRACE_COLUMNS, below(traceRows, SEEN_ROWS.pigeons), PIGEONS),
    ],
  ];
  return geometries.map(([kind, geometry]) => ({ kind, geometry: packGeometry(geometry) }));
}
