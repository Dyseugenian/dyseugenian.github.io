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
uniform vec3 uConcrete;
uniform vec3 uGrime;
uniform vec3 uRust;

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
in float vAlong;
in float vRadial;
flat in vec2 vTile;
flat in float vPart;
flat in float vDrips;

out vec4 outColor;

void main() {
  vec3 normal = gl_FrontFacing ? normalize(vNormal) : -normalize(vNormal);
  float inside = !gl_FrontFacing || (vPart == 1.0 && vRadial < 1.0) ? 1.0 : 0.0;
  vec3 toCamera = normalize(cameraPosition - vWorld);
  vec2 seed = vTile + vec2(vDrips * 31.0, vPart);
  float blotch = valueNoise(vec3(vAlong * 4.0, normal.xy * 1.5 + seed));
  float flaking = smoothstep(0.45, 0.75, valueNoise(vec3(vAlong * 12.0, normal.xy * 3.0 + seed + 9.0)));
  vec3 albedo = mix(uGrime, uConcrete, 0.38) * mix(0.7, 1.0, blotch);
  albedo = mix(albedo, uRust * mix(0.5, 1.0, blotch), min(mix(0.3, 0.6, vPart / 2.0) * flaking + 0.4 * inside, 0.8));
  float dripping = step(vDrips, 0.5);
  float underside = smoothstep(-0.2, -0.8, normal.y);
  float wet = dripping * max(underside * smoothstep(0.5, 1.0, vAlong) * (1.0 - inside), inside * underside);
  albedo *= 1.0 - 0.45 * wet;

  float far = length(vWorld - cameraPosition);
  float washed = 1.0 - smoothstep(14.0, 40.0, far);
  float bore = mix(1.0, 0.12 + 0.5 * vAlong * vAlong, inside);
  vec3 light = (nightLight(normal, vWorld, 1.0, 0.5)
    + windowWash(vLocal, normal, normal, vTile, vWorld.x - vLocal.x, 0.3) * washed) * bore;
  float along = vWorld.y + uClimb + vAlong;
  float glints = smoothstep(0.82, 0.97, valueNoise(vec2(normal.x * 25.0 + seed.x, vAlong * 9.0 - uTime * 1.5)));
  vec3 color = albedo * light
    + (0.12 + 0.5 * wet) * pow(max(dot(reflect(-toCamera, normal), uLight), 0.0), 18.0) * light
    + wet * glints * 0.6 * light;

  float mist = fbm(vec3(vWorld.x * 0.05, along * 0.04, uTime * 0.04));
  float fog = 1.0 - exp(-far * uFogDensity * mix(0.5, 1.7, mist));
  vec3 haze = skyColor(gl_FragCoord.xy, uResolution, uVanish, uBacklights, uTime, uSky, uHaze, uRim);
  vec3 origin = vWorld - vLocal;
  float jitter = ign(gl_FragCoord.xy + floor(uTime * 24.0) * vec2(5.588, 3.17));
  vec3 scatter = windowScatter(cameraPosition - origin, vLocal, vTile, origin, jitter) * washed
    * mix(0.6, 1.4, hash12(gl_FragCoord.xy + fract(uTime) * 61.0));
  color = mix(color, haze, fog) + SCATTER * scatter * (1.0 - 0.5 * fog);
  vec3 climbed = vec3(0.0, uClimb, 0.0);
  color = mix(color, haze, clouds(cameraPosition + climbed, vWorld + climbed));
  outColor = vec4(color * uExposure, 1.0);
}
