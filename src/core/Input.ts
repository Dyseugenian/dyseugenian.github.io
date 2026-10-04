export class Input {
  readonly pointer = { x: 0, y: 0 };
  isPointerInside = false;
  isOnSoftwareRole = false;
  isOnGamedevRole = false;
  isOnMotionRole = false;
  readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    const softwareRole = document.querySelector('#software-role')!;
    softwareRole.addEventListener('pointerenter', () => (this.isOnSoftwareRole = true));
    softwareRole.addEventListener('pointerleave', () => (this.isOnSoftwareRole = false));
    const gamedevRole = document.querySelector('#gamedev-role')!;
    gamedevRole.addEventListener('pointerenter', () => (this.isOnGamedevRole = true));
    gamedevRole.addEventListener('pointerleave', () => (this.isOnGamedevRole = false));
    const motionRole = document.querySelector('#motion-role')!;
    motionRole.addEventListener('pointerenter', () => (this.isOnMotionRole = true));
    motionRole.addEventListener('pointerleave', () => (this.isOnMotionRole = false));
    window.addEventListener('pointermove', (event) => this.track(event));
    window.addEventListener('pointerdown', (event) => this.track(event));
    window.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'touch') this.isPointerInside = false;
    });
    document.addEventListener('pointerout', (event) => {
      if (event.relatedTarget === null) this.isPointerInside = false;
    });
  }

  private track(event: PointerEvent): void {
    this.pointer.x = (event.clientX / innerWidth) * 2 - 1;
    this.pointer.y = 1 - (event.clientY / innerHeight) * 2;
    this.isPointerInside = true;
  }
}
