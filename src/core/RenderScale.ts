const REDUCED = 0.75;
const GPU_BUDGET_MS = 22;
const FRAME_BUDGET_MS = 1000 / 45;
const DECIDE_SECONDS = 1;
const RESTORE_BELOW = 0.5;
const SMOOTHING = 0.1;
const REMEMBERED = 'reduced-tower';

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
  scale = localStorage.getItem(REMEMBERED) ? REDUCED : 1;
  private timer: GpuTimer | null = null;
  private frameMs = 0;
  private measured = 0;
  private decided = false;

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

  reconsider(): void {
    this.decided = false;
    this.measured = 0;
    this.frameMs = 0;
  }

  update(dt: number, active: boolean): boolean {
    if (!active || this.decided) return false;
    const sample = this.timer ? this.timer.read() : dt * 1000;
    if (sample === null) return false;
    this.frameMs = this.frameMs === 0 ? sample : this.frameMs + (sample - this.frameMs) * SMOOTHING;
    this.measured += dt;
    if (this.measured < DECIDE_SECONDS) return false;
    this.decided = true;
    const budget = this.timer ? GPU_BUDGET_MS : FRAME_BUDGET_MS;
    const reduced = this.scale < 1 ? this.frameMs > budget * RESTORE_BELOW : this.frameMs > budget;
    if (reduced) localStorage.setItem(REMEMBERED, '1');
    else localStorage.removeItem(REMEMBERED);
    const scale = reduced ? REDUCED : 1;
    if (scale === this.scale) return false;
    this.scale = scale;
    return true;
  }
}
