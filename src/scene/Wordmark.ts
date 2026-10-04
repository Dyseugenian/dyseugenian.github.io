import {
  AddEquation,
  Box2,
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
import { SwipeSpecks } from './SwipeSpecks';
import { layoutDigits } from './digitLayout';

const LETTER_STARTS = [0, 106, 183, 259, 333, 405, 483, 552, 630, 671, 744];
const EDGE_FALLOFF = 6;
const TETRIS = {
  block: 14,
  tick: 0.04,
  piecesPerLetter: 6,
  well: 24,
  spawnGap: 9,
  spawnSpread: 16,
  fadeInTicks: 5,
  clearTicks: 6,
};
const NEVER = 1e6;
const SWIPE = { spacing: 14, reach: 12, minSpeed: 120 };
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
    uTetris: { value: 0 },
    uTetrisTime: { value: 0 },
    uTetrisEnd: { value: 0 },
    uBinary: { value: 0 },
    uBinaryTime: { value: 0 },
    uDustHidden: { value: 0 },
    uCream: { value: new Color(palette.cream).convertLinearToSRGB() },
    uOchre: { value: new Color(palette.ochreHi).convertLinearToSRGB() },
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
  private swipeSpecks!: SwipeSpecks;

  constructor(left: number, top: number) {
    super();
    this.position.set(left, top, 0);
    this.scale.setScalar(1 / 140);
    this.loaded = Promise.all([readImage(wordmarkUrl), readImage(dustUrl)]).then(
      ([image, dust]) => {
        LETTER_STARTS.forEach((start, index) => {
          const end = LETTER_STARTS[index + 1] ?? image.width;
          const center = { x: (start + end) / 2, y: image.height / 2 };
          const home = new Vector2(center.x, -center.y);
          const firstTick = (index * 5) % TETRIS.spawnGap;
          const { pixels, completedTick } = createPixels(image, start, end, center, firstTick);
          this.uniforms.uTetrisEnd.value = Math.max(
            this.uniforms.uTetrisEnd.value,
            (completedTick + TETRIS.clearTicks) * TETRIS.tick,
          );
          const specks = new Dust(findSites(dust, image, start, end, center), this.dustMaterial);
          const letter = new Letter(pixels, this.materials, home, specks);
          this.letters.push(letter);
          this.add(letter);
        });
        this.swipeSpecks = new SwipeSpecks(letterSources(image), this.uniforms);
        this.add(this.swipeSpecks);
        this.bounds
          .set(new Vector2(0, -image.height), new Vector2(image.width, 0))
          .expandByScalar(SWIPE.reach);
      },
    );
  }

  update(dt: number, pointer: Vector2 | null, pointerVelocity: Vector2): void {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    for (const letter of this.letters) letter.dust.update(this.time);
    this.swipe(pointer, pointerVelocity);
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
    this.swipeSpecks.burst(x, y, velocity, this.time);
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

function letterSources({ width, height, data }: ImageData): number[] {
  const sources: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const pixel = (row * width + column) * 4;
      if (data[pixel + 3] === 0) continue;
      sources.push(
        column + 0.5,
        -row - 0.5,
        data[pixel]! / 255,
        data[pixel + 1]! / 255,
        data[pixel + 2]! / 255,
      );
    }
  }
  return sources;
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
  firstTick: number,
): { pixels: BufferGeometry; completedTick: number } {
  const opaqueColumns: number[] = [];
  const opaqueRows: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let column = start; column < end; column++) {
      if (data[(row * width + column) * 4 + 3] === 0) continue;
      opaqueColumns.push(column);
      opaqueRows.push(row);
    }
  }

  const left = Math.min(...opaqueColumns);
  const bottom = Math.max(...opaqueRows);
  const gridColumns = Math.ceil((Math.max(...opaqueColumns) - left + 1) / TETRIS.block);
  const gridRows = Math.ceil((bottom - Math.min(...opaqueRows) + 1) / TETRIS.block);
  const blockOf = (column: number, row: number) =>
    Math.floor((bottom - row) / TETRIS.block) * gridColumns +
    Math.floor((column - left) / TETRIS.block);

  const filled = new Uint8Array(gridColumns * gridRows);
  opaqueColumns.forEach((column, i) => (filled[blockOf(column, opaqueRows[i]!)] = 1));
  const pieceOf = splitIntoPieces(filled, gridColumns);
  const pieces = schedulePieces(pieceOf, gridColumns, firstTick);
  const completedTick = Math.max(...pieces.map((piece) => piece[3]));

  const positions: number[] = [];
  const colors: number[] = [];
  const cells: number[] = [];
  const grid: number[] = [];
  const drops: number[] = [];
  const digits: number[] = [];
  const layout = layoutDigits(opaqueColumns, opaqueRows);
  const addPixel = (column: number, row: number) => {
    positions.push(column + 0.5 - center.x, center.y - row - 0.5, 0);
    cells.push(column, row);
    grid.push(column - left + 0.5, bottom - row + 0.5);
  };
  opaqueColumns.forEach((column, i) => {
    const row = opaqueRows[i]!;
    const pixel = (row * width + column) * 4;
    addPixel(column, row);
    colors.push(...data.subarray(pixel, pixel + 3));
    drops.push(...pieces[pieceOf[blockOf(column, row)]!]!);
    digits.push(...(layout.digitAt(column, row) ?? [0, 0, 0, 0]));
  });
  for (let hole = 0; hole < layout.holes.length; hole += 2) {
    const column = layout.holes[hole]!;
    const row = layout.holes[hole + 1]!;
    const [x = 0, y = 0, scale = 0, delay = 0] = layout.digitAt(column, row)!;
    addPixel(column, row);
    colors.push(0, 0, 0);
    drops.push(0, 0, NEVER, NEVER);
    digits.push(x, y, -scale, delay);
  }

  const pixels = new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute(positions, 3))
    .setAttribute('color', new BufferAttribute(new Uint8Array(colors), 3, true))
    .setAttribute('aCell', new Float32BufferAttribute(cells, 2))
    .setAttribute('aGrid', new Float32BufferAttribute(grid, 2))
    .setAttribute('aPiece', new Float32BufferAttribute(drops, 4))
    .setAttribute('aDigit', new Float32BufferAttribute(digits, 4))
    .setAttribute(
      'aCompleted',
      new Float32BufferAttribute(new Float32Array(positions.length / 3).fill(completedTick), 1),
    );
  for (let material = 0; material < 4; material++) {
    pixels.addGroup(0, positions.length / 3, material);
  }
  return { pixels, completedTick };
}

