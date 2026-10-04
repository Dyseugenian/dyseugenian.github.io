export type Tier = 'low' | 'medium' | 'high';

export const TIERS: Record<Tier, { maxPixelRatio: number; particles: number }> = {
  low: { maxPixelRatio: 1, particles: 40_000 },
  medium: { maxPixelRatio: 1.5, particles: 80_000 },
  high: { maxPixelRatio: 2, particles: 120_000 },
};

export class Quality {
  tier: Tier = 'high';

  constructor(private onChange: () => void) {}

  get settings() {
    return TIERS[this.tier];
  }

  setTier(tier: Tier): void {
    this.tier = tier;
    this.onChange();
  }
}
