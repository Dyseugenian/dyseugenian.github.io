precision highp float;

#include "chunks/noise-texture.glsl"
#include "chunks/frame.glsl"
#include "chunks/patches.glsl"
#include "chunks/spalls.glsl"
#include "chunks/cracks.glsl"
#include "chunks/chips.glsl"

uniform float uTileHeight;
uniform float uClimb;

#include "chunks/windows.glsl"
#include "chunks/stains.glsl"
#include "chunks/clouds.glsl"

uniform vec3 cameraPosition;

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
flat in vec2 vTile;
flat in vec3 vMin;
flat in vec3 vMax;

layout(location = 0) out vec4 outLayer;
layout(location = 1) out vec4 outAir;
layout(location = 2) out vec4 outShape;
layout(location = 3) out vec4 outMask;

const bool CONCRETE = SURFACE == 0;
const float SOOT_RISE = 7.5;

float scorch(vec3 local, vec3 normal) {
  vec2 tile = vec2(vTile.x, mod(vTile.y + uTilesClimbed, 4096.0));
  vec2 room;
  vec3 q;
  bool found = false;
  for (int below = 0; below < 3; below++) {
    q = fromWindow(local, tile, float(below), room);
    if (burnt(room)) {
      found = true;
      break;
    }
  }
  float rise = q.y + 0.6;
  if (!found || rise < 0.0) return 0.0;
  float key = hash12(room + 713.0) * 50.0;
  float tongues = fbm(vec2(q.x * 1.4 + key, rise * 0.35)) - 0.5;
  float width = 0.9 + 0.28 * rise + 1.2 * tongues;
  float spread = 1.0 - smoothstep(0.75 * width, width, abs(q.x));
  float fingers = valueNoise(vec2(q.x * 3.0 + key, rise * 0.25));
  float reach = SOOT_RISE * mix(0.3, 1.0, fingers) * mix(0.7, 1.15, hash12(room + 715.0));
  float fade = 1.0 - smoothstep(0.45 * reach, reach, rise);
  float ahead = 1.0 - smoothstep(3.0, 5.0, q.z);
  return spread * fade * ahead * smoothstep(0.0, 0.9, rise) * mix(1.0, 1.4, max(-normal.y, 0.0)) * mix(1.0, 0.45, max(normal.y, 0.0));
}

bool spallsNear(vec2 p, float upright, float footprint) {
  for (int layer = 0; layer < 2; layer++) {
    float spacing = SPALL_SPACINGS[layer];
    vec2 cell = floor(p / spacing);
    Spall spot;
    if (!spallIn(cell, layer, spot)) continue;
    vec2 rel = p - spot.center;
    vec2 local = inSpall(p, spot);
    float reach = 1.8 + (footprint + 0.03) / spot.axes.y;
    if (dot(local, local) < reach * reach) return true;
    if (spot.kind != EXPOSED || upright < 0.5) continue;
    float span = length(spot.axes * spot.along);
    if (p.y < spot.center.y && p.y > cell.y * spacing - footprint && abs(rel.x) < 0.9 * span + footprint) return true;
  }
  return false;
}

bool chipsNear(vec3 normal, vec3 eye, vec2 seed, float footprint) {
  vec4 first;
  vec4 second;
  if (distance(vLocal, eye) > CHIP_DISTANCE) return false;
  if (!chipSites(vLocal, normal, vMin, vMax, seed, first, second)) return false;
  return chipped(vLocal, first, second) < 0.015 + 12.0 * footprint;
}

bool cracksNear(vec2 p, vec2 fromLow, vec2 extent, float upright, float footprint) {
  if (footprint > 0.1) return false;
  Fracture fracture = fractures(p, fromLow, extent, upright, 2.0 * footprint);
  return fracture.open + fracture.deep + fracture.halo + fracture.lip + fracture.healed + fracture.leach > 1e-3;
}

void main() {
  vec3 normal = normalize(vNormal);
  vec2 tile = vec2(vTile.x, mod(vTile.y + uTilesClimbed, 4096.0));
  vec2 building = vec2(vWorld.x, vWorld.y + uClimb);
  vec3 origin = vWorld - vLocal;
  float distance = length(vWorld - cameraPosition);
  float depth = 1.0 - smoothstep(14.0, 40.0, distance);
  vec3 scatter = vec3(0.0);
  if (depth > 0.0) {
    float jitter = ign(gl_FragCoord.xy + floor(uTime * 24.0) * vec2(5.588, 3.17));
    scatter = windowScatter(cameraPosition - origin, vLocal, tile, origin, jitter) * depth
      * mix(0.6, 1.4, hash12(gl_FragCoord.xy + fract(uTime) * 61.0));
  }
  float mist = fbm(vec3(vWorld.x * 0.05, building.y * 0.04, uTime * 0.04));
  vec3 climbed = vec3(0.0, uClimb, 0.0);
  float cloud = clouds(cameraPosition + climbed, vWorld + climbed);

  vec4 layer = vec4(0.0, 0.0, 0.0, 1.0);
  float dense = 0.0;
  vec4 mask = vec4(0.0);
  if (CONCRETE) {
    vec2 seed = vec2(hash12(tile), hash12(tile + 1.7)) * 97.0;
    float weathering = fbm(building * vec2(0.06, 0.035) + 3.0);
    mat3 frame = faceFrame(normal);
    float upright = abs(normal.y) > 0.5 ? 0.0 : 1.0;
    vec2 face = vec2(dot(vLocal, frame[0]), dot(vLocal, frame[1]));
    vec2 fromLow = face - vec2(dot(vMin, frame[0]), dot(vMin, frame[1]));
    vec2 toHigh = vec2(dot(vMax, frame[0]), dot(vMax, frame[1])) - face;
    float footprint = length(fwidth(face));
    vec2 p = face + seed;
    vec3 risen = vWorld + climbed;
    vec2 wall = vec2(dot(risen, frame[0]), dot(risen, frame[1])) + dot(risen, normal) * vec2(1.37, 0.71);
    layer = stains(wall, upright, weathering, footprint);
    float soot = scorch(vLocal, normal);
    if (soot > 0.0) {
      vec2 warp = vec2(fbm(p * 0.6), fbm(p * 0.6 + 7.3)) - 0.5;
      dense = soot * mix(0.65, 1.2, fbm((p + warp * 0.8) * 2.5 + 83.0));
    }
    mask = vec4(
      spallsNear(p, upright, footprint) ? 1.0 : 0.0,
      cracksNear(p, fromLow, fromLow + toHigh, upright, footprint) ? 1.0 : 0.0,
      mendedNear(p, 3.0 * footprint) ? 1.0 : 0.0,
      chipsNear(normal, cameraPosition - origin, seed, footprint) ? 1.0 : 0.0);
  }
  outLayer = vec4(sqrt(clamp(layer.rgb / 1.2, 0.0, 1.0)), layer.a / 1.1);
  outAir = vec4(sqrt(clamp(scatter / 4.0, 0.0, 1.0)), mist);
  outShape = vec4(normal.xy * 0.5 + 0.5, cloud, dense / 2.0);
  outMask = mask;
}
