export class Input {
  readonly pointer = { x: 0, y: 0 };
  isPointerInside = false;
  activeRole: string | null = null;
  private roles = document.querySelectorAll<HTMLButtonElement>('.tagline button');
  private lastPointerType = '';
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

  private track(event: PointerEvent): void {
    this.pointer.x = (event.clientX / innerWidth) * 2 - 1;
    this.pointer.y = 1 - (event.clientY / innerHeight) * 2;
    this.isPointerInside = true;
  }
}
