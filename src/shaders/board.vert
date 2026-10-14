precision highp float;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTileHeight;

#include "chunks/hash.glsl"
#include "chunks/rooms.glsl"
#include "chunks/presence.glsl"

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
flat out float vPanel;
flat out vec2 vAlong;
out vec3 vBox;
flat out vec3 vSize;

const float BOTTOM = 1.16;
const float TOP = 3.3;
const float FACE_Z = -2.5;
const float THICKNESS = 0.022;
const float PLANKS = 12.0;
const float HALF_SPAN = 1.29;
const float REVEAL_HALF = 1.4;

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vec2 room = roomOf(aTile, aStorey);
  if (!boarded(room)) return;
  if (uPresence > 0.5) {
    markPresent();
    return;
  }
  float base = aStorey * 0.5 * uTileHeight;
  float seed = hash12(room + aIndex * 13.7 + 719.0);
  vec2 centre;
  vec2 size;
  float angle;
  float layer;
  vPanel = 0.0;

  if (aIndex < PLANKS - 0.5) {
    float cursor = BOTTOM;
    float width = 0.0;
    for (float i = 0.0; i < PLANKS; i++) {
      vec2 key = room + i * 7.31 + 727.0;
      width = hash12(key) < 0.1 ? mix(0.45, 0.8, hash12(key + 1.0)) : mix(0.1, 0.25, hash12(key + 2.0));
      if (i > aIndex - 0.5) break;
      cursor += width + mix(-0.03, 0.03, pow(hash12(key + 3.0), 1.8));
    }
    if (cursor > TOP - 0.06) return;
    vec2 key = room + aIndex * 7.31 + 727.0;
    vPanel = width > 0.4 ? 1.0 : 0.0;
    float shape = hash12(key + 4.0);
    float span = 2.0 * HALF_SPAN + mix(-0.12, 0.3, hash12(key + 5.0));
    float shift = mix(-0.14, 0.14, hash12(key + 6.0));
    if (shape < 0.12 && vPanel < 0.5) {
      span = mix(1.25, 1.6, hash12(key + 7.0));
      shift = (hash12(key + 8.0) < 0.5 ? -1.0 : 1.0) * (HALF_SPAN - 0.5 * span + 0.04);
    }
    angle = shape > 0.85 ? (hash12(key + 9.0) - 0.5) * 0.36 : (hash12(key + 9.0) - 0.5) * 0.1;
    if (vPanel > 0.5) angle *= 0.3;
    span = min(span, (2.0 * (REVEAL_HALF - abs(shift)) - width * abs(sin(angle))) / cos(angle));
    centre = vec2(shift, cursor + 0.5 * width);
    size = vec2(span, width);
    layer = mod(aIndex, 2.0) + step(0.85, shape);
  } else {
    float brace = aIndex - PLANKS;
    float count = hash12(room + 741.0) < 0.3 ? 2.0 : hash12(room + 743.0) < 0.5 ? 1.0 : 0.0;
    if (brace > count - 0.5) return;
    float lean = (brace < 0.5 ? 1.0 : -1.0) * (hash12(room + 745.0) < 0.5 ? 1.0 : -1.0);
    vec2 from = vec2(-lean * mix(1.05, 1.25, hash12(room + brace + 747.0)), BOTTOM + mix(0.05, 0.4, hash12(room + brace + 749.0)));
    vec2 to = vec2(lean * mix(1.05, 1.25, hash12(room + brace + 751.0)), TOP - mix(0.08, 0.45, hash12(room + brace + 753.0)));
    vec2 along = to - from;
    centre = 0.5 * (from + to);
    size = vec2(length(along) + 0.1, mix(0.11, 0.16, seed));
    angle = atan(along.y, along.x);
    layer = 3.0 + brace;
  }

  vec2 along = vec2(cos(angle), sin(angle));
  vec2 across = vec2(-along.y, along.x);
  vec3 extent = vec3(size, THICKNESS * (vPanel > 0.5 ? 0.7 : 1.0));
  float z = FACE_Z + 0.5 * extent.z + layer * 0.9 * THICKNESS;
  vec3 local = vec3(centre + along * position.x * extent.x + across * position.y * extent.y + vec2(0.0, base), z + position.z * extent.z);
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vWorld = world.xyz;
  vLocal = local;
  vNormal = mat3(modelMatrix) * vec3(along * normal.x + across * normal.y, normal.z);
  vTile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  vSeed = seed;
  vAlong = along;
  vBox = position;
  vSize = extent;
  gl_Position = projectionMatrix * viewMatrix * world;
}
