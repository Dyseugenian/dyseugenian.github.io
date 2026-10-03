precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 uFrame;
uniform vec3 uCenter;
uniform float uDrop;
uniform float uRadius;
uniform float uHideBehind;
uniform float uSpin;
uniform float uTime;
uniform float uPixelRatio;
uniform vec3 uDim;
uniform vec3 uBright;

in vec3 position;
in vec3 aLook;

out vec3 vColor;
out float vAlpha;

void main() {
  float angle = position.x + uTime * uSpin;
  vec3 center = uCenter - uDrop * uFrame[2];
  vec2 onCircle = vec2(cos(angle), sin(angle)) * (uRadius + position.y);
  vec3 point = center + uFrame * vec3(onCircle, position.z);

  float behind = step(point.z, uCenter.z);
  float covered = behind * (1.0 - smoothstep(uHideBehind - 0.04, uHideBehind + 0.04, distance(point.xy, uCenter.xy)));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 1.0);
  gl_PointSize = aLook.x * uPixelRatio;

  float flicker = 0.85 + 0.15 * sin(uTime * 3.0 + aLook.z * 6.2832);
  vColor = mix(uDim, uBright, aLook.y);
  vAlpha = aLook.y * flicker * (1.0 - covered);
}
