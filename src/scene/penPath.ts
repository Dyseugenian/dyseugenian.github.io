import type { Loop } from './letterOutline';

export const PEN = {
  hollow: 0.15,
  drawStart: 0.2,
  stagger: 0.06,
  drawDuration: 1.2,
  liftWeight: 0.4,
  linger: 0.35,
  floodDuration: 0.7,
  floodReach: 240,
  floodSoft: 60,
  anchorSpan: 12,
  guidesDelay: 0.3,
  guidesFade: 0.4,
};

interface PenPoint {
  x: number;
  y: number;
  arrival: number;
  drawn: boolean;
  slope: number;
}

export interface PenPath {
  points: PenPoint[];
  anchors: { x: number; y: number; arrival: number }[];
  start: [number, number];
  drawEnd: number;
  guidesFade: number;
}

export function timePath(loops: Loop[], drawStart: number): PenPath {
  const length = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  let total = 0;
  loops.forEach((loop, index) => {
    if (index > 0) total += length(loops[index - 1]![0]!, loop[0]!) * PEN.liftWeight;
    loop.forEach((point, i) => (total += length(point, loop[(i + 1) % loop.length]!)));
  });
  const speed = total / PEN.drawDuration;

  const path: PenPath = {
    points: [],
    anchors: [],
    start: loops[0]![0]!,
    drawEnd: drawStart,
    guidesFade: drawStart,
  };
  let time = drawStart;
  loops.forEach((loop, index) => {
    if (index > 0) time += (length(loops[index - 1]![0]!, loop[0]!) * PEN.liftWeight) / speed;
    loop.forEach((point, i) => {
      const previous = loop[(i + loop.length - 1) % loop.length]!;
      const next = loop[(i + 1) % loop.length]!;
      const incoming = [point[0] - previous[0], point[1] - previous[1]] as const;
      const outgoing = [next[0] - point[0], next[1] - point[1]] as const;
      const turn =
        (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) /
        (Math.hypot(...incoming) * Math.hypot(...outgoing) || 1);
      path.points.push({
        x: point[0],
        y: point[1],
        arrival: time,
        drawn: i > 0,
        slope: i > 0 ? Math.max(turn, 0) : 0,
      });
      if (Math.max(Math.hypot(...incoming), Math.hypot(...outgoing)) >= PEN.anchorSpan) {
        path.anchors.push({ x: point[0], y: point[1], arrival: time });
      }
      time += length(point, next) / speed;
    });
    path.points.push({ x: loop[0]![0], y: loop[0]![1], arrival: time, drawn: true, slope: 0 });
  });
  path.drawEnd = time;
  path.guidesFade = time + PEN.guidesDelay;
  return path;
}
