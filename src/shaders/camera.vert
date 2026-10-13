precision highp float;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
uniform vec2 uResolution;
uniform float uTime;

#include "chunks/hash.glsl"
#include "chunks/rooms.glsl"
#include "chunks/inset.glsl"

in vec3 position;
in vec3 normal;
in vec3 aOffset;
in vec2 aTile;
in float aStorey;
in float aIndex;

out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;
flat out vec2 vTile;
flat out float vSeed;
flat out float vPart;
out vec3 vBox;
flat out vec3 vSize;

const vec3 PLATE = vec3(0.14, 0.24, 0.024);
const vec3 PIVOT = vec3(-2.1, 2.08, BLOCK_FRONT + 0.4);
const vec3 HOUSING = vec3(0.17, 0.16, 0.52);
const vec3 SHIELD = vec3(0.21, 0.012, 0.6);
const float DROP = 0.15;
const float CABLE = 0.012;
const float CABLE_PIECES = 6.0;
const float SLEW = 0.45;
const float PAN_LIMIT = 1.75;
const float FIRST_CABLE = 9.0;

mat3 panned(float angle) {
  return mat3(vec3(cos(angle), 0.0, -sin(angle)), vec3(0.0, 1.0, 0.0), vec3(sin(angle), 0.0, cos(angle)));
}

mat3 tilted(float angle) {
  return mat3(vec3(1.0, 0.0, 0.0), vec3(0.0, cos(angle), sin(angle)), vec3(0.0, -sin(angle), cos(angle)));
}

mat3 alongAxis(vec3 axis) {
  vec3 across = normalize(cross(vec3(0.0, 1.0, 0.0), axis) + vec3(1e-4, 0.0, 0.0));
  return mat3(across, cross(axis, across), axis);
}

