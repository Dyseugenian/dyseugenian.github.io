import {
  AdditiveBlending,
  CustomBlending,
  DoubleSide,
  GLSL3,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
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
import boardVertex from '../shaders/board.vert';
import boardFragment from '../shaders/board.frag';
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
  | 'drips'
  | 'ducts'
  | 'ductFittings'
  | 'grilles'
  | 'boards';

const SHADERS: Record<TraceKind, [string, string, ShaderMaterialParameters]> = {
  vapour: [vapourVertex, vapourFragment, LAYERED],
  leak: [leakVertex, leakFragment, LAYERED],
  motes: [motesVertex, motesFragment, { ...LAYERED, blending: AdditiveBlending }],
  wires: [wireVertex, wireFragment, LAYERED],
  fasteners: [fastenerVertex, fastenerFragment, {}],
  pigeons: [pigeonVertex, pigeonFragment, {}],
  spouts: [spoutVertex, spoutFragment, { side: DoubleSide }],
  drips: [spoutDripVertex, leakFragment, LAYERED],
  ducts: [ductVertex, ductFragment, {}],
  ductFittings: [ductFittingVertex, ductFragment, {}],
  grilles: [grilleVertex, grilleFragment, {}],
  boards: [boardVertex, boardFragment, {}],
};

export function traceMeshes(traces: TraceGeometry[], uniforms: Record<string, IUniform>): Mesh[] {
  const materials = new Map<TraceKind, RawShaderMaterial>();
  return traces.map(({ kind, geometry }) => {
    let material = materials.get(kind);
    if (material === undefined) {
      const [vertexShader, fragmentShader, options] = SHADERS[kind];
      material = new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms,
        ...options,
      });
      materials.set(kind, material);
    }
    const mesh = new Mesh(unpackGeometry(geometry), material);
    mesh.frustumCulled = false;
    mesh.renderOrder = kind === 'spouts' ? 1 : 2;
    return mesh;
  });
}
