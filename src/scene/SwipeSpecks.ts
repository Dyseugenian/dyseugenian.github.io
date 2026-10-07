import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DynamicDrawUsage,
  FloatType,
  GLSL3,
  MathUtils,
  NearestFilter,
  Points,
  RawShaderMaterial,
  RedFormat,
  Vector2,
  type IUniform,
} from 'three';
import vertexShader from '../shaders/swipe-specks.vert';
import fragmentShader from '../shaders/swipe-specks.frag';

const BURST = {
  count: 6000,
  perStep: 24,
  radius: 6,
  tries: 30,
  transfer: 0.25,
  falloff: 2.5,
  turn: 0.6,
  jitter: 20,
  life: [0.9, 2.2],
  calmSpeed: 120,
  wildSpeed: 1600,
  growth: 2,
  heal: [2.5, 5],
} as const;

const PHYSICS = {
  gravity: 200,
  heaviness: 0.15,
  drag: 0.9,
  flutter: 900,
  restitution: 0.35,
  friction: 8,
  settle: 12,
  step: 0.5,
  maxSteps: 24,
} as const;

export class SwipeSpecks extends Points<BufferGeometry, RawShaderMaterial> {
  private positions: BufferAttribute;
  private colors: BufferAttribute;
  private lives: BufferAttribute;
  private sizes: BufferAttribute;
  private velocities = new Float32Array(BURST.count * 2);
  private escaped = new Uint8Array(BURST.count);
  readonly healsAt: DataTexture;
  private grid: Int32Array;
  private healTimes: Float32Array;
  private time = 0;
  private columns: number;
  private rows: number;
  private next = 0;

  constructor(
    private sources: number[],
    uniforms: Record<string, IUniform>,
  ) {
    const geometry = new BufferGeometry()
      .setAttribute(
        'position',
        new BufferAttribute(new Float32Array(BURST.count * 3), 3).setUsage(DynamicDrawUsage),
      )
      .setAttribute('color', new BufferAttribute(new Float32Array(BURST.count * 3), 3))
      .setAttribute('aLife', new BufferAttribute(new Float32Array(BURST.count * 3), 3))
      .setAttribute('aSize', new BufferAttribute(new Float32Array(BURST.count), 1));
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: { ...uniforms, uLetters: { value: new DataTexture() } },
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    super(geometry, material);
    this.frustumCulled = false;
    this.positions = geometry.getAttribute('position') as BufferAttribute;
    this.colors = geometry.getAttribute('color') as BufferAttribute;
    this.lives = geometry.getAttribute('aLife') as BufferAttribute;
    this.sizes = geometry.getAttribute('aSize') as BufferAttribute;
    for (let i = 0; i < BURST.count; i++) this.lives.setXYZ(i, -1e6, 1, 0);

    let right = 0;
    let bottom = 0;
    for (let source = 0; source < sources.length; source += 5) {
      right = Math.max(right, sources[source]!);
      bottom = Math.max(bottom, -sources[source + 1]!);
    }
    this.columns = Math.ceil(right) + 1;
    this.rows = Math.ceil(bottom) + 1;
    this.grid = new Int32Array(this.columns * this.rows).fill(-1);
    for (let source = 0; source < sources.length; source += 5) {
      const column = Math.floor(sources[source]!);
      const row = Math.floor(-sources[source + 1]!);
      this.grid[row * this.columns + column] = source;
    }

    const letters = new DataTexture(
      Uint8Array.from(this.grid, (source) => (source >= 0 ? 255 : 0)),
      this.columns,
      this.rows,
      RedFormat,
    );
    letters.magFilter = NearestFilter;
    letters.minFilter = NearestFilter;
    letters.unpackAlignment = 1;
    letters.needsUpdate = true;
    material.uniforms.uLetters!.value = letters;

    this.healTimes = new Float32Array(this.columns * this.rows).fill(-1e6);
    this.healsAt = new DataTexture(this.healTimes, this.columns, this.rows, RedFormat, FloatType);
    this.healsAt.magFilter = NearestFilter;
    this.healsAt.minFilter = NearestFilter;
    this.healsAt.needsUpdate = true;
  }

