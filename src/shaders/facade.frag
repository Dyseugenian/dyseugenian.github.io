precision highp float;
precision highp sampler3D;

#include "chunks/noise-texture.glsl"
#include "chunks/chips.glsl"
#include "chunks/spalls.glsl"
#include "chunks/rebar.glsl"
#include "chunks/light.glsl"
#include "chunks/windows.glsl"
#include "chunks/cracks.glsl"
#include "chunks/sky.glsl"
#include "chunks/clouds.glsl"

uniform vec3 cameraPosition;
uniform vec2 uResolution;
uniform vec2 uVanish;
uniform vec4 uBacklights;
uniform vec3 uSky;
uniform float uExposure;
uniform vec3 uConcrete;
uniform vec3 uConcreteWarm;
uniform vec3 uSalt;
uniform vec3 uGrime;
uniform vec3 uRust;
uniform vec3 uMoss;
uniform vec3 uNewsprint;
uniform vec3 uNewsprintAged;
uniform vec3 uAppliance;
uniform vec3 uLinen;
uniform vec3 uDenim;
uniform vec3 uMadder;
uniform vec3 uGlassGreen;
uniform float uFogDensity;
uniform sampler3D uOcclusion;
uniform vec3 uOcclusionMin;
uniform vec3 uOcclusionSize;
uniform sampler2D uSurface;
uniform float uSurfaceMeters;

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
in float vKind;
flat in vec2 vTile;
flat in vec3 vMin;
flat in vec3 vMax;
flat in float vProtrudes;
in vec3 vUnit;
flat in float vTurn;
in vec2 vCloth;
in float vFold;

out vec4 outColor;

const vec2 PANEL = vec2(1.2, 0.6);
const vec2 BLOCK = vec2(2.4, 1.2);
const float TIE_HOLE = 0.022;
const float BUMP = 0.008;
const float GRIT = 26.0;
const float GRIT_DEPTH = 1.6;
const float DRIP_SPACING = 0.9;
const float PIT_SPACING = 0.12;
const vec3 STAIN_SIZES = vec3(10.0, 3.5, 1.2);
const vec3 STAIN_COVER = vec3(0.4, 0.45, 0.2);
const vec3 STAIN_SALTS = vec3(0.0, 31.0, 67.0);
const float SPECK_SPACING = 0.35;
const float RIM_STRENGTH = 0.9;
const float GLASS_Z = -3.05;
const float SPANDREL_Z = -1.8;
const vec2 PIER_SPAN = vec2(-2.8, -1.4);
const vec2 BLOCK_RISE = vec2(0.9, 2.7);
const vec2 VENT = vec2(0.26, 0.13);
const float FAN_RADIUS = 0.2;
const vec3 GLASS_NORMAL = vec3(0.0, 0.0, 1.0);
const vec3 ROOM = vec3(2.0, 3.2, 4.0);
const float ROOM_LIGHT = 10.0;
const float HIDDEN_ROOM = 0.6;
const float HIDDEN_BAYS = 1.5;
const vec2 GLASS_HALF = vec2(1.05, 1.025);
const vec2 GLASS_BLOCKS = vec2(5.0);
const float BLOCK_JOINT = 0.016;
const float BLOCK_DEPTH = 0.1;
const float BLOCK_WALL = 0.01;
const float BLOCK_BEVEL = 0.02;
const float GLASS_INDEX = 1.5;
const float LAMP_SIZE = 0.06;
const float LAMP_IMAGE = 0.6;
const float BLOCK_DIFFUSE = 4.0;
const float BLOCK_SCATTER = 0.25;
const vec3 BEAMS[5] = vec3[5](
  vec3(0.9, 0.14, 0.3), vec3(0.8, 0.2, 0.35), vec3(0.8, 0.2, 0.35), vec3(1.6, 0.28, 0.5), vec3(1.8, 0.4, 0.55));
const vec2 BEAM_AXES[5] = vec2[5](vec2(1.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0), vec2(0.0, 1.0));
const bool CONCRETE = SURFACE == 0;
const bool GLASS = SURFACE == 1;
const bool FITTINGS = SURFACE == 2;

struct Concrete {
  vec3 albedo;
  float height;
  vec3 detail;
  vec3 emission;
};

float resolved(float frequency, float footprint) {
  return 1.0 - smoothstep(0.2, 0.6, footprint * frequency);
}

float toJoint(float at, float first, float last, float size) {
  return last < first ? 1e3 : abs(at - clamp(round(at), first, last)) * size;
}

float line(float coordinate, float period, float width) {
  float edge = abs(fract(coordinate / period + 0.5) - 0.5) * period;
  float blur = fwidth(coordinate);
  return 1.0 - smoothstep(width - blur, width + blur, edge);
}

mat3 faceFrame(vec3 normal) {
  vec3 facing = abs(normal);
  if (facing.y > 0.5) return mat3(vec3(1, 0, 0), vec3(0, 0, 1), normal);
  if (facing.x > 0.5) return mat3(vec3(0, 0, 1), vec3(0, 1, 0), normal);
  return mat3(vec3(1, 0, 0), vec3(0, 1, 0), normal);
}

float drips(vec2 p, float belowTop, float footprint) {
  float cell = floor(p.x / DRIP_SPACING);
  if (hash12(vec2(cell, 3.1)) < 0.5) return 0.0;
  float reach = mix(0.4, 2.2, hash12(vec2(cell, 7.9)));
  float center = (cell + mix(0.2, 0.8, hash12(vec2(cell, 5.3)))) * DRIP_SPACING;
  float meander = (valueNoise(vec2(belowTop * 1.5, cell)) - 0.5) * 0.06;
  float width = mix(0.03, 0.1, hash12(vec2(cell, 9.7)))
    * (1.0 - 0.6 * smoothstep(0.0, reach, belowTop)) + footprint;
  float across = (p.x - center + meander) / width;
  return exp(-across * across) * exp(-belowTop / reach)
    * mix(0.5, 1.0, valueNoise(vec2(p.x * 20.0, belowTop * 3.0)));
}

float grit(vec2 p, float footprint) {
  vec2 at = p * GRIT;
  float coarse = mix(0.5, valueNoise(at), resolved(GRIT, footprint));
  float fine = mix(0.5, valueNoise(at * 2.3 + 7.0), resolved(GRIT * 2.3, footprint));
  return mix(coarse, fine, 0.35);
}

vec3 stain(vec3 albedo, vec2 wall, vec2 warp, float size, float salt, float cover, float upright, float footprint) {
  vec2 at = (wall + warp * size * 0.6) / size;
  at.y *= mix(1.0, 0.7, upright);
  vec2 shaped = at + 0.45 * (vec2(fbm(at * 1.1 + salt + 5.0), fbm(at * 1.1 + salt + 23.0)) - 0.5);
  float coarse = fbm(at * 2.7 + salt);
  float fine = valueNoise(at * 9.0 + salt + 3.0);
  float grain = mix(0.5, valueNoise(at * 31.0 + salt), resolved(31.0 / size, footprint));
  float ragged = (coarse - 0.5) + 0.45 * (fine - 0.5) + 0.2 * (grain - 0.5);
  float droplets = mix(0.0, valueNoise(at * 17.0 + salt + 41.0), resolved(17.0 / size, footprint));
  float flow = mix(1.0, mix(0.6, 1.1, valueNoise(vec2(at.x * 20.0, at.y * 1.5) + salt)), upright);
  float clumps = mix(0.35, 1.0, smoothstep(0.3, 0.7, valueNoise(at * 14.0 + salt))) * mix(0.6, 1.0, grain);
  vec2 base = floor(shaped - 0.5);
  for (int n = 0; n < 4; n++) {
    vec2 cell = base + vec2(n % 2, n / 2);
    vec2 key = cell + salt;
    if (hash12(key) > cover * smoothstep(0.2, 0.6, valueNoise(cell * 0.43 + salt))) continue;
    float scale = mix(0.06, 0.22, hash12(key + 2.0));
    vec2 center = cell + 0.5 + max(1.0 - 4.4 * scale, 0.0) * (vec2(hash12(key + 3.0), hash12(key + 5.0)) - 0.5);
    float heading = 6.2832 * hash12(key + 11.0);
    float lobes = 2.0 + floor(5.0 * hash12(key + 7.0));
    vec2 local = (shaped - center) / scale;
    vec2 swirl = 2.5 * (vec2(fbm(local * 0.6 + key * 1.3), fbm(local * 0.6 + key * 1.3 + 19.0)) - 0.47);
    vec2 blob = shaped + scale * mix(0.2, 0.5, hash12(key + 73.0)) * swirl;
    float runLength = min(mix(0.6, 2.5, hash12(key + 41.0)) * scale, 0.15) * step(0.4, hash12(key + 53.0));
    float field = 0.0;
    float runs = 0.0;
    vec2 lobe = center;
    for (int i = 0; i < 6; i++) {
      if (float(i) >= lobes) break;
      vec2 lobeKey = key + float(i) * 7.31;
      heading += 2.6 * (hash12(lobeKey + 13.0) - 0.5);
      vec2 from = i % 2 == 1 ? center : lobe;
      if (i > 0) lobe = from + scale * mix(0.5, 1.0, hash12(lobeKey + 11.0)) * vec2(cos(heading), sin(heading) - 0.4 * upright);
      float radius = scale * mix(0.4, 0.85, hash12(lobeKey + 17.0)) * (i == 0 ? 1.3 : 1.0);
      vec2 offset = blob - lobe;
      offset.y *= offset.y < 0.0 ? mix(1.0, 0.6, upright) : mix(1.0, 1.4, upright);
      float tilt = 3.1416 * hash12(lobeKey + 19.0);
      offset = mat2(cos(tilt), sin(tilt), -sin(tilt), cos(tilt)) * offset;
      offset.x /= mix(1.0, 1.8, hash12(lobeKey + 23.0));
      field += exp(-dot(offset, offset) / (radius * radius));
      float column = (blob.x - lobe.x) / radius;
      float below = lobe.y - blob.y - 0.5 * radius;
      runs = max(runs, exp(-column * column) * smoothstep(-radius, 0.0, below) * exp(-max(below, 0.0) / max(runLength, 1e-3)));
    }
    if (field < 0.02 && runs * upright < 0.02) continue;
    float outline = 2.5 * (fbm(local * 1.1 + key * 1.7) - 0.47) + 0.6 * (valueNoise(local * 3.0 + key) - 0.5)
      + mix(0.0, 0.35 * (valueNoise(local * 8.0 + key) - 0.5), resolved(8.0 / (scale * size), footprint));
    float threshold = mix(0.35, 0.6, hash12(key + 31.0));
    float edged = field + mix(0.2, 0.5, hash12(key + 37.0)) * (outline + 0.5 * ragged) * smoothstep(0.0, threshold, field);
    float soft = mix(0.04, 0.4, pow(hash12(key + 43.0), 1.5)) + footprint / (size * scale);
    float holes = step(0.65, hash12(key + 71.0)) * smoothstep(0.62, 0.7, fbm(local * 1.3 + key * 2.3 + 13.0));
    float fill = smoothstep(threshold, threshold + soft, edged) * (1.0 - 0.85 * holes);
    float satellites = step(0.5, hash12(key + 47.0)) * smoothstep(0.76, 0.82, droplets)
      * smoothstep(0.15, 0.6, edged / threshold) * (1.0 - fill);
    float strands = smoothstep(0.5, 0.8, valueNoise(vec2((shaped.x - center.x) / scale * mix(2.0, 5.0, hash12(key + 59.0)), key.y + 5.0)));
    float drips = upright * runs * strands * (1.0 - fill);
    float core = mix(0.5, 1.0, smoothstep(threshold, threshold + 0.7, edged));
    float pooled = mix(1.0, mix(1.25, 0.7, smoothstep(-1.5, 1.5, (shaped.y - center.y) / scale)), upright);
    float amount = max(fill * core * flow * mix(0.6, 1.0, fine) * pooled, max(0.8 * drips, 0.7 * satellites));
    float depth = mix(0.15, 0.5, hash12(key + 29.0)) * mix(0.5, 1.0, smoothstep(0.06, 0.15, scale * size))
      * mix(1.0, 0.7, smoothstep(0.8, 2.0, scale * size));
    float kind = hash12(key + 23.0);
    vec4 over = step(vec4(0.4, 0.6, 0.72, 0.84), vec4(kind));
    vec4 kinds = vec4(1.0 - over.x, over.xyz - over.yzw);
    float lines = resolved(25.0 / size, footprint) * step(0.4, hash12(key + 61.0));
    float inner = threshold + mix(0.15, 0.4, hash12(key + 67.0));
    float tide = exp(-abs(edged - threshold) / 0.02) + 0.6 * exp(-abs(edged - inner) / 0.015);
    float halo = smoothstep(threshold - 0.12, threshold, edged) * (1.0 - fill);
    float crust = smoothstep(threshold, threshold + 0.1, edged) * mix(0.2, 1.0, grain) * mix(0.5, 1.0, fine);
    albedo *= mix(1.0, (1.0 - depth * amount - 0.12 * tide * lines) * (1.0 + 0.06 * halo), kinds.x);
    albedo = mix(albedo, uGrime, kinds.y * min(1.5 * depth * amount, 0.85));
    albedo = mix(albedo, uSalt * 1.08, kinds.z * min(1.2 * depth, 0.45) * max(crust, max(0.6 * drips, 0.5 * satellites)));
    albedo = mix(albedo, uRust * mix(0.6, 0.9, fine), kinds.w * depth * amount);
    albedo = mix(albedo, uMoss * mix(0.7, 1.1, fine), over.w * min(1.6 * depth * fill * core * clumps, 0.7));
  }
  return albedo;
}

