import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  GLSL3,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  Points,
  RawShaderMaterial,
  SphereGeometry,
  Vector3,
  type IUniform,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import glowVertexShader from '../shaders/beacon.vert';
import glowFragmentShader from '../shaders/beacon.frag';
import fixtureVertexShader from '../shaders/beacon-fixture.vert';
import fixtureFragmentShader from '../shaders/beacon-fixture.frag';
import { TILE_HEIGHT } from './facade';

const MOUNT = { arm: 1.2, post: 0.3, thickness: 0.08, bulb: 0.08, height: 3.6, inset: 0.35 };

export function beaconSpot(outerX: number): Vector3 {
  return new Vector3(outerX - MOUNT.inset, MOUNT.height + MOUNT.post, MOUNT.arm);
}

function fixture(): BufferGeometry {
  const { arm, post, thickness, bulb } = MOUNT;
  const parts = [
    new BoxGeometry(thickness, thickness, arm).translate(0, -post, -arm / 2),
    new BoxGeometry(thickness * 0.8, post, thickness * 0.8).translate(0, -post / 2, 0),
    new SphereGeometry(bulb, 12, 8),
  ];
  parts.forEach((part, index) => {
    const count = part.getAttribute('position').count;
    part.setAttribute(
      'aGlow',
      new Float32BufferAttribute(new Array<number>(count).fill(index === 2 ? 1 : 0), 1),
    );
  });
  const merged = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  return merged;
}

export class Beacons extends Group {
  constructor(spot: Vector3, rows: number[], uniforms: Record<string, IUniform>) {
    super();
    const sides = rows.flatMap(() => [-1, 1]);
    const pairedRows = rows.flatMap((row) => [row, row]);

    const merged = fixture();
    const fixtures = new InstancedBufferGeometry();
    fixtures.setIndex(merged.index);
    for (const [name, attribute] of Object.entries(merged.attributes)) {
      fixtures.setAttribute(name, attribute);
    }
    fixtures.setAttribute('aRow', new InstancedBufferAttribute(new Float32Array(pairedRows), 1));
    fixtures.setAttribute('aSide', new InstancedBufferAttribute(new Float32Array(sides), 1));
    fixtures.instanceCount = sides.length;

    const positions = rows.flatMap((row) =>
      [-1, 1].flatMap((side) => [side * spot.x, row * TILE_HEIGHT + spot.y, spot.z]),
    );
    const glows = new BufferGeometry()
      .setAttribute('position', new Float32BufferAttribute(positions, 3))
      .setAttribute('aRow', new Float32BufferAttribute(pairedRows, 1));

    const meshes = [
      new Mesh(
        fixtures,
        new RawShaderMaterial({
          glslVersion: GLSL3,
          vertexShader: fixtureVertexShader,
          fragmentShader: fixtureFragmentShader,
          uniforms,
          side: DoubleSide,
        }),
      ),
      new Points(
        glows,
        new RawShaderMaterial({
          glslVersion: GLSL3,
          vertexShader: glowVertexShader,
          fragmentShader: glowFragmentShader,
          uniforms,
          blending: AdditiveBlending,
          transparent: true,
          depthWrite: false,
        }),
      ),
    ];
    for (const mesh of meshes) mesh.frustumCulled = false;
    this.add(...meshes);
  }
}
