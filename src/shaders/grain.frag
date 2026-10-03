precision highp float;

#include "chunks/noise.glsl"

uniform float uTime;
uniform float uAmount;
uniform float uFps;

out vec4 outColor;

void main() {
  float frame = floor(uTime * uFps);
  float noise = hash13(vec3(gl_FragCoord.xy, frame)) * 2.0 - 1.0;

  vec3 color = noise > 0.0 ? vec3(1.0) : vec3(0.0);
  float alpha = abs(noise) * uAmount;

  alpha += (ign(gl_FragCoord.xy) - 0.5) / 255.0;

  outColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
