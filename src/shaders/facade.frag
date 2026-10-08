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
uniform vec3 uLamp;
uniform vec3 uLampSoft;
uniform vec3 uLampCool;
uniform vec3 uLampCold;
uniform vec3 uSalt;
uniform vec3 uGrime;
uniform vec3 uRust;
uniform vec3 uBeaconColor;
uniform vec3 uBeaconSpot;
uniform float uBeacon;
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
const vec2 BLOCK = vec2(2.4, 1.2);
const float TIE_HOLE = 0.022;
const float BUMP = 0.008;
const float GRIT = 26.0;
const float GRIT_DEPTH = 1.6;
const float DRIP_SPACING = 0.9;
const float SPALL_SPACING = 1.4;
const float PIT_SPACING = 0.12;
const float RIM_STRENGTH = 0.9;
const float NIGHT_SKY = 2.3;
const float MOONLIGHT = 0.9;
const vec3 WINDOW = vec3(0.0, 2.175, -3.4);
const float WINDOW_REACH = 4.5;
const vec3 GLOW = vec3(1.2, 1.1, 1.8);
const float PANE = 0.25;
const float GLASS_Z = -3.05;
const vec3 ROOM = vec3(2.0, 3.2, 4.0);
const float ROOM_LIGHT = 10.0;
const vec2 GLASS_HALF = vec2(1.05, 1.025);
const vec3 BEAMS[5] = vec3[5](
  vec3(0.9, 0.14, 0.3), vec3(0.8, 0.2, 0.35), vec3(0.8, 0.2, 0.35), vec3(1.6, 0.28, 0.5), vec3(1.8, 0.4, 0.55));
const vec2 BEAM_AXES[5] = vec2[5](vec2(1.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0), vec2(0.0, 1.0));
const float WASH = 3.2;
const float SCATTER = 1.2;
const int GLOW_STEPS = 12;
const float SWITCH_PERIOD = 30.0;
const float BEACON_LIGHT = 3.0;
const float CLOUD_SPACING = 60.0;
const float CLOUD_THICKNESS = 2.5;
const float CLOUD_DENSITY = 0.35;

struct Concrete {
  vec3 albedo;
  float height;
  vec3 detail;
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
  float present = step(0.5, hash12(vec2(cell, 3.1)));
  float reach = mix(0.4, 2.2, hash12(vec2(cell, 7.9)));
  float center = (cell + mix(0.2, 0.8, hash12(vec2(cell, 5.3)))) * DRIP_SPACING;
  float meander = (valueNoise(vec2(belowTop * 1.5, cell)) - 0.5) * 0.06;
  float width = mix(0.03, 0.1, hash12(vec2(cell, 9.7)))
    * (1.0 - 0.6 * smoothstep(0.0, reach, belowTop)) + footprint;
  float across = (p.x - center + meander) / width;
  return present * exp(-across * across) * exp(-belowTop / reach)
    * mix(0.5, 1.0, valueNoise(vec2(p.x * 20.0, belowTop * 3.0)));
}

float grit(vec2 p, float footprint) {
  vec2 at = p * GRIT;
  float coarse = mix(0.5, valueNoise(at), resolved(GRIT, footprint));
  float fine = mix(0.5, valueNoise(at * 2.3 + 7.0), resolved(GRIT * 2.3, footprint));
  return mix(coarse, fine, 0.35);
}

vec2 spallCenter(vec2 cell) {
  return (cell + 0.3 + 0.4 * vec2(hash12(cell + 31.0), hash12(cell + 37.0))) * SPALL_SPACING;
}

float rusted(vec2 cell) {
  return step(0.62, hash12(cell + 47.0)) * step(0.4, hash12(cell + 53.0));
}

