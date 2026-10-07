precision highp float;
precision highp sampler3D;

#include "chunks/noise.glsl"
#include "chunks/sky.glsl"

uniform vec3 cameraPosition;
uniform float uTime;
uniform float uClimb;
uniform float uTilesClimbed;
uniform float uBay;
uniform float uTileHeight;
uniform vec2 uResolution;
uniform vec2 uVanish;
uniform vec4 uBacklights;
uniform vec3 uSky;
uniform vec3 uHaze;
uniform vec3 uRim;
uniform float uExposure;
uniform float uOuterX;
uniform vec3 uConcrete;
uniform vec3 uGlass;
uniform vec3 uLamp;
uniform vec3 uSalt;
uniform vec3 uGrime;
uniform vec3 uLight;
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

out vec4 outColor;

const vec2 PANEL = vec2(1.2, 0.6);
const float TIE_HOLE = 0.022;
const float BUMP = 0.008;
const float DRIP_SPACING = 0.9;
const float RIM_STRENGTH = 0.9;
const float NIGHT_SKY = 2.3;
const float MOONLIGHT = 0.9;
const vec3 WINDOW = vec3(0.0, 2.175, -3.4);
const float WINDOW_REACH = 4.5;
const vec3 GLOW = vec3(1.2, 1.1, 1.8);
const float PANE = 1.1;
const float WASH = 3.2;
const float SCATTER = 1.6;
const int GLOW_STEPS = 12;

struct Concrete {
  vec3 albedo;
  float height;
  vec3 detail;
};

