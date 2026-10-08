precision highp float;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
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

const float HALF_PROTRUSION = 0.45;

void main() {
  vec2 tile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  float inset = aProtrudes * HALF_PROTRUSION * mod(floor(abs(tile.x - 0.5)) + tile.y, 2.0);
  float storey = 2.0 * tile.y + mod(abs(tile.x), 2.0) + floor(aMin.y / (0.5 * uTileHeight) + 0.01);
  float plant = step(mod(storey, uPlantEvery), 0.5);
  float shown = aRole < 0.5 ? 1.0 : aRole < 1.5 ? 1.0 - plant : plant;
  vec3 local = position * shown;
  local.z -= inset * step(aMax.z - 1e-3, position.z);

  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vWorld = world.xyz;
  vLocal = local;
  vNormal = mat3(modelMatrix) * normal;
  vKind = aKind;
  vTile = aTile;
  vMin = aMin;
  vMax = aMax - vec3(0.0, 0.0, inset);
  gl_Position = projectionMatrix * viewMatrix * world;
}
