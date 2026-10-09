const float PIER_MIDDLE = -2.1;
const float GAP_MIDDLE = 1.8;
const float BLOCK_TOP = 2.7;
const float BLOCK_FRONT = 0.9;

struct Spout {
  vec3 origin;
  float radius;
  float length;
  float pitch;
  float drips;
  float landing;
};

bool spoutOf(vec2 room, vec2 tile, float storey) {
  vec2 climbed = vec2(tile.x, mod(tile.y + uTilesClimbed, 4096.0));
  return storey > 0.5 && !plantFloor(room) && mod(climbed.x + climbed.y, 2.0) < 0.5
    && tile.x * uBay - 3.15 > -uOuterX + 0.01;
}

Spout spoutAt(vec2 room, vec2 tile) {
  vec2 climbed = vec2(tile.x, mod(tile.y + uTilesClimbed, 4096.0));
  float size = hash12(room + 501.0);
  Spout spout;
  spout.radius = mix(0.19, 0.22, size);
  spout.length = mix(0.5, 0.7, size);
  spout.pitch = mix(0.04, 0.1, hash12(room + 505.0));
  spout.drips = hash12(room + 504.0);
  spout.origin = vec3(PIER_MIDDLE, 0.5 * uTileHeight + GAP_MIDDLE, 0.0);
  spout.landing = BLOCK_FRONT - blockInset(climbed);
  return spout;
}

vec3 spoutTurn(vec3 direction, float pitch) {
  float c = cos(pitch);
  float s = sin(pitch);
  return vec3(direction.x, c * direction.y - s * direction.z, s * direction.y + c * direction.z);
}

vec3 spoutPoint(Spout spout, vec3 unit) {
  return spout.origin + spoutTurn(vec3(unit.xy * spout.radius, unit.z * spout.length), spout.pitch);
}
