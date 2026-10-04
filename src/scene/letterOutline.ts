import { CLOSE_RADIUS, closeHoles } from './digitLayout';

const MIN_PERIMETER = 40;
const TOLERANCE = 1.5;
const SIDES = [
  { dx: 0, dy: -1, from: [0, 0], to: [1, 0] },
  { dx: 1, dy: 0, from: [1, 0], to: [1, 1] },
  { dx: 0, dy: 1, from: [1, 1], to: [0, 1] },
  { dx: -1, dy: 0, from: [0, 1], to: [0, 0] },
] as const;

export type Loop = [number, number][];

export function traceOutline(columns: number[], rows: number[]): Loop[] {
  const pad = CLOSE_RADIUS + 1;
  const left = Math.min(...columns) - pad;
  const top = Math.min(...rows) - pad;
  const width = Math.max(...columns) - left + 1 + pad;
  const height = Math.max(...rows) - top + 1 + pad;
  const inside = new Uint8Array(width * height);
  columns.forEach((column, i) => (inside[(rows[i]! - top) * width + column - left] = 1));
  const solid = closeHoles(inside, width, height);
  const isSolid = (x: number, y: number) =>
    x >= 0 && x < width && y >= 0 && y < height && solid[y * width + x] === 1;

  const edges: number[][] = [];
  const outgoing = new Map<number, number[]>();
  const vertex = (x: number, y: number) => y * (width + 1) + x;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isSolid(x, y)) continue;
      for (const side of SIDES) {
        if (isSolid(x + side.dx, y + side.dy)) continue;
        const edge = [x + side.from[0], y + side.from[1], x + side.to[0], y + side.to[1]];
        const start = vertex(edge[0]!, edge[1]!);
        outgoing.set(start, [...(outgoing.get(start) ?? []), edges.length]);
        edges.push(edge);
      }
    }
  }

  const used = new Uint8Array(edges.length);
  const loops: Loop[] = [];
  for (let first = 0; first < edges.length; first++) {
    if (used[first]) continue;
    const points: Loop = [];
    let edge = first;
    while (!used[edge]) {
      used[edge] = 1;
      const [fromX, fromY, toX, toY] = edges[edge]! as [number, number, number, number];
      points.push([left + fromX, top + fromY]);
      const turn = (candidate: number) => {
        const [, , nextX, nextY] = edges[candidate]!;
        return (toX - fromX) * (nextY! - toY) - (toY - fromY) * (nextX! - toX);
      };
      const next = (outgoing.get(vertex(toX, toY)) ?? []).filter((candidate) => !used[candidate]);
      if (next.length === 0) break;
      edge = next.reduce((best, candidate) => (turn(candidate) > turn(best) ? candidate : best));
    }
    if (perimeter(points) >= MIN_PERIMETER) loops.push(simplify(points));
  }
  loops.sort((a, b) => perimeter(b) - perimeter(a));
  return orderLoops(loops);
}

function perimeter(loop: Loop): number {
  return loop.reduce((sum, point, i) => {
    const next = loop[(i + 1) % loop.length]!;
    return sum + Math.hypot(next[0] - point[0], next[1] - point[1]);
  }, 0);
}

function simplify(loop: Loop): Loop {
  const far = loop.reduce(
    (best, point, i) =>
      Math.hypot(point[0] - loop[0]![0], point[1] - loop[0]![1]) >
      Math.hypot(loop[best]![0] - loop[0]![0], loop[best]![1] - loop[0]![1])
        ? i
        : best,
    0,
  );
  const there = reduceLine([...loop.slice(0, far + 1)]);
  const back = reduceLine([...loop.slice(far), loop[0]!]);
  return [...there.slice(0, -1), ...back.slice(0, -1)];
}

function reduceLine(line: Loop): Loop {
  if (line.length < 3) return line;
  const [ax, ay] = line[0]!;
  const [bx, by] = line[line.length - 1]!;
  const length = Math.hypot(bx - ax, by - ay) || 1;
  let farthest = 0;
  let split = 0;
  for (let i = 1; i < line.length - 1; i++) {
    const [px, py] = line[i]!;
    const distance = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length;
    if (distance > farthest) {
      farthest = distance;
      split = i;
    }
  }
  if (farthest <= TOLERANCE) return [line[0]!, line[line.length - 1]!];
  return [...reduceLine(line.slice(0, split + 1)).slice(0, -1), ...reduceLine(line.slice(split))];
}

function orderLoops(loops: Loop[]): Loop[] {
  let pen: [number, number] = [-Infinity, -Infinity];
  return loops.map((loop, index) => {
    const start = loop.reduce((best, point, i) => {
      const score = (p: [number, number]) =>
        index === 0 ? p[1] * 4 + p[0] : Math.hypot(p[0] - pen[0], p[1] - pen[1]);
      return score(point) < score(loop[best]!) ? i : best;
    }, 0);
    const ordered = [...loop.slice(start), ...loop.slice(0, start)];
    pen = ordered[0]!;
    return ordered;
  });
}
