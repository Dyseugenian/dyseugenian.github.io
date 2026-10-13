precision highp float;

#include "chunks/noise-texture.glsl"
#include "chunks/light.glsl"

uniform vec3 cameraPosition;
uniform vec3 uSky;
uniform float uExposure;
uniform float uFogDensity;
uniform vec3 uGrime;
uniform vec3 uNewsprint;
uniform vec3 uMadder;
uniform vec3 uTint;
uniform float uLabel;
uniform float uSeed;
uniform float uShape;

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;

out vec4 outColor;

const float WALLS = 1.6;
const float SPOT_GLINT = 900.0;
const float SPOT_SHEEN = 6.0;

float label() {
  float height = mix(0.24, 0.3, uShape);
  float along = (vLocal.y + 0.45 * height) / height;
  float around = atan(vLocal.z, vLocal.x) / 6.2832 + 0.5;
  float band = step(abs(along - mix(0.3, 0.33, uShape)), 0.13 + 0.02 * valueNoise(vec2(around * 30.0, uSeed * 50.0)));
  float torn = step(0.35, valueNoise(vec2(around * 6.0, along * 4.0) + uSeed * 31.0));
  return uLabel * band * torn * step(abs(vLocal.y), 0.2);
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 toCamera = normalize(cameraPosition - vWorld);
  if (dot(normal, toCamera) < 0.0) normal = -normal;
  float facing = max(dot(normal, toCamera), 0.05);
  float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
  float far = length(vWorld - cameraPosition);
  float fog = 1.0 - exp(-far * uFogDensity);
  float paper = label();
  float grime = smoothstep(0.55, 0.8, valueNoise(vLocal.xy * 60.0 + uSeed * 17.0)) * 0.4;

#if PASS == 0
  vec3 through = pow(uTint, vec3(WALLS / facing)) * (1.0 - fresnel) * (1.0 - grime);
  outColor = vec4(mix(through * (1.0 - paper), vec3(1.0), fog), 1.0);
#else
  vec3 mirrored = reflect(-toCamera, normal);
  vec3 sky = mix(uGrime * 0.3, mix(uSky * 1.5, uHaze * 2.6, smoothstep(-0.1, 0.7, mirrored.y)), smoothstep(-0.25, 0.05, mirrored.y));
  vec3 toSpot = uSpot - vWorld;
  float spotReach = length(toSpot);
  toSpot /= spotReach;
  float cone = smoothstep(SPOT_CONE.x, SPOT_CONE.y, dot(-toSpot, normalize(SPOT_AIM)));
  vec3 spot = uSpotColor * SPOT_LIGHT * cone / (1.0 + pow(spotReach / SPOT_FALLOFF, 4.0));
  float aligned = max(dot(mirrored, toSpot), 0.0);
  vec3 glints = spot * (SPOT_GLINT * pow(aligned, 2000.0) + SPOT_SHEEN * pow(aligned, 60.0))
    + uRim * MOONLIGHT * 20.0 * pow(max(dot(mirrored, uLight), 0.0), 400.0);
  float rim = pow(1.0 - facing, 2.0);
  vec3 glow = uTint * spot * (0.08 + 0.6 * rim) * max(dot(-normal, toSpot) * 0.5 + 0.5, 0.0);
  vec3 glass = (sky * fresnel + glints * mix(1.0, 0.3, grime) + glow) * (1.0 - paper);
  vec3 printed = mix(uNewsprint * 0.7, uMadder, step(0.5, fract(uSeed * 7.0)) * step(abs(vLocal.y + 0.01), 0.03));
  vec3 lit = nightLight(normal, vWorld, 1.0, 0.3);
  vec3 color = glass + paper * printed * lit;
  outColor = vec4(color * (1.0 - fog) * uExposure, 1.0);
#endif
}
