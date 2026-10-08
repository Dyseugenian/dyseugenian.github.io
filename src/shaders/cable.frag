precision highp float;

uniform vec3 uGrime;
uniform vec3 uRim;
uniform float uExposure;

in float vFade;

out vec4 outColor;

void main() {
  outColor = vec4((uGrime + uRim * 0.25) * vFade * uExposure, 1.0);
}
