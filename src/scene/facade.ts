import {
  BoxGeometry,
  BufferGeometry,
  ClampToEdgeWrapping,
  Data3DTexture,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  RedFormat,
  RepeatWrapping,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const BAY = 4.2;
export const STOREY = 3.6;
export const TILE_HEIGHT = 2 * STOREY;

const CONCRETE = 0;
const GLASS = 1;

const OCCLUSION = {
  width: 20,
  height: 40,
  depth: 24,
  reach: 1.4,
  probes: 48,
  back: -3.6,
  front: 1.6,
};

const EDGE = { rib: 0.12, pitch: 0.25, depth: 0.1, margin: 0.3 };
export const EDGE_WIDTH = 1.75;

export const OCCLUSION_MIN = new Vector3(-BAY / 2, 0, OCCLUSION.back);
export const OCCLUSION_SIZE = new Vector3(BAY, TILE_HEIGHT, OCCLUSION.front - OCCLUSION.back);

export type Part = { kind: number; min: Vector3; max: Vector3; protrudes?: boolean };

type Span = [number, number];

function part(kind: number, x: Span, y: Span, z: Span): Part {
  return {
    kind,
    min: new Vector3(x[0], y[0], z[0]),
    max: new Vector3(x[1], y[1], z[1]),
  };
}

export const PIER = part(CONCRETE, [-2.8, -1.4], [0, TILE_HEIGHT], [-3.2, 0]);
export const BLOCK = { ...part(CONCRETE, [-3.05, -1.15], [0.9, 2.7], [-1, 0.9]), protrudes: true };

export function tileParts(): Part[] {
  const parts = [PIER, BLOCK];
  for (const y of [0, STOREY]) {
    const top = y + STOREY;
    const sill = y + 0.55;
    const glassBottom = y + 1.15;
    const glassTop = y + 3.2;
    parts.push(
      part(CONCRETE, [-1.4, 1.4], [y, top], [-3.5, -3.1]),
      part(GLASS, [-1.05, 1.05], [glassBottom, glassTop], [-3.1, -3.05]),
      part(CONCRETE, [-1.4, -1.05], [sill, top], [-3.1, -2.5]),
      part(CONCRETE, [1.05, 1.4], [sill, top], [-3.1, -2.5]),
      part(CONCRETE, [-1.05, 1.05], [glassTop, top], [-3.1, -2.5]),
      part(CONCRETE, [-1.4, 1.4], [y, sill], [-3.1, -1.8]),
      part(CONCRETE, [-1.2, 1.2], [sill, glassBottom], [-3.1, -1.3]),
    );
  }
  return parts;
}

function partsGeometry(parts: Part[]): BufferGeometry {
  const boxes = parts.map(({ kind, min, max, protrudes }) => {
    const size = max.clone().sub(min);
    const center = max.clone().add(min).multiplyScalar(0.5);
    const box = new BoxGeometry(size.x, size.y, size.z).translate(center.x, center.y, center.z);
    const count = box.getAttribute('position').count;
    box.setAttribute('aKind', new Float32BufferAttribute(new Array<number>(count).fill(kind), 1));
    box.setAttribute('aMin', new Float32BufferAttribute(repeat(min, count), 3));
    box.setAttribute('aMax', new Float32BufferAttribute(repeat(max, count), 3));
    box.setAttribute(
      'aProtrudes',
      new Float32BufferAttribute(new Array<number>(count).fill(protrudes ? 1 : 0), 1),
    );
    return box;
  });
  const merged = mergeGeometries(boxes)!;
  for (const box of boxes) box.dispose();
  return merged;
}

function repeat({ x, y, z }: Vector3, count: number): number[] {
  return Array.from({ length: count }, () => [x, y, z]).flat();
}

export function facadeGeometry(parts: Part[], columns: number[], rows: number[]) {
  const merged = partsGeometry(parts);
  const geometry = new InstancedBufferGeometry();
  geometry.setIndex(merged.index);
  for (const [name, attribute] of Object.entries(merged.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  const offsets: number[] = [];
  const tiles: number[] = [];
  for (const column of columns) {
    for (const row of rows) {
      offsets.push(column * BAY, row * TILE_HEIGHT + (Math.abs(column) % 2) * STOREY, 0);
      tiles.push(column, row);
    }
  }
  geometry.setAttribute('aOffset', new InstancedBufferAttribute(new Float32Array(offsets), 3));
  geometry.setAttribute('aTile', new InstancedBufferAttribute(new Float32Array(tiles), 2));
  geometry.instanceCount = tiles.length / 2;
  return geometry;
}

function probePoints(): Vector3[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: OCCLUSION.probes }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / OCCLUSION.probes;
    const ring = Math.sqrt(1 - y * y);
    const radius = OCCLUSION.reach * Math.cbrt((index + 0.5) / OCCLUSION.probes);
    return new Vector3(
      Math.cos(golden * index) * ring,
      y,
      Math.sin(golden * index) * ring,
    ).multiplyScalar(radius);
  });
}

