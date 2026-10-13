precision highp float;

#include "chunks/noise-texture.glsl"
#include "chunks/light.glsl"
#include "chunks/windows.glsl"
#include "chunks/presence.glsl"
#include "chunks/inset.glsl"
#include "chunks/ducts.glsl"
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

const float DROPS = 8.0;
const float GRAVITY = 9.8;

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  float drop = aIndex;
  Spout spout = pipeAt(aTile, aStorey);
  if (spout.count < 2 || spout.drips > 0.5) return;
  if (uPresence > 0.5) {
    markPresent();
    return;
  }
  follow(spout);
  vec3 lip = spoutLip(spout.radius);
  float column = floor((lip.x - BLOCK_SPAN.x) / uBay);
  float x = lip.x - column * uBay;
  float shift = (mod(abs(aTile.x + column), 2.0) - mod(abs(aTile.x), 2.0)) * 0.5 * uTileHeight;
  float row = floor((lip.y - shift - BLOCK_TOP) / uTileHeight);
  vec2 below = vec2(aTile.x + column, mod(aTile.y + row + uTilesClimbed, 4096.0));
  float landing = BLOCK_FRONT - blockInset(below);
  bool overBlock = blockless(below) < 0.5 && lip.z < landing && x > BLOCK_SPAN.x && x < BLOCK_SPAN.y;
  float reach = overBlock ? lip.y - shift - BLOCK_TOP - row * uTileHeight : 3.0;
  vec2 room = roomOf(aTile, aStorey);
  vec2 seed = room + PIECE * 37.0;
  float flow = spout.drips * 2.0;
  float count = ceil(mix(1.0, DROPS, flow * flow * flow));
  if (drop >= count) return;
  float gather = mix(5.0, 0.25, flow) * mix(0.8, 1.25, hash12(seed + 523.0));
  float period = gather + sqrt(2.0 * reach / GRAVITY);
  float hang = gather / period;
  float clock = uTime / period + drop / count + hash12(seed + drop + 521.0);
  if (hash12(vec2(floor(clock), drop) + seed * 1.7) < mix(0.55, 0.0, flow)) return;
  float phase = fract(clock);
  float falling = max(phase - hang, 0.0) * period;
  float fall = 0.5 * GRAVITY * falling * falling;
  if (fall > reach) return;
  vec3 center = lip + vec3(0.25 * spout.radius * (hash12(seed + drop * 3.0) - 0.5), -fall, 0.0);
  vec4 middle = modelMatrix * vec4(center + aOffset, 1.0);
  float pixel = 2.0 * length(cameraPosition - middle.xyz) / (projectionMatrix[1][1] * uResolution.y);
  float swell = mix(smoothstep(0.0, hang, phase), 1.0, step(hang, phase));
  float width = 0.006 * swell;
  float trail = max(GRAVITY * falling * 0.016, 0.008);
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), cameraPosition - middle.xyz));
  vec3 local = center + side * position.x * max(width, pixel) + vec3(0.0, (position.y + 0.5) * max(trail, pixel), 0.0);
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vec3 toCamera = normalize(cameraPosition - world.xyz);
  vec2 tile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  vLight = (nightLight(toCamera, world.xyz, 1.0, 1.0) + windowWash(local, toCamera, toCamera, tile, 1.0))
    * exp(-length(cameraPosition - world.xyz) * uFogDensity);
  vAlpha = min(width / pixel, 1.0) * min(trail / pixel, 1.0);
  vStreak = 0.0;
  vCorner = position.xy;
  vSeed = 0.0;
  gl_Position = projectionMatrix * viewMatrix * world;
}
