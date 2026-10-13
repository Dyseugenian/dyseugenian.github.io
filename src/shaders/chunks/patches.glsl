const float PATCH_SPACING = 1.5;

bool patchAt(vec2 p, out vec2 cell, out vec2 centre, out float size) {
  cell = floor(p / PATCH_SPACING);
  centre = vec2(0.0);
  size = 0.0;
  if (hash12(cell + 401.0) > 0.3) return false;
  centre = (cell + 0.5 + 0.2 * (vec2(hash12(cell + 405.0), hash12(cell + 407.0)) - 0.5)) * PATCH_SPACING;
  size = mix(0.08, 0.3, pow(hash12(cell + 409.0), 1.4));
  return true;
}

bool mendedNear(vec2 p, float margin) {
  vec2 cell;
  vec2 centre;
  float size;
  if (!patchAt(p, cell, centre, size)) return false;
  return length(p - centre) < 3.1 * size + margin;
}

float mended(vec2 p, float footprint, out vec2 sweep) {
  vec2 cell;
  vec2 centre;
  float size;
  sweep = vec2(1.0, 0.0);
  if (!patchAt(p, cell, centre, size)) return 0.0;
  float key = hash12(cell + 403.0) * 50.0;
  float angle = 6.2832 * hash12(cell + 411.0);
  sweep = vec2(cos(angle), sin(angle));
  vec2 d = p - centre;
  vec2 local = vec2(dot(d, sweep), dot(d, vec2(-sweep.y, sweep.x))) / size;
  local.y *= mix(1.1, 2.4, hash12(cell + 413.0));
  local += 0.7 * (vec2(valueNoise(local * 1.1 + key), valueNoise(local * 1.1 + key + 5.0)) - 0.5)
    + 0.3 * (vec2(valueNoise(local * 3.3 + key + 9.0), valueNoise(local * 3.3 + key + 13.0)) - 0.5);
  float strands = valueNoise(vec2(local.y * 7.0, key));
  vec2 stretched = vec2(local.x / (local.x > 0.0 ? mix(1.0, 2.3, strands) : 1.0), local.y);
  float reach = length(stretched);
  float cover = 1.0 - smoothstep(0.9 - footprint / size, 1.0, reach);
  return cover * mix(1.0, 0.55 * strands, smoothstep(0.35, 1.0, reach) * step(0.0, local.x));
}
