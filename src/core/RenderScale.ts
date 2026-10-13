const SCALE = { min: 0.6, max: 1, step: 0.05 };
const GPU_BUDGET_MS = 14;
const FRAME_BUDGET_MS = 1000 / 60;
const SETTLE_SECONDS = 1.5;
const PROBE_SECONDS = 8;
const SMOOTHING = 0.1;

type TimerExtension = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

class GpuTimer {
  private pending: WebGLQuery[] = [];

  constructor(
    private gl: WebGL2RenderingContext,
    private extension: TimerExtension,
  ) {}

  begin(): void {
    const query = this.gl.createQuery();
    this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
    this.pending.push(query);
  }

  end(): void {
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
  }

  read(): number | null {
    const query = this.pending[0];
    if (!query || !this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE)) return null;
    const nanoseconds = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT) as number;
    this.gl.deleteQuery(query);
    this.pending.shift();
    if (this.gl.getParameter(this.extension.GPU_DISJOINT_EXT)) return null;
    return nanoseconds / 1e6;
  }
}

export class RenderScale {
  scale = SCALE.max;
  private timer: GpuTimer | null;
  private pinned = false;
  private frameMs = 0;
  private hold = 0;
  private probeWait = PROBE_SECONDS;
  private probing = false;

  constructor(gl: WebGL2RenderingContext) {
    const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
    this.timer = extension ? new GpuTimer(gl, extension) : null;
  }

  pin(scale: number): void {
    this.scale = Math.min(Math.max(scale, SCALE.min), SCALE.max);
    this.pinned = true;
  }

  beginFrame(): void {
    if (!this.pinned) this.timer?.begin();
  }

  endFrame(): void {
    if (!this.pinned) this.timer?.end();
  }

  update(dt: number): boolean {
    if (this.pinned) return false;
    const sample = this.timer ? this.timer.read() : dt * 1000;
    if (sample === null) return false;
    this.frameMs = this.frameMs === 0 ? sample : this.frameMs + (sample - this.frameMs) * SMOOTHING;
    this.hold -= dt;
    if (this.hold > 0) return false;
    const budget = this.timer ? GPU_BUDGET_MS : FRAME_BUDGET_MS;
    if (this.frameMs > budget * 1.15 && this.scale > SCALE.min) {
      if (this.probing) this.probeWait *= 2;
      this.probing = false;
      return this.step(-SCALE.step, SETTLE_SECONDS);
    }
    if (this.scale >= SCALE.max) return false;
    if (this.timer) {
      return this.frameMs < budget * 0.8 ? this.step(SCALE.step, SETTLE_SECONDS) : false;
    }
    this.probing = true;
    return this.step(SCALE.step, this.probeWait);
  }

  private step(by: number, hold: number): boolean {
    this.scale = Math.round(Math.min(Math.max(this.scale + by, SCALE.min), SCALE.max) * 100) / 100;
    this.frameMs = 0;
    this.hold = hold;
    return true;
  }
}
