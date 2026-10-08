import { bakeFbm } from './noise';
import { bakeOcclusion, type OcclusionBake } from './occlusion';

export type MapsRequest = Record<'occlusion' | 'leftOcclusion' | 'rightOcclusion', OcclusionBake>;
export type TowerMaps = ReturnType<typeof bake>;

function bake(request: MapsRequest) {
  return {
    fbm: bakeFbm(),
    occlusion: bakeOcclusion(request.occlusion),
    leftOcclusion: bakeOcclusion(request.leftOcclusion),
    rightOcclusion: bakeOcclusion(request.rightOcclusion),
  };
}

addEventListener('message', (event: MessageEvent<MapsRequest>) => {
  const maps = bake(event.data);
  postMessage(maps, { transfer: Object.values(maps).map((texels) => texels.buffer) });
});
