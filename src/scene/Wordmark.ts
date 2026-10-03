import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  Float32BufferAttribute,
  GLSL3,
  Group,
  MathUtils,
  OneFactor,
  Points,
  RawShaderMaterial,
  ReverseSubtractEquation,
  SrcAlphaFactor,
  ZeroFactor,
  type BlendingEquation,
  Vector2,
  Vector3,
  type IUniform,
} from 'three';
import wordmarkUrl from '../assets/wordmark.webp';
import vertexShader from '../shaders/wordmark.vert';
import fragmentShader from '../shaders/wordmark.frag';
import { palette } from '../core/palette';

const LETTER_STARTS = [0, 106, 183, 259, 333, 405, 483, 552, 630, 671, 744];
const LETTER_SPACING = 6;
const WOBBLE = { sway: 1.2, lift: 2.5, tilt: 0.02, speed: [1.2, 2.4] } as const;

export class Wordmark extends Group {
  readonly uniforms = {
    uPixelSize: { value: 1 },
    uBackground: { value: new Color(palette.bg).convertLinearToSRGB() },
  };
  readonly letters: Letter[] = [];
  readonly loaded: Promise<void>;
  private time = 0;
  private materials = [
    createMaterial(this.uniforms, AddEquation, 1),
    createMaterial(this.uniforms, ReverseSubtractEquation, -1),
  ];

  constructor(left: number, top: number) {
    super();
    this.position.set(left, top, 0);
    this.scale.setScalar(1 / 140);
    this.loaded = readImage(wordmarkUrl).then((image) => {
      LETTER_STARTS.forEach((start, index) => {
        const end = LETTER_STARTS[index + 1] ?? image.width;
        const spread = (index - (LETTER_STARTS.length - 1) / 2) * LETTER_SPACING;
        const center = { x: (start + end) / 2, y: image.height / 2 };
        const home = new Vector2(center.x + spread, -center.y);
        const pixels = createPixels(image, start, end, center);
        const letter = new Letter(pixels, this.materials, home);
        this.letters.push(letter);
        this.add(letter);
      });
    });
  }

  update(dt: number): void {
    this.time += dt;
    for (const letter of this.letters) letter.wobble(this.time);
  }
}

class Letter extends Points<BufferGeometry, RawShaderMaterial[]> {
  private phase = new Vector3().random().multiplyScalar(Math.PI * 2);
  private speed = new Vector3(randomSpeed(), randomSpeed(), randomSpeed());

  constructor(
    pixels: BufferGeometry,
    materials: RawShaderMaterial[],
    private home: Vector2,
  ) {
    super(pixels, materials);
    this.position.set(home.x, home.y, 0);
  }

  wobble(time: number): void {
    const { phase, speed } = this;
    this.position.x = this.home.x + WOBBLE.sway * Math.sin(time * speed.x + phase.x);
    this.position.y = this.home.y + WOBBLE.lift * Math.sin(time * speed.y + phase.y);
    this.rotation.z = WOBBLE.tilt * Math.sin(time * speed.z + phase.z);
  }
}

function randomSpeed(): number {
  return MathUtils.randFloat(...WOBBLE.speed);
}

function createMaterial(
  uniforms: Record<string, IUniform>,
  blendEquation: BlendingEquation,
  sign: number,
): RawShaderMaterial {
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader,
    uniforms,
    defines: { SIGN: sign.toFixed(1) },
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

async function readImage(url: string): Promise<ImageData> {
  const response = await fetch(url);
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, bitmap.width, bitmap.height);
}

function createPixels(
  { width, height, data }: ImageData,
  start: number,
  end: number,
  center: { x: number; y: number },
): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];

  for (let row = 0; row < height; row++) {
    for (let column = start; column < end; column++) {
      const pixel = (row * width + column) * 4;
      if (data[pixel + 3] === 0) continue;
      positions.push(column + 0.5 - center.x, center.y - row - 0.5, 0);
      colors.push(...data.subarray(pixel, pixel + 3));
    }
  }

  const geometry = new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute(positions, 3))
    .setAttribute('color', new BufferAttribute(new Uint8Array(colors), 3, true));
  geometry.addGroup(0, positions.length / 3, 0);
  geometry.addGroup(0, positions.length / 3, 1);
  return geometry;
}
