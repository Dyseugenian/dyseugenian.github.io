precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uTilesClimbed;
uniform float uTileHeight;
uniform float uFogDensity;
uniform vec3 uBeaconSpot;

in vec3 position;
in float aGlow;
in float aRow;
in float aSide;

out vec3 vLocal;
out float vGlow;
out float vFade;

void main() {
  float shown = 1.0 - step(0.5, mod(aRow + uTilesClimbed, 4.0));
  vec3 local = position * vec3(aSide, 1.0, 1.0);
  vec3 spot = vec3(aSide * uBeaconSpot.x, aRow * uTileHeight + uBeaconSpot.y, uBeaconSpot.z);
  vec4 view = modelViewMatrix * vec4(spot + local * shown, 1.0);
  gl_Position = projectionMatrix * view;
  vLocal = local;
  vGlow = aGlow;
  vFade = exp(-length(view.xyz) * uFogDensity);
}
