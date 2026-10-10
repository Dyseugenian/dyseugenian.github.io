const float DUCT_CHANCE = 0.776;
const float DUCT_COLUMN = 2.5;
const float DUCT_X = -2.1;
const float DUCT_CLEARANCE = 0.59;
const float DUCT_WALL = 0.1;
const float DUCT_TURN = 1.2;
const float DUCT_BRACKET = 1.8;
const vec3 DUCT_HINT = vec3(0.31, 0.83, 0.47);

struct Duct {
  float radius;
  float x;
  float z;
  float rise;
  float reach;
  float outlet;
  float seed;
};

struct DuctPiece {
  vec3 a;
  vec3 b;
  vec3 c;
  float bend;
  float start;
  float offset;
};

bool ductOf(float column, float section, out Duct duct) {
  vec2 key = vec2(column, mod(section, 8192.0 / uPlantEvery)) + 701.0;
  duct.seed = hash12(key + 9.0);
  if (abs(column - 0.5) != DUCT_COLUMN || hash12(key) > DUCT_CHANCE) return false;
  duct.radius = mix(0.25, 0.355, hash12(key + 1.0));
  duct.rise = hash12(key + 2.0) < 0.5 ? 1.0 : -1.0;
  duct.reach = 3.0 + floor(hash12(key + 3.0) * 7.0);
  float plant = (section + (duct.rise > 0.0 ? 0.0 : 1.0)) * uPlantEvery;
  if (mod(plant + duct.rise * duct.reach - mod(abs(column), 2.0), 2.0) < 0.5) duct.reach += duct.reach > 3.5 ? -1.0 : 1.0;
  duct.x = DUCT_X + mix(-0.15, 0.15, hash12(key + 4.0));
  duct.z = DUCT_CLEARANCE + duct.radius;
  duct.outlet = mix(1.0, 2.6, hash12(key + 5.0));
  return true;
}

bool ductPiece(vec2 room, float storey, float index, out Duct duct, out DuctPiece piece) {
  float section = floor(room.y / uPlantEvery) - index;
  float step = room.y - floor(room.y / uPlantEvery) * uPlantEvery;
  if (index > 0.5 && step > 0.5) return false;
  if (!ductOf(room.x, section, duct)) return false;
  float offset = index > 0.5 ? 0.0 : duct.rise > 0.0 ? step : uPlantEvery - step;
  if ((index > 0.5 && duct.rise > 0.0) || offset > duct.reach) return false;
  float height = 0.5 * uTileHeight;
  float base = storey * height;
  float near = duct.rise > 0.0 ? base : base + height;
  float far = duct.rise > 0.0 ? base + height : base;
  float turn = far - duct.rise * DUCT_TURN;
  float wall = -DUCT_WALL;
  piece.offset = offset;
  if (offset < 0.5) {
    piece.a = vec3(duct.x, turn, wall);
    piece.b = vec3(duct.x, turn, duct.z);
    piece.c = vec3(duct.x, far, duct.z);
  } else if (offset > duct.reach - 0.5) {
    piece.a = vec3(duct.x, near, duct.z);
    piece.b = vec3(duct.x, base + duct.outlet, duct.z);
    piece.c = vec3(duct.x, base + duct.outlet, wall);
  } else {
    piece.a = vec3(duct.x, near, duct.z);
    piece.b = vec3(duct.x, base + 0.5 * height, duct.z);
    piece.c = vec3(duct.x, far, duct.z);
  }
  float first = distance(piece.a, piece.b);
  float second = distance(piece.b, piece.c);
  piece.bend = min(1.6 * duct.radius, 0.45 * min(first, second));
  piece.start = offset < 0.5 ? 0.0 : duct.z + DUCT_WALL + DUCT_TURN + (offset - 1.0) * height;
  return true;
}

float ductLength(DuctPiece piece) {
  return distance(piece.a, piece.b) + distance(piece.b, piece.c);
}

vec3 ductCentre(DuctPiece piece, float s, out vec3 tangent) {
  float first = distance(piece.a, piece.b);
  vec3 inward = normalize(piece.b - piece.a);
  vec3 outward = normalize(piece.c - piece.b);
  float w = piece.bend;
  if (s < first - w) {
    tangent = inward;
    return piece.a + inward * s;
  }
  if (s > first + w) {
    tangent = outward;
    return piece.b + outward * (s - first);
  }
  float u = 0.5 + 0.5 * (s - first) / w;
  tangent = normalize(mix(inward, outward, u));
  return mix(mix(piece.b - inward * w, piece.b, u), mix(piece.b, piece.b + outward * w, u), u);
}

float ductRun(DuctPiece piece, float t) {
  float first = distance(piece.a, piece.b);
  float w = piece.bend;
  if (t < 1.0 / 3.0) return 3.0 * t * (first - w);
  if (t < 2.0 / 3.0) return first - w + (3.0 * t - 1.0) * 2.0 * w;
  return first + w + (3.0 * t - 2.0) * (ductLength(piece) - first - w);
}

mat3 ductFrame(vec3 tangent) {
  vec3 across = normalize(cross(tangent, normalize(DUCT_HINT)));
  return mat3(across, cross(tangent, across), tangent);
}
