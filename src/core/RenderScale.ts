const SCALE = { min: 1, max: 1, step: 0.05 };
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
    let nanoseconds: number | null = null;
    let read = 0;
    for (const query of this.pending) {
      if (!this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE)) break;
      nanoseconds = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT) as number;
      this.gl.deleteQuery(query);
      read++;
    }
    this.pending.splice(0, read);
    if (nanoseconds === null || this.gl.getParameter(this.extension.GPU_DISJOINT_EXT)) return null;
    return nanoseconds / 1e6;
  }
}

export class RenderScale {
  scale = SCALE.max;
  private timer: GpuTimer | null = null;
  private frameMs = 0;
  private refreshMs = Infinity;
  private hold = 0;
  private probeWait = PROBE_SECONDS;
  private probing = false;

  constructor(gl: WebGL2RenderingContext) {
    this.attach(gl);
  }

  attach(gl: WebGL2RenderingContext): void {
    const extension = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
    this.timer = extension ? new GpuTimer(gl, extension) : null;
    this.frameMs = 0;
  }

  beginFrame(): void {
    this.timer?.begin();
  }

  endFrame(): void {
    this.timer?.end();
  }

  update(dt: number, active: boolean): boolean {
    this.refreshMs = Math.min(this.refreshMs, dt * 1000);
    if (!active) return false;
    const frameBudget = Math.max(FRAME_BUDGET_MS, this.refreshMs);
    const sample = this.timer ? this.timer.read() : Math.min(dt * 1000, 2 * frameBudget);
    if (sample === null) return false;
    this.frameMs = this.frameMs === 0 ? sample : this.frameMs + (sample - this.frameMs) * SMOOTHING;
    this.hold -= dt;
    if (this.hold > 0) return false;
    const budget = this.timer ? GPU_BUDGET_MS : frameBudget;
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