float rustRun(vec2 p, vec2 cell) {
  vec2 center = spallCenter(cell);
  float drop = center.y - p.y;
  float wobble = (valueNoise(vec2(p.y * 5.0, cell.x)) - 0.5) * 0.08;
  float width = 0.015 + 0.03 * max(drop, 0.0);
  return rusted(cell) * step(0.0, drop) * exp(-abs(p.x - center.x + wobble) / width)
    * exp(-drop / mix(0.3, 1.0, hash12(cell + 59.0)));
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
  float blockTone = mix(0.86, 1.08, hash12(block + seed + vMin.xy * 3.1 + vMin.z));
  float partTone = mix(0.86, 1.08, hash13(vMin * 3.1 + vMax * 1.7 + seed.xyx));

  vec4 coarse = texture(uSurface, p / uSurfaceMeters);
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  vec4 fine = texture(uSurface, turn * (p.yx + 31.0) / (uSurfaceMeters * 0.61));
  vec2 slope = (coarse.xy * 2.0 - 1.0) + 0.6 * (transpose(turn) * (fine.xy * 2.0 - 1.0));
  float grain = grit(p, footprint);
  float nudge = 0.25 / GRIT;
  slope += GRIT_DEPTH * (vec2(grit(p + vec2(nudge, 0.0), footprint), grit(p + vec2(0.0, nudge), footprint)) - grain);
  vec3 detail = normalize(vec3(slope, 1.0));
  float relief = mix(coarse.z, fine.z, 0.4);
  float cavity = coarse.w;

  vec3 albedo = uConcrete * blockTone * partTone * mix(0.7, 1.12, blotch) * mix(0.86, 1.08, mottle);
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

  float crackField = fbm(q * 1.4 + warp * 2.0 + 41.0);
  float crackWidth = mix(0.002, 0.007, valueNoise(q * 3.0 + 9.0));
  float crackZone = smoothstep(0.5, 0.75, valueNoise(p * 0.35 + 3.0)) * resolved(6.0, footprint);
  float crack = (1.0 - smoothstep(0.0, crackWidth + fwidth(crackField), abs(crackField - 0.5)))
    * crackZone * smoothstep(0.2, 0.55, valueNoise(q * 5.0 + 2.0));
  float damp = exp(-abs(crackField - 0.5) / 0.025) * crackZone;
  float hairField = fbm(q * 4.5 + 63.0);
  float hairline = 1.0 - smoothstep(0.0, 0.0015 + fwidth(hairField), abs(hairField - 0.5));
  hairline *= smoothstep(0.6, 0.85, valueNoise(p * 0.6 + 21.0));
  hairline *= smoothstep(0.35, 0.7, valueNoise(q * 8.0)) * resolved(20.0, footprint);
  float crackShade = mix(0.35, 0.65, valueNoise(p * 0.2 + 51.0));
  albedo *= (1.0 - crackShade * crack - 0.15 * hairline) * (1.0 - 0.25 * damp);
  albedo = mix(albedo, uSalt, 0.3 * crack * smoothstep(0.55, 0.8, mottle));
  height -= 1.2 * crack + 0.3 * hairline;

  vec2 spallCell = floor(p / SPALL_SPACING);
  vec2 center = spallCenter(spallCell);
  float kind = hash12(spallCell + 47.0);
  float size = mix(0.08, 0.24, hash12(spallCell + 43.0));
  float outline = length((p - center) * vec2(1.0, 1.4)) - size * mix(0.6, 1.3, valueNoise(p * 9.0 + spallCell));
  float spall = (1.0 - smoothstep(-footprint, footprint + 0.003, outline)) * step(0.62, kind);
  float repair = (1.0 - smoothstep(-footprint, footprint + 0.01, outline - 0.08))
    * step(0.45, kind) * (1.0 - step(0.62, kind));
  albedo = mix(albedo, mix(uConcrete, uSalt, 0.6) * mix(0.85, 1.05, mottle), 0.75 * repair);
  height += 0.4 * repair;

  float rubble = valueNoise(p * 45.0);
  albedo = mix(albedo, uConcrete * mix(0.3, 0.75, rubble) * mix(0.7, 1.0, weathering), spall);
  albedo *= 1.0 + 0.35 * exp(-abs(outline) / max(0.012, footprint)) * step(0.62, kind);
  height -= spall * (2.5 + rubble);
  float bar = spall * rusted(spallCell)
    * (1.0 - smoothstep(0.008, 0.012 + footprint, abs(p.y - center.y)));
  albedo = mix(albedo, uRust, 0.85 * bar);
  height += 1.5 * bar;
  float rust = upright * (1.0 - spall)
    * max(rustRun(p, spallCell), rustRun(p, spallCell + vec2(0.0, 1.0)));
  albedo = mix(albedo, uRust * 0.8, 0.5 * rust);

  vec2 pitCell = floor(p / PIT_SPACING);
  vec2 pitCenter = (pitCell + 0.25 + 0.5 * vec2(hash12(pitCell + 61.0), hash12(pitCell + 67.0))) * PIT_SPACING;
  float pitDensity = 0.3 * smoothstep(0.4, 0.8, valueNoise(p * 1.5 + 71.0));
  float pitRadius = mix(0.006, 0.02, hash12(pitCell + 73.0)) * step(1.0 - pitDensity, hash12(pitCell + 79.0));
  float pit = (1.0 - smoothstep(pitRadius * 0.5, pitRadius + footprint, length(p - pitCenter)))
    * resolved(40.0, footprint);
  albedo *= 1.0 - 0.55 * pit;
  height -= 0.8 * pit;

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

  float jointWidth = mix(0.006, 0.02, valueNoise(face * 2.5 + seed + 29.0));
  float rough = (valueNoise(face * 60.0 + seed) - 0.5) * 0.008 * resolved(60.0, footprint);
  float joint = 1.0 - smoothstep(jointWidth - footprint, jointWidth + footprint, fromJoint + rough);
  float wear = mix(0.015, 0.05, hash12(block + seed + 2.0));
  float bevel = (1.0 - smoothstep(jointWidth, jointWidth + wear, fromJoint + rough)) * (1.0 - joint);
  vec3 mortar = mix(uGrime, uConcrete * 0.6, valueNoise(face * 30.0 + 7.0));
  float lift = line(vLocal.y, uTileHeight, 0.012) * upright;
  albedo = mix(albedo, mortar, 0.8 * joint);
  albedo *= 1.0 - 0.15 * bevel - 0.35 * lift;
  height -= 1.4 * joint + 0.6 * bevel + lift;

  float along = face.x + face.y;
  float chipSize = 0.14 * smoothstep(0.4, 0.85, valueNoise(vec2(along * 5.0, seed.x + 2.0)));
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

vec3 windowLight(vec2 room) {
  float cluster = valueNoise(room * vec2(0.9, 0.2) + 5.0);
  float chance = mix(0.1, 0.6, smoothstep(0.3, 0.75, cluster));
  float pick = hash12(room + 19.0);
  vec3 tint = pick < 0.5 ? uLamp : pick < 0.75 ? uLampSoft : pick < 0.88 ? uLampCool : uLampCold;
  float era = floor(uTime / SWITCH_PERIOD + hash12(room + 43.0));
  float on = abs(step(hash12(room + 41.0), chance) - step(0.93, hash12(room + era * 1.37)));
  float faulty = step(0.75, pick) * step(pick, 0.88) * step(0.5, hash12(room + 47.0));
  float bursts = step(0.6, valueNoise(vec2(uTime * 0.7, room.x * 3.1 + room.y)));
  float flicker = step(0.7, valueNoise(vec2(uTime * 14.0, room.x * 13.0 + room.y * 7.0)));
  return tint * on * (1.0 - 0.85 * faulty * bursts * flicker) * mix(0.35, 1.0, hash12(room + 7.0));
}

float clouds(vec3 from, vec3 to) {
  float rise = max(to.y - from.y, 1e-3);
  float depth = 0.0;
  for (int i = 0; i < 4; i++) {
    float center = (floor(from.y / CLOUD_SPACING) + float(i)) * CLOUD_SPACING;
    vec3 crossing = from + (to - from) * clamp((center - from.y) / rise, 0.0, 1.0);
    float puffs = fbm(vec3(crossing.xz * vec2(0.06, 0.1) + vec2(uTime * 0.05, center), uTime * 0.03));
    float across = atan((to.y - center) / CLOUD_THICKNESS) - atan((from.y - center) / CLOUD_THICKNESS);
    depth += smoothstep(0.35, 0.7, puffs) * CLOUD_THICKNESS * across;
  }
  return 1.0 - exp(-CLOUD_DENSITY * depth * length(to - from) / rise);
}

float lampDepth(vec2 room) {
  return hash12(room + 5.0);
}

vec3 fromWindow(vec3 point, vec2 tile, vec3 origin, float below, out vec3 light, out vec2 room) {
  float storey = 0.5 * uTileHeight;
  float column = floor((point.x + 0.5 * uBay) / uBay);
  float columnTile = tile.x + column;
  float parity = mod(abs(columnTile), 2.0);
  float shift = parity - mod(abs(tile.x), 2.0);
  float row = floor(point.y / storey - shift) - below;
  vec3 window = WINDOW + vec3(column * uBay, (row + shift) * storey, 0.0);
  room = vec2(columnTile, mod(2.0 * tile.y + row + parity, 8192.0));
  light = windowLight(room) * step(abs(origin.x + window.x) + 1.05, uOuterX);
  return point - window;
}

float recessGlow(vec3 q) {
  vec3 shape = (q - vec3(0.0, -0.1, 2.3)) / GLOW;
  return exp(-1.5 * dot(shape, shape)) * smoothstep(0.4, 1.4, q.z);
}

float groove(float toEdge, float blur, float width) {
  return 1.0 - smoothstep(width - blur, width + blur, toEdge);
}

float slabs(vec2 point, vec2 room, float salt) {
  float width = mix(0.9, 1.5, hash12(room + salt));
  vec2 size = vec2(width, width * (hash12(room + salt + 1.0) < 0.5 ? 0.5 : 1.0));
  vec2 cells = point / size;
  cells.x += 0.5 * step(0.5, hash12(room + salt + 2.0)) * mod(floor(cells.y), 2.0);
  vec2 index = floor(cells);
  vec2 toEdge = (0.5 - abs(fract(cells) - 0.5)) * size;
  float edge = min(toEdge.x, toEdge.y);
  float blur = max(fwidth(point.x), fwidth(point.y));
  float joint = groove(edge, blur, 0.016);
  float bevel = smoothstep(0.0, 0.1, edge);
  float tone = mix(0.8, 1.1, hash12(index + room * 7.0 + salt))
    * mix(0.9, 1.05, valueNoise(point * 2.5 + index * 13.0));
  return tone * mix(0.7, 1.0, bevel) * (1.0 - 0.7 * joint);
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
  float along = wall.z > 0.5 ? hit.x - window.x : hit.z;
  float wallSlabs = slabs(vec2(along, hit.y - floorY), room, 53.0);
  float floorSlabs = slabs(plan, room, 67.0);
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
    albedo *= floorSlabs;
  } else {
    albedo *= wallSlabs;
  }

  float doorX = mix(-1.4, 0.6, hash12(room + 31.0));
  float door = step(0.5, wall.z) * step(doorX, hit.x - window.x) * step(hit.x - window.x, doorX + 0.9)
    * step(fromLow.y, 2.1);
  albedo *= 1.0 - 0.85 * door;

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

  vec3 lamp = vec3(
    window.x + mix(-1.4, 1.4, hash12(room + 3.0)),
    floorY + 1.3,
    GLASS_Z - mix(1.0, 3.2, lampDepth(room)));
  vec3 toLamp = lamp - hit;
  float reach = length(toLamp);
  float spread = mix(0.08, 0.6, hash12(room + 9.0));
  float illumination = (0.25 + 0.75 * max(dot(wall, toLamp / reach), 0.0)) / (0.8 + spread * reach * reach);
  float recess = mix(1.0, 0.45, smoothstep(0.0, ROOM.z, GLASS_Z - hit.z));

  return albedo * occlusion * recess * (uHaze * 0.35 + light * illumination * ROOM_LIGHT);
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
  float spacing = 4.0 * uTileHeight;
  float beaconY = floor((building.y - uBeaconSpot.y) / spacing + 0.5) * spacing + uBeaconSpot.y - uClimb;
  vec3 toBeacon = vec3(sign(vWorld.x) * uBeaconSpot.x, beaconY, uBeaconSpot.z) - vWorld;
  float beaconReach = length(toBeacon);
  light += uBeaconColor * uBeacon * BEACON_LIGHT * max(dot(shading, toBeacon / beaconReach), 0.0)
    / (1.0 + 3.0 * beaconReach * beaconReach) * mix(0.4, 1.0, occlusion);

  vec3 origin = vWorld - vLocal;
  float distance = length(vWorld - cameraPosition);
  float depth = 1.0 - smoothstep(14.0, 40.0, distance);
  if (vKind < 0.5) {
    for (int below = 0; below < 2; below++) {
      vec3 glow;
      vec2 room;
      vec3 q = fromWindow(vLocal + normal * 0.02, tile, origin, float(below), glow, room);
      float reach = length(q);
      float facing = max(dot(shading, -q / reach), 0.0);
      float ahead = smoothstep(-0.1, 0.5, q.z / reach);
      float falloff = (1.0 - smoothstep(0.5 * WINDOW_REACH, WINDOW_REACH, reach)) / (0.5 + reach * reach);
      light += glow * mix(1.0, 0.35, lampDepth(room)) * WASH * depth * facing * ahead * falloff
        * mix(0.4, 1.0, occlusion);
    }
  }

  vec3 haze = skyColor(gl_FragCoord.xy, uResolution, uVanish, uBacklights, uTime, uSky, uHaze, uRim);
  vec3 color = surface.albedo * light;
  float lit = 0.0;
  if (vKind > 0.5) {
    vec3 glow;
    vec2 room;
    vec3 q = fromWindow(vLocal, tile, origin, 0.0, glow, room);
    lit = step(1e-3, glow.r + glow.g + glow.b);
    vec3 window = vLocal - q;
    vec2 pane = vLocal.xy - window.xy;

    vec2 wave = vLocal.xy * vec2(1.3, 0.35) + room * 3.7;
    vec2 ripple = vec2(valueNoise(wave), valueNoise(wave + 17.0)) - 0.5;
    vec3 glassNormal = normalize(vec3(ripple * 0.05, 1.0));
    vec3 view = normalize(vLocal - (cameraPosition - origin));
    vec3 through = normalize(view + vec3(ripple * 0.06, 0.0));

    vec3 inside = interior(vLocal, through, window, glow, room);
    float sill = window.y - WINDOW.y + 1.15;
    float blind = sill + 2.05 * (1.0 - step(0.8, hash12(room + 23.0)) * mix(0.15, 0.45, hash12(room + 29.0)));
    float slats = 0.75 + 0.25 * smoothstep(0.3, 0.5, abs(fract(vLocal.y / 0.06) - 0.5));
    float behind = exp(-abs(pane.x - mix(-1.4, 1.4, hash12(room + 3.0))) * 0.8);
    inside = mix(glow * PANE * slats * behind, inside, step(vLocal.y, blind));
    float stride = uTime * mix(0.12, 0.25, hash12(room + 67.0)) + 6.28 * hash12(room + 71.0);
    vec2 figure = pane + through.xy * (0.8 / max(-through.z, 0.2)) - vec2(1.8 * sin(stride), 0.0);
    vec2 shoulders = abs(figure - vec2(0.0, -1.3)) - vec2(0.18, 0.56);
    float outline = min(length(figure - vec2(0.0, -0.55)) - 0.11,
      length(max(shoulders, 0.0)) + min(max(shoulders.x, shoulders.y), 0.0) - 0.06);
    float person = (1.0 - smoothstep(0.0, 0.01 + fwidth(outline), outline)) * step(0.75, hash12(room + 61.0));
    inside *= 1.0 - 0.85 * person;

    vec3 mirrored = reflect(view, glassNormal);
    float fresnel = 0.04 + 0.26 * pow(1.0 - max(dot(-view, glassNormal), 0.0), 5.0);
    float moon = max(dot(mirrored, uLight), 0.0);
    float bands = pow(0.5 + 0.5 * sin(dot(pane, vec2(1.6, 1.1)) * 2.4 + room.x * 1.7 + room.y), 5.0);
    vec3 reflection = mix(uSky * 1.5, uHaze * 2.6, smoothstep(-0.3, 0.7, mirrored.y + 0.3 * ripple.y))
      + uRim * (0.3 * bands + MOONLIGHT * (1.6 * pow(moon, 80.0) + 0.25 * pow(moon, 6.0)));
    reflection *= mix(0.4, 1.0, occlusion);

    float smudge = smoothstep(0.5, 0.85, fbm(vLocal.xy * vec2(3.0, 1.1) + room * 5.3));
    float edge = min(GLASS_HALF.x - abs(pane.x), GLASS_HALF.y - abs(pane.y));
    float rim = 1.0 - smoothstep(0.0, 0.012 + 1.5 * fwidth(edge), edge);
    float joint = 1.0 - smoothstep(0.0, 0.004 + fwidth(pane.x), abs(pane.x));

    vec3 transmitted = inside * (1.0 - fresnel) * (1.0 - 0.1 * smudge) * (1.0 - 0.5 * joint);
    color = transmitted + reflection * fresnel * mix(1.0, 0.4, lit)
      + (uHaze * 0.1 + glow * 0.06) * smudge
      + (uRim * 0.5 + glow * 0.6) * rim + uRim * 0.25 * joint;
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
  vec3 eye = cameraPosition - origin;
  vec3 ray = vLocal - eye;
  float near = clamp((eye.z - 1.2) / (eye.z - vLocal.z), 0.0, 1.0);
  float jitter = ign(gl_FragCoord.xy + floor(uTime * 24.0) * vec2(5.588, 3.17));
  vec3 scatter = vec3(0.0);
  for (int i = 0; i < GLOW_STEPS; i++) {
    vec3 point = eye + ray * mix(near, 1.0, (float(i) + jitter) / float(GLOW_STEPS));
    vec3 glow;
    vec2 room;
    vec3 q = fromWindow(point, tile, origin, 0.0, glow, room);
    vec3 drift = point + origin + vec3(0.0, uClimb - uTime * 0.2, 0.0);
    float dust = valueNoise(drift * vec3(2.5, 1.0, 2.5)) * mix(0.6, 1.4, valueNoise(drift * 9.0));
    scatter += glow * mix(1.0, 0.35, lampDepth(room)) * recessGlow(q) * mix(0.25, 1.6, dust);
  }
  scatter *= (1.0 - near) * length(ray) / float(GLOW_STEPS) * depth;
  scatter *= mix(0.6, 1.4, hash12(gl_FragCoord.xy + fract(uTime) * 61.0));

  color = mix(color, haze, fog * mix(1.0, 0.6, lit)) + SCATTER * scatter * (1.0 - 0.5 * fog);
  vec3 climbed = vec3(0.0, uClimb, 0.0);
  float cloud = clouds(cameraPosition + climbed, vWorld + climbed);
  color = mix(color, haze, cloud);
  outColor = vec4(color * uExposure, 1.0);
}