vec2 aimAt(float seed, float turn, vec3 viewer) {
  vec2 key = vec2(seed * 97.0, turn);
  float pick = hash12(key);
  float side = hash12(key + 0.5) < 0.5 ? -1.0 : 1.0;
  float spread = hash12(key + 1.5);
  float drop = hash12(key + 2.5);
  if (pick < 0.3) return vec2(side * mix(0.1, 1.0, spread), mix(0.5, 0.95, drop));
  if (pick < 0.52) {
    vec3 toward = viewer - PIVOT;
    return vec2(clamp(atan(toward.x, toward.z), -PAN_LIMIT, PAN_LIMIT), atan(-toward.y, length(toward.xz)));
  }
  if (pick < 0.74) return vec2(side * mix(1.3, PAN_LIMIT, spread), mix(0.05, 0.3, drop));
  if (pick < 0.9) return vec2(side * mix(0.3, 0.9, spread), -mix(0.15, 0.4, drop));
  return vec2(side * 0.15 * spread, mix(1.1, 1.3, drop));
}

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vec2 tile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  float storey = 2.0 * tile.y + mod(abs(tile.x), 2.0);
  bool holed = blockInset(tile) == 0.0 && mod(floor(abs(tile.x - 0.5)) + tile.y, 2.0) < 0.5;
  if (aStorey > 0.5 || holed || blockRemoved(tile) || mod(storey, uPlantEvery) < 4.5) return;

  float seed = hash12(tile + 907.0);
  vec3 viewer = cameraPosition - modelMatrix[3].xyz - aOffset;
  float period = mix(7.0, 13.0, seed);
  float clock = uTime / period + fract(seed * 7.31);
  float turn = floor(clock);
  float since = fract(clock) * period;
  vec2 from = aimAt(seed, turn - 1.0, viewer);
  vec2 to = aimAt(seed, turn, viewer);
  float travel = clamp(length((to - from) * vec2(1.0, 1.4)) / SLEW, 0.6, 0.5 * period);
  float delay = 1.5 * hash12(vec2(seed * 31.0, turn));
  vec2 aim = mix(from, to, smoothstep(0.0, 1.0, (since - delay) / travel));

  mat3 pan = panned(aim.x);
  mat3 swivel = pan * tilted(aim.y);
  vec3 hinge = PIVOT + vec3(0.0, -DROP, 0.0);
  vec3 rear = hinge + swivel * vec3(0.0, -0.02, 0.06 - 0.5 * HOUSING.z - 0.06);
  vec3 wall = vec3(PIVOT.x + 0.04, PIVOT.y - 0.06, BLOCK_FRONT + 0.03);

  vec3 centre;
  vec3 size;
  mat3 turned = mat3(1.0);
  float part = min(aIndex, FIRST_CABLE);
  if (aIndex < 0.5) {
    centre = vec3(PIVOT.x, PIVOT.y + 0.04, BLOCK_FRONT + 0.5 * PLATE.z);
    size = PLATE;
  } else if (aIndex < 1.5) {
    float root = BLOCK_FRONT + PLATE.z;
    centre = vec3(PIVOT.x, PIVOT.y + 0.1, 0.5 * (root + PIVOT.z + 0.025));
    size = vec3(0.05, 0.05, PIVOT.z + 0.025 - root);
  } else if (aIndex < 2.5) {
    centre = PIVOT + vec3(0.0, 0.05, 0.0);
    size = vec3(0.04, 0.1, 0.04);
  } else if (aIndex < 3.5) {
    centre = PIVOT + vec3(0.0, -0.02, 0.0);
    size = vec3(0.15, 0.09, 0.15);
    turned = pan;
  } else if (aIndex < 4.5) {
    centre = PIVOT + pan * vec3(0.5 * HOUSING.x + 0.008, -0.08, 0.0);
    size = vec3(0.012, 0.13, 0.08);
    turned = pan;
  } else if (aIndex < 5.5) {
    centre = hinge + swivel * vec3(0.0, 0.0, 0.06);
    size = HOUSING;
    turned = swivel;
  } else if (aIndex < 6.5) {
    centre = hinge + swivel * vec3(0.0, 0.5 * HOUSING.y + 0.014, 0.1);
    size = SHIELD;
    turned = swivel;
  } else if (aIndex < 7.5) {
    centre = hinge + swivel * vec3(0.0, -0.02, 0.06 - 0.5 * HOUSING.z - 0.03);
    size = vec3(0.04, 0.04, 0.06);
    turned = swivel;
  } else if (aIndex < 8.5) {
    centre = hinge + swivel * vec3(0.055, -0.05, 0.06 + 0.5 * HOUSING.z + 0.003);
    size = vec3(0.016, 0.016, 0.008);
    turned = swivel;
  } else {
    float piece = aIndex - FIRST_CABLE;
    if (piece > CABLE_PIECES - 0.5) return;
    vec3 bend = 0.5 * (rear + wall) - vec3(0.0, mix(0.16, 0.28, seed), 0.0);
    float t0 = piece / CABLE_PIECES;
    float t1 = (piece + 1.0) / CABLE_PIECES;
    vec3 a = mix(mix(rear, bend, t0), mix(bend, wall, t0), t0);
    vec3 b = mix(mix(rear, bend, t1), mix(bend, wall, t1), t1);
    centre = 0.5 * (a + b);
    turned = alongAxis(normalize(b - a));
    size = vec3(CABLE, CABLE, distance(a, b) + 0.008);
    vec3 toCamera = cameraPosition - (modelMatrix * vec4(centre + aOffset, 1.0)).xyz;
    float pixel = 2.0 * length(toCamera) / (projectionMatrix[1][1] * uResolution.y);
    size.xy = max(size.xy, vec2(1.2 * pixel));
  }

  vec3 local = centre + turned * (position * size);
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vWorld = world.xyz;
  vLocal = local;
  vNormal = mat3(modelMatrix) * (turned * normal);
  vTile = tile;
  vSeed = seed;
  vPart = part;
  vBox = position;
  vSize = size;
  gl_Position = projectionMatrix * viewMatrix * world;
}
