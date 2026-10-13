precision highp float;

#include "chunks/cables.glsl"
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
out vec3 vSide;
out vec3 vTangent;
out float vAcross;
out float vAlpha;
out float vSoft;
flat out vec2 vTile;
flat out float vSeed;

const vec2 SOFT_RANGE = vec2(10.0, 50.0);
const float SOFT_SPREAD = 1.5;

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vec2 room = roomOf(aTile, aStorey);
  vec2 tile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  if (!layCable(room, tile, aStorey, aIndex)) return;
  if (uPresence > 0.5) {
    markPresent();
    return;
  }

  float t = position.y + 0.5;
  vec3 middle = cableAt(t);
  vec3 tangent = normalize(cableAt(min(t + 0.01, 1.0)) - cableAt(max(t - 0.01, 0.0)));
  vec4 world = modelMatrix * vec4(middle + aOffset, 1.0);
  vec3 toCamera = cameraPosition - world.xyz;
  float pixel = 2.0 * length(toCamera) / (projectionMatrix[1][1] * uResolution.y);
  float soft = smoothstep(SOFT_RANGE.x, SOFT_RANGE.y, length(toCamera));
  float radius = wireRadius(size) * thickness;
  float halfWidth = max(radius, 0.6 * pixel * thickness) * (1.0 + SOFT_SPREAD * soft);
  vec3 side = normalize(cross(tangent, toCamera));
  vec3 widened = side * position.x * 2.0 * halfWidth;
  world.xyz += widened;
  vWorld = world.xyz;
  vLocal = middle + widened;
  vSide = side;
  vTangent = tangent;
  vAcross = position.x * 2.0;
  vAlpha = max(radius / halfWidth, 0.5) * mix(1.0, 0.55, soft);
  vSoft = soft;
  vTile = tile;
  vSeed = seed;
  gl_Position = projectionMatrix * viewMatrix * world;
}
