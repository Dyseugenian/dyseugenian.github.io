precision highp float;

#include "chunks/hash.glsl"
#include "chunks/inset.glsl"
#include "chunks/spalls.glsl"
#include "chunks/rebar.glsl"

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
uniform float uTilesClimbed;
uniform float uBay;
uniform float uTileHeight;
uniform vec2 uResolution;

in vec3 position;
in vec2 aTile;
in vec3 aLow;
in vec3 aHigh;
in vec3 aNormal;
in vec3 aRight;
in vec3 aUp;
in vec4 aPatch;
in float aBar;
in float aProtrudes;

out vec3 vWorld;
out vec3 vNormal;
out float vAlong;
out float vKey;
out float vAround;
out vec3 vTangent;
out vec3 vLocal;
flat out vec2 vTile;

const int RINGS = 8;
const float REACH = 20.0;
const vec3 DOWN = vec3(0.0, -1.0, 0.0);

vec3 awayFrom(vec3 direction, vec3 normal) {
  return normalize(direction + normal * max(0.2 - dot(direction, normal), 0.0));
}

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vec2 tile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  vec2 seed = vec2(hash12(tile), hash12(tile + 1.7)) * 97.0;
  vec3 high = aHigh - vec3(0.0, 0.0, aProtrudes * blockInset(tile));
  vec2 low = vec2(dot(aLow, aRight), dot(aLow, aUp));
  vec2 extent = vec2(dot(high, aRight), dot(high, aUp)) - low;
  int layer = int(aBar) / 2;
  float bar = mod(aBar, 2.0);
  Spall spot;
  vec2 middle = 0.5 * (aPatch.xy + aPatch.zw) + seed;
  if (!spallIn(floor(middle / SPALL_SPACINGS[layer]), layer, spot) || spot.kind != EXPOSED) return;
  vec2 key = vec2(spot.key, 71.0 + 13.0 * bar);
  if (hash12(key) > mix(0.7, 0.4, bar)) return;

  vec2 center = spot.center - seed;
  vec2 span = vec2(length(spot.axes * spot.along), length(spot.axes * spot.along.yx));
  vec2 jitter = vec2(hash12(key + 1.0), hash12(key + 2.0)) - 0.5;
  vec2 lines = low + vec2(barLine(center.x - low.x, extent.x), barLine(center.y - low.y, extent.y));
  vec2 apart = abs(lines - center) / span;
  bool upward = crossBars(spot) && (apart.x < apart.y) != (bar > 0.5);
  vec2 anchor = upward ? vec2(lines.x, center.y + 0.5 * span.y * jitter.y) : vec2(center.x + 0.5 * span.x * jitter.x, lines.y);
  vec2 fromLow = anchor - low;
  if (length(inSpall(anchor + seed, spot)) > 0.7 || any(lessThan(anchor, aPatch.xy))
    || any(greaterThanEqual(anchor, aPatch.zw)) || any(lessThan(fromLow, vec2(REBAR_COVER)))
    || any(greaterThan(fromLow, extent - REBAR_COVER))) return;

  vec3 axis = abs(aNormal);
  float plane = dot(axis, dot(aNormal, vec3(1.0)) > 0.0 ? high : aLow);
  vec3 base = aRight * anchor.x + aUp * anchor.y + axis * plane - aNormal * REBAR_COVER;
  vec3 run = (upward ? aUp : aRight) * (hash12(key + 3.0) < 0.5 ? -1.0 : 1.0);
  vec3 random = vec3(hash12(key + 5.0), hash12(key + 6.0), hash12(key + 7.0)) - 0.5;
  float style = hash12(key + 8.0);
  float size = mix(0.08, 0.45, pow(hash12(key + 9.0), 1.4));
  vec3 first = aNormal + 0.6 * random;
  vec3 second = first + 0.3 * random.yzx;
  float firstLength = REBAR_COVER + 0.5 * size;
  float secondLength = 0.5 * size;
  if (style < 0.3) {
    first = run + 0.35 * aNormal;
    second = aNormal + random;
    firstLength = mix(0.15, 0.35, random.x + 0.5);
    secondLength = size;
  } else if (style < 0.55) {
    first = aNormal + 0.9 * random;
  } else if (style < 0.8) {
    firstLength = REBAR_COVER + mix(0.04, 0.15, random.y + 0.5);
    second = DOWN + 0.35 * aNormal + 0.4 * random.zxy;
    secondLength = size;
  } else {
    firstLength = REBAR_COVER + 0.06;
    second = 2.0 * random.yzx + 0.2 * aNormal;
    secondLength = 1.2 * size;
  }
  first = awayFrom(normalize(first), aNormal);
  second = awayFrom(normalize(second), aNormal);

  int ring = int(position.y + 0.5);
  vec3 bend = cross(first, second);
  vec3 binormal = length(bend) > 1e-3 ? normalize(bend) : normalize(cross(first, abs(first.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  float curl = min(0.08, 0.45 * min(firstLength, secondLength));
  vec3 corner = base + first * firstLength;
  vec3 entry = corner - first * curl;
  vec3 exit = corner + second * curl;
  float curve = curl + 0.5 * length(exit - entry);
  float t = clamp(float(ring - 1) / float(RINGS - 3), 0.0, 1.0);
  float along = ring == 0 ? 0.0 : firstLength - curl + t * curve + (ring == RINGS - 1 ? secondLength - curl : 0.0);
  vec3 middleLine = ring == 0 ? base : ring == RINGS - 1 ? exit + second * (secondLength - curl)
    : mix(mix(entry, corner, t), mix(corner, exit, t), t);
  vec3 tangent = normalize(mix(first, second, t));
  vec3 outward = cross(binormal, tangent);
  float angle = position.x * 6.2832;
  vec3 radial = cos(angle) * outward + sin(angle) * binormal;

  vec3 offset = vec3(aTile.x * uBay, (aTile.y + 0.5 * mod(abs(aTile.x), 2.0)) * uTileHeight, 0.0);
  vec4 world = modelMatrix * vec4(middleLine + offset, 1.0);
  float distance = length(world.xyz - cameraPosition);
  float pixel = 2.0 * distance / (projectionMatrix[1][1] * uResolution.y);
  float radius = max(REBAR_RADIUS * mix(0.7, 1.4, hash12(key + 10.0)), 0.6 * pixel)
    * (1.0 - smoothstep(0.7 * REACH, REACH, distance)) * (1.0 - position.z);
  world.xyz += mat3(modelMatrix) * radial * radius;
  vWorld = world.xyz;
  vNormal = mix(radial, tangent, position.z);
  vAlong = along;
  vKey = spot.key + 37.0 * bar;
  vAround = position.x;
  vTangent = tangent;
  vLocal = middleLine + radial * radius;
  vTile = tile;
  gl_Position = projectionMatrix * viewMatrix * world;
}
