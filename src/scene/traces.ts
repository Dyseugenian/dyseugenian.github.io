import {
  AdditiveBlending,
  CustomBlending,
  DoubleSide,
  DstColorFactor,
  GLSL3,
  type InstancedBufferGeometry,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RawShaderMaterial,
  type IUniform,
  type ShaderMaterialParameters,
  SrcColorFactor,
  ZeroFactor,
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
import boardVertex from '../shaders/board.vert';
import boardFragment from '../shaders/board.frag';
import rungVertex from '../shaders/rung.vert';
import rungFragment from '../shaders/rung.frag';
import rungStainVertex from '../shaders/rung-stain.vert';
import rungStainFragment from '../shaders/rung-stain.frag';
import letterVertex from '../shaders/letter.vert';
import letterFragment from '../shaders/letter.frag';
import { unpackGeometry } from './facade';
import type { TraceGeometry } from './towerGeometry';

const LAYERED: ShaderMaterialParameters = {
  blending: CustomBlending,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
  transparent: true,
  depthWrite: false,
};

export type TraceKind =
  | 'vapour'
  | 'leak'
  | 'motes'
  | 'wires'
  | 'fasteners'
  | 'pigeons'
  | 'spouts'
  | 'stacks'
  | 'runs'
  | 'drips'
  | 'stackDrips'
  | 'runDrips'
  | 'ducts'
  | 'ductFittings'
  | 'grilles'
  | 'boards'
  | 'rungs'
  | 'rungStains'
  | 'letters';

const PIPES: TraceKind[] = ['spouts', 'stacks', 'runs'];
const AIRBORNE: TraceKind[] = ['vapour', 'motes'];

export const SHADERS: Record<TraceKind, [string, string, ShaderMaterialParameters]> = {
  vapour: [vapourVertex, vapourFragment, LAYERED],
  leak: [leakVertex, leakFragment, LAYERED],
  motes: [motesVertex, motesFragment, { ...LAYERED, blending: AdditiveBlending }],
  wires: [wireVertex, wireFragment, LAYERED],
  fasteners: [fastenerVertex, fastenerFragment, {}],
  pigeons: [pigeonVertex, pigeonFragment, {}],
  spouts: [spoutVertex, spoutFragment, { side: DoubleSide }],
  stacks: [spoutVertex, spoutFragment, { side: DoubleSide, defines: { STACK: 1 } }],
  runs: [spoutVertex, spoutFragment, { side: DoubleSide, defines: { RUN: 1 } }],
  drips: [spoutDripVertex, leakFragment, LAYERED],
  stackDrips: [spoutDripVertex, leakFragment, { ...LAYERED, defines: { STACK: 1 } }],
  runDrips: [spoutDripVertex, leakFragment, { ...LAYERED, defines: { RUN: 1 } }],
  ducts: [ductVertex, ductFragment, {}],
  ductFittings: [ductFittingVertex, ductFragment, {}],
  grilles: [grilleVertex, grilleFragment, {}],
  boards: [boardVertex, boardFragment, {}],
  rungs: [rungVertex, rungFragment, {}],
  rungStains: [
    rungStainVertex,
    rungStainFragment,
    { ...LAYERED, blendSrc: DstColorFactor, blendDst: ZeroFactor },
  ],
  letters: [
    letterVertex,
    letterFragment,
    { ...LAYERED, blendSrc: DstColorFactor, blendDst: SrcColorFactor },
  ],
};

export function traceMeshes(
  traces: TraceGeometry[],
  uniforms: Record<string, IUniform>,
): Mesh<InstancedBufferGeometry, RawShaderMaterial>[] {
  const materials = new Map<TraceKind, RawShaderMaterial>();
  return traces.map(({ kind, geometry }) => {
    let material = materials.get(kind);
    if (material === undefined) {
      const [vertexShader, fragmentShader, options] = SHADERS[kind];
      const laidOut = PIPES.includes(kind)
        ? {
            uniforms: { ...uniforms, uPipeLayout: { value: null } },
            defines: { ...options.defines, LAID_OUT: 1 },
          }
        : {};
      material = new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms,
        ...options,
        ...laidOut,
      });
      materials.set(kind, material);
    }
    const mesh = new Mesh(unpackGeometry(geometry), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = PIPES.includes(kind) ? 1 : AIRBORNE.includes(kind) ? 3 : 2;
    return mesh;
  });
}
