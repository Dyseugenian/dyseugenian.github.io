precision highp float;

uniform vec3 uBeaconColor;
uniform float uBeacon;
uniform float uExposure;

in float vFade;

out vec4 outColor;

void main() {
  float radius = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.06, 0.12, radius);
  float halo = exp(-radius * radius * 10.0) * (1.0 - radius);
  outColor = vec4(uBeaconColor * uBeacon * vFade * (8.0 * core + 1.5 * max(halo, 0.0)) * uExposure, 1.0);
}
