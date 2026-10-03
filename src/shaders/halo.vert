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
uniform float uSpillFalloff;
uniform float uScatter;
uniform float uTime;
uniform float uPixelRatio;
uniform float uPupilStretch;

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
  vec2 growth = direction * uBottomGrowth * below / (2.0 * uDensityExtent);
  vec3 sampled = max(texture(uDensity, uv).rgb, texture(uDensity, uv + growth).rgb);
  float drift = valueNoise(vec3(orbit * 5.0, uTime * 0.15)) - 0.5;
  float pupilFade = smoothstep(0.0, uPupilFade, sampled.g * uEdgeReach);
  float wobble = valueNoise(vec3(direction * 2.0, uTime * 0.04)) - 0.5
    + 0.5 * (valueNoise(vec3(direction * 6.0 + 31.0, uTime * 0.06)) - 0.5);
  float fromOuterEdge = (sampled.b * 2.0 - 1.0) * uEdgeReach + wobble * uOuterWobble;
  float inside = max(fromOuterEdge, 0.0);
  float outside = max(-fromOuterEdge, 0.0);
  float outerFade = smoothstep(0.0, uOuterFade, inside);
  float density = sampled.r * uDensityGain * (1.0 + uVariation * drift * 2.0);
  density = clamp(density, 0.0, 1.0) * pupilFade * outerFade;

  float spill = (uSpill * above + uSpillBelow * below + uSpillSides * sides) * exp(-outside / uSpillFalloff);
  density = max(density, spill * (1.0 + drift));

  vec2 scatter = vec2(
    valueNoise(vec3(orbit * 3.0, uTime * 0.1 + aLook.z * 10.0)),
    valueNoise(vec3(orbit * 3.0 + 17.0, uTime * 0.1 + aLook.z * 10.0))
  ) - 0.5;
  float nearEdge = 1.0 - smoothstep(0.0, uOuterFade, inside);
  float spread = uScatter * outside + uEdgeScatter * nearEdge;
  vec2 apparent = (orbit + scatter * spread) * vec2(uPupilStretch, 1.0);
  vec2 away = apparent - uPointer;
  float distance = max(length(away), 1e-4);
  float push = uPush * uPushStrength * exp(-distance * distance / (uPushRadius * uPushRadius));
  vec2 outward = normalize(apparent);
  vec2 shove = away / distance * push;
  apparent += shove - outward * min(dot(shove, outward), 0.0);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(apparent, 0.0, 1.0);
  vDash = step(2.5, aLook.x);
  gl_PointSize = aLook.x * uPixelRatio;

  float shown = smoothstep(aLook.y - 0.04, aLook.y + 0.04, density) * pupilFade;
  float fade = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.9, 1.0, age));
  float flicker = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * (2.0 + aLook.z) + aLook.z * 7.0));
  float breath = 1.0 + uBreath * sin(uTime * 0.5);

  float tone = fract(aLook.z * 7.31) * density * breath;
  vColor = mix(uDim, mix(uOchre, uHi, tone), smoothstep(0.05, 0.5, density));
  vAlpha = shown * fade * flicker;
}
