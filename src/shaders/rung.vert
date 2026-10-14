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
uniform vec2 uResolution;

in vec3 position;
in vec3 aOffset;
in vec2 aTile;
in float aStorey;
in float aIndex;

out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;
out float vAlong;
out float vAround;
out float vTread;
flat out vec2 vTile;
flat out float vKey;
flat out float vWorn;

const float PI = 3.14159;
const float CORNER = 0.035;
const float SET_IN = 0.04;
const float RADIUS = 0.0125;
const vec2 FADE = vec2(40.0, 55.0);

vec3 rungPath(float k, float reach, float startA, float startB, out vec3 tangent) {
  float w = RUNG_HALF;
  float c = CORNER;
  if (k < 1.0) {
    tangent = vec3(0.0, 0.0, 1.0);
    return vec3(-w, 0.0, mix(startA, reach - c, k));
  }
  if (k < 2.0) {
    float a = (k - 1.0) * 0.5 * PI;
    tangent = vec3(sin(a), 0.0, cos(a));
    return vec3(-w + c - c * cos(a), 0.0, reach - c + c * sin(a));
  }
  if (k < 3.0) {
    tangent = vec3(1.0, 0.0, 0.0);
    return vec3(mix(-w + c, w - c, k - 2.0), 0.0, reach);
  }
  if (k < 4.0) {
    float a = (k - 3.0) * 0.5 * PI;
    tangent = vec3(cos(a), 0.0, -sin(a));
    return vec3(w - c + c * sin(a), 0.0, reach - c + c * cos(a));
  }
  tangent = vec3(0.0, 0.0, -1.0);
  return vec3(w, 0.0, mix(reach - c, startB, k - 4.0));
}

mat3 turnZ(float angle) {
  return mat3(cos(angle), sin(angle), 0.0, -sin(angle), cos(angle), 0.0, 0.0, 0.0, 1.0);
}

mat3 droop(float angle) {
  return mat3(1.0, 0.0, 0.0, 0.0, cos(angle), sin(angle), 0.0, -sin(angle), cos(angle));
}

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  Rung rung;
  if (!rungAt(aTile, aStorey, aIndex, rung) || rung.gone) return;
  if (uPresence > 0.5) {
    markPresent();
    return;
  }

  vec4 shape = rung.shape;
  float reach = mix(0.13, 0.16, shape.x);
  float pivot = shape.y < 0.5 ? -1.0 : 1.0;
  float startA = rung.loose && pivot > 0.0 ? 0.005 : -SET_IN;
  float startB = rung.loose && pivot < 0.0 ? 0.005 : -SET_IN;
  float k = position.y;
  vec3 tangent;
  vec3 point = rungPath(k, reach, startA, startB, tangent);
  bool tip = position.z > 0.5;
  if (rung.stubs) {
    bool first = k < 2.5;
    float stub = mix(0.015, 0.07, first ? shape.z : shape.w);
    float x = first ? -RUNG_HALF : RUNG_HALF;
    float along = first ? min(k, 1.0) : 1.0 - max(k - 4.0, 0.0);
    point = vec3(x, 0.0, mix(-SET_IN, stub, along));
    tangent = vec3(0.0, 0.0, first ? 1.0 : -1.0);
    tip = tip || (k > 1.0 && k < 4.0);
  }
  float bow = rung.bent ? mix(0.0, 0.05, shape.w) : 0.0;
  if (k > 2.0 && k < 3.0) point.y -= bow * sin(PI * (k - 2.0));
  mat3 turn = turnZ(mix(-0.025, 0.025, shape.z));
  vec3 hinge = vec3(0.0);
  if (rung.loose) {
    hinge = vec3(pivot * RUNG_HALF, 0.0, 0.0);
    turn = turn * turnZ(pivot * mix(0.25, 0.5, shape.z));
  }
  if (rung.bent) turn = turn * droop(mix(0.12, 0.5, shape.z));

  vec3 outward = vec3(tangent.z, 0.0, -tangent.x);
  float angle = position.x * 2.0 * PI;
  vec3 radial = turn * (cos(angle) * outward + sin(angle) * vec3(0.0, 1.0, 0.0));
  vec3 centre = rung.base + hinge + turn * (point - hinge);

  vec4 world = modelMatrix * vec4(centre + aOffset, 1.0);
  float distance = length(world.xyz - cameraPosition);
  float fade = 1.0 - smoothstep(FADE.x, FADE.y, distance);
  if (fade <= 0.0) return;
  float pixel = 2.0 * distance / (projectionMatrix[1][1] * uResolution.y);
  float radius = max(RADIUS, 0.6 * pixel) * fade * (tip ? 0.0 : 1.0);
  world.xyz += mat3(modelMatrix) * radial * radius;
  float leg = reach - CORNER + SET_IN;
  float arc = 0.5 * PI * CORNER;
  vAlong = clamp(k, 0.0, 1.0) * leg + clamp(k - 1.0, 0.0, 1.0) * arc
    + clamp(k - 2.0, 0.0, 1.0) * 2.0 * (RUNG_HALF - CORNER) + clamp(k - 3.0, 0.0, 1.0) * arc
    + clamp(k - 4.0, 0.0, 1.0) * leg;
  vWorld = world.xyz;
  vLocal = centre + radial * radius;
  vNormal = mat3(modelMatrix) * (tip ? turn * tangent : radial);
  vAround = position.x;
  vTread = rung.stubs ? 0.0 : 1.0 - smoothstep(0.3, 0.6, abs(k - 2.5));
  vTile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  vKey = rung.pick * 97.0 + rung.room.x * 13.0;
  vWorn = rung.worn;
  gl_Position = projectionMatrix * viewMatrix * world;
}
