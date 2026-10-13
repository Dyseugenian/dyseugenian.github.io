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
uniform vec3 uConcrete;
uniform vec3 uGrime;
uniform vec3 uRust;
uniform vec3 uSalt;
uniform vec3 uMoss;

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
in float vAlong;
in float vRadial;
flat in vec2 vTile;
flat in float vPart;
flat in float vDrips;
in float vRun;
in vec2 vAround;
in vec3 vTangent;
flat in float vLength;
flat in float vClosed;
flat in float vSeed;

uniform float uPresence;

out vec4 outColor;

const float IRON = 0.4;
const float PAINTED = 0.7;
const float GALVANISED = 0.88;
const float JOINT_SPACING = 1.1;
const float SCALE_BUMP = 0.012;
const float WALL_DEPTH = 0.1;

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
  if (uPresence > 0.5) {
    outColor = vec4(1.0);
    return;
  }
  vec3 normal = gl_FrontFacing ? normalize(vNormal) : -normalize(vNormal);
  float inside = !gl_FrontFacing || (vPart == 1.0 && vRadial < 1.0) ? 1.0 : 0.0;
  vec3 toCamera = normalize(cameraPosition - vWorld);
  float seed = vSeed * 97.0 + vTile.x * 13.0;
  vec2 ring = normalize(vAround + vec2(1e-4));
  vec3 surface = vec3(vRun * 6.0, ring * 0.9) + seed;
  float upright = abs(normalize(vTangent).y);

  float blotch = valueNoise(surface * vec3(0.7, 1.5, 1.5));
  float fine = valueNoise(surface * vec3(9.0, 12.0, 12.0));
  float grain = valueNoise(surface * vec3(30.0, 40.0, 40.0));
  float underside = smoothstep(-0.1, -0.85, normal.y);
  float trough = inside * smoothstep(-0.75, -0.97, normalize(vNormal).y);
  float flowing = valueNoise(vec3(mix(vRun * 14.0, 0.0, upright), ring * mix(0.4, 3.0, upright)) + seed + 3.0);
  float runs = smoothstep(0.55, 0.85, flowing) * mix(0.35 + 0.65 * smoothstep(0.4, -0.6, normal.y), 1.0, upright);
  float joint = 0.0;
  if (vPart < 0.5) {
    float spacing = JOINT_SPACING * mix(0.8, 1.3, fract(vSeed * 5.3));
    float toJoint = abs(fract(vRun / spacing + fract(vSeed * 3.1)) - 0.5) * spacing;
    joint = 1.0 - smoothstep(0.015, 0.05, toJoint);
  }
  float atWall = exp(-max(vRun - WALL_DEPTH, 0.0) / 0.12);
  if (vClosed > 0.5) atWall = max(atWall, exp(-max(vLength - WALL_DEPTH - vRun, 0.0) / 0.12));
  float dripping = step(vDrips, 0.5) * (1.0 - vClosed) * mix(0.35, 1.0, vDrips * 2.0);
  float mouth = dripping * smoothstep(0.8, 1.0, vAlong);

  vec3 rust = mix(uRust * 0.25, uRust * mix(0.55, 0.75, fine), smoothstep(0.25, 0.75, blotch)) * mix(0.93, 1.04, grain);
  rust = mix(rust, uGrime, 0.35 + 0.2 * smoothstep(0.4, 0.9, blotch));
  float pits = smoothstep(0.7, 0.92, grain);
  float scale = fine * 0.6 + grain * 0.4;
  float rusting;
  vec3 albedo;
  float height = 0.0;
  float gloss = 0.08;
  if (vSeed < IRON) {
    albedo = rust;
    rusting = 1.0;
    height = scale - 0.5 * pits;
    gloss = 0.04;
  } else if (vSeed < PAINTED) {
    vec3 paint = fract(vSeed * 11.7) < 0.5 ? mix(uGrime, uConcrete, 0.4) : mix(uMoss, uConcrete, 0.45);
    paint = mix(paint, vec3(dot(paint, vec3(0.3, 0.59, 0.11))) * 1.2, 0.65) * mix(0.82, 1.0, blotch);
    float flakes = valueNoise(surface * vec3(1.6, 5.0, 5.0) + 7.0) + 0.3 * underside + 0.4 * joint + 0.25 * atWall;
    flakes += 0.15 * (fine - 0.5);
    rusting = smoothstep(0.64, 0.68, flakes);
    float edge = smoothstep(0.6, 0.64, flakes) * (1.0 - rusting);
    float stain = smoothstep(0.48, 0.64, flakes) * (1.0 - rusting);
    float blisters = stain * smoothstep(0.55, 0.8, fine);
    paint = mix(paint, uRust * 0.5, 0.25 * stain);
    albedo = mix(paint, rust, rusting);
    height = (1.0 - rusting) * 0.6 + 0.5 * edge + 0.5 * blisters + rusting * (scale - 0.5 * pits) * 0.5;
    gloss = mix(0.14, 0.04, rusting);
  } else if (vSeed < GALVANISED) {
    vec3 zinc = mix(uConcrete, uGrime, 0.35) * mix(0.5, 0.62, blotch);
    zinc = mix(zinc, uSalt * 0.7, 0.12 * smoothstep(0.6, 0.9, blotch));
    rusting = smoothstep(0.6, 0.85, valueNoise(surface * vec3(3.0, 4.0, 4.0) + 5.0) + 0.1 * (fine - 0.5)
      + 0.35 * underside + 0.4 * joint + 0.25 * atWall);
    albedo = mix(zinc, rust, rusting);
    height = 0.15 * grain + rusting * (scale - 0.5 * pits);
    gloss = mix(0.12, 0.04, rusting);
  } else {
    albedo = uConcrete * mix(0.55, 0.7, blotch);
    albedo = mix(albedo, uMoss * 0.8, 0.35 * underside * smoothstep(0.35, 0.75, blotch));
    rusting = min(0.5 * joint + 0.35 * atWall, 1.0);
    albedo = mix(albedo, rust, rusting);
    height = 0.5 * grain + 0.3 * fine;
    gloss = 0.05;
  }

  albedo = mix(albedo, uGrime, min(0.35 * underside * (0.5 + 0.5 * blotch) + 0.3 * runs, 0.5));
  albedo = mix(albedo, uRust * 0.4, 0.3 * runs * max(rusting, 0.5 * joint));
  albedo = mix(albedo, uSalt * 0.8, 0.25 * atWall * smoothstep(0.4, 0.8, blotch) * (1.0 - inside));
  albedo = mix(albedo, uSalt * 0.8, 0.25 * mouth * underside * smoothstep(0.4, 0.8, fine));
  albedo *= 1.0 - 0.15 * joint;
  albedo = mix(albedo, vec3(dot(albedo, vec3(0.3, 0.59, 0.11))), 0.3);
  albedo = mix(albedo, rust * 0.55, inside);
  float wet = max(mouth * underside * (1.0 - inside), dripping * trough);
  albedo *= 1.0 - 0.45 * wet;

  float far = length(vWorld - cameraPosition);
  float relief = (height * SCALE_BUMP + joint * 0.006) * (1.0 - smoothstep(6.0, 24.0, far));
  vec3 shading = inside > 0.5 ? normal : bumped(normal, relief);
  float washed = 1.0 - smoothstep(14.0, 40.0, far);
  float bore = mix(1.0, 0.12 + 0.5 * vAlong * vAlong, inside);
  vec3 light = (nightLight(shading, vWorld, 1.0, 0.5)
    + windowWash(vLocal, shading, shading, vTile, 0.3) * washed) * bore;
  float along = vWorld.y + uClimb + vAlong;
  float glints = smoothstep(0.82, 0.97, valueNoise(vec2(ring.x * 25.0 + seed, vRun * 9.0 - uTime * 1.5)));
  vec3 color = albedo * light
    + (gloss + 0.5 * wet) * pow(max(dot(reflect(-toCamera, shading), uLight), 0.0), 18.0) * light
    + dripping * trough * glints * 0.6 * light;

  float mist = fbm(vec3(vWorld.x * 0.05, along * 0.04, uTime * 0.04));
  float fog = 1.0 - exp(-far * uFogDensity * mix(0.5, 1.7, mist));
  vec3 haze = skyColor(gl_FragCoord.xy, uResolution);
  vec3 origin = vWorld - vLocal;
  float jitter = ign(gl_FragCoord.xy + floor(uTime * 24.0) * vec2(5.588, 3.17));
  vec3 scatter = windowScatter(cameraPosition - origin, vLocal, vTile, origin, jitter) * washed
    * mix(0.6, 1.4, hash12(gl_FragCoord.xy + fract(uTime) * 61.0));
  color = mix(color, haze, fog) + SCATTER * scatter * (1.0 - 0.5 * fog);
  vec3 climbed = vec3(0.0, uClimb, 0.0);
  color = mix(color, haze, clouds(cameraPosition + climbed, vWorld + climbed));
  outColor = vec4(color * uExposure, 1.0);
}
