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
uniform vec3 uCableGrey;

in vec3 vWorld;
in vec3 vLocal;
in vec3 vSide;
in vec3 vTangent;
in float vAcross;
in float vAlpha;
in float vSoft;
flat in vec2 vTile;
flat in float vSeed;

uniform float uPresence;

out vec4 outColor;

void main() {
  if (uPresence > 0.5) {
    outColor = vec4(1.0);
    return;
  }
  vec3 toCamera = normalize(cameraPosition - vWorld);
  vec3 facing = normalize(toCamera - vTangent * dot(toCamera, vTangent));
  float across = clamp(vAcross, -1.0, 1.0);
  vec3 normal = normalize(vSide * across + facing * sqrt(1.0 - across * across));
  vec3 sheath = mix(uGrime, uCableGrey, vSeed * vSeed) * mix(0.4, 1.0, fract(vSeed * 7.31));
  float far = length(vWorld - cameraPosition);
  float washed = 1.0 - smoothstep(14.0, 40.0, far);
  vec3 light = nightLight(normal, vWorld, 1.0, 0.6)
    + windowWash(vLocal, normal, normal, vTile, 0.5) * washed;
  vec3 color = sheath * light + 0.25 * pow(max(dot(reflect(-toCamera, normal), uLight), 0.0), 20.0) * light;

  float mist = fbm(vec3(vWorld.x * 0.05, (vWorld.y + uClimb) * 0.04, uTime * 0.04));
  float fog = mix(1.0 - exp(-far * uFogDensity * mix(0.3, 1.0, mist)), 1.0, 0.65 * vSoft);
  vec4 sky = skyAt(gl_FragCoord.xy, uResolution);
  vec3 haze = skyClear(sky);
  vec3 origin = vWorld - vLocal;
  float jitter = ign(gl_FragCoord.xy + mod(floor(uTime * 24.0), 4096.0) * vec2(5.588, 3.17));
  vec3 scatter = windowScatter(cameraPosition - origin, vLocal, vTile, origin, jitter) * washed
    * mix(0.6, 1.4, hash12(gl_FragCoord.xy + fract(uTime) * 61.0));
  float coverage = vAlpha * (1.0 - smoothstep(mix(0.6, 0.0, vSoft), 1.0, abs(vAcross)));
  color = mix(color, haze, fog) + SCATTER * scatter * (1.0 - 0.5 * fog);
  vec3 climbed = vec3(0.0, uClimb, 0.0);
  float veil = 0.7 * clouds(cameraPosition + climbed, vWorld + climbed);
  color = mix(color, haze, veil);
  color += skyFlash(sky, 1.0 - (1.0 - fog) * (1.0 - veil));
  outColor = vec4(color * uExposure * coverage, coverage);
}
