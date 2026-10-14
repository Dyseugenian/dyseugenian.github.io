precision highp float;

#include "chunks/noise-texture.glsl"
#include "chunks/light.glsl"
#include "chunks/windows.glsl"
#include "chunks/sky.glsl"

uniform vec3 cameraPosition;
uniform vec2 uResolution;
uniform float uExposure;
uniform float uFogDensity;
uniform vec3 uRust;
uniform vec3 uGrime;
uniform vec3 uConcrete;

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
in float vAlong;
in float vAround;
in float vTread;
flat in vec2 vTile;
flat in float vKey;
flat in float vWorn;

uniform float uPresence;

out vec4 outColor;

const float WRAP = 0.6;
const float SHADE = 0.68;

void main() {
  if (uPresence > 0.5) {
    outColor = vec4(1.0);
    return;
  }
  vec3 normal = normalize(vNormal);
  float angle = vAround * 6.2832;
  vec3 surface = vec3(vAlong * 9.0, cos(angle) * 0.7, sin(angle) * 0.7) + vKey;
  float blotch = valueNoise(surface * vec3(1.0, 1.5, 1.5));
  float flakes = valueNoise(surface * vec3(6.0, 3.0, 3.0) + 5.0);
  float grain = valueNoise(surface * vec3(40.0, 8.0, 8.0) + 11.0);
  float underside = smoothstep(-0.1, -0.8, normal.y);
  float top = smoothstep(0.4, 0.9, normal.y) * vTread;

  vec3 rust = uRust * mix(0.45, 1.0, blotch) * mix(0.8, 1.15, grain);
  vec3 scale = mix(uRust * 0.35, uGrime * 1.4, 0.5);
  vec3 steel = mix(rust, scale, smoothstep(0.45, 0.75, flakes) * 0.7);
  steel = mix(steel, uGrime, 0.35 * underside + 0.15 * (1.0 - blotch));
  float rubbed = top * vWorn * smoothstep(0.25, 0.6, valueNoise(surface * vec3(3.0, 1.0, 1.0) + 17.0));
  vec3 bare = mix(uConcrete, uGrime, 0.55) * mix(0.35, 0.5, grain);
  steel = mix(steel, bare, 0.85 * rubbed) * SHADE;

  vec3 toCamera = normalize(cameraPosition - vWorld);
  float distance = length(vWorld - cameraPosition);
  float washed = 1.0 - smoothstep(14.0, 40.0, distance);
  float facing = abs(dot(normal, toCamera));
  vec3 light = nightLight(normal, vWorld, 1.0, WRAP) + windowWash(vLocal, normal, normal, vTile, 0.5) * washed;
  float sheen = mix(0.03, 0.25, rubbed) * pow(max(dot(reflect(-toCamera, normal), uLight), 0.0), mix(8.0, 30.0, rubbed));
  vec3 color = steel * light * mix(0.8, 1.0, facing) + sheen * light;

  float mist = fbm(vec3(vWorld.x * 0.05, (vWorld.y + uClimb) * 0.04, uTime * 0.04));
  float fog = 1.0 - exp(-distance * uFogDensity * mix(0.5, 1.7, mist));
  vec4 sky = skyAt(gl_FragCoord.xy, uResolution);
  vec3 haze = skyClear(sky);
  vec3 origin = vWorld - vLocal;
  float jitter = ign(gl_FragCoord.xy + mod(floor(uTime * 24.0), 4096.0) * vec2(5.588, 3.17));
  vec3 scatter = windowScatter(cameraPosition - origin, vLocal, vTile, origin, jitter) * washed
    * mix(0.6, 1.4, hash12(gl_FragCoord.xy + fract(uTime) * 61.0));
  outColor = vec4((mix(color, haze, fog) + SCATTER * scatter * (1.0 - 0.5 * fog)
    + skyFlash(sky, fog)) * uExposure, 1.0);
}