float streaks(vec2 wall, float footprint) {
  float region = smoothstep(0.45, 0.75, valueNoise(wall * vec2(0.12, 0.03) + 61.0));
  if (region == 0.0) return 0.0;
  float column = valueNoise(vec2(wall.x * 1.6, wall.y * 0.05 + 11.0));
  float reach = smoothstep(0.25, 0.65, valueNoise(vec2(wall.x * 0.9 + 3.0, wall.y * 0.4)));
  float strand = mix(0.5, valueNoise(vec2(wall.x * 7.0, wall.y * 0.15 + 5.0)), resolved(7.0, footprint));
  float fibre = mix(0.5, valueNoise(vec2(wall.x * 23.0, wall.y * 0.3 + 2.0)), resolved(23.0, footprint));
  return region * smoothstep(0.5, 0.8, column) * reach * mix(0.3, 1.0, strand) * mix(0.6, 1.2, fibre);
}

float speck(vec2 wall, float footprint, out float pale) {
  vec2 cell = floor(wall / SPECK_SPACING);
  float density = smoothstep(0.4, 0.8, valueNoise(wall * 0.5 + 91.0));
  pale = step(0.75, hash12(cell + 127.0));
  if (hash12(cell + 103.0) > 0.58 * density) return 0.0;
  vec2 center = (cell + 0.25 + 0.5 * vec2(hash12(cell + 107.0), hash12(cell + 109.0))) * SPECK_SPACING;
  float radius = mix(0.008, 0.06, pow(hash12(cell + 113.0), 2.0));
  float ragged = mix(0.8, 1.2, valueNoise(wall * 60.0 + cell));
  return (1.0 - smoothstep(radius * 0.5, radius + footprint, length(wall - center) * ragged))
    * resolved(0.3 / radius, footprint);
}

