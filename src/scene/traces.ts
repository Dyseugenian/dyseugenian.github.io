import {
  AdditiveBlending,
  BufferGeometry,
  CustomBlending,
  GLSL3,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
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
import { storeyGeometry } from './facade';

const PUFFS = 16;
const LEAK_PIECES = 4;
const MOTES = 12;
const PIGEONS = 3;

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
  return layers.map(([count, vertexShader, fragmentShader, options]) =>
    instanced(
      storeyGeometry(quad, columns, rows, count),
      vertexShader,
      fragmentShader,
      uniforms,
      options,
    ),
  );
}

export function pigeons(
  columns: number[],
  rows: number[],
  uniforms: Record<string, IUniform>,
): Mesh {
  const geometry = storeyGeometry(new BufferGeometry(), columns, rows, PIGEONS);
  return instanced(geometry, pigeonVertex, pigeonFragment, uniforms, {});
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
