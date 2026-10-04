import { Box2, Group, MathUtils, Vector2 } from 'three';
import type { Input } from '../core/Input';
import { Eyes } from './Eyes';
import { Halo } from './Halo';
import { SprayCircle } from './SprayCircle';
import { Stars } from './Stars';
import { Wordmark } from './Wordmark';

const LOGO_SIZE = { width: 0.88, height: 0.72 };
const LOGO_CENTER_Y = 0.38;
const PUPIL = { y: 445 / 1024, radius: 140 / 1024 };
const SPHERE = { y: 0.096, radius: 1.7, flow: 0.05 };
const RING = { radius: 2.6, drop: 0.514, flow: 0.035 };
const REDUCED_MOTION_SPEED = 0.1;
const MAX_POINTER_SPEED = 20;
const HOVER_FADE = 0.3;
const PLANET_FADE = 0.75;
const DUST_RETURN = 0.3;
const REFERENCE_SIZE = 670;
const MAX_COVERAGE = 6;
const OUTLINE_SPECKS = 2000;
const RING_SPECKS = 3070;

export class Logo extends Group {
  readonly halo = new Halo();
  readonly ready: Promise<unknown>;
  private outline = new SprayCircle(SPHERE.radius, OUTLINE_SPECKS * MAX_COVERAGE);
  private ring = new SprayCircle(RING.radius, RING_SPECKS * MAX_COVERAGE);
  private eyes = new Eyes(0.05, 0.429);
  private wordmark = new Wordmark(-416 / 140, -253 / 140);
  private stars = new Stars(
    { center: new Vector2(0, SPHERE.y), radius: SPHERE.radius + 0.3 },
    new Box2(new Vector2(-3.4, -3.3), new Vector2(3.5, -1.8)),
  );
  private pointer = new Vector2();
  private lastPointer = new Vector2();
  private pointerVelocity = new Vector2();
  private wasFollowing = false;
  private viewHalfSize = new Vector2();

  constructor(private input: Input) {
    super();
    for (const circle of [this.outline, this.ring]) {
      circle.uniforms.uCenter.value.set(0, SPHERE.y, 0);
    }
    this.ring.uniforms.uFrame.value = this.halo.uniforms.uDisc.value;
    this.ring.uniforms.uDrop.value = RING.drop;
    this.ring.uniforms.uHideBehind.value = SPHERE.radius;
    this.outline.uniforms.uFlow.value = SPHERE.flow;
    this.ring.uniforms.uFlow.value = RING.flow;

    this.add(this.stars, this.halo, this.outline, this.ring, this.eyes, this.wordmark);
    this.ready = Promise.all([this.halo.loaded, this.eyes.loaded, this.wordmark.loaded]);
  }

  fit(
    width: number,
    height: number,
    viewHeight: number,
    pixelRatio: number,
    particles: number,
  ): void {
    const unitsPerPixel = viewHeight / height;
    const size = Math.min(LOGO_SIZE.width * width, LOGO_SIZE.height * height);
    const pupilY = LOGO_CENTER_Y * height + (PUPIL.y - 0.5) * size;
    this.position.set(0, (height / 2 - pupilY) * unitsPerPixel, 0);
    this.scale.setScalar(PUPIL.radius * size * unitsPerPixel);
    this.viewHalfSize.set((width / 2) * unitsPerPixel, viewHeight / 2);
    this.wordmark.uniforms.uPixelSize.value =
      PUPIL.radius * size * pixelRatio * this.wordmark.scale.x;
    this.eyes.pixelSize.value = this.wordmark.uniforms.uPixelSize.value;

    const scale = this.scale.x;
    this.stars.scatter(
      new Box2(
        new Vector2(-this.viewHalfSize.x / scale, (-viewHeight / 2 - this.position.y) / scale),
        new Vector2(this.viewHalfSize.x / scale, (viewHeight / 2 - this.position.y) / scale),
      ),
      width * height,
    );

    for (const specks of [this.stars, this.halo, this.outline, this.ring]) {
      specks.uniforms.uPixelRatio.value = pixelRatio;
    }
    const coverage = Math.min((size / REFERENCE_SIZE) ** 2, MAX_COVERAGE);
    this.halo.setCount(Math.round(particles * coverage));
    this.outline.setCount(Math.round(OUTLINE_SPECKS * coverage));
    this.ring.setCount(Math.round(RING_SPECKS * coverage));
  }

  update(dt: number): void {
    const {
      pointer,
      isPointerInside,
      isOnSoftwareRole,
      isOnGamedevRole,
      isOnMotionRole,
      reducedMotion,
    } = this.input;
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
    const { uniforms } = this.wordmark;
    const hovers = [
      advanceHover(uniforms.uTetris, uniforms.uTetrisTime, isOnGamedevRole, dt),
      advanceHover(uniforms.uBinary, uniforms.uBinaryTime, isOnSoftwareRole, dt),
      advanceHover(uniforms.uMotion, uniforms.uMotionTime, isOnMotionRole, dt),
    ];
    const planetFade = PLANET_FADE * Math.max(...hovers.map((hover) => hover.amount));
    for (const part of [this.halo, this.outline, this.ring, this.eyes]) {
      part.uniforms.uOpacity.value = 1 - planetFade;
    }
    const end = uniforms.uTetrisEnd.value;
    uniforms.uDustHidden.value = Math.max(
      ...hovers.map(
        ({ amount, time }) => amount * (1 - MathUtils.smoothstep(time, end - DUST_RETURN, end)),
      ),
    );
    this.wordmark.update(motionDt, target, this.pointerVelocity);
    this.stars.update(motionDt);
  }
}

function advanceHover(
  amount: { value: number },
  time: { value: number },
  hovering: boolean,
  dt: number,
): { amount: number; time: number } {
  amount.value = MathUtils.clamp(amount.value + (hovering ? dt : -dt) / HOVER_FADE, 0, 1);
  time.value = amount.value > 0 ? time.value + dt : 0;
  return { amount: amount.value, time: time.value };
}