Concrete concrete(mat3 frame, vec2 seed, float weathering) {
  vec3 normal = frame[2];
  bool level = abs(normal.y) > 0.5;
  float upright = level ? 0.0 : 1.0;
  vec2 face = vec2(dot(vLocal, frame[0]), dot(vLocal, frame[1]));
  vec2 fromLow = face - vec2(dot(vMin, frame[0]), dot(vMin, frame[1]));
  vec2 toHigh = vec2(dot(vMax, frame[0]), dot(vMax, frame[1])) - face;
  float edge = min(min(fromLow.x, toHigh.x), min(fromLow.y, toHigh.y));
  float footprint = length(fwidth(face));
  vec2 p = face + seed;

  vec2 warp = vec2(fbm(p * 0.6), fbm(p * 0.6 + 7.3)) - 0.5;
  vec2 q = p + warp * 0.8;
  float blotch = fbm(q * 0.45);
  float mottle = fbm(q * 2.6 + 11.0);
  vec2 wander = vec2(valueNoise(face * 0.9 + seed), valueNoise(face * 0.9 + seed + 19.0)) - 0.5;
  vec2 extent = fromLow + toHigh;
  vec2 count = max(round(extent / BLOCK), 1.0);
  vec2 blockSize = extent / count;
  vec2 laid = (fromLow + 0.03 * wander) / blockSize;
  float course = clamp(floor(laid.y), 0.0, count.y - 1.0);
  float shifted = mod(course, 2.0);
  float staggered = laid.x - 0.5 * shifted;
  float upTo = count.x - 1.0 - shifted;
  vec2 block = vec2(clamp(floor(staggered), 0.0, upTo), course);
  float fromJoint = min(toJoint(staggered, 1.0, upTo, blockSize.x), toJoint(laid.y, 1.0, count.y - 1.0, blockSize.y));
  vec2 blockKey = block + seed + vMin.xy * 3.1 + vMin.z;
  float blockTone = mix(0.86, 1.08, hash12(blockKey));
  float partTone = mix(0.86, 1.08, hash13(vMin * 3.1 + vMax * 1.7 + seed.xyx));
  float pour = hash12(blockKey + 13.0);
  float shift = hash12(blockKey + 29.0);
  float warmth = (pour > 0.4 && pour < 0.7) || pour > 0.9 ? mix(0.15, 0.3, shift) : 0.0;
  warmth = max(warmth, 0.15 * step(0.7, hash13(vMin * 2.3 + vMax * 4.1 + seed.yxy)));
  float darker = pour > 0.7 ? mix(0.06, 0.12, shift) : 0.0;
  vec3 body = mix(uConcrete, uConcreteWarm, warmth) * (1.0 - darker) * blockTone * partTone;

  vec4 coarse = texture(uSurface, p / uSurfaceMeters);
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  vec4 fine = texture(uSurface, turn * (p.yx + 31.0) / (uSurfaceMeters * 0.61));
  vec2 slope = (coarse.xy * 2.0 - 1.0) + 0.6 * (transpose(turn) * (fine.xy * 2.0 - 1.0));
  float grain = 0.5;
  if (footprint < 0.6 / GRIT) {
    grain = grit(p, footprint);
    float nudge = 0.25 / GRIT;
    slope += GRIT_DEPTH * (vec2(grit(p + vec2(nudge, 0.0), footprint), grit(p + vec2(0.0, nudge), footprint)) - grain);
  }
  vec3 detail = normalize(vec3(slope, 1.0));
  float relief = mix(coarse.z, fine.z, 0.4);
  float cavity = coarse.w;

  vec3 albedo = body * mix(0.7, 1.12, blotch) * mix(0.86, 1.08, mottle);
  albedo *= mix(0.7, 1.08, weathering) * mix(0.84, 1.06, relief);
  albedo *= mix(0.7, 1.0, smoothstep(0.1, 0.5, cavity)) * mix(0.9, 1.06, grain);
  float height = 0.5 * mottle;

  float drip = upright * drips(p, toHigh.y, footprint);
  albedo *= 1.0 - 0.4 * drip - 0.12 * upright * exp(-toHigh.y / 0.25) * mottle;

  float pooling = level ? step(0.0, normal.y) : exp(-fromLow.y / 0.3);
  float settled = max(pooling, 0.5 * (1.0 - smoothstep(0.2, 0.45, cavity)));
  albedo = mix(albedo, uGrime, 0.7 * settled * smoothstep(0.3, 0.7, fbm(q * 4.0 + 5.0)));
  float salt = smoothstep(0.6, 0.85, fbm(q * 3.2 + 23.0))
    * (0.4 * drip + 0.6 * exp(-fromLow.y / 0.5)) * upright;
  albedo = mix(albedo, uSalt, 0.7 * salt);

  vec3 climbed = vWorld + vec3(0.0, uClimb, 0.0);
  vec2 wall = vec2(dot(climbed, frame[0]), dot(climbed, frame[1])) + dot(climbed, normal) * vec2(1.37, 0.71);
  vec2 wallWarp = vec2(fbm(wall * 0.3 + 71.0), fbm(wall * 0.3 + 79.0)) - 0.5;
  vec3 cover = STAIN_COVER * mix(0.6, 1.4, weathering);
  vec3 sizes = STAIN_SIZES;
  vec3 salts = STAIN_SALTS;
  for (int layer = 0; layer < 3; layer++) {
    albedo = stain(albedo, wall, wallWarp, sizes.x, salts.x, cover.x, upright, footprint);
    sizes = sizes.yzx;
    salts = salts.yzx;
    cover = cover.yzx;
  }
  albedo *= 1.0 - 0.3 * upright * streaks(wall, footprint);
  if (vProtrudes > 0.5) {
    float hooded = upright * (exp(-toHigh.y / 1.2) * mix(0.35, 1.0, valueNoise(vec2(p.x * 8.0, toHigh.y * 1.5)))
      + exp(-toHigh.y / 0.12)) + (level ? smoothstep(0.3, 0.7, fbm(q * 5.0 + 41.0)) : 0.0);
    float joint = (1.0 - smoothstep(0.0, 0.05, vLocal.z)) * (1.0 - abs(normal.z));
    albedo = mix(albedo, uGrime, mix(0.5, 1.2, hash12(seed + 5.0)) * min(0.6 * hooded + 0.6 * joint, 0.85));
  } else if (normal.z > 0.5 && all(lessThan(abs(vec2(vMin.x, vMax.x) - PIER_SPAN), vec2(0.01)))) {
    float above = vLocal.y - BLOCK_RISE.y;
    float below = mod(BLOCK_RISE.x - vLocal.y, uTileHeight);
    float owner = step(BLOCK_RISE.y, vLocal.y);
    float runs = valueNoise(vec2(vLocal.x * 9.0, 3.0));
    float wash = (plantFloor(roomOf(vTile, 2.0 * owner)) ? 0.0 : 1.0)
      * exp(-below / mix(0.3, 1.6, runs)) * mix(0.4, 1.0, valueNoise(vec2(vLocal.x * 30.0, below * 2.0)))
      + (plantFloor(roomOf(vTile, 0.0)) ? 0.0 : 0.6) * step(0.0, above) * exp(-above / 0.15);
    albedo = mix(albedo, uGrime, min(0.5 * wash, 0.7));
  }
  if (footprint < 0.02) {
    float pale;
    float flecked = speck(wall, footprint, pale);
    albedo = mix(albedo, pale > 0.5 ? uSalt : uGrime, 0.6 * flecked);
  }

  float cracked = 1.0 - smoothstep(0.025, 0.05, footprint);
  if (cracked > 0.0) {
    Fracture fracture = fractures(p, fromLow, extent, upright, footprint);
    vec3 residue = fracture.residue < 0.5 ? uGrime : fracture.residue < 0.85 ? uSalt : uRust * 0.8;
    albedo = mix(albedo, residue, 0.5 * fracture.leach * cracked);
    albedo *= (1.0 - 0.25 * fracture.halo * cracked) * (1.0 + 0.18 * fracture.lip * cracked);
    albedo = mix(albedo, uSalt * 1.05, 0.55 * fracture.healed * cracked);
    albedo *= 1.0 - mix(0.45, 0.9, fracture.deep) * fracture.open * cracked;
    height -= (1.6 * fracture.open + 0.3 * fracture.halo - 0.3 * fracture.healed) * cracked;
  }
  float crazeZone = smoothstep(0.55, 0.8, valueNoise(p * 0.5 + 21.0)) * resolved(30.0, footprint);
  if (crazeZone > 0.0) {
    float craze = crazing(p, footprint) * crazeZone;
    albedo *= 1.0 - 0.3 * craze;
    height -= 0.4 * craze;
  }

  for (int layer = 0; layer < 2; layer++) {
    float spacing = SPALL_SPACINGS[layer];
    vec2 cell = floor(p / spacing);
    Spall spot;
    if (!spallIn(cell, layer, spot)) continue;
    vec2 local = inSpall(p, spot);
    local += 0.35 * (vec2(valueNoise(local * 1.3 + spot.key), valueNoise(local * 1.3 + spot.key + 7.0)) - 0.5);
    float reach = length(local);
    vec2 heading = local / max(reach, 1e-3);
    float lobed = 1.0 + 0.7 * (valueNoise(heading * 1.5 + spot.key + 3.0) - 0.5)
      + 0.3 * (valueNoise(heading * 4.0 + spot.key + 11.0) - 0.5);
    float rough = min(0.15 * spot.axes.y, 0.02);
    float outline = (reach - lobed) * spot.axes.y + rough * (valueNoise(p * 13.0 + spot.key) - 0.5
      + 0.6 * (valueNoise(p * 40.0 + spot.key) - 0.5) * resolved(40.0, footprint));
    float inside = 1.0 - smoothstep(-footprint, footprint + 0.002, outline);
    float rim = exp(-abs(outline) / max(0.008, footprint)) * inside;
    float terrace = outline + spot.axes.y * mix(0.2, 0.45, valueNoise(p * 4.0 + spot.key + 5.0));
    float lower = 1.0 - smoothstep(-footprint, footprint + 0.003, terrace);
    if (spot.kind == PATCHED) {
      float mended = 1.0 - smoothstep(-footprint, footprint + 0.012, outline);
      vec3 mortar = mix(body, uSalt, mix(0.25, 0.55, hash12(vec2(spot.key, 3.0)))) * mix(0.92, 1.04, mottle);
      albedo = mix(albedo, mortar, 0.8 * mended);
      albedo *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.002 + footprint, abs(outline + 0.006)));
      height += 0.3 * mended;
    } else if (spot.kind == SCALED) {
      albedo = mix(albedo, body * mix(0.72, 0.95, grain) * mix(1.0, 0.85, lower), inside);
      albedo *= 1.0 + 0.25 * rim;
      height -= inside * (0.8 + 0.7 * lower);
    } else {
      float pebble = mix(0.4, smoothstep(0.5, 0.62, valueNoise(p * 32.0 + spot.key)), resolved(32.0, footprint));
      vec3 stone = mix(uConcrete * 0.75, uConcreteWarm * 0.85, valueNoise(p * 16.0 + spot.key + 9.0));
      vec3 hollow = mix(body * mix(0.3, 0.5, grain), stone, pebble);
      vec3 fractured = mix(body * mix(0.62, 0.88, grain), hollow, lower) * mix(0.75, 1.0, weathering);
      albedo = mix(albedo, fractured, inside) * (1.0 + 0.35 * rim);
      height -= inside * (1.6 + lower * (1.6 - 0.7 * pebble));
      if (spot.kind == EXPOSED) {
        vec2 across = toBars(vec3(fromLow, 0.0), vec3(extent, 0.0)).xy / REBAR_RADIUS;
        float edge = footprint / REBAR_RADIUS;
        float alongU = (1.0 - smoothstep(1.0 - edge, 1.0 + edge, across.y))
          * smoothstep(0.25, 0.4, valueNoise(vec2(p.x * 5.0, spot.key)));
        float alongV = crossBars(spot) ? (1.0 - smoothstep(1.0 - edge, 1.0 + edge, across.x))
          * smoothstep(0.25, 0.4, valueNoise(vec2(p.y * 5.0, spot.key + 17.0))) : 0.0;
        float worn = mix(0.3, 1.0, smoothstep(0.25, 0.6, valueNoise(p * 25.0 + spot.key)));
        vec2 ribbed = resolved(1.0 / RIB_PITCH, footprint) * worn * vec2(rebarRibs(p.x, across.y), rebarRibs(p.y, across.x));
        vec2 raised = vec2(alongU, alongV) * (sqrt(max(1.0 - across.yx * across.yx, 0.0)) + 0.25 * ribbed);
        float top = max(raised.x, raised.y);
        float bar = max(alongU, alongV) * lower;
        float beside = max(min(across.x, across.y) - 1.0, 0.0);
        float bleed = exp(-beside * REBAR_RADIUS / 0.015) * lower;
        albedo = mix(albedo, uRust * 0.4, 0.45 * bleed * (1.0 - bar));
        albedo *= 1.0 - 0.45 * exp(-beside / 0.5) * lower * (1.0 - bar);
        vec3 scale = uRust * mix(0.3, 0.85, valueNoise(p * 60.0 + spot.key)) * mix(0.55, 1.1, top);
        albedo = mix(albedo, scale * (1.0 + 0.15 * max(ribbed.x * alongU, ribbed.y * alongV)), bar);
        height += bar * (0.6 + REBAR_RADIUS / BUMP * top);
        if (upright > 0.5) {
          vec2 span = vec2(length(spot.axes * spot.along), length(spot.axes * spot.along.yx));
          float drop = spot.center.y - 0.5 * span.y - p.y;
          float streak = smoothstep(0.45, 0.75, valueNoise(vec2(p.x * 16.0, spot.key)))
            * mix(0.6, 1.0, valueNoise(vec2(p.x * 40.0, p.y * 2.0 + spot.key)));
          float run = step(0.0, drop) * exp(-drop / mix(0.3, 1.2, hash12(vec2(spot.key, 7.0)))) * streak
            * (1.0 - inside) * (1.0 - smoothstep(0.5, 0.9, abs(p.x - spot.center.x) / span.x))
            * smoothstep(0.0, 0.25 * spacing, p.y - cell.y * spacing);
          albedo = mix(albedo, uRust * 0.8, 0.55 * run);
        }
      }
    }
  }

  vec2 pitCell = floor(p / PIT_SPACING);
  vec2 pitCenter = (pitCell + 0.25 + 0.5 * vec2(hash12(pitCell + 61.0), hash12(pitCell + 67.0))) * PIT_SPACING;
  float pit = 0.0;
  if (footprint < 0.6 / 40.0) {
    float pitDensity = 0.3 * smoothstep(0.4, 0.8, valueNoise(p * 1.5 + 71.0));
    float pitRadius = mix(0.006, 0.02, hash12(pitCell + 73.0)) * step(1.0 - pitDensity, hash12(pitCell + 79.0));
    pit = (1.0 - smoothstep(pitRadius * 0.5, pitRadius + footprint, length(p - pitCenter)))
      * resolved(40.0, footprint);
  }
  albedo *= 1.0 - 0.55 * pit;
  height -= 0.8 * pit;

  vec2 hole = (floor(face / PANEL + 0.25) + 0.25) * PANEL;
  float tieHole = 1.0 - smoothstep(TIE_HOLE * 0.6, TIE_HOLE, length(face - hole));
  float plugged = step(0.55, hash12(hole + seed));
  float plug = (1.0 - smoothstep(TIE_HOLE * 1.4, TIE_HOLE * 1.7, length(face - hole))) * plugged;
  vec2 above = vec2(hole.x, (floor(face.y / PANEL.y - 0.25) + 1.25) * PANEL.y);
  float holes = resolved(30.0, footprint);
  if (upright * holes > 0.0 && hash12(above + seed + 1.0) >= 0.6) {
    float drop = above.y - face.y;
    float leakWidth = 0.01 + drop * 0.02;
    float wobble = (valueNoise(vec2(face.y * 20.0, above.x * 3.0)) - 0.5) * 0.012;
    float leak = (1.0 - smoothstep(leakWidth * 0.5, leakWidth, abs(face.x - above.x + wobble)))
      * exp(-drop / mix(0.1, 0.55, hash12(above + seed + 3.0)));
    albedo *= 1.0 - 0.35 * leak * holes;
  }
  albedo = mix(albedo, body * 1.1, 0.5 * plug * holes);
  albedo *= 1.0 - 0.6 * tieHole * (1.0 - plugged) * holes;
  height -= tieHole;

  float joint = 0.0;
  float bevel = 0.0;
  if (fromJoint < 0.08 + footprint) {
    float jointWidth = mix(0.006, 0.02, valueNoise(face * 2.5 + seed + 29.0));
    float rough = footprint < 0.01 ? (valueNoise(face * 60.0 + seed) - 0.5) * 0.008 * resolved(60.0, footprint) : 0.0;
    joint = 1.0 - smoothstep(jointWidth - footprint, jointWidth + footprint, fromJoint + rough);
    float wear = mix(0.015, 0.05, hash12(block + seed + 2.0));
    bevel = (1.0 - smoothstep(jointWidth, jointWidth + wear, fromJoint + rough)) * (1.0 - joint);
    vec3 mortar = mix(uGrime, uConcrete * 0.6, valueNoise(face * 30.0 + 7.0));
    albedo = mix(albedo, mortar, 0.8 * joint);
  }
  float lift = line(vLocal.y, uTileHeight, 0.012) * upright;
  albedo *= 1.0 - 0.15 * bevel - 0.35 * lift;
  height -= 1.4 * joint + 0.6 * bevel + lift;

  float chip = 0.0;
  if (edge < 0.15) {
    float along = face.x + face.y;
    float chipSize = 0.14 * smoothstep(0.4, 0.85, valueNoise(vec2(along * 5.0, seed.x + 2.0)));
    float ragged = valueNoise(p * 35.0) * 0.03;
    chip = 1.0 - smoothstep(chipSize * 0.6, chipSize + 1e-3, edge + ragged);
  }
  if (chip > 0.0) albedo = mix(albedo, body * mix(0.45, 0.95, valueNoise(p * 70.0)), 0.85 * chip);
  float arris = (1.0 - smoothstep(0.0, 0.025 + footprint, edge)) * (1.0 - chip);
  albedo *= 1.0 + 0.15 * arris;
  height -= 1.5 * chip;

  if (footprint < 0.01) {
    vec2 scuffCell = floor(p * 0.9);
    float angle = hash12(scuffCell + 5.0) * 3.14159;
    vec2 scratch = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
    float scuff = smoothstep(0.7, 0.9, valueNoise(p * 1.3 + 17.0))
      * smoothstep(0.55, 0.9, valueNoise(scratch * vec2(2.0, 60.0))) * resolved(60.0, footprint);
    albedo *= 1.0 + (hash12(scuffCell + 8.0) > 0.3 ? 0.2 : -0.25) * scuff;
  }

  return Concrete(albedo, height, detail, vec3(0.0));
}

