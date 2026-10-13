precision highp float;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
uniform vec2 uResolution;
uniform float uTileHeight;

#include "chunks/hash.glsl"
#include "chunks/rooms.glsl"
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
flat out vec2 vTile;
flat out float vSeed;
flat out float vLock;
out vec3 vBox;
flat out vec3 vSize;

const float GRILLE_CHANCE = 0.035;
const float HALF_WIDTH = 1.13;
const float BOTTOM = 1.15;
const float HEIGHT = 2.13;
const float WALL_Z = -2.5;
const float FRAME = 0.04;
const vec2 STRIP = vec2(0.025, 0.004);
const float SLOPE = 1.3;
const float LATTICE = 10.0;
const float FIRST_STRIP = 23.0;
const float GAP = 0.012;
const float STANDOFF = 0.06;
const float LOCK_HEIGHT = 1.05;
const vec3 EYE = vec3(0.008, 0.035, 0.045);
const vec3 PADLOCK = vec3(0.18, 0.15, 0.065);
const float SHACKLE = 0.026;
const float SHACKLE_SPAN = 0.135;
const float SHACKLE_LEG = 0.1;
const float ARC = 6.0;
const float CUT_HEIGHT = 0.45;

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vec2 room = roomOf(aTile, aStorey);
  if (plantFloor(room) || glassBlocks(room) || boarded(room) || hash12(room + 601.0) > GRILLE_CHANCE) return;
  if (uPresence > 0.5) {
    markPresent();
    return;
  }
  vec4 pick = vec4(hash12(room + 603.0), hash12(room + 605.0), hash12(room + 607.0), hash12(room + 609.0));
  float base = aStorey * 0.5 * uTileHeight + BOTTOM;
  float spacing = mix(0.32, 0.4, pick.y);
  float lift = pick.z < 0.25 ? 0.025 : 0.0;
  bool cut = pick.w < 0.3;
  float back = WALL_Z + STANDOFF;
  float front = back + FRAME;
  float lockY = base + LOCK_HEIGHT;
  float bodyTop = lockY - 0.015 - SHACKLE_LEG;
  float hang = front + 0.04;
  float radius = 0.5 * SHACKLE_SPAN;
  float bend = bodyTop + lift + SHACKLE_LEG - radius;

  vec3 centre;
  vec3 size;
  vec2 along = vec2(0.0, 1.0);
  vLock = 0.0;
  if (aIndex < 7.5) {
    float side = aIndex < 3.5 ? -1.0 : 1.0;
    float part = mod(aIndex, 4.0);
    if (part < 1.5) {
      centre = vec3(side * 0.5 * (HALF_WIDTH + GAP), base + mix(0.5 * FRAME, HEIGHT - 0.5 * FRAME, part), back + 0.5 * FRAME);
      size = vec3(HALF_WIDTH - GAP, FRAME, FRAME);
    } else {
      float edge = part < 2.5 ? HALF_WIDTH - 0.5 * FRAME : GAP + 0.5 * FRAME;
      centre = vec3(side * edge, base + 0.5 * HEIGHT, back + 0.5 * FRAME);
      size = vec3(FRAME, HEIGHT, FRAME);
    }
  } else if (aIndex < 11.5) {
    float hinge = aIndex - 8.0;
    float side = hinge < 1.5 ? -1.0 : 1.0;
    centre = vec3(side * (HALF_WIDTH + 0.012), base + mix(0.3, HEIGHT - 0.3, mod(hinge, 2.0)), WALL_Z + 0.5 * (STANDOFF + FRAME));
    size = vec3(0.024, 0.1, STANDOFF + FRAME);
  } else if (aIndex < 13.5) {
    float side = aIndex < 12.5 ? -1.0 : 1.0;
    centre = vec3(side * (GAP + 0.01), lockY, front + 0.5 * EYE.z);
    size = EYE;
  } else if (aIndex < 14.5) {
    vLock = 1.0;
    centre = vec3(0.0, bodyTop - 0.5 * PADLOCK.y, hang);
    size = PADLOCK;
  } else if (aIndex < 16.5) {
    vLock = 1.0;
    float leg = aIndex < 15.5 ? -1.0 : 1.0;
    vLock = 2.0;
    float foot = leg > 0.0 ? bodyTop : bodyTop + lift;
    centre = vec3(leg * radius, 0.5 * (foot + bend), hang);
    size = vec3(SHACKLE, bend - foot, SHACKLE);
  } else if (aIndex < FIRST_STRIP) {
    vLock = 2.0;
    float segment = aIndex - 17.0;
    vec2 a = vec2(cos(3.14159265 * segment / ARC), sin(3.14159265 * segment / ARC)) * radius;
    vec2 b = vec2(cos(3.14159265 * (segment + 1.0) / ARC), sin(3.14159265 * (segment + 1.0) / ARC)) * radius;
    centre = vec3(0.5 * (a + b) + vec2(0.0, bend), hang);
    along = normalize(b - a);
    size = vec3(SHACKLE, distance(a, b) + 0.5 * SHACKLE, SHACKLE);
  } else {
    float strip = aIndex - FIRST_STRIP;
    float leaf = floor(strip / (2.0 * LATTICE));
    float family = mod(floor(strip / LATTICE), 2.0);
    float bar = mod(strip, LATTICE);
    float mirror = family < 0.5 ? 1.0 : -1.0;
    vec2 span = leaf < 0.5 ? vec2(-HALF_WIDTH + FRAME, -GAP - FRAME) : vec2(GAP + FRAME, HALF_WIDTH - FRAME);
    if (mirror < 0.0) span = -span.yx;
    float low = base + FRAME;
    float high = base + HEIGHT - FRAME;
    float c = floor((span.x - (high - low) / SLOPE) / spacing) * spacing + bar * spacing;
    float from = max(low, low + SLOPE * (span.x - c));
    float to = min(high, low + SLOPE * (span.y - c));
    float target = mirror * mix(-0.8, 0.8, fract(pick.w * 7.31));
    if (cut && abs(c - target) < 0.5 * spacing) from = max(from, low + CUT_HEIGHT);
    if (to - from < 0.01) return;
    vec2 a = vec2(mirror * (c + (from - low) / SLOPE), from);
    vec2 b = vec2(mirror * (c + (to - low) / SLOPE), to);
    centre = vec3(0.5 * (a + b), back + 0.01 + family * STRIP.y);
    along = normalize(b - a);
    size = vec3(STRIP.x, distance(a, b), STRIP.y);
  }
  vec3 toCamera = cameraPosition - (modelMatrix * vec4(centre + aOffset, 1.0)).xyz;
  float pixel = 2.0 * length(toCamera) / (projectionMatrix[1][1] * uResolution.y);
  size = max(size, vec3(1.2 * pixel));
  vec2 across = vec2(along.y, -along.x);
  vBox = position;
  vSize = size;
  vec3 local = centre + vec3(across * position.x * size.x + along * position.y * size.y, position.z * size.z);
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vWorld = world.xyz;
  vLocal = local;
  vNormal = mat3(modelMatrix) * vec3(across * normal.x + along * normal.y, normal.z);
  vTile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  vSeed = hash12(room + 611.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}
