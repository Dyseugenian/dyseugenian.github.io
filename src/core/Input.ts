export class Input {
  readonly pointer = { x: 0, y: 0 };
  isPointerInside = false;
  readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
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
