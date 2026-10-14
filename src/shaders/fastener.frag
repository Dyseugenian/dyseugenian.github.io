precision highp float;

#include "chunks/noise-texture.glsl"
#include "chunks/light.glsl"
#include "chunks/windows.glsl"
#include "chunks/sky.glsl"
#include "chunks/clouds.glsl"

uniform vec3 cameraPosition;
uniform vec2 uResolution;
uniform float uExposure;
uniform float uFogDensity;
uniform vec3 uGrime;

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
flat in vec2 vTile;
flat in float vSeed;

uniform float uPresence;

out vec4 outColor;

void main() {
  if (uPresence > 0.5) {
    outColor = vec4(1.0);
    return;
  }
  vec3 normal = normalize(vNormal);
  vec3 toCamera = normalize(cameraPosition - vWorld);
  vec3 body = uGrime * mix(0.6, 1.1, vSeed);
  float far = length(vWorld - cameraPosition);
  float washed = 1.0 - smoothstep(14.0, 40.0, far);
  vec3 light = nightLight(normal, vWorld, 1.0, 0.6)
    + windowWash(vLocal, normal, normal, vTile, 0.5) * washed;
  vec3 color = body * light + 0.2 * pow(max(dot(reflect(-toCamera, normal), uLight), 0.0), 16.0) * light;

  float mist = fbm(vec3(vWorld.x * 0.05, (vWorld.y + uClimb) * 0.04, uTime * 0.04));
  float fog = 1.0 - exp(-far * uFogDensity * mix(0.3, 1.0, mist));
  vec4 sky = skyAt(gl_FragCoord.xy, uResolution);
  vec3 haze = skyClear(sky);
  color = mix(color, haze, fog);
  vec3 climbed = vec3(0.0, uClimb, 0.0);
  float veil = 0.7 * clouds(cameraPosition + climbed, vWorld + climbed);
  color = mix(color, haze, veil);
  color += skyFlash(sky, 1.0 - (1.0 - fog) * (1.0 - veil));
  outColor = vec4(color * uExposure, 1.0);
}
