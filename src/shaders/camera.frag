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
uniform vec3 uAppliance;

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
flat in vec2 vTile;
flat in float vSeed;
flat in float vPart;
in vec3 vBox;
flat in vec3 vSize;

out vec4 outColor;

const float LENS = 0.05;
const float WINDOW_FRAME = 0.016;
const float BLINK = 1.7;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 toCamera = normalize(cameraPosition - vWorld);
  vec3 p = vBox * vSize;
  vec3 extent = 0.5 * vSize;
  bool bracket = vPart < 2.5 || abs(vPart - 4.0) < 0.5;
  bool shell = abs(vPart - 3.0) < 0.5 || (vPart > 4.5 && vPart < 7.5);

  float soot = fbm(vLocal * vec3(5.0, 2.0, 5.0) + vSeed * 13.0);
  float runs = fbm(vec3(vLocal.x * 30.0, vLocal.y * 3.0, vLocal.z * 30.0) + vSeed * 7.0);
  vec3 body = uGrime * 0.7;
  float gloss = 0.05;
  vec3 emission = vec3(0.0);
  if (bracket) {
    float rust = smoothstep(0.45, 0.7, fbm(vLocal * 22.0 + vSeed * 5.0) + 0.2 * runs);
    body = mix(mix(uSalt, uGrime, 0.6) * 0.5, uRust * 0.4, rust);
    gloss = mix(0.1, 0.02, rust);
  } else if (shell) {
    vec3 paint = mix(uAppliance, uSalt, 0.55) * mix(0.5, 0.66, fract(vSeed * 3.1));
    vec3 toEdge = extent - abs(p);
    float under = smoothstep(0.2, -0.6, normal.y);
    float streaks = smoothstep(0.55, 0.85, fbm(vec3(vLocal.x * 9.0, vLocal.y * 1.5, vLocal.z * 9.0) + vSeed * 3.0)) * (1.0 - abs(normal.y));
    body = paint * mix(0.65, 1.0, soot) * (1.0 - 0.3 * streaks) * (1.0 - 0.3 * under);
    body = mix(body, uRust * 0.5, 0.6 * (1.0 - smoothstep(0.0, 0.012, min(min(toEdge.x, toEdge.y), toEdge.z)))
      * smoothstep(0.5, 0.75, valueNoise(p.xz * 90.0 + vSeed)));
    gloss = 0.12;
    if (abs(vPart - 6.0) < 0.5 && vBox.y > 0.49) {
      float droppings = smoothstep(0.72, 0.8, valueNoise(p.xz * 70.0 + vSeed * 9.0)) * smoothstep(0.2, 0.0, abs(p.x) - 0.06);
      body = mix(body * 0.6, uSalt * 0.95, droppings);
    }
    if (abs(vPart - 5.0) < 0.5 && vBox.z > 0.49) {
      vec2 margin = extent.xy - abs(p.xy);
      float glass = smoothstep(WINDOW_FRAME - 0.002, WINDOW_FRAME, min(margin.x, margin.y));
      vec2 iris = p.xy - vec2(0.0, 0.01);
      float barrel = 1.0 - smoothstep(LENS - 0.002, LENS, length(iris));
      float rings = exp(-pow((length(iris) - 0.034) / 0.003, 2.0)) + 0.6 * exp(-pow((length(iris) - 0.016) / 0.003, 2.0));
      vec3 mirrored = reflect(-toCamera, normal);
      float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(toCamera, normal), 0.0), 5.0);
      vec3 sky = mix(uSky * 1.5, uHaze * 2.6, smoothstep(-0.3, 0.7, mirrored.y));
      float film = smoothstep(0.4, 0.8, valueNoise(p.xy * 60.0 + vSeed * 3.0)) + exp(-min(margin.x, margin.y) / 0.02);
      vec3 inside = mix(uGrime * 0.25, vec3(0.003), barrel) + uLampCold * 0.05 * rings;
      emission += glass * (sky * mix(0.25, 1.0, fresnel) * (1.0 - 0.4 * min(film, 1.0)));
      body = mix(body, mix(inside, uGrime * 0.6, 0.3 * min(film, 1.0)), glass);
      gloss = mix(gloss, 1.2, glass);
    }
  } else if (vPart > 7.5 && vPart < 8.5) {
    float lit = step(fract(uTime / BLINK + vSeed * 5.0), 0.12);
    body = uBeaconColor * 0.2;
    emission = uBeaconColor * mix(0.15, 2.5, lit);
  }

  float far = length(vWorld - cameraPosition);
  float washed = 1.0 - smoothstep(14.0, 40.0, far);
  vec3 light = nightLight(normal, vWorld, 1.0, 0.4)
    + windowWash(vLocal, normal, normal, vTile, vWorld.x - vLocal.x, 0.3) * washed;
  vec3 glint = gloss * pow(max(dot(reflect(-toCamera, normal), uLight), 0.0), 24.0) * light;
  vec3 color = body * light + glint + emission;

  float mist = fbm(vec3(vWorld.x * 0.05, (vWorld.y + uClimb) * 0.04, uTime * 0.04));
  float fog = 1.0 - exp(-far * uFogDensity * mix(0.3, 1.0, mist));
  vec3 haze = skyColor(gl_FragCoord.xy, uResolution, uVanish, uBacklights, uTime, uSky, uHaze, uRim);
  color = mix(color, haze, fog);
  vec3 climbed = vec3(0.0, uClimb, 0.0);
  color = mix(color, haze, 0.7 * clouds(cameraPosition + climbed, vWorld + climbed));
  outColor = vec4(color * uExposure, 1.0);
}
