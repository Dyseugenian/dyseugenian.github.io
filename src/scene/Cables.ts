import {
  BoxGeometry,
  DoubleSide,
  GLSL3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  RawShaderMaterial,
  type IUniform,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import vertexShader from '../shaders/cable.vert';
import fragmentShader from '../shaders/cable.frag';
import { TILE_HEIGHT } from './facade';

const CABLES = [
  { inset: 0.85, front: 0.04 },
  { inset: 0.95, front: 0.07 },
];

export class Cables extends Mesh<InstancedBufferGeometry, RawShaderMaterial> {
  constructor(rows: number[], uniforms: Record<string, IUniform>) {
    const pieces = CABLES.map(({ inset, front }) =>
      new BoxGeometry(0.03, TILE_HEIGHT, 0.03).translate(-inset, TILE_HEIGHT / 2, front),
    );
    const merged = mergeGeometries(pieces)!;
    for (const piece of pieces) piece.dispose();
    const geometry = new InstancedBufferGeometry();
    geometry.setIndex(merged.index);
    geometry.setAttribute('position', merged.getAttribute('position'));
    const sides = rows.flatMap(() => [-1, 1]);
    geometry.setAttribute(
      'aRow',
      new InstancedBufferAttribute(new Float32Array(rows.flatMap((row) => [row, row])), 1),
    );
    geometry.setAttribute('aSide', new InstancedBufferAttribute(new Float32Array(sides), 1));
    geometry.instanceCount = sides.length;
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
    this.frustumCulled = false;
  }
}
