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
uniform vec3 uSalt;
uniform vec3 uMoss;

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
in float vRun;
in vec2 vAround;
in float vGore;
in float vUpright;
flat in vec2 vTile;
flat in float vPart;
flat in float vSeed;

out vec4 outColor;

const float GALVANISED = 0.55;
const float PAINTED = 0.8;
const float SPIRAL_PITCH = 0.137;
const float SCALE_BUMP = 0.012;
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

float ridge(float phase, float width) {
  float d = abs(fract(phase) - 0.5);
  float blur = fwidth(phase);
  return smoothstep(0.5 - width - blur, 0.5 - width * 0.3, d) * (1.0 - smoothstep(0.15, 0.4, blur));
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 toCamera = normalize(cameraPosition - vWorld);
  float seed = vSeed * 97.0 + vTile.x * 13.0;
  bool tube = vPart < 0.5;
  vec2 ring = normalize(vAround + vec2(1e-4));
  float turn = atan(ring.y, ring.x) / TAU;
  float climb = vUpright > 0.5 ? vRun : vUpright < -0.5 ? -vRun : vLocal.y;
  vec3 surface = (tube ? vec3(vRun * 2.5, ring * 0.9) : vLocal * 3.0) + seed;

  float blotch = valueNoise(surface * vec3(0.6, 1.4, 1.4));
  float fine = valueNoise(surface * vec3(8.0, 10.0, 10.0));
  float grain = valueNoise(surface * vec3(30.0, 36.0, 36.0));
  float upward = smoothstep(0.35, 0.9, normal.y);
  float underside = smoothstep(-0.1, -0.85, normal.y);

  float spacing = mix(2.6, 3.1, fract(vSeed * 7.3));
  float lap = vRun / spacing + fract(vSeed * 3.1) - 0.5;
  bool straight = tube && !(vGore > 0.0 && vGore < 1.0);
  float coupling = straight ? 1.0 - smoothstep(0.035, 0.05, abs(fract(lap + 0.5) - 0.5) * spacing) : 0.0;
  float bead = straight ? ridge(lap + 0.045 / spacing, 0.012 / spacing) + ridge(lap - 0.045 / spacing, 0.012 / spacing) : 0.0;
  float seam = straight ? ridge(turn - vRun / SPIRAL_PITCH + 0.5, 0.05) : 0.0;
  float gore = tube && !straight ? ridge(vGore * 4.0 + 0.5, 0.05) : 0.0;
  float joints = max(coupling, gore);
  float belowJoint = (vUpright > 0.0 ? 1.0 - fract(lap) : fract(lap)) * spacing;
  float streaks = valueNoise(vec2(turn * 22.0 + seed, climb * 0.35)) * mix(1.0, 0.0, smoothstep(0.0, 2.2, belowJoint));
  streaks = tube && abs(vUpright) > 0.5 ? smoothstep(0.35, 0.85, streaks) : 0.0;
  float atWall = smoothstep(0.35, 0.0, vLocal.z) * (1.0 - step(0.5, abs(vUpright)));

  vec3 rust = mix(uRust * 0.22, uRust * mix(0.5, 0.7, fine), smoothstep(0.25, 0.75, blotch)) * mix(0.93, 1.04, grain);
  rust = mix(rust, uGrime, 0.35 + 0.2 * smoothstep(0.4, 0.9, blotch));
  float pits = smoothstep(0.7, 0.92, grain);
  float scale = fine * 0.6 + grain * 0.4;
  float exposure = valueNoise(surface * vec3(0.7, 3.0, 3.0) + 5.0) + 0.08 * (fine - 0.5) + 0.3 * underside
    + 0.45 * joints + 0.3 * atWall + 0.25 * streaks;
  float rusting;
  vec3 albedo;
  float height;
  float gloss;
  if (!tube) {
    float flange = step(3.5, vPart);
    albedo = mix(rust, mix(uConcrete, uSalt, 0.3) * mix(0.5, 0.7, blotch), 0.6 * flange * smoothstep(0.35, 0.75, blotch));
    rusting = 1.0;
    height = scale - 0.5 * pits;
    gloss = 0.04;
  } else if (vSeed < GALVANISED) {
    vec3 zinc = mix(uConcrete, uGrime, 0.3) * mix(0.52, 0.64, blotch);
    float spangle = valueNoise(surface * vec3(14.0, 16.0, 16.0) + 2.0);
    zinc *= mix(0.92, 1.06, spangle);
    float bloom = smoothstep(0.55, 0.85, valueNoise(surface * vec3(1.8, 2.4, 2.4) + 9.0)) * (0.6 + 0.4 * fine);
    zinc = mix(zinc, uSalt * 0.62, 0.35 * bloom);
    rusting = smoothstep(0.68, 0.9, exposure);
    albedo = mix(zinc, rust, rusting);
    height = 0.12 * grain + 0.25 * bloom * fine + rusting * (scale - 0.5 * pits);
    gloss = mix(0.1, 0.04, rusting);
  } else if (vSeed < PAINTED) {
    vec3 paint = fract(vSeed * 11.7) < 0.5 ? mix(uConcrete, uSalt, 0.25) : mix(uMoss, uConcrete, 0.55);
    paint = mix(paint, vec3(dot(paint, vec3(0.3, 0.59, 0.11))) * 1.15, 0.6) * mix(0.62, 0.78, blotch);
    float flakes = exposure + 0.12 * (fine - 0.5);
    float bare = smoothstep(0.6, 0.63, flakes);
    rusting = smoothstep(0.72, 0.85, flakes);
    float edge = smoothstep(0.56, 0.6, flakes) * (1.0 - bare);
    vec3 zinc = mix(uConcrete, uGrime, 0.3) * 0.55;
    albedo = mix(mix(paint, zinc, bare), rust, rusting);
    height = (1.0 - bare) * 0.6 + 0.5 * edge + rusting * (scale - 0.5 * pits) * 0.5;
    gloss = mix(0.1, 0.04, bare);
  } else {
    rusting = 1.0 - 0.6 * smoothstep(0.3, 0.1, exposure - 0.35);
    albedo = mix(mix(uConcrete, uGrime, 0.3) * 0.5, rust, rusting);
    height = scale - 0.5 * pits;
    gloss = 0.04;
  }

  albedo = mix(albedo, uGrime, min(0.3 * underside * (0.5 + 0.5 * blotch) + 0.35 * streaks, 0.55));
  albedo = mix(albedo, uRust * 0.35, 0.35 * streaks * smoothstep(0.4, 0.9, exposure));
  albedo = mix(albedo, uGrime * 0.8, 0.5 * upward * (1.0 - step(0.5, abs(vUpright))) * smoothstep(0.3, 0.7, blotch));
  float droppings = upward * smoothstep(0.83, 0.9, valueNoise(surface * vec3(9.0, 11.0, 11.0) + 21.0))
    * (1.0 - step(0.5, abs(vUpright)));
  albedo = mix(albedo, uSalt * 0.75, 0.7 * droppings);
  albedo = mix(albedo, mix(uMoss, uGrime, 0.5), 0.4 * atWall * smoothstep(0.3, 0.7, fine));
  albedo *= 1.0 - 0.18 * joints - 0.1 * seam;
  albedo = mix(albedo, vec3(dot(albedo, vec3(0.3, 0.59, 0.11))), 0.3);

  float far = distance(vWorld, cameraPosition);
  float detail = 1.0 - smoothstep(6.0, 30.0, far);
  float relief = (height * SCALE_BUMP + 0.012 * coupling + 0.005 * (bead + seam + gore)) * detail;
  vec3 shading = bumped(normal, relief);
  float washed = 1.0 - smoothstep(14.0, 40.0, far);
  float occlusion = tube ? mix(0.45, 1.0, smoothstep(-0.8, 0.5, normal.z)) : 0.8;
  vec3 light = nightLight(shading, vWorld, occlusion, 0.5)
    + windowWash(vLocal, shading, shading, vTile, vWorld.x - vLocal.x, 0.3) * washed;
  vec3 color = albedo * light + gloss * pow(max(dot(reflect(-toCamera, shading), uLight), 0.0), 18.0) * light;

  float mist = fbm(vec3(vWorld.x * 0.05, (vWorld.y + uClimb) * 0.04, uTime * 0.04));
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
