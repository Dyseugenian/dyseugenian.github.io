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

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
flat in vec2 vTile;
flat in float vSeed;
flat in float vLock;
in vec3 vBox;
flat in vec3 vSize;

uniform float uPresence;

out vec4 outColor;

void main() {
  if (uPresence > 0.5) {
    outColor = vec4(1.0);
    return;
  }
  vec3 normal = normalize(vNormal);
  vec3 toCamera = normalize(cameraPosition - vWorld);
  float soot = fbm(vLocal * vec3(3.0, 1.2, 3.0) + vSeed * 13.0);
  float runs = fbm(vec3(vLocal.x * 40.0, vLocal.y * 2.5, vLocal.z * 40.0) + vSeed * 7.0);
  float blotch = fbm(vLocal * 9.0 + vSeed * 31.0);
  float decay = blotch * 0.8 + runs * 0.35 + 0.25 * max(-normal.y, 0.0);
  float threshold = mix(0.55, 0.32, vSeed);
  float rusting = smoothstep(threshold, threshold + 0.12, decay);
  float flaking = smoothstep(threshold - 0.06, threshold, decay) * (1.0 - rusting);
  vec3 scale = mix(mix(uConcrete, uGrime, 0.6) * 0.5, mix(uRust, uConcrete, 0.4) * 0.3, smoothstep(0.35, 0.7, fbm(vLocal * 35.0 + vSeed * 5.0)));
  vec3 paint = mix(uConcrete, uGrime, mix(0.35, 0.55, fract(vSeed * 5.3))) * 0.55;
  paint = mix(paint, paint * 1.35, 0.6 * flaking);
  vec3 body = mix(paint, scale, rusting) * mix(0.6, 1.0, soot);
  float far = length(vWorld - cameraPosition);
  float washed = 1.0 - smoothstep(14.0, 40.0, far);
  vec3 light = nightLight(normal, vWorld, 1.0, 0.6)
    + windowWash(vLocal, normal, normal, vTile, 0.25) * washed;
  float gloss = mix(0.06, 0.01, rusting);
  if (vLock > 1.5) {
    float pitting = smoothstep(0.5, 0.8, fbm(vLocal * 60.0 + vSeed * 17.0));
    body = mix(uSalt * 0.5, uRust * 0.3, 0.6 * pitting);
    gloss = mix(0.7, 0.1, pitting);
  } else if (vLock > 0.5) {
    vec3 p = vBox * vSize;
    vec3 extent = 0.5 * vSize;
    float plate = vSize.y / 9.0;
    float layer = floor((p.y + extent.y) / plate);
    float seam = abs(fract((p.y + extent.y) / plate + 0.5) - 0.5) * plate;
    float groove = (1.0 - smoothstep(0.0006, 0.0018, seam)) * step(abs(vBox.y), 0.49);
    vec3 toEdge = extent - abs(p) + step(0.49, abs(vBox));
    float worn = 1.0 - smoothstep(0.001, 0.005, min(min(toEdge.x, toEdge.y), toEdge.z));
    float bloom = smoothstep(0.45, 0.75, fbm(p * 70.0 + vSeed * 23.0));
    vec3 steel = uSalt * mix(0.32, 0.4, fract(layer * 0.618 + vSeed));
    body = mix(steel, uRust * 0.3, max(0.7 * groove, 0.5 * bloom));
    gloss = mix(0.4, 0.08, bloom);
    if (vBox.z > 0.49) {
      vec2 face = p.xy;
      vec2 rivet = extent.xy - vec2(0.018, 0.016);
      float stud = length(abs(face) - rivet);
      float boss = length(face - vec2(0.0, -0.025));
      float slot = min(length(face - vec2(0.0, -0.02)) - 0.006,
        max(abs(face.x) - 0.0025, abs(face.y + 0.033) - 0.011));
      body = mix(body, uSalt * 0.6, (1.0 - smoothstep(0.005, 0.007, stud)));
      body = mix(body, uSalt * 0.15, (1.0 - smoothstep(0.007, 0.009, stud)) * smoothstep(0.005, 0.007, stud));
      body = mix(body, mix(uLampSoft, uRust, 0.4) * 0.45, 1.0 - smoothstep(0.022, 0.024, boss));
      body = mix(body, uGrime * 0.1, 1.0 - smoothstep(0.0, 0.001, slot));
      gloss = mix(gloss, 0.6, 1.0 - smoothstep(0.022, 0.024, boss));
    }
    body = mix(body, uSalt * 0.65, 0.7 * worn * (1.0 - bloom));
  }
  vec3 color = body * light + gloss * pow(max(dot(reflect(-toCamera, normal), uLight), 0.0), 16.0) * light;

  float mist = fbm(vec3(vWorld.x * 0.05, (vWorld.y + uClimb) * 0.04, uTime * 0.04));
  float fog = 1.0 - exp(-far * uFogDensity * mix(0.3, 1.0, mist));
  vec4 sky = skyAt(gl_FragCoord.xy, uResolution);
  vec3 haze = skyClear(sky);
  color = mix(color, haze, fog);
  vec3 climbed = vec3(0.0, uClimb, 0.0);
  float veil = 0.7 * clouds(cameraPosition + climbed, vWorld + climbed);
  color = mix(color, haze, veil);
  color += skyFlash(sky, 1.0 - (1.0 - fog) * (1.0 - veil));
  vec3 origin = vWorld - vLocal;
  float jitter = ign(gl_FragCoord.xy + floor(uTime * 24.0) * vec2(5.588, 3.17));
  vec3 scatter = windowScatter(cameraPosition - origin, vLocal, vTile, origin, jitter) * washed
    * mix(0.6, 1.4, hash12(gl_FragCoord.xy + fract(uTime) * 61.0));
  outColor = vec4((color + 0.5 * SCATTER * scatter * (1.0 - 0.5 * fog)) * uExposure, 1.0);
}
