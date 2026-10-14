uniform float uClimb;
uniform float uTileHeight;
uniform vec3 uNight;
uniform vec3 uMoon;
uniform vec3 uLight;
uniform vec3 uBeaconColor;
uniform float uBeacon;
uniform vec3 uBeaconSpot;
uniform vec3 uSpot;
uniform vec3 uSpotColor;

const float NIGHT_SKY = 2.0;
const float MOONLIGHT = 0.9;
const float BEACON_LIGHT = 3.0;
const vec3 SPOT_AIM = vec3(0.0, 0.99, -0.14);
const vec2 SPOT_CONE = vec2(0.9, 0.985);
const float SPOT_LIGHT = 9.0;
const float SPOT_FALLOFF = 10.0;

float lit(vec3 shading, vec3 toLight, float wrap) {
  return max((dot(shading, toLight) + wrap) / (1.0 + wrap), 0.0);
}

vec3 nightLight(vec3 shading, vec3 world, float occlusion, float wrap) {
  float skyLight = mix(0.12, 0.9, shading.y * 0.5 + 0.5);
  float key = lit(shading, uLight, wrap);
  vec3 light = uNight * NIGHT_SKY * skyLight * occlusion
    + uMoon * MOONLIGHT * key * mix(0.3, 1.0, occlusion);
  float spacing = 4.0 * uTileHeight;
  float beaconY = floor((world.y + uClimb - uBeaconSpot.y) / spacing + 0.5) * spacing + uBeaconSpot.y - uClimb;
  vec3 toBeacon = vec3(sign(world.x) * uBeaconSpot.x, beaconY, uBeaconSpot.z) - world;
  float beaconReach = length(toBeacon);
  light += uBeaconColor * uBeacon * BEACON_LIGHT * lit(shading, toBeacon / beaconReach, wrap)
    / (1.0 + 3.0 * beaconReach * beaconReach) * mix(0.4, 1.0, occlusion);
  vec3 toSpot = uSpot - world;
  float spotReach = length(toSpot);
  float cone = smoothstep(SPOT_CONE.x, SPOT_CONE.y, dot(-toSpot / spotReach, normalize(SPOT_AIM)));
  light += uSpotColor * SPOT_LIGHT * cone * lit(shading, toSpot / spotReach, wrap)
    / (1.0 + pow(spotReach / SPOT_FALLOFF, 4.0)) * mix(0.3, 1.0, occlusion);
  return light;
}
