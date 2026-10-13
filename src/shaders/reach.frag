precision highp float;
precision highp int;

uniform float uMesh;

flat in vec2 vTileId;
#ifndef TRACE
in vec3 vFace;
#endif

out vec4 outColor;

void main() {
#ifdef TRACE
  uint head = (1u << 23u) | (uint(uMesh) << 12u);
#else
  vec3 size = abs(vFace);
  uint face = size.x > size.y && size.x > size.z ? (vFace.x > 0.0 ? 0u : 1u)
    : size.y > size.z ? (vFace.y > 0.0 ? 2u : 3u) : (vFace.z > 0.0 ? 4u : 5u);
  uint head = (uint(uMesh) << 12u) | (face << 9u);
#endif
  uint id = head | (uint(vTileId.x + 3.0) << 6u) | uint(vTileId.y + 2.0);
  outColor = vec4(vec3(float(id & 255u), float((id >> 8u) & 255u), float(id >> 16u)) / 255.0, 1.0);
}
