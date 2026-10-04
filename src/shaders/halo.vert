precision highp float;

#include "chunks/noise.glsl"

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform sampler2D uDensity;
uniform float uDensityExtent;
uniform float uDensityGain;
uniform float uVariation;
uniform float uEdgeReach;
uniform float uPupilFade;
uniform float uOuterFade;
uniform float uOuterWobble;
uniform float uEdgeScatter;
uniform float uSpill;
uniform float uSpillBelow;
uniform float uSpillSides;
uniform float uBottomGrowth;
uniform float uSideGrowth;
uniform float uTopGrowth;
uniform float uInnerBreak;
uniform float uStrayReach;
uniform float uSpillFalloff;
uniform float uScatter;
uniform float uTime;
uniform float uPixelRatio;
uniform float uPupilStretch;
uniform float uWingLength;
uniform float uWingWidth;
uniform float uWingFlick;
uniform float uWingAngle;

uniform float uInnerRadius;
uniform float uOuterRadius;
uniform float uFall;
uniform float uOrbitSpeed;
uniform float uDrift;
uniform float uFlicker;
uniform float uBreath;

uniform vec2 uPointer;
uniform float uPush;
uniform float uPushRadius;
uniform float uPushStrength;
uniform float uOpacity;

uniform vec3 uDim;
uniform vec3 uOchre;
uniform vec3 uHi;

in vec3 position;
in float aDuration;
in vec3 aLook;

out vec3 vColor;
out float vAlpha;
out float vDash;

const float GOLDEN_ANGLE = 2.39996;

float openings(float around, float cells, float salt) {
  float cell = floor(around * cells);
  float deepest = 0.0;
  for (int k = -2; k <= 2; k++) {
    float index = mod(cell + float(k), cells);
    float clock = uTime * 0.07 + hash13(vec3(index, salt, 1.0));
    float life = sin(3.14159 * fract(clock));
    vec3 seed = vec3(index, floor(clock), salt);
    float present = step(0.45, hash13(seed));
    float center = cell + float(k) + hash13(seed + 1.0);
    float width = mix(0.7, 2.0, hash13(seed + 2.0)) * life;
    float depth = mix(0.15, 1.0, pow(hash13(seed + 3.0), 1.5));
    float across = abs(around * cells - center) / max(width, 1e-3);
    deepest = max(deepest, present * depth * life * pow(max(1.0 - across, 0.0), 1.5));
  }
  return deepest;
}

