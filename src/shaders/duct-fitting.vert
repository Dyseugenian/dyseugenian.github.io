precision highp float;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTileHeight;

#include "chunks/hash.glsl"
#include "chunks/rooms.glsl"
#include "chunks/presence.glsl"
#include "chunks/inset.glsl"
#include "chunks/ducts.glsl"

in vec3 position;
in vec3 normal;
in float aPart;
in vec3 aOffset;
in vec2 aTile;
in float aStorey;
in float aIndex;

out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;
out float vRun;
out vec2 vAround;
out float vGore;
out float vUpright;
flat out vec2 vTile;
flat out float vPart;
flat out float vSeed;

const float BAND = 0.06;
const float ARM = 0.045;

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  Duct duct;
  DuctPiece piece;
  vec2 room = roomOf(aTile, aStorey);
  bool collar = aIndex > 0.5;
  if (!ductPiece(room, aStorey, aIndex > 1.5 ? 1.0 : 0.0, duct, piece)) return;
  if (uPresence > 0.5) {
    markPresent();
    return;
  }
  vec2 tile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  float base = aStorey * 0.5 * uTileHeight;
  bool ending = piece.offset > duct.reach - 0.5;
  vec3 local;
  vec3 bent;
  if (collar) {
    if (piece.offset > 0.5 && !ending) return;
    if (aPart > 0.5 && aPart < 2.5) return;
    vec3 entry = piece.offset < 0.5 ? piece.a : piece.c;
    float size = 1.04 * duct.radius;
    local = aPart < 0.5
      ? vec3(entry.x + position.x * size, entry.y - position.z * size, entry.z + DUCT_WALL + (position.y + 0.5) * 0.08)
      : vec3(entry.xy + position.xy * size, entry.z + DUCT_WALL + 0.01);
    bent = aPart < 0.5 ? vec3(normal.x, -normal.z, 0.0) : normal;
  } else {
    float bracket = base + DUCT_BRACKET;
    if (piece.offset < 0.5 || ending || aStorey > 0.5 || aPart > 2.5) return;
    float size = duct.radius + 0.008;
    float wall = BLOCK_FRONT - blockInset(tile);
    if (aPart < 0.5) {
      local = vec3(duct.x + position.x * size, bracket + position.y * BAND, duct.z + position.z * size);
    } else {
      float side = aPart < 1.5 ? -1.0 : 1.0;
      vec3 centre = vec3(duct.x + side * (size + 0.5 * ARM), bracket, 0.5 * (wall + duct.z));
      local = centre + position * vec3(ARM, BAND, duct.z - wall);
    }
    bent = normal;
  }
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vWorld = world.xyz;
  vLocal = local;
  vNormal = mat3(modelMatrix) * bent;
  vRun = local.y * 3.0 + local.z * 5.0;
  vAround = position.xz;
  vGore = -1.0;
  vUpright = 0.0;
  vTile = tile;
  vPart = aPart + 1.0;
  vSeed = duct.seed;
  gl_Position = projectionMatrix * viewMatrix * world;
}
