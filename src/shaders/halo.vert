precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 uDisc;
uniform float uTime;
uniform float uPixelRatio;

uniform float uInnerRadius;
uniform float uOuterRadius;
uniform float uRadialPower;
uniform float uFallRadius;
uniform float uThickness;
uniform float uLensRadius;

uniform float uOrbitSpeed;
uniform float uDrift;
uniform float uFlicker;
uniform float uBreath;
uniform float uBeaming;
uniform float uBrightness;

uniform vec2 uPointer;
uniform float uPush;
uniform float uPushRadius;
uniform float uPushStrength;

uniform vec3 uDim;
uniform vec3 uOchre;
uniform vec3 uHi;

in vec3 position;
in vec2 aLife;
in vec3 aLook;

out vec3 vColor;
out float vAlpha;

const float GOLDEN_ANGLE = 2.39996;

void main() {
  float startRadius = mix(uInnerRadius, uOuterRadius, pow(position.x, uRadialPower));
  float duration = aLife.y / uDrift;
  float cycle = uTime / duration + aLife.x;
  float age = fract(cycle);
  float radius = mix(startRadius, uFallRadius, age);
  float swept = 2.0 * uOrbitSpeed * duration * (inversesqrt(radius) - inversesqrt(startRadius))
    / (startRadius - uFallRadius);
  float angle = position.y + floor(cycle) * GOLDEN_ANGLE + swept;

  vec3 disc = vec3(cos(angle), sin(angle), position.z * uThickness) * radius;
  vec3 view = uDisc * disc;
  vec3 velocity = uDisc * vec3(-sin(angle), cos(angle), 0.0);

  float impact = max(length(view.xy), 1e-4);
  float lensed = 0.5 * (impact + sqrt(impact * impact + 4.0 * uLensRadius * uLensRadius));
  vec2 apparent = view.xy * (lensed / impact);

  vec2 away = apparent - uPointer;
  float distance = max(length(away), 1e-4);
  float push = uPush * uPushStrength * exp(-distance * distance / (uPushRadius * uPushRadius));
  apparent += away / distance * push;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(apparent, view.z, 1.0);
  gl_PointSize = aLook.x * uPixelRatio;

  float fade = smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.85, 1.0, age));
  float flicker = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * (2.0 + aLook.z) + aLook.z * 7.0));
  float breath = 1.0 + uBreath * sin(uTime * 0.5);
  float beam = 1.0 + uBeaming * velocity.z;
  float glow = uBrightness * aLook.y * fade * flicker * breath * beam;
  float heat = glow * (1.0 - 0.5 * smoothstep(uLensRadius, uLensRadius + 0.7, lensed));

  heat = clamp(heat, 0.0, 1.0);
  vColor = heat < 0.5 ? mix(uDim, uOchre, heat * 2.0) : mix(uOchre, uHi, heat * 2.0 - 1.0);
  vAlpha = clamp(glow, 0.0, 1.0);
}
