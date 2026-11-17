precision highp float;
precision highp int;

in vec3 vColor;
in float vAlpha;

out vec4 outColor;

void main() {
  outColor = vec4(vColor, vAlpha);
}
