import {
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type IUniform,
  type Mesh,
  OrthographicCamera,
  Points,
  type RawShaderMaterial,
  Scene,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { resolveUniforms } from './programs';

const WIDTH = 256;

type Watched = {
  geometry: InstancedBufferGeometry;
  full: InstancedBufferAttribute[];
  drawn: InstancedBufferAttribute[];
  base: number;
  count: number;
  ranges?: { slots: Uint32Array; corners: Uint32Array };
};

export type Roll = { tilesClimbed: number; present: Uint32Array[] };
export type Census = { material: RawShaderMaterial; vertex: { name: string; value: number[] }[] };

export class Presence {
  readonly uniforms = {
    uPresence: { value: 0 },
    uPresenceSize: { value: new Vector2(WIDTH, 1) },
    uPresenceBase: { value: 0 },
  };
  private watched: Watched[] = [];
  private total = 0;
  private census = new Scene();
  private camera = new OrthographicCamera();
  private target = new WebGLRenderTarget(WIDTH, 1);

  constructor(private uTilesClimbed: IUniform<number>) {}

  watch(
    mesh: Mesh<InstancedBufferGeometry, RawShaderMaterial>,
    census: Census = { material: mesh.material, vertex: [] },
  ): void {
    const { geometry } = mesh;
    const names = Object.keys(geometry.attributes).filter(
      (name) => geometry.attributes[name] instanceof InstancedBufferAttribute,
    );
    const full = names.map((name) => geometry.getAttribute(name) as InstancedBufferAttribute);
    const drawn = full.map((attribute) => {
      const copy = new InstancedBufferAttribute(attribute.array.slice(), attribute.itemSize);
      copy.setUsage(DynamicDrawUsage);
      return copy;
    });
    names.forEach((name, index) => geometry.setAttribute(name, drawn[index]!));
    const count = geometry.instanceCount;
    const slots = new InstancedBufferGeometry();
    slots.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3));
    for (const { name, value } of census.vertex) {
      slots.setAttribute(name, new Float32BufferAttribute(value, value.length));
    }
    names.forEach((name, index) => slots.setAttribute(name, full[index]!));
    slots.instanceCount = count;
    const base = this.count(slots, census.material);
    this.watched.push({ geometry, full, drawn, base, count });
  }

  watchRanges(
    geometry: InstancedBufferGeometry,
    ranges: Uint32Array,
    slots: Record<string, InstancedBufferAttribute>,
    material: RawShaderMaterial,
  ): void {
    const count = ranges.length / 2;
    const index = geometry.index!;
    index.setUsage(DynamicDrawUsage);
    const points = new InstancedBufferGeometry();
    points.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3));
    for (const [name, attribute] of Object.entries(slots)) points.setAttribute(name, attribute);
    points.instanceCount = count;
    const base = this.count(points, material);
    const corners = (index.array as Uint32Array).slice();
    this.watched.push({
      geometry,
      full: [],
      drawn: [],
      base,
      count,
      ranges: { slots: ranges, corners },
    });
  }

  private count(slots: InstancedBufferGeometry, material: RawShaderMaterial): number {
    const base = this.total;
    const points = new Points(slots, material);
    points.frustumCulled = false;
    points.onBeforeRender = () => {
      this.uniforms.uPresenceBase.value = base;
      material.uniformsNeedUpdate = true;
    };
    this.census.add(points);
    this.total += slots.instanceCount;
    const height = Math.ceil(this.total / WIDTH);
    this.target.setSize(WIDTH, height);
    this.uniforms.uPresenceSize.value.set(WIDTH, height);
    return base;
  }

  async compile(renderer: WebGLRenderer): Promise<void> {
    await renderer.compileAsync(this.census, this.camera);
    const materials = new Set(this.census.children.map((points) => (points as Points).material));
    for (const material of materials) {
      resolveUniforms(renderer, material as RawShaderMaterial);
      await new Promise((resolve) => setTimeout(resolve));
    }
  }

  async take(renderer: WebGLRenderer, tilesClimbed: number): Promise<Roll> {
    const climbed = this.uTilesClimbed.value;
    const target = renderer.getRenderTarget();
    const clearColor = renderer.getClearColor(new Color());
    const clearAlpha = renderer.getClearAlpha();
    this.uTilesClimbed.value = tilesClimbed;
    this.uniforms.uPresence.value = 1;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0, 0);
    renderer.clear();
    renderer.render(this.census, this.camera);
    renderer.setRenderTarget(target);
    renderer.setClearColor(clearColor, clearAlpha);
    this.uniforms.uPresence.value = 0;
    this.uTilesClimbed.value = climbed;
    const { width, height } = this.target;
    const pixels = new Uint8Array(width * height * 4);
    await renderer.readRenderTargetPixelsAsync(this.target, 0, 0, width, height, pixels);
    const present = this.watched.map(({ base, count }) => {
      const found: number[] = [];
      for (let slot = 0; slot < count; slot++) {
        if (pixels[(base + slot) * 4]! > 0) found.push(slot);
      }
      return Uint32Array.from(found);
    });
    return { tilesClimbed, present };
  }

  whole(tilesClimbed: number): Roll {
    const present = this.watched.map(({ count }) =>
      Uint32Array.from({ length: count }, (_, slot) => slot),
    );
    return { tilesClimbed, present };
  }

  apply({ present }: Roll): void {
    this.watched.forEach(({ geometry, full, drawn, ranges }, index) => {
      const slots = present[index]!;
      if (ranges) {
        const corners = geometry.index!;
        const array = corners.array as Uint32Array;
        let filled = 0;
        for (const slot of slots) {
          const start = ranges.slots[2 * slot]!;
          const length = ranges.slots[2 * slot + 1]!;
          array.set(ranges.corners.subarray(start, start + length), filled);
          filled += length;
        }
        corners.clearUpdateRanges();
        corners.addUpdateRange(0, filled);
        corners.needsUpdate = true;
        geometry.setDrawRange(0, filled);
        return;
      }
      drawn.forEach((attribute, column) => {
        const { itemSize } = attribute;
        const source = full[column]!.array as Float32Array;
        const array = attribute.array as Float32Array;
        if (slots.length * itemSize === source.length) {
          array.set(source);
        } else {
          slots.forEach((slot, at) => {
            array.set(source.subarray(slot * itemSize, (slot + 1) * itemSize), at * itemSize);
          });
        }
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, slots.length * itemSize);
        attribute.needsUpdate = true;
      });
      geometry.instanceCount = slots.length;
    });
  }
}
