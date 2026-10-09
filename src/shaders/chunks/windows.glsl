#include "rooms.glsl"

uniform float uTime;
uniform float uBay;
uniform float uOuterX;
uniform vec3 uLamp;
uniform vec3 uLampSoft;
uniform vec3 uLampCool;
uniform vec3 uLampCold;

const vec3 WINDOW = vec3(0.0, 2.175, -3.4);
const float WINDOW_REACH = 4.5;
const float WASH = 3.2;
const float SWITCH_PERIOD = 30.0;
const vec3 GLOW = vec3(1.2, 1.1, 1.8);
const float SCATTER = 1.2;
const int GLOW_STEPS = 8;

vec3 windowLight(vec2 room, float x) {
  if (abs(x) + 1.05 > uOuterX || plantFloor(room)) return vec3(0.0);
  float cluster = valueNoise(room * vec2(0.9, 0.2) + 5.0);
  float chance = mix(0.1, 0.6, smoothstep(0.3, 0.75, cluster));
  float era = floor(uTime / SWITCH_PERIOD + hash12(room + 43.0));
  float on = abs(step(hash12(room + 41.0), chance) - step(0.93, hash12(room + era * 1.37)));
  if (on < 0.5) return vec3(0.0);
  float pick = hash12(room + 19.0);
  vec3 tint = pick < 0.5 ? uLamp : pick < 0.75 ? uLampSoft : pick < 0.88 ? uLampCool : uLampCold;
  float faulty = step(0.75, pick) * step(pick, 0.88) * step(0.5, hash12(room + 47.0));
  float dim = 1.0;
  if (faulty > 0.5) {
    float bursts = step(0.6, valueNoise(vec2(uTime * 0.7, room.x * 3.1 + room.y)));
    float flicker = step(0.7, valueNoise(vec2(uTime * 14.0, room.x * 13.0 + room.y * 7.0)));
    dim = 1.0 - 0.85 * bursts * flicker;
  }
  return tint * dim * mix(0.35, 1.0, hash12(room + 7.0));
}

float lampDepth(vec2 room) {
  return hash12(room + 5.0);
}

vec3 fromWindow(vec3 point, vec2 tile, float below, out vec2 room) {
  float storey = 0.5 * uTileHeight;
  float column = floor((point.x + 0.5 * uBay) / uBay);
  float columnTile = tile.x + column;
  float parity = mod(abs(columnTile), 2.0);
  float shift = parity - mod(abs(tile.x), 2.0);
  float row = floor(point.y / storey - shift) - below;
  vec3 window = WINDOW + vec3(column * uBay, (row + shift) * storey, 0.0);
  room = vec2(columnTile, mod(2.0 * tile.y + row + parity, 8192.0));
  return point - window;
}

vec3 windowWash(vec3 local, vec3 normal, vec3 shading, vec2 tile, float originX, float through) {
  vec3 light = vec3(0.0);
  for (int below = 0; below < 2; below++) {
    vec2 room;
    vec3 point = local + normal * 0.02;
    vec3 q = fromWindow(point, tile, float(below), room);
    float reach = length(q);
    float facing = max(dot(shading, -q / reach), 0.0) + through * max(dot(shading, q / reach), 0.0);
    float ahead = smoothstep(-0.1, 0.5, q.z / reach);
    float falloff = (1.0 - smoothstep(0.5 * WINDOW_REACH, WINDOW_REACH, reach)) / (0.5 + reach * reach);
    float wash = facing * ahead * falloff;
    if (wash > 0.0) light += windowLight(room, originX + point.x - q.x) * mix(1.0, 0.35, lampDepth(room)) * WASH * wash;
  }
  return light;
}

float recessGlow(vec3 q) {
  vec3 shape = (q - vec3(0.0, -0.1, 2.3)) / GLOW;
  return exp(-1.5 * dot(shape, shape)) * smoothstep(0.4, 1.4, q.z);
}

vec3 windowScatter(vec3 eye, vec3 local, vec2 tile, vec3 origin, float jitter) {
  vec3 ray = local - eye;
  float near = clamp((eye.z - 1.2) / (eye.z - local.z), 0.0, 1.0);
  vec2 litRoom = vec2(-1.0);
  vec3 glow = vec3(0.0);
  vec3 scatter = vec3(0.0);
  for (int i = 0; i < GLOW_STEPS; i++) {
    vec3 point = eye + ray * mix(near, 1.0, (float(i) + jitter) / float(GLOW_STEPS));
    vec2 room;
    vec3 q = fromWindow(point, tile, 0.0, room);
    float shape = recessGlow(q);
    if (shape < 1e-3) continue;
    if (room != litRoom) {
      glow = windowLight(room, origin.x + point.x - q.x);
      litRoom = room;
    }
    if (glow.r + glow.g + glow.b < 1e-3) continue;
    vec3 drift = point + origin + vec3(0.0, uClimb - uTime * 0.2, 0.0);
    float dust = valueNoise(drift * vec3(2.5, 1.0, 2.5)) * mix(0.6, 1.4, valueNoise(drift * 9.0));
    scatter += glow * mix(1.0, 0.35, lampDepth(room)) * shape * mix(0.25, 1.6, dust);
  }
  return scatter * (1.0 - near) * length(ray) / float(GLOW_STEPS);
}
