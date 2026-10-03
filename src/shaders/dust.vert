precision highp float;

#include "chunks/noise.glsl"

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uPixelSize;
uniform vec3 uBackground;
uniform float uWander;

in vec3 position;
in vec3 color;
in vec3 aLife;

out vec3 vColor;
out float vAlpha;

void main() {
  float age = (uTime - aLife.x) / aLife.y;
  float fade = smoothstep(0.0, 0.3, age) * (1.0 - smoothstep(0.6, 1.0, age));
  float drift = uTime * 0.5 + aLife.z * 10.0;
  vec2 wander = vec2(
    valueNoise(vec3(position.xy * 0.15, drift)),
    valueNoise(vec3(position.xy * 0.15 + 7.0, drift))
  ) - 0.5;
  vec2 point = position.xy + wander * 2.0 * uWander;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 0.0, 1.0);
  gl_PointSize = max(uPixelSize, 1.0);
  vColor = max(color - uBackground, 0.0);
  vAlpha = fade * min(uPixelSize * uPixelSize, 1.0);
}
