import { MathUtils, Vector2 } from 'three';
import eyesUrl from '../assets/eyes.webp';
import { Spring } from '../core/Spring';
import { Decal } from './Decal';

const BLINK_SECONDS = 0.16;
const LOOK_DISTANCE = 0.06;
const LOOK_REACH = 3;

export class Eyes extends Decal {
  private home: Vector2;
  private lookX = new Spring(30, 9);
  private lookY = new Spring(30, 9);
  private untilBlink = nextBlinkDelay();
  private blinkAge = -1;

  constructor(x: number, y: number) {
    super(eyesUrl, 106 / 140, 54 / 140);
    this.home = new Vector2(x, y);
    this.position.set(x, y, 0);
  }

  update(dt: number, pointer: Vector2 | null): void {
    this.lookX.target = pointer ? this.lookToward(pointer.x - this.home.x) : 0;
    this.lookY.target = pointer ? this.lookToward(pointer.y - this.home.y) : 0;
    this.position.x = this.home.x + this.lookX.update(dt);
    this.position.y = this.home.y + this.lookY.update(dt);

    this.untilBlink -= dt;
    if (this.untilBlink <= 0) {
      this.blinkAge = 0;
      this.untilBlink = Math.random() < 0.2 ? BLINK_SECONDS * 1.6 : nextBlinkDelay();
    }
    if (this.blinkAge >= 0) {
      this.blinkAge += dt;
      const closed = Math.sin(Math.min(this.blinkAge / BLINK_SECONDS, 1) * Math.PI);
      this.scale.y = 1 - 0.9 * closed;
      if (this.blinkAge >= BLINK_SECONDS) this.blinkAge = -1;
    }
  }

  private lookToward(offset: number): number {
    return MathUtils.clamp(offset / LOOK_REACH, -1, 1) * LOOK_DISTANCE;
  }
}

function nextBlinkDelay(): number {
  return 2.5 + Math.random() * 4;
}