float groove(float toEdge, float blur, float width) {
  return 1.0 - smoothstep(width - blur, width + blur, toEdge);
}

float beamHit(vec3 pane, vec3 ray, vec3 window, vec2 room, float ceilingY, float limit,
    inout vec3 normal, out float crease) {
  crease = 1.0;
  int style = int(hash12(room + 37.0) * 5.0);
  vec3 beam = BEAMS[style];
  vec2 axes = BEAM_AXES[style];
  float period = beam.x * mix(1.0, 1.4, hash12(room + 39.0));
  float halfWidth = 0.5 * beam.y;
  float enter = (ceilingY - beam.z - pane.y) / ray.y;
  if (ray.y <= 0.0 || enter >= limit) return limit;

  vec3 entry = pane + ray * enter;
  vec2 position = vec2(entry.x - window.x, entry.z - GLASS_Z);
  vec2 cell = floor(position / period);
  vec2 fromCenter = abs(position - floor(position / period + 0.5) * period);
  if (max(axes.x * step(fromCenter.x, halfWidth), axes.y * step(fromCenter.y, halfWidth)) > 0.5) {
    normal = vec3(0.0, -1.0, 0.0);
    return enter;
  }

  vec2 heading = ray.xz;
  vec2 side = mix(cell * period + halfWidth, (cell + 1.0) * period - halfWidth, step(0.0, heading));
  vec2 toSide = mix(vec2(1e6), (side - position) / heading, axes);
  float toCeiling = beam.z / ray.y;
  float travel = min(min(toSide.x, toSide.y), toCeiling);
  vec3 landed = entry + ray * travel;
  vec2 around = vec2(landed.x - window.x, landed.z - GLASS_Z);
  vec2 clearance = mix(vec2(1e6), abs(around - floor(around / period + 0.5) * period) - halfWidth, axes);
  if (travel == toCeiling) {
    crease = mix(0.45, 1.0, smoothstep(0.0, 0.5, min(clearance.x, clearance.y)));
    return enter + travel >= limit - 1e-3 ? limit : enter + travel;
  }
  if (enter + travel >= limit) return limit;
  normal = travel == toSide.x ? vec3(-sign(ray.x), 0.0, 0.0) : vec3(0.0, 0.0, -sign(ray.z));
  crease = mix(0.5, 1.0, smoothstep(0.0, beam.z, ceilingY - landed.y));
  return enter + travel;
}

vec3 lampIn(vec3 window, vec2 room) {
  return vec3(
    window.x + mix(-1.4, 1.4, hash12(room + 3.0)),
    window.y - WINDOW.y + 0.25 + mix(1.3, 0.6, step(0.88, hash12(room + 19.0))),
    GLASS_Z - mix(1.0, 3.2, lampDepth(room)));
}

vec3 interior(vec3 pane, vec3 ray, vec3 window, vec3 light, vec2 room) {
  float floorY = window.y - WINDOW.y + 0.25;
  vec3 low = vec3(window.x - ROOM.x, floorY, GLASS_Z - ROOM.z);
  vec3 high = vec3(window.x + ROOM.x, floorY + ROOM.y, GLASS_Z);
  vec3 bound = mix(low, high, step(0.0, ray));
  vec3 travel = (bound - pane) / ray;
  float nearest = min(min(travel.x, travel.y), travel.z);
  vec3 hit = pane + ray * nearest;
  vec3 wall = nearest == travel.x ? vec3(-sign(ray.x), 0.0, 0.0)
    : nearest == travel.y ? vec3(0.0, -sign(ray.y), 0.0) : vec3(0.0, 0.0, 1.0);
  float crease;
  float overhead = step(wall.y, -0.5);
  float beam = beamHit(pane, ray, window, room, high.y, nearest, wall, crease);
  if (beam < nearest) {
    overhead = 1.0;
    nearest = beam;
    hit = pane + ray * nearest;
  }

  float finish = hash12(room + 13.0);
  vec3 paint = finish < 0.4 ? uConcrete : finish < 0.75 ? uSalt : mix(uSalt, uLampSoft, 0.45);
  vec3 albedo = paint * mix(0.6, 0.95, hash12(room + 11.0));
  float lowerBand = step(0.7, hash12(room + 43.0)) * step(hit.y - floorY, mix(0.8, 1.1, hash12(room + 47.0)));
  albedo *= 1.0 - 0.4 * lowerBand;
  vec3 fromLow = hit - low;
  vec3 toHigh = high - hit;
  vec3 corner = min(fromLow, toHigh) + abs(wall) * 10.0;
  float occlusion = mix(0.35, 1.0, smoothstep(0.0, 0.8, min(min(corner.x, corner.y), corner.z)));

  vec2 plan = vec2(hit.x - window.x, hit.z - GLASS_Z);
  vec2 face = abs(wall.y) > 0.5 ? plan : abs(wall.x) > 0.5 ? hit.zy : hit.xy;
  vec4 grain = texture(uSurface, face / uSurfaceMeters + room * 0.37);
  float mottle = fbm(face * 1.7 + room * 3.1);
  float stain = smoothstep(0.55, 0.85, fbm(face * 0.6 + room * 5.0 + 9.0));
  float plaster = mix(0.75, 1.12, grain.z) * mix(0.7, 1.0, smoothstep(0.1, 0.5, grain.w))
    * mix(0.82, 1.08, mottle) * (1.0 - 0.3 * stain);

  if (overhead > 0.5) {
    albedo = uSalt * mix(0.75, 1.0, hash12(room + 59.0)) * plaster * crease;
  } else if (wall.y > 0.5) {
    albedo = mix(uGrime, finish < 0.4 ? uConcrete : uLampSoft, mix(0.25, 0.5, hash12(room + 61.0)));
  } else {
    albedo *= plaster;
  }

  float deskZ = GLASS_Z - mix(0.9, 2.6, hash12(room + 15.0));
  float deskLeft = window.x + mix(-1.9, 0.1, hash12(room + 17.0));
  float deskTop = floorY + mix(0.75, 1.8, hash12(room + 21.0));
  float toDesk = (deskZ - pane.z) / ray.z;
  vec3 deskHit = pane + ray * toDesk;
  float desk = step(toDesk, nearest) * step(deskLeft, deskHit.x)
    * step(deskHit.x, deskLeft + mix(0.8, 1.8, hash12(room + 25.0))) * step(deskHit.y, deskTop);
  if (desk > 0.5) {
    hit = deskHit;
    wall = vec3(0.0, 0.0, 1.0);
    albedo = uGrime * (1.0 + 2.0 * (1.0 - smoothstep(0.0, 0.03, deskTop - hit.y)));
    occlusion = mix(0.5, 1.0, smoothstep(0.0, 0.6, hit.y - floorY));
  }

  vec3 toLamp = lampIn(window, room) - hit;
  float reach = length(toLamp);
  float spread = mix(0.25, 0.9, hash12(room + 9.0));
  float illumination = (0.2 + 0.8 * max(dot(wall, toLamp / reach), 0.0)) / (0.6 + spread * reach * reach);
  float recess = mix(1.0, 0.35, smoothstep(0.0, ROOM.z, GLASS_Z - hit.z));

  return albedo * occlusion * recess * (uHaze * 0.2 + light * illumination * ROOM_LIGHT);
}

