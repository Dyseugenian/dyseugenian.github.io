precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uMotion;
uniform float uMotionTime;

in vec3 position;
in vec2 aAnchor;
in vec3 aTiming;
in vec3 aSegment;

flat out vec4 vSegment;
out float vAlong;
out float vAlpha;

void main() {
  float start = aTiming.x;
  bool handle = aTiming.z > 0.5;
  float grow = handle ? smoothstep(start, start + GROW, uMotionTime) : 1.0;
  vec2 point = aAnchor + (position.xy - aAnchor) * grow;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 0.0, 1.0);

  float guides = 1.0 - smoothstep(GUIDES_FADE, GUIDES_END, uMotionTime);
  float handleShown = 0.75 * (1.0 - smoothstep(start + LINGER * 0.5, start + LINGER, uMotionTime));
  vSegment = vec4(aTiming.xy, aSegment.yz);
  vAlong = aSegment.x;
  vAlpha = (handle ? handleShown : 1.0) * guides * uMotion;
}
