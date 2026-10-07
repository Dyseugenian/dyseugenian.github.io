import { CanvasTexture, Color, LinearFilter, Vector2, Vector3, Vector4 } from 'three';
import type { Input } from '../core/Input';
import { palette } from '../core/palette';

const REACH = { x: 6.3, y: 10.4 };
const FOLLOW_RATE = 12;
const DIM = 0.15;
const LINK_DIM = 0.5;
const DIM_DURATION = 0.2;
const GLOW_BLUR = 10;
const GLOW_FOLLOW_RATE = 4;
const GLOW_GAP_FILL = 'o';
const SPREAD_DURATION = 0.6;
const FADE_DURATION = 0.5;

export class RoleText {
  private canvas = document.createElement('canvas');
  private context = this.canvas.getContext('2d')!;
  private texture = new CanvasTexture(this.canvas);
  private glowCanvas = document.createElement('canvas');
  private glowContext = this.glowCanvas.getContext('2d')!;
  private glowTexture = new CanvasTexture(this.glowCanvas);
  private tagline = document.querySelector<HTMLElement>('.tagline')!;
  private roles = [...this.tagline.querySelectorAll<HTMLElement>('button')];
  private canHover = matchMedia('(hover: hover)').matches;
  private scale = 1;
  private padding = 0;
  private pointer = new Vector2();
  private spreadClock = new Vector3();
  private fadeClock = new Vector3();

  readonly uniforms = {
    uRoles: { value: this.texture },
    uRoleGlow: { value: this.glowTexture },
    uRolesRect: { value: new Vector4() },
    uRolesOpacity: { value: 1 },
    uRoleBoxes: { value: this.roles.map(() => new Vector4()) },
    uRoleInkEdges: { value: this.roles.map(() => new Vector2()) },
    uRoleOpacity: { value: new Vector3(1, 1, 1) },
    uRoleActive: { value: new Vector3() },
    uRoleSpread: { value: new Vector3() },
    uRoleFade: { value: new Vector3() },
    uPointer: { value: new Vector2() },
    uGlowPoint: { value: new Vector2() },
    uCanHover: { value: this.canHover ? 1 : 0 },
    uPresence: { value: 0 },
    uReach: { value: new Vector2(1, 1) },
    uOchre: { value: new Color(palette.ochre).convertLinearToSRGB() },
    uCream: { value: new Color(palette.cream).convertLinearToSRGB() },
  };

  constructor(private input: Input) {
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.glowTexture.generateMipmaps = false;
    this.glowTexture.minFilter = LinearFilter;
    document.fonts.ready.then(() => this.draw());
  }

  setSize(width: number, height: number): void {
    this.scale = width / innerWidth;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    this.uniforms.uReach.value.set(REACH.x, REACH.y).multiplyScalar(rem * this.scale);
    this.uniforms.uPointer.value.set(width, height).multiplyScalar(0.5);
    this.uniforms.uGlowPoint.value.copy(this.uniforms.uPointer.value);
    this.draw();
  }

