precision highp float;

#include "chunks/noise.glsl"
#include "chunks/sky.glsl"

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uVanish;
uniform vec4 uBacklights;
uniform vec3 uSky;
uniform vec3 uHaze;
uniform vec3 uRim;
uniform float uExposure;

out vec4 outColor;

void main() {
  vec3 sky = skyColor(gl_FragCoord.xy, uResolution, uVanish, uBacklights, uTime, uSky, uHaze, uRim);
  outColor = vec4(sky * uExposure, 1.0);
}
