precision highp float;
precision highp int;

#include "chunks/sky.glsl"

uniform vec2 uResolution;
uniform float uExposure;

out vec4 outColor;

void main() {
  outColor = vec4(skyColor(gl_FragCoord.xy, uResolution) * uExposure, 1.0);
}
