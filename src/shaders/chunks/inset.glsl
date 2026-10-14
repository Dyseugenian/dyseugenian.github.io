const float HALF_PROTRUSION = 0.45;
const float BLOCKLESS_REACH = 1.0;
const float STUDDED_INSET = 0.682;
const float OUTER_COLUMN = 2.5;
const float BLOCK_FRONT = 0.9;

float blockless(vec2 tile) {
  return step(abs(tile.x - 0.5), BLOCKLESS_REACH);
}

bool blockRemoved(vec2 tile) {
  return blockless(tile) < 0.5 && nearPlantFloor(2.0 * tile.y + mod(abs(tile.x), 2.0));
}

float blockInset(vec2 tile) {
  if (blockRemoved(tile)) return BLOCK_FRONT;
  float outer = step(abs(abs(tile.x - 0.5) - OUTER_COLUMN), 0.1);
  return mix(HALF_PROTRUSION * outer, STUDDED_INSET, blockless(tile));
}

bool holedBlock(vec2 tile) {
  return blockInset(tile) == 0.0 && mod(floor(abs(tile.x - 0.5)) + tile.y, 2.0) < 0.5;
}

const float STUD_BAND = 1.2;
const float STUD_MISSING = 0.05;
const float STUD_CHIPPED = 0.17;

float studDamage(vec2 tile, float y) {
  return hash12(vec2(tile.x * 17.0 + floor(y / STUD_BAND), tile.y) + 431.0);
}
