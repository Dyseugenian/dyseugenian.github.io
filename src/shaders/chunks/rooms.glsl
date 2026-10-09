uniform float uTilesClimbed;
uniform float uPlantEvery;

vec2 roomOf(vec2 tile, float storey) {
  return vec2(tile.x, mod(2.0 * mod(tile.y + uTilesClimbed, 4096.0) + storey + mod(abs(tile.x), 2.0), 8192.0));
}

bool plantFloor(vec2 room) {
  return mod(room.y, uPlantEvery) < 0.5;
}

bool airConditioned(vec2 room) {
  return !plantFloor(room) && hash12(room + 223.0) >= 0.82;
}

float airConditionerShift(vec2 room) {
  return mix(-0.2, 0.2, fract(hash12(room + 223.0) * 7.13));
}