void main() {
  float duration = aDuration / uDrift;
  float cycle = uTime / duration + position.z;
  float age = fract(cycle);
  float radius = mix(uInnerRadius, uOuterRadius, position.x) - uFall * age;
  float angle = position.y + floor(cycle) * GOLDEN_ANGLE
    + uOrbitSpeed * pow(radius, -1.5) * age * duration;

  vec2 orbit = vec2(cos(angle), sin(angle)) * radius;
  vec2 direction = orbit / radius;
  float above = smoothstep(0.1, 0.6, direction.y);
  float below = smoothstep(0.1, 0.6, -direction.y);
  float sides = 1.0 - above - below;

  vec2 uv = orbit / (2.0 * uDensityExtent) + 0.5;
  vec2 squashed = vec2(orbit.x * (1.0 + uSideGrowth), orbit.y * (1.0 + uBottomGrowth * step(orbit.y, 0.0)));
  vec3 sampled = texture(uDensity, uv).rgb;
  vec3 raised = texture(uDensity, squashed / (2.0 * uDensityExtent) + 0.5).rgb;
  vec2 stretched = vec2(orbit.x, orbit.y / (1.0 + uTopGrowth * step(0.0, orbit.y)));
  vec3 widened = texture(uDensity, stretched / (2.0 * uDensityExtent) + 0.5).rgb;
  float drift = valueNoise(vec3(orbit * 5.0, uTime * 0.15)) - 0.5;
  float around = atan(direction.y, direction.x) / 6.28318 + 0.5;
  float opening = max(openings(around, 29.0, 1.0), 0.6 * openings(around, 61.0, 2.0));
  float pupilFade = smoothstep(0.0, uPupilFade, raised.g * uEdgeReach);
  float cut = smoothstep(0.0, 1.0, 1.0 - raised.g * uEdgeReach / max(opening * uInnerBreak, 1e-4));
  float darkness = mix(0.6, 1.0, valueNoise(vec3(orbit * 7.0, uTime * 0.15)))
    * mix(0.8, 1.0, valueNoise(vec3(orbit * 23.0 + 9.0, uTime * 0.3)));
  float kept = step(min(cut * darkness * 1.125, 1.0), fract(aLook.z * 13.7));
  float wobble = valueNoise(vec3(direction * 2.0, uTime * 0.04)) - 0.5
    + 0.5 * (valueNoise(vec3(direction * 6.0 + 31.0, uTime * 0.06)) - 0.5);
  float fromOuterEdge = (widened.b * 2.0 - 1.0) * uEdgeReach + wobble * uOuterWobble;
  float inside = max(fromOuterEdge, 0.0);
  float outside = max(-fromOuterEdge, 0.0);
  float outerFade = smoothstep(0.0, uOuterFade, inside);
  float density = max(max(sampled.r, raised.r), widened.r) * uDensityGain * (1.0 + uVariation * drift * 2.0);
  density = clamp(density, 0.0, 1.0) * pupilFade * outerFade;

  float spill = (uSpill * above + uSpillBelow * below + uSpillSides * sides) * exp(-outside / uSpillFalloff);
  density = max(density, spill * (1.0 + drift));

  float reach = clamp((radius - 1.4) / uWingLength, 0.0, 1.0);
  float wingAngle = atan(direction.y, abs(direction.x)) - uWingAngle - uWingFlick * reach;
  float halfWidth = uWingWidth * (1.0 - reach) + 1e-3;
  float wing = (1.0 - smoothstep(0.0, halfWidth, abs(wingAngle))) * smoothstep(1.15, 1.45, radius);
  density = max(density, wing * (0.7 + drift) * pow(1.0 - reach, 2.5));

  float nearPupil = raised.g * uEdgeReach;
  float stray = step(0.99, fract(aLook.z * 31.7))
    * smoothstep(0.0, 0.05, nearPupil) * (1.0 - smoothstep(0.2, 0.35, nearPupil));
  float strayReach = uStrayReach * (0.3 + 0.7 * valueNoise(vec3(orbit * 2.0 + aLook.z * 40.0, uTime * 0.2)));
  float strayFade = pow(1.0 - smoothstep(0.0, uStrayReach * 0.8 + 1e-4, strayReach), 2.0);
  float shown = max(smoothstep(aLook.y - 0.04, aLook.y + 0.04, density) * pupilFade * kept, stray * strayFade);
  float fade = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.9, 1.0, age));
  if (shown * fade * uOpacity <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  vec2 scatter = vec2(
    valueNoise(vec3(orbit * 3.0, uTime * 0.1 + aLook.z * 10.0)),
    valueNoise(vec3(orbit * 3.0 + 17.0, uTime * 0.1 + aLook.z * 10.0))
  ) - 0.5;
  float nearEdge = 1.0 - smoothstep(0.0, uOuterFade, inside);
  float spread = uScatter * outside + uEdgeScatter * nearEdge;
  vec2 inward = direction * stray * strayReach;
  vec2 apparent = (orbit - inward + scatter * spread * (1.0 - 0.6 * wing)) * vec2(uPupilStretch, 1.0);

  vec2 away = apparent - uPointer;
  float distance = max(length(away), 1e-4);
  apparent += away / distance * uPush * uPushStrength * exp(-pow(distance / uPushRadius, 8.0));
  float clearing = mix(1.0, smoothstep(0.0, uPushRadius, distance), uPush);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(apparent, 0.0, 1.0);
  vDash = step(2.5, aLook.x);
  gl_PointSize = aLook.x * uPixelRatio;

  float flicker = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * (2.0 + aLook.z) + aLook.z * 7.0));
  float breath = 1.0 + uBreath * sin(uTime * 0.5);

  float tone = fract(aLook.z * 7.31) * density * breath;
  vColor = mix(uDim, mix(uOchre, uHi, tone), smoothstep(0.05, 0.5, density));
  vAlpha = shown * fade * flicker * clearing * uOpacity;
}
