const float HALF_PROTRUSION = 0.45;
const float BLOCKLESS_REACH = 1.0;
const float STUDDED_INSET = 0.7275;
const float OUTER_COLUMN = 2.5;

float blockless(vec2 tile) {
  return step(abs(tile.x - 0.5), BLOCKLESS_REACH);
}

float blockInset(vec2 tile) {
  float outer = step(abs(abs(tile.x - 0.5) - OUTER_COLUMN), 0.1);
  float blocked = HALF_PROTRUSION * max(mod(floor(abs(tile.x - 0.5)) + tile.y, 2.0), outer);
  return mix(blocked, STUDDED_INSET, blockless(tile));
}
