precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uPixelSize;
uniform vec3 uBackground;

in vec3 position;
in vec3 color;
in vec3 aLife;
in float aSize;

out vec3 vColor;
out float vAlpha;
out vec2 vPoint;
out float vSize;

void main() {
  float age = (uTime - aLife.x) / aLife.y;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
  gl_PointSize = max(floor(uPixelSize * aSize), 1.0);
  vPoint = position.xy;
  vSize = gl_PointSize / uPixelSize;
  vColor = max(color - uBackground, 0.0);
  float alive = step(0.0, age) * step(age, 1.0);
  vAlpha = alive * smoothstep(0.0, 0.05, age) * pow(1.0 - min(age, 1.0), 1.5) * min(uPixelSize * uPixelSize, 1.0);
}
