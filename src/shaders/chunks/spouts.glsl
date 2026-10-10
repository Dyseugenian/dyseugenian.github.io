const float PIER_MIDDLE = -2.1;
const float PIER_HALF = 0.7;
const float RECESS_HALF = 1.4;
const float GAP_MIDDLE = 1.8;
const float BLOCK_TOP = 2.7;
const float BLOCK_FRONT = 0.9;
const vec2 BLOCK_SPAN = vec2(-3.05, -1.15);
const float LEDGE_BOTTOM = 0.55;
const float UNDER_LEDGE = -1.45;
const float SPOUT_CHANCE = 0.6;
const float WALL_DEPTH = 0.1;
const vec3 FRAME_HINT = vec3(0.31, 0.83, 0.47);

struct Spout {
  vec3 points[6];
  int count;
  float radius;
  float bend;
  float drips;
  float landing;
  bool closed;
};

bool spoutOf(vec2 room, vec2 tile, float storey) {
  vec2 climbed = vec2(tile.x, mod(tile.y + uTilesClimbed, 4096.0));
  return storey > 0.5 && !plantFloor(room) && mod(climbed.x + climbed.y, 2.0) < 0.5
    && hash12(room + 507.0) < SPOUT_CHANCE && tile.x * uBay - 3.15 > -uOuterX + 0.01;
}

bool wallFree(vec2 room, float side) {
  vec2 recess = side > 0.0 ? room : room - vec2(1.0, 0.0);
  return !airConditioned(recess) || airConditionerMount(recess).w != -side;
}

Spout spoutAt(vec2 room, vec2 tile) {
  vec2 climbed = vec2(tile.x, mod(tile.y + uTilesClimbed, 4096.0));
  vec4 pick = vec4(hash12(room + 501.0), hash12(room + 502.0), hash12(room + 503.0), hash12(room + 505.0));
  float kind = hash12(room + 509.0);
  float side = hash12(room + 511.0) < 0.5 ? -1.0 : 1.0;
  if (!wallFree(room, side)) side = -side;
  bool sideFree = wallFree(room, side);
  bool bothFree = wallFree(room, 1.0) && wallFree(room, -1.0);
  bool grille = hash12(room + 229.0) > 0.55;
  float base = 0.5 * uTileHeight;
  float y = base + GAP_MIDDLE;
  float x = PIER_MIDDLE + mix(-0.2, 0.2, pick.z);
  float face = PIER_MIDDLE + side * PIER_HALF;
  Spout spout;
  spout.drips = hash12(room + 504.0);
  spout.landing = BLOCK_FRONT - blockInset(climbed);
  spout.radius = mix(0.08, 0.12, pick.x);
  spout.closed = false;
  for (int i = 0; i < 6; i++) spout.points[i] = vec3(0.0);
  float off = face + side * (spout.radius + 0.14);
  float front = spout.radius + mix(0.04, 0.1, pick.y);
  float back = -mix(0.4, 0.8, pick.y);

  if (kind < 0.36 && kind >= 0.22 && sideFree) {
    float top = y + mix(0.0, 0.6, pick.z);
    float low = top - mix(0.35, 0.7, pick.w);
    float across = face - side * mix(0.35, 0.6, pick.x);
    spout.points[0] = vec3(face - side * WALL_DEPTH, top, back);
    spout.points[1] = vec3(off, top, back);
    spout.points[2] = vec3(off, low, back);
    spout.points[3] = vec3(off, low, front);
    spout.points[4] = vec3(across, low, front);
    spout.points[5] = vec3(across, low, front + mix(0.25, 0.45, pick.w));
    spout.count = 6;
  } else if (kind < 0.52 && kind >= 0.36 && sideFree) {
    float top = y + mix(-0.5, 1.0, pick.z);
    float low = top - mix(0.0, 0.8, pick.w);
    float reach = mix(0.3, 0.55, pick.x);
    spout.points[0] = vec3(face - side * WALL_DEPTH, top, back);
    spout.points[1] = vec3(off, top, back);
    if (top - low > 0.25) {
      spout.points[2] = vec3(off, low, back);
      spout.points[3] = vec3(off, low, reach);
      spout.count = 4;
    } else {
      spout.points[2] = vec3(off, top, reach);
      spout.count = 3;
    }
  } else if (kind < 0.66 && kind >= 0.52 && !grille) {
    float run = base + LEDGE_BOTTOM - spout.radius - 0.04;
    float z = UNDER_LEDGE + mix(-0.05, 0.05, pick.z);
    spout.points[0] = vec3(-RECESS_HALF - WALL_DEPTH, run, z);
    spout.points[1] = vec3(RECESS_HALF + WALL_DEPTH, run, z);
    spout.count = 2;
    spout.closed = true;
  } else if (kind < 0.78 && kind >= 0.66 && !grille) {
    float run = base + LEDGE_BOTTOM - spout.radius - 0.04;
    float from = side * RECESS_HALF;
    float turn = mix(-0.6, 0.6, pick.z);
    spout.points[0] = vec3(from + side * WALL_DEPTH, run, UNDER_LEDGE);
    spout.points[1] = vec3(turn, run, UNDER_LEDGE);
    spout.points[2] = vec3(turn, run, -mix(0.2, 0.7, pick.w));
    spout.count = 3;
  } else if (kind < 0.89 && kind >= 0.78 && bothFree) {
    float level = y + mix(-0.4, 1.0, pick.z);
    float right = PIER_MIDDLE + PIER_HALF;
    float left = PIER_MIDDLE - PIER_HALF;
    float clear = spout.radius + 0.12;
    float backLeft = -mix(0.3, 0.7, pick.w);
    spout.points[0] = vec3(right - WALL_DEPTH, level, back);
    spout.points[1] = vec3(right + clear, level, back);
    spout.points[2] = vec3(right + clear, level, front);
    spout.points[3] = vec3(left - clear, level, front);
    spout.points[4] = vec3(left - clear, level, backLeft);
    spout.points[5] = vec3(left + WALL_DEPTH, level, backLeft);
    spout.count = 6;
    spout.closed = true;
  } else if (kind >= 0.89 && sideFree) {
    float low = y + mix(-0.5, 0.2, pick.z);
    float high = min(low + mix(1.0, 1.8, pick.w), base + 3.3);
    spout.points[0] = vec3(face - side * WALL_DEPTH, low, back);
    spout.points[1] = vec3(off, low, back);
    spout.points[2] = vec3(off, high, back);
    spout.points[3] = vec3(face - side * WALL_DEPTH, high, back);
    spout.count = 4;
    spout.closed = true;
  } else {
    float reach = mix(0.5, 0.7, pick.x);
    spout.radius = mix(0.19, 0.22, pick.x);
    spout.points[0] = vec3(x, y, -WALL_DEPTH);
    spout.points[1] = vec3(x, y, reach);
    spout.count = 2;
  }
  if (spout.closed) spout.drips = 1.0;
  spout.bend = spout.radius * mix(1.2, 1.6, pick.y);
  return spout;
}

