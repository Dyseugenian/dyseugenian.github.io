precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uMotion;
uniform float uMotionTime;

in vec3 position;
in vec2 aTiming;
in vec3 aSegment;

flat out vec4 vSegment;
out float vAlong;
out float vAlpha;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
  vSegment = vec4(aTiming, aSegment.yz);
  vAlong = aSegment.x;
  vAlpha = (1.0 - smoothstep(GUIDES_FADE, GUIDES_END, uMotionTime)) * uMotion;
}
