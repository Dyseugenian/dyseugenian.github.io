import {
  FloatType,
  GLSL3,
  type IUniform,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RawShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import vertexShader from '../shaders/backdrop.vert';
import fragmentShader from '../shaders/room-light.frag';
import { TILE_ROWS } from './facade';
import { ROOM_LAYER } from './layers';

const COLUMNS = 16;
const ROWS = 2 * TILE_ROWS.length + 6;
const FIRST_ROOM = 2 * TILE_ROWS[0]! - 4;
const ROOM_SEEDS = 8192;

export class RoomLight extends Mesh<PlaneGeometry, RawShaderMaterial> {
  readonly target = new WebGLRenderTarget(COLUMNS, ROWS, {
    depthBuffer: false,
    type: FloatType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
  });
  readonly uniforms: Record<string, IUniform>;
  private row: IUniform<number>;
  private camera = new OrthographicCamera();

  constructor(uniforms: Record<string, IUniform>) {
    const row = { value: 0 };
    const atlas = { value: new Vector2(COLUMNS, ROWS) };
    super(
      new PlaneGeometry(2, 2),
      new RawShaderMaterial({
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader,
        uniforms: { ...uniforms, uRoomAtlas: atlas, uRoomRow: row },
      }),
    );
    this.row = row;
    this.uniforms = {
      uRoomLight: { value: this.target.texture },
      uRoomAtlas: atlas,
      uRoomRow: row,
    };
    this.frustumCulled = false;
    this.layers.set(ROOM_LAYER);
    this.camera.layers.set(ROOM_LAYER);
  }

  render(renderer: WebGLRenderer, tilesClimbed: number): void {
    this.row.value = (2 * tilesClimbed + FIRST_ROOM + ROOM_SEEDS) % ROOM_SEEDS;
    const target = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this, this.camera);
    renderer.setRenderTarget(target);
  }
}
