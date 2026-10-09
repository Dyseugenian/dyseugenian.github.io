import {
  AddEquation,
  Box2,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  DataTexture,
  GLSL3,
  Group,
  OneFactor,
  Points,
  RawShaderMaterial,
  ReverseSubtractEquation,
  SrcAlphaFactor,
  ZeroFactor,
  type BlendingEquation,
  Vector2,
  type IUniform,
} from 'three';
import wordmarkUrl from '../assets/wordmark.webp';
import dustUrl from '../assets/dust.webp';
import vertexShader from '../shaders/wordmark.vert';
import fragmentShader from '../shaders/wordmark.frag';
import { palette } from '../core/palette';
import { beneathGrain } from '../post/Film';
import { Dust, createDustMaterial } from './Dust';
import { SwipeSpecks } from './SwipeSpecks';
import { PenPaths } from './PenPaths';
import { PEN } from './penPath';
import { TETRIS, type LetterPixels, type WordmarkPixels } from './wordmarkPixels';
import WordmarkWorker from './wordmark.worker?worker';

const SWIPE = { spacing: 14, reach: 12, minSpeed: 120 };

export class Wordmark extends Group {
  readonly uniforms = {
    uPixelSize: { value: 1 },
    uTime: { value: 0 },
    uBackground: { value: beneathGrain(palette.bg) },
    uTetris: { value: 0 },
    uTetrisTime: { value: 0 },
    uTetrisEnd: { value: 0 },
    uBinary: { value: 0 },
    uBinaryTime: { value: 0 },
    uDustHidden: { value: 0 },
    uMotion: { value: 0 },
    uMotionTime: { value: 0 },
    uCream: { value: new Color(palette.cream).convertLinearToSRGB() },
    uOchre: { value: new Color(palette.ochreHi).convertLinearToSRGB() },
    uHealsAt: { value: new DataTexture() },
  };
  readonly letters: Letter[] = [];
  readonly loaded: Promise<void>;
  private time = 0;
  private materials = [
    createMaterial(this.uniforms, AddEquation, 1, false),
    createMaterial(this.uniforms, ReverseSubtractEquation, -1, false),
    createMaterial(this.uniforms, AddEquation, 1, true),
    createMaterial(this.uniforms, ReverseSubtractEquation, -1, true),
  ];
  private dustMaterial = createDustMaterial(this.uniforms);
  private bounds = new Box2();
  private swipePoint = new Vector2();
  private swipeVelocity = new Vector2();
  private lastKick = new Vector2();
  private isSwiping = false;
  private swipeSpecks?: SwipeSpecks;
  private penPaths?: PenPaths;

  constructor(left: number, top: number) {
    super();
    this.position.set(left, top, 0);
    this.scale.setScalar(1 / 140);
    this.loaded = bakeWordmark().then(({ width, height, letters, sources }) => {
      for (const pixels of letters) {
        this.uniforms.uTetrisEnd.value = Math.max(
          this.uniforms.uTetrisEnd.value,
          (pixels.completedTick + TETRIS.clearTicks) * TETRIS.tick,
        );
        const specks = new Dust(pixels.sites, this.dustMaterial);
        const letter = new Letter(letterGeometry(pixels), this.materials, pixels.home, specks);
        this.letters.push(letter);
        this.add(letter);
      }
      this.penPaths = new PenPaths(
        letters.map(({ path }) => path),
        this.uniforms,
      );
      this.add(this.penPaths);
      this.swipeSpecks = new SwipeSpecks(sources, this.uniforms);
      this.uniforms.uHealsAt.value = this.swipeSpecks.healsAt;
      this.add(this.swipeSpecks);
      this.bounds.set(new Vector2(0, -height), new Vector2(width, 0)).expandByScalar(SWIPE.reach);
    });
  }

  update(dt: number, pointer: Vector2 | null, pointerVelocity: Vector2): void {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    const falling = this.uniforms.uTetris.value > 0;
    this.materials[2]!.visible = falling;
    this.materials[3]!.visible = falling;
    for (const letter of this.letters) letter.dust.update(this.time);
    this.penPaths?.update(this.uniforms.uMotionTime.value);
    this.swipe(pointer, pointerVelocity);
    this.swipeSpecks?.update(dt, this.time);
  }

