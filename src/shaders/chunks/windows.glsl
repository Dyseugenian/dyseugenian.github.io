#include "rooms.glsl"

uniform float uTime;
uniform float uBay;
uniform float uOuterX;
uniform vec3 uLamp;
uniform vec3 uLampSoft;
uniform vec3 uLampCool;
uniform vec3 uLampCold;
uniform sampler2D uRoomLight;
uniform vec2 uRoomAtlas;
uniform float uRoomRow;

const vec3 WINDOW = vec3(0.0, 2.175, -3.4);
const float WINDOW_REACH = 4.5;
const float WASH = 3.2;
const vec3 GLOW = vec3(1.2, 1.1, 1.8);
const float SCATTER = 1.2;
const int GLOW_CELLS = 8;

vec3 windowLight(vec2 room) {
  vec2 texel = vec2(room.x + 0.5 * uRoomAtlas.x, mod(room.y - uRoomRow, 8192.0));
  return textureLod(uRoomLight, (texel + 0.5) / uRoomAtlas, 0.0).rgb;
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

vec3 windowWash(vec3 local, vec3 normal, vec3 shading, vec2 tile, float through) {
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
    if (wash > 0.0) light += windowLight(room) * mix(1.0, 0.35, lampDepth(room)) * WASH * wash;
  }
  return light;
}

const vec3 GLOW_CENTRE = vec3(0.0, -0.1, 2.3);
const float GLOW_FALLOFF = 1.5;
const vec2 CELL_Y = vec2(-2.175, 1.425);

// Winitzki 2008
float erfNear(float x) {
  float square = x * x;
  return sign(x) * sqrt(1.0 - exp(-square * (1.27324 + 0.147 * square) / (1.0 + 0.147 * square)));
}

vec3 windowScatter(vec3 eye, vec3 local, vec2 tile, vec3 origin) {
  vec3 ray = local - eye;
  float at = clamp((eye.z - 1.2) / (eye.z - local.z), 0.0, 1.0);
  vec3 slope = ray / GLOW;
  float spread = GLOW_FALLOFF * dot(slope, slope);
  float width = sqrt(spread);
  vec3 scatter = vec3(0.0);
  for (int i = 0; i < GLOW_CELLS; i++) {
    if (at >= 1.0) break;
    vec3 entry = eye + ray * (at + 1e-4);
    vec2 room;
    vec3 q = fromWindow(entry, tile, 0.0, room);
    vec2 walls = vec2(ray.x > 0.0 ? 0.5 * uBay : -0.5 * uBay, ray.y > 0.0 ? CELL_Y.y : CELL_Y.x);
    vec2 toWall = (walls - q.xy) / ray.xy;
    float span = min(min(toWall.x, toWall.y) + 1e-4, 1.0 - at);
    float from = at;
    at += span;
    vec3 offset = (q - GLOW_CENTRE) / GLOW;
    float lean = GLOW_FALLOFF * dot(offset, slope);
    float peak = -lean / spread;
    float closest = GLOW_FALLOFF * dot(offset, offset) - lean * lean / spread;
    float crossed = exp(-closest) * 0.8862 / width * (erfNear(width * (span - peak)) + erfNear(width * peak));
    float nearest = clamp(peak, 0.0, span);
    crossed *= smoothstep(0.4, 1.4, q.z + ray.z * nearest);
    if (crossed * length(ray) < 1e-3) continue;
    vec3 glow = windowLight(room);
    if (glow.r + glow.g + glow.b < 1e-3) continue;
    vec3 drift = eye + origin + vec3(0.0, uClimb - uTime * 0.2, 0.0) + ray * from;
    float dust = 0.0;
    for (int tap = 0; tap < 4; tap++) {
      float along = clamp(nearest + (float(tap) - 1.5) * 0.7 / width, 0.0, span);
      dust += 0.25 * valueNoise((drift + ray * along) * vec3(2.5, 1.0, 2.5));
    }
    scatter += glow * mix(1.0, 0.35, lampDepth(room)) * crossed * mix(0.25, 1.6, dust);
  }
  return scatter * length(ray);
}