float resolved(float frequency, float footprint) {
  return 1.0 - smoothstep(0.2, 0.6, footprint * frequency);
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
  float present = step(0.7, hash12(vec2(cell, 3.1)));
  float reach = mix(0.4, 2.2, hash12(vec2(cell, 7.9)));
  float center = (cell + mix(0.2, 0.8, hash12(vec2(cell, 5.3)))) * DRIP_SPACING;
  float meander = (valueNoise(vec2(belowTop * 1.5, cell)) - 0.5) * 0.06;
  float width = mix(0.03, 0.1, hash12(vec2(cell, 9.7)))
    * (1.0 - 0.6 * smoothstep(0.0, reach, belowTop)) + footprint;
  float across = (p.x - center + meander) / width;
  return present * exp(-across * across) * exp(-belowTop / reach)
    * mix(0.5, 1.0, valueNoise(vec2(p.x * 20.0, belowTop * 3.0)));
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
  vec2 panel = floor(face / PANEL);
  float panelTone = mix(0.9, 1.07, hash12(panel + seed));
  float partTone = mix(0.86, 1.08, hash13(vMin * 3.1 + vMax * 1.7 + seed.xyx));

  vec4 coarse = texture(uSurface, p / uSurfaceMeters);
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  vec4 fine = texture(uSurface, turn * (p.yx + 31.0) / (uSurfaceMeters * 0.61));
  vec2 slope = (coarse.xy * 2.0 - 1.0) + 0.6 * (transpose(turn) * (fine.xy * 2.0 - 1.0));
  vec3 detail = normalize(vec3(slope, 1.0));
  float relief = mix(coarse.z, fine.z, 0.4);
  float cavity = coarse.w;

  vec3 albedo = uConcrete * panelTone * partTone * mix(0.7, 1.12, blotch) * mix(0.86, 1.08, mottle);
  albedo *= mix(0.7, 1.08, weathering) * mix(0.84, 1.06, relief);
  albedo *= mix(0.7, 1.0, smoothstep(0.1, 0.5, cavity));
  float height = 0.5 * mottle;

  float drip = upright * drips(p, toHigh.y, footprint);
  albedo *= 1.0 - 0.2 * drip - 0.07 * upright * exp(-toHigh.y / 0.25) * mottle;

  float pooling = level ? step(0.0, normal.y) : exp(-fromLow.y / 0.3);
  float settled = max(pooling, 0.5 * (1.0 - smoothstep(0.2, 0.45, cavity)));
  albedo = mix(albedo, uGrime, 0.7 * settled * smoothstep(0.3, 0.7, fbm(q * 4.0 + 5.0)));
  float salt = smoothstep(0.6, 0.85, fbm(q * 3.2 + 23.0))
    * (0.4 * drip + 0.6 * exp(-fromLow.y / 0.5)) * upright;
  albedo = mix(albedo, uSalt, 0.5 * salt);

  float crackField = fbm(q * 1.4 + warp * 2.0 + 41.0);
  float crackWidth = mix(0.0015, 0.005, valueNoise(q * 3.0 + 9.0));
  float crack = 1.0 - smoothstep(0.0, crackWidth + fwidth(crackField), abs(crackField - 0.5));
  crack *= smoothstep(0.65, 0.85, valueNoise(p * 0.35 + 3.0));
  crack *= smoothstep(0.25, 0.6, valueNoise(q * 5.0 + 2.0)) * resolved(6.0, footprint);
  float hairField = fbm(q * 4.5 + 63.0);
  float hairline = 1.0 - smoothstep(0.0, 0.0015 + fwidth(hairField), abs(hairField - 0.5));
  hairline *= smoothstep(0.6, 0.85, valueNoise(p * 0.6 + 21.0));
  hairline *= smoothstep(0.35, 0.7, valueNoise(q * 8.0)) * resolved(20.0, footprint);
  float crackShade = mix(0.12, 0.35, valueNoise(p * 0.2 + 51.0));
  albedo *= 1.0 - crackShade * crack - 0.1 * hairline;
  albedo = mix(albedo, uSalt, 0.2 * crack * smoothstep(0.55, 0.8, mottle));
  height -= 0.5 * crack + 0.2 * hairline;

  vec2 hole = (floor(face / PANEL + 0.25) + 0.25) * PANEL;
  float tieHole = 1.0 - smoothstep(TIE_HOLE * 0.6, TIE_HOLE, length(face - hole));
  float plugged = step(0.55, hash12(hole + seed));
  float plug = (1.0 - smoothstep(TIE_HOLE * 1.4, TIE_HOLE * 1.7, length(face - hole))) * plugged;
  vec2 above = vec2(hole.x, (floor(face.y / PANEL.y - 0.25) + 1.25) * PANEL.y);
  float drop = above.y - face.y;
  float leakWidth = 0.01 + drop * 0.02;
  float wobble = (valueNoise(vec2(face.y * 20.0, above.x * 3.0)) - 0.5) * 0.012;
  float leak = step(0.6, hash12(above + seed + 1.0))
    * (1.0 - smoothstep(leakWidth * 0.5, leakWidth, abs(face.x - above.x + wobble)))
    * exp(-drop / mix(0.1, 0.55, hash12(above + seed + 3.0)));
  float holes = resolved(30.0, footprint);
  albedo *= 1.0 - 0.35 * leak * upright * holes;
  albedo = mix(albedo, uConcrete * 1.1, 0.5 * plug * holes);
  albedo *= 1.0 - 0.6 * tieHole * (1.0 - plugged) * holes;
  height -= tieHole;

  float joint = max(line(face.x, PANEL.x, 0.005), line(face.y, PANEL.y * 2.0, 0.005))
    * mix(0.3, 1.0, hash12(panel + seed + 2.0));
  float lift = line(vLocal.y, uTileHeight, 0.012) * upright;
  albedo *= 1.0 - 0.3 * joint - 0.35 * lift;
  height -= 0.5 * joint + lift;

  float along = face.x + face.y;
  float chipSize = 0.09 * smoothstep(0.5, 0.9, valueNoise(vec2(along * 5.0, seed.x + 2.0)));
  float ragged = valueNoise(p * 35.0) * 0.03;
  float chip = 1.0 - smoothstep(chipSize * 0.6, chipSize + 1e-3, edge + ragged);
  vec3 aggregate = uConcrete * mix(0.45, 0.95, valueNoise(p * 70.0));
  albedo = mix(albedo, aggregate, 0.85 * chip);
  float arris = (1.0 - smoothstep(0.0, 0.025 + footprint, edge)) * (1.0 - chip);
  albedo *= 1.0 + 0.15 * arris;
  height -= 1.5 * chip;

  vec2 scuffCell = floor(p * 0.9);
  float angle = hash12(scuffCell + 5.0) * 3.14159;
  vec2 scratch = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
  float scuff = smoothstep(0.7, 0.9, valueNoise(p * 1.3 + 17.0))
    * smoothstep(0.55, 0.9, valueNoise(scratch * vec2(2.0, 60.0))) * resolved(60.0, footprint);
  albedo *= 1.0 + (hash12(scuffCell + 8.0) > 0.3 ? 0.2 : -0.25) * scuff;

  return Concrete(albedo, height, detail);
}

float windowLevel(vec2 window) {
  float cluster = valueNoise(window * vec2(0.45, 0.2) + 5.0);
  float chance = mix(0.05, 0.6, smoothstep(0.3, 0.75, cluster));
  return step(hash12(window + 41.0), chance) * mix(0.35, 1.0, hash12(window + 7.0));
}

vec3 fromWindow(vec3 point, vec2 tile, vec3 origin, float below, out float level) {
  float storey = 0.5 * uTileHeight;
  float column = floor((point.x + 0.5 * uBay) / uBay);
  float columnTile = tile.x + column;
  float parity = mod(abs(columnTile), 2.0);
  float shift = parity - mod(abs(tile.x), 2.0);
  float row = floor(point.y / storey - shift) - below;
  vec3 window = WINDOW + vec3(column * uBay, (row + shift) * storey, 0.0);
  level = windowLevel(vec2(columnTile, mod(2.0 * tile.y + row + parity, 8192.0)))
    * step(abs(origin.x + window.x) + 1.05, uOuterX);
  return point - window;
}

