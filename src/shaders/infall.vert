precision highp float;

#include "chunks/noise.glsl"

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uPixelRatio;
uniform float uOpacity;
uniform float uStretch;
uniform vec3 uDim;
uniform vec3 uHi;
uniform vec3 uBackground;

in vec3 position;
in vec3 aMotion;
in vec2 aLook;

out vec3 vColor;
out float vAlpha;

const float GOLDEN_ANGLE = 2.39996;

void main() {
  float cycle = uTime / aMotion.x + position.z;
  float age = fract(cycle);
  float start = position.x;
  float end = aMotion.z;
  float radius = end + (start - end) * pow(1.0 - age, 2.0);
  float angle = position.y + floor(cycle) * GOLDEN_ANGLE + aMotion.y * (start / radius - 1.0);

  vec2 wobble = vec2(
    valueNoise(vec3(position.yz * 9.0, uTime * 0.2)),
    valueNoise(vec3(position.yz * 9.0 + 13.0, uTime * 0.2))
  ) - 0.5;
  vec2 point = (vec2(cos(angle), sin(angle)) * radius + wobble * 0.3 * (radius - end) / start)
    * vec2(uStretch, 1.0);

  float closeness = 1.0 - (radius - end) / (start - end);
  float fade = smoothstep(0.0, 0.2, age) * (1.0 - smoothstep(0.8, 1.0, age));
  float brightness = mix(0.5, 1.0, closeness) * mix(0.6, 1.0, aLook.y);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 0.0, 1.0);
  gl_PointSize = max(floor(aLook.x * uPixelRatio), 1.0);
  vColor = max(mix(uDim, uHi, mix(0.3, 1.0, closeness) * aLook.y) - uBackground, 0.0);
  vAlpha = brightness * fade * uOpacity;
}
