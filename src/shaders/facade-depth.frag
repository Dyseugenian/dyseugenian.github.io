precision highp float;

in float vKind;

out OUTPUT outColor;

void main() {
  if (abs(vKind - 3.0) < 0.5 || vKind > 5.5) discard;
  outColor = OUTPUT(0);
}
