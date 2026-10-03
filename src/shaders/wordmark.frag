precision highp float;

uniform float uPixelSize;
uniform vec3 uBackground;

in vec3 vColor;

out vec4 outColor;

void main() {
  vec2 offset = abs(gl_PointCoord - 0.5) * (uPixelSize + 2.0);
  vec2 overlap = max(min(offset + 0.5, uPixelSize * 0.5) - max(offset - 0.5, -uPixelSize * 0.5), 0.0);
  outColor = vec4(max((vColor - uBackground) * SIGN, 0.0), overlap.x * overlap.y);
}
