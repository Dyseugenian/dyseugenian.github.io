precision highp float;

#include "chunks/noise.glsl"
#include "chunks/rooms.glsl"

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
uniform vec2 uResolution;
uniform float uTime;
uniform float uTileHeight;
uniform float uBay;
uniform float uOuterX;

in vec3 position;
in vec3 normal;
in float aPart;
in vec3 aOffset;
in vec2 aTile;
in float aStorey;

out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;
out vec3 vShape;
flat out vec2 vTile;
flat out float vPart;
flat out float vKey;
flat out float vSeed;
out float vFray;

const float LADDER_CHANCE = 0.012;
const float LEDGE_TOP = 1.15;
const float LEDGE_FRONT = -1.3;
const float GLASS_FOOT = -3.12;
const float LOWER_LEDGE = 4.3;
const float HALF_WIDTH = 0.2;
const float ROPE = 0.02;
const float CLEARANCE = 0.03;
const float SPACING = 0.3;
const float FIRST_RUNG = 0.15;
const float FLAT_RUNGS = 6.0;
const float TAIL = 0.3;
const float FRAY = 0.22;
const float LAY = 0.13;
const float TAU = 6.28318;
const vec2 RUNG = vec2(0.05, 0.028);

float drop;
float top;
float across;
float turn;
float seed;
vec2 sway;
vec2 room;

float over() {
  return LEDGE_FRONT - GLASS_FOOT;
}

float hanging() {
  return over() + CLEARANCE * 1.5708;
}

float fromEdge(float s) {
  return s < over() ? s - over() : max(s - hanging(), 0.0);
}

float rungKey(float rung) {
  return hash12(room + 830.0 + rung);
}

bool missing(float rung) {
  return rung >= FLAT_RUNGS && rungKey(rung) < 0.07;
}

vec3 ropeAt(float s, float flank) {
  vec3 centre;
  float d = max(s - hanging(), 0.0);
  if (s < over()) {
    float slack = 0.03 * sin(s * 2.3 + seed * 7.0) + 0.015 * sin(s * 5.1 + flank * 2.0 + seed * 3.0);
    centre = vec3(across + slack, top + ROPE, GLASS_FOOT + s);
  } else if (s < hanging()) {
    float a = (s - over()) / CLEARANCE;
    centre = vec3(across, top + CLEARANCE * cos(a), LEDGE_FRONT + CLEARANCE * sin(a));
  } else {
    float k = pow(d / drop, 1.3);
    float wander = 0.02 * sin(d * 1.3 + seed * 40.0) * k;
    centre = vec3(across + sway.x * k + wander, top - d, LEDGE_FRONT + CLEARANCE + sway.y * k);
  }
  float yaw = turn * smoothstep(LOWER_LEDGE, drop + TAIL, d);
  float splay = 1.0 + 0.6 * smoothstep(drop, drop + TAIL, d);
  return centre + flank * HALF_WIDTH * splay * vec3(cos(yaw), 0.0, sin(yaw));
}

bool hasRag(vec2 place) {
  return hash12(place + 243.0) >= 0.9;
}

