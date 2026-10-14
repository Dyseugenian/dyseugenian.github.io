import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  ClampToEdgeWrapping,
  CylinderGeometry,
  Data3DTexture,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LatheGeometry,
  LinearFilter,
  Path,
  PlaneGeometry,
  RedFormat,
  RepeatWrapping,
  RingGeometry,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OCCLUSION } from './occlusion';

export const BAY = 4.2;
export const STOREY = 3.6;
export const TILE_HEIGHT = 2 * STOREY;
export const COLUMNS = { left: -3, right: 3 };
const ROWS = { below: 1, above: 32 };
export const TILE_ROWS = Array.from(
  { length: ROWS.below + ROWS.above },
  (_, index) => index - ROWS.below,
);

const CONCRETE = 0;
const GLASS = 1;
const APPLIANCE = 2;
const CLOTH = 3;
const FAN = 4;
const TRIM = 5;
const RAG = 6;
const SHEET = 7;

const REGULAR = 1;
const PLANT = 2;
const OCCASIONAL = 3;
const LAUNDRY = 4;
const RAGGED = 5;
const SHEETED = 6;
const HOLED = 7;
const SOLID = 8;
const UNBORED = 9;
const STUDDED = 10;
export const PLANT_EVERY = 16;
const PLANT_FLOOR = { front: 0.6, louvre: 0.06, louvreSpacing: 0.24 };
const RAG_SIZE = { width: 0.42, drop: 0.5, z: -1.27 };
const SHEET_Z = -2.75;
const CLOTHES_LINE = { height: 1.05, z: -0.8, span: 1.12, slots: 4, drop: 0.95, thickness: 0.012 };

const HOLE = { cover: 0.4, back: -2, rim: 0.35, segments: 32, rings: 6 };

const ROTOR = { radius: 0.2, hub: 0.045, blades: 4, pitch: 0.45, rim: 0.025, depth: 0.05 };

export const EDGE_WIDTH = 1.75;
export const EDGE_REACH = 2.4;
const EDGE = { pitch: 3.6, rib: 0.45, depth: 0.7, reach: EDGE_REACH, behind: -8, margin: 2.55 };

export const OCCLUSION_MIN = new Vector3(-BAY / 2, 0, OCCLUSION.back);
export const OCCLUSION_SIZE = new Vector3(BAY, TILE_HEIGHT, OCCLUSION.front - OCCLUSION.back);

export type Part = {
  kind: number;
  min: Vector3;
  max: Vector3;
  protrudes?: boolean;
  role?: number;
  front?: number;
  shape?: BufferGeometry;
};

export type Piece = { part: Part; faces: Set<number> | null };

export const MIXED_FACE = 6;

type Span = [number, number];

export type Detail = 'full' | 'reduced' | 'distant';

function part(kind: number, x: Span, y: Span, z: Span): Part {
  return {
    kind,
    min: new Vector3(x[0], y[0], z[0]),
    max: new Vector3(x[1], y[1], z[1]),
  };
}

function shaped(kind: number, shape: BufferGeometry): Part {
  shape.computeBoundingBox();
  const { min, max } = shape.boundingBox!;
  return { kind, min: min.clone(), max: max.clone(), shape };
}

function flipped(geometry: BufferGeometry): BufferGeometry {
  const index = geometry.index!.array;
  const reversed: number[] = [];
  for (let i = 0; i < index.length; i += 3) reversed.push(index[i]!, index[i + 2]!, index[i + 1]!);
  geometry.setIndex(reversed);
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) {
    normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
  }
  return geometry;
}

function shroud(center: Vector3, segments: number): BufferGeometry {
  const { radius, rim, depth } = ROTOR;
  const tube = (size: number) =>
    new CylinderGeometry(size, size, depth, segments, 1, true)
      .rotateX(Math.PI / 2)
      .translate(0, 0, depth / 2);
  const lip = new RingGeometry(radius, radius + rim, segments).translate(0, 0, depth);
  return mergeGeometries([tube(radius + rim), flipped(tube(radius)), lip])!.translate(
    center.x,
    center.y,
    center.z,
  );
}

