precision highp float;

#include "chunks/noise-texture.glsl"

uniform vec3 uRust;
uniform vec3 uConcrete;
uniform float uPresence;

in vec2 vSpot;
flat in float vLength;
flat in float vStrength;
flat in float vHole;
flat in float vSeed;

out vec4 outColor;

void main() {
  if (uPresence > 0.5) {
    outColor = vec4(1.0);
    return;
  }
  float down = max(-vSpot.y, 0.0);
  float along = down / vLength;
  float wander = 0.016 * (valueNoise(vec2(down * 5.0, vSeed * 40.0)) - 0.5);
  float width = mix(0.008, 0.02, along);
  float streak = (1.0 - smoothstep(0.35 * width, width, abs(vSpot.x - wander)))
    * (1.0 - smoothstep(0.25, 1.0, along))
    * mix(0.45, 1.0, valueNoise(vec2(vSpot.x * 70.0, down * 9.0 + vSeed * 17.0)));
  float blot = (1.0 - smoothstep(0.014, 0.038, length(vSpot * vec2(1.0, 1.4))))
    * mix(0.55, 1.0, valueNoise(vSpot * 90.0 + vSeed * 31.0));
  float stain = max(streak, blot) * vStrength;
  float hole = vHole * (1.0 - smoothstep(0.007, 0.013, length(vSpot))) * min(2.0 * vStrength, 1.0);
  vec3 color = mix(vec3(1.0), clamp(uRust / uConcrete, 0.0, 1.0), stain) * (1.0 - 0.75 * hole);
  outColor = vec4(color, 1.0);
}
