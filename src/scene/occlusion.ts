type Point = { x: number; y: number; z: number };
type Box = { min: Point; max: Point };

export type OcclusionBake = { solids: Box[]; corner: Point; extent: Point };

export const OCCLUSION = {
  width: 20,
  height: 40,
  depth: 24,
  reach: 1.4,
  probes: 48,
  back: -3.6,
  front: 1.6,
};

function probePoints(): Point[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: OCCLUSION.probes }, (_, index) => {
    const y = 1 - (2 * (index + 0.5)) / OCCLUSION.probes;
    const ring = Math.sqrt(1 - y * y);
    const radius = OCCLUSION.reach * Math.cbrt((index + 0.5) / OCCLUSION.probes);
    return {
      x: Math.cos(golden * index) * ring * radius,
      y: y * radius,
      z: Math.sin(golden * index) * ring * radius,
    };
  });
}

function contains({ min, max }: Box, x: number, y: number, z: number): boolean {
  return x > min.x && x < max.x && y > min.y && y < max.y && z > min.z && z < max.z;
}

export function bakeOcclusion({ solids, corner, extent }: OcclusionBake): Uint8Array<ArrayBuffer> {
  const { width, height, depth, reach } = OCCLUSION;
  const probes = probePoints();
  const openness = new Uint8Array(width * height * depth);
  for (let z = 0; z < depth; z++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cellX = ((x + 0.5) / width) * extent.x + corner.x;
        const cellY = ((y + 0.5) / height) * extent.y + corner.y;
        const cellZ = ((z + 0.5) / depth) * extent.z + corner.z;
        const near = solids.filter(
          ({ min, max }) =>
            cellX > min.x - reach &&
            cellX < max.x + reach &&
            cellY > min.y - reach &&
            cellY < max.y + reach &&
            cellZ > min.z - reach &&
            cellZ < max.z + reach,
        );
        let open = 0;
        for (const probe of probes) {
          const [sampleX, sampleY, sampleZ] = [cellX + probe.x, cellY + probe.y, cellZ + probe.z];
          if (!near.some((solid) => contains(solid, sampleX, sampleY, sampleZ))) open++;
        }
        openness[x + width * (y + height * z)] = Math.round((255 * open) / probes.length);
      }
    }
  }
  return openness;
}
