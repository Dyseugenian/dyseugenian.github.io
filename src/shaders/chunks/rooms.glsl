uniform float uTilesClimbed;
uniform float uPlantEvery;

vec2 roomOf(vec2 tile, float storey) {
  return vec2(tile.x, mod(2.0 * mod(tile.y + uTilesClimbed, 4096.0) + storey + mod(abs(tile.x), 2.0), 8192.0));
}

const float BLOCK_CLEARANCE = 3.0;

bool plantFloor(vec2 room) {
  return mod(room.y, uPlantEvery) < 0.5;
}

bool nearPlantFloor(float storey) {
  float above = mod(storey, uPlantEvery);
  return min(above, uPlantEvery - above) < BLOCK_CLEARANCE + 0.5;
}

bool glassBlocks(vec2 room) {
  return !plantFloor(room) && hash12(room + 811.0) < 0.06;
}

bool sheeted(vec2 room) {
  return !plantFloor(room) && hash12(room + 253.0) >= 0.93;
}

bool boarded(vec2 room) {
  return !plantFloor(room) && !glassBlocks(room) && !sheeted(room) && hash12(room + 701.0) < 0.05;
}

bool grilled(vec2 room) {
  return !plantFloor(room) && !glassBlocks(room) && !boarded(room) && hash12(room + 601.0) <= 0.035;
}

bool papered(vec2 room) {
  return hash12(room + 149.0) > 0.94;
}

bool airConditioned(vec2 room) {
  return !plantFloor(room) && hash12(room + 223.0) >= 0.82;
}

float airConditionerShift(vec2 room) {
  return mix(-0.2, 0.2, fract(hash12(room + 223.0) * 7.13));
}

const vec3 UNIT_BASE = vec3(0.0, 1.15, -1.48);

float blockBack(float pier, float storey) {
  float reach = abs(pier - 0.5);
  bool block = reach > 1.0 && mod(storey - mod(abs(pier), 2.0), 2.0) < 0.5 && !nearPlantFloor(storey);
  return block ? (abs(reach - 2.5) < 0.1 ? -1.45 : -1.0) : 1e3;
}

vec4 airConditionerMount(vec2 room) {
  float pick = hash12(room + 307.0);
  if (pick < 0.45) return vec4(airConditionerShift(room), 0.0, 0.0, 0.0);
  float side = pick < 0.725 ? -1.0 : 1.0;
  float y = mix(0.85, 1.6, hash12(room + 311.0));
  float z = mix(-0.5, 0.8, hash12(room + 313.0));
  z = min(z, blockBack(room.x + max(side, 0.0), room.y) + 1.0);
  return vec4(1.235 * side, y, z, side);
}

vec3 turnUnit(vec3 direction, float side) {
  return side == 0.0 ? direction : vec3(-side * direction.z, direction.y, side * direction.x);
}

vec3 unturnUnit(vec3 direction, float side) {
  return side == 0.0 ? direction : vec3(side * direction.z, direction.y, -side * direction.x);
}

vec3 mounted(vec3 point, vec4 mount) {
  return UNIT_BASE + mount.xyz + turnUnit(point - UNIT_BASE, mount.w);
}
