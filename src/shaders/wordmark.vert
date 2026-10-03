precision highp float;

#include "chunks/noise.glsl"

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uPixelSize;
uniform float uTime;
uniform vec3 uBackground;

in vec3 position;
in vec3 color;
in vec2 aCell;

out vec3 vColor;

float blink(float size, float rate, float chance, float salt) {
  vec2 block = floor(aCell / size);
  float clock = uTime * rate + hash13(vec3(block, salt));
  float pick = hash13(vec3(block, floor(clock) + salt * 17.0));
  float shown = step(1.0 - chance, pick) * step(fract(clock), 0.4);
  float dim = step(0.5, hash13(vec3(block + 3.0, floor(clock) + salt)));
  return shown * (dim * 2.0 - 1.0);
}

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uPixelSize + 2.0;

  float flicker = blink(2.0, 2.3, 0.015, 1.0) + blink(5.0, 1.7, 0.03, 2.0) + blink(11.0, 1.2, 0.05, 3.0);
  flicker = clamp(flicker, -1.0, 1.0);
  vColor = flicker > 0.0
    ? mix(color, uBackground, flicker * 0.85)
    : min(color * (1.0 - flicker * 0.3), 1.0);
}
