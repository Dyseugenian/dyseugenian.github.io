import { layoutDigits } from './digitLayout';
import { traceOutline } from './letterOutline';
import { PEN, timePath, type PenPath } from './penPath';

const LETTER_STARTS = [0, 106, 183, 259, 333, 405, 483, 552, 630, 671, 744];
const EDGE_FALLOFF = 6;
export const TETRIS = {
  block: 14,
  tick: 0.04,
  piecesPerLetter: 6,
  well: 24,
  spawnGap: 9,
  spawnSpread: 16,
  minCoverage: 0.3,
  fadeInTicks: 5,
  clearTicks: 6,
};
const NEVER = 1e6;
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export interface LetterPixels {
  home: [number, number];
  positions: Float32Array<ArrayBuffer>;
  colors: Uint8Array<ArrayBuffer>;
  cells: Float32Array<ArrayBuffer>;
  grid: Float32Array<ArrayBuffer>;
  drops: Float32Array<ArrayBuffer>;
  digits: Float32Array<ArrayBuffer>;
  completedTick: number;
  path: PenPath;
  sites: Float32Array<ArrayBuffer>;
}

export interface WordmarkPixels {
  width: number;
  height: number;
  letters: LetterPixels[];
  sources: Float32Array<ArrayBuffer>;
}

export async function bakeWordmark(wordmarkUrl: string, dustUrl: string): Promise<WordmarkPixels> {
  const [image, dust] = await Promise.all([readImage(wordmarkUrl), readImage(dustUrl)]);
  const letters = LETTER_STARTS.map((start, index): LetterPixels => {
    const end = LETTER_STARTS[index + 1] ?? image.width;
    const center = { x: (start + end) / 2, y: image.height / 2 };
    const firstTick = (index * 5) % TETRIS.spawnGap;
    const drawStart = PEN.drawStart + index * PEN.stagger;
    return {
      home: [center.x, -center.y],
      ...createPixels(image, start, end, center, firstTick, drawStart),
      sites: findSites(dust, image, start, end, center),
    };
  });
  return { width: image.width, height: image.height, letters, sources: letterSources(image) };
}

function letterSources({ width, height, data }: ImageData): Float32Array<ArrayBuffer> {
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
  return new Float32Array(sources);
}

async function readImage(url: string): Promise<ImageData> {
  const response = await fetch(url);
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d', {
    willReadFrequently: true,
  })!;
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, bitmap.width, bitmap.height);
}

function createPixels(
  { width, height, data }: ImageData,
  start: number,
  end: number,
  center: { x: number; y: number },
  firstTick: number,
  drawStart: number,
): Omit<LetterPixels, 'home' | 'sites'> {
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
  const coverage = new Float32Array(gridColumns * gridRows);
  opaqueColumns.forEach((column, i) => {
    const block = blockOf(column, opaqueRows[i]!);
    filled[block] = 1;
    coverage[block]! += 1 / TETRIS.block ** 2;
  });
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
  const path = timePath(traceOutline(opaqueColumns, opaqueRows), drawStart);
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
    const block = blockOf(column, row);
    const [x, y, spawn, land] = pieces[pieceOf[block]!]!;
    drops.push(x, y, coverage[block]! < TETRIS.minCoverage ? land : spawn, land);
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

  return {
    positions: new Float32Array(positions),
    colors: new Uint8Array(colors),
    cells: new Float32Array(cells),
    grid: new Float32Array(grid),
    drops: new Float32Array(drops),
    digits: new Float32Array(digits),
    completedTick,
    path,
  };
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
    const middle = [average(columnsOf) + 0.5, average(rowsOf) + 0.5];
    const blockCenter = middle.map((value) => Math.round(value - 0.5) + 0.5);
    const blockCorner = middle.map(Math.round);
    const distanceTo = (pivot: number[]) =>
      Math.hypot(pivot[0]! - middle[0]!, pivot[1]! - middle[1]!);
    const pivot = distanceTo(blockCorner) < distanceTo(blockCenter) ? blockCorner : blockCenter;
    return [
      pivot[0]! * TETRIS.block,
      pivot[1]! * TETRIS.block,
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
): Float32Array<ArrayBuffer> {
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
  return new Float32Array(sites);
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