  burst(x: number, y: number, velocity: Vector2, time: number): void {
    this.time = time;
    const vigor = MathUtils.clamp(
      (velocity.length() - BURST.calmSpeed) / (BURST.wildSpeed - BURST.calmSpeed),
      0,
      1,
    );
    for (let i = 0; i < BURST.perStep; i++) {
      const source = this.sourceNear(x, y);
      if (source < 0) continue;
      const [sourceX = 0, sourceY = 0, red = 0, green = 0, blue = 0] = this.sources.slice(
        source,
        source + 5,
      );
      const size = 1 + vigor * BURST.growth * Math.random();
      this.breakOff(sourceX, sourceY, Math.round(size), time);
      const angle = MathUtils.randFloatSpread(BURST.turn * 2);
      const strength = BURST.transfer * Math.random() ** BURST.falloff;
      this.positions.setXYZ(this.next, sourceX, sourceY, 0);
      this.colors.setXYZ(this.next, red, green, blue);
      this.velocities[this.next * 2] =
        (velocity.x * Math.cos(angle) - velocity.y * Math.sin(angle)) * strength +
        MathUtils.randFloatSpread(BURST.jitter * 2);
      this.velocities[this.next * 2 + 1] =
        (velocity.x * Math.sin(angle) + velocity.y * Math.cos(angle)) * strength +
        MathUtils.randFloatSpread(BURST.jitter * 2);
      this.escaped[this.next] = 0;
      this.lives.setXYZ(this.next, time, MathUtils.randFloat(...BURST.life), Math.random());
      this.sizes.setX(this.next, size);
      this.next = (this.next + 1) % BURST.count;
    }
    this.colors.needsUpdate = true;
    this.lives.needsUpdate = true;
    this.sizes.needsUpdate = true;
    this.healsAt.needsUpdate = true;
  }

  update(dt: number, time: number): void {
    this.time = time;
    const position = this.positions.array as Float32Array;
    const life = this.lives.array as Float32Array;
    const size = this.sizes.array as Float32Array;
    const { velocities, escaped } = this;
    const drag = Math.exp(-dt / PHYSICS.drag);
    let moved = false;

    for (let i = 0; i < BURST.count; i++) {
      if (time - life[i * 3]! > life[i * 3 + 1]!) continue;
      moved = true;
      const speckSize = size[i]!;
      const half = (speckSize - 1) / 2;
      const gravity = PHYSICS.gravity * (1 + PHYSICS.heaviness * (speckSize - 1));
      let x = position[i * 3]!;
      let y = position[i * 3 + 1]!;
      let vx =
        velocities[i * 2]! * drag + (MathUtils.randFloatSpread(PHYSICS.flutter) * dt) / speckSize;
      let vy = velocities[i * 2 + 1]! * drag - gravity * dt;

      const steps = MathUtils.clamp(
        Math.ceil((Math.max(Math.abs(vx), Math.abs(vy)) * dt) / PHYSICS.step),
        1,
        PHYSICS.maxSteps,
      );
      const stepDt = dt / steps;
      for (let step = 0; step < steps; step++) {
        if (!escaped[i] && !this.isLetter(x, y)) escaped[i] = 1;

        const nextX = x + vx * stepDt;
        if (escaped[i] && this.isSolid(nextX + Math.sign(vx) * half, y)) {
          vx = -vx * PHYSICS.restitution;
        } else {
          x = nextX;
        }

        const nextY = y + vy * stepDt;
        if (escaped[i] && this.isSolid(x, nextY + Math.sign(vy) * half)) {
          if (vy < 0) vx *= Math.exp(-PHYSICS.friction * stepDt);
          vy = Math.abs(vy) < PHYSICS.settle ? 0 : -vy * PHYSICS.restitution;
        } else {
          y = nextY;
        }
      }

      position[i * 3] = x;
      position[i * 3 + 1] = y;
      velocities[i * 2] = vx;
      velocities[i * 2 + 1] = vy;
    }
    if (moved) this.positions.needsUpdate = true;
  }

  private breakOff(x: number, y: number, size: number, time: number): void {
    const first = -Math.floor((size - 1) / 2);
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const cell = this.cellAt(x + first + dx, y - first - dy);
        if (cell >= 0 && this.grid[cell]! >= 0 && time >= this.healTimes[cell]!) {
          this.healTimes[cell] = time + MathUtils.randFloat(...BURST.heal);
        }
      }
    }
  }

  private cellAt(x: number, y: number): number {
    const column = Math.floor(x);
    const row = Math.floor(-y);
    if (column < 0 || row < 0 || column >= this.columns || row >= this.rows) return -1;
    return row * this.columns + column;
  }

  private isLetter(x: number, y: number): boolean {
    const cell = this.cellAt(x, y);
    return cell >= 0 && this.grid[cell]! >= 0;
  }

  private isSolid(x: number, y: number): boolean {
    const cell = this.cellAt(x, y);
    return this.isLetter(x, y) && this.time >= this.healTimes[cell]!;
  }

  private sourceNear(x: number, y: number): number {
    for (let attempt = 0; attempt < BURST.tries; attempt++) {
      const pickX = x + MathUtils.randFloatSpread(BURST.radius * 2);
      const pickY = y + MathUtils.randFloatSpread(BURST.radius * 2);
      if (this.isSolid(pickX, pickY)) return this.grid[this.cellAt(pickX, pickY)]!;
    }
    return -1;
  }
}
