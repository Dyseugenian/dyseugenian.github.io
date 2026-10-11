precision highp float;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
uniform vec2 uResolution;
uniform float uTileHeight;

#include "chunks/hash.glsl"
#include "chunks/rooms.glsl"

in vec3 position;
in vec3 normal;
in vec3 aOffset;
in vec2 aTile;
in float aStorey;
in float aIndex;

out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;
flat out vec2 vTile;
flat out float vSeed;

const float GRILLE_CHANCE = 0.035;
const float HALF_WIDTH = 1.05;
const float BOTTOM = 1.15;
const float HEIGHT = 2.05;
const float GRILLE_Z = -2.97;
const float ROD = 0.016;
const vec2 FLAT = vec2(0.04, 0.006);
const float FIRST_ROD = 7.0;
const float CUT_STUB = 0.07;
const float SPREAD = 0.075;

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vec2 room = roomOf(aTile, aStorey);
  if (plantFloor(room) || glassBlocks(room) || hash12(room + 601.0) > GRILLE_CHANCE) return;
  vec4 pick = vec4(hash12(room + 603.0), hash12(room + 605.0), hash12(room + 607.0), hash12(room + 609.0));
  float base = aStorey * 0.5 * uTileHeight + BOTTOM;
  float inner = HALF_WIDTH - FLAT.x;
  float spacing = mix(0.12, 0.15, pick.x);
  float rods = floor(2.0 * inner / spacing);
  bool squeezed = pick.y < 0.3;
  bool cut = !squeezed && pick.y < 0.45;
  float pair = floor(pick.z * (rods - 1.0));
  float crossbars = squeezed ? 1.0 : 1.0 + floor(pick.w * 2.5);

  vec3 centre;
  vec3 size;
  float bend = 0.0;
  if (aIndex < 1.5) {
    centre = vec3(0.0, base + mix(0.5 * FLAT.x, HEIGHT - 0.5 * FLAT.x, aIndex), GRILLE_Z);
    size = vec3(2.0 * HALF_WIDTH, FLAT.x, FLAT.y);
  } else if (aIndex < 3.5) {
    centre = vec3((2.0 * aIndex - 5.0) * (HALF_WIDTH - 0.5 * FLAT.x), base + 0.5 * HEIGHT, GRILLE_Z);
    size = vec3(FLAT.x, HEIGHT, FLAT.y);
  } else if (aIndex < FIRST_ROD) {
    float bar = aIndex - 4.0;
    if (bar >= crossbars) return;
    float at = squeezed ? 0.8 : (bar + 1.0) / (crossbars + 1.0);
    centre = vec3(0.0, base + at * HEIGHT, GRILLE_Z + FLAT.y);
    size = vec3(2.0 * inner, FLAT.x, FLAT.y);
  } else {
    float rod = aIndex - FIRST_ROD;
    if (rod >= rods) return;
    centre = vec3(-inner + (rod + 0.5) * 2.0 * inner / rods, base + 0.5 * HEIGHT, GRILLE_Z);
    size = vec3(ROD, HEIGHT - 2.0 * FLAT.x, ROD);
    if (cut && rod == pair) {
      centre.y = base + FLAT.x + 0.5 * CUT_STUB;
      size.y = CUT_STUB;
    }
    if (squeezed && (rod == pair || rod == pair + 1.0)) bend = rod == pair ? -SPREAD : SPREAD;
  }
  vec3 toCamera = cameraPosition - (modelMatrix * vec4(centre + aOffset, 1.0)).xyz;
  float pixel = 2.0 * length(toCamera) / (projectionMatrix[1][1] * uResolution.y);
  size = max(size, vec3(1.2 * pixel));
  vec3 local = centre + position * size;
  float height = (local.y - base) / HEIGHT - 0.38;
  local.x += bend * max(1.0 - height * height / 0.09, 0.0);
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vWorld = world.xyz;
  vLocal = local;
  vNormal = mat3(modelMatrix) * normal;
  vTile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  vSeed = hash12(room + 611.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}
