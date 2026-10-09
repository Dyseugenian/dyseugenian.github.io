precision highp float;

#include "chunks/noise-texture.glsl"

uniform float uTime;
uniform float uExposure;

in vec2 vCorner;
in vec3 vLight;
in float vAlpha;
in float vStreak;
in float vSeed;

out vec4 outColor;

void main() {
  if (vStreak < 0.5) {
    float core = (1.0 - smoothstep(0.1, 0.5, abs(vCorner.x))) * vAlpha;
    outColor = vec4(vLight * 1.6 * uExposure * core, core);
    return;
  }
  float below = 0.5 - vCorner.y;
  float path = 0.15 * (valueNoise(vec2(below * 5.0, vSeed)) - 0.5) + 0.1 * below;
  float width = mix(0.08, 0.3, below);
  float wet = (1.0 - smoothstep(0.5 * width, width, abs(vCorner.x - path))) * smoothstep(0.0, 0.05, below);
  float glints = smoothstep(0.86, 0.97, valueNoise(vec2(vCorner.x * 40.0, below * 14.0 - uTime * 3.0 + vSeed)));
  outColor = vec4(vLight * glints * wet * 0.5 * uExposure, wet * 0.45);
}
