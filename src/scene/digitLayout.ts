const CELL = { width: 8, height: 12 };
const GLYPH = { width: 3, height: 5 };
const SMALL = { scale: 2, coverage: 0.5 };
const BIG = { scale: 4, coverage: 0.85, chance: 0.5 };
export const CLOSE_RADIUS = 3;
const CASCADE = { digitsPerSeed: 30, seedSpread: 3 };

export interface DigitLayout {
  digitAt(column: number, row: number): number[] | undefined;
  holes: number[];
}

export function layoutDigits(columns: number[], rows: number[]): DigitLayout {
  const left = Math.min(...columns) - CLOSE_RADIUS;
  const top = Math.min(...rows) - CLOSE_RADIUS;
  const width = Math.max(...columns) - left + 1 + CLOSE_RADIUS;
  const height = Math.max(...rows) - top + 1 + CLOSE_RADIUS;
  const inside = new Uint8Array(width * height);
  columns.forEach((column, i) => (inside[(rows[i]! - top) * width + column - left] = 1));
  const solid = closeHoles(inside, width, height);

  const summed = new Uint32Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y++) {
    for (let x = 1; x <= width; x++) {
      summed[y * (width + 1) + x] =
        solid[(y - 1) * width + x - 1]! +
        summed[(y - 1) * (width + 1) + x]! +
        summed[y * (width + 1) + x - 1]! -
        summed[(y - 1) * (width + 1) + x - 1]!;
    }
  }
  const coverage = (x: number, y: number, scale: number) => {
    const w = GLYPH.width * scale;
    const h = GLYPH.height * scale;
    const x0 = Math.min(Math.max(x - left, 0), width);
    const y0 = Math.min(Math.max(y - top, 0), height);
    const x1 = Math.min(Math.max(x + w - left, 0), width);
    const y1 = Math.min(Math.max(y + h - top, 0), height);
    const covered =
      summed[y1 * (width + 1) + x1]! -
      summed[y0 * (width + 1) + x1]! -
      summed[y1 * (width + 1) + x0]! +
      summed[y0 * (width + 1) + x0]!;
    return covered / (w * h);
  };

  const firstColumn = Math.floor(left / CELL.width);
  const firstRow = Math.floor(top / CELL.height);
  const across = Math.floor((left + width - 1) / CELL.width) - firstColumn + 1;
  const down = Math.floor((top + height - 1) / CELL.height) - firstRow + 1;
  const owner = new Int32Array(across * down).fill(-1);
  const digits: number[][] = [];
  const originX = (column: number, scale: number) =>
    (firstColumn + column) * CELL.width + scale / 2;
  const originY = (row: number, scale: number) => (firstRow + row) * CELL.height + scale / 2;

  const blocks: [number, number][] = [];
  for (let row = 0; row < down - 1; row++) {
    for (let column = 0; column < across - 1; column++) blocks.push([column, row]);
  }
  shuffle(blocks);
  for (const [column, row] of blocks) {
    const cells = [0, 1, across, across + 1].map((offset) => row * across + column + offset);
    if (Math.random() >= BIG.chance || cells.some((cell) => owner[cell]! >= 0)) continue;
    const x = originX(column, BIG.scale);
    const y = originY(row, BIG.scale);
    if (coverage(x, y, BIG.scale) < BIG.coverage) continue;
    for (const cell of cells) owner[cell] = digits.length;
    digits.push([x, y, BIG.scale, 0]);
  }

  for (let row = 0; row < down; row++) {
    for (let column = 0; column < across; column++) {
      if (owner[row * across + column]! >= 0) continue;
      const x = originX(column, SMALL.scale);
      const y = originY(row, SMALL.scale);
      if (coverage(x, y, SMALL.scale) < SMALL.coverage) continue;
      owner[row * across + column] = digits.length;
      digits.push([x, y, SMALL.scale, 0]);
    }
  }

  cascadeDelays(owner, across, digits.length).forEach(
    (delay, digit) => (digits[digit]![3] = delay),
  );

  const digitAt = (column: number, row: number) => {
    const cellColumn = Math.floor(column / CELL.width) - firstColumn;
    const cellRow = Math.floor(row / CELL.height) - firstRow;
    if (cellColumn < 0 || cellColumn >= across || cellRow < 0 || cellRow >= down) return undefined;
    return digits[owner[cellRow * across + cellColumn]!];
  };

  const holes: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (inside[y * width + x] || !solid[y * width + x]) continue;
      const column = left + x;
      const row = top + y;
      const digit = digitAt(column, row);
      if (!digit) continue;
      const [digitX, digitY, scale] = digit as [number, number, number];
      if (column < digitX || column >= digitX + GLYPH.width * scale) continue;
      if (row < digitY || row >= digitY + GLYPH.height * scale) continue;
      holes.push(column, row);
    }
  }
  return { digitAt, holes };
}

function cascadeDelays(owner: Int32Array, across: number, count: number): Float32Array {
  const neighbors = Array.from({ length: count }, () => new Set<number>());
  owner.forEach((digit, cell) => {
    if (digit < 0) return;
    const column = cell % across;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (column + dx < 0 || column + dx >= across) continue;
        const other = owner[cell + dy * across + dx] ?? -1;
        if (other >= 0 && other !== digit) neighbors[digit]!.add(other);
      }
    }
  });

  const arrival = new Float32Array(count).fill(Infinity);
  const done = new Uint8Array(count);
  const seed = (digit: number) => (arrival[digit] = Math.random() * CASCADE.seedSpread);
  for (let i = 0; i < Math.max(1, Math.round(count / CASCADE.digitsPerSeed)); i++) {
    seed(Math.floor(Math.random() * count));
  }
  for (let settled = 0; settled < count; settled++) {
    let next = -1;
    for (let digit = 0; digit < count; digit++) {
      if (!done[digit] && (next < 0 || arrival[digit]! < arrival[next]!)) next = digit;
    }
    if (arrival[next] === Infinity) seed(next);
    done[next] = 1;
    for (const other of neighbors[next]!) {
      arrival[other] = Math.min(arrival[other]!, arrival[next]! + 0.5 + Math.random());
    }
  }
  const latest = Math.max(...arrival, 1e-6);
  return arrival.map((time) => time / latest);
}

export function closeHoles(mask: Uint8Array, width: number, height: number): Uint8Array {
  const sweep = (source: Uint8Array, dx: number, dy: number, all: boolean) => {
    const result = new Uint8Array(source.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let value = all ? 1 : 0;
        for (let k = -CLOSE_RADIUS; k <= CLOSE_RADIUS; k++) {
          const sx = x + k * dx;
          const sy = y + k * dy;
          const sample =
            sx >= 0 && sx < width && sy >= 0 && sy < height ? source[sy * width + sx]! : 0;
          value = all ? value & sample : value | sample;
        }
        result[y * width + x] = value;
      }
    }
    return result;
  };
  const grown = sweep(sweep(mask, 1, 0, false), 0, 1, false);
  return sweep(sweep(grown, 1, 0, true), 0, 1, true);
}

function shuffle<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}
