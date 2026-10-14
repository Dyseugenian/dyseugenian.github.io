precision highp float;

#include "chunks/noise-texture.glsl"
#include "chunks/rebar.glsl"
#include "chunks/light.glsl"
#include "chunks/windows.glsl"
#include "chunks/sky.glsl"

uniform vec3 cameraPosition;
uniform vec2 uResolution;
uniform float uExposure;
uniform float uFogDensity;
uniform vec3 uRust;
uniform vec3 uGrime;

in vec3 vWorld;
in vec3 vNormal;
in float vAlong;
in float vKey;
in float vAround;
in vec3 vTangent;
in vec3 vLocal;
flat in vec2 vTile;

out vec4 outColor;

const float RIB_HEIGHT = 0.0025;
const float WRAP = 0.8;

void main() {
  float angle = vAround * 6.2832;
  vec2 ring = vec2(cos(angle), sin(angle));
  float slant = ring.y * sign(ring.x);
  float flakes = valueNoise(vec3(vAlong * 25.0, ring * 0.6 + vKey));
  float detail = (1.0 - smoothstep(0.2, 0.6, fwidth(vAlong) / RIB_PITCH)) * mix(0.3, 1.0, smoothstep(0.25, 0.6, flakes));
  float spine = 1.0 - smoothstep(0.1, 0.3, abs(ring.x));
  float nudge = 0.1 * RIB_PITCH;
  float slope = (rebarRibs(vAlong + nudge, slant) - rebarRibs(vAlong - nudge, slant)) / (2.0 * nudge);
  vec3 normal = normalize(normalize(vNormal) - normalize(vTangent) * slope * RIB_HEIGHT * detail * (1.0 - spine));
  float ridge = detail * max(rebarRibs(vAlong, slant) * (1.0 - spine), spine);

  float scale = valueNoise(vec3(vAlong * 80.0, ring * 1.4 + vKey + 5.0));
  vec3 steel = uRust * mix(0.8, 1.3, flakes) * mix(0.75, 1.15, scale) * mix(0.85, 1.15, ridge);
  steel = mix(steel, uGrime * 1.6, 0.2 * hash12(vec2(vKey, 3.0)));
  float facing = abs(dot(normal, normalize(cameraPosition - vWorld)));
  float distance = length(vWorld - cameraPosition);
  float washed = 1.0 - smoothstep(14.0, 40.0, distance);
  vec3 light = nightLight(normal, vWorld, 1.0, WRAP) + windowWash(vLocal, normal, normal, vTile, 0.5) * washed;
  vec3 color = steel * light * mix(0.8, 1.0, facing);

  float mist = fbm(vec3(vWorld.x * 0.05, (vWorld.y + uClimb) * 0.04, uTime * 0.04));
  float fog = 1.0 - exp(-distance * uFogDensity * mix(0.5, 1.7, mist));
  vec4 sky = skyAt(gl_FragCoord.xy, uResolution);
  vec3 haze = skyClear(sky);
  vec3 origin = vWorld - vLocal;
  float jitter = ign(gl_FragCoord.xy + floor(uTime * 24.0) * vec2(5.588, 3.17));
  vec3 scatter = windowScatter(cameraPosition - origin, vLocal, vTile, origin, jitter) * washed
    * mix(0.6, 1.4, hash12(gl_FragCoord.xy + fract(uTime) * 61.0));
  outColor = vec4((mix(color, haze, fog) + SCATTER * scatter * (1.0 - 0.5 * fog)
    + skyFlash(sky, fog)) * uExposure, 1.0);
}
