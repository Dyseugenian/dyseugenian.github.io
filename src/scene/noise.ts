import {
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  RGFormat,
  RedFormat,
  RepeatWrapping,
} from 'three';

const SIZE = 256;
const SLICE = { x: 37, y: 17 };

const FBM = { size: 1024, cells: 32, octaves: 4 };

function randomBytes(seed: number, count: number): Uint8Array {
  let state = seed;
  return Uint8Array.from({ length: count }, () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return (mixed ^ (mixed >>> 14)) >>> 24;
  });
}

function repeating(
  texels: Uint8Array | Uint16Array,
  size: number,
  format: typeof RedFormat | typeof RGFormat,
) {
  const texture = new DataTexture(texels, size, size, format);
  if (texels instanceof Uint16Array) texture.type = HalfFloatType;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

export function noiseTexture(): DataTexture {
  const values = randomBytes(0x9e3779b9, SIZE * SIZE);
  const texels = new Uint8Array(SIZE * SIZE * 2);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const next = ((x + SLICE.x) % SIZE) + ((y + SLICE.y) % SIZE) * SIZE;
      texels[2 * (x + y * SIZE)] = values[x + y * SIZE]!;
      texels[2 * (x + y * SIZE) + 1] = values[next]!;
    }
  }
  return repeating(texels, SIZE, RGFormat);
}

export function bakeFbm(): Float32Array<ArrayBuffer> {
  const { size, cells, octaves } = FBM;
  const lattice = randomBytes(0x85ebca6b, SIZE * SIZE);
  const sums = new Float32Array(size * size);
  const near = new Int32Array(size);
  const far = new Int32Array(size);
  const blend = new Float32Array(size);
  for (let octave = 0, weight = 0.5 / 255; octave < octaves; octave++, weight *= 0.5) {
    const period = cells << octave;
    const shift = octave * 67;
    for (let i = 0; i < size; i++) {
      const u = (i / size) * period;
      const cell = Math.floor(u);
      const t = u - cell;
      near[i] = (cell + shift) % SIZE;
      far[i] = (((cell + 1) % period) + shift) % SIZE;
      blend[i] = t * t * (3 - 2 * t);
    }
    for (let y = 0; y < size; y++) {
      const bottom = near[y]! * SIZE;
      const top = far[y]! * SIZE;
      const fy = blend[y]!;
      for (let x = 0; x < size; x++) {
        const left = near[x]!;
        const right = far[x]!;
        const fx = blend[x]!;
        const low =
          lattice[left + bottom]! + (lattice[right + bottom]! - lattice[left + bottom]!) * fx;
        const high = lattice[left + top]! + (lattice[right + top]! - lattice[left + top]!) * fx;
        sums[x + y * size]! += (low + (high - low) * fy) * weight;
      }
    }
  }
  return sums;
}

export function fbmTexture(sums: Float32Array): DataTexture {
  const texels = Uint16Array.from(sums, (sum) => DataUtils.toHalfFloat(sum));
  return repeating(texels, FBM.size, RedFormat);
}