function stack(parts: Part[], column: number): Part[] {
  const stacked: Part[] = [];
  for (let row = -1; row <= 1; row++) {
    const shift = new Vector3(column * BAY, row * TILE_HEIGHT + Math.abs(column) * STOREY, 0);
    for (const { kind, min, max } of parts) {
      stacked.push({ kind, min: min.clone().add(shift), max: max.clone().add(shift) });
    }
  }
  return stacked;
}

export function surroundings(parts: Part[]): Part[] {
  return [-1, 0, 1].flatMap((column) => stack(parts, column));
}

export function edge(outward: number, windows: Part[]) {
  const [left, right] =
    outward < 0 ? [PIER.max.x - EDGE_WIDTH, PIER.max.x] : [PIER.min.x, PIER.min.x + EDGE_WIDTH];
  const outer = outward < 0 ? left : right;
  const parts = [part(CONCRETE, [left, right], [0, TILE_HEIGHT], [PIER.min.z, PIER.max.z])];
  for (let x = left + EDGE.pitch / 2; x < right; x += EDGE.pitch) {
    parts.push(
      part(CONCRETE, [x - EDGE.rib / 2, x + EDGE.rib / 2], [0, TILE_HEIGHT], [0, EDGE.depth]),
    );
  }
  for (let z = PIER.min.z + EDGE.pitch / 2; z < 0; z += EDGE.pitch) {
    const flank: Span = outward < 0 ? [outer - EDGE.depth, outer] : [outer, outer + EDGE.depth];
    parts.push(part(CONCRETE, flank, [0, TILE_HEIGHT], [z - EDGE.rib / 2, z + EDGE.rib / 2]));
  }
  const min = new Vector3(left - EDGE.margin, 0, OCCLUSION.back);
  const size = new Vector3(
    EDGE_WIDTH + 2 * EDGE.margin,
    TILE_HEIGHT,
    OCCLUSION.front - OCCLUSION.back,
  );
  const around = [...stack(parts, 0), ...stack(windows, outward < 0 ? 0 : -1)];
  return { parts, min, size, occlusion: bakeOcclusion(around, min, size) };
}

function contains({ min, max }: Part, point: Vector3): boolean {
  return (
    point.x > min.x &&
    point.x < max.x &&
    point.y > min.y &&
    point.y < max.y &&
    point.z > min.z &&
    point.z < max.z
  );
}

export function bakeOcclusion(
  around: Part[],
  corner = OCCLUSION_MIN,
  extent = OCCLUSION_SIZE,
): Data3DTexture {
  const { width, height, depth } = OCCLUSION;
  const probes = probePoints();
  const openness = new Uint8Array(width * height * depth);
  const cell = new Vector3();
  const sample = new Vector3();
  for (let z = 0; z < depth; z++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        cell
          .set((x + 0.5) / width, (y + 0.5) / height, (z + 0.5) / depth)
          .multiply(extent)
          .add(corner);
        const near = around.filter(
          ({ min, max }) =>
            cell.x > min.x - OCCLUSION.reach &&
            cell.x < max.x + OCCLUSION.reach &&
            cell.y > min.y - OCCLUSION.reach &&
            cell.y < max.y + OCCLUSION.reach &&
            cell.z > min.z - OCCLUSION.reach &&
            cell.z < max.z + OCCLUSION.reach,
        );
        let open = 0;
        for (const probe of probes) {
          sample.addVectors(cell, probe);
          if (!near.some((solid) => contains(solid, sample))) open++;
        }
        openness[x + width * (y + height * z)] = Math.round((255 * open) / probes.length);
      }
    }
  }
  const texture = new Data3DTexture(openness, width, height, depth);
  texture.format = RedFormat;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.wrapR = ClampToEdgeWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}
