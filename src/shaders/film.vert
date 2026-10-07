precision highp float;

#include "chunks/noise.glsl"

uniform float uTime;
uniform vec2 uResolution;
uniform float uPixelRatio;
uniform float uWarp;

in vec3 position;

out vec2 vWarp;

void main() {
  vec2 pixel = (position.xy * 0.5 + 0.5) * uResolution;
  vec2 uv = pixel / uResolution.y;
  vec2 warp = vec2(
    fbm(vec3(uv * 3.0, uTime * 0.15)),
    fbm(vec3(uv * 3.0 + 9.0, uTime * 0.15))
  ) - 0.5;
  vWarp = warp * uWarp * uPixelRatio / uResolution;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
