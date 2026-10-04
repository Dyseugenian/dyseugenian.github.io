import { MathUtils, Vector2 } from 'three';
import eyesUrl from '../assets/eyes.webp';
import { Spring } from '../core/Spring';
import { Decal } from './Decal';
import { FaceSpecks } from './FaceSpecks';

const LOOK_DISTANCE = 0.06;
const LOOK_REACH = 3;
const TEXEL = 1 / 140;

export class Eyes extends Decal {
  readonly pixelSize = { value: 1 };
  private home: Vector2;
  private lookX = new Spring(30, 9);
  private lookY = new Spring(30, 9);

  constructor(x: number, y: number) {
    super(eyesUrl, 106 * TEXEL, 54 * TEXEL);
    this.home = new Vector2(x, y);
    this.position.set(x, y, 0);
    void this.loaded.then((map) => {
      const { uTime, uOpacity } = this.uniforms;
      const specks = new FaceSpecks(readPixels(map.image as HTMLImageElement), {
        uTime,
        uOpacity,
        uPixelSize: this.pixelSize,
      });
      specks.scale.setScalar(TEXEL);
      this.add(specks);
    });
  }

  update(dt: number, pointer: Vector2 | null): void {
    this.uniforms.uTime.value += dt;
    this.lookX.target = pointer ? this.lookToward(pointer.x - this.home.x) : 0;
    this.lookY.target = pointer ? this.lookToward(pointer.y - this.home.y) : 0;
    this.position.x = this.home.x + this.lookX.update(dt);
    this.position.y = this.home.y + this.lookY.update(dt);
  }

  private lookToward(offset: number): number {
    return MathUtils.clamp(offset / LOOK_REACH, -1, 1) * LOOK_DISTANCE;
  }
}

function readPixels(image: HTMLImageElement): ImageData {
  const context = new OffscreenCanvas(image.width, image.height).getContext('2d', {
    willReadFrequently: true,
  })!;
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, image.width, image.height);
}
