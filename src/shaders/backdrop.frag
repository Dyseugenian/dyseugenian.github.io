precision highp float;

#include "chunks/noise.glsl"
#include "chunks/sky.glsl"

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uVanish;
uniform vec3 uSky;
uniform vec3 uHaze;

out vec4 outColor;

void main() {
  outColor = vec4(skyColor(gl_FragCoord.xy, uResolution, uVanish, uTime, uSky, uHaze), 1.0);
}
