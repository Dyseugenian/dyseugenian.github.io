const float EDGE_CHIP_SPACING = 0.8;
const float EDGE_CHIP_CHANCE = 0.12;
const vec2 EDGE_CHIP_RADIUS = vec2(0.05, 0.22);
const float FACE_CHIP_SPACING = 1.6;
const float FACE_CHIP_CHANCE = 0.05;
const vec2 FACE_CHIP_RADIUS = vec2(0.04, 0.13);
const float CHIP_REACH = 0.4;
const int CHIP_STEPS = 12;
const float CHIP_DISTANCE = 25.0;

void keep(vec4 site, inout vec4 first, inout vec4 second) {
  if (first.w == 0.0) first = site;
  else second = site;
}

void edgeChips(vec3 corner, vec3 run, vec3 bulge, float along, float from, float to, vec2 seed,
  inout vec4 first, inout vec4 second) {
  float cell = (along - from) / EDGE_CHIP_SPACING;
  float slot = floor(cell);
  float neighbour = slot + (fract(cell) < 0.5 ? -1.0 : 1.0);
  for (int i = 0; i < 2; i++) {
    float at = i == 0 ? slot : neighbour;
    vec3 key = (corner + run * (at + dot(run, vec3(0.0, 0.31, 0.62)))) * 1.37 + vec3(seed, seed.x * 0.7);
    if (hash13(key) > EDGE_CHIP_CHANCE) continue;
    float size = hash13(key + 5.0);
    float radius = mix(EDGE_CHIP_RADIUS.x, EDGE_CHIP_RADIUS.y, size * size);
    float position = from + (at + mix(0.25, 0.75, hash13(key + 9.0))) * EDGE_CHIP_SPACING;
    if (position < from + radius * 2.0 || position > to - radius * 2.0) continue;
    float bite = mix(0.3, 0.6, hash13(key + 11.0));
    keep(vec4(corner + run * position + bulge * radius * bite, radius), first, second);
  }
}

bool chipSites(vec3 p, vec3 normal, vec3 lo, vec3 hi, vec2 seed, out vec4 first, out vec4 second) {
  first = vec4(0.0);
  second = vec4(0.0);
  vec3 axis = step(0.5, abs(normal));
  vec3 n = axis * sign(normal);
  vec3 u = axis.zxy;
  vec3 v = axis.yzx;
  float plane = dot(axis, dot(n, vec3(1.0)) > 0.0 ? hi : lo);
  vec2 at = vec2(dot(p, u), dot(p, v));
  vec2 low = vec2(dot(lo, u), dot(lo, v));
  vec2 high = vec2(dot(hi, u), dot(hi, v));

  vec2 cell = floor(at / FACE_CHIP_SPACING);
  vec3 key = vec3(cell, plane * 3.1 + dot(axis, vec3(0.0, 1.0, 2.0))) + lo * 0.73 + hi * 0.41 + vec3(seed, 0.0);
  bool onFace = hash13(key) < FACE_CHIP_CHANCE;
  vec4 toEdge = vec4(at - low, high - at);
  if (!onFace && min(min(toEdge.x, toEdge.y), min(toEdge.z, toEdge.w)) > CHIP_REACH) return false;

  vec3 onPlane = axis * plane;
  if (toEdge.x < CHIP_REACH) edgeChips(onPlane + u * low.x, v, n - u, at.y, low.y, high.y, seed, first, second);
  if (toEdge.z < CHIP_REACH) edgeChips(onPlane + u * high.x, v, n + u, at.y, low.y, high.y, seed, first, second);
  if (toEdge.y < CHIP_REACH) edgeChips(onPlane + v * low.y, u, n - v, at.x, low.x, high.x, seed, first, second);
  if (toEdge.w < CHIP_REACH) edgeChips(onPlane + v * high.y, u, n + v, at.x, low.x, high.x, seed, first, second);
  if (onFace && second.w == 0.0) {
    float radius = mix(FACE_CHIP_RADIUS.x, FACE_CHIP_RADIUS.y, hash13(key + 5.0));
    vec2 spot = (cell + 0.3 + 0.4 * vec2(hash13(key + 9.0), hash13(key + 13.0))) * FACE_CHIP_SPACING;
    vec2 margin = vec2(radius * 2.0);
    if (all(greaterThan(spot, low + margin)) && all(lessThan(spot, high - margin))) {
      float rise = mix(0.4, 0.7, hash13(key + 11.0));
      keep(vec4(onPlane + n * radius * rise + u * spot.x + v * spot.y, radius), first, second);
    }
  }
  return first.w > 0.0;
}

float chipAt(vec3 x, vec4 site) {
  vec3 shape = vec3(hash13(site.xyz * 7.1), hash13(site.xyz * 7.1 + 3.0), hash13(site.xyz * 7.1 + 5.0));
  vec3 d = (x - site.xyz) / mix(vec3(0.6), vec3(1.7), shape);
  float body = mix(length(d), dot(abs(d), vec3(0.577)), mix(0.2, 0.75, shape.x * shape.y));
  float rough = valueNoise(x * 18.0 + site.xyz * 3.0) + 0.5 * valueNoise(x * 45.0 + site.xyz);
  return body - site.w * (0.75 + 0.35 * rough);
}

float chipped(vec3 x, vec4 first, vec4 second) {
  float nearest = chipAt(x, first);
  if (second.w > 0.0) nearest = min(nearest, chipAt(x, second));
  return nearest;
}

int carve(vec3 p, vec3 normal, vec3 lo, vec3 hi, vec2 seed, vec3 eye, out vec3 hit, out vec3 hitNormal, out float margin) {
  vec4 first;
  vec4 second;
  margin = 1e3;
  if (distance(p, eye) > CHIP_DISTANCE || !chipSites(p, normal, lo, hi, seed, first, second)) return 0;
  margin = chipped(p, first, second);
  if (margin >= 0.0) return 0;
  vec3 ray = normalize(p - eye);
  vec3 exits = (mix(lo, hi, step(0.0, ray)) - p) / ray;
  float through = min(min(exits.x, exits.y), exits.z);
  float t = 0.0;
  for (int i = 0; i < CHIP_STEPS; i++) {
    float d = chipped(p + ray * t, first, second);
    if (d > -0.003) break;
    t += max(-d * 0.8, 0.006);
    if (t > through) {
      hit = p + ray * through;
      hitNormal = -ray;
      return 2;
    }
  }
  hit = p + ray * t;
  vec2 e = vec2(0.003, -0.003);
  hitNormal = -normalize(e.xyy * chipped(hit + e.xyy, first, second) + e.yyx * chipped(hit + e.yyx, first, second)
    + e.yxy * chipped(hit + e.yxy, first, second) + e.xxx * chipped(hit + e.xxx, first, second));
  return 1;
}
