precision highp float;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTileHeight;

#include "chunks/hash.glsl"
#include "chunks/rooms.glsl"
#include "chunks/ducts.glsl"
#include "chunks/presence.glsl"

in vec3 position;
in vec3 normal;
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

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  Duct duct;
  DuctPiece piece;
  if (!ductPiece(roomOf(aTile, aStorey), aStorey, aIndex, duct, piece)) return;
  if (uPresence > 0.5) {
    markPresent();
    return;
  }
  float s = ductRun(piece, position.y + 0.5);
  vec3 tangent;
  vec3 centre = ductCentre(piece, s, tangent);
  mat3 frame = ductFrame(tangent);
  vec2 ring = vec2(position.x, -position.z);
  vec3 local = centre + frame * vec3(ring * duct.radius, 0.0);
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vWorld = world.xyz;
  vLocal = local;
  vNormal = mat3(modelMatrix) * (frame * vec3(normal.x, -normal.z, 0.0));
  vRun = piece.start + s;
  vAround = ring;
  bool bends = dot(normalize(piece.b - piece.a), normalize(piece.c - piece.b)) < 0.99;
  vGore = bends ? 3.0 * (position.y + 0.5) - 1.0 : -1.0;
  vUpright = tangent.y;
  vTile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  vPart = 0.0;
  vSeed = duct.seed;
  gl_Position = projectionMatrix * viewMatrix * world;
}
