const float HIGH_UNIT = 1.2;
const float COLLECTOR_CHANCE = 0.3;

bool runClear(vec2 recess) {
  if (!airConditioned(recess)) return true;
  vec4 mount = airConditionerMount(recess);
  return mount.w == 0.0 || mount.y < HIGH_UNIT;
}

bool runIn(float recess, float storey) {
  if (abs(recess) > 3.5 || plantFloor(vec2(0.0, storey)) || plantFloor(vec2(0.0, storey + 1.0))) return false;
  vec2 room = vec2(recess, storey);
  return runClear(room) && hash12(room + 921.0) < COLLECTOR_CHANCE;
}
