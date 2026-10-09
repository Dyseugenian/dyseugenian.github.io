import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  ConeGeometry,
  CustomBlending,
  Float32BufferAttribute,
  GLSL3,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  RawShaderMaterial,
  SphereGeometry,
  type IUniform,
  type ShaderMaterialParameters,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import vapourVertex from '../shaders/vapour.vert';
import vapourFragment from '../shaders/vapour.frag';
import leakVertex from '../shaders/leak.vert';
import leakFragment from '../shaders/leak.frag';
import motesVertex from '../shaders/motes.vert';
import motesFragment from '../shaders/motes.frag';
import pigeonVertex from '../shaders/pigeon.vert';
import pigeonFragment from '../shaders/pigeon.frag';
import { storeyGeometry } from './facade';

const PUFFS = 16;
const LEAK_PIECES = 4;
const MOTES = 12;
const PIGEONS = 2;

const LAYERED: ShaderMaterialParameters = {
  blending: CustomBlending,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
  transparent: true,
  depthWrite: false,
};

function pigeon(): BufferGeometry {
  const head = [
    new SphereGeometry(0.034, 8, 6).scale(1, 1, 1.15).translate(0, 0.215, 0.1),
    new ConeGeometry(0.008, 0.026, 5).rotateX(Math.PI / 2).translate(0, 0.21, 0.143),
  ];
  const body = [
    new SphereGeometry(0.1, 12, 8).scale(0.68, 0.66, 1.35).rotateX(-0.3).translate(0, 0.1, -0.01),
    new SphereGeometry(0.06, 10, 7).translate(0, 0.14, 0.065),
    new BoxGeometry(0.07, 0.01, 0.12).rotateX(-0.2).translate(0, 0.07, -0.17),
  ];
  const pieces = [...head, ...body];
  pieces.forEach((piece, index) => {
    const count = piece.getAttribute('position').count;
    const flag = index < head.length ? 1 : 0;
    piece.setAttribute('aHead', new Float32BufferAttribute(new Array<number>(count).fill(flag), 1));
    piece.deleteAttribute('uv');
  });
  const merged = mergeGeometries(pieces)!;
  for (const piece of pieces) piece.dispose();
  return merged;
}

export function traces(
  columns: number[],
  rows: number[],
  uniforms: Record<string, IUniform>,
): Mesh[] {
  const quad = new PlaneGeometry(1, 1);
  const layers: [BufferGeometry, number, string, string, ShaderMaterialParameters][] = [
    [quad, PUFFS, vapourVertex, vapourFragment, LAYERED],
    [quad, LEAK_PIECES, leakVertex, leakFragment, LAYERED],
    [quad, MOTES, motesVertex, motesFragment, { ...LAYERED, blending: AdditiveBlending }],
    [pigeon(), PIGEONS, pigeonVertex, pigeonFragment, {}],
  ];
  return layers.map(([shape, count, vertexShader, fragmentShader, options]) => {
    const mesh = new Mesh(
      storeyGeometry(shape, columns, rows, count),
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms,
        ...options,
      }),
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return mesh;
  });
}
