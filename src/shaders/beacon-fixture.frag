precision highp float;

uniform vec3 uGrime;
uniform vec3 uMoon;
uniform vec3 uBeaconColor;
uniform float uBeacon;
uniform float uExposure;

in vec3 vLocal;
in float vGlow;
in float vFade;

out vec4 outColor;

void main() {
  vec3 metal = uGrime + uMoon * 0.3 + uBeaconColor * uBeacon * 2.0 * exp(-length(vLocal) * 5.0);
  vec3 bulb = uBeaconColor * (0.3 + 4.0 * uBeacon);
  outColor = vec4(mix(metal, bulb, vGlow) * vFade * uExposure, 1.0);
}
