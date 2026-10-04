precision highp float;

uniform vec3 uOchre;
uniform vec3 uCream;
uniform vec3 uBackground;

flat in int vKind;
in float vFilled;
in float vSize;
in float vAlpha;

out vec4 outColor;

void main() {
  if (vAlpha <= 0.0) discard;
  vec2 offset = (gl_PointCoord - 0.5) * vSize;
  float border = 1.0;
  if (vKind == 0) {
    float edge = max(abs(offset.x), abs(offset.y));
    vec3 color = edge > vSize * 0.5 - border || vFilled > 0.5 ? uOchre : uBackground;
    outColor = vec4(color, vAlpha);
    return;
  }
  float radius = length(offset);
  if (radius > vSize * 0.5) discard;
  outColor = vec4(vKind == 2 ? uCream : uOchre, vAlpha);
}
