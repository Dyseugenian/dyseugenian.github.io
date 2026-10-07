precision highp float;

uniform sampler2D uLetters;
uniform sampler2D uHealsAt;
uniform float uTime;

in vec3 vColor;
in float vAlpha;
in vec2 vPoint;
in float vSize;

out vec4 outColor;

void main() {
  vec2 point = vPoint + (gl_PointCoord - 0.5) * vec2(1.0, -1.0) * vSize;
  ivec2 cell = ivec2(floor(vec2(point.x, -point.y)));
  ivec2 size = textureSize(uLetters, 0);
  bool inside = all(greaterThanEqual(cell, ivec2(0))) && all(lessThan(cell, size));
  bool intact = uTime >= texelFetch(uHealsAt, cell, 0).r;
  if (inside && intact && texelFetch(uLetters, cell, 0).r > 0.5) discard;
  outColor = vec4(vColor, vAlpha);
}
