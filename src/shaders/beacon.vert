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
  bool shown = mod(aRow + uTilesClimbed, 4.0) < 0.5;
  gl_Position = shown ? projectionMatrix * view : vec4(0.0, 0.0, 2.0, 1.0);
  gl_PointSize = SIZE * projectionMatrix[1][1] * 0.5 * uResolution.y / -view.z;
  vFade = exp(-length(view.xyz) * uFogDensity);
}
