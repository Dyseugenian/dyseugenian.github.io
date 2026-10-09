precision highp float;

#include "chunks/noise.glsl"
#include "chunks/inset.glsl"
#include "chunks/rooms.glsl"

invariant gl_Position;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uTileHeight;

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
flat out float vProtrudes;
out vec3 vUnit;
flat out float vTurn;
out vec2 vCloth;
out float vFold;

const float LINE_SAG = 0.06;
const float LINE_HALF = 1.4;

void main() {
  vec2 tile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  vFold = 0.0;
  float inset = aProtrudes * blockInset(tile);
  float storey = 2.0 * tile.y + mod(abs(tile.x), 2.0) + floor(aMin.y / (0.5 * uTileHeight) + 0.01);
  float plant = step(mod(storey, uPlantEvery), 0.5);
  float laundry = step(abs(aRole - 4.0), 0.5);
  float rare = step(4.5, aRole);
  float occasional = step(2.5, aRole) * (1.0 - laundry) * (1.0 - rare);
  float rag = step(abs(aKind - 6.0), 0.5);
  vec2 room = vec2(tile.x, mod(storey, 8192.0));
  float pick = hash12(room + 223.0);
  float hung = hash12(room + 233.0);
  float chosen = rare > 0.5 ? step(aRole > 5.5 ? 0.93 : 0.9, hash12(room + 193.0 + 10.0 * aRole))
    : laundry > 0.5 ? step(0.8, hung) : step(0.82, pick);
  float shown = aRole < 0.5 ? 1.0 : aRole < 1.5 ? 1.0 - plant : aRole < 2.5 ? plant : (1.0 - plant) * chosen;
  if (shown < 0.5) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }
  vec4 mount = occasional > 0.5 ? airConditionerMount(room) : vec4(0.0);
  vec3 shift = vec3(rag * mix(-0.65, 0.65, hash12(room + 247.0)), 0.0, 0.0);
  float spin = step(abs(aKind - 4.0), 0.5) * uTime * mix(2.0, 5.0, fract(pick * 13.7)) * step(0.15, fract(pick * 3.1));
  mat2 turn = mat2(cos(spin), sin(spin), -sin(spin), cos(spin));
  vec2 hub = 0.5 * (aMin.xy + aMax.xy);
  vec3 local = vec3(hub + turn * (position.xy - hub), position.z) + shift;
  local.z -= inset * step(aMax.z - 1e-3, position.z);
  float hang = aMax.y - position.y;
  float across = position.x - 0.5 * (aMin.x + aMax.x);
  vec3 bent = vec3(turn * normal.xy, normal.z);
  float gust = valueNoise(vec2(uTime * 0.35, storey * 0.3 + tile.x * 0.7));
  float flutter = sin(uTime * mix(1.6, 2.6, hash12(room + aMin.x)) + aMin.x * 3.0 + hung * 40.0);
  if (laundry + rag > 0.5) {
    float swing = 0.3 * (gust - 0.4) + 0.06 * flutter;
    swing = mix(swing, 0.02 + 0.6 * abs(swing), rag);
    float phase = hung * 20.0 + aMin.x * 7.0;
    float lag = hang / max(aMax.y - aMin.y, 0.1);
    float spread = 1.0 + 0.9 * lag;
    float fan = across * spread;
    float ripple = sin(fan * 23.0 + phase) + 0.6 * sin(fan * 9.0 - phase) + 0.3 * sin(fan * 41.0 + 2.0 * phase);
    float slope = spread * (23.0 * cos(fan * 23.0 + phase) + 5.4 * cos(fan * 9.0 - phase)
      + 12.3 * cos(fan * 41.0 + 2.0 * phase));
    float pleat = step(0.1, aMax.y - aMin.y) * 0.03 * smoothstep(0.0, 0.25, hang);
    float twist = 0.5 * (valueNoise(vec2(uTime * 0.5, hung * 31.0 + aMin.x * 5.0)) - 0.5);
    float wave = 0.035 * lag * sin(uTime * mix(2.5, 3.5, hung) + phase - 9.0 * hang);
    local.z += pleat * ripple + hang * (swing * mix(0.55, 1.25, lag) + twist * across) + wave;
    local.y -= laundry * LINE_SAG * (1.0 - pow(position.x / LINE_HALF, 2.0));
    bent.x -= (pleat * slope + twist * hang) * normal.z;
    bent.y += (swing * mix(0.55, 2.0, lag) + twist * across) * normal.z;
    vFold = ripple * smoothstep(0.0, 0.25, hang);
  } else if (abs(aKind - 7.0) < 0.5) {
    vec2 reach = 0.5 * (aMax.xy - aMin.xy);
    vec2 at = (position.xy - 0.5 * (aMin.xy + aMax.xy)) / reach;
    vec2 edges = 1.0 - at * at;
    float billow = 0.16 * (gust - 0.3) + 0.025 * flutter;
    local.z += billow * edges.x * edges.y;
    bent.xy += 2.0 * billow * at / reach * edges.yx * normal.z;
  }

  vUnit = local;
  vTurn = mount.w;
  local = mounted(local, mount);
  bent = turnUnit(bent, mount.w);

  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vWorld = world.xyz;
  vLocal = local;
  vNormal = mat3(modelMatrix) * bent;
  vKind = aKind;
  vTile = aTile;
  vCloth = vec2(across, hang);
  vMin = aMin + shift;
  vMax = aMax + shift - vec3(0.0, 0.0, inset);
  vProtrudes = aProtrudes;
  gl_Position = projectionMatrix * viewMatrix * world;
}
