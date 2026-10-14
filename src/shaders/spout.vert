precision highp float;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTileHeight;
uniform float uBay;
uniform float uOuterX;

#include "chunks/hash.glsl"
#include "chunks/rooms.glsl"
#include "chunks/inset.glsl"
#include "chunks/ducts.glsl"
#include "chunks/spouts.glsl"
#include "chunks/presence.glsl"

in vec3 position;
in vec3 normal;
in float aPart;
in vec3 aOffset;
in vec2 aTile;
in float aStorey;

out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;
out float vAlong;
out float vRadial;
flat out vec2 vTile;
flat out float vPart;
flat out float vDrips;
out float vRun;
out vec2 vAround;
out vec3 vTangent;
flat out float vLength;
flat out vec2 vEnds;
flat out float vSeed;
flat out float vPattern;

const float SLEEVE = 0.2;
const float CLAMP_WIDTH = 0.04;
const float CLAMP_THICKNESS = 0.008;
const float STRAP_WIDTH = 0.03;
const float STRAP_EMBED = 0.02;

void hide() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
}

Spout spoutOfInstance() {
#ifdef LAID_OUT
  if (uPresence < 0.5) return laidSpout();
#endif
  return pipeAt(aTile, aStorey);
}

void main() {
  Spout spout = spoutOfInstance();
  if (spout.count < 2) {
    hide();
    return;
  }
  if (uPresence > 0.5) {
    markPresent();
    return;
  }
  follow(spout);
  float total = spoutLength();
  float s;
  vec3 tangent;
  vec3 local;
  vec3 facing;
  if (aPart > 4.5) {
    bool first = mod(aPart - 5.0, 2.0) < 0.5;
    s = first ? spout.supports.x : spout.supports.y;
    if (s < 0.0) {
      hide();
      return;
    }
    float brace = first ? spout.braces.x : spout.braces.y;
    vec3 wall = brace == 0.0 ? vec3(0.0, 0.0, -1.0) : vec3(brace, 0.0, 0.0);
    vec3 centre = spoutCentre(s, tangent);
    vec3 across = normalize(cross(tangent, wall));
    if (aPart < 6.5) {
      mat3 frame = spoutFrame(tangent);
      local = centre + frame * vec3(position.xy * (spout.radius + CLAMP_THICKNESS), position.z * CLAMP_WIDTH);
      facing = frame * normal;
    } else {
      float reach = FLUSH + STRAP_EMBED;
      local = centre + across * position.x * STRAP_WIDTH + wall * (spout.radius + (position.y + 0.5) * reach)
        + tangent * position.z * CLAMP_WIDTH;
      facing = across * normal.x + wall * normal.y + tangent * normal.z;
    }
  } else if (aPart < 0.5) {
    s = spoutRun(position.z);
  } else if (aPart < 1.5) {
    if (spout.source < 0.0) {
      hide();
      return;
    }
    s = spout.source + position.z;
  } else if (aPart < 2.5) {
    if (spout.sink < 0.0) {
      hide();
      return;
    }
    s = (spout.sink > 0.0 ? total - spout.sink + 0.06 : total) + position.z;
  } else {
    float at = aPart < 3.5 ? spout.sleeves.x : spout.sleeves.y;
    if (at < 0.0) {
      hide();
      return;
    }
    s = at + position.z * SLEEVE;
  }
  if (aPart < 4.5) {
    vec3 centre = spoutCentre(s, tangent);
    mat3 frame = spoutFrame(tangent);
    local = centre + frame * vec3(position.xy * spout.radius, 0.0);
    facing = frame * normal;
  }
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vWorld = world.xyz;
  vLocal = local;
  vNormal = mat3(modelMatrix) * facing;
  vAlong = s / total;
  vRadial = length(position.xy);
  vTile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  vPart = aPart;
  vDrips = spout.drips;
  vRun = s;
  vAround = position.xy;
  vTangent = mat3(modelMatrix) * tangent;
  vLength = total;
  vEnds = vec2(spout.source, spout.sink);
  vSeed = spout.seed;
  vPattern = spout.pattern;
  gl_Position = projectionMatrix * viewMatrix * world;
}
