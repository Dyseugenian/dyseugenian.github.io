precision highp float;

#include "chunks/noise-texture.glsl"

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uSkySize;
uniform vec2 uVanish;
uniform vec4 uBacklights;
uniform vec3 uSky;
uniform vec3 uSkyLow;
uniform vec3 uHaze;
uniform vec3 uRim;

out vec4 outColor;

const float OPENING = 0.32;
const float FLASH_EVERY = 12.5;
const float FLASH_DRIFT = 5.5;
const float FLASH_STRENGTH = 1.0;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float CLOUD_WARP = 1.6;
const float BANK_SCALE = 0.45;
const float KNOT_SCALE = 1.4;
const float BILLOW_EDGE = 0.3;
const float BILLOW_REACH = 0.07;
const float REST_BILLOW = 0.1;
const float OVERCAST_DARK = 0.7;
const float OVERCAST_LIGHT = 1.05;
const float SKY_DEEP = 0.55;

float pulse(float since) {
  if (since < 0.0) return 0.0;
  return smoothstep(0.0, 0.015, since) * (0.75 * exp(-since * 12.0) + 0.25 * exp(-since * 3.5));
}

vec3 strikeAt() {
  float strike = floor(uTime / FLASH_EVERY);
  vec4 pick = vec4(hash12(vec2(strike, 1.0) + 611.0), hash12(vec2(strike, 2.0) + 611.0),
    hash12(vec2(strike, 3.0) + 611.0), hash12(vec2(strike, 4.0) + 611.0));
  float since = uTime - strike * FLASH_EVERY - FLASH_DRIFT * hash12(vec2(strike, 5.0) + 611.0);
  float flash = mix(0.6, 1.0, pick.w) * pulse(since);
  if (pick.y < 0.65) flash += 0.7 * pulse(since - 0.1 - 0.12 * pick.z);
  if (pick.y < 0.3) flash += 0.45 * pulse(since - 0.35 - 0.1 * pick.x);
  float side = pick.x < 0.5 ? -1.0 : 1.0;
  return vec3(side * mix(0.55, 0.9, fract(pick.x * 2.0)), mix(-0.45, -0.1, pick.z), flash);
}

float overcastAt(vec2 offset) {
  float radius = length(offset);
  vec3 p = vec3(offset / max(radius, 1e-4) * 1.8, log(radius + 0.03) * 1.6 - uTime * 0.12);
  vec2 warp = vec2(fbm(p * 0.5 + 13.0), fbm(p * 0.5 + 29.0)) - 0.47;
  float banks = fbm(p * BANK_SCALE + vec3(CLOUD_WARP * warp, 0.0));
  float knots = fbm(p * KNOT_SCALE + vec3(2.0 * warp, 7.0));
  return smoothstep(0.2, 0.75, banks * 0.75 + knots * 0.4);
}

void main() {
  vec2 pixel = gl_FragCoord.xy / uSkySize * uResolution;
  vec2 offset = (pixel - uVanish) / uResolution.y;
  float radius = length(offset);
  vec2 direction = offset / max(radius, 1e-4);
  vec3 strike = strikeAt();
  float flash = strike.z * smoothstep(0.15, 0.45, abs(offset.x))
    * (0.15 + 0.85 * exp(-1.8 * length(offset - strike.xy)));
  vec2 toward = normalize(mix(-direction, normalize(strike.xy - offset), smoothstep(0.0, 0.05, flash)));
  float cloud = fbm(vec3(direction * 1.8, log(radius + 0.03) * 1.6 - uTime * 0.12));
  float ceiling = overcastAt(offset);
  float billow = smoothstep(0.0, BILLOW_EDGE, ceiling - overcastAt(offset + toward * BILLOW_REACH));
  float ragged = radius * mix(0.8, 1.25, fbm(vec3(direction * 2.6, uTime * 0.03)));
  float opening = exp(-pow(ragged / OPENING, 2.0));
  float cover = (1.0 - opening) * mix(0.3, 1.0, ceiling);
  vec3 sky = mix(uSkyLow, uSky * SKY_DEEP, smoothstep(0.0, 1.0, pixel.y / uResolution.y));
  vec3 color = mix(sky * mix(OVERCAST_DARK, 1.0, opening), uHaze * OVERCAST_LIGHT, cover * ceiling);
  color = mix(color, uRim, 0.1 * opening * mix(0.7, 1.0, cloud) + REST_BILLOW * billow * cover);
  float glow = exp(-2.5 * length(pixel - uBacklights.xy) / uResolution.y)
    + exp(-2.5 * length(pixel - uBacklights.zw) / uResolution.y);
  color = mix(color, uRim, 0.3 * glow * mix(0.7, 1.0, cloud));
  vec3 lit = uRim * FLASH_STRENGTH * flash * (0.15 + cover * (0.4 + 0.7 * ceiling + 1.4 * billow));
  float share = dot(lit, LUMA) / max(dot(color + lit, LUMA), 1e-4);
  outColor = vec4(color + lit, share);
}
