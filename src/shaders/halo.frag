precision highp float;

in vec3 vColor;
in float vAlpha;
in float vDash;

out vec4 outColor;

void main() {
  if (vDash > 0.5 && abs(gl_PointCoord.y - 0.5) > 1.0 / 6.0) discard;
  outColor = vec4(vColor, vAlpha);
}
