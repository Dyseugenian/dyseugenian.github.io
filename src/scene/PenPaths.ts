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
import { PEN, type PenPath } from './penPath';

const ANCHOR = 0;
const NIB = 1;

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
      GUIDES_FADE: PEN.guidesFade.toFixed(3),
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

    const lines = { position: [] as number[], timing: [] as number[], segment: [] as number[] };
    const marks = { position: [] as number[], timing: [] as number[] };
    const addLine = (point: { x: number; y: number }, timing: number[], segment: number[]) => {
      lines.position.push(point.x, -point.y, 0);
      lines.timing.push(...timing);
      lines.segment.push(...segment);
    };
    const addMark = (point: { x: number; y: number }, timing: number[]) => {
      marks.position.push(point.x, -point.y, 0);
      marks.timing.push(...timing);
    };

    for (const path of paths) {
      path.points.forEach((point, i) => {
        if (!point.drawn) return;
        const previous = path.points[i - 1]!;
        const timing = [previous.arrival, point.arrival, path.guidesFade];
        addLine(previous, timing, [0, previous.slope, point.slope]);
        addLine(point, timing, [1, previous.slope, point.slope]);
      });
      for (const anchor of path.anchors) {
        addMark(anchor, [anchor.arrival, path.guidesFade, ANCHOR]);
      }
    }
    for (const path of paths) {
      const [x, y] = path.start;
      addMark({ x, y }, [0, path.drawEnd, NIB]);
    }

    const lineGeometry = new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute(lines.position, 3))
      .setAttribute('aTiming', new Float32BufferAttribute(lines.timing, 3))
      .setAttribute('aSegment', new Float32BufferAttribute(lines.segment, 3));
    const markGeometry = new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute(marks.position, 3))
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
