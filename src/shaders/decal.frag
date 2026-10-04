precision highp float;

#include "chunks/noise.glsl"

uniform sampler2D uMap;
uniform float uOpacity;
uniform float uTime;

in vec2 vUv;

out vec4 outColor;

float lightness(vec2 texel) {
  return dot(texelFetch(uMap, ivec2(texel), 0).rgb, vec3(1.0 / 3.0));
}

void main() {
  vec2 texel = floor(vUv * vec2(textureSize(uMap, 0)));
  float darkest = min(
    min(lightness(texel + vec2(2.0, 0.0)), lightness(texel - vec2(2.0, 0.0))),
    min(lightness(texel + vec2(0.0, 2.0)), lightness(texel - vec2(0.0, 2.0))));
  float edge = 1.0 - smoothstep(0.05, 0.3, darkest);
  float frame = floor(uTime * 12.0);
  float scattered = step(hash13(vec3(texel, frame)), edge * 0.42);
  outColor = vec4(texture(uMap, vUv).rgb * (1.0 - scattered), uOpacity);
}
