precision highp float;

#include "chunks/noise.glsl"

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uPixelSize;
uniform float uOpacity;
uniform float uReach;

in vec3 position;
in vec3 color;
in vec2 aDirection;
in vec3 aLife;

out vec3 vColor;
out float vAlpha;

void main() {
  float cycle = uTime / aLife.x + aLife.y;
  float age = fract(cycle);
  float lap = floor(cycle);
  float reach = uReach * mix(0.3, 1.0, hash13(vec3(aLife.z * 91.0, lap, 1.0)));
  float travel = reach * (1.0 - (1.0 - age) * (1.0 - age));
  vec2 wander = vec2(
    valueNoise(vec3(position.xy * 0.3, uTime * 0.6 + aLife.z * 20.0)),
    valueNoise(vec3(position.xy * 0.3 + 13.0, uTime * 0.6 + aLife.z * 20.0))
  ) - 0.5;
  vec2 point = position.xy + aDirection * travel + wander * 3.0 * age;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 0.0, 1.0);
  gl_PointSize = max(uPixelSize, 1.0);
  vColor = color;
  vAlpha = smoothstep(0.0, 0.08, age) * pow(1.0 - age, 1.5) * uOpacity;
}
