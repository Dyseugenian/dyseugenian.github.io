precision highp float;

uniform float uTileHeight;

#include "chunks/hash.glsl"
#include "chunks/rooms.glsl"
#include "chunks/inset.glsl"
#include "chunks/rungs.glsl"
#include "chunks/presence.glsl"

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

out vec2 vSpot;
flat out float vLength;
flat out float vStrength;
flat out float vHole;
flat out float vSeed;

const float ABOVE = 0.04;
const float WIDTH = 0.09;
const float LIFT = 0.003;
const vec2 FADE = vec2(15.0, 25.0);

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  float side = mod(aIndex, 2.0) < 0.5 ? -1.0 : 1.0;
  Rung rung;
  if (!rungAt(aTile, aStorey, floor(aIndex / 2.0), rung)) return;
  if (uPresence > 0.5) {
    markPresent();
    return;
  }
  vSeed = hash12(vec2(rung.pick * 53.0, side) + 623.0);
  vLength = mix(0.12, 0.65, vSeed * vSeed);
  vec3 entry = rung.base + vec3(side * RUNG_HALF, 0.0, LIFT);
  vec3 local = entry + vec3(position.x * WIDTH, ABOVE - (0.5 - position.y) * (vLength + ABOVE), 0.0);
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  float distance = length(world.xyz - cameraPosition);
  float fade = (1.0 - smoothstep(FADE.x, FADE.y, distance)) * exp(-distance * uFogDensity);
  if (fade <= 0.0) return;
  bool freed = rung.loose && side == (rung.shape.y < 0.5 ? 1.0 : -1.0);
  vHole = rung.gone || freed ? 1.0 : 0.0;
  vStrength = mix(0.25, 0.6, hash12(vec2(vSeed, 7.0) + 623.0)) * fade;
  vSpot = vec2(position.x * WIDTH, ABOVE - (0.5 - position.y) * (vLength + ABOVE));
  gl_Position = projectionMatrix * viewMatrix * world;
}
