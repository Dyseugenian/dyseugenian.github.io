export type Tier = 'low' | 'medium' | 'high';

export const TIERS: Record<Tier, { maxPixelRatio: number; particles: number }> = {
  low: { maxPixelRatio: 1, particles: 20_000 },
  medium: { maxPixelRatio: 1.5, particles: 40_000 },
  high: { maxPixelRatio: 2, particles: 80_000 },
};

const LOWER_TIER: Record<Tier, Tier | null> = { high: 'medium', medium: 'low', low: null };

const FRAME_BUDGET_MS = 18;

const WARMUP_SECONDS = 1.5;
const WINDOW_SECONDS = 2;

const IGNORE_FRAMES_OVER_MS = 100;

export class Quality {
  tier: Tier = guessTier();

  private frameTimes: number[] = [];
  private elapsed = -WARMUP_SECONDS;

  constructor(private onChange: () => void) {}

  get settings() {
    return TIERS[this.tier];
  }

  setTier(tier: Tier): void {
    this.tier = tier;
    this.onChange();
  }

  measure(frameMs: number, dt: number): void {
    if (frameMs > IGNORE_FRAMES_OVER_MS) return;

    this.elapsed += dt;
    if (this.elapsed < 0) return;

    this.frameTimes.push(frameMs);
    if (this.elapsed < WINDOW_SECONDS) return;

    const lower = LOWER_TIER[this.tier];
    if (lower && percentile(this.frameTimes, 0.9) > FRAME_BUDGET_MS) {
      this.setTier(lower);
    }
    this.frameTimes = [];
    this.elapsed = 0;
  }
}

function guessTier(): Tier {
  const memoryGb = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency || 4;
  const isTouchDevice = matchMedia('(pointer: coarse)').matches;

  if (isTouchDevice || memoryGb <= 2 || cores <= 2) return 'low';
  if (memoryGb <= 4 || cores <= 4) return 'medium';
  return 'high';
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
}