float pixelAt(vec3 local) {
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  return 2.0 * distance(cameraPosition, world.xyz) / (projectionMatrix[1][1] * uResolution.y);
}

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  room = roomOf(aTile, aStorey);
  vec2 below = vec2(room.x, mod(room.y - 1.0, 8192.0));
  vec2 under = vec2(room.x, mod(room.y - 2.0, 8192.0));
  if (abs(aTile.x * uBay) + 1.4 > uOuterX + 0.01 || hash12(room + 811.0) > LADDER_CHANCE) return;
  if (plantFloor(room) || plantFloor(below) || plantFloor(under)) return;
  if (hasRag(room) || hasRag(below) || hasRag(under)) return;
  if (airConditioned(room) && airConditionerMount(room).w == 0.0) return;

  seed = hash12(room + 813.0);
  float height = 0.5 * uTileHeight;
  top = aStorey * height + LEDGE_TOP;
  drop = LEDGE_TOP + 2.0 * height - mix(1.5, 2.6, hash12(room + 815.0));
  across = mix(-0.55, 0.55, hash12(room + 817.0));
  float gust = valueNoise(vec2(uTime * 0.35, room.y * 0.3 + room.x * 0.7));
  float swing = 0.35 * (gust - 0.4) + (0.05 + 0.06 * gust) * sin(uTime * 1.25 + seed * 6.3);
  float lean = 0.03 + max(0.0, 0.2 * (gust - 0.3)) + 0.02 * (1.0 + sin(uTime * 1.05 + seed * 4.1));
  sway = vec2(swing, lean);
  turn = mix(-0.5, 0.5, hash12(room + 819.0)) + 0.5 * (gust - 0.4) + 0.12 * sin(uTime * 0.8 + seed * 9.0);

  vec3 local;
  vec3 bent;
  float key;
  if (aPart < 1.5) {
    float flank = aPart < 0.5 ? -1.0 : 1.0;
    float tail = TAIL * mix(0.55, 1.5, hash12(vec2(seed * 17.0, flank)));
    float s = (position.y + 0.5) * (hanging() + drop + tail);
    float e = fromEdge(s);
    float fray = smoothstep(drop + tail - FRAY, drop + tail, e);
    vec3 centre = ropeAt(s, flank);
    vec3 tangent = normalize(ropeAt(s + 0.01, flank) - ropeAt(s - 0.01, flank));
    vec3 side = normalize(cross(tangent, vec3(1.0, 0.0, 0.0)));
    vec3 forward = cross(tangent, side);
    float rung = floor((e - FIRST_RUNG) / SPACING + 0.5);
    float offset = e - FIRST_RUNG - rung * SPACING;
    rung += FLAT_RUNGS;
    float lash = rung >= 0.0 && e < drop && !missing(rung) ? exp(-pow(offset / 0.05, 2.0)) : 0.0;
    float angle = atan(-position.z, position.x);
    float girth = ROPE * mix(0.9, 1.1, hash12(vec2(seed * 31.0, flank))) * (1.0 + 0.7 * lash);
    float lobe = max(0.0, -cos(TAU * (3.0 * angle / TAU - e / LAY + flank * 0.31)));
    float radius = max(girth, 0.6 * pixelAt(centre)) * (1.0 + fray * (0.4 + 1.6 * lobe));
    vec2 ring = vec2(cos(angle), sin(angle));
    local = centre + (side * ring.x + forward * ring.y) * radius;
    bent = side * ring.x + forward * ring.y;
    vShape = vec3(e, angle, lash);
    key = flank;
    vFray = fray;
  } else {
    float rung = aPart - 2.0;
    float e = FIRST_RUNG + (rung - FLAT_RUNGS) * SPACING;
    key = rungKey(rung);
    if (e > drop - 0.05 || missing(rung)) return;
    float s = e < 0.0 ? over() + e : hanging() + e;
    vec3 left = ropeAt(s, -1.0);
    vec3 right = ropeAt(s, 1.0);
    left.y += 0.03 * (fract(key * 13.0) - 0.5) * step(0.0, e);
    right.y += 0.03 * (fract(key * 29.0) - 0.5) * step(0.0, e);
    if (key < 0.12 && e > LOWER_LEDGE) {
      float slip = mix(0.7, 1.1, fract(key * 37.0));
      right = left + 2.0 * HALF_WIDTH * vec3(cos(slip), -sin(slip), 0.08);
    }
    vec3 x = normalize(right - left);
    vec3 z = normalize(cross(x, vec3(0.0, 1.0, 0.0)));
    vec3 y = cross(z, x);
    vec3 middle = 0.5 * (left + right);
    if (e < 0.0) middle.y = top + 0.5 * RUNG.x;
    float pixel = pixelAt(middle);
    vec2 ends = vec2(hash12(vec2(key * 97.0, 1.0)), hash12(vec2(key * 97.0, 2.0)));
    vec2 overhang = max(ROPE * 1.9, pixel) + mix(vec2(0.012), vec2(0.07), pow(ends, vec2(1.3)));
    middle += 0.5 * (overhang.y - overhang.x) * x;
    vec3 size = vec3(distance(left, right) + overhang.x + overhang.y, max(RUNG, vec2(pixel)));
    vec3 p = position;
    float bow = 1.0 - 4.0 * p.x * p.x;
    float swell = 1.0 + 0.36 * (valueNoise(vec2(p.x * 5.0 + key * 30.0, 1.0)) - 0.5);
    float worn = 1.0 + 0.3 * (valueNoise(vec2(p.x * 11.0 + key * 50.0, p.y * 3.0 + p.z * 5.0)) - 0.5);
    vec3 shaped = p * size * vec3(1.0, swell * worn, swell);
    shaped.x += step(0.49, abs(p.x)) * sign(p.x) * 0.015 * (valueNoise(p.yz * 4.0 + key * 20.0) - 0.5);
    shaped.yz += bow * vec2(0.012, 0.008) * (vec2(fract(key * 7.0), fract(key * 11.0)) - 0.5);
    mat3 frame = mat3(x, y, z);
    local = middle + frame * shaped;
    bent = frame * normal;
    vShape = shaped;
    vFray = 0.0;
  }
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vWorld = world.xyz;
  vLocal = local;
  vNormal = mat3(modelMatrix) * bent;
  vTile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  vPart = aPart;
  vKey = key;
  vSeed = seed;
  gl_Position = projectionMatrix * viewMatrix * world;
}
