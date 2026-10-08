precision highp float;

#include "chunks/noise.glsl"

invariant gl_Position;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uTilesClimbed;
uniform float uTileHeight;
uniform float uPlantEvery;

in vec3 position;
in vec3 normal;
in float aKind;
in vec3 aOffset;
in vec2 aTile;
in vec3 aMin;
in vec3 aMax;
in float aProtrudes;
in float aRole;

out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;
out float vKind;
flat out vec2 vTile;
flat out vec3 vMin;
flat out vec3 vMax;
out vec2 vCloth;

const float HALF_PROTRUSION = 0.45;
const float LINE_SAG = 0.06;
const float LINE_HALF = 1.4;

void main() {
  vec2 tile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  float inset = aProtrudes * HALF_PROTRUSION * mod(floor(abs(tile.x - 0.5)) + tile.y, 2.0);
  float storey = 2.0 * tile.y + mod(abs(tile.x), 2.0) + floor(aMin.y / (0.5 * uTileHeight) + 0.01);
  float plant = step(mod(storey, uPlantEvery), 0.5);
  float laundry = step(3.5, aRole);
  float occasional = step(2.5, aRole) * (1.0 - laundry);
  vec2 room = vec2(tile.x, mod(storey, 8192.0));
  float pick = hash12(room + 223.0);
  float hung = hash12(room + 233.0);
  float chosen = laundry > 0.5 ? step(0.8, hung) : step(0.82, pick);
  float shown = aRole < 0.5 ? 1.0 : aRole < 1.5 ? 1.0 - plant : aRole < 2.5 ? plant : (1.0 - plant) * chosen;
  if (shown < 0.5) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  vec3 shift = vec3(occasional * mix(-0.2, 0.2, fract(pick * 7.13)), 0.0, 0.0);
  float spin = step(abs(aKind - 4.0), 0.5) * uTime * mix(2.0, 5.0, fract(pick * 13.7)) * step(0.15, fract(pick * 3.1));
  mat2 turn = mat2(cos(spin), sin(spin), -sin(spin), cos(spin));
  vec2 hub = 0.5 * (aMin.xy + aMax.xy);
  vec3 local = vec3(hub + turn * (position.xy - hub), position.z) + shift;
  local.z -= inset * step(aMax.z - 1e-3, position.z);
  float hang = aMax.y - position.y;
  float across = position.x - 0.5 * (aMin.x + aMax.x);
  vec3 bent = vec3(turn * normal.xy, normal.z);
  if (laundry > 0.5) {
    float gust = valueNoise(vec2(uTime * 0.35, storey * 0.3 + tile.x * 0.7));
    float flutter = sin(uTime * mix(1.6, 2.6, hash12(room + aMin.x)) + aMin.x * 3.0 + hung * 40.0);
    float swing = 0.3 * (gust - 0.4) + 0.06 * flutter;
    float phase = hung * 20.0 + aMin.x * 7.0;
    float ripple = sin(across * 23.0 + phase) + 0.6 * sin(across * 9.0 - phase);
    float slope = 23.0 * cos(across * 23.0 + phase) + 5.4 * cos(across * 9.0 - phase);
    float pleat = step(0.1, aMax.y - aMin.y) * 0.016 * smoothstep(0.0, 0.3, hang);
    local.z += pleat * ripple + swing * hang;
    local.y -= LINE_SAG * (1.0 - pow(position.x / LINE_HALF, 2.0));
    bent.x -= pleat * slope * normal.z;
    bent.y += swing * normal.z;
  }

  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vWorld = world.xyz;
  vLocal = local;
  vNormal = mat3(modelMatrix) * bent;
  vKind = aKind;
  vTile = aTile;
  vCloth = vec2(across, hang);
  vMin = aMin + shift;
  vMax = aMax + shift - vec3(0.0, 0.0, inset);
  gl_Position = projectionMatrix * viewMatrix * world;
}
