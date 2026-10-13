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
  outColor = vec4(mix(color, uRim, 0.3 * glow * mix(0.7, 1.0, cloud)), 1.0);
}
