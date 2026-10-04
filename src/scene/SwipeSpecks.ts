import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  GLSL3,
  MathUtils,
  Points,
  RawShaderMaterial,
  Vector2,
  type IUniform,
} from 'three';
import vertexShader from '../shaders/swipe-specks.vert';
import fragmentShader from '../shaders/specks.frag';

const BURST = {
  count: 6000,
  perStep: 24,
  radius: 12,
  tries: 30,
  transfer: 0.25,
  falloff: 2.5,
  turn: 0.6,
  jitter: 20,
  drag: 0.5,
  gravity: 80,
  life: [0.7, 1.6],
} as const;

export class SwipeSpecks extends Points<BufferGeometry, RawShaderMaterial> {
  private positions: BufferAttribute;
  private colors: BufferAttribute;
  private velocities: BufferAttribute;
  private lives: BufferAttribute;
  private grid: Int32Array;
  private left: number;
  private columns: number;
  private rows: number;
  private next = 0;

  constructor(
    private sources: number[],
    uniforms: Record<string, IUniform>,
  ) {
    const geometry = new BufferGeometry()
      .setAttribute('position', new BufferAttribute(new Float32Array(BURST.count * 3), 3))
      .setAttribute('color', new BufferAttribute(new Float32Array(BURST.count * 3), 3))
      .setAttribute('aVelocity', new BufferAttribute(new Float32Array(BURST.count * 2), 2))
      .setAttribute('aLife', new BufferAttribute(new Float32Array(BURST.count * 3), 3));
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms,
      defines: { DRAG: BURST.drag.toFixed(3), GRAVITY: BURST.gravity.toFixed(1) },
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    super(geometry, material);
    this.frustumCulled = false;
    this.positions = geometry.getAttribute('position') as BufferAttribute;
    this.colors = geometry.getAttribute('color') as BufferAttribute;
    this.velocities = geometry.getAttribute('aVelocity') as BufferAttribute;
    this.lives = geometry.getAttribute('aLife') as BufferAttribute;
    for (let i = 0; i < BURST.count; i++) this.lives.setXYZ(i, -1e6, 1, 0);

    let left = Infinity;
    let right = -Infinity;
    let bottom = 0;
    for (let source = 0; source < sources.length; source += 5) {
      left = Math.min(left, sources[source]!);
      right = Math.max(right, sources[source]!);
      bottom = Math.max(bottom, -sources[source + 1]!);
    }
    this.left = Math.floor(left);
    this.columns = Math.ceil(right) - this.left + 1;
    this.rows = Math.ceil(bottom) + 1;
    this.grid = new Int32Array(this.columns * this.rows).fill(-1);
    for (let source = 0; source < sources.length; source += 5) {
      const column = Math.floor(sources[source]! - this.left);
      const row = Math.floor(-sources[source + 1]!);
      this.grid[row * this.columns + column] = source;
    }
  }

  burst(x: number, y: number, velocity: Vector2, time: number): void {
    for (let i = 0; i < BURST.perStep; i++) {
      const source = this.sourceNear(x, y);
      if (source < 0) continue;
      const [sourceX = 0, sourceY = 0, red = 0, green = 0, blue = 0] = this.sources.slice(
        source,
        source + 5,
      );
      const angle = MathUtils.randFloatSpread(BURST.turn * 2);
      const strength = BURST.transfer * Math.random() ** BURST.falloff;
      this.positions.setXYZ(this.next, sourceX, sourceY, 0);
      this.colors.setXYZ(this.next, red, green, blue);
      this.velocities.setXY(
        this.next,
        (velocity.x * Math.cos(angle) - velocity.y * Math.sin(angle)) * strength +
          MathUtils.randFloatSpread(BURST.jitter * 2),
        (velocity.x * Math.sin(angle) + velocity.y * Math.cos(angle)) * strength +
          MathUtils.randFloatSpread(BURST.jitter * 2),
      );
      this.lives.setXYZ(this.next, time, MathUtils.randFloat(...BURST.life), Math.random());
      this.next = (this.next + 1) % BURST.count;
    }
    this.positions.needsUpdate = true;
    this.colors.needsUpdate = true;
    this.velocities.needsUpdate = true;
    this.lives.needsUpdate = true;
  }

  private sourceNear(x: number, y: number): number {
    for (let attempt = 0; attempt < BURST.tries; attempt++) {
      const column = Math.floor(x + MathUtils.randFloatSpread(BURST.radius * 2) - this.left);
      const row = Math.floor(-y + MathUtils.randFloatSpread(BURST.radius * 2));
      if (column < 0 || row < 0 || column >= this.columns || row >= this.rows) continue;
      const source = this.grid[row * this.columns + column]!;
      if (source >= 0) return source;
    }
    return -1;
  }
}