function boreOf(min: Vector3, max: Vector3) {
  const { cover, rim } = HOLE;
  const opening = Math.sqrt((cover * (max.x - min.x) * (max.y - min.y)) / Math.PI);
  const round = rim * opening;
  return {
    center: new Vector2((min.x + max.x) / 2, (min.y + max.y) / 2),
    opening,
    round,
    radius: opening - round,
  };
}

function frontless(min: Vector3, max: Vector3): BufferGeometry {
  const size = max.clone().sub(min);
  const center = max.clone().add(min).multiplyScalar(0.5);
  const box = new BoxGeometry(size.x, size.y, size.z).translate(center.x, center.y, center.z);
  box.setIndex(Array.from(box.index!.array).filter((_, index) => index < 24 || index >= 30));
  return box;
}

function front(min: Vector3, max: Vector3, hole?: Vector2, radius = 0): BufferGeometry {
  const outline = new Shape([
    new Vector2(min.x, min.y),
    new Vector2(max.x, min.y),
    new Vector2(max.x, max.y),
    new Vector2(min.x, max.y),
  ]);
  if (hole) outline.holes.push(new Path().absarc(hole.x, hole.y, radius, 0, 2 * Math.PI, true));
  return new ShapeGeometry(outline, HOLE.segments).translate(0, 0, max.z);
}

function holedBlock(min: Vector3, max: Vector3): BufferGeometry {
  const { back, segments, rings } = HOLE;
  const { center, opening, round, radius } = boreOf(min, max);
  const depth = max.z - back;
  const profile = Array.from({ length: rings + 1 }, (_, ring) => {
    const angle = (ring / rings) * (Math.PI / 2);
    return new Vector2(opening - round * Math.sin(angle), round * (Math.cos(angle) - 1));
  });
  const fillet = new LatheGeometry(profile, segments).rotateX(Math.PI / 2);
  const tube = flipped(
    new CylinderGeometry(radius, radius, depth - round, segments, 1, true)
      .rotateX(Math.PI / 2)
      .translate(0, 0, -(depth + round) / 2),
  );
  const end = new CircleGeometry(radius, segments).translate(0, 0, -depth);
  const hole = mergeGeometries([fillet, tube, end])!.translate(center.x, center.y, max.z);
  return mergeGeometries([frontless(min, max), front(min, max, center, opening), hole])!;
}

function blade(steps: number): BufferGeometry {
  const { radius, hub } = ROTOR;
  const edge = (from: number, to: number) =>
    Array.from({ length: steps + 1 }, (_, step) => {
      const along = step / steps;
      const angle = from + (to - from) * along;
      const reach = hub * 0.9 + (radius - 0.015 - hub * 0.9) * along;
      return new Vector2(Math.cos(angle) * reach, Math.sin(angle) * reach);
    });
  const outline = [...edge(0.25, 0.6), ...edge(-0.3, -0.05).reverse()];
  const front = new ShapeGeometry(new Shape(outline));
  return mergeGeometries([front, flipped(front.clone())])!;
}

function rotor(center: Vector3, segments: number, steps: number): BufferGeometry {
  const { hub, blades, pitch } = ROTOR;
  const pieces: BufferGeometry[] = [
    new CylinderGeometry(hub, hub, 0.035, segments).rotateX(Math.PI / 2).translate(0, 0, 0.025),
  ];
  for (let index = 0; index < blades; index++) {
    pieces.push(
      blade(steps)
        .rotateX(pitch)
        .rotateZ((index * 2 * Math.PI) / blades)
        .translate(0, 0, 0.02),
    );
  }
  return mergeGeometries(pieces)!.translate(center.x, center.y, center.z);
}

