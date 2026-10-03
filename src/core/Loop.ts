export interface Frame {
  dt: number;
  time: number;
  frameMs: number;
}

const MAX_DT = 1 / 20;

export class Loop {
  private time = 0;
  private lastNow = 0;

  constructor(private onFrame: (frame: Frame) => void) {}

  start(): void {
    this.lastNow = performance.now();
    requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    const frameMs = now - this.lastNow;
    const dt = Math.min(frameMs / 1000, MAX_DT);
    this.lastNow = now;
    this.time += dt;

    this.onFrame({ dt, time: this.time, frameMs });
    requestAnimationFrame(this.tick);
  };
}
