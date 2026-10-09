import {
  BufferGeometry,
  DynamicDrawUsage,
  DoubleSide,
  Float32BufferAttribute,
  GLSL3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  RawShaderMaterial,
  Vector3,
  type IUniform,
} from 'three';
import vertexShader from '../shaders/rebar.vert';
import fragmentShader from '../shaders/rebar.frag';
import type { Part } from './facade';

const PATCH = 0.6;
const BARS = 4;
const SIDES = 8;
const RINGS = 8;
const TILE_SEEDS = 4096;
const SPALL = { spacings: [1.4, 3.8], chances: [0.4, 0.3], exposed: 0.6, smallest: 0.12 };
const STICKING_OUT = [0.7, 0.4];
const LIFT = 0.02;
const FACES = [
  new Vector3(0, 0, 1),
  new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, -1, 0),
];

export type RebarTiles = { parts: Part[]; around: Part[]; columns: number[] };

type Patch = { part: Part; normal: Vector3; right: Vector3; up: Vector3; bounds: number[] };

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
        patches.push({ part, normal, right, up, bounds: [u[0]!, v[0]!, u[1]!, v[1]!] });
      }
    }
    return patches;
  });
}

function tube(): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const columns = SIDES + 1;
  for (let ring = 0; ring < RINGS; ring++) {
    for (let side = 0; side < columns; side++) positions.push(side / SIDES, ring, 0);
  }
  for (let ring = 0; ring < RINGS - 1; ring++) {
    for (let side = 0; side < SIDES; side++) {
      const a = ring * columns + side;
      indices.push(a, a + 1, a + columns, a + 1, a + 1 + columns, a + columns);
    }
  }
  const tip = positions.length / 3;
  positions.push(0, RINGS - 1, 1);
  for (let side = 0; side < SIDES; side++) {
    const last = (RINGS - 1) * columns;
    indices.push(last + side, tip, last + side + 1);
  }
  return new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute(positions, 3))
    .setIndex(indices);
}

function fract(x: number): number {
  return x - Math.floor(x);
}

function hash12(x: number, y: number): number {
  const a = fract(x * 0.1031);
  const b = fract(y * 0.1031);
  const shift = a * (b + 33.33) + b * (a + 33.33) + a * (a + 33.33);
  return fract((a + shift + b + shift) * (a + shift));
}

function exposedSpall(u: number, v: number, seedU: number, seedV: number, layer: number): number {
  const spacing = SPALL.spacings[layer]!;
  const cellU = Math.floor((u + seedU) / spacing) + layer * 113;
  const cellV = Math.floor((v + seedV) / spacing) + layer * 113;
  if (hash12(cellU + 41, cellV + 41) > SPALL.chances[layer]!) return -1;
  const size = spacing * (0.04 + 0.2 * hash12(cellU + 43, cellV + 43) ** 1.7);
  if (hash12(cellU + 47, cellV + 47) < SPALL.exposed || size < SPALL.smallest) return -1;
  return Math.floor(hash12(cellU + 53, cellV + 53) * 512);
}

function stickingBars(patches: Patch[], column: number, row: number): number[] {
  const seedU = hash12(column, row) * 97;
  const seedV = hash12(column + 1.7, row + 1.7) * 97;
  const bars: number[] = [];
  patches.forEach(({ bounds }, index) => {
    const u = 0.5 * (bounds[0]! + bounds[2]!);
    const v = 0.5 * (bounds[1]! + bounds[3]!);
    for (let layer = 0; layer < 2; layer++) {
      const key = exposedSpall(u, v, seedU, seedV, layer);
      if (key < 0) continue;
      for (let bar = 0; bar < 2; bar++) {
        if (hash12(key, 71 + 13 * bar) <= STICKING_OUT[bar]!)
          bars.push(index * BARS + layer * 2 + bar);
      }
    }
  });
  return bars;
}

const ATTRIBUTES = [
  ['aTile', 2],
  ['aLow', 3],
  ['aHigh', 3],
  ['aNormal', 3],
  ['aRight', 3],
  ['aUp', 3],
  ['aPatch', 4],
  ['aBar', 1],
  ['aProtrudes', 1],
] as const;

type Block = { group: number; column: number; row: number; patches: Patch[] };

export class Rebar extends Mesh<InstancedBufferGeometry, RawShaderMaterial> {
  private blocks: Block[] = [];
  private sticking = new Map<number, number[]>();

  constructor(groups: RebarTiles[], rows: number[], uniforms: Record<string, IUniform>) {
    const shape = tube();
    const geometry = new InstancedBufferGeometry();
    geometry.setIndex(shape.index);
    geometry.setAttribute('position', shape.getAttribute('position'));
    super(
      geometry,
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms,
        side: DoubleSide,
      }),
    );
    groups.forEach(({ parts, around, columns }, group) => {
      const patches = parts.flatMap((part) => exposedPatches(part, around));
      for (const column of columns) {
        for (const row of rows) this.blocks.push({ group, column, row, patches });
      }
    });
    const capacity = this.blocks.reduce((sum, { patches }) => sum + patches.length * BARS, 0);
    for (const [name, size] of ATTRIBUTES) {
      const attribute = new InstancedBufferAttribute(new Float32Array(capacity * size), size);
      attribute.setUsage(DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
    }
    this.frustumCulled = false;
    this.climb(0);
  }

  climb(tilesClimbed: number): void {
    const attributes = ATTRIBUTES.map(
      ([name]) => this.geometry.getAttribute(name) as InstancedBufferAttribute,
    );
    const sticking = new Map<number, number[]>();
    let count = 0;
    for (const { group, column, row, patches } of this.blocks) {
      const tileRow = (row + tilesClimbed + TILE_SEEDS) % TILE_SEEDS;
      const key = (group * 16 + column + 8) * TILE_SEEDS + tileRow;
      const bars = this.sticking.get(key) ?? stickingBars(patches, column, tileRow);
      sticking.set(key, bars);
      for (const bar of bars) {
        const { part, normal, right, up, bounds } = patches[Math.floor(bar / BARS)]!;
        const values = [
          [column, row],
          part.min.toArray(),
          part.max.toArray(),
          normal.toArray(),
          right.toArray(),
          up.toArray(),
          bounds,
          [bar % BARS],
          [part.protrudes ? 1 : 0],
        ];
        values.forEach((value, index) => {
          (attributes[index]!.array as Float32Array).set(value, count * value.length);
        });
        count++;
      }
    }
    this.sticking = sticking;
    for (const attribute of attributes) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
    this.geometry.instanceCount = count;
  }
}
