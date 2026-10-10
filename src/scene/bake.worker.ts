import { bakeFbm } from './noise';
import { bakeOcclusion, type OcclusionBake } from './occlusion';
import { pigeonGeometry } from './pigeon';

export type MapsRequest = Record<
  'occlusion' | 'blocklessOcclusion' | 'leftOcclusion' | 'rightOcclusion',
  OcclusionBake
>;
export type TowerMaps = ReturnType<typeof bake>;

function bake(request: MapsRequest) {
  return {
    fbm: bakeFbm(),
    occlusion: bakeOcclusion(request.occlusion),
    blocklessOcclusion: bakeOcclusion(request.blocklessOcclusion),
    leftOcclusion: bakeOcclusion(request.leftOcclusion),
    rightOcclusion: bakeOcclusion(request.rightOcclusion),
    pigeon: pigeon(),
  };
}

function pigeon() {
  const geometry = pigeonGeometry();
  return {
    index: geometry.index!.array as Uint16Array | Uint32Array,
    attributes: Object.entries(geometry.attributes).map(([name, attribute]) => ({
      name,
      array: attribute.array as Float32Array,
      itemSize: attribute.itemSize,
    })),
  };
}

addEventListener('message', (event: MessageEvent<MapsRequest>) => {
  const maps = bake(event.data);
  const { pigeon, ...textures } = maps;
  postMessage(maps, {
    transfer: [
      ...Object.values(textures).map((texels) => texels.buffer),
      pigeon.index.buffer,
      ...pigeon.attributes.map(({ array }) => array.buffer),
    ],
  });
});
