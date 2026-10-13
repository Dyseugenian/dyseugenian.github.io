import { BufferGeometry, Float32BufferAttribute, SphereGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Ring = [x: number, y: number, z: number, width: number, height: number];

interface Blob {
  at: [number, number, number];
  radius: [number, number, number];
  tilt: number;
}

const PART = {
  body: 0,
  beak: 2,
  cere: 3,
  eye: 4,
  wing: 5,
  underwing: 6,
  tail: 7,
  undertail: 8,
  leg: 9,
};

const BLOBS: Blob[] = [
  { at: [0, 0.11, -0.02], radius: [0.048, 0.054, 0.092], tilt: 0.42 },
  { at: [0, 0.126, 0.038], radius: [0.046, 0.062, 0.05], tilt: 0.2 },
  { at: [0, 0.08, 0], radius: [0.041, 0.04, 0.062], tilt: 0.2 },
  { at: [0, 0.074, -0.12], radius: [0.027, 0.02, 0.06], tilt: 0.35 },
  { at: [0, 0.17, 0.058], radius: [0.03, 0.042, 0.033], tilt: -0.4 },
  { at: [0, 0.21, 0.073], radius: [0.022, 0.024, 0.03], tilt: 0.15 },
  { at: [0, 0.215, 0.084], radius: [0.018, 0.019, 0.02], tilt: 0 },
];
const BLEND = 0.016;
export type PigeonDetail = 'full' | 'distant';
type Density = {
  cell: number;
  wingSpan: number;
  wingAcross: number;
  tailAcross: number;
  tailAlong: number;
  beak: number;
  leg: number;
  toe: number;
  eye: [number, number];
};
const DENSITIES: Record<PigeonDetail, Density> = {
  full: {
    cell: 0.0084,
    wingSpan: 18,
    wingAcross: 6,
    tailAcross: 12,
    tailAlong: 4,
    beak: 8,
    leg: 7,
    toe: 6,
    eye: [10, 8],
  },
  distant: {
    cell: 0.017,
    wingSpan: 8,
    wingAcross: 3,
    tailAcross: 6,
    tailAlong: 2,
    beak: 5,
    leg: 4,
    toe: 3,
    eye: [5, 4],
  },
};
const BOUNDS = { min: new Vector3(-0.065, 0.01, -0.2), max: new Vector3(0.065, 0.255, 0.13) };
const BEAK: Ring[] = [
  [0, 0.205, 0.094, 0.0062, 0.0058],
  [0, 0.201, 0.105, 0.0038, 0.0036],
  [0, 0.194, 0.115, 0.0008, 0.001],
];
const EYE = { y: 0.213, z: 0.081, radius: 0.0048 };
const HIP = new Vector3(0.018, 0.035, 0.012);
const ANKLE = new Vector3(0.02, 0.006, 0.02);
const TOES = [
  { angle: -0.45, length: 0.026 },
  { angle: 0, length: 0.032 },
  { angle: 0.45, length: 0.025 },
  { angle: Math.PI, length: 0.018 },
];
const WING = { arm: 0.14, hand: 0.22, chord: 0.115, thickness: 0.009 };
const TAIL = { length: 0.12, base: 0.017 };

export function pigeonGeometry(detail: PigeonDetail): BufferGeometry {
  const density = DENSITIES[detail];
  const pieces = [
    body(density),
    tube(BEAK, density.beak, 2, new Vector3(0, 1, 0), PART.beak, () => 1),
    sphere(
      new Vector3(0.0058, 0.0042, 0.0075),
      new Vector3(0, 0.2065, 0.0975),
      PART.cere,
      density.eye,
    ),
    ...[1, -1].flatMap((side) => [
      sphere(
        new Vector3(EYE.radius, EYE.radius, EYE.radius),
        new Vector3(
          side * (surfaceAlong(new Vector3(0, EYE.y, EYE.z), new Vector3(1, 0, 0)) - 0.002),
          EYE.y,
          EYE.z,
        ),
        PART.eye,
        density.eye,
      ),
      wing(side, density),
      ...leg(side, density),
    ]),
    tail(density),
  ];
  const merged = mergeGeometries(pieces)!;
  for (const piece of pieces) piece.dispose();
  return merged;
}

const SHAPES = BLOBS.map(({ at, radius, tilt }) => ({
  at,
  radius,
  cos: Math.cos(tilt),
  sin: Math.sin(tilt),
}));

function distance(x: number, y: number, z: number): number {
  let field = Infinity;
  for (const { at, radius, cos, sin } of SHAPES) {
    const dy = y - at[1];
    const dz = z - at[2];
    const px = x / radius[0];
    const py = (dy * cos - dz * sin) / radius[1];
    const pz = (dy * sin + dz * cos) / radius[2];
    const k0 = Math.sqrt(px * px + py * py + pz * pz);
    const qx = px / radius[0];
    const qy = py / radius[1];
    const qz = pz / radius[2];
    const blob = (k0 * (k0 - 1)) / Math.sqrt(qx * qx + qy * qy + qz * qz);
    const h = Math.max(BLEND - Math.abs(field - blob), 0) / BLEND;
    field = Math.min(field, blob) - (h * h * BLEND) / 4;
  }
  return field;
}

function gradient(x: number, y: number, z: number): Vector3 {
  const e = 0.0004;
  return new Vector3(
    distance(x + e, y, z) - distance(x - e, y, z),
    distance(x, y + e, z) - distance(x, y - e, z),
    distance(x, y, z + e) - distance(x, y, z - e),
  ).normalize();
}

function surfaceAlong(origin: Vector3, direction: Vector3): number {
  const at = (reach: number) => origin.clone().addScaledVector(direction, reach);
  if (distance(...at(0).toArray()) > 0) return 0;
  let inside = 0;
  let outside = 0.08;
  for (let step = 0; step < 24; step++) {
    const middle = (inside + outside) / 2;
    if (distance(...at(middle).toArray()) < 0) inside = middle;
    else outside = middle;
  }
  return inside;
}

function body({ cell }: Density): BufferGeometry {
  const size = BOUNDS.max.clone().sub(BOUNDS.min);
  const [nx, ny, nz] = [size.x, size.y, size.z].map((length) => Math.ceil(length / cell) + 1) as [
    number,
    number,
    number,
  ];
  const point = (i: number, j: number, k: number) =>
    new Vector3(BOUNDS.min.x + i * cell, BOUNDS.min.y + j * cell, BOUNDS.min.z + k * cell);
  const at = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
  const field = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        field[at(i, j, k)] = distance(
          BOUNDS.min.x + i * cell,
          BOUNDS.min.y + j * cell,
          BOUNDS.min.z + k * cell,
        );
      }
    }
  }

  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((c) => [c & 1, (c >> 1) & 1, (c >> 2) & 1] as const);
  const edges = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ] as const;
  const offsets = corners.map(([a, b, c]) => at(a, b, c));
  const vertexOf = new Int32Array(nx * ny * nz).fill(-1);
  const positions: number[] = [];
  const normals: number[] = [];
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const base = at(i, j, k);
        let inside = 0;
        for (const offset of offsets) if (field[base + offset]! < 0) inside++;
        if (inside === 0 || inside === 8) continue;
        const values = offsets.map((offset) => field[base + offset]!);
        const sum = new Vector3();
        let count = 0;
        for (const [from, to] of edges) {
          const a = values[from]!;
          const b = values[to]!;
          if (a < 0 === b < 0) continue;
          const t = a / (a - b);
          const [fa, fb, fc] = corners[from]!;
          const [ta, tb, tc] = corners[to]!;
          sum.add(point(i + fa + (ta - fa) * t, j + fb + (tb - fb) * t, k + fc + (tc - fc) * t));
          count++;
        }
        const p = sum.divideScalar(count);
        for (let step = 0; step < 3; step++) {
          p.addScaledVector(gradient(p.x, p.y, p.z), -distance(p.x, p.y, p.z));
        }
        const n = gradient(p.x, p.y, p.z);
        vertexOf[at(i, j, k)] = positions.length / 3;
        positions.push(p.x, p.y, p.z);
        normals.push(n.x, n.y, n.z);
      }
    }
  }

  const index: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, inside: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (inside) index.push(a, b, c, a, c, d);
    else index.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const inside = field[at(i, j, k)]! < 0;
        if (inside !== field[at(i + 1, j, k)]! < 0) {
          quad(
            vertexOf[at(i, j - 1, k - 1)]!,
            vertexOf[at(i, j, k - 1)]!,
            vertexOf[at(i, j, k)]!,
            vertexOf[at(i, j - 1, k)]!,
            inside,
          );
        }
        if (inside !== field[at(i, j + 1, k)]! < 0) {
          quad(
            vertexOf[at(i - 1, j, k - 1)]!,
            vertexOf[at(i - 1, j, k)]!,
            vertexOf[at(i, j, k)]!,
            vertexOf[at(i, j, k - 1)]!,
            inside,
          );
        }
        if (inside !== field[at(i, j, k + 1)]! < 0) {
          quad(
            vertexOf[at(i - 1, j - 1, k)]!,
            vertexOf[at(i, j - 1, k)]!,
            vertexOf[at(i, j, k)]!,
            vertexOf[at(i - 1, j, k)]!,
            inside,
          );
        }
      }
    }
  }

  const count = positions.length / 3;
  const head: number[] = [];
  for (let v = 0; v < count; v++) {
    head.push(
      smoothstep(0.145, 0.195, positions[v * 3 + 1]!) * smoothstep(0, 0.04, positions[v * 3 + 2]!),
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute(
    'aSurface',
    new Float32BufferAttribute(new Array<number>(count * 3).fill(0), 3),
  );
  geometry.setAttribute('aHead', new Float32BufferAttribute(head, 1));
  geometry.setAttribute(
    'aPart',
    new Float32BufferAttribute(new Array<number>(count).fill(PART.body), 1),
  );
  geometry.setIndex(index);
  return unfolded(geometry);
}

function tube(
  rings: Ring[],
  segments: number,
  steps: number,
  reference: Vector3,
  part: number,
  headWeight: (ring: Ring) => number,
  side = 0,
): BufferGeometry {
  const path = smoothRings(rings, steps);
  const positions: number[] = [];
  const surface: number[] = [];
  const weights: number[] = [];
  const index: number[] = [];
  const center = (ring: Ring) => new Vector3(ring[0], ring[1], ring[2]);
  path.forEach((ring, i) => {
    const tangent = center(path[Math.min(i + 1, path.length - 1)]!)
      .sub(center(path[Math.max(i - 1, 0)]!))
      .normalize();
    const across = new Vector3().crossVectors(reference, tangent).normalize();
    const up = new Vector3().crossVectors(tangent, across);
    for (let segment = 0; segment < segments; segment++) {
      const angle = (segment / segments) * Math.PI * 2;
      const point = center(ring)
        .addScaledVector(across, Math.cos(angle) * Math.max(ring[3], 1e-4))
        .addScaledVector(up, Math.sin(angle) * Math.max(ring[4], 1e-4));
      positions.push(point.x, point.y, point.z);
      surface.push(i / (path.length - 1), segment / segments, side);
      weights.push(headWeight(ring));
    }
  });
  for (let i = 0; i < path.length - 1; i++) {
    for (let segment = 0; segment < segments; segment++) {
      const a = i * segments + segment;
      const b = i * segments + ((segment + 1) % segments);
      index.push(a, b, a + segments, b, b + segments, a + segments);
    }
  }
  for (const [ring, end] of [
    [path[0]!, 0],
    [path.at(-1)!, 1],
  ] as const) {
    const pole = positions.length / 3;
    const first = end * (path.length - 1) * segments;
    positions.push(ring[0], ring[1], ring[2]);
    surface.push(end, 0, side);
    weights.push(headWeight(ring));
    for (let segment = 0; segment < segments; segment++) {
      const a = first + segment;
      const b = first + ((segment + 1) % segments);
      if (end === 0) index.push(pole, b, a);
      else index.push(pole, a, b);
    }
  }
  return unfolded(finish(positions, surface, weights, index, part));
}

function smoothRings(rings: Ring[], steps: number): Ring[] {
  const smooth: Ring[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const before = rings[Math.max(i - 1, 0)]!;
    const from = rings[i]!;
    const to = rings[i + 1]!;
    const after = rings[Math.min(i + 2, rings.length - 1)]!;
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      smooth.push(
        from.map(
          (value, k) =>
            0.5 *
            (2 * value +
              (to[k]! - before[k]!) * t +
              (2 * before[k]! - 5 * value + 4 * to[k]! - after[k]!) * t * t +
              (3 * value - before[k]! - 3 * to[k]! + after[k]!) * t * t * t),
        ) as Ring,
      );
    }
  }
  smooth.push(rings.at(-1)!);
  return smooth;
}