  update(dt: number): void {
    const { uniforms, input, scale, padding } = this;
    const box = this.tagline.getBoundingClientRect();
    uniforms.uRolesRect.value.set(
      Math.round(box.left * scale) - padding,
      Math.round((innerHeight - box.bottom) * scale) - padding,
      this.canvas.width,
      this.canvas.height,
    );

    const follow = 1 - Math.exp(-FOLLOW_RATE * dt);
    const present = input.isPointerInside && !input.reducedMotion;
    uniforms.uPresence.value += ((present ? 1 : 0) - uniforms.uPresence.value) * follow;
    if (present) {
      this.pointer.set(
        ((input.pointer.x + 1) / 2) * innerWidth * scale,
        ((input.pointer.y + 1) / 2) * innerHeight * scale,
      );
      uniforms.uPointer.value.lerp(this.pointer, follow);
      uniforms.uGlowPoint.value.lerp(this.pointer, 1 - Math.exp(-GLOW_FOLLOW_RATE * dt));
    }

    const fade = dt / DIM_DURATION;
    const linkDimmed = this.canHover && input.isOnLink;
    uniforms.uRolesOpacity.value = approach(
      uniforms.uRolesOpacity.value,
      linkDimmed ? LINK_DIM : 1,
      fade,
    );
    this.roles.forEach((role, i) => {
      const dimmed = this.canHover && input.activeRole !== null && input.activeRole !== role.id;
      stepToward(uniforms.uRoleOpacity.value, i, dimmed ? DIM : 1, fade);
      const active = input.activeRole === role.id ? 1 : 0;
      stepToward(uniforms.uRoleActive.value, i, active, fade);
      stepToward(this.fadeClock, i, active, dt / (active ? DIM_DURATION : FADE_DURATION));
      const fadeIn = this.fadeClock.getComponent(i);
      if (active) stepToward(this.spreadClock, i, 1, dt / SPREAD_DURATION);
      else if (fadeIn === 0) this.spreadClock.setComponent(i, 0);
      uniforms.uRoleSpread.value.setComponent(i, 1 - (1 - this.spreadClock.getComponent(i)) ** 3);
      uniforms.uRoleFade.value.setComponent(i, fadeIn * fadeIn * (3 - 2 * fadeIn));
    });
  }

  private draw(): void {
    const { canvas, context, glowCanvas, glowContext, scale } = this;
    const box = this.tagline.getBoundingClientRect();
    const blur = GLOW_BLUR * scale;
    const padding = (this.padding = Math.ceil(blur * 2));
    glowCanvas.width = canvas.width = Math.ceil(box.width * scale) + padding * 2;
    glowCanvas.height = canvas.height = Math.ceil(box.height * scale) + padding * 2;
    context.fillStyle = 'white';
    glowContext.shadowColor = 'white';
    glowContext.shadowBlur = blur;
    glowContext.shadowOffsetX = canvas.width;

    this.roles.forEach((role, i) => {
      const style = getComputedStyle(role);
      const text = role.textContent ?? '';
      const area = role.getBoundingClientRect();
      const left = area.left * scale - Math.round(box.left * scale) + padding;
      const top = area.top * scale - Math.round(box.top * scale) + padding;
      const width = area.width * scale;
      const height = area.height * scale;
      context.font = `${style.fontWeight} ${parseFloat(style.fontSize) * scale}px Doto`;
      glowContext.font = context.font;
      const metrics = context.measureText(text);
      const ascent = metrics.fontBoundingBoxAscent;
      const baseline = Math.round(
        top + (height * ascent) / (ascent + metrics.fontBoundingBoxDescent),
      );
      const advance = width / text.length;
      [...text].forEach((char, j) => {
        const x = Math.round(left + j * advance);
        context.fillText(char, x, baseline);
        glowContext.fillText(char === ' ' ? GLOW_GAP_FILL : char, x - canvas.width, baseline);
      });
      const first = context.measureText(text[0]!);
      const last = context.measureText(text[text.length - 1]!);
      this.uniforms.uRoleInkEdges.value[i]!.set(
        Math.round(left) - first.actualBoundingBoxLeft,
        Math.round(left + (text.length - 1) * advance) + last.actualBoundingBoxRight,
      );

      this.uniforms.uRoleBoxes.value[i]!.set(
        left / canvas.width,
        1 - (top + height) / canvas.height,
        (left + width) / canvas.width,
        1 - top / canvas.height,
      );
    });
    this.texture.dispose();
    this.texture.needsUpdate = true;
    this.glowTexture.dispose();
    this.glowTexture.needsUpdate = true;
  }
}

function stepToward(vector: Vector3, index: number, target: number, step: number): void {
  vector.setComponent(index, approach(vector.getComponent(index), target, step));
}

function approach(current: number, target: number, step: number): number {
  return current + Math.sign(target - current) * Math.min(step, Math.abs(target - current));
}
