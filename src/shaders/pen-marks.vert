precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uPixelSize;
uniform float uMotion;
uniform float uMotionTime;

in vec3 position;
in vec3 aTiming;

flat out int vKind;
out float vFilled;
out float vSize;
out float vAlpha;

const float SIZES[2] = float[2](4.0, 5.0);

void main() {
  float arrival = aTiming.x;
  float until = aTiming.y;
  int kind = int(aTiming.z + 0.5);
  float t = uMotionTime;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
  vSize = max(SIZES[kind] * uPixelSize, 2.0);
  gl_PointSize = vSize;

  float guides = 1.0 - smoothstep(GUIDES_FADE, GUIDES_END, t);
  vKind = kind;
  vFilled = kind == 0 ? 1.0 - step(arrival + LINGER, t) : 1.0;
  vAlpha = step(arrival, t) * step(t, until) * guides * uMotion;
}