function sphere(
  radius: Vector3,
  at: Vector3,
  part: number,
  [around, down]: [number, number],
): BufferGeometry {
  const shape = new SphereGeometry(1, around, down)
    .scale(radius.x, radius.y, radius.z)
    .translate(at.x, at.y, at.z);
  const count = shape.getAttribute('position').count;
  shape.deleteAttribute('uv');
  shape.setAttribute('aPart', new Float32BufferAttribute(new Array<number>(count).fill(part), 1));
  shape.setAttribute(
    'aSurface',
    new Float32BufferAttribute(new Array<number>(count * 3).fill(0), 3),
  );
  shape.setAttribute('aHead', new Float32BufferAttribute(new Array<number>(count).fill(1), 1));
  return unfolded(shape);
}

function folded(u: number, v: number, face: number, side: number): [Vector3, Vector3] {
  const wrist = WING.arm / (WING.arm + WING.hand);
  let s: number;
  let t: number;
  let layer: number;
  if (u < wrist) {
    const arm = u / wrist;
    const front = 0.03 + 0.12 * ((arm - 0.75) / 0.75) ** 2;
    s = front + (0.52 - 0.03 * arm - front) * v;
    t = 0.06 + 0.7 * arm + 0.12 * v * arm;
    layer = 0.0032;
  } else {
    const hand = (u - wrist) / (1 - wrist);
    s = 0.03 + 0.97 * hand + 0.12 * v * (1 - hand);
    t = 0.95 - 0.6 * v * (1 - 0.6 * hand);
    layer = 0.0016;
  }
  const z = 0.05 - 0.28 * s;
  const tip = smoothstep(0.75, 1, s);
  const angle = (0.2 + 1.95 * t) * (1 - 0.35 * tip);
  const axis = new Vector3(0, 0.106 + 0.3 * (z + 0.02), z);
  const direction = new Vector3(Math.sin(angle), Math.cos(angle), 0);
  const skin = axis.addScaledVector(direction, Math.max(surfaceAlong(axis, direction), 0.008));
  const n =
    Math.abs(distance(skin.x, skin.y, skin.z)) < 0.001
      ? gradient(skin.x, skin.y, skin.z)
      : direction;
  const p = skin.addScaledVector(n, face > 0 ? layer : layer - 0.0012);
  return [p.setX(side * p.x), n.setX(side * n.x).multiplyScalar(face)];
}