float glow(vec3 q) {
  vec3 shape = (q - vec3(0.0, -0.1, 1.8)) / GLOW;
  return exp(-1.5 * dot(shape, shape));
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

void main() {
  vec3 normal = normalize(vNormal);
  vec3 toCamera = normalize(cameraPosition - vWorld);
  vec2 tile = vec2(vTile.x, mod(vTile.y + uTilesClimbed, 4096.0));
  vec2 seed = vec2(hash12(tile), hash12(tile + 1.7)) * 97.0;
  vec2 building = vec2(vWorld.x, vWorld.y + uClimb);
  float weathering = fbm(building * vec2(0.06, 0.035) + 3.0);

  float openness = texture(uOcclusion, (vLocal + normal * 0.1 - uOcclusionMin) / uOcclusionSize).r;
  float occlusion = smoothstep(0.08, 0.55, openness);

  mat3 frame = faceFrame(normal);
  Concrete surface = concrete(frame, seed, weathering);
  vec3 shading = bumped(normalize(frame * surface.detail), surface.height * BUMP);
  float skyLight = mix(0.12, 0.9, shading.y * 0.5 + 0.5);
  float key = max(dot(shading, uLight), 0.0);
  vec3 light = uHaze * NIGHT_SKY * skyLight * occlusion
    + uRim * MOONLIGHT * key * mix(0.3, 1.0, occlusion);

  vec3 origin = vWorld - vLocal;
  float distance = length(vWorld - cameraPosition);
  float depth = 1.0 - smoothstep(14.0, 40.0, distance);
  if (vKind < 0.5) {
    for (int below = 0; below < 2; below++) {
      float level;
      vec3 q = fromWindow(vLocal + normal * 0.02, tile, origin, float(below), level);
      float reach = length(q);
      float facing = max(dot(shading, -q / reach), 0.0);
      float ahead = smoothstep(-0.1, 0.5, q.z / reach);
      float falloff = (1.0 - smoothstep(0.5 * WINDOW_REACH, WINDOW_REACH, reach)) / (0.5 + reach * reach);
      light += uLamp * WASH * depth * level * facing * ahead * falloff * mix(0.4, 1.0, occlusion);
    }
  }

  vec3 haze = skyColor(gl_FragCoord.xy, uResolution, uVanish, uBacklights, uTime, uSky, uHaze, uRim);
  vec3 color = surface.albedo * light;
  float lit = 0.0;
  if (vKind > 1.5) {
    color = uGlass * 2.0 * light;
  } else if (vKind > 0.5) {
    float fresnel = pow(1.0 - max(dot(normal, toCamera), 0.0), 2.0);
    color = mix(uGlass, haze * 0.45, 0.15 + 0.6 * fresnel) * mix(0.5, 1.0, occlusion);
    float level;
    fromWindow(vLocal, tile, origin, 0.0, level);
    lit = step(0.01, level);
    color = mix(color, uLamp * PANE * level * mix(0.75, 1.0, valueNoise(vLocal.xy * 3.0 + tile)), lit);
  }

  float outward = sign(vWorld.x);
  float partOuter = abs(vWorld.x - vLocal.x + (outward > 0.0 ? vMax.x : vMin.x));
  float silhouette = step(uOuterX - 0.01, partOuter) * step(0.0, normal.x * outward);
  float fromEdge = partOuter - abs(vWorld.x);
  float pixel = fwidth(vWorld.x);
  float rim = 0.3 * exp(-fromEdge / max(pixel * 2.5, 0.06)) + 0.7 * exp(-fromEdge / max(pixel * 12.0, 0.45));
  color += uRim * RIM_STRENGTH * silhouette * rim;

  float mist = fbm(vec3(vWorld.x * 0.05, building.y * 0.04, uTime * 0.04));
  float fog = 1.0 - exp(-distance * uFogDensity * mix(0.5, 1.7, mist));
  vec3 eye = cameraPosition - origin;
  vec3 ray = vLocal - eye;
  float near = clamp((eye.z - 1.2) / (eye.z - vLocal.z), 0.0, 1.0);
  float jitter = ign(gl_FragCoord.xy + floor(uTime * 24.0) * vec2(5.588, 3.17));
  float scatter = 0.0;
  for (int i = 0; i < GLOW_STEPS; i++) {
    vec3 point = eye + ray * mix(near, 1.0, (float(i) + jitter) / float(GLOW_STEPS));
    float level;
    vec3 q = fromWindow(point, tile, origin, 0.0, level);
    vec3 drift = point + origin + vec3(0.0, uClimb - uTime * 0.2, 0.0);
    float dust = valueNoise(drift * vec3(2.5, 1.0, 2.5)) * mix(0.6, 1.4, valueNoise(drift * 9.0));
    scatter += level * glow(q) * mix(0.25, 1.6, dust);
  }
  scatter *= (1.0 - near) * length(ray) / float(GLOW_STEPS) * depth;
  scatter *= mix(0.6, 1.4, hash12(gl_FragCoord.xy + fract(uTime) * 61.0));

  color = mix(color, haze, fog * mix(1.0, 0.6, lit)) + uLamp * SCATTER * scatter * (1.0 - 0.5 * fog);
  outColor = vec4(color * uExposure, 1.0);
}
