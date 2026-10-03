import { Group, Vector2 } from 'three';
import wordmarkUrl from '../assets/wordmark.webp';
import type { Input } from '../core/Input';
import { Decal } from './Decal';
import { Eyes } from './Eyes';
import { Halo } from './Halo';
import { SprayCircle } from './SprayCircle';

const LOGO_SIZE = { width: 0.88, height: 0.72 };
const LOGO_CENTER_Y = 0.38;
const PUPIL = { y: 445 / 1024, radius: 140 / 1024 };
const SPHERE = { y: 0.096, radius: 1.7, flow: 0.05 };
const RING = { radius: 2.375, drop: 0.514, flow: 0.035 };
const REDUCED_MOTION_SPEED = 0.1;
const MAX_POINTER_SPEED = 20;

export class Logo extends Group {
  readonly halo: Halo;
  readonly ready: Promise<unknown>;
  private outline = new SprayCircle(SPHERE.radius, 2000);
  private ring = new SprayCircle(RING.radius, 2800);
  private eyes = new Eyes(0.05, 0.429);
  private wordmark = new Decal(wordmarkUrl, 802 / 140, 174 / 140);
  private pointer = new Vector2();
  private lastPointer = new Vector2();
  private pointerVelocity = new Vector2();
  private wasFollowing = false;
  private viewHalfSize = new Vector2();

  constructor(
    particles: number,
    private input: Input,
  ) {
    super();
    this.halo = new Halo(particles);

    for (const circle of [this.outline, this.ring]) {
      circle.uniforms.uCenter.value.set(0, SPHERE.y, 0);
    }
    this.ring.uniforms.uFrame.value = this.halo.uniforms.uDisc.value;
    this.ring.uniforms.uDrop.value = RING.drop;
    this.ring.uniforms.uHideBehind.value = SPHERE.radius;
    this.outline.uniforms.uFlow.value = SPHERE.flow;
    this.ring.uniforms.uFlow.value = RING.flow;
    this.wordmark.position.set(0.007, -2.329, 0);

    this.add(this.halo, this.outline, this.ring, this.eyes, this.wordmark);
    this.ready = Promise.all([this.halo.loaded, this.eyes.loaded, this.wordmark.loaded]);
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

    if (follow && this.wasFollowing && dt > 0) {
      this.pointerVelocity
        .subVectors(this.pointer, this.lastPointer)
        .divideScalar(dt)
        .clampLength(0, MAX_POINTER_SPEED);
    } else {
      this.pointerVelocity.set(0, 0);
    }
    this.lastPointer.copy(this.pointer);
    this.wasFollowing = follow;

    const target = follow ? this.pointer : null;
    this.halo.update(motionDt, target);
    this.outline.update(motionDt, target, this.pointerVelocity);
    this.ring.update(motionDt, target, this.pointerVelocity);
    this.eyes.update(dt, target);
  }
}
