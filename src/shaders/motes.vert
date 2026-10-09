precision highp float;

#include "chunks/noise-texture.glsl"
#include "chunks/light.glsl"
#include "chunks/windows.glsl"

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
uniform vec2 uResolution;
uniform float uFogDensity;

in vec3 position;
in vec3 aOffset;
in vec2 aTile;
in float aStorey;
in float aIndex;

out vec2 vCorner;
out vec3 vColor;

const float MOTHS = 3.0;

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vec2 room = roomOf(aTile, aStorey);
  vec3 lamp = windowLight(room, (modelMatrix * vec4(aOffset, 1.0)).x);
  if (dot(lamp, lamp) < 1e-4) return;
  vec3 seed = vec3(hash12(room + aIndex), hash12(room + aIndex + 0.37), hash12(room + aIndex + 0.71));
  bool moth = aIndex < MOTHS;
  if (moth && hash12(room + 281.0) > 0.5) return;

  vec3 local;
  float size;
  float glow;
  if (moth) {
    float t = uTime * mix(0.8, 1.3, seed.x) + seed.y * 40.0;
    local = vec3(
      0.6 * sin(t * 1.3 + seed.z * 6.0) + 0.15 * sin(t * 5.1 + seed.x * 9.0),
      2.6 + 0.4 * sin(t * 1.7 + seed.y * 5.0) + 0.12 * sin(t * 7.3),
      -2.95 + 0.25 * abs(sin(t * 2.3 + seed.z * 3.0)) + 0.1 * abs(sin(t * 9.0))
    );
    size = 0.025;
    glow = mix(0.45, 1.0, abs(sin(t * 38.0 + seed.x * 6.0))) * exp(-(local.z + 3.05) / 0.5);
  } else {
    float drift = uTime * 0.015 * mix(0.5, 1.5, seed.z);
    local = vec3(
      mix(-0.9, 0.9, seed.x) + 0.15 * (valueNoise(vec2(uTime * 0.1, seed.y * 50.0)) - 0.5),
      1.2 + 1.9 * fract(seed.y - drift),
      -3.0 + 1.4 * seed.z * seed.z
    );
    size = 0.004;
    glow = 1.4 * exp(-(local.z + 3.05) / 0.6) * smoothstep(0.6, 0.9, valueNoise(vec2(uTime * 0.6, seed.x * 70.0)));
  }
  local.y += aStorey * 0.5 * uTileHeight;
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  float distance = length(cameraPosition - world.xyz);
  float pixel = 2.0 * distance / (projectionMatrix[1][1] * uResolution.y);
  float drawn = max(size, 1.5 * pixel);
  vColor = lamp * WASH * glow * (size / drawn) * (size / drawn) * exp(-distance * uFogDensity);
  vCorner = position.xy;
  vec4 view = viewMatrix * world;
  view.xy += position.xy * drawn;
  gl_Position = projectionMatrix * view;
}
