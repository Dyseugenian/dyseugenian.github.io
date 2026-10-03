import {
  AddEquation,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  Float32BufferAttribute,
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
import { Dust, createDustMaterial } from './Dust';

const LETTER_STARTS = [0, 106, 183, 259, 333, 405, 483, 552, 630, 671, 744];
const LETTER_SPACING = 6;
const EDGE_FALLOFF = 6;
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export class Wordmark extends Group {
  readonly uniforms = {
    uPixelSize: { value: 1 },
    uTime: { value: 0 },
    uBackground: { value: new Color(palette.bg).convertLinearToSRGB() },
  };
  readonly letters: Letter[] = [];
  readonly loaded: Promise<void>;
  private time = 0;
  private materials = [
    createMaterial(this.uniforms, AddEquation, 1),
    createMaterial(this.uniforms, ReverseSubtractEquation, -1),
  ];
  private dustMaterial = createDustMaterial(this.uniforms);

  constructor(left: number, top: number) {
    super();
    this.position.set(left, top, 0);
    this.scale.setScalar(1 / 140);
    this.loaded = Promise.all([readImage(wordmarkUrl), readImage(dustUrl)]).then(
      ([image, dust]) => {
        LETTER_STARTS.forEach((start, index) => {
          const end = LETTER_STARTS[index + 1] ?? image.width;
          const spread = (index - (LETTER_STARTS.length - 1) / 2) * LETTER_SPACING;
          const center = { x: (start + end) / 2, y: image.height / 2 };
          const home = new Vector2(center.x + spread, -center.y);
          const pixels = createPixels(image, start, end, center);
          const specks = new Dust(findSites(dust, image, start, end, center), this.dustMaterial);
          const letter = new Letter(pixels, this.materials, home, specks);
          this.letters.push(letter);
          this.add(letter);
        });
      },
    );
  }

  update(dt: number): void {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    for (const letter of this.letters) letter.dust.update(this.time);
  }
}

class Letter extends Points<BufferGeometry, RawShaderMaterial[]> {
  constructor(
    pixels: BufferGeometry,
    materials: RawShaderMaterial[],
    home: Vector2,
    readonly dust: Dust,
  ) {
    super(pixels, materials);
    this.position.set(home.x, home.y, 0);
    this.add(dust);
  }
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
  const cells: number[] = [];

  for (let row = 0; row < height; row++) {
    for (let column = start; column < end; column++) {
      const pixel = (row * width + column) * 4;
      if (data[pixel + 3] === 0) continue;
      positions.push(column + 0.5 - center.x, center.y - row - 0.5, 0);
      cells.push(column, row);
      colors.push(...data.subarray(pixel, pixel + 3));
    }
  }

  const geometry = new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute(positions, 3))
    .setAttribute('color', new BufferAttribute(new Uint8Array(colors), 3, true))
    .setAttribute('aCell', new Float32BufferAttribute(cells, 2));
  geometry.addGroup(0, positions.length / 3, 0);
  geometry.addGroup(0, positions.length / 3, 1);
  return geometry;
}

function findSites(
  dust: ImageData,
  letters: ImageData,
  start: number,
  end: number,
  center: { x: number; y: number },
): number[] {
  const { width, height, data } = dust;
  const distances = distanceToLetter(letters, start, end);
  const sites: number[] = [];

  for (let row = 0; row < height; row++) {
    for (let column = start; column < end; column++) {
      const pixel = (row * width + column) * 4;
      if (data[pixel + 3] === 0) continue;
      const [red = 0, green = 0, blue = 0] = data.subarray(pixel, pixel + 3);
      const distance = distances[row * (end - start) + column - start] ?? 0;
      sites.push(
        column + 0.5 - center.x,
        center.y - row - 0.5,
        red / 255,
        green / 255,
        blue / 255,
        Math.exp(-distance / EDGE_FALLOFF),
      );
    }
  }
  return sites;
}

function distanceToLetter(
  { width, height, data }: ImageData,
  start: number,
  end: number,
): Float32Array {
  const span = end - start;
  const distances = new Float32Array(span * height).fill(Infinity);
  const queue: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let column = start; column < end; column++) {
      if (data[(row * width + column) * 4 + 3] === 0) continue;
      distances[row * span + column - start] = 0;
      queue.push(row * span + column - start);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head] ?? 0;
    const row = Math.floor(cell / span);
    const column = cell % span;
    const next = (distances[cell] ?? 0) + 1;
    for (const [dx, dy] of NEIGHBORS) {
      const x = column + dx;
      const y = row + dy;
      if (x < 0 || x >= span || y < 0 || y >= height) continue;
      if ((distances[y * span + x] ?? 0) <= next) continue;
      distances[y * span + x] = next;
      queue.push(y * span + x);
    }
  }
  return distances;
}
