precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTilesClimbed;
uniform vec2 uResolution;
uniform float uFogDensity;

in vec3 position;
in float aRow;

out float vFade;

const float SIZE = 1.6;

void main() {
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  float shown = 1.0 - step(0.5, mod(aRow + uTilesClimbed, 4.0));
  gl_Position = projectionMatrix * view;
  gl_PointSize = shown * SIZE * projectionMatrix[1][1] * 0.5 * uResolution.y / -view.z;
  vFade = exp(-length(view.xyz) * uFogDensity);
}
