import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  BufferGeometry,
  CustomBlending,
  GLSL3,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  RingGeometry,
  RawShaderMaterial,
  type IUniform,
  type ShaderMaterialParameters,
} from 'three';
import vapourVertex from '../shaders/vapour.vert';
import vapourFragment from '../shaders/vapour.frag';
import leakVertex from '../shaders/leak.vert';
import leakFragment from '../shaders/leak.frag';
import motesVertex from '../shaders/motes.vert';
import motesFragment from '../shaders/motes.frag';
import pigeonVertex from '../shaders/pigeon.vert';
import pigeonFragment from '../shaders/pigeon.frag';
import wireVertex from '../shaders/wire.vert';
import wireFragment from '../shaders/wire.frag';
import fastenerVertex from '../shaders/fastener.vert';
import fastenerFragment from '../shaders/fastener.frag';
import spoutVertex from '../shaders/spout.vert';
import spoutFragment from '../shaders/spout.frag';
import spoutDripVertex from '../shaders/spout-drip.vert';
import ductVertex from '../shaders/duct.vert';
import ductFittingVertex from '../shaders/duct-fitting.vert';
import ductFragment from '../shaders/duct.frag';
import grilleVertex from '../shaders/grille.vert';
import grilleFragment from '../shaders/grille.frag';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { storeyGeometry } from './facade';

const PUFFS = 16;
const LEAK_PIECES = 4;
const MOTES = 12;
const PIGEONS = 3;
const WIRES = 13;
const WIRE_SEGMENTS = 128;
const FASTENERS = 8;
const SPOUT_DROPS = 8;
const SPOUT_RINGS = 96;
const DUCT_RINGS = 36;
const GRILLE_BARS = 23;
const GRILLE_SEGMENTS = 8;

const LAYERED: ShaderMaterialParameters = {
  blending: CustomBlending,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
  transparent: true,
  depthWrite: false,
};

export function traces(
  columns: number[],
  rows: number[],
  uniforms: Record<string, IUniform>,
): Mesh[] {
  const quad = new PlaneGeometry(1, 1);
  const layers: [number, string, string, ShaderMaterialParameters][] = [
    [PUFFS, vapourVertex, vapourFragment, LAYERED],
    [LEAK_PIECES, leakVertex, leakFragment, LAYERED],
    [MOTES, motesVertex, motesFragment, { ...LAYERED, blending: AdditiveBlending }],
  ];
  const meshes = layers.map(([count, vertexShader, fragmentShader, options]) =>
    instanced(
      storeyGeometry(quad, columns, rows, count),
      vertexShader,
      fragmentShader,
      uniforms,
      options,
    ),
  );
  const ribbon = new PlaneGeometry(1, 1, 1, WIRE_SEGMENTS);
  meshes.push(
    instanced(
      storeyGeometry(ribbon, columns, rows, WIRES),
      wireVertex,
      wireFragment,
      uniforms,
      LAYERED,
    ),
    instanced(
      storeyGeometry(new BoxGeometry(1, 1, 1), columns, rows, WIRES * FASTENERS),
      fastenerVertex,
      fastenerFragment,
      uniforms,
      {},
    ),
  );
  return meshes;
}

export function pigeons(
  columns: number[],
  rows: number[],
  uniforms: Record<string, IUniform>,
): Mesh {
  const geometry = storeyGeometry(new BufferGeometry(), columns, rows, PIGEONS);
  return instanced(geometry, pigeonVertex, pigeonFragment, uniforms, {});
}

export function spouts(
  columns: number[],
  rows: number[],
  uniforms: Record<string, IUniform>,
): Mesh[] {
  const pieces = [
    new CylinderGeometry(1, 1, 1, 16, SPOUT_RINGS, true).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    new CylinderGeometry(1.35, 1.35, 0.03, 16).rotateX(Math.PI / 2).translate(0, 0, 0.015),
    new CylinderGeometry(1.1, 1.1, 0.06, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.03),
    new RingGeometry(1, 1.1, 16),
  ].map((piece, index) => {
    const part = Math.min(index, 2);
    const plain = piece.toNonIndexed();
    plain.deleteAttribute('uv');
    const count = plain.getAttribute('position').count;
    plain.setAttribute('aPart', new Float32BufferAttribute(new Float32Array(count).fill(part), 1));
    return plain;
  });
  const shape = mergeGeometries(pieces)!;
  for (const piece of pieces) piece.dispose();
  const spout = instanced(
    storeyGeometry(shape, columns, rows, 1),
    spoutVertex,
    spoutFragment,
    uniforms,
    { side: DoubleSide },
  );
  spout.renderOrder = 1;
  const drips = instanced(
    storeyGeometry(new PlaneGeometry(1, 1), columns, rows, SPOUT_DROPS),
    spoutDripVertex,
    leakFragment,
    uniforms,
    LAYERED,
  );
  return [spout, drips];
}

export function ducts(
  columns: number[],
  rows: number[],
  uniforms: Record<string, IUniform>,
): Mesh[] {
  const duct = instanced(
    storeyGeometry(new CylinderGeometry(1, 1, 1, 24, DUCT_RINGS, true), columns, rows, 2),
    ductVertex,
    ductFragment,
    uniforms,
    {},
  );
  const pieces = [
    new CylinderGeometry(1, 1, 1, 24, 1, true),
    new BoxGeometry(1, 1, 1),
    new BoxGeometry(1, 1, 1),
    new RingGeometry(1, 1.35, 24),
  ].map((piece, part) => {
    const plain = piece.toNonIndexed();
    plain.deleteAttribute('uv');
    const count = plain.getAttribute('position').count;
    plain.setAttribute('aPart', new Float32BufferAttribute(new Float32Array(count).fill(part), 1));
    return plain;
  });
  const shape = mergeGeometries(pieces)!;
  for (const piece of pieces) piece.dispose();
  const fittings = instanced(
    storeyGeometry(shape, columns, rows, 3),
    ductFittingVertex,
    ductFragment,
    uniforms,
    {},
  );
  return [duct, fittings];
}

export function grilles(
  columns: number[],
  rows: number[],
  uniforms: Record<string, IUniform>,
): Mesh {
  return instanced(
    storeyGeometry(new BoxGeometry(1, 1, 1, 1, GRILLE_SEGMENTS, 1), columns, rows, GRILLE_BARS),
    grilleVertex,
    grilleFragment,
    uniforms,
    {},
  );
}

function instanced(
  geometry: BufferGeometry,
  vertexShader: string,
  fragmentShader: string,
  uniforms: Record<string, IUniform>,
  options: ShaderMaterialParameters,
): Mesh {
  const mesh = new Mesh(
    geometry,
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
}
