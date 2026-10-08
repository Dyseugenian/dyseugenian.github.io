precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTileHeight;
uniform float uOuterX;
uniform float uFogDensity;

in vec3 position;
in float aRow;
in float aSide;

out float vFade;

void main() {
  vec3 local = position * vec3(aSide, 1.0, 1.0);
  vec4 view = modelViewMatrix * vec4(vec3(aSide * uOuterX, aRow * uTileHeight, 0.0) + local, 1.0);
  gl_Position = projectionMatrix * view;
  vFade = exp(-length(view.xyz) * uFogDensity);
}
