import { bakeFbm } from './noise';
import { bakeOcclusion } from './occlusion';
import { type Occlusion, type TowerGeometry, towerGeometry } from './towerGeometry';

export type TowerMaps = {
  fbm: Uint16Array<ArrayBuffer>;
  occlusion: Record<Occlusion, Uint8Array<ArrayBuffer>>;
};
export type BakeReply = { geometry: TowerGeometry } | { maps: TowerMaps };

function buffersOf({ facade, traces }: TowerGeometry): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const { geometry } of [...facade, ...traces]) {
    if (geometry.index) buffers.add(geometry.index.buffer);
    for (const { array } of geometry.attributes) buffers.add(array.buffer);
  }
  return [...buffers];
}

const { geometry, occlusion } = towerGeometry();
postMessage({ geometry } satisfies BakeReply, { transfer: buffersOf(geometry) });

const maps: TowerMaps = {
  fbm: bakeFbm(),
  occlusion: {
    tiles: bakeOcclusion(occlusion.tiles),
    blockless: bakeOcclusion(occlusion.blockless),
    left: bakeOcclusion(occlusion.left),
    right: bakeOcclusion(occlusion.right),
  },
};
postMessage({ maps } satisfies BakeReply, {
  transfer: [maps.fbm.buffer, ...Object.values(maps.occlusion).map((texels) => texels.buffer)],
});
close();
