precision highp float;

#include "chunks/noise-texture.glsl"

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uSkySize;
uniform vec2 uVanish;
uniform vec4 uBacklights;
uniform vec3 uSky;
uniform vec3 uHaze;
uniform vec3 uRim;

out vec4 outColor;

const float OPENING = 0.32;
const float FLASH_EVERY = 12.5;
const float FLASH_DRIFT = 5.5;
const float FLASH_STRENGTH = 1.0;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float pulse(float since) {
  if (since < 0.0) return 0.0;
  return smoothstep(0.0, 0.015, since) * (0.75 * exp(-since * 12.0) + 0.25 * exp(-since * 3.5));
}

float lightning(vec2 offset, float cloud) {
  float strike = floor(uTime / FLASH_EVERY);
  vec4 pick = vec4(hash12(vec2(strike, 1.0) + 611.0), hash12(vec2(strike, 2.0) + 611.0),
    hash12(vec2(strike, 3.0) + 611.0), hash12(vec2(strike, 4.0) + 611.0));
  float since = uTime - strike * FLASH_EVERY - FLASH_DRIFT * hash12(vec2(strike, 5.0) + 611.0);
  float flash = mix(0.6, 1.0, pick.w) * pulse(since);
  if (pick.y < 0.65) flash += 0.7 * pulse(since - 0.1 - 0.12 * pick.z);
  if (pick.y < 0.3) flash += 0.45 * pulse(since - 0.35 - 0.1 * pick.x);
  float side = pick.x < 0.5 ? -1.0 : 1.0;
  vec2 spot = vec2(side * mix(0.55, 0.9, fract(pick.x * 2.0)), mix(-0.45, -0.1, pick.z));
  float glow = exp(-1.8 * length(offset - spot));
  float aside = smoothstep(0.15, 0.45, abs(offset.x));
  return flash * aside * (0.15 + 0.85 * glow) * mix(0.35, 1.3, smoothstep(0.3, 0.8, cloud));
}

void main() {
  vec2 pixel = gl_FragCoord.xy / uSkySize * uResolution;
  vec2 offset = (pixel - uVanish) / uResolution.y;
  float radius = length(offset);
  vec2 direction = offset / max(radius, 1e-4);
  float cloud = fbm(vec3(direction * 1.8, log(radius + 0.03) * 1.6 - uTime * 0.12));
  float ragged = radius * mix(0.8, 1.25, fbm(vec3(direction * 2.6, uTime * 0.03)));
  float opening = exp(-pow(ragged / OPENING, 2.0));
  float cover = smoothstep(0.35, 0.8, cloud) * mix(0.45, 0.08, opening);
  vec3 color = mix(uSky, uHaze, cover);
  color = mix(color, uRim, 0.1 * opening * mix(0.7, 1.0, cloud));
  float glow = exp(-2.5 * length(pixel - uBacklights.xy) / uResolution.y)
    + exp(-2.5 * length(pixel - uBacklights.zw) / uResolution.y);
  color = mix(color, uRim, 0.3 * glow * mix(0.7, 1.0, cloud));
  vec3 flash = uRim * FLASH_STRENGTH * lightning(offset, cloud);
  float share = dot(flash, LUMA) / max(dot(color + flash, LUMA), 1e-4);
  outColor = vec4(color + flash, share);
}
