precision highp float;

#include "chunks/noise-texture.glsl"
#include "chunks/light.glsl"
#include "chunks/windows.glsl"
#include "chunks/inset.glsl"
#include "chunks/spouts.glsl"

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
const float GRAVITY = 9.8;
const float HANG = 0.5;

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vec2 room = roomOf(aTile, aStorey);
  float drop = aIndex;
  if (!spoutOf(room, aTile, aStorey)) return;
  Spout spout = spoutAt(room, aTile);
  if (spout.drips > 0.5) return;
  vec3 lip = spoutPoint(spout, vec3(0.0, -0.9, 1.0));
  float reach = lip.z < spout.landing ? lip.y - BLOCK_TOP : 3.0;
  vec2 seed = room;
  float period = mix(0.7, 3.5, fract(spout.drips * 13.7));
  float phase = fract(uTime / period + drop / DROPS + hash12(seed + drop + 521.0));
  float falling = max(phase - HANG, 0.0) * period;
  float fall = 0.5 * GRAVITY * falling * falling;
  if (fall > reach) return;
  vec3 center = lip + vec3(0.6 * spout.radius * (hash12(seed + drop * 3.0) - 0.5), -fall, 0.0);
  vec4 middle = modelMatrix * vec4(center + aOffset, 1.0);
  float pixel = 2.0 * length(cameraPosition - middle.xyz) / (projectionMatrix[1][1] * uResolution.y);
  float swell = mix(smoothstep(0.0, HANG, phase), 1.0, step(HANG, phase));
  float width = 0.006 * swell;
  float trail = max(GRAVITY * falling * 0.016, 0.008);
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), cameraPosition - middle.xyz));
  vec3 local = center + side * position.x * max(width, pixel) + vec3(0.0, (position.y + 0.5) * max(trail, pixel), 0.0);
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vec3 toCamera = normalize(cameraPosition - world.xyz);
  vec2 tile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  vLight = (nightLight(toCamera, world.xyz, 1.0, 1.0) + windowWash(local, toCamera, toCamera, tile, world.x - local.x, 1.0))
    * exp(-length(cameraPosition - world.xyz) * uFogDensity);
  vAlpha = min(width / pixel, 1.0) * min(trail / pixel, 1.0);
  vStreak = 0.0;
  vCorner = position.xy;
  vSeed = 0.0;
  gl_Position = projectionMatrix * viewMatrix * world;
}
