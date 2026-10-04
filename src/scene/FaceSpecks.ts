import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  GLSL3,
  MathUtils,
  Points,
  RawShaderMaterial,
  type IUniform,
} from 'three';
import vertexShader from '../shaders/face-specks.vert';
import fragmentShader from '../shaders/specks.frag';

const SPECKS = { count: 520, life: [1.2, 3.2], reach: 16 } as const;
const BRIGHT = 0.45;
const DARK = 0.12;

export class FaceSpecks extends Points<BufferGeometry, RawShaderMaterial> {
  constructor(image: ImageData, uniforms: Record<string, IUniform>) {
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: { ...uniforms, uReach: { value: SPECKS.reach } },
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    super(createSpecks(image), material);
    this.frustumCulled = false;
  }
}

function createSpecks({ width, height, data }: ImageData): BufferGeometry {
  const lightness = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    const pixel = (y * width + x) * 4;
    return ((data[pixel] ?? 0) + (data[pixel + 1] ?? 0) + (data[pixel + 2] ?? 0)) / 765;
  };
  const edges: { x: number; y: number; outX: number; outY: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (lightness(x, y) < BRIGHT) continue;
      let outX = 0;
      let outY = 0;
      let touchesDark = false;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const darkness = 1 - lightness(x + dx, y + dy);
          outX += dx * darkness;
          outY += dy * darkness;
          if (Math.abs(dx) + Math.abs(dy) <= 2 && darkness > 1 - DARK) touchesDark = true;
        }
      }
      const length = Math.hypot(outX, outY);
      if (touchesDark && length > 0) edges.push({ x, y, outX: outX / length, outY: outY / length });
    }
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const directions: number[] = [];
  const lives: number[] = [];
  for (let i = 0; i < SPECKS.count; i++) {
    const edge = edges[Math.floor(Math.random() * edges.length)]!;
    const pixel = (edge.y * width + edge.x) * 4;
    positions.push(edge.x + 0.5 - width / 2, height / 2 - edge.y - 0.5, 0);
    colors.push(...[...data.subarray(pixel, pixel + 3)].map((channel) => channel / 255));
    directions.push(edge.outX, -edge.outY);
    lives.push(MathUtils.randFloat(...SPECKS.life), Math.random(), Math.random());
  }

  return new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute(positions, 3))
    .setAttribute('color', new Float32BufferAttribute(colors, 3))
    .setAttribute('aDirection', new Float32BufferAttribute(directions, 2))
    .setAttribute('aLife', new Float32BufferAttribute(lives, 3));
}
