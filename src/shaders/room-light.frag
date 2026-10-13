precision highp float;

#include "chunks/noise-texture.glsl"
#include "chunks/rooms.glsl"

uniform float uTime;
uniform float uBay;
uniform float uOuterX;
uniform vec2 uRoomAtlas;
uniform float uRoomRow;
uniform vec3 uLamp;
uniform vec3 uLampSoft;
uniform vec3 uLampCool;
uniform vec3 uLampCold;

out vec4 outColor;

const float SWITCH_PERIOD = 30.0;

vec3 roomLight(vec2 room) {
  if (abs(room.x) * uBay + 1.05 > uOuterX || plantFloor(room) || boarded(room)) return vec3(0.0);
  float cluster = valueNoise(room * vec2(0.9, 0.2) + 5.0);
  float chance = mix(0.1, 0.6, smoothstep(0.3, 0.75, cluster));
  float era = floor(uTime / SWITCH_PERIOD + hash12(room + 43.0));
  float on = abs(step(hash12(room + 41.0), chance) - step(0.93, hash12(room + era * 1.37)));
  if (on < 0.5) return vec3(0.0);
  float pick = hash12(room + 19.0);
  vec3 tint = pick < 0.5 ? uLamp : pick < 0.75 ? uLampSoft : pick < 0.88 ? uLampCool : uLampCold;
  float faulty = step(0.75, pick) * step(pick, 0.88) * step(0.5, hash12(room + 47.0));
  float dim = 1.0;
  if (pick >= 0.88) {
    float shot = floor(uTime * mix(0.3, 0.9, hash12(room + 49.0)) + 9.0 * hash12(room + 51.0));
    tint = mix(uLampCold, uLampCool, hash12(room + shot * 0.73));
    dim = mix(0.3, 1.0, hash12(room + shot * 1.91)) * mix(0.85, 1.0, valueNoise(vec2(uTime * 9.0, room.x + room.y)));
  }
  if (faulty > 0.5) {
    float bursts = step(0.6, valueNoise(vec2(uTime * 0.7, room.x * 3.1 + room.y)));
    float flicker = step(0.7, valueNoise(vec2(uTime * 14.0, room.x * 13.0 + room.y * 7.0)));
    dim = 1.0 - 0.85 * bursts * flicker;
  }
  return tint * dim * mix(0.35, 1.0, hash12(room + 7.0));
}

void main() {
  vec2 texel = floor(gl_FragCoord.xy);
  vec2 room = vec2(texel.x - 0.5 * uRoomAtlas.x, mod(texel.y + uRoomRow, 8192.0));
  outColor = vec4(roomLight(room), 1.0);
}
