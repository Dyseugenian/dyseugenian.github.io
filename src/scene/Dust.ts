import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  GLSL3,
  MathUtils,
  Points,
  RawShaderMaterial,
  type IUniform,
} from 'three';
import vertexShader from '../shaders/dust.vert';
import fragmentShader from '../shaders/specks.frag';

const DUST = {
  share: 5,
  scatter: 3,
  life: [1.5, 5],
  rest: [0.3, 4],
  wander: 4,
  fall: 120,
} as const;

export function createDustMaterial(uniforms: Record<string, IUniform>): RawShaderMaterial {
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader,
    uniforms: { ...uniforms, uWander: { value: DUST.wander }, uFall: { value: DUST.fall } },
    blending: AdditiveBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}

export class Dust extends Points<BufferGeometry, RawShaderMaterial> {
  private positions: BufferAttribute;
  private colors: BufferAttribute;
  private lives: BufferAttribute;
  private ends: Float32Array;
  private totals: number[] = [];

  constructor(
    private sites: number[],
    material: RawShaderMaterial,
  ) {
    const count = Math.ceil((sites.length / 6) * DUST.share);
    const geometry = new BufferGeometry()
      .setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
      .setAttribute('color', new BufferAttribute(new Float32Array(count * 3), 3))
      .setAttribute('aLife', new BufferAttribute(new Float32Array(count * 3), 3));
    super(geometry, material);
    this.frustumCulled = false;
    this.positions = geometry.getAttribute('position') as BufferAttribute;
    this.colors = geometry.getAttribute('color') as BufferAttribute;
    this.lives = geometry.getAttribute('aLife') as BufferAttribute;
    this.ends = Float32Array.from({ length: count }, () => MathUtils.randFloat(0, DUST.rest[1]));
    for (let i = 0; i < count; i++) this.lives.setXYZ(i, -1e6, 1, 0);
    let total = 0;
    for (let site = 5; site < sites.length; site += 6)
      this.totals.push((total += sites[site] ?? 0));
  }

  update(time: number): void {
    this.ends.forEach((end, index) => {
      if (time >= end) this.spawn(index, time);
    });
  }

  private spawn(index: number, time: number): void {
    const pick = Math.random() * (this.totals.at(-1) ?? 0);
    const site = this.totals.findIndex((total) => total >= pick) * 6;
    const [x = 0, y = 0, red = 0, green = 0, blue = 0] = this.sites.slice(site, site + 5);
    const life = MathUtils.randFloat(...DUST.life);

    this.positions.setXYZ(
      index,
      x + MathUtils.randFloatSpread(DUST.scatter * 2),
      y + MathUtils.randFloatSpread(DUST.scatter * 2),
      0,
    );
    this.colors.setXYZ(index, red, green, blue);
    this.lives.setXYZ(index, time, life, Math.random());
    this.ends[index] = time + life + MathUtils.randFloat(...DUST.rest);
    this.positions.needsUpdate = true;
    this.colors.needsUpdate = true;
    this.lives.needsUpdate = true;
  }
}
