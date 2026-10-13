precision highp float;

#include "chunks/noise-texture.glsl"

uniform vec3 uSalt;
uniform float uExposure;

in vec2 vCorner;
in vec3 vLight;
in float vDensity;
in float vSeed;

uniform float uPresence;

out vec4 outColor;

void main() {
  if (uPresence > 0.5) {
    outColor = vec4(1.0);
    return;
  }
  float wisps = valueNoise(vCorner * 4.0 + vSeed) + 0.5 * valueNoise(vCorner * 9.0 + vSeed + 13.0);
  float density = (1.0 - smoothstep(0.1, 0.5, length(vCorner) + 0.25 * (wisps - 0.75))) * vDensity * 0.3;
  outColor = vec4(uSalt * vLight * uExposure * density, density);
}
