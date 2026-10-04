export class Input {
  readonly pointer = { x: 0, y: 0 };
  isPointerInside = false;
  activeRole: string | null = null;
  readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    for (const role of document.querySelectorAll('.tagline span')) {
      role.addEventListener('pointerenter', (event) => {
        if ((event as PointerEvent).pointerType !== 'touch') this.activeRole = role.id;
      });
      role.addEventListener('pointerleave', (event) => {
        if ((event as PointerEvent).pointerType !== 'touch') this.activeRole = null;
      });
    }
    window.addEventListener('pointermove', (event) => this.track(event));
    window.addEventListener('pointerdown', (event) => {
      this.track(event);
      if (event.pointerType !== 'touch') return;
      const role = (event.target as Element).closest('.tagline span');
      this.activeRole = role && role.id !== this.activeRole ? role.id : null;
    });
    window.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'touch') this.isPointerInside = false;
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

  private track(event: PointerEvent): void {
    this.pointer.x = (event.clientX / innerWidth) * 2 - 1;
    this.pointer.y = 1 - (event.clientY / innerHeight) * 2;
    this.isPointerInside = true;
  }
}