function airConditioner(y: number, detail: Detail): Part[] {
  const bottom = y + 0.05;
  const top = bottom + 0.6;
  const front = -1.32;
  const back = front - 0.32;
  const fan = new Vector3(0.175, (bottom + top) / 2 - 0.02, front);
  const intake = (bottom + top) / 2 + 0.02;
  const parts = [
    part(APPLIANCE, [-0.425, 0.425], [bottom, top], [back, front]),
    part(APPLIANCE, [0.425, 0.465], [bottom + 0.1, bottom + 0.14], [-3.05, back + 0.08]),
    part(TRIM, [-0.44, 0.44], [top, top + 0.02], [back - 0.015, front + 0.02]),
  ];
  if (detail !== 'distant') {
    parts.push(
      part(TRIM, [-0.36, -0.3], [y, bottom], [back, front - 0.02]),
      part(TRIM, [0.3, 0.36], [y, bottom], [back, front - 0.02]),
      part(TRIM, [-0.36, -0.3], [y - 0.3, y], [back, back + 0.03]),
      part(TRIM, [0.3, 0.36], [y - 0.3, y], [back, back + 0.03]),
    );
  }
  if (detail === 'full') {
    parts.push(shaped(TRIM, shroud(fan, 24)), shaped(FAN, rotor(fan, 12, 5)));
    for (let slat = intake - 0.2; slat < intake + 0.21; slat += 0.04) {
      parts.push(part(TRIM, [-0.375, -0.075], [slat - 0.007, slat + 0.007], [front, front + 0.02]));
    }
  } else {
    parts.push(
      part(TRIM, [-0.375, -0.075], [intake - 0.207, intake + 0.207], [front, front + 0.02]),
    );
  }
  if (detail === 'reduced') {
    parts.push(shaped(TRIM, shroud(fan, 12)), shaped(FAN, rotor(fan, 6, 2)));
  }
  return parts.map(occasional);
}

const LAUNDRY_SEGMENTS: Record<Detail, { line: number; across: number; down: number }> = {
  full: { line: 8, across: 14, down: 10 },
  reduced: { line: 4, across: 6, down: 4 },
  distant: { line: 4, across: 2, down: 1 },
};

const BLOCK_MIN = new Vector3(-3.05, 0.9, -1);
const BLOCK_MAX = new Vector3(-1.15, 2.7, 0.9);
const BLOCK_BORE = boreOf(BLOCK_MIN, BLOCK_MAX);
const PIER_MIN = new Vector3(-2.8, 0, -3.2);
const PIER_MAX = new Vector3(-1.4, TILE_HEIGHT, 0);
export const OUTER_X = (COLUMNS.right + 1) * BAY + PIER_MIN.x + EDGE_WIDTH;
export const SIDE_X = OUTER_X + EDGE_REACH;
const STUDS = { band: 1.2, margin: 0.04, height: 0.218, across: 1 };