vec3 bumped(vec3 normal, float height) {
  vec3 dpdx = dFdx(vWorld);
  vec3 dpdy = dFdy(vWorld);
  vec3 r1 = cross(dpdy, normal);
  vec3 r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  vec3 gradient = sign(det) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(abs(det) * normal - gradient);
}

const int SHEETS = 7;

Concrete ventGrille(Concrete surface, vec2 at, vec2 seed) {
  vec2 outside = abs(at) - VENT;
  float rim = max(outside.x, outside.y);
  float frame = 1.0 - smoothstep(0.03, 0.034, rim);
  float opening = 1.0 - smoothstep(-0.004, 0.0, rim);
  float slot = opening * smoothstep(0.22, 0.32, abs(fract(at.y / 0.05) - 0.5));
  float bolts = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 corner = vec2(i % 2 == 0 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0) * (VENT + 0.017);
    bolts = max(bolts, 1.0 - smoothstep(0.006, 0.009, length(at - corner)));
  }
  float rust = smoothstep(0.35, 0.8, valueNoise(at * 30.0 + seed));
  vec3 steel = mix(uGrime * 1.4, uRust, 0.35 + 0.55 * rust);
  surface.albedo = mix(surface.albedo, steel, frame);
  surface.albedo *= 1.0 - 0.92 * slot;
  surface.height += 1.2 * frame + 1.5 * bolts - 3.5 * slot;

  float below = -at.y - VENT.y - 0.03;
  float runs = step(0.0, below) * exp(-below / 0.3) * step(abs(at.x), VENT.x)
    * smoothstep(0.45, 0.8, valueNoise(vec2(at.x * 22.0, seed.x)));
  surface.albedo = mix(surface.albedo, uRust * 0.6, 0.6 * runs);
  float soot = exp(-max(rim, 0.0) / 0.07) * (1.0 - frame) * smoothstep(-0.2, 0.15, at.y);
  surface.albedo *= 1.0 - 0.4 * soot;
  return surface;
}

Concrete airConditioner(Concrete surface, vec3 normal) {
  vec3 inUnit = vUnit - 0.5 * (vMin + vMax);
  vec3 halfSize = 0.5 * (vMax - vMin);
  float storey = floor(vMin.y / (0.5 * uTileHeight));
  float seed = hash12(vec2(vTile.x, mod(vTile.y + uTilesClimbed, 4096.0)) + storey * 3.7);
  surface.detail = vec3(0.0, 0.0, 1.0);
  surface.height = 0.0;
  if (abs(vKind - 4.0) < 0.5) {
    float hub = 1.0 - smoothstep(0.045, 0.05, length(inUnit.xy));
    surface.albedo = mix(uAppliance * mix(0.35, 0.55, seed), uGrime * 2.0, 0.3) * (1.0 + 0.6 * hub);
    return surface;
  }
  if (vKind < 2.5 && halfSize.x < 0.1) {
    surface.albedo = uGrime * mix(1.2, 2.0, valueNoise(inUnit.zy * 40.0));
    return surface;
  }
  vec3 facing = abs(normal);
  vec2 onFace = facing.z > 0.5 ? inUnit.xy : facing.x > 0.5 ? inUnit.zy : inUnit.xz;
  vec2 faceHalf = facing.z > 0.5 ? halfSize.xy : facing.x > 0.5 ? halfSize.zy : halfSize.xz;
  float rise = vUnit.y - storey * 0.5 * uTileHeight - 1.15;

  vec3 paint = mix(uAppliance, uNewsprintAged * 0.85, 0.35 * seed) * mix(0.6, 0.9, valueNoise(onFace * 6.0 + seed * 9.0));
  paint *= mix(0.55, 1.0, smoothstep(0.0, 0.45, rise));
  paint = mix(paint, uGrime * 1.5, step(0.5, normal.y) * 0.6 * smoothstep(0.3, 0.7, valueNoise(onFace * 12.0 + seed)));
  float runs = smoothstep(0.55, 0.85, valueNoise(vec2(vUnit.x * 30.0, rise * 1.5 + seed * 20.0)))
    * smoothstep(0.65, 0.15, rise) * (1.0 - step(0.5, normal.y));
  paint *= 1.0 - 0.35 * runs;
  vec2 fromEdge = faceHalf - abs(onFace);
  float rim = min(fromEdge.x, fromEdge.y);
  float rust = (1.0 - smoothstep(0.0, 0.05, rim)) * smoothstep(0.4, 0.75, valueNoise(onFace * 25.0 + seed * 5.0));
  paint = mix(paint, uRust * 0.75, 0.7 * rust);
  surface.albedo = paint;
  if (vKind > 4.5) {
    if (halfSize.y > 0.1) surface.albedo = mix(uGrime * 0.5, paint, line(inUnit.y + 0.2, 0.04, 0.007) * step(0.5, normal.z));
    return surface;
  }

  float front = step(0.5, normal.z);
  vec2 fanCenter = vec2(halfSize.x - FAN_RADIUS - 0.05, -0.02);
  float radius = length(inUnit.xy - fanCenter);
  float housing = front * (1.0 - smoothstep(FAN_RADIUS - 0.005, FAN_RADIUS, radius));
  float motor = 1.0 - smoothstep(0.065, 0.07, radius);
  paint = mix(paint, mix(uGrime * 0.4, paint * 0.35, motor), housing);

  float intakeRight = fanCenter.x - FAN_RADIUS - 0.05;
  vec2 intakeCenter = vec2(0.5 * (intakeRight - halfSize.x + 0.05), 0.02);
  vec2 intakeHalf = vec2(0.5 * (intakeRight + halfSize.x - 0.05), halfSize.y - 0.09);
  vec2 inIntake = abs(inUnit.xy - intakeCenter) - intakeHalf;
  float intake = front * (1.0 - smoothstep(-0.004, 0.0, max(inIntake.x, inIntake.y)));
  paint = mix(paint, uGrime * 0.5, intake);
  vec2 badge = abs(inUnit.xy - vec2(intakeCenter.x, -halfSize.y + 0.045)) - vec2(0.05, 0.012);
  float label = front * (1.0 - step(0.0, max(badge.x, badge.y)));
  paint = mix(paint, uSalt * 0.9, 0.7 * label);

  float led = front * step(0.55, fract(seed * 31.0)) * (1.0 - smoothstep(0.005, 0.008, length(inUnit.xy - vec2(halfSize.x - 0.035, -halfSize.y + 0.035))));
  surface.emission = uBeaconColor * led * (0.6 + 0.4 * sin(uTime * 1.3 + seed * 6.0));
  surface.albedo = paint;
  return surface;
}

float seam(float distance, float width) {
  return groove(abs(distance), fwidth(distance), width);
}