function splitIntoPieces(filled: Uint8Array, columns: number): Int32Array {
  const pieceOf = new Int32Array(filled.length).fill(-1);
  const neighborsOf = (cell: number) =>
    [
      cell % columns > 0 ? cell - 1 : -1,
      cell % columns < columns - 1 ? cell + 1 : -1,
      cell - columns,
      cell + columns,
    ].filter((neighbor) => neighbor >= 0 && neighbor < filled.length && filled[neighbor]);
  const size = Math.ceil(filled.reduce((sum, cell) => sum + cell, 0) / TETRIS.piecesPerLetter);
  const sizes: number[] = [];

  for (let seed = 0; seed < filled.length; seed++) {
    if (!filled[seed] || pieceOf[seed]! >= 0) continue;
    const piece = sizes.length;
    const frontier = [seed];
    const cost = (cell: number) =>
      Math.floor(cell / columns) -
      Math.floor(seed / columns) +
      0.7 * Math.abs((cell % columns) - (seed % columns));
    let grown = 0;
    while (frontier.length > 0 && grown < size) {
      const nearest = frontier.reduce(
        (best, cell, i) => (cost(cell) < cost(frontier[best]!) ? i : best),
        0,
      );
      const cell = frontier.splice(nearest, 1)[0]!;
      pieceOf[cell] = piece;
      grown++;
      for (const neighbor of neighborsOf(cell)) {
        if (pieceOf[neighbor]! < 0 && !frontier.includes(neighbor)) frontier.push(neighbor);
      }
    }
    sizes.push(grown);
  }

  for (let piece = sizes.length - 1; piece >= 0; piece--) {
    if (sizes[piece]! * 2 >= size) continue;
    const cells = cellsOf(pieceOf, piece);
    const touching = cells
      .flatMap(neighborsOf)
      .map((cell) => pieceOf[cell]!)
      .filter((owner) => owner !== piece);
    if (touching.length === 0) continue;
    const target = Math.max(...touching);
    for (const cell of cells) pieceOf[cell] = target;
    sizes[target]! += sizes[piece]!;
    sizes[piece] = 0;
  }

  const order = sizes.flatMap((count, piece) => (count > 0 ? [piece] : []));
  return pieceOf.map((owner) => order.indexOf(owner));
}

function schedulePieces(
  pieceOf: Int32Array,
  columns: number,
  firstTick: number,
): [number, number, number, number][] {
  const count = Math.max(...pieceOf) + 1;
  let land = 0;
  return Array.from({ length: count }, (_, piece) => {
    const blocks = cellsOf(pieceOf, piece);
    const columnsOf = blocks.map((cell) => cell % columns);
    const rowsOf = blocks.map((cell) => Math.floor(cell / columns));
    const average = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    const spawn = firstTick + piece * TETRIS.spawnGap;
    land = Math.max(spawn + TETRIS.well - Math.max(...rowsOf) - 1, land + 2);
    return [
      (Math.round(average(columnsOf)) + 0.5) * TETRIS.block,
      (Math.round(average(rowsOf)) + 0.5) * TETRIS.block,
      spawn - Math.floor(Math.random() * TETRIS.spawnSpread),
      land,
    ];
  });
}

function cellsOf(pieceOf: Int32Array, piece: number): number[] {
  return [...pieceOf.keys()].filter((cell) => pieceOf[cell] === piece);
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