  private swipe(pointer: Vector2 | null, pointerVelocity: Vector2): void {
    if (!pointer) {
      this.isSwiping = false;
      return;
    }
    const at = this.swipePoint
      .set(pointer.x - this.position.x, pointer.y - this.position.y)
      .divideScalar(this.scale.x);
    const velocity = this.swipeVelocity.copy(pointerVelocity).divideScalar(this.scale.x);
    if (!this.bounds.containsPoint(at) || velocity.length() < SWIPE.minSpeed) {
      this.isSwiping = false;
      return;
    }
    if (!this.isSwiping) {
      this.kick(at.x, at.y, velocity);
      this.lastKick.copy(at);
      this.isSwiping = true;
      return;
    }
    const steps = Math.floor(this.lastKick.distanceTo(at) / SWIPE.spacing);
    for (let step = 1; step <= steps; step++) {
      const along = step / steps;
      this.kick(
        this.lastKick.x + (at.x - this.lastKick.x) * along,
        this.lastKick.y + (at.y - this.lastKick.y) * along,
        velocity,
      );
    }
    if (steps > 0) this.lastKick.copy(at);
  }

  private kick(x: number, y: number, velocity: Vector2): void {
    this.swipeSpecks?.burst(x, y, velocity, this.time);
  }
}

class Letter extends Points<BufferGeometry, RawShaderMaterial[]> {
  constructor(
    pixels: BufferGeometry,
    materials: RawShaderMaterial[],
    home: [number, number],
    readonly dust: Dust,
  ) {
    super(pixels, materials);
    this.position.set(home[0], home[1], 0);
    this.add(dust);
  }
}

function createMaterial(
  uniforms: Record<string, IUniform>,
  blendEquation: BlendingEquation,
  sign: number,
  falling: boolean,
): RawShaderMaterial {
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader,
    uniforms,
    defines: {
      SIGN: sign.toFixed(1),
      BLOCK: TETRIS.block.toFixed(1),
      TICK: TETRIS.tick.toFixed(3),
      CLEAR_TICKS: TETRIS.clearTicks.toFixed(1),
      FADE_IN_TICKS: TETRIS.fadeInTicks.toFixed(1),
      PEN_HOLLOW: PEN.hollow.toFixed(3),
      FLOOD_DURATION: PEN.floodDuration.toFixed(3),
      FLOOD_REACH: PEN.floodReach.toFixed(1),
      FLOOD_SOFT: PEN.floodSoft.toFixed(1),
      ...(falling ? { FALLING: '' } : {}),
    },
    blending: CustomBlending,
    blendEquation,
    blendSrc: SrcAlphaFactor,
    blendDst: OneFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}

function bakeWordmark(): Promise<WordmarkPixels> {
  const worker = new WordmarkWorker();
  worker.postMessage([wordmarkUrl, dustUrl].map((url) => new URL(url, location.href).href));
  return new Promise((resolve, reject) => {
    worker.addEventListener('message', (event: MessageEvent<WordmarkPixels>) => {
      worker.terminate();
      resolve(event.data);
    });
    worker.addEventListener('error', reject);
  });
}

function letterGeometry(pixels: LetterPixels): BufferGeometry {
  const count = pixels.positions.length / 3;
  const pen = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) pen.set([...pixels.path.start, pixels.path.drawEnd], i * 3);
  const geometry = new BufferGeometry()
    .setAttribute('position', new BufferAttribute(pixels.positions, 3))
    .setAttribute('color', new BufferAttribute(pixels.colors, 3, true))
    .setAttribute('aCell', new BufferAttribute(pixels.cells, 2))
    .setAttribute('aGrid', new BufferAttribute(pixels.grid, 2))
    .setAttribute('aPiece', new BufferAttribute(pixels.drops, 4))
    .setAttribute('aDigit', new BufferAttribute(pixels.digits, 4))
    .setAttribute(
      'aCompleted',
      new BufferAttribute(new Float32Array(count).fill(pixels.completedTick), 1),
    )
    .setAttribute('aPen', new BufferAttribute(pen, 3));
  for (let material = 0; material < 4; material++) geometry.addGroup(0, count, material);
  return geometry;
}
