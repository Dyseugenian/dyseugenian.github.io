const vec2 SPALL_SPACINGS = vec2(1.4, 3.8);
const vec2 SPALL_CHANCE = vec2(0.4, 0.3);
const float PATCHED = 0.0;
const float SCALED = 1.0;
const float SPALLED = 2.0;
const float EXPOSED = 3.0;

struct Spall {
  vec2 center;
  vec2 axes;
  vec2 along;
  float kind;
  float key;
};

bool spallIn(vec2 cell, int layer, out Spall spall) {
  float spacing = SPALL_SPACINGS[layer];
  vec2 key = cell + float(layer) * 113.0;
  spall = Spall(vec2(0.0), vec2(1.0), vec2(1.0, 0.0), 0.0, 0.0);
  if (hash12(key + 41.0) > SPALL_CHANCE[layer]) return false;
  float size = spacing * mix(0.04, 0.24, pow(hash12(key + 43.0), 1.7));
  float turn = hash12(key + 49.0);
  float angle = turn < 0.6 ? 0.5 * (turn - 0.3) : 3.1416 * turn;
  float room = max(spacing - 3.4 * size, 0.0);
  float pick = hash12(key + 47.0);
  spall.center = (cell + 0.5) * spacing + room * (vec2(hash12(key + 31.0), hash12(key + 37.0)) - 0.5);
  spall.axes = size * vec2(1.0, mix(0.45, 1.0, hash12(key + 45.0)));
  spall.along = vec2(cos(angle), sin(angle));
  spall.kind = pick < 0.22 ? PATCHED : pick < 0.4 ? SCALED : pick < 0.6 || size < 0.12 ? SPALLED : EXPOSED;
  spall.key = floor(hash12(key + 53.0) * 512.0);
  return true;
}

vec2 inSpall(vec2 p, Spall spall) {
  vec2 rel = p - spall.center;
  return vec2(dot(rel, spall.along), dot(rel, vec2(-spall.along.y, spall.along.x))) / spall.axes;
}

bool crossBars(Spall spall) {
  return hash12(vec2(spall.key, 61.0)) > 0.4;
}
