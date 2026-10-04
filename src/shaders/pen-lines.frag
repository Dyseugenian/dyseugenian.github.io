precision highp float;

uniform float uMotionTime;
uniform vec3 uOchre;

flat in vec4 vSegment;
in float vAlong;
in float vAlpha;

out vec4 outColor;

float hermite(float p, float startSlope, float endSlope) {
  float p2 = p * p;
  float p3 = p2 * p;
  return (p3 - 2.0 * p2 + p) * startSlope + 3.0 * p2 - 2.0 * p3 + (p3 - p2) * endSlope;
}

void main() {
  float progress = clamp((uMotionTime - vSegment.x) / max(vSegment.y - vSegment.x, 1e-4), 0.0, 1.0);
  float reached = hermite(progress, vSegment.z, vSegment.w);
  if (uMotionTime < vSegment.x || vAlong > reached + 1e-3 || vAlpha <= 0.0) discard;
  outColor = vec4(uOchre, vAlpha);
}
