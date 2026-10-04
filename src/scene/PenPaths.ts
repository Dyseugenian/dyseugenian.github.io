import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  GLSL3,
  Group,
  LineSegments,
  Points,
  RawShaderMaterial,
  type IUniform,
} from 'three';
import lineVertexShader from '../shaders/pen-lines.vert';
import lineFragmentShader from '../shaders/pen-lines.frag';
import markVertexShader from '../shaders/pen-marks.vert';
import markFragmentShader from '../shaders/pen-marks.frag';
import type { Loop } from './letterOutline';

export const PEN = {
  hollow: 0.15,
  drawStart: 0.2,
  stagger: 0.06,
  drawDuration: 1.2,
  liftWeight: 0.4,
  handleLength: 9,
  linger: 0.35,
  grow: 0.08,
  floodDuration: 0.7,
  floodReach: 240,
  floodSoft: 110,
  guidesFade: 2.55,
  guidesEnd: 2.95,
};

const STROKE = 0;
const ANCHOR = 0;
const HANDLE = 1;
const NIB = 2;

interface PenPoint {
  x: number;
  y: number;
  arrival: number;
  drawn: boolean;
  slope: number;
}

export interface PenPath {
  points: PenPoint[];
  anchors: { x: number; y: number; arrival: number; tangentX: number; tangentY: number }[];
  start: [number, number];
  drawEnd: number;
}

export function timePath(loops: Loop[], drawStart: number): PenPath {
  const length = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  let total = 0;
  loops.forEach((loop, index) => {
    if (index > 0) total += length(loops[index - 1]![0]!, loop[0]!) * PEN.liftWeight;
    loop.forEach((point, i) => (total += length(point, loop[(i + 1) % loop.length]!)));
  });
  const speed = total / PEN.drawDuration;

  const path: PenPath = { points: [], anchors: [], start: loops[0]![0]!, drawEnd: drawStart };
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
      const tangent = [next[0] - previous[0], next[1] - previous[1]] as const;
      const tangentLength = Math.hypot(...tangent) || 1;
      path.points.push({
        x: point[0],
        y: point[1],
        arrival: time,
        drawn: i > 0,
        slope: i > 0 ? Math.max(turn, 0) : 0,
      });
      path.anchors.push({
        x: point[0],
        y: point[1],
        arrival: time,
        tangentX: tangent[0] / tangentLength,
        tangentY: tangent[1] / tangentLength,
      });
      time += length(point, next) / speed;
    });
    path.points.push({ x: loop[0]![0], y: loop[0]![1], arrival: time, drawn: true, slope: 0 });
  });
  path.drawEnd = time;
  return path;
}

function hermite(progress: number, startSlope: number, endSlope: number): number {
  const p = Math.min(Math.max(progress, 0), 1);
  const p2 = p * p;
  const p3 = p2 * p;
  return (p3 - 2 * p2 + p) * startSlope + 3 * p2 - 2 * p3 + (p3 - p2) * endSlope;
}

export class PenPaths extends Group {
  private nibs: BufferAttribute;

  constructor(
    private paths: PenPath[],
    uniforms: Record<string, IUniform>,
  ) {
    super();
    const defines = {
      LINGER: PEN.linger.toFixed(3),
      GROW: PEN.grow.toFixed(3),
      GUIDES_FADE: PEN.guidesFade.toFixed(3),
      GUIDES_END: PEN.guidesEnd.toFixed(3),
    };
    const material = (vertexShader: string, fragmentShader: string) =>
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms,
        defines,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });

    const lines = {
      position: [] as number[],
      anchor: [] as number[],
      timing: [] as number[],
      segment: [] as number[],
    };
    const marks = { position: [] as number[], anchor: [] as number[], timing: [] as number[] };
    const addLine = (
      point: { x: number; y: number },
      anchor: { x: number; y: number },
      timing: number[],
      segment: number[],
    ) => {
      lines.position.push(point.x, -point.y, 0);
      lines.anchor.push(anchor.x, -anchor.y);
      lines.timing.push(...timing);
      lines.segment.push(...segment);
    };
    const addMark = (
      point: { x: number; y: number },
      anchor: { x: number; y: number },
      timing: number[],
    ) => {
      marks.position.push(point.x, -point.y, 0);
      marks.anchor.push(anchor.x, -anchor.y);
      marks.timing.push(...timing);
    };

    for (const path of paths) {
      path.points.forEach((point, i) => {
        if (!point.drawn) return;
        const previous = path.points[i - 1]!;
        const timing = [previous.arrival, point.arrival, STROKE];
        addLine(previous, previous, timing, [0, previous.slope, point.slope]);
        addLine(point, point, timing, [1, previous.slope, point.slope]);
      });
      for (const anchor of path.anchors) {
        const handleTiming = [anchor.arrival, anchor.arrival, HANDLE];
        for (const side of [1, -1]) {
          const end = {
            x: anchor.x + anchor.tangentX * PEN.handleLength * side,
            y: anchor.y + anchor.tangentY * PEN.handleLength * side,
          };
          addLine(anchor, anchor, handleTiming, [0, 0, 0]);
          addLine(end, anchor, handleTiming, [0, 0, 0]);
          addMark(end, anchor, [anchor.arrival, anchor.arrival + PEN.linger, HANDLE]);
        }
        addMark(anchor, anchor, [anchor.arrival, PEN.guidesEnd, ANCHOR]);
      }
    }
    for (const path of paths) {
      const [x, y] = path.start;
      addMark({ x, y }, { x, y }, [0, path.drawEnd, NIB]);
    }

    const lineGeometry = new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute(lines.position, 3))
      .setAttribute('aAnchor', new Float32BufferAttribute(lines.anchor, 2))
      .setAttribute('aTiming', new Float32BufferAttribute(lines.timing, 3))
      .setAttribute('aSegment', new Float32BufferAttribute(lines.segment, 3));
    const markGeometry = new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute(marks.position, 3))
      .setAttribute('aAnchor', new Float32BufferAttribute(marks.anchor, 2))
      .setAttribute('aTiming', new Float32BufferAttribute(marks.timing, 3));
    const strokes = new LineSegments(lineGeometry, material(lineVertexShader, lineFragmentShader));
    const points = new Points(markGeometry, material(markVertexShader, markFragmentShader));
    for (const part of [strokes, points]) {
      part.frustumCulled = false;
      part.renderOrder = 1;
    }
    this.add(strokes, points);
    this.nibs = markGeometry.getAttribute('position') as BufferAttribute;
  }

  update(time: number): void {
    const firstNib = this.nibs.count - this.paths.length;
    this.paths.forEach((path, index) => {
      const { points } = path;
      let i = 1;
      while (i < points.length - 1 && points[i]!.arrival < time) i++;
      const from = points[i - 1]!;
      const to = points[i]!;
      const along = hermite(
        (time - from.arrival) / (to.arrival - from.arrival || 1),
        to.drawn ? from.slope : 0,
        to.drawn ? to.slope : 0,
      );
      this.nibs.setXYZ(
        firstNib + index,
        from.x + (to.x - from.x) * along,
        -(from.y + (to.y - from.y) * along),
        0,
      );
    });
    this.nibs.needsUpdate = true;
  }
}
