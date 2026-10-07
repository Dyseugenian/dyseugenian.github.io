precision highp float;

#include "chunks/noise.glsl"

uniform vec3 uColor;
uniform float uStrength;
uniform float uOpacity;

in vec2 vUv;

out vec4 outColor;

void main() {
  float fromCenter = length(vUv * 2.0 - 1.0);
  float shade = 1.0 - smoothstep(0.0, 1.0, fromCenter);
  shade *= shade;
  float dither = (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(uColor, max(uStrength * shade * uOpacity + dither, 0.0));
}
