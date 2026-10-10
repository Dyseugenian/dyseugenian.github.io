precision highp float;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTileHeight;
uniform float uBay;
uniform float uOuterX;

#include "chunks/hash.glsl"
#include "chunks/rooms.glsl"
#include "chunks/inset.glsl"
#include "chunks/spouts.glsl"

in vec3 position;
in vec3 normal;
in float aPart;
in vec3 aOffset;
in vec2 aTile;
in float aStorey;

out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;
out float vAlong;
out float vRadial;
flat out vec2 vTile;
flat out float vPart;
flat out float vDrips;
out float vRun;
out vec2 vAround;
out vec3 vTangent;
flat out float vLength;
flat out float vClosed;
flat out float vSeed;

void main() {
  vec2 room = roomOf(aTile, aStorey);
  if (!spoutOf(room, aTile, aStorey)) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  Spout spout = spoutAt(room, aTile);
  float total = spoutLength(spout);
  float end = spout.closed ? total - WALL_DEPTH + 0.06 : total;
  float s = aPart < 0.5 ? position.z * total : aPart < 1.5 ? WALL_DEPTH + position.z : end + position.z;
  vec3 tangent;
  vec3 centre = spoutCentre(spout, s, tangent);
  mat3 frame = spoutFrame(tangent);
  vec3 local = centre + frame * vec3(position.xy * spout.radius, 0.0);
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vWorld = world.xyz;
  vLocal = local;
  vNormal = mat3(modelMatrix) * (frame * normal);
  vAlong = s / total;
  vRadial = length(position.xy);
  vTile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  vPart = aPart;
  vDrips = spout.drips;
  vRun = s;
  vAround = position.xy;
  vTangent = mat3(modelMatrix) * tangent;
  vLength = total;
  vClosed = spout.closed ? 1.0 : 0.0;
  vSeed = hash12(room + 517.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}
