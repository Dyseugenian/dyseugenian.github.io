import { MathUtils } from 'three';

const UI_FADE = 1;

export class Input {
  readonly pointer = { x: 0, y: 0 };
  isPointerInside = false;
  activeRole: string | null = null;
  isOnLink = false;
  isUiHidden = false;
  uiOpacity = 1;
  private uiFadeFrom = 1;
  private uiFadeTime = UI_FADE;
  private roles = document.querySelectorAll<HTMLButtonElement>('.tagline button');
  private uiSwitch = document.querySelector<HTMLButtonElement>('.ui-switch')!;
  private lastPointerType = '';
  private viewSize = { width: innerWidth, height: innerHeight };
  readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    for (const role of this.roles) {
      role.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'mouse') this.setActiveRole(role.id);
      });
      role.addEventListener('pointerleave', (event) => {
        if (event.pointerType === 'mouse') this.setActiveRole(null);
      });
      role.addEventListener('click', (event) => {
        if (event.detail > 0 && this.lastPointerType === 'mouse') return;
        this.setActiveRole(this.activeRole === role.id ? null : role.id);
      });
    }
    for (const link of document.querySelectorAll<HTMLAnchorElement>('.links a')) {
      link.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'mouse') this.isOnLink = true;
      });
      link.addEventListener('pointerleave', () => {
        this.isOnLink = false;
      });
    }
    this.uiSwitch.addEventListener('click', () => this.setUiHidden(!this.isUiHidden));
    window.addEventListener('pointermove', (event) => this.track(event));
    window.addEventListener('pointerdown', (event) => {
      this.lastPointerType = event.pointerType;
      this.track(event);
      const onRole = (event.target as Element).closest('.tagline button');
      if (event.pointerType !== 'mouse' && !onRole) this.setActiveRole(null);
    });
    window.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'touch') this.isPointerInside = false;
    });
    window.addEventListener('pointercancel', () => {
      this.isPointerInside = false;
    });
    document.addEventListener('pointerout', (event) => {
      if (event.relatedTarget === null) this.isPointerInside = false;
    });
  }

  fit(width: number, height: number): void {
    this.viewSize = { width, height };
  }

  update(dt: number): void {
    this.uiFadeTime = Math.min(this.uiFadeTime + dt, UI_FADE);
    const t = this.uiFadeTime / UI_FADE;
    const eased = this.isUiHidden ? 1 - (1 - t) ** 3 : t * t * (3 - 2 * t);
    this.uiOpacity = MathUtils.lerp(this.uiFadeFrom, this.isUiHidden ? 0 : 1, eased);
  }

  get isOnSoftwareRole(): boolean {
    return this.activeRole === 'software-role';
  }

  get isOnGamedevRole(): boolean {
    return this.activeRole === 'gamedev-role';
  }

  get isOnMotionRole(): boolean {
    return this.activeRole === 'motion-role';
  }

  private setActiveRole(id: string | null): void {
    this.activeRole = id;
    for (const role of this.roles) role.setAttribute('aria-pressed', String(role.id === id));
  }

  private setUiHidden(hidden: boolean): void {
    this.isUiHidden = hidden;
    this.uiFadeFrom = this.uiOpacity;
    this.uiFadeTime = 0;
    this.uiSwitch.textContent = hidden ? 'show ui' : 'hide ui';
    document.documentElement.classList.toggle('ui-hidden', hidden);
    if (hidden) {
      this.setActiveRole(null);
      this.isOnLink = false;
    }
  }

  private track(event: PointerEvent): void {
    this.pointer.x = (event.clientX / this.viewSize.width) * 2 - 1;
    this.pointer.y = 1 - (event.clientY / this.viewSize.height) * 2;
    this.isPointerInside = true;
  }
}