Concrete laundry(Concrete surface) {
  vec3 halfSize = 0.5 * (vMax - vMin);
  surface.detail = vec3(0.0, 0.0, 1.0);
  surface.height = 0.0;
  if (halfSize.y < 0.02) {
    surface.albedo = uSalt * mix(0.4, 0.6, valueNoise(vLocal.xx * 30.0));
    return surface;
  }
  float seed = hash12(vec2(vTile.x, mod(vTile.y + uTilesClimbed, 4096.0)) + vMin.y * 3.7 + vMin.x * 5.3);
  float u = vCloth.x;
  float au = abs(u);
  float drop = vCloth.y;
  float size = fract(seed * 7.31);
  int garment = int(seed * 6.0);
  if (garment == 0) discard;
  float shape = 1.0;
  float pegs = 0.09;
  float stitches = 0.0;
  float trim = 0.0;
  float worn = 0.0;
  if (garment == 1) {
    float width = mix(0.15, 0.23, size);
    float hem = mix(0.4, 0.6, fract(seed * 11.7));
    shape = max(au - width, drop - hem);
    trim = step(abs(drop - hem + 0.09), 0.025) + step(abs(drop - hem + 0.15), 0.01);
    stitches = seam(drop - 0.03, 0.004) + seam(drop - hem + 0.03, 0.004);
    pegs = width - 0.03;
  } else if (garment == 2) {
    float body = max(au - 0.17, drop - 0.58);
    float sleeve = max(au - min(0.17 + 0.6 * (drop - 0.36), 0.26), max(0.36 - drop, drop - 0.56));
    float neck = length(vec2(u, drop - 0.6)) - 0.065;
    shape = max(min(body, sleeve), -neck);
    stitches = seam(neck - 0.018, 0.004) + seam(au - 0.17, 0.004) * step(0.36, drop) + seam(drop - 0.03, 0.004);
    vec2 print = abs(vec2(u, drop - 0.3)) - vec2(0.07, 0.05);
    trim = step(0.45, fract(seed * 41.0)) * (1.0 - step(0.0, max(print.x, print.y)));
    worn = 1.0 - smoothstep(0.0, 0.02, neck);
    pegs = 0.14;
  } else if (garment == 3) {
    float hem = mix(0.7, 0.85, size);
    shape = max(au - 0.15 + 0.02 * drop / hem, drop - hem);
    float crotch = min(0.012 + 0.03 * (drop - 0.3) - au, drop - 0.3);
    shape = max(shape, crotch);
    vec2 pocket = abs(vec2(au - 0.08, drop - 0.14)) - vec2(0.04, 0.05);
    stitches = seam(drop - 0.05, 0.004) + seam(au - 0.13, 0.003) * step(0.05, drop)
      + seam(max(pocket.x, pocket.y), 0.003) + seam(crotch + 0.012, 0.003) + seam(drop - hem + 0.025, 0.003);
    trim = 1.0 - smoothstep(0.045, 0.05, drop);
    worn = exp(-pow((drop - 0.5) / 0.08, 2.0)) * (1.0 - smoothstep(0.04, 0.1, abs(au - 0.075)));
    pegs = 0.12;
  } else if (garment == 4) {
    vec2 leg = abs(vec2(au - 0.09, drop - 0.11)) - vec2(0.023, 0.118);
    vec2 foot = abs(vec2(au - 0.13, drop - 0.22)) - vec2(0.038, 0.023);
    shape = min(length(max(leg, 0.0)) + min(max(leg.x, leg.y), 0.0),
      length(max(foot, 0.0)) + min(max(foot.x, foot.y), 0.0)) - 0.012;
    trim = 1.0 - smoothstep(0.045, 0.055, drop) + smoothstep(0.16, 0.172, au)
      + smoothstep(0.222, 0.234, drop) * (1.0 - smoothstep(0.098, 0.11, au));
    stitches = seam(drop - 0.055, 0.003);
  } else if (garment == 5) {
    float width = mix(0.22, 0.26, size);
    float hem = mix(0.75, 0.92, fract(seed * 13.3));
    shape = max(au - width, drop - hem);
    trim = 1.0 - step(0.06, drop);
    stitches = 0.6 * (seam(u, 0.003) + seam(drop - hem * 0.5, 0.003)) + seam(drop - hem + 0.02, 0.003);
    pegs = width - 0.03;
  }
  shape += smoothstep(0.0, 0.25, drop) * (garment == 4 ? 0.25 : 1.0) * (0.007 * vFold + 0.014 * (valueNoise(vec2(u * 9.0, drop * 6.0 + seed * 20.0)) - 0.5));
  float droop = 0.025 * max(1.0 - pow(au / pegs, 2.0), 0.0) + 0.3 * max(au - pegs - 0.02, 0.0);
  if (garment != 4) shape = max(shape, droop - drop);
  float peg = max(abs(au - pegs) - 0.008, drop + 0.01 - 0.05);
  if (min(shape, peg) > 0.0) discard;

  float tone = fract(seed * 23.0);
  vec3 cloth = tone < 0.3 ? uLinen : tone < 0.5 ? uDenim : tone < 0.65 ? uMadder
    : tone < 0.82 ? mix(uLinen, uDenim, 0.5) : mix(uLinen, uMadder, 0.45);
  if (garment == 3) cloth = mix(uDenim, uGrime * 3.0, step(0.7, tone));
  if (garment == 5) cloth = mix(uLinen, cloth, 0.2);
  if (garment == 4) cloth *= mix(0.6, 1.0, 1.0 - pow(clamp((au - 0.09) / 0.036, -1.0, 1.0), 2.0) * step(drop, 0.2));
  vec3 accent = tone < 0.5 ? uMadder : uLinen;
  cloth = mix(cloth, garment == 3 || garment == 5 ? cloth * 0.75 : accent, 0.6 * min(trim, 1.0));
  cloth = mix(cloth, uLinen, 0.25 * worn);
  cloth *= 1.0 - 0.3 * min(stitches, 1.0);
  cloth *= 1.0 - 0.25 * (1.0 - smoothstep(0.004, 0.016, -shape));
  cloth *= mix(0.75, 1.05, valueNoise(vec2(u * 12.0, drop * 2.0 + seed * 9.0)));
  cloth *= mix(0.75, 1.0, smoothstep(0.0, 0.1, drop - droop));
  cloth *= mix(0.45, 1.15, smoothstep(-1.7, 1.7, vFold));
  surface.albedo = mix(cloth, mix(uMadder, uDenim, step(0.5, fract(seed * 53.0))) * 1.2, step(peg, 0.0));
  return surface;
}

Concrete rag(Concrete surface) {
  float seed = hash12(vec2(vTile.x, mod(vTile.y + uTilesClimbed, 4096.0)) + vMin.y * 3.7);
  float hem = (vMax.y - vMin.y) * mix(0.55, 1.0, valueNoise(vec2(vCloth.x * 14.0, seed * 50.0)));
  if (vCloth.y > hem || valueNoise(vCloth * 8.0 + seed * 30.0) > 0.86) discard;
  vec3 cloth = seed < 0.4 ? uMadder : seed < 0.7 ? uDenim : uLinen;
  surface.albedo = mix(cloth * 0.75, uGrime, 0.2 + 0.4 * vCloth.y / hem) * mix(0.8, 1.1, valueNoise(vCloth * 40.0))
    * mix(0.65, 1.05, smoothstep(-1.6, 1.6, vFold));
  surface.detail = vec3(0.0, 0.0, 1.0);
  surface.height = 0.0;
  return surface;
}

Concrete sheet(Concrete surface, vec2 tile) {
  vec2 size = vMax.xy - vMin.xy;
  vec2 at = vec2(vCloth.x / size.x + 0.5, 1.0 - vCloth.y / size.y);
  float inward = min(1.6 * min(at.x, 1.0 - at.x), at.y);
  if (fbm(vLocal.xy * 2.5 + vMin.y * 7.0) > 0.5 + 1.1 * inward) discard;
  float creases = valueNoise(vLocal.xy * vec2(9.0, 2.5) + vMin.y);
  vec2 border = min(at, 1.0 - at) * size;
  float taped = step(min(border.x, border.y), 0.04);
  surface.albedo = mix(uSalt * mix(0.5, 0.7, creases), uNewsprintAged * 0.6, 0.8 * taped);
  vec2 room;
  vec3 q = fromWindow(vLocal, tile, 0.0, room);
  surface.emission = windowLight(room, vWorld.x - q.x) * 0.35 * (1.0 - taped) * mix(0.6, 1.0, creases);
  surface.detail = vec3(0.0, 0.0, 1.0);
  surface.height = 0.0;
  return surface;
}

vec3 newsprint(vec2 onSheet, vec2 extent, vec2 seed) {
  float columns = step(0.12, fract(onSheet.x / 0.1 + 0.5));
  float lines = smoothstep(0.2, 0.45, abs(fract(onSheet.y / 0.016) - 0.5));
  float words = step(0.3, valueNoise(onSheet * vec2(45.0, 60.0) + seed));
  float headline = step(extent.y - 0.14, onSheet.y) * step(onSheet.y, extent.y - 0.05)
    * step(abs(onSheet.x), extent.x * 0.7);
  float ink = max(columns * (1.0 - lines) * words * 0.6, headline * 0.9);

  float foldedY = step(0.3, hash12(seed + 181.0));
  float creaseY = mix(-0.3, 0.3, hash12(seed + 179.0)) * extent.y;
  float upper = step(creaseY, onSheet.y);
  float foldedX = foldedY * step(0.5, hash12(seed + 193.0)) * (hash12(seed + 197.0) < 0.5 ? upper : 1.0 - upper);
  float creaseX = mix(-0.3, 0.3, hash12(seed + 191.0)) * extent.x;
  vec2 facet = vec2(step(creaseX, onSheet.x) * foldedX, upper * foldedY);
  float facetTone = mix(0.7, 1.1, hash12(seed + facet * vec2(3.0, 5.0) + 199.0));
  float crease = max(foldedY * exp(-abs(onSheet.y - creaseY) / 0.004),
    foldedX * exp(-abs(onSheet.x - creaseX) / 0.004));
  float flap = mix(0.04, 0.12, hash12(seed + 203.0));
  float doubled = step(0.5, hash12(seed + 207.0)) * step(extent.y - flap, onSheet.y);

  vec3 tint = mix(uNewsprint, uNewsprintAged, hash12(seed + 211.0));
  float foxing = smoothstep(0.6, 0.85, valueNoise(onSheet * 7.0 + seed));
  float worn = exp(-min(extent.x - abs(onSheet.x), extent.y - abs(onSheet.y)) / 0.03);
  tint = mix(tint, uNewsprintAged * 0.75, 0.5 * foxing + 0.4 * worn);
  return tint * (1.0 - ink) * facetTone * (1.0 - 0.4 * crease) * mix(1.0, 0.5, doubled)
    * mix(0.88, 1.04, valueNoise(onSheet * 20.0 + seed));
}

vec4 newspaper(vec2 pane, vec2 room, float blur) {
  vec3 top = vec3(0.0);
  float layers = 0.0;
  for (int i = 0; i < SHEETS; i++) {
    vec2 seed = room * 13.0 + float(i) * 17.3;
    vec2 extent = vec2(mix(0.16, 0.42, hash12(seed + 1.0)), mix(0.2, 0.5, hash12(seed + 2.0)));
    vec2 center = (vec2(hash12(seed + 3.0), hash12(seed + 4.0)) * 2.0 - 1.0) * (GLASS_HALF - 0.15);
    float angle = (hash12(seed + 5.0) - 0.5) * 0.6;
    vec2 onSheet = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * (pane - center);
    vec2 margin = abs(onSheet) - extent;
    float covered = 1.0 - smoothstep(0.0, blur, max(margin.x, margin.y));
    if (covered > 0.0) {
      top = mix(top, newsprint(onSheet, extent, seed), covered);
      layers += covered;
    }
  }
  return vec4(top, layers);
}

