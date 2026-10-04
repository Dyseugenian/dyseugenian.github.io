precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uPixelRatio;
uniform vec3 uDim;
uniform vec3 uBright;
uniform vec3 uBackground;
uniform vec2 uCenter;
uniform vec2 uKeepOutMin;
uniform vec2 uKeepOutMax;
uniform float uDrift;
uniform float uDepth;

in vec3 position;
in vec4 aStar;

out vec3 vColor;
out float vAlpha;

void main() {
  float age = fract(uTime * uDrift + fract(aStar.z * 7.13));
  vec2 point = uCenter + (position.xy - uCenter) / (1.0 - age * uDepth);
  float fade = smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(0.85, 1.0, age));
  vec2 inside = step(uKeepOutMin, point) * step(point, uKeepOutMax);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 0.0, 1.0);
  gl_PointSize = max(floor(aStar.y * uPixelRatio), 1.0);
  float twinkle = 0.55 + 0.45 * sin(uTime * aStar.w + aStar.z);
  vColor = max(mix(uDim, uBright, aStar.x) - uBackground, 0.0);
  vAlpha = aStar.x * twinkle * fade * (1.0 - inside.x * inside.y);
}
