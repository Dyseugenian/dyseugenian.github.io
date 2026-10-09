precision highp float;

#include "chunks/noise-texture.glsl"
#include "chunks/light.glsl"
#include "chunks/windows.glsl"
#include "chunks/sky.glsl"
#include "chunks/clouds.glsl"

uniform vec3 cameraPosition;
uniform vec2 uResolution;
uniform vec2 uVanish;
uniform vec4 uBacklights;
uniform vec3 uSky;
uniform float uExposure;
uniform float uFogDensity;
uniform vec3 uGrime;

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
flat in vec2 vTile;
flat in float vSeed;

out vec4 outColor;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 toCamera = normalize(cameraPosition - vWorld);
  vec3 body = uGrime * mix(0.6, 1.1, vSeed);
  float far = length(vWorld - cameraPosition);
  float washed = 1.0 - smoothstep(14.0, 40.0, far);
  vec3 light = nightLight(normal, vWorld, 1.0, 0.6)
    + windowWash(vLocal, normal, normal, vTile, vWorld.x - vLocal.x, 0.5) * washed;
  vec3 color = body * light + 0.2 * pow(max(dot(reflect(-toCamera, normal), uLight), 0.0), 16.0) * light;

  float mist = fbm(vec3(vWorld.x * 0.05, (vWorld.y + uClimb) * 0.04, uTime * 0.04));
  float fog = 1.0 - exp(-far * uFogDensity * mix(0.3, 1.0, mist));
  vec3 haze = skyColor(gl_FragCoord.xy, uResolution, uVanish, uBacklights, uTime, uSky, uHaze, uRim);
  color = mix(color, haze, fog);
  vec3 climbed = vec3(0.0, uClimb, 0.0);
  color = mix(color, haze, 0.7 * clouds(cameraPosition + climbed, vWorld + climbed));
  outColor = vec4(color * uExposure, 1.0);
}
