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
uniform vec3 uMoss;
uniform vec3 uSalt;
uniform vec3 uGrime;
uniform vec3 uDenim;
uniform vec3 uCoral;

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
in vec3 vShape;
in vec3 vSurface;
flat in float vPart;
flat in vec2 vTile;
flat in float vSeed;

uniform float uPresence;

out vec4 outColor;

const float WRIST = 0.14;
const vec3 EYE = vec3(0.019, 0.213, 0.081);

float featherTips(float across, float count, float depth) {
  float f = fract(across * count) * 2.0 - 1.0;
  return 1.0 - depth * (1.0 - sqrt(max(1.0 - f * f, 0.0)));
}

void main() {
  if (uPresence > 0.5) {
    outColor = vec4(1.0);
    return;
  }
  vec3 normal = normalize(vNormal);
  vec3 toCamera = normalize(cameraPosition - vWorld);
  float breed = fract(vSeed * 17.3);
  vec3 body = mix(mix(uConcrete, uSalt, 0.65), uDenim, 0.1) * mix(0.95, 1.05, fract(vSeed * 5.1));
  vec3 dark = mix(body, uGrime, 0.85);
  vec3 flight = mix(body, uGrime, 0.65);
  float checkered = 0.0;
  float pied = 0.0;
  float barred = 1.0;
  if (breed > 0.9) {
    pied = 1.0;
  } else if (breed > 0.7) {
    body = mix(uConcrete, uGrime, 0.7);
    flight = body * 0.8;
    checkered = 0.6;
    barred = 0.0;
  } else if (breed > 0.55) {
    checkered = 1.0;
    barred = 0.0;
  }
  float clumps = fbm(vShape * vec3(40.0, 55.0, 40.0) + vSeed * 30.0);
  float mottle = mix(0.8, 1.08, clumps) * mix(0.9, 1.04, valueNoise(vShape * 260.0 + vSeed * 13.0));
  float grime = smoothstep(0.5, 0.78, fbm(vShape * 30.0 + vSeed * 21.0) + 0.25 * smoothstep(0.12, 0.03, vShape.y));
  float patches = pied * step(0.55, valueNoise(vShape * 28.0 + vSeed * 9.0));
  vec3 white = uSalt * 0.9;
  vec3 plumage = body * mottle;
  float shine = 0.0;

  if (vPart < 0.5) {
    float head = smoothstep(0.196, 0.208, vShape.y) * smoothstep(0.03, 0.05, vShape.z);
    float neck = smoothstep(0.12, 0.145, vShape.y) * smoothstep(-0.015, 0.02, vShape.z) * (1.0 - head);
    plumage = mix(plumage, body * 0.8 * mottle, neck);
    plumage = mix(plumage, body * 0.82 * mottle, head);
    plumage = mix(plumage, body * 0.9, smoothstep(0.06, 0.03, vShape.y));
    float rump = step(fract(vSeed * 3.7), 0.4) * barred * smoothstep(-0.1, -0.13, vShape.z) * smoothstep(0.09, 0.105, vShape.y);
    plumage = mix(plumage, white, rump * 0.7);
    plumage = mix(plumage, white, patches);
  } else if (vPart < 2.5) {
    plumage = uGrime * 1.2;
  } else if (vPart < 3.5) {
    plumage = uSalt * mix(0.8, 1.0, valueNoise(vShape * 900.0));
  } else if (vPart < 4.5) {
    vec3 eye = EYE * vec3(sign(vShape.x), 1.0, 1.0);
    float gaze = dot(normalize(vShape - eye), vec3(sign(vShape.x), 0.0, 0.0));
    plumage = mix(uSalt * 0.5, mix(uLamp, uBeaconColor, 0.45), smoothstep(0.15, 0.25, gaze));
    plumage = mix(plumage, vec3(0.0), smoothstep(0.86, 0.9, gaze));
    shine = 1.0;
  } else if (vPart < 6.5) {
    vec2 wing = vec2(abs(vShape.x), -vShape.z);
    float spread = vSurface.z;
    float u = vSurface.x;
    float v = vSurface.y;
    float hand = step(WRIST, wing.x);
    vec2 fromWrist = vec2(wing.x - WRIST, wing.y);
    float reach = length(fromWrist);
    float fan = clamp((atan(fromWrist.x, fromWrist.y) - 0.1) / 1.4, 0.0, 1.0) * 10.0;
    float primary = min(floor(fan), 9.0);
    float vane = fract(fan);
    float longest = mix(0.13, 0.215, smoothstep(0.0, 8.0, primary)) - 0.012 * step(8.5, primary);
    float rounded = 1.0 - sqrt(max(1.0 - pow(2.0 * vane - 1.0, 2.0), 0.0));
    float secondary = fract(wing.x / WRIST * 11.0);
    float secondaryTip = 1.0 - 0.08 * (1.0 - sqrt(max(1.0 - pow(2.0 * secondary - 1.0, 2.0), 0.0)));
    if (hand > 0.5) {
      if (reach > longest * (1.0 - 0.07 * rounded)) discard;
      float outward = reach / longest;
      float narrow = mix(0.5, 0.3, smoothstep(0.6, 0.85, outward)) - 0.12 * smoothstep(0.85, 1.0, outward);
      if (abs(vane - 0.5) > mix(0.5, narrow, spread * smoothstep(4.5, 6.5, primary))) discard;
    } else if (v > secondaryTip) {
      discard;
    }
    float along = hand > 0.5 ? reach / longest : v / secondaryTip;
    float split = hand > 0.5 ? vane : secondary;
    float tipped = smoothstep(0.78, 0.9, along);
    float seam = 1.0 - 0.12 * smoothstep(0.08, 0.0, min(split, 1.0 - split)) * smoothstep(0.35, 0.6, along);
    float shaft = 0.05 * smoothstep(0.03, 0.0, abs(split - 0.5)) * smoothstep(0.3, 0.6, along);
    float outer = smoothstep(WRIST - 0.015, WRIST + 0.03, wing.x);
    float coverts = mix(0.42 + 0.06 * featherTips(wing.x / WRIST * 18.0, 1.0, 1.0), 0.32 + 0.04 * featherTips(vane, 2.0, 1.0), outer);
    float covered = 1.0 - smoothstep(coverts - 0.02, coverts, along);
    float vaneEdge = smoothstep(0.22, 0.0, min(split, 1.0 - split)) * smoothstep(0.4, 0.7, along);
    if (vPart < 5.5) {
      float scales = mix(1.03, 1.1, smoothstep(0.2, 0.0, abs(fract(u * 22.0 + 0.5 * floor(v * 9.0)) - 0.5)));
      vec3 feathers = mix(body * 0.97, flight, outer);
      plumage = mix(feathers * seam + shaft * body, body * scales, covered) * mottle;
      float scallop = 0.025 * (1.0 - featherTips(u / 0.39, 14.0, 1.0));
      float slant = v + 0.2 * u / 0.39 + scallop;
      float bars = (smoothstep(0.6, 0.62, slant) * (1.0 - smoothstep(0.65, 0.67, slant))
        + smoothstep(0.76, 0.78, slant) * (1.0 - smoothstep(0.81, 0.83, slant)))
        * smoothstep(0.03, 0.08, u) * (1.0 - hand) * mix(0.8, 1.0, valueNoise(vec2(u * 40.0, v * 9.0)));
      float checks = step(0.45, valueNoise(vec2(u * 60.0, v * 14.0) + vSeed * 11.0)) * step(v, 0.8);
      plumage = mix(plumage, dark, (barred * bars + checkered * checks * 0.8) * (1.0 - hand));
      plumage = mix(plumage, flight * 0.75, tipped * mix(0.45, 0.8, outer));
      plumage = mix(plumage, white, patches * (1.0 - 0.7 * hand));
    } else {
      vec3 feathers = mix(uSalt * 0.84, mix(uSalt, flight, 0.4), outer);
      feathers = mix(feathers, mix(uSalt, flight, 0.7), 0.5 * vaneEdge);
      plumage = mix(feathers * seam + shaft * uSalt, uSalt, covered);
      plumage = mix(plumage, mix(flight, uGrime, 0.3), tipped * mix(0.75, 0.9, outer));
    }
  } else if (vPart < 8.5) {
    float s = vSurface.x;
    float l = vSurface.y;
    float feather = fract(s * 6.0 + 6.0);
    if (l > featherTips(s * 0.5 + 0.5, 12.0, 0.08)) discard;
    plumage = mix(body, flight, vPart < 7.5 ? 0.55 : 0.25) * (vPart < 7.5 ? mottle : 1.0);
    plumage *= 1.0 - 0.1 * smoothstep(0.08, 0.0, min(feather, 1.0 - feather)) * smoothstep(0.2, 0.5, l);
    plumage = mix(plumage, mix(dark, uGrime, 0.5), smoothstep(0.55, 0.59, l) * (1.0 - pied));
    plumage = mix(plumage, white, step(0.84, abs(s)) * barred * (1.0 - smoothstep(0.52, 0.56, l)) * 0.8);
  } else {
    plumage = mix(uCoral * 0.8, uGrime * 1.4, smoothstep(0.8, 1.0, vSurface.x) * step(vShape.y, 0.0045));
  }

  float soiled = vPart < 0.5 || vPart > 4.5 && vPart < 8.5 ? 1.0 : 0.0;
  plumage = mix(plumage, mix(plumage, uGrime, 0.55) * mix(1.0, 1.2, clumps), 0.45 * grime * soiled);

  float distance = length(vWorld - cameraPosition);
  float washed = 1.0 - smoothstep(14.0, 40.0, distance);
  vec3 light = nightLight(normal, vWorld, 1.0, 0.3) + windowWash(vLocal, normal, normal, vTile, 0.3) * washed;
  float glint = shine * pow(max(dot(reflect(-toCamera, normal), uLight), 0.0), 24.0);
  float mist = fbm(vec3(vWorld.x * 0.05, (vWorld.y + uClimb) * 0.04, uTime * 0.04));
  float fog = 1.0 - exp(-distance * uFogDensity * mix(0.5, 1.7, mist));
  vec4 sky = skyAt(gl_FragCoord.xy, uResolution);
  vec3 haze = skyClear(sky);
  vec3 origin = vWorld - vLocal;
  float jitter = ign(gl_FragCoord.xy + floor(uTime * 24.0) * vec2(5.588, 3.17));
  vec3 scatter = windowScatter(cameraPosition - origin, vLocal, vTile, origin, jitter) * washed
    * mix(0.6, 1.4, hash12(gl_FragCoord.xy + fract(uTime) * 61.0));
  vec3 color = mix(plumage * light + glint * light, haze, fog) + SCATTER * scatter * (1.0 - 0.5 * fog);
  vec3 climbed = vec3(0.0, uClimb, 0.0);
  float veil = clouds(cameraPosition + climbed, vWorld + climbed);
  color = mix(color, haze, veil);
  color += skyFlash(sky, 1.0 - (1.0 - fog) * (1.0 - veil));
  outColor = vec4(color * uExposure, 1.0);
}