float spoutLength(Spout spout) {
  float total = 0.0;
  for (int i = 0; i < 5; i++) {
    if (i + 1 >= spout.count) break;
    total += distance(spout.points[i], spout.points[i + 1]);
  }
  return total;
}

float spoutCorner(Spout spout, int i) {
  float before = distance(spout.points[i - 1], spout.points[i]);
  float after = distance(spout.points[i], spout.points[i + 1]);
  return min(spout.bend, 0.45 * min(before, after));
}

vec3 spoutCentre(Spout spout, float s, out vec3 tangent) {
  float start = 0.0;
  for (int i = 0; i < 5; i++) {
    vec3 a = spout.points[i];
    vec3 b = spout.points[i + 1];
    float span = distance(a, b);
    vec3 along = (b - a) / span;
    bool last = i + 2 >= spout.count;
    if (s <= start + span || last) {
      float into = s - start;
      tangent = along;
      if (i > 0) {
        float w = spoutCorner(spout, i);
        if (into < w) {
          vec3 before = normalize(a - spout.points[i - 1]);
          float u = 0.5 + 0.5 * into / w;
          tangent = normalize(mix(before, along, u));
          return mix(mix(a - before * w, a, u), mix(a, a + along * w, u), u);
        }
      }
      if (!last) {
        float w = spoutCorner(spout, i + 1);
        float left = span - into;
        if (left < w) {
          vec3 after = normalize(spout.points[i + 2] - b);
          float u = 0.5 - 0.5 * left / w;
          tangent = normalize(mix(along, after, u));
          return mix(mix(b - along * w, b, u), mix(b, b + after * w, u), u);
        }
      }
      return a + along * into;
    }
    start += span;
  }
  tangent = vec3(0.0, 0.0, 1.0);
  return spout.points[0];
}

mat3 spoutFrame(vec3 tangent) {
  vec3 across = normalize(cross(tangent, normalize(FRAME_HINT)));
  return mat3(across, cross(tangent, across), tangent);
}

vec3 spoutLip(Spout spout) {
  vec3 tangent;
  vec3 end = spoutCentre(spout, spoutLength(spout), tangent);
  vec3 down = vec3(0.0, -1.0, 0.0);
  return end + normalize(down - tangent * dot(down, tangent)) * (1.1 * spout.radius + 0.004);
}
