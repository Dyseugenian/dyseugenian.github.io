precision highp float;

#include "chunks/noise-texture.glsl"
#include "chunks/light.glsl"
#include "chunks/windows.glsl"
#include "chunks/sky.glsl"

uniform vec3 cameraPosition;
uniform vec2 uResolution;
uniform vec2 uVanish;
uniform vec4 uBacklights;
uniform vec3 uSky;
uniform float uExposure;
uniform float uFogDensity;
uniform vec3 uConcrete;
uniform vec3 uMoss;
uniform vec3 uSalt;

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
in float vHead;
flat in vec2 vTile;
flat in float vSeed;

out vec4 outColor;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 plumage = uConcrete * mix(0.16, 0.28, vSeed) * mix(0.8, 1.1, valueNoise(vLocal * 60.0));
  plumage = mix(plumage, uSalt * 0.3, 0.2 * smoothstep(-0.2, -0.8, normal.y));
  plumage = mix(plumage, uMoss * 0.5, 0.5 * vHead);
  float distance = length(vWorld - cameraPosition);
  vec3 light = nightLight(normal, vWorld, 1.0, 0.3)
    + windowWash(vLocal, normal, normal, vTile, vWorld.x - vLocal.x, 0.3) * (1.0 - smoothstep(14.0, 40.0, distance));
  float fog = 1.0 - exp(-distance * uFogDensity);
  vec3 haze = skyColor(gl_FragCoord.xy, uResolution, uVanish, uBacklights, uTime, uSky, uHaze, uRim);
  outColor = vec4(mix(plumage * light, haze, fog) * uExposure, 1.0);
}
