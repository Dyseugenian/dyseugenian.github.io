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
uniform vec3 uMoss;
uniform vec3 uLinen;
uniform vec3 uNewsprintAged;
uniform vec3 uCableBrown;

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
in vec3 vShape;
flat in vec2 vTile;
flat in float vPart;
flat in float vKey;
flat in float vSeed;
in float vFray;

out vec4 outColor;

const float LOWER_LEDGE = 4.3;
const float LAY = 0.13;
const float TAU = 6.28318;

vec3 bumped(vec3 normal, float height) {
  vec3 dx = dFdx(vWorld);
  vec3 dy = dFdy(vWorld);
  vec3 across = cross(dy, normal);
  vec3 up = cross(normal, dx);
  float det = dot(dx, across);
  vec3 slope = sign(det) * (dFdx(height) * across + dFdy(height) * up);
  return normalize(abs(det) * normal - slope);
}

void main() {
  vec3 normal = gl_FrontFacing ? normalize(vNormal) : -normalize(vNormal);
  vec3 view = normalize(cameraPosition - vWorld);
  float far = distance(vWorld, cameraPosition);
  float detail = 1.0 - smoothstep(6.0, 18.0, far);
  vec3 albedo;
  float relief;
  if (vPart < 1.5) {
    float e = vShape.x;
    float lash = vShape.z;
    float phase = 3.0 * vShape.y / TAU - e / LAY + vKey * 0.31;
    float strand = abs(fract(phase) - 0.5) * 2.0;
    float groove = 1.0 - smoothstep(0.55, 1.0, strand);
    if (vFray > 0.0) {
      float yarn = mod(floor(phase), 3.0);
      float ends = mix(0.45, 1.0, hash12(vec2(yarn + vKey * 5.0, vSeed * 23.0)));
      float hairs = valueNoise(vec3(vShape.y * 14.0, e * 9.0, yarn + vSeed * 31.0));
      if (vFray > ends || strand > 1.0 - 0.45 * vFray || hairs < vFray * 0.7 - 0.15) discard;
    }
    float fibres = valueNoise(vec3(e * 60.0, vShape.y * 3.0, vSeed * 40.0 + vKey));
    float rubbed = exp(-pow(e / 0.15, 2.0)) + exp(-pow((e - LOWER_LEDGE) / 0.5, 2.0)) + step(e, -0.01) * 0.5;
    float tar = valueNoise(vec3(e * 1.7, vKey * 3.0, vSeed * 17.0));
    vec3 hemp = mix(uLinen, uCableBrown, mix(0.3, 0.55, fract(vSeed * 7.1)));
    albedo = mix(hemp, uGrime, clamp(0.22 + 0.3 * rubbed + 0.2 * smoothstep(0.4, 0.8, tar), 0.0, 0.65));
    albedo *= mix(0.45, 1.05, groove) * mix(0.85, 1.1, fibres);
    albedo = mix(albedo, uGrime, 0.6 * lash) * (1.0 - 0.3 * lash * groove);
    float facing = abs(dot(normal, view));
    albedo += 0.12 * hemp * pow(1.0 - facing, 2.0);
    albedo = mix(albedo, hemp * 0.9, 0.5 * vFray);
    relief = 0.006 * groove * detail;
  } else {
    vec3 p = vShape;
    float rung = vKey * 91.0;
    float grain = valueNoise(vec3(p.x * 4.0, p.y * 70.0 + p.z * 40.0, rung));
    float fine = valueNoise(vec3(p.x * 18.0, p.y * 220.0, p.z * 220.0 + rung));
    float split = valueNoise(vec3(p.x * 2.5, (p.y + p.z) * 30.0, rung + 7.0));
    float crack = 1.0 - smoothstep(0.0, 0.09, abs(split - 0.5));
    vec2 knotAt = vec2(mix(-0.15, 0.15, fract(vKey * 17.0)), 0.0);
    float knot = exp(-dot(p.xy - knotAt, p.xy - knotAt) / 0.0004) * step(0.4, fract(vKey * 23.0));
    vec3 wood = mix(uNewsprintAged, uCableBrown, mix(0.7, 1.0, fract(vKey * 5.3)));
    wood = mix(wood, uGrime, 0.45 + 0.35 * grain) * 0.8;
    float ends = smoothstep(0.17, 0.24, abs(p.x));
    float mould = smoothstep(0.55, 0.8, valueNoise(vec3(p.x * 9.0, p.y * 40.0, rung + 13.0)));
    albedo = wood * mix(0.55, 1.15, fine) * (1.0 - 0.45 * ends) * (1.0 - 0.6 * crack) * (1.0 - 0.5 * knot);
    albedo = mix(albedo, mix(uMoss, uGrime, 0.6), 0.5 * mould);
    relief = (0.004 * grain + 0.002 * fine - 0.005 * crack + 0.003 * knot) * detail;
  }
  albedo = mix(albedo, vec3(dot(albedo, vec3(0.3, 0.59, 0.11))), vPart < 1.5 ? 0.15 : 0.3);
  vec3 shading = bumped(normal, relief);

  float washed = 1.0 - smoothstep(14.0, 40.0, far);
  vec3 light = nightLight(shading, vWorld, 0.9, 0.5)
    + windowWash(vLocal, normal, shading, vTile, vWorld.x - vLocal.x, 0.4) * washed;
  vec3 color = albedo * light;

  float mist = fbm(vec3(vWorld.x * 0.05, (vWorld.y + uClimb) * 0.04, uTime * 0.04));
  float fog = 1.0 - exp(-far * uFogDensity * mix(0.5, 1.7, mist));
  vec3 haze = skyColor(gl_FragCoord.xy, uResolution, uVanish, uBacklights, uTime, uSky, uHaze, uRim);
  vec3 origin = vWorld - vLocal;
  float jitter = ign(gl_FragCoord.xy + floor(uTime * 24.0) * vec2(5.588, 3.17));
  vec3 scatter = windowScatter(cameraPosition - origin, vLocal, vTile, origin, jitter) * washed;
  color = mix(color, haze, fog) + SCATTER * scatter * (1.0 - 0.5 * fog);
  vec3 climbed = vec3(0.0, uClimb, 0.0);
  color = mix(color, haze, clouds(cameraPosition + climbed, vWorld + climbed));
  outColor = vec4(color * uExposure, 1.0);
}