function stud(low: Vector2, high: Vector2, face: number): BufferGeometry {
  const corners = [
    new Vector3(low.x, low.y, face),
    new Vector3(high.x, low.y, face),
    new Vector3(high.x, high.y, face),
    new Vector3(low.x, high.y, face),
  ];
  const apex = new Vector3((low.x + high.x) / 2, (low.y + high.y) / 2, face + STUDS.height);
  const positions: number[] = [];
  const normals: number[] = [];
  for (let side = 0; side < 4; side++) {
    const a = corners[side]!;
    const b = corners[(side + 1) % 4]!;
    const normal = b.clone().sub(a).cross(apex.clone().sub(a)).normalize();
    for (const point of [a, b, apex]) {
      positions.push(point.x, point.y, point.z);
      normals.push(normal.x, normal.y, normal.z);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute(
    'uv',
    new Float32BufferAttribute(new Array<number>((positions.length / 3) * 2).fill(0), 2),
  );
  geometry.setIndex(Array.from({ length: positions.length / 3 }, (_, index) => index));
  return geometry;
}

function studdedFront(): BufferGeometry {
  const { band, margin, across } = STUDS;
  const width = (PIER_MAX.x - PIER_MIN.x - 2 * margin) / across;
  const height = (band - 2 * margin) / across;
  const pieces = [front(PIER_MIN, PIER_MAX)];
  for (let bottom = PIER_MIN.y; bottom < PIER_MAX.y - band / 2; bottom += band) {
    for (let column = 0; column < across; column++) {
      for (let row = 0; row < across; row++) {
        const low = new Vector2(
          PIER_MIN.x + margin + column * width,
          bottom + margin + row * height,
        );
        pieces.push(stud(low, low.clone().add(new Vector2(width, height)), PIER_MAX.z));
      }
    }
  }
  return mergeGeometries(pieces)!;
}

function pierParts(): Part[] {
  const pier: Part = {
    kind: CONCRETE,
    min: PIER_MIN,
    max: PIER_MAX,
    shape: frontless(PIER_MIN, PIER_MAX),
  };
  const block: Part = {
    ...part(
      CONCRETE,
      [BLOCK_MIN.x, BLOCK_MAX.x],
      [BLOCK_MIN.y, BLOCK_MAX.y],
      [BLOCK_MIN.z, BLOCK_MAX.z],
    ),
    protrudes: true,
    role: SOLID,
  };
  return [
    { ...pier, front: UNBORED },
    { ...pier, shape: front(PIER_MIN, PIER_MAX), role: UNBORED },
    {
      ...pier,
      shape: front(PIER_MIN, PIER_MAX, BLOCK_BORE.center, BLOCK_BORE.radius),
      role: HOLED,
    },
    block,
    { ...block, shape: holedBlock(BLOCK_MIN, BLOCK_MAX), role: HOLED },
    {
      ...pier,
      max: new Vector3(PIER_MAX.x, PIER_MAX.y, PIER_MAX.z + STUDS.height),
      shape: studdedFront(),
      role: STUDDED,
    },
  ];
}

export const SURFACES = { concrete: 0, glass: 1, fittings: 2 };

export function surfaceOf({ kind }: Part): number {
  if (kind === CONCRETE) return SURFACES.concrete;
  if (kind === GLASS) return SURFACES.glass;
  return SURFACES.fittings;
}

export function inWindowBay(part: Part): boolean {
  return part.min.x >= PIER_MAX.x;
}

export function standsIn(part: Part, column: number): boolean {
  return column !== COLUMNS.left || inWindowBay(part);
}

export function soft({ kind }: Part): boolean {
  return kind === CLOTH || kind === RAG || kind === SHEET;
}

export function partKey({ kind, role, min, max }: Part): string {
  return [kind, role ?? 0, ...min.toArray(), ...max.toArray()]
    .map((value) => Math.round(value * 1000) / 1000)
    .join(' ');
}

export function gated({ role }: Part): boolean {
  return role !== undefined && [PLANT, OCCASIONAL, LAUNDRY, RAGGED, SHEETED, HOLED].includes(role);
}

function regular(part: Part): Part {
  return { ...part, role: REGULAR };
}

function plant(part: Part): Part {
  return { ...part, role: PLANT };
}

function occasional(part: Part): Part {
  return { ...part, role: OCCASIONAL };
}

function hung(part: Part): Part {
  return { ...part, role: LAUNDRY };
}

function ragged(part: Part): Part {
  return { ...part, role: RAGGED };
}

function sheeted(part: Part): Part {
  return { ...part, role: SHEETED };
}

export function tileParts(detail: Detail): Part[] {
  const parts = pierParts();
  for (const y of [0, STOREY]) {
    const top = y + STOREY;
    const sill = y + 0.55;
    const glassBottom = y + 1.15;
    const glassTop = y + 3.2;
    parts.push(
      part(CONCRETE, [-1.4, 1.4], [y, top], [-3.5, -3.1]),
      regular(part(GLASS, [-1.05, 1.05], [glassBottom, glassTop], [-3.1, -3.05])),
      part(CONCRETE, [-1.4, -1.05], [sill, top], [-3.1, -2.5]),
      part(CONCRETE, [1.05, 1.4], [sill, top], [-3.1, -2.5]),
      part(CONCRETE, [-1.05, 1.05], [glassTop, top], [-3.1, -2.5]),
      part(CONCRETE, [-1.4, 1.4], [y, sill], [-3.1, -1.8]),
      regular(part(CONCRETE, [-1.2, 1.2], [sill, glassBottom], [-3.1, -1.3])),
    );
    const { front, louvre, louvreSpacing } = PLANT_FLOOR;
    for (const [bottom, height, back] of [
      [y, sill, -1.8],
      [glassTop, top, -2.5],
    ] as const) {
      parts.push(
        plant(part(CONCRETE, [-1.4, 1.4], [bottom, height], [back, front])),
        plant(part(CONCRETE, [-2.8, -1.4], [bottom, height], [-0.5, front])),
      );
    }
    parts.push(...airConditioner(glassBottom, detail));
    const { height, z, span, slots, drop, thickness } = CLOTHES_LINE;
    const segments = LAUNDRY_SEGMENTS[detail];
    const line = y + height;
    const slot = (2 * span) / slots;
    parts.push(
      hung(
        shaped(
          CLOTH,
          new BoxGeometry(2.8, thickness, thickness, segments.line, 1, 1).translate(0, line, z),
        ),
      ),
    );
    for (let index = 0; index < slots; index++) {
      const center = -span + (index + 0.5) * slot;
      const cloth = new PlaneGeometry(slot, drop, segments.across, segments.down);
      parts.push(hung(shaped(CLOTH, cloth.translate(center, line - drop / 2, z))));
    }
    const rag = new PlaneGeometry(
      RAG_SIZE.width,
      RAG_SIZE.drop,
      segments.across,
      2 * segments.down,
    );
    const sheet = new PlaneGeometry(2.1, glassTop - glassBottom, segments.across, segments.across);
    parts.push(
      ragged(shaped(RAG, rag.translate(0, glassBottom - RAG_SIZE.drop / 2, RAG_SIZE.z))),
      sheeted(shaped(SHEET, sheet.translate(0, (glassBottom + glassTop) / 2, SHEET_Z))),
    );
    for (let blade = sill + louvreSpacing / 2; blade < glassTop; blade += louvreSpacing) {
      parts.push(
        plant(
          part(CONCRETE, [-1.05, 1.05], [blade - louvre / 2, blade + louvre / 2], [-3.05, -2.55]),
        ),
      );
    }
  }
  return parts;
}

export function faceOf(x: number, y: number, z: number): number {
  const [sizeX, sizeY, sizeZ] = [Math.abs(x), Math.abs(y), Math.abs(z)];
  if (sizeX > sizeY && sizeX > sizeZ) return x > 0 ? 0 : 1;
  if (sizeY > sizeZ) return y > 0 ? 2 : 3;
  return z > 0 ? 4 : 5;
}

function keepFaces(geometry: BufferGeometry, faces: Set<number>): void {
  const index = geometry.index!.array;
  const normal = geometry.getAttribute('normal');
  const kept: number[] = [];
  for (let at = 0; at < index.length; at += 3) {
    const corners = [index[at]!, index[at + 1]!, index[at + 2]!];
    const buckets = corners.map((corner) =>
      faceOf(normal.getX(corner), normal.getY(corner), normal.getZ(corner)),
    );
    const face = buckets.every((bucket) => bucket === buckets[0]) ? buckets[0]! : MIXED_FACE;
    if (faces.has(face)) kept.push(...corners);
  }
  const used = new Map<number, number>();
  for (const corner of kept) if (!used.has(corner)) used.set(corner, used.size);
  for (const name of Object.keys(geometry.attributes)) {
    const attribute = geometry.getAttribute(name) as BufferAttribute;
    const compact = new BufferAttribute(
      new Float32Array(used.size * attribute.itemSize),
      attribute.itemSize,
    );
    for (const [from, to] of used) compact.copyAt(to, attribute, from);
    geometry.setAttribute(name, compact);
  }
  geometry.setIndex(kept.map((corner) => used.get(corner)!));
}

export function pieceGeometry({ part, faces }: Piece): BufferGeometry {
  const { kind, min, max, protrudes, role, shape } = part;
  const size = max.clone().sub(min);
  const center = max.clone().add(min).multiplyScalar(0.5);
  const box =
    shape?.clone() ??
    new BoxGeometry(size.x, size.y, size.z).translate(center.x, center.y, center.z);
  if (faces) keepFaces(box, faces);
  const count = box.getAttribute('position').count;
  box.setAttribute('aKind', new Float32BufferAttribute(new Array<number>(count).fill(kind), 1));
  box.setAttribute('aMin', new Float32BufferAttribute(repeat(min, count), 3));
  box.setAttribute('aMax', new Float32BufferAttribute(repeat(max, count), 3));
  box.setAttribute(
    'aProtrudes',
    new Float32BufferAttribute(new Array<number>(count).fill(protrudes ? 1 : 0), 1),
  );
  box.setAttribute(
    'aRole',
    new Float32BufferAttribute(new Array<number>(count).fill(role ?? 0), 1),
  );
  return box;
}

function repeat({ x, y, z }: Vector3, count: number): number[] {
  return Array.from({ length: count }, () => [x, y, z]).flat();
}

export type Tile = [column: number, row: number];

export function facadeGeometry(pieces: BufferGeometry[], tiles: Tile[]) {
  const merged = mergeGeometries(pieces)!;
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex(merged.index);
  for (const [name, attribute] of Object.entries(merged.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  const offsets: number[] = [];
  const tileIds: number[] = [];
  for (const [column, row] of tiles) {
    offsets.push(column * BAY, row * TILE_HEIGHT + (Math.abs(column) % 2) * STOREY, 0);
    tileIds.push(column, row);
  }
  geometry.setAttribute('aOffset', new InstancedBufferAttribute(new Float32Array(offsets), 3));
  geometry.setAttribute('aTile', new InstancedBufferAttribute(new Float32Array(tileIds), 2));
  geometry.instanceCount = tiles.length;
  return geometry;
}

export function grid(columns: number[], rows: number[]): Tile[] {
  return columns.flatMap((column) => rows.map((row): Tile => [column, row]));
}

export function storeyGeometry(
  shape: BufferGeometry,
  tiles: Tile[],
  count: number,
): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex(shape.index);
  for (const [name, attribute] of Object.entries(shape.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  const offsets: number[] = [];
  const tileIds: number[] = [];
  const storeys: number[] = [];
  const indices: number[] = [];
  for (const [column, row] of tiles) {
    for (const storey of [0, 1]) {
      for (let index = 0; index < count; index++) {
        offsets.push(column * BAY, row * TILE_HEIGHT + (Math.abs(column) % 2) * STOREY, 0);
        tileIds.push(column, row);
        storeys.push(storey);
        indices.push(index);
      }
    }
  }
  geometry.setAttribute('aOffset', new InstancedBufferAttribute(new Float32Array(offsets), 3));
  geometry.setAttribute('aTile', new InstancedBufferAttribute(new Float32Array(tileIds), 2));
  geometry.setAttribute('aStorey', new InstancedBufferAttribute(new Float32Array(storeys), 1));
  geometry.setAttribute('aIndex', new InstancedBufferAttribute(new Float32Array(indices), 1));
  geometry.instanceCount = storeys.length;
  return geometry;
}

function stack(parts: Part[], column: number): Part[] {
  const stacked: Part[] = [];
  for (let row = -1; row <= 1; row++) {
    const shift = new Vector3(column * BAY, row * TILE_HEIGHT + Math.abs(column) * STOREY, 0);
    for (const part of parts) {
      stacked.push({ ...part, min: part.min.clone().add(shift), max: part.max.clone().add(shift) });
    }
  }
  return stacked;
}

export function surroundings(parts: Part[]): Part[] {
  return [-1, 0, 1].flatMap((column) => stack(parts, column));
}

function edgeSpan(outward: number): Span {
  return outward < 0
    ? [PIER_MAX.x - EDGE_WIDTH, PIER_MAX.x]
    : [PIER_MIN.x, PIER_MIN.x + EDGE_WIDTH];
}

export function edgeVolume(outward: number) {
  const [left] = edgeSpan(outward);
  return {
    min: new Vector3(left - EDGE.margin, 0, OCCLUSION.back),
    size: new Vector3(EDGE_WIDTH + 2 * EDGE.margin, TILE_HEIGHT, OCCLUSION.front - OCCLUSION.back),
  };
}

export function edge(outward: number, windows: Part[]) {
  const [left, right] = edgeSpan(outward);
  const [inner, outer] = outward < 0 ? [right, left] : [left, right];
  const out = (distance: number) => outer + outward * distance;
  const across = (from: number, to: number): Span => (from < to ? [from, to] : [to, from]);
  const parts = [part(CONCRETE, [left, right], [0, TILE_HEIGHT], [PIER_MIN.z, PIER_MAX.z])];
  const into = (distance: number) => inner - outward * distance;
  const corners = [
    across(out(EDGE.reach - EDGE.depth), out(EDGE.reach)),
    across(inner, into(EDGE.depth)),
  ];
  for (let y = EDGE.pitch / 2; y < TILE_HEIGHT; y += EDGE.pitch) {
    const rib: Span = [y - EDGE.rib / 2, y + EDGE.rib / 2];
    parts.push(
      part(CONCRETE, across(into(EDGE.depth), out(EDGE.reach)), rib, [0, EDGE.depth]),
      ...corners.map((corner) => part(CONCRETE, corner, rib, [EDGE.behind, 0])),
    );
  }
  const around = [...stack(parts, 0), ...stack(windows, outward < 0 ? 0 : -1)];
  return { parts, around };
}

export function occluders(around: Part[]): Part[] {
  return around.filter(({ role }) => role === undefined || role === REGULAR || role === SOLID);
}

export type BakedGeometry = {
  index: Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer> | null;
  attributes: {
    name: string;
    array: Float32Array<ArrayBuffer>;
    itemSize: number;
    instanced: boolean;
  }[];
  instanceCount: number;
};

export function packGeometry(geometry: InstancedBufferGeometry): BakedGeometry {
  return {
    index: (geometry.index?.array as BakedGeometry['index']) ?? null,
    attributes: Object.entries(geometry.attributes).map(([name, attribute]) => ({
      name,
      array: attribute.array as Float32Array<ArrayBuffer>,
      itemSize: attribute.itemSize,
      instanced: 'isInstancedBufferAttribute' in attribute,
    })),
    instanceCount: geometry.instanceCount,
  };
}

export function unpackGeometry({
  index,
  attributes,
  instanceCount,
}: BakedGeometry): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry();
  if (index) geometry.setIndex(new BufferAttribute(index, 1));
  for (const { name, array, itemSize, instanced } of attributes) {
    geometry.setAttribute(
      name,
      instanced
        ? new InstancedBufferAttribute(array, itemSize)
        : new BufferAttribute(array, itemSize),
    );
  }
  geometry.instanceCount = instanceCount;
  return geometry;
}

export function occlusionTexture(openness: Uint8Array): Data3DTexture {
  const { width, height, depth } = OCCLUSION;
  const texture = new Data3DTexture(openness, width, height, depth);
  texture.format = RedFormat;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.wrapR = ClampToEdgeWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}
