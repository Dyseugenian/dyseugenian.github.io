import { CircleGeometry, Group, Mesh, MeshBasicMaterial, Vector2 } from 'three';
import wordmarkUrl from '../assets/wordmark.webp';
import type { Input } from '../core/Input';
import { palette } from '../core/palette';
import { Decal } from './Decal';
import { Eyes } from './Eyes';
import { Halo } from './Halo';
import { SprayCircle } from './SprayCircle';

const LOGO_SIZE = { width: 0.88, height: 0.72 };
const LOGO_CENTER_Y = 0.38;
const PUPIL = { y: 445 / 1024, radius: 140 / 1024 };
const SPHERE = { y: 0.096, radius: 1.7 };
const RING = { radius: 2.375, drop: 0.514, spin: 0.02 };
const REDUCED_MOTION_SPEED = 0.1;

export class Logo extends Group {
  readonly halo: Halo;
  readonly ready: Promise<unknown>;
  private outline = new SprayCircle(SPHERE.radius, 2500);
  private ring = new SprayCircle(RING.radius, 3500);
  private eyes = new Eyes(0.05, 0.429);
  private wordmark = new Decal(wordmarkUrl, 802 / 140, 174 / 140);
  private pointer = new Vector2();
  private viewHalfSize = new Vector2();

  constructor(
    particles: number,
    private input: Input,
  ) {
    super();
    this.halo = new Halo(particles);
    const pupil = new Mesh(raggedDisc(), new MeshBasicMaterial({ color: palette.void }));

    for (const circle of [this.outline, this.ring]) {
      circle.uniforms.uCenter.value.set(0, SPHERE.y, 0);
    }
    this.ring.uniforms.uFrame.value = this.halo.uniforms.uDisc.value;
    this.ring.uniforms.uDrop.value = RING.drop;
    this.ring.uniforms.uHideBehind.value = SPHERE.radius;
    this.ring.uniforms.uSpin.value = RING.spin;
    this.wordmark.position.set(0.007, -2.329, 0);

    this.add(pupil, this.halo, this.outline, this.ring, this.eyes, this.wordmark);
    this.ready = Promise.all([this.eyes.loaded, this.wordmark.loaded]);
  }

  fit(width: number, height: number, viewHeight: number, pixelRatio: number): void {
    const unitsPerPixel = viewHeight / height;
    const size = Math.min(LOGO_SIZE.width * width, LOGO_SIZE.height * height);
    const pupilY = LOGO_CENTER_Y * height + (PUPIL.y - 0.5) * size;
    this.position.set(0, (height / 2 - pupilY) * unitsPerPixel, 0);
    this.scale.setScalar(PUPIL.radius * size * unitsPerPixel);
    this.viewHalfSize.set((width / 2) * unitsPerPixel, viewHeight / 2);

    for (const specks of [this.halo, this.outline, this.ring]) {
      specks.uniforms.uPixelRatio.value = pixelRatio;
    }
  }

  update(dt: number): void {
    const { pointer, isPointerInside, reducedMotion } = this.input;
    const motionDt = reducedMotion ? dt * REDUCED_MOTION_SPEED : dt;
    const follow = isPointerInside && !reducedMotion;

    this.pointer
      .set(
        pointer.x * this.viewHalfSize.x - this.position.x,
        pointer.y * this.viewHalfSize.y - this.position.y,
      )
      .divideScalar(this.scale.x);

    this.halo.update(motionDt, follow ? this.pointer : null);
    this.outline.update(motionDt);
    this.ring.update(motionDt);
    this.eyes.update(dt, follow ? this.pointer : null);
  }
}

function raggedDisc(): CircleGeometry {
  const disc = new CircleGeometry(1, 360);
  const positions = disc.getAttribute('position');
  for (let i = 1; i < positions.count; i++) {
    const notch = Math.random() < 0.08 ? Math.random() * 0.05 : 0;
    const grain = (Math.random() - 0.5) * 0.015;
    const scale = 1 - notch + grain;
    positions.setXY(i, positions.getX(i) * scale, positions.getY(i) * scale);
  }
  return disc;
}
