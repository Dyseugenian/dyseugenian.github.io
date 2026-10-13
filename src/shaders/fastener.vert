precision highp float;

#include "chunks/cables.glsl"
#include "chunks/presence.glsl"

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
uniform vec2 uResolution;

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

const float SLOTS = 8.0;

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vec2 room = roomOf(aTile, aStorey);
  vec2 tile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  float cable = floor(aIndex / SLOTS);
  if (!layCable(room, tile, aStorey, cable)) return;
  int slot = int(aIndex - cable * SLOTS);
  vec4 point = fastener[slot];
  if (point.w < 0.5) return;
  if (uPresence > 0.5) {
    markPresent();
    return;
  }

  vec3 face = fastenerFace[slot].xyz;
  float depth = fastenerFace[slot].w;
  vec3 along = abs(face.y) > 0.5 ? vec3(1.0, 0.0, 0.0) : UP;
  vec3 across = cross(face, along);
  bool anchor = point.w > 1.5;
  float extent = anchor ? 0.03 : 0.015;
  vec3 toCamera = cameraPosition - (modelMatrix * vec4(point.xyz + aOffset, 1.0)).xyz;
  float pixel = 2.0 * length(toCamera) / (projectionMatrix[1][1] * uResolution.y);
  extent = max(extent, 1.5 * pixel);
  float outward = mix(-depth, anchor ? 0.025 : 0.012, position.z + 0.5);
  vec3 local = point.xyz + along * position.y * 2.0 * extent + across * position.x * 2.0 * extent + face * outward;
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vWorld = world.xyz;
  vLocal = local;
  vNormal = across * normal.x + along * normal.y + face * normal.z;
  vTile = tile;
  vSeed = seed;
  gl_Position = projectionMatrix * viewMatrix * world;
}
