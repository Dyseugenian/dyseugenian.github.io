precision highp float;

uniform float uExposure;

in vec2 vCorner;
in vec3 vColor;

uniform float uPresence;

out vec4 outColor;

void main() {
  if (uPresence > 0.5) {
    outColor = vec4(1.0);
    return;
  }
  float speck = 1.0 - smoothstep(0.15, 0.5, length(vCorner));
  outColor = vec4(vColor * speck * uExposure, 1.0);
}