function wing(side: number, { wingSpan, wingAcross }: Density): BufferGeometry {
  const positions: number[] = [];
  const surface: number[] = [];
  const index: number[] = [];
  const parts: number[] = [];
  const foldedPositions: number[] = [];
  const foldedNormals: number[] = [];
  const span = WING.arm + WING.hand;
  const wrist = WING.arm / span;
  for (const face of [1, -1]) {
    const base = positions.length / 3;
    for (let i = 0; i <= wingSpan; i++) {
      const u = 1 - (1 - i / wingSpan) ** 1.3;
      const hand = Math.max((u - wrist) / (1 - wrist), 0);
      const lead = u < wrist ? 0.012 * Math.sin((Math.PI * u) / wrist) : -0.03 * hand ** 2;
      const chord =
        u < wrist ? WING.chord + 0.03 * (u / wrist) ** 2 : 0.135 * Math.sqrt(1 - hand ** 3) + 0.01;
      for (let j = 0; j <= wingAcross; j++) {
        const v = j / wingAcross;
        const crest = Math.sqrt(v);
        const thickness = WING.thickness * (1 - 0.6 * u) * 4 * crest * (1 - crest);
        const camber = 0.004 * Math.sin(Math.PI * v) * (1 - u);
        positions.push(side * u * span, camber + (face * thickness) / 2, lead - v * chord);
        surface.push(u, v, side);
        parts.push(face > 0 ? PART.wing : PART.underwing);
        const [p, n] = folded(u, v, face, side);
        foldedPositions.push(p.x, p.y, p.z);
        foldedNormals.push(n.x, n.y, n.z);
      }
    }
    const row = wingAcross + 1;
    for (let i = 0; i < wingSpan; i++) {
      for (let j = 0; j < wingAcross; j++) {
        const a = base + i * row + j;
        const quad = [a, a + row, a + 1, a + row, a + row + 1, a + 1];
        index.push(...(face * side > 0 ? quad : quad.reverse()));
      }
    }
  }
  const geometry = finish(positions, surface, new Array(parts.length).fill(0), index, parts);
  geometry.setAttribute('aFolded', new Float32BufferAttribute(foldedPositions, 3));
  geometry.setAttribute('aFoldedNormal', new Float32BufferAttribute(foldedNormals, 3));
  return geometry;
}

