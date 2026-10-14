const float RUNG_X = -2.1;
const float RUNG_PITCH = 0.3;
const float RUNG_HALF = 0.2;
const vec2 RUNG_BLOCK_CLEAR = vec2(0.8, 2.8);
const vec2 RUNG_BAND_CLEAR = vec2(0.65, 3.1);
const vec2 RUNG_BLOCK = vec2(0.9, 2.7);

struct Rung {
  vec3 base;
  vec4 shape;
  float pick;
  bool gone;
  bool stubs;
  bool loose;
  bool bent;
  float worn;
  vec2 room;
};

bool rungAt(vec2 tile, float storey, float index, out Rung rung) {
  vec2 climbed = vec2(tile.x, mod(tile.y + uTilesClimbed, 4096.0));
  rung.room = roomOf(tile, storey);
  float height = (index + 0.5) * RUNG_PITCH;
  if (plantFloor(rung.room) && (height < RUNG_BAND_CLEAR.x || height > RUNG_BAND_CLEAR.y)) return false;
  if (storey < 0.5 && !blockRemoved(climbed) && height > RUNG_BLOCK_CLEAR.x && height < RUNG_BLOCK_CLEAR.y) return false;
  bool below = storey < 0.5 && height < 0.5 * (RUNG_BLOCK.x + RUNG_BLOCK.y);
  float stretch = mod(stretchOf(rung.room) - (below ? 1.0 : 0.0), 4096.0);
  if (!ladderIn(tile.x, stretch)) return false;
  float span = uTileHeight - (RUNG_BLOCK.y - RUNG_BLOCK.x);
  float along = storey * 0.5 * uTileHeight + height - RUNG_BLOCK.y + (below ? uTileHeight : 0.0);
  vec2 ladderKey = vec2(tile.x, stretch) + 629.0;
  float extent = span * mix(0.35, 1.0, hash12(ladderKey));
  float start = hash12(ladderKey + 1.0) < 0.5 ? 0.0 : span - extent;
  if (along < start || along > start + extent) return false;
  vec2 key = vec2(rung.room.x * 7.0 + 3.0, rung.room.y * 12.0 + index) + 617.0;
  vec2 storeyKey = rung.room + 613.0;
  float gapStart = floor(hash12(storeyKey + 1.0) * 12.0);
  float gapLength = 2.0 + floor(hash12(storeyKey + 2.0) * 3.0);
  rung.pick = hash12(key);
  rung.gone = rung.pick < 0.03 || hash12(storeyKey) < 0.05 && index >= gapStart && index < gapStart + gapLength;
  rung.stubs = !rung.gone && rung.pick < 0.07;
  rung.loose = !rung.gone && !rung.stubs && rung.pick < 0.1;
  rung.bent = !rung.gone && !rung.stubs && !rung.loose && rung.pick < 0.17;
  rung.shape = vec4(hash12(key + 1.0), hash12(key + 2.0), hash12(key + 3.0), hash12(key + 4.0));
  rung.base = vec3(RUNG_X + mix(-0.03, 0.03, rung.shape.w), storey * 0.5 * uTileHeight + height, 0.0);
  rung.worn = hash12(vec2(rung.room.x, floor(rung.room.y / 3.0)) + 619.0) < 0.35 ? 1.0 : 0.0;
  return true;
}
