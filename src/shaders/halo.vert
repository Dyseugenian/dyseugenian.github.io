precision highp float;

#include "chunks/noise.glsl"

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform sampler2D uDensity;
uniform float uDensityExtent;
uniform float uDensityGain;
uniform float uVariation;
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

in vec2 position;
in vec2 aLife;
in vec3 aLook;

out vec3 vColor;
out float vAlpha;
out float vDash;

const float GOLDEN_ANGLE = 2.39996;

void main() {
  float duration = aLife.y / uDrift;
  float cycle = uTime / duration + aLife.x;
  float age = fract(cycle);
  float radius = mix(uInnerRadius, uOuterRadius, position.x) - uFall * age;
  float angle = position.y + floor(cycle) * GOLDEN_ANGLE
    + uOrbitSpeed * pow(radius, -1.5) * age * duration;

  vec2 orbit = vec2(cos(angle), sin(angle)) * radius;
  float density = texture(uDensity, orbit / (2.0 * uDensityExtent) + 0.5).r;
  float drift = valueNoise(vec3(orbit * 5.0, uTime * 0.15)) - 0.5;
  density = clamp(density * uDensityGain * (1.0 + uVariation * drift * 2.0), 0.0, 1.0);

  vec2 apparent = orbit * vec2(uPupilStretch, 1.0);
  vec2 away = apparent - uPointer;
  float distance = max(length(away), 1e-4);
  float push = uPush * uPushStrength * exp(-distance * distance / (uPushRadius * uPushRadius));
  apparent += away / distance * push;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(apparent, 0.0, 1.0);
  vDash = step(2.5, aLook.x);
  gl_PointSize = aLook.x * uPixelRatio;

  float shown = smoothstep(aLook.y - 0.04, aLook.y + 0.04, density);
  float fade = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.9, 1.0, age));
  float flicker = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * (2.0 + aLook.z) + aLook.z * 7.0));
  float breath = 1.0 + uBreath * sin(uTime * 0.5);

  float tone = fract(aLook.z * 7.31) * density * breath;
  vColor = mix(uDim, mix(uOchre, uHi, tone), smoothstep(0.05, 0.5, density));
  vAlpha = shown * fade * flicker;
}
