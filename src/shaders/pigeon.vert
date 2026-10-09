precision highp float;

#include "chunks/hash.glsl"
#include "chunks/inset.glsl"
#include "chunks/rooms.glsl"

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uTileHeight;

in vec3 position;
in vec3 normal;
in float aHead;
in vec3 aOffset;
in vec2 aTile;
in float aStorey;
in float aIndex;

out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;
out float vHead;
flat out vec2 vTile;
flat out float vSeed;

const vec3 NECK = vec3(0.0, 0.17, 0.07);
const float GLANCE = 2.5;
const float SETTLE = 23.0;

mat3 yaw(float angle) {
  return mat3(cos(angle), 0.0, -sin(angle), 0.0, 1.0, 0.0, sin(angle), 0.0, cos(angle));
}

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vec2 room = roomOf(aTile, aStorey);
  if (plantFloor(room) || hash12(room + 291.0) > (aIndex < 0.5 ? 0.12 : 0.04)) return;
  float pick = hash12(room + 293.0);
  float place = hash12(room + 297.0);
  vec2 tile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  vec3 perch = vec3(mix(-1.0, 1.0, place), 1.15, -1.42);
  if (aStorey < 0.5 && pick < 0.4) {
    perch = vec3(mix(-2.8, -1.4, place), 2.7, 0.75 - blockInset(tile));
  } else if (airConditioned(room) && pick < 0.7) {
    perch = vec3(airConditionerShift(room) + mix(-0.5, 0.5, place), 2.175, -1.6);
  } else if (airConditioned(room)) {
    perch.x = sign(place - 0.5) * 0.98;
  }
  perch.x += 0.24 * aIndex;

  float seed = hash12(room + aIndex * 5.0);
  float settle = uTime / SETTLE + seed * 10.0;
  float era = floor(settle);
  float moved = smoothstep(0.0, 0.015, fract(settle));
  vec2 before = vec2(hash12(vec2(era - 1.0, seed * 97.0)), hash12(vec2(era - 1.0, seed * 89.0))) - 0.5;
  vec2 after = vec2(hash12(vec2(era, seed * 97.0)), hash12(vec2(era, seed * 89.0))) - 0.5;
  vec2 pose = mix(before, after, moved);
  float glance = uTime / GLANCE + seed * 7.0;
  float look = mix(hash12(vec2(floor(glance) - 1.0, seed * 61.0)), hash12(vec2(floor(glance), seed * 61.0)),
    smoothstep(0.0, 0.08, fract(glance))) - 0.5;

  vec3 shape = position;
  vec3 bent = normal;
  if (aHead > 0.5) {
    shape = NECK + yaw(1.6 * look) * (shape - NECK);
    bent = yaw(1.6 * look) * bent;
  }
  mat3 facing = yaw(seed * 6.2832 + 1.2 * pose.x);
  vec3 local = perch + facing * shape + vec3(0.25 * pose.y, 0.07 * sin(3.1416 * moved), 0.0)
    + vec3(0.0, aStorey * 0.5 * uTileHeight, 0.0);
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vWorld = world.xyz;
  vLocal = local;
  vNormal = facing * bent;
  vHead = aHead;
  vTile = tile;
  vSeed = seed;
  gl_Position = projectionMatrix * viewMatrix * world;
}
