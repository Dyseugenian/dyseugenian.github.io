precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uPixelSize;
uniform float uMotion;
uniform float uMotionTime;

in vec3 position;
in vec2 aAnchor;
in vec3 aTiming;

flat out int vKind;
out float vFilled;
out float vSize;
out float vAlpha;

const float SIZES[3] = float[3](4.0, 2.5, 5.0);

void main() {
  float arrival = aTiming.x;
  float until = aTiming.y;
  int kind = int(aTiming.z + 0.5);
  float t = uMotionTime;
  float grow = kind == 1 ? smoothstep(arrival, arrival + GROW, t) : 1.0;
  vec2 point = aAnchor + (position.xy - aAnchor) * grow;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 0.0, 1.0);
  vSize = max(SIZES[kind] * uPixelSize, 2.0);
  gl_PointSize = vSize;

  float guides = 1.0 - smoothstep(GUIDES_FADE, GUIDES_END, t);
  float shown = step(arrival, t) * step(t, until);
  if (kind == 1) shown *= 1.0 - smoothstep(arrival + LINGER * 0.5, arrival + LINGER, t);
  vKind = kind;
  vFilled = kind == 0 ? 1.0 - step(arrival + LINGER, t) : 1.0;
  vAlpha = shown * guides * uMotion;
}
