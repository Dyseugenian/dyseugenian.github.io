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
uniform vec3 uRust;
uniform vec3 uSalt;
uniform vec3 uConcreteWarm;
uniform vec3 uMoss;

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
flat in vec2 vTile;
flat in float vSeed;
flat in float vPanel;
flat in vec2 vAlong;
in vec3 vBox;
flat in vec3 vSize;

out vec4 outColor;

const float NAIL = 0.005;

float nails(vec2 p, vec2 extent, vec2 down) {
  float rust = 0.0;
  for (int end = 0; end < 2; end++) {
    float side = end == 0 ? -1.0 : 1.0;
    float inset = mix(0.05, 0.11, hash12(vec2(vSeed * 61.0, float(end))));
    for (int row = 0; row < 2; row++) {
      float offset = vSize.y > 0.15 ? (float(row) - 0.5) * 0.5 * vSize.y : 0.0;
      vec2 nail = vec2(side * (extent.x - inset), offset + 0.02 * (hash12(vec2(vSeed * 67.0, float(end * 2 + row))) - 0.5));
      vec2 d = p - nail;
      float below = dot(d, down);
      float beside = abs(dot(d, vec2(-down.y, down.x)));
      float streak = smoothstep(0.012, 0.0, beside - 0.004 * below) * smoothstep(-0.004, 0.01, below) * exp(-below / 0.12);
      rust = max(rust, 0.5 * streak * hash12(vec2(vSeed * 71.0, float(end))));
      rust = max(rust, 2.0 * (1.0 - smoothstep(NAIL - 0.001, NAIL, length(d))));
    }
  }
  return rust;
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 toCamera = normalize(cameraPosition - vWorld);
  vec3 p = vBox * vSize;
  vec3 extent = 0.5 * vSize;
  vec2 down = vec2(-vAlong.y, -vAlong.x);

  float age = fract(vSeed * 3.71);
  vec3 timber = age < 0.2 ? uConcreteWarm * 0.62 : mix(uConcreteWarm * 0.55, uSalt * 0.5, mix(0.4, 0.9, age));
  float figure = fbm(vec3(p.x * 1.5, p.y * 30.0, vSeed * 40.0));
  float grain;
  if (vPanel > 0.5) {
    grain = smoothstep(0.3, 0.7, fbm(vec3(p.x * 2.5 + 3.0 * figure, p.y * 9.0, vSeed * 17.0)));
    timber *= mix(0.85, 1.05, grain);
  } else {
    float rings = abs(fract(p.y * 55.0 + 4.0 * figure + vSeed * 9.0) - 0.5);
    grain = smoothstep(0.08, 0.0, rings) * mix(0.4, 1.0, valueNoise(vec2(p.x * 8.0, p.y * 60.0)));
    timber *= mix(1.0, 0.72, grain);
    vec2 knot = vec2(mix(-0.8, 0.8, fract(vSeed * 13.1)) * extent.x, mix(-0.5, 0.5, fract(vSeed * 29.3)) * extent.y);
    vec2 k = (p.xy - knot) / vec2(0.028, 0.018);
    timber *= mix(0.45, 1.0, smoothstep(0.6, 1.2, length(k))) * mix(1.0, 0.9, exp(-0.15 * dot(k, k)));
  }
  float weathered = fbm(vec3(p.xy * vec2(6.0, 14.0), vSeed * 23.0));
  timber *= mix(0.7, 1.1, weathered);
  float wick = smoothstep(0.4, 1.0, dot(p.xy / max(extent.xy, vec2(1e-3)), down * vec2(0.1, 1.0)) + 0.4 * weathered);
  timber = mix(timber, uGrime * 0.5, 0.45 * wick);
  timber = mix(timber, uMoss * 0.4, 0.25 * smoothstep(0.62, 0.8, fbm(vec3(p.xy * 9.0, vSeed * 5.0))));
  vec3 body = timber;
  if (abs(vBox.x) > 0.49) body *= 0.45;
  else if (abs(vBox.y) > 0.49) body *= vPanel > 0.5 ? mix(0.5, 0.8, step(0.5, fract(p.z * 230.0))) : 0.7;
  else if (vBox.z > 0.49) body = mix(body, uRust * 0.35, min(nails(p.xy, extent.xy, down), 1.0));

  float far = length(vWorld - cameraPosition);
  float washed = 1.0 - smoothstep(14.0, 40.0, far);
  vec3 light = nightLight(normal, vWorld, 0.6, 0.4)
    + windowWash(vLocal, normal, normal, vTile, vWorld.x - vLocal.x, 0.0) * washed;
  vec3 color = body * light + 0.02 * pow(max(dot(reflect(-toCamera, normal), uLight), 0.0), 8.0) * light;

  float mist = fbm(vec3(vWorld.x * 0.05, (vWorld.y + uClimb) * 0.04, uTime * 0.04));
  float fog = 1.0 - exp(-far * uFogDensity * mix(0.3, 1.0, mist));
  vec3 haze = skyColor(gl_FragCoord.xy, uResolution, uVanish, uBacklights, uTime, uSky, uHaze, uRim);
  color = mix(color, haze, fog);
  vec3 climbed = vec3(0.0, uClimb, 0.0);
  color = mix(color, haze, 0.7 * clouds(cameraPosition + climbed, vWorld + climbed));
  outColor = vec4(color * uExposure, 1.0);
}
