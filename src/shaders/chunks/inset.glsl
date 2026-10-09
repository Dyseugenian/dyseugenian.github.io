const float HALF_PROTRUSION = 0.45;

float blockInset(vec2 tile) {
  return HALF_PROTRUSION * mod(floor(abs(tile.x - 0.5)) + tile.y, 2.0);
}