vec3 skyMirror(vec3 mirrored, float occlusion) {
  float moon = max(dot(mirrored, uLight), 0.0);
  vec3 reflection = mix(uSky * 1.5, uHaze * 2.6, smoothstep(-0.3, 0.7, mirrored.y))
    + uRim * MOONLIGHT * (3.0 * pow(moon, 300.0) + 1.2 * pow(moon, 18.0));
  return reflection * mix(0.4, 1.0, occlusion);
}

float swirl(vec2 u) {
  float reach = length(u);
  float twist = sin(3.0 * atan(u.y, u.x) + 1.3 * reach);
  return sin(2.4 * reach + 0.9 * twist) * exp(-0.15 * reach * reach) + 0.3 * sin(1.3 * u.x) * sin(1.1 * u.y);
}

vec4 moulding(vec2 at, int style, bool back, float footprint, vec2 shift) {
  if (style == 1) {
    vec2 u = (back ? 9.9 * vec2(at.y, -at.x) + vec2(0.4, -0.3) : 9.0 * at) + shift;
    float height = swirl(u);
    float clear = resolved(1.5, footprint);
    vec2 slope = 3.2 * (vec2(swirl(u + vec2(0.1, 0.0)), swirl(u + vec2(0.0, 0.1))) - height);
    float focus = 1.0 + clear * (1.1 * exp(-3.0 * (height - 0.5) * (height - 0.5)) - 0.3);
    return vec4(slope * clear, 0.5 * (1.0 - clear), focus);
  }
  float period = style == 0 ? (back ? 0.072 : 0.032) : 0.048;
  float amplitude = style == 0 && back ? 0.4 : 0.65;
  float across = back ? at.y + (style == 0 ? 0.008 * sin(60.0 * at.x) : 0.0) : at.x;
  float clear = resolved(1.0 / period, footprint);
  float phase = 6.2832 * across / period;
  float slope = amplitude * clear * sin(phase);
  float focus = 1.0 + clear * (style == 0 && back ? 0.8 : 2.0) * (pow(0.5 + 0.5 * cos(phase), 4.0) - 0.273);
  return vec4(back ? vec2(0.0, slope) : vec2(slope, 0.0), 0.7 * amplitude * (1.0 - clear), focus);
}

float crack(vec2 at, vec2 key, float footprint) {
  vec2 offset = at - 0.24 * (vec2(hash12(key + 829.0), hash12(key + 831.0)) - 0.5);
  float reach = length(offset);
  float turn = atan(offset.y, offset.x) * 7.0 / 6.2832 + hash12(key + 833.0)
    + 0.6 * (valueNoise(vec2(reach * 25.0, key.x)) - 0.5);
  float spoke = abs(fract(turn) - 0.5) * 6.2832 / 7.0 * reach;
  float extent = mix(0.12, 0.4, hash12(key + floor(turn) + 837.0));
  float shown = step(0.3, hash12(key + floor(turn) + 835.0)) * (1.0 - smoothstep(0.5 * extent, extent, reach));
  float ring = abs(reach - mix(0.024, 0.06, hash12(key + 839.0)));
  float width = 0.0008 + footprint;
  float lines = max(shown * (1.0 - smoothstep(0.0, width, spoke)),
    (1.0 - smoothstep(0.0, width, ring)) * step(0.45, valueNoise(offset * 60.0 + key)));
  return lines * clamp(0.003 / footprint, 0.2, 1.0);
}

vec3 extractFan(vec2 at, vec2 room, vec3 light, vec3 glow) {
  float speed = step(0.3, hash12(room + 841.0)) * mix(4.0, 9.0, hash12(room + 843.0));
  float reach = length(at);
  float turn = atan(at.y, at.x) + uTime * speed + 3.0 * reach;
  float vane = step(fract(turn * 5.0 / 6.2832), 0.45);
  float hub = 1.0 - smoothstep(0.016, 0.019, reach);
  float opening = 1.0 - smoothstep(0.072, 0.075, reach);
  vec3 plastic = uAppliance * mix(0.35, 0.55, hash12(room + 845.0)) * mix(0.75, 1.0, valueNoise(at * 40.0 + room));
  plastic = mix(plastic, uGrime, 0.6 * smoothstep(0.02, 0.09, -at.y) * smoothstep(0.072, 0.09, reach));
  vec3 blades = plastic * 0.5 * (light + 0.3 * glow);
  return mix(plastic * light, mix(glow * 0.5, blades, max(vane, hub)), opening);
}

