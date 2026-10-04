precision highp float;

#include "chunks/noise.glsl"

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uPixelSize;
uniform vec3 uBackground;

in vec3 position;
in vec3 color;
in vec2 aVelocity;
in vec3 aLife;

out vec3 vColor;
out float vAlpha;

void main() {
  float since = uTime - aLife.x;
  float age = since / aLife.y;
  float travel = DRAG * (1.0 - exp(-since / DRAG));
  vec2 wander = vec2(
    valueNoise(vec3(position.xy * 0.2, uTime * 0.8 + aLife.z * 20.0)),
    valueNoise(vec3(position.xy * 0.2 + 11.0, uTime * 0.8 + aLife.z * 20.0))
  ) - 0.5;
  vec2 point = position.xy + aVelocity * travel + wander * 4.0 * age - vec2(0.0, 0.5 * GRAVITY * since * since);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 0.0, 1.0);
  gl_PointSize = max(uPixelSize, 1.0);
  vColor = max(color - uBackground, 0.0);
  float alive = step(0.0, age) * step(age, 1.0);
  vAlpha = alive * smoothstep(0.0, 0.05, age) * pow(1.0 - min(age, 1.0), 1.5) * min(uPixelSize * uPixelSize, 1.0);
}
