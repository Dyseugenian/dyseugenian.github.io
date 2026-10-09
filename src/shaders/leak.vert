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
out vec3 vLight;
out float vAlpha;
out float vStreak;
out float vSeed;

const float DROPS = 3.0;
const float FALL = 3.0;
const float GRAVITY = 9.8;
const float HANG = 0.5;

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vec2 room = roomOf(aTile, aStorey);
  if (!airConditioned(room) || hash12(room + 271.0) > 0.4) return;
  float x = 0.4 + airConditionerShift(room);
  vec3 storey = vec3(0.0, aStorey * 0.5 * uTileHeight, 0.0);
  vec3 local = vec3(x - 0.02, 0.85, -1.295) + storey + vec3(position.xy * vec2(0.2, 0.62), 0.0);
  vAlpha = 1.0;
  vStreak = 1.0;
  if (aIndex > 0.5) {
    float drop = aIndex - 1.0;
    float period = mix(1.4, 3.5, hash12(room + 273.0));
    float phase = fract(uTime / period + drop / DROPS + hash12(room + drop));
    float falling = max(phase - HANG, 0.0) * period;
    float fall = 0.5 * GRAVITY * falling * falling;
    if (fall > FALL) return;
    vec3 center = vec3(x + 0.03 * (hash12(room + drop * 3.0) - 0.5), 0.55 - fall, -1.29) + storey;
    vec4 middle = modelMatrix * vec4(center + aOffset, 1.0);
    float pixel = 2.0 * length(cameraPosition - middle.xyz) / (projectionMatrix[1][1] * uResolution.y);
    float swell = mix(smoothstep(0.0, HANG, phase), 1.0, step(HANG, phase));
    float width = 0.005 * swell;
    float trail = max(GRAVITY * falling * 0.016, 0.008);
    vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), cameraPosition - middle.xyz));
    local = center + side * position.x * max(width, pixel) + vec3(0.0, (position.y + 0.5) * max(trail, pixel), 0.0);
    vAlpha = min(width / pixel, 1.0) * min(trail / pixel, 1.0);
    vStreak = 0.0;
  }
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vec3 toCamera = normalize(cameraPosition - world.xyz);
  vec2 tile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  vLight = (nightLight(toCamera, world.xyz, 1.0, 1.0) + windowWash(local, toCamera, toCamera, tile, world.x - local.x, 1.0))
    * exp(-length(cameraPosition - world.xyz) * uFogDensity);
  vCorner = position.xy;
  vSeed = hash12(room + 277.0) * 40.0;
  gl_Position = projectionMatrix * viewMatrix * world;
}
