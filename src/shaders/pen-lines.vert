precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uMotion;
uniform float uMotionTime;

in vec3 position;
in vec3 aTiming;
in vec3 aSegment;

flat out vec4 vSegment;
out float vAlong;
out float vAlpha;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
  vSegment = vec4(aTiming.xy, aSegment.yz);
  vAlong = aSegment.x;
  vAlpha = (1.0 - smoothstep(aTiming.z, aTiming.z + GUIDES_FADE, uMotionTime)) * uMotion;
}
