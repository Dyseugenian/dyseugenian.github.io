precision highp float;

in float vKind;

out vec4 outColor;

void main() {
  if (abs(vKind - 3.0) < 0.5 || vKind > 5.5) discard;
  outColor = vec4(0.0);
}
