precision highp float;

uniform float uExposure;

in vec2 vCorner;
in vec3 vColor;

out vec4 outColor;

void main() {
  float speck = 1.0 - smoothstep(0.15, 0.5, length(vCorner));
  outColor = vec4(vColor * speck * uExposure, 1.0);
}
