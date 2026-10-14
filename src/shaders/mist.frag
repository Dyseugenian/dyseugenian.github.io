precision highp float;

#include "chunks/noise-texture.glsl"
#include "chunks/lowres.glsl"
#include "chunks/light.glsl"

uniform float uTime;
uniform float uExposure;
uniform vec2 uMistSize;
uniform vec3 uViewer;
uniform mat4 uViewToWorld;
uniform mat4 uClipToView;
uniform vec4 uGaze;
uniform vec3 uOchre;
uniform vec3 uHaze;
uniform vec3 uRim;

out vec4 outColor;

const int STEPS = 8;
const vec2 MIST_RANGE = vec2(1.0, 25.0);
const float MIST_DENSITY = 0.02;
const vec3 WIND = vec3(-0.35, 0.06, 0.04);
const float MIST_AMBIENT = 0.7;
const float MIST_MOON = 0.5;
const float MIST_SPOT = 3.5;
const float MIST_BEACON = 3.0;
const float GAZE_LIGHT = 1.0;
const float GAZE_REACH = 2.4;
const float GAZE_BREATH = 6.0;

float mistDensity(vec3 p) {
  vec3 q = vec3(p.x, p.y + uClimb, p.z);
  float banks = smoothstep(0.35, 0.8, valueNoise(vec3(7.0, q.y * 0.03, uTime * 0.012)));
  vec3 drift = q - WIND * uTime;
  float curl = valueNoise(drift * vec3(0.12, 0.07, 0.12) + 31.0);
  float body = fbm(drift * vec3(0.24, 0.13, 0.24) + vec3(0.0, 0.0, 2.5 * curl));
  float wisps = smoothstep(0.48, 0.8, body);
  return MIST_DENSITY * mix(0.08, 1.0, banks) * (0.04 + 2.0 * wisps * wisps);
}

vec3 mistLight(vec3 p, vec3 direction, float gaze) {
  float forward = 0.5 + 0.5 * dot(direction, uLight);
  vec3 light = uHaze * MIST_AMBIENT + uRim * MIST_MOON * (0.4 + forward * forward * 1.6);
  vec3 toSpot = uSpot - p;
  float spotReach = length(toSpot);
  float cone = smoothstep(SPOT_CONE.x, SPOT_CONE.y, dot(-toSpot / spotReach, normalize(SPOT_AIM)));
  light += uSpotColor * MIST_SPOT * cone / (1.0 + pow(spotReach / SPOT_FALLOFF, 4.0));
  float spacing = 4.0 * uTileHeight;
  float beaconY = floor((p.y + uClimb - uBeaconSpot.y) / spacing + 0.5) * spacing + uBeaconSpot.y - uClimb;
  vec3 toBeacon = vec3(sign(p.x) * uBeaconSpot.x, beaconY, uBeaconSpot.z) - p;
  light += uBeaconColor * uBeacon * MIST_BEACON / (1.0 + 2.0 * dot(toBeacon, toBeacon));
  return light + uOchre * gaze;
}

float gazeGlow(vec2 uv) {
  vec2 across = (uv - uGaze.xy) * vec2(uMistSize.x / uMistSize.y, 1.0);
  float reach = length(across) / max(uGaze.z, 1e-4);
  float breath = 0.8 + 0.2 * sin(uTime * 6.2832 / GAZE_BREATH);
  return uGaze.w * GAZE_LIGHT * breath * exp(-pow(max(reach - 0.8, 0.0) / GAZE_REACH, 1.5))
    * smoothstep(0.6, 1.1, reach);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uMistSize;
  vec4 view = uClipToView * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 ray = normalize(view.xyz / view.w);
  float depth = viewDepth(texelFetch(uLowDepth, ivec2(gl_FragCoord.xy), 0).r);
  float reach = clamp(depth / -ray.z, MIST_RANGE.x * 1.5, MIST_RANGE.y);
  vec3 direction = mat3(uViewToWorld) * ray;
  float gaze = gazeGlow(uv);
  float jitter = ign(gl_FragCoord.xy + mod(floor(uTime * 24.0), 64.0) * vec2(5.588, 3.17));

  vec3 light = vec3(0.0);
  float clear = 1.0;
  float near = MIST_RANGE.x;
  for (int i = 0; i < STEPS; i++) {
    float far = MIST_RANGE.x * pow(reach / MIST_RANGE.x, (float(i) + 1.0 - 0.5 * jitter) / float(STEPS));
    vec3 p = uViewer + direction * far;
    float absorbed = 1.0 - exp(-mistDensity(p) * (far - near));
    light += clear * absorbed * mistLight(p, direction, gaze);
    clear *= 1.0 - absorbed;
    near = far;
  }
  outColor = vec4(light * uExposure, 1.0 - clear);
}