vec3 glassBlockWall(vec2 pane, vec3 view, vec3 window, vec3 glow, vec2 room, vec3 light, float occlusion, bool seen) {
  vec2 pitch = 2.0 * GLASS_HALF / GLASS_BLOCKS;
  vec2 grid = (pane + GLASS_HALF) / pitch;
  vec2 cell = clamp(floor(grid), vec2(0.0), GLASS_BLOCKS - 1.0);
  vec2 at = (grid - cell - 0.5) * pitch;
  vec2 key = room * 7.0 + cell * vec2(1.31, 2.17);
  float footprint = length(fwidth(pane));
  vec2 inner = 0.5 * (pitch - BLOCK_JOINT);
  vec2 gap = inner - abs(at);
  float edge = min(gap.x, gap.y);
  float block = smoothstep(-footprint, footprint, edge);

  vec3 mortar = mix(uConcrete, uSalt, 0.3 + 0.4 * valueNoise(pane * 35.0 + room))
    * mix(0.3, 0.5, valueNoise(pane * 4.0 + room * 3.0));
  vec3 joint = mortar * (light + 0.03 * glow);

  vec2 fanAt = floor(vec2(hash12(room + 847.0), mix(0.5, 0.95, hash12(room + 849.0))) * GLASS_BLOCKS);
  if (hash12(room + 851.0) < 0.35 && cell == fanAt) return mix(joint, extractFan(at, room, light, glow), block);

  int style = int(hash12(room + 813.0) * 3.0);
  float swapped = step(hash12(key + 815.0), 0.05);
  if (swapped > 0.5) style = (style + 1) % 3;
  vec3 tint = mix(uGlassGreen, uLampCold * 0.65, swapped);
  vec2 flip = sign(vec2(hash12(key + 819.0), hash12(key + 821.0)) - 0.5);

  vec2 shift = 0.5 * (vec2(hash12(key + 857.0), hash12(key + 859.0)) - 0.5);
  vec4 front = moulding(at * flip, style, false, footprint, shift);
  vec2 tilt = 0.03 * (vec2(hash12(key + 823.0), hash12(key + 825.0)) - 0.5);
  float bevel = 1.0 - smoothstep(0.0, BLOCK_BEVEL, edge);
  vec2 outward = gap.x < gap.y ? vec2(sign(at.x), 0.0) : vec2(0.0, sign(at.y));
  vec2 wavy = style == 1 ? 0.3 * front.xy * flip : vec2(0.0);
  vec3 outer = normalize(vec3(tilt + 2.0 * bevel * bevel * outward + wavy, 1.0));
  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(-view, outer), 0.0), 5.0);
  vec3 reflection = skyMirror(reflect(view, outer), occlusion);

  vec3 cavity = refract(refract(view, outer, 1.0 / GLASS_INDEX), normalize(vec3(-front.xy * flip, 1.0)), GLASS_INDEX);
  vec2 far = at + cavity.xy * BLOCK_DEPTH / max(-cavity.z, 0.1);
  vec2 hollow = inner - BLOCK_WALL - abs(far);
  float wall = max(1.0 - smoothstep(-footprint, footprint, min(hollow.x, hollow.y)),
    1.0 - smoothstep(BLOCK_WALL - footprint, BLOCK_WALL + footprint, edge));
  vec4 back = moulding(far * flip, style, true, footprint, shift);
  vec3 emerging = refract(refract(cavity, normalize(vec3(-back.xy * flip, 1.0)), 1.0 / GLASS_INDEX), GLASS_NORMAL, GLASS_INDEX);
  bool trapped = dot(cavity, cavity) < 0.5 || dot(emerging, emerging) < 0.5;

  float spread = front.z + back.z;
  float cracked = hash12(key + 827.0) < 0.06 ? crack(at, key, footprint) : 0.0;
  spread += 0.3 * cracked;
  vec3 point = vec3(window.xy + pane + far - at, GLASS_Z - BLOCK_DEPTH);
  vec3 toLamp = lampIn(window, room) - point;
  float reach = length(toLamp);
  toLamp /= reach;
  float irradiance = (0.3 + max(-toLamp.z, 0.0)) / (0.6 + mix(0.25, 0.9, hash12(room + 9.0)) * reach * reach);
  vec2 miss = emerging.xy / max(-emerging.z, 0.05) - toLamp.xy / max(-toLamp.z, 0.05);
  float width = LAMP_SIZE + spread;
  float image = exp(-dot(miss, miss) / (width * width)) * LAMP_SIZE * LAMP_SIZE / (width * width);

  vec3 diffuse = glow * BLOCK_DIFFUSE * irradiance * mix(0.85, 1.15, hash12(key + 855.0));
  vec3 behind = glow * 0.15;
  if (seen && !trapped) {
    float clarity = 1.0 - smoothstep(0.0, 0.6, spread + length(front.xy) + length(back.xy));
    behind = mix(0.15 * glow, 0.5 * interior(point, emerging, window, glow, room), clarity);
  }
  vec3 scattered = BLOCK_SCATTER * light * mix(1.0, front.w, 0.5);
  vec3 through = scattered + (trapped ? diffuse * 1.5 : diffuse * front.w * back.w + behind + glow * LAMP_IMAGE * image);
  float sunk = clamp(-min(hollow.x, hollow.y) / 0.06, 0.0, 1.0);
  vec3 sides = (diffuse * mix(1.0, front.w, 0.5) + 1.5 * scattered) * mix(mix(1.6, 0.7, sunk), 2.0, bevel) + uHaze * 0.2;
  vec3 transmitted = mix(through * mix(vec3(1.0), tint, 0.45), sides * tint, wall) * mix(1.0, 0.6, swapped);

  float dust = 0.2 + 0.35 * valueNoise(pane * 1.3 + room * 3.1) + 0.5 * exp(-(pane.y + GLASS_HALF.y) / 0.35);
  float bloom = exp(-(inner.y - at.y) / 0.05) * smoothstep(0.45, 0.8, valueNoise(vec2(pane.x * 20.0, cell.y + room.y)));
  float film = dust + 0.9 * bloom * step(0.4, hash12(room + 853.0));
  vec3 face = transmitted * (1.0 - fresnel) * (1.0 - 0.35 * min(film, 1.0))
    + reflection * fresnel * mix(1.0, 0.5, step(1e-3, glow.r + glow.g + glow.b))
    + (uSalt * light * 0.12 + glow * 0.05) * film
    + (diffuse * 2.0 + reflection * 0.3) * cracked;
  return mix(joint, face, block);
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 toCamera = normalize(cameraPosition - vWorld);
  vec2 tile = vec2(vTile.x, mod(vTile.y + uTilesClimbed, 4096.0));
  vec2 seed = vec2(hash12(tile), hash12(tile + 1.7)) * 97.0;
  vec2 building = vec2(vWorld.x, vWorld.y + uClimb);
  float weathering = fbm(building * vec2(0.06, 0.035) + 3.0);

  float openness = texture(uOcclusion, (vLocal + normal * 0.1 - uOcclusionMin) / uOcclusionSize).r;
  float occlusion = smoothstep(0.08, 0.55, openness);
  vec2 fromSides = min(vLocal.xy - vMin.xy, vMax.xy - vLocal.xy);
  float sunk = vProtrudes * step(0.01, min(fromSides.x, fromSides.y)) * max(vMax.z - vLocal.z, 0.0);
  occlusion *= exp(-sunk / 0.3);

  vec3 origin = vWorld - vLocal;
  vec3 hit;
  vec3 hitNormal;
  float margin = 1e3;
  int broken = CONCRETE ? carve(vLocal, normal, vMin, vMax, seed, cameraPosition - origin, hit, hitNormal, margin) : 0;
  mat3 frame = faceFrame(normal);
  Concrete surface = Concrete(uConcrete, 0.0, vec3(0.0, 0.0, 1.0), vec3(0.0));
  if (CONCRETE) surface = concrete(frame, seed, weathering);
  if (FITTINGS && abs(vKind - 3.0) < 0.5) surface = laundry(surface);
  else if (FITTINGS && abs(vKind - 6.0) < 0.5) surface = rag(surface);
  else if (FITTINGS && abs(vKind - 7.0) < 0.5) surface = sheet(surface, tile);
  else if (FITTINGS) surface = airConditioner(surface, unturnUnit(normal, vTurn));
  if (CONCRETE && normal.z > 0.5 && abs(vMax.z - SPANDREL_Z) < 0.01) {
    vec2 bay;
    vec3 q = fromWindow(vLocal, tile, 0.0, bay);
    vec2 at = vec2(q.x - mix(-0.8, 0.8, hash12(bay + 227.0)), vLocal.y - 0.5 * (vMin.y + vMax.y));
    if (hash12(bay + 229.0) > 0.55) surface = ventGrille(surface, at, bay);
  }
  vec3 shading = bumped(normalize(frame * surface.detail), surface.height * BUMP);
  if (broken > 0) {
    float sunk = abs(dot(hit - vLocal, normal)) + (broken == 2 ? 0.08 : 0.0);
    float aggregate = valueNoise(hit * 40.0) * 0.6 + valueNoise(hit * 110.0) * 0.4;
    surface.albedo *= mix(0.75, 1.3, aggregate) * mix(1.0, 0.6, smoothstep(0.0, 0.12, sunk));
    shading = hitNormal;
    occlusion *= mix(1.0, 0.55, smoothstep(0.0, 0.12, sunk));
    float toBar = toRebar(hit, vMin, vMax) / REBAR_RADIUS;
    float bar = broken == 1 ? 1.0 - smoothstep(1.0, 1.5, toBar) : 0.0;
    surface.albedo = mix(surface.albedo, uRust * mix(0.45, 1.0, aggregate) * mix(0.45, 1.1, sqrt(max(1.0 - toBar * toBar, 0.0))), bar);
  }
  surface.albedo *= (1.0 + 0.3 * (1.0 - smoothstep(0.0, 0.015, margin)) * step(0.0, margin)) * exp(-sunk / 0.6);
  vec3 light = nightLight(shading, vWorld, occlusion, 0.0);

  float distance = length(vWorld - cameraPosition);
  float depth = 1.0 - smoothstep(14.0, 40.0, distance);
  if (!GLASS && depth > 0.0) {
    light += windowWash(vLocal, normal, shading, tile, origin.x, (step(abs(vKind - 3.0), 0.5) + step(5.5, vKind)) * 0.35)
      * depth * mix(0.4, 1.0, occlusion);
  }

  vec3 haze = skyColor(gl_FragCoord.xy, uResolution, uVanish, uBacklights, uTime, uSky, uHaze, uRim);
  vec3 color = surface.albedo * light + surface.emission;
  float lit = 0.0;
  if (GLASS) {
    vec2 room;
    vec3 q = fromWindow(vLocal, tile, 0.0, room);
    vec3 glow = windowLight(room, origin.x + vLocal.x - q.x);
    lit = step(1e-3, glow.r + glow.g + glow.b);
    vec3 window = vLocal - q;
    vec2 pane = vLocal.xy - window.xy;

    vec3 view = normalize(vLocal - (cameraPosition - origin));
    bool seen = abs(tile.x) < HIDDEN_BAYS;
    if (glassBlocks(room)) {
      color = glassBlockWall(pane, view, window, glow, room, light, occlusion, seen);
    } else {
      vec3 inside = glow * HIDDEN_ROOM;
      if (seen) inside = interior(vLocal, view, window, glow, room);

      float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(-view, GLASS_NORMAL), 0.0), 5.0);
      vec3 reflection = skyMirror(reflect(view, GLASS_NORMAL), occlusion);

      float edge = min(GLASS_HALF.x - abs(pane.x), GLASS_HALF.y - abs(pane.y));
      float grimy = pow(hash12(room + 141.0), 2.5);
      float film = mix(0.1, 0.55, smoothstep(0.8, -1.0, pane.y)) + 0.25 * exp(-edge / 0.1);
      float runs = smoothstep(0.5, 0.85, valueNoise(vec2(pane.x * 16.0, pane.y * 0.9 + room.y)))
        * smoothstep(1.1, 0.2, pane.y);
      float wipe = abs(length(pane - vec2(mix(-0.5, 0.5, hash12(room + 143.0)), -0.2)) - 0.55);
      float smear = smoothstep(0.4, 0.75, valueNoise(pane * 3.0 + room)) * exp(-wipe / 0.15);
      float specks = step(0.82, valueNoise(pane * 45.0 + room * 7.0));
      float dirt = film * mix(0.8, 1.2, valueNoise(pane * 1.2 + room * 3.1))
        + grimy * (1.4 * film + 0.9 * runs + 0.7 * smear + 0.5 * specks);
      float rim = 1.0 - smoothstep(0.0, 0.012 + 1.5 * fwidth(edge), edge);
      float joint = 1.0 - smoothstep(0.0, 0.004 + fwidth(pane.x), abs(pane.x));

      vec3 transmitted = inside * (1.0 - fresnel) * (1.0 - 0.55 * min(dirt, 1.2)) * (1.0 - 0.5 * joint);
      color = transmitted + reflection * fresnel * mix(1.0, 0.4, lit)
        + (uHaze * 0.12 + glow * 0.22) * dirt
        + (uRim * 0.15 + glow * 0.15) * rim + uRim * 0.1 * joint;

      float blur = fwidth(pane.x);
      if (hash12(room + 149.0) > 0.94) {
        vec4 papers = newspaper(pane, room, blur);
        float layers = papers.a;
        vec3 paper = papers.rgb * (glow * 0.4 * pow(0.45, max(layers - 1.0, 0.0)) + 0.05 * mix(0.4, 1.0, occlusion));
        color = mix(color, paper + reflection * fresnel * 0.3, min(layers, 1.0));
      }
    }
  }

  float silhouette = step(0.0, normal.x * sign(vWorld.x));
  float fromEdge = max(uOuterX - abs(vWorld.x), 0.0);
  float pixel = fwidth(vWorld.x);
  float rim = 0.3 * exp(-fromEdge / max(pixel * 2.5, 0.06)) + 0.7 * exp(-fromEdge / max(pixel * 12.0, 0.45));
  float roughness = mix(0.4, 1.0, smoothstep(0.8, 1.0, dot(shading, normal)));
  color += uRim * RIM_STRENGTH * silhouette * rim * surface.albedo / uConcrete * roughness
    * mix(0.5, 1.0, occlusion);

  float mist = fbm(vec3(vWorld.x * 0.05, building.y * 0.04, uTime * 0.04));
  float fog = 1.0 - exp(-distance * uFogDensity * mix(0.5, 1.7, mist));
  vec3 scatter = vec3(0.0);
  if (depth > 0.0) {
    float jitter = ign(gl_FragCoord.xy + floor(uTime * 24.0) * vec2(5.588, 3.17));
    scatter = windowScatter(cameraPosition - origin, vLocal, tile, origin, jitter) * depth
      * mix(0.6, 1.4, hash12(gl_FragCoord.xy + fract(uTime) * 61.0));
  }

  color = mix(color, haze, fog * mix(1.0, 0.6, lit)) + SCATTER * scatter * (1.0 - 0.5 * fog);
  vec3 climbed = vec3(0.0, uClimb, 0.0);
  float cloud = clouds(cameraPosition + climbed, vWorld + climbed);
  color = mix(color, haze, cloud);
  outColor = vec4(color * uExposure, 1.0);
}
