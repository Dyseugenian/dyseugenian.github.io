precision highp float;

#include "chunks/noise-texture.glsl"
#include "chunks/light.glsl"
#include "chunks/windows.glsl"

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
uniform float uFogDensity;

in vec3 position;
in vec3 aOffset;
in vec2 aTile;
in float aStorey;
in float aIndex;

out vec2 vCorner;
out vec3 vLight;
out float vDensity;
out float vSeed;

const float PUFFS = 8.0;
const float LIFE = 5.0;

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vec2 room = roomOf(aTile, aStorey);
  float vent = step(PUFFS, aIndex);
  float puff = aIndex - vent * PUFFS;
  vec3 origin = vec3(0.175 + airConditionerShift(room), 1.48, -1.3);
  vec3 blow = vec3(0.0, 0.0, 0.7);
  if (vent > 0.5) {
    if (plantFloor(room) || hash12(room + 229.0) <= 0.55 || hash12(room + 263.0) > 0.5) return;
    origin = vec3(mix(-0.8, 0.8, hash12(room + 227.0)), 0.275, -1.78);
    blow = vec3(0.0, 0.0, 0.9);
  } else if (!airConditioned(room) || hash12(room + 261.0) > 0.45) {
    return;
  }

  float seed = hash12(room + vec2(puff, vent) * 7.0);
  float age = fract(uTime / (LIFE * mix(0.8, 1.2, seed)) + puff / PUFFS + hash12(room + vent));
  float gust = valueNoise(vec2(uTime * 0.35, room.y * 0.3 + room.x * 0.7)) - 0.4;
  float wander = valueNoise(vec2(uTime * 0.3 + seed * 20.0, puff)) - 0.5;
  vec3 local = origin + blow * (1.0 - (1.0 - age) * (1.0 - age))
    + vec3(0.5 * wander * age, 0.3 * age + 1.1 * age * age, 0.6 * gust * age)
    + vec3(0.0, aStorey * 0.5 * uTileHeight, 0.0);
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vec3 toCamera = normalize(cameraPosition - world.xyz);
  float distance = length(cameraPosition - world.xyz);
  vec2 tile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  vLight = nightLight(toCamera, world.xyz, 1.0, 1.0)
    + windowWash(local, toCamera, toCamera, tile, world.x - local.x, 1.0);
  vDensity = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.35, 1.0, age)) * exp(-distance * uFogDensity);
  vSeed = seed * 31.0;
  vCorner = position.xy;

  float size = mix(0.08, 0.6, sqrt(age));
  float turn = seed * 6.2832 + age * (seed - 0.5) * 2.0;
  vec2 corner = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * position.xy * size;
  vec4 view = viewMatrix * world;
  view.xy += corner;
  gl_Position = projectionMatrix * view;
}