function tail({ tailAcross, tailAlong }: Density): BufferGeometry {
  const positions: number[] = [];
  const surface: number[] = [];
  const index: number[] = [];
  const parts: number[] = [];
  for (const face of [1, -1]) {
    const base = positions.length / 3;
    for (let i = 0; i <= tailAcross; i++) {
      const s = (i / tailAcross) * 2 - 1;
      for (let j = 0; j <= tailAlong; j++) {
        const l = j / tailAlong;
        positions.push(
          s * TAIL.base + s * 0.12 * l * TAIL.length,
          face * (0.012 + (0.006 - 0.012) * l) * (1 - s * s),
          -l * TAIL.length,
        );
        surface.push(s, l, face);
        parts.push(face > 0 ? PART.tail : PART.undertail);
      }
    }
    const row = tailAlong + 1;
    for (let i = 0; i < tailAcross; i++) {
      for (let j = 0; j < tailAlong; j++) {
        const a = base + i * row + j;
        const quad = [a, a + row, a + 1, a + row, a + row + 1, a + 1];
        index.push(...(face > 0 ? quad : quad.reverse()));
      }
    }
  }
  return unfolded(finish(positions, surface, new Array(parts.length).fill(0), index, parts));
}

function leg(side: number, { leg: legSegments, toe: toeSegments }: Density): BufferGeometry[] {
  const hip = HIP.clone().setX(side * HIP.x);
  const ankle = ANKLE.clone().setX(side * ANKLE.x);
  const toes = TOES.map(({ angle, length }) => {
    const turn = angle * side;
    const along = (reach: number, drop: number): Ring => [
      ankle.x + Math.sin(turn) * reach,
      drop,
      ankle.z + Math.cos(turn) * reach,
      0.0045 * (1 - reach / length / 2),
      0.0038 * (1 - reach / length / 2),
    ];
    return tube(
      [along(0, ankle.y), along(length * 0.6, 0.0032), along(length, 0.0014)],
      toeSegments,
      2,
      new Vector3(0, 1, 0),
      PART.leg,
      () => 0,
      side,
    );
  });
  return [
    tube(
      [
        [hip.x, hip.y, hip.z, 0.0068, 0.0068],
        [ankle.x, ankle.y, ankle.z, 0.0055, 0.0055],
      ],
      legSegments,
      3,
      new Vector3(0, 0, 1),
      PART.leg,
      () => 0,
      side,
    ),
    ...toes,
  ];
}

function finish(
  positions: number[],
  surface: number[],
  weights: number[],
  index: number[],
  part: number | number[],
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSurface', new Float32BufferAttribute(surface, 3));
  geometry.setAttribute('aHead', new Float32BufferAttribute(weights, 1));
  geometry.setAttribute(
    'aPart',
    new Float32BufferAttribute(
      Array.isArray(part) ? part : new Array<number>(weights.length).fill(part),
      1,
    ),
  );
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function unfolded(geometry: BufferGeometry): BufferGeometry {
  geometry.setAttribute('aFolded', geometry.getAttribute('position').clone());
  geometry.setAttribute('aFoldedNormal', geometry.getAttribute('normal').clone());
  return geometry;
}

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(Math.max((value - from) / (to - from), 0), 1);
  return t * t * (3 - 2 * t);
}
