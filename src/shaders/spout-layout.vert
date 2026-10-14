precision highp float;

uniform float uTileHeight;
uniform float uBay;
uniform float uOuterX;
uniform float uLayoutRows;

#include "chunks/hash.glsl"
#include "chunks/rooms.glsl"
#include "chunks/inset.glsl"
#include "chunks/ducts.glsl"
#include "chunks/spouts.glsl"

in vec2 aTile;
in float aStorey;

flat out vec4 vTexel;

void main() {
  Spout spout = pipeAt(aTile, aStorey);
  follow(spout);
  int texel = gl_VertexID;
  if (texel < PIPE_POINTS) {
    vTexel = spoutTexel(spout, texel);
  } else if (texel < 2 * PIPE_POINTS - 1) {
    vTexel = vec4(routeSegment(texel - PIPE_POINTS), 0.0);
  } else {
    vTexel = vec4(routeTotals(), 0.0, 0.0);
  }
  vec2 at = (vec2(texel, gl_InstanceID) + 0.5) / vec2(2 * PIPE_POINTS, uLayoutRows);
  gl_Position = vec4(at * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}
