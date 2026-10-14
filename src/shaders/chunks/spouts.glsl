#include "collectors.glsl"

const float PIER_MIDDLE = -2.1;
const float PIER_HALF = 0.7;
const float RECESS_HALF = 1.4;
const float GAP_MIDDLE = 1.8;
const float BLOCK_TOP = 2.7;
const float BLOCK_BOTTOM = 0.9;
const vec2 BLOCK_SPAN = vec2(-3.05, -1.15);
const float LEDGE_BOTTOM = 0.55;
const float UNDER_LEDGE = -1.45;
const float SOFFIT = -2.15;
const float SPOUT_CHANCE = 0.65;
const float BRANCH_CHANCE = 0.2;
const float WALL_DEPTH = 0.1;
const float FLUSH = 0.03;
const float STACK_CHANCE = 0.35;
const float STACK_OFFSET = 0.28;
const float FEED_CHANCE = 0.9;
const float FEED_DROP = 0.2;
const float RUN_SPAN = 3.0;
const float RUN_BREAK = 0.3;
const float RUN_THROUGH = 0.3;
const float RUN_FALL = 0.01;
const float RUN_DEPTH = 0.14;
const float TEE_CHANCE = 0.5;
const float CRANK_CLEAR = 0.04;
const float BEND_WEIGHT = 0.5;
const float MISMATCH = 0.12;
const float SUPPORT_LOW = 0.35;
const float SUPPORT_SPAN = 1.0;
const float UNDER_COLLECTOR = 3.0;
const vec3 FRAME_HINT = vec3(0.31, 0.83, 0.47);
const int PIPE_POINTS = 14;
const int REACH_POINTS = 7;
#if defined(STACK)
const float PIECE = 1.0;
#elif defined(RUN)
const float PIECE = 2.0;
#else
const float PIECE = 0.0;
#endif

const float PLAIN = 0.0;
const float TEE = 1.0;
const float CRANK = 2.0;
const float FEED = 3.0;
const float BREAK = 4.0;
const float STOP = 5.0;
const float THROUGH = 6.0;

const float CONNECT = 0.0;
const float CRANKED = 1.0;
const float TEED = 2.0;
const float FED = 3.0;
const float WALL_END = 4.0;
const float OPEN_END = 5.0;
const float FRONT_WALL = 6.0;
const float FRONT_DROP = 7.0;
const float SEAM = 8.0;

struct Spout {
  vec3 points[PIPE_POINTS];
  int count;
  float radius;
  float bend;
  float drips;
  float source;
  float sink;
  vec2 sleeves;
  vec2 supports;
  vec2 braces;
  float seed;
  float pattern;
};

struct Stack {
  bool present;
  float x;
  float side;
  float radius;
  float low;
  float high;
  float feed;
  bool shoe;
  bool hug;
  float seed;
};

struct Reach {
  vec3 points[REACH_POINTS];
  int count;
  float depth;
};

Spout emptySpout() {
  Spout spout;
  for (int i = 0; i < PIPE_POINTS; i++) spout.points[i] = vec3(0.0);
  spout.count = 0;
  spout.radius = 0.1;
  spout.bend = 0.12;
  spout.drips = 1.0;
  spout.source = -1.0;
  spout.sink = -1.0;
  spout.sleeves = vec2(-1.0);
  spout.supports = vec2(-1.0);
  spout.braces = vec2(0.0);
  spout.seed = 0.0;
  spout.pattern = 0.0;
  return spout;
}

float lengthTo(Spout spout, int index) {
  float total = 0.0;
  for (int i = 0; i + 1 < PIPE_POINTS; i++) {
    if (i >= index) break;
    total += distance(spout.points[i], spout.points[i + 1]);
  }
  return total;
}

bool innerPier(float column) {
  return column * uBay - 3.15 > -uOuterX + 0.01 && column < 3.5;
}

bool necked(float column, float storey) {
  return blockless(vec2(column, 0.0)) < 0.5 && mod(storey - mod(abs(column), 2.0), 2.0) < 0.5
    && !nearPlantFloor(storey);
}

bool wallFree(vec2 room, float side) {
  vec2 recess = side > 0.0 ? room : room - vec2(1.0, 0.0);
  return !airConditioned(recess) || airConditionerMount(recess).w != -side;
}

bool seamFree(float pier, float storey) {
  vec2 room = vec2(pier, storey);
  return wallFree(room, 1.0) && wallFree(room, -1.0);
}

float wallTop(vec2 room, float side, float base) {
  return runIn(room.x + min(side, 0.0), room.y) ? base + UNDER_COLLECTOR : 1e3;
}

float pipeMaterial(float storey) {
  return hash12(vec2(mod(floor(storey / uPlantEvery), 8192.0 / uPlantEvery), 0.0) + 971.0);
}

float runFall(float storey) {
  return hash12(vec2(storey, 7.0) + 951.0) < 0.5 ? -RUN_FALL : RUN_FALL;
}

float runDrop(float storey, float x) {
  return runFall(storey) * x + RUN_FALL * 3.5 * uBay;
}

Stack stackOf(float column, float storey) {
  Stack stack;
  stack.present = false;
  stack.x = PIER_MIDDLE;
  stack.side = 1.0;
  stack.radius = 0.1;
  stack.low = 0.0;
  stack.high = 0.0;
  stack.feed = 0.0;
  stack.shoe = false;
  stack.hug = false;
  stack.seed = 0.0;
  if (!innerPier(column) || blockless(vec2(column, 0.0)) > 0.5) return stack;
  float section = floor(storey / uPlantEvery);
  vec2 key = vec2(column, mod(section, 8192.0 / uPlantEvery)) + 992.0;
  if (hash12(key) > STACK_CHANCE) return stack;
  float span = 1.0 + floor(hash12(key + 1.0) * 3.0);
  float first = section * uPlantEvery;
  float low = first + 1.0 + floor(hash12(key + 2.0) * (uPlantEvery - 1.0 - span));
  float high = low + span - 1.0;
  Duct duct;
  if (ductOf(column, section, duct)) {
    if (duct.rise > 0.0) low = max(low, first + duct.reach + 2.0);
    else high = min(high, first + uPlantEvery - duct.reach - 2.0);
  }
  if (necked(column, low)) low += 1.0;
  if (storey < low || storey > high || high < low) return stack;
  stack.present = true;
  stack.side = hash12(key + 3.0) < 0.5 ? -1.0 : 1.0;
  stack.x = PIER_MIDDLE + stack.side * STACK_OFFSET;
  stack.radius = mix(0.08, 0.11, hash12(key + 4.0));
  stack.low = low;
  stack.high = high;
  float feed = hash12(key + 5.0);
  stack.feed = feed < FEED_CHANCE ? (feed < 0.5 * FEED_CHANCE ? -1.0 : 1.0) : 0.0;
  if (stack.feed != 0.0 && !runIn(column + min(stack.feed, 0.0), high)) stack.feed = 0.0;
  stack.shoe = hash12(key + 6.0) < 0.6;
  stack.hug = hash12(key + 7.0) < 0.5;
  stack.seed = pipeMaterial(first);
  return stack;
}

float nodeAt(float pier, float storey, Stack stack) {
  if (!innerPier(pier)) return STOP;
  bool cut = mod(pier + floor(hash12(vec2(storey, 11.0) + 951.0) * RUN_SPAN), RUN_SPAN) < 0.5;
  if (stack.present && storey < stack.high) {
    return hash12(vec2(pier, storey) + 931.0) < TEE_CHANCE || necked(pier, storey) || cut ? TEE : CRANK;
  }
  if (stack.present) return stack.feed != 0.0 ? FEED : STOP;
  float pick = hash12(vec2(pier, storey) + 933.0);
  return cut || pick < RUN_BREAK ? BREAK : pick < RUN_BREAK + RUN_THROUGH ? THROUGH : PLAIN;
}

float runMode(float node, Stack stack, bool beyond, float side, float recess, float storey) {
  float pier = recess + max(side, 0.0);
  bool studded = blockless(vec2(pier, 0.0)) > 0.5;
  if (node == PLAIN && beyond && studded) return seamFree(pier, storey) ? SEAM : WALL_END;
  if (node == PLAIN && beyond) return CONNECT;
  if (node == THROUGH && beyond) return WALL_END;
  if (node == CRANK && beyond) return CRANKED;
  if (node == TEE || node == CRANK) return TEED;
  if (node == FEED && stack.feed == -side) return FED;
  float pick = hash12(vec2(2.0 * recess + side, storey) + 941.0);
  if (studded || (node != BREAK && node != PLAIN && node != THROUGH)) return pick < 0.55 ? WALL_END : OPEN_END;
  if (node == BREAK && beyond && side > 0.0) return pick < 0.55 ? WALL_END : OPEN_END;
  float drop = necked(pier, storey) ? FRONT_WALL : FRONT_DROP;
  return pick < 0.3 ? WALL_END : pick < 0.5 ? OPEN_END : pick < 0.75 ? FRONT_WALL : drop;
}

Reach reachOut(float side, float mode, vec3 stack, float y, float fall, float seam, float radius, float front,
  vec2 pick) {
  Reach reach;
  reach.depth = -1.0;
  float inside = side * (RECESS_HALF - radius - FLUSH);
  float middle = side * (uBay + PIER_MIDDLE);
  float stackX = stack.x + (side > 0.0 ? uBay : 0.0);
  float stackZ = stack.z + FLUSH;
  vec3 p0 = vec3(inside, y, SOFFIT);
  vec3 p1 = vec3(inside, y, front);
  vec3 p2 = p1;
  vec3 p3 = p1;
  vec3 p4 = p1;
  vec3 p5 = p1;
  vec3 p6 = p1;
  reach.count = 2;
  if (mode == WALL_END) {
    p0 = vec3(side * (RECESS_HALF + WALL_DEPTH), y, SOFFIT);
    reach.count = 1;
    reach.depth = WALL_DEPTH;
  } else if (mode == OPEN_END) {
    p1 = vec3(inside, y, mix(-0.4, 0.2, pick.x));
    reach.depth = 0.0;
  } else if (mode == CONNECT) {
    p2 = vec3(middle, y, front);
    reach.count = 3;
  } else if (mode == SEAM) {
    p1 = vec3(inside, seam, SOFFIT);
    p2 = vec3(inside, seam, front);
    p3 = vec3(middle, seam, front);
    reach.count = 4;
  } else if (mode == CRANKED && stack.y == -side) {
    float jump = 2.0 * stack.z + FLUSH + radius + CRANK_CLEAR;
    float clear = stack.z + 2.0 * radius + CRANK_CLEAR;
    p2 = vec3(stackX - side * clear, y, front);
    p3 = vec3(stackX - side * clear, y, jump);
    p4 = vec3(stackX + side * clear, y, jump);
    p5 = vec3(stackX + side * clear, y, front);
    p6 = vec3(middle - stack.y * 0.25, y, front);
    reach.count = 7;
  } else if (mode == CRANKED) {
    p2 = vec3(middle - stack.y * 0.25, y, front);
    reach.count = 3;
  } else if (mode == TEED) {
    p2 = vec3(stackX, y, stackZ);
    reach.count = 3;
    reach.depth = stack.z;
  } else if (mode == FED) {
    p2 = vec3(stackX, y, stackZ);
    p3 = vec3(stackX, y - FEED_DROP, stackZ);
    reach.count = 4;
  } else {
    float x = middle - side * mix(-0.2, 0.4, pick.x);
    p2 = vec3(x, y, front);
    p3 = mode == FRONT_WALL ? vec3(x, y, -WALL_DEPTH) : vec3(x, y - mix(0.3, 0.9, pick.y), front);
    reach.count = 4;
    reach.depth = mode == FRONT_WALL ? WALL_DEPTH : 0.0;
  }
  vec3 end = reach.count == 1 ? p0 : reach.count == 2 ? p1 : reach.count == 3 ? p2 : reach.count == 4 ? p3 : p6;
  if (reach.count < 2) p1 = end;
  if (reach.count < 3) p2 = end;
  if (reach.count < 4) p3 = end;
  if (reach.count < 7) {
    p4 = end;
    p5 = end;
    p6 = end;
  }
  float tilt = mode == SEAM ? 0.0 : fall;
  p0.y -= fall * p0.x;
  p1.y -= tilt * p1.x;
  p2.y -= tilt * p2.x;
  p3.y -= tilt * p3.x;
  p4.y -= tilt * p4.x;
  p5.y -= tilt * p5.x;
  p6.y -= tilt * p6.x;
  reach.points[0] = p0;
  reach.points[1] = p1;
  reach.points[2] = p2;
  reach.points[3] = p3;
  reach.points[4] = p4;
  reach.points[5] = p5;
  reach.points[6] = p6;
  return reach;
}

Spout collectorAt(vec2 tile, float storey, float base) {
  Spout spout = emptySpout();
  float recess = tile.x;
  if (!runIn(recess, storey)) return spout;
  Stack left = stackOf(recess, storey);
  Stack right = stackOf(recess + 1.0, storey);
  float fall = runFall(storey);
  float y = base + 0.5 * uTileHeight - RUN_DEPTH - runDrop(storey, recess * uBay);
  spout.radius = mix(0.08, 0.1, hash12(vec2(storey, 3.0) + 951.0));
  bool mismatched = hash12(vec2(storey, 9.0) + 951.0) < MISMATCH;
  spout.seed = mismatched ? hash12(vec2(storey, 5.0) + 951.0) : pipeMaterial(storey);
  float leftNode = nodeAt(recess, storey, left);
  float rightNode = nodeAt(recess + 1.0, storey, right);
  bool leftRun = runIn(recess - 1.0, storey);
  bool rightRun = runIn(recess + 1.0, storey);
  float leftMode = runMode(leftNode, left, leftRun, -1.0, recess, storey);
  float rightMode = runMode(rightNode, right, rightRun, 1.0, recess, storey);
  bool leftOpen = leftMode == OPEN_END || leftMode == FRONT_DROP;
  bool rightOpen = rightMode == OPEN_END || rightMode == FRONT_DROP;
  if (leftOpen && rightOpen) {
    leftMode = leftMode == OPEN_END ? WALL_END : FRONT_WALL;
    leftOpen = false;
  }
  float front = spout.radius + FLUSH;
  float seam = base + 0.5 * uTileHeight - STUD_BAND;
  vec2 pickLeft = vec2(hash12(vec2(recess, storey) + 943.0), hash12(vec2(recess, storey) + 944.0));
  vec2 pickRight = vec2(hash12(vec2(recess, storey) + 945.0), hash12(vec2(recess, storey) + 946.0));
  vec3 leftStack = vec3(left.x, left.side, left.radius);
  vec3 rightStack = vec3(right.x, right.side, right.radius);
  float side = leftOpen ? 1.0 : -1.0;
  Reach first = reachOut(side, leftOpen ? rightMode : leftMode, leftOpen ? rightStack : leftStack, y, fall, seam,
    spout.radius, front, leftOpen ? pickRight : pickLeft);
  Reach last = reachOut(-side, leftOpen ? leftMode : rightMode, leftOpen ? leftStack : rightStack, y, fall, seam,
    spout.radius, front, leftOpen ? pickLeft : pickRight);
  spout.points[0] = first.points[6];
  spout.points[1] = first.points[5];
  spout.points[2] = first.points[4];
  spout.points[3] = first.points[3];
  spout.points[4] = first.points[2];
  spout.points[5] = first.points[1];
  spout.points[6] = first.points[0];
  spout.points[7] = last.points[0];
  spout.points[8] = last.points[1];
  spout.points[9] = last.points[2];
  spout.points[10] = last.points[3];
  spout.points[11] = last.points[4];
  spout.points[12] = last.points[5];
  spout.points[13] = last.points[6];
  spout.count = REACH_POINTS + last.count;
  if (first.count > 1 && distance(spout.points[5], spout.points[6]) > SUPPORT_SPAN) {
    spout.supports.x = lengthTo(spout, 5) + 0.5 * distance(spout.points[5], spout.points[6]);
    spout.braces.x = side;
  }
  if (last.count > 1 && distance(spout.points[7], spout.points[8]) > SUPPORT_SPAN) {
    spout.supports.y = lengthTo(spout, 7) + 0.5 * distance(spout.points[7], spout.points[8]);
    spout.braces.y = -side;
  }
  spout.source = first.depth;
  spout.sink = last.depth;
  if (spout.sink == 0.0) spout.drips = hash12(vec2(recess, storey) + 963.0);
  return spout;
}

Spout branchAt(vec2 room, float base, Stack stack) {
  Spout spout = emptySpout();
  if (hash12(room + 507.0) > BRANCH_CHANCE) return spout;
  float side = hash12(room + 511.0) < 0.5 ? -1.0 : 1.0;
  if (!wallFree(room, side)) side = -side;
  if (!wallFree(room, side)) return spout;
  vec4 pick = vec4(hash12(room + 501.0), hash12(room + 502.0), hash12(room + 503.0), hash12(room + 505.0));
  spout.radius = mix(0.05, 0.075, pick.x);
  spout.seed = hash12(room + 521.0) < MISMATCH ? hash12(room + 517.0) : stack.seed;
  float face = PIER_MIDDLE + side * PIER_HALF;
  float off = face + side * (spout.radius + FLUSH);
  float front = spout.radius + FLUSH;
  float back = -mix(0.4, 0.8, pick.y);
  float level = base + mix(1.7, 2.6, pick.z);
  float drop = pick.w < 0.5 ? mix(0.3, 0.7, pick.w * 2.0) : 0.0;
  drop = min(drop, max(wallTop(room, side, base) - spout.radius - level, 0.0));
  front = stack.radius + FLUSH;
  vec3 join = vec3(stack.x, level, front);
  spout.points[0] = vec3(face - side * WALL_DEPTH, level + drop, back);
  spout.points[1] = vec3(off, level + drop, back);
  spout.points[2] = vec3(off, level, back);
  spout.points[3] = vec3(off, level, front);
  spout.points[4] = join;
  spout.count = 5;
  if (drop == 0.0) {
    spout.points[1] = spout.points[0];
  }
  spout.source = WALL_DEPTH;
  spout.sink = stack.radius;
  return spout;
}

Spout roomSpout(vec2 room, vec2 tile, float storey, float base) {
  Spout spout = emptySpout();
  if (storey < 0.5 || blockless(tile) > 0.5 || plantFloor(room) || !innerPier(tile.x)) return spout;
  Stack stack = stackOf(tile.x, room.y);
  if (stack.present) return branchAt(room, base, stack);
  vec2 climbed = vec2(tile.x, mod(tile.y + uTilesClimbed, 4096.0));
  if (mod(climbed.x + climbed.y, 2.0) > 0.5 || hash12(room + 507.0) >= SPOUT_CHANCE || ducted(room, storey)) {
    return spout;
  }
  vec4 pick = vec4(hash12(room + 501.0), hash12(room + 502.0), hash12(room + 503.0), hash12(room + 505.0));
  float kind = hash12(room + 509.0);
  float side = hash12(room + 511.0) < 0.5 ? -1.0 : 1.0;
  if (!wallFree(room, side)) side = -side;
  bool sideFree = wallFree(room, side);
  bool bothFree = wallFree(room, 1.0) && wallFree(room, -1.0);
  bool grille = hash12(room + 229.0) > 0.55;
  float y = base + GAP_MIDDLE;
  float face = PIER_MIDDLE + side * PIER_HALF;
  spout.drips = hash12(room + 504.0);
  spout.radius = mix(0.08, 0.12, pick.x);
  spout.seed = hash12(room + 517.0);
  spout.source = WALL_DEPTH;
  spout.sink = 0.0;
  float off = face + side * (spout.radius + FLUSH);
  float front = spout.radius + mix(FLUSH, 0.06, pick.y);
  float back = -mix(0.4, 0.8, pick.y);

  if (kind < 0.36 && kind >= 0.22 && sideFree) {
    float top = y + mix(0.0, 0.6, pick.z);
    float low = top - mix(0.35, 0.7, pick.w);
    float across = face - side * mix(0.35, 0.6, pick.x);
    spout.points[0] = vec3(face - side * WALL_DEPTH, top, back);
    spout.points[1] = vec3(off, top, back);
    spout.points[2] = vec3(off, low, back);
    spout.points[3] = vec3(off, low, front);
    spout.points[4] = vec3(across, low, front);
    spout.points[5] = vec3(across, low, front + mix(0.25, 0.45, pick.w));
    spout.count = 6;
  } else if (kind < 0.52 && kind >= 0.36 && sideFree) {
    float top = y + mix(-0.5, 1.0, pick.z);
    float low = top - mix(0.0, 0.8, pick.w);
    float reach = mix(0.3, 0.55, pick.x);
    spout.points[0] = vec3(face - side * WALL_DEPTH, top, back);
    spout.points[1] = vec3(off, top, back);
    if (top - low > 0.25) {
      spout.points[2] = vec3(off, low, back);
      spout.points[3] = vec3(off, low, reach);
      spout.count = 4;
    } else {
      spout.points[2] = vec3(off, top, reach);
      spout.count = 3;
    }
  } else if (kind < 0.66 && kind >= 0.52 && !grille) {
    float run = base + LEDGE_BOTTOM - spout.radius - 0.04;
    float z = UNDER_LEDGE + mix(-0.05, 0.05, pick.z);
    spout.points[0] = vec3(-RECESS_HALF - WALL_DEPTH, run, z);
    spout.points[1] = vec3(RECESS_HALF + WALL_DEPTH, run, z);
    spout.count = 2;
    spout.sink = WALL_DEPTH;
  } else if (kind < 0.78 && kind >= 0.66 && !grille) {
    float run = base + LEDGE_BOTTOM - spout.radius - 0.04;
    float from = side * RECESS_HALF;
    float turn = mix(-0.6, 0.6, pick.z);
    spout.points[0] = vec3(from + side * WALL_DEPTH, run, UNDER_LEDGE);
    spout.points[1] = vec3(turn, run, UNDER_LEDGE);
    spout.points[2] = vec3(turn, run, -mix(0.2, 0.7, pick.w));
    spout.count = 3;
  } else if (kind < 0.89 && kind >= 0.78 && bothFree) {
    float level = y + mix(-0.4, 1.0, pick.z);
    float right = PIER_MIDDLE + PIER_HALF;
    float left = PIER_MIDDLE - PIER_HALF;
    float clear = spout.radius + FLUSH;
    float backLeft = -mix(0.3, 0.7, pick.w);
    spout.points[0] = vec3(right - WALL_DEPTH, level, back);
    spout.points[1] = vec3(right + clear, level, back);
    spout.points[2] = vec3(right + clear, level, clear);
    spout.points[3] = vec3(left - clear, level, clear);
    spout.points[4] = vec3(left - clear, level, backLeft);
    spout.points[5] = vec3(left + WALL_DEPTH, level, backLeft);
    spout.count = 6;
    spout.sink = WALL_DEPTH;
  } else if (kind >= 0.89 && sideFree) {
    float low = y + mix(-0.5, 0.2, pick.z);
    float high = min(low + mix(1.0, 1.8, pick.w), min(base + 3.0, wallTop(room, side, base) - spout.radius));
    spout.points[0] = vec3(face - side * WALL_DEPTH, low, back);
    spout.points[1] = vec3(off, low, back);
    spout.points[2] = vec3(off, high, back);
    spout.points[3] = vec3(face - side * WALL_DEPTH, high, back);
    spout.count = 4;
    spout.sink = WALL_DEPTH;
  } else {
    float reach = mix(0.5, 0.7, pick.x);
    spout.radius = mix(0.19, 0.22, pick.x);
    spout.points[0] = vec3(PIER_MIDDLE, y, -WALL_DEPTH);
    spout.points[1] = vec3(PIER_MIDDLE, y, reach);
    spout.count = 2;
  }
  if (spout.sink != 0.0) spout.drips = 1.0;
  return spout;
}

Spout stackAt(vec2 tile, float storey, float base, float upper) {
  Spout spout = emptySpout();
  Stack stack = stackOf(tile.x, storey);
  if (!stack.present) return spout;
  spout.radius = stack.radius;
  bool mismatched = hash12(vec2(tile.x, storey) + 967.0) < MISMATCH;
  spout.seed = mismatched ? hash12(vec2(tile.x, storey) + 969.0) : stack.seed;
  float x = stack.x;
  float wall = stack.radius + FLUSH;
  float top = base + 0.5 * uTileHeight;
  float start = top;
  float lead = 0.0;
  float drop = RUN_DEPTH + runDrop(storey, tile.x * uBay + x);
  vec3 entry = vec3(x, top, wall);
  vec3 head = entry;
  if (storey == stack.high && stack.feed != 0.0) {
    start = top - drop - FEED_DROP;
    head = vec3(x, start, wall);
    entry = head;
    spout.source = 0.0;
  } else if (storey == stack.high) {
    start = top - 0.3;
    entry = vec3(x, start, -WALL_DEPTH);
    head = vec3(x, start, wall);
    spout.source = WALL_DEPTH;
    lead = WALL_DEPTH + wall;
  }
  vec3 foot = vec3(x, base, wall);
  vec3 toe = foot;
  spout.count = 7;
  if (storey == stack.low && stack.shoe) {
    foot = vec3(x, base + 0.65, wall);
    toe = vec3(x, base + 0.65, wall + 0.2);
    spout.count = 8;
    spout.sink = 0.0;
    spout.drips = hash12(vec2(tile.x, storey) + 961.0);
  } else if (storey == stack.low) {
    foot = vec3(x, base + 0.55, wall);
    toe = vec3(x, base + 0.55, -WALL_DEPTH);
    spout.count = 8;
    spout.sink = WALL_DEPTH;
  }
  vec3 neck0 = mix(head, foot, 0.2);
  vec3 neck1 = mix(head, foot, 0.4);
  vec3 neck2 = mix(head, foot, 0.6);
  vec3 neck3 = mix(head, foot, 0.8);
  if (necked(tile.x, storey)) {
    vec2 climbed = vec2(tile.x, mod(tile.y + uTilesClimbed, 4096.0));
    float jog = BLOCK_FRONT - blockInset(climbed);
    float front = jog + wall;
    float over = stack.hug ? wall : 0.15;
    neck0 = vec3(x, base + BLOCK_TOP + over, wall);
    neck1 = vec3(x, base + BLOCK_TOP + over, front);
    neck2 = vec3(x, base + BLOCK_BOTTOM - over, front);
    neck3 = vec3(x, base + BLOCK_BOTTOM - over, wall);
  }
  spout.points[0] = entry;
  spout.points[1] = head;
  spout.points[2] = neck0;
  spout.points[3] = neck1;
  spout.points[4] = neck2;
  spout.points[5] = neck3;
  spout.points[6] = foot;
  spout.points[7] = toe;
  if (!necked(tile.x, storey)) spout.supports.x = lead + start - base - GAP_MIDDLE;
  else if (storey != stack.low) spout.supports.x = lengthTo(spout, spout.count - 1) - SUPPORT_LOW;
  if (storey < stack.high) {
    float node = nodeAt(tile.x, storey, stack);
    bool leftRun = runIn(tile.x - 1.0, storey);
    bool rightRun = runIn(tile.x, storey);
    if ((leftRun || rightRun) && (node == TEE || !(leftRun && rightRun))) spout.sleeves.x = drop;
  }
  if (upper > 0.5) {
    Spout branch = branchAt(roomOf(tile, upper), base, stack);
    if (branch.count > 1) spout.sleeves.y = lead + start - branch.points[4].y;
  }
  return spout;
}

Spout pipeAt(vec2 tile, float storey) {
  vec2 room = roomOf(tile, storey);
  float base = storey * 0.5 * uTileHeight;
#if defined(STACK)
  Spout spout = stackAt(tile, room.y, base, storey);
#elif defined(RUN)
  Spout spout = collectorAt(tile, room.y, base);
#else
  Spout spout = roomSpout(room, tile, storey, base);
#endif
  spout.bend = spout.radius * mix(1.2, 1.6, hash12(room + PIECE * 13.0 + 502.0));
  spout.pattern = hash12(room + PIECE * 13.0 + 519.0);
  return spout;
}

vec4 spoutTexel(Spout spout, int i) {
  float fields[PIPE_POINTS] = float[](float(spout.count), spout.radius, spout.bend, spout.drips,
    spout.source, spout.sink, spout.sleeves.x, spout.sleeves.y, spout.supports.x, spout.supports.y,
    spout.braces.x, spout.braces.y, spout.seed, spout.pattern);
  return vec4(spout.points[i], fields[i]);
}

int routeCount;
float routeBend;

#ifdef LAID_OUT
uniform sampler2D uPipeLayout;

vec4 laidTexel(int i) {
  return texelFetch(uPipeLayout, ivec2(i, gl_InstanceID), 0);
}

Spout laidSpout() {
  Spout spout = emptySpout();
  spout.count = int(laidTexel(0).w);
  spout.radius = laidTexel(1).w;
  spout.bend = laidTexel(2).w;
  spout.drips = laidTexel(3).w;
  spout.source = laidTexel(4).w;
  spout.sink = laidTexel(5).w;
  spout.sleeves = vec2(laidTexel(6).w, laidTexel(7).w);
  spout.supports = vec2(laidTexel(8).w, laidTexel(9).w);
  spout.braces = vec2(laidTexel(10).w, laidTexel(11).w);
  spout.seed = laidTexel(12).w;
  spout.pattern = laidTexel(13).w;
  return spout;
}

vec3 routePoint(int i) {
  return laidTexel(i).xyz;
}

vec3 routeSegment(int i) {
  return laidTexel(PIPE_POINTS + i).xyz;
}

vec2 routeTotals() {
  return laidTexel(2 * PIPE_POINTS - 1).xy;
}

void follow(Spout spout) {
  routeCount = spout.count;
  routeBend = spout.bend;
}
#else
vec3 route[PIPE_POINTS];

vec3 routePoint(int i) {
  return route[i];
}

float spoutCorner(int i) {
  float before = distance(route[i - 1], route[i]);
  float after = distance(route[i], route[i + 1]);
  return min(routeBend, 0.45 * min(before, after));
}

vec3 routeSegment(int i) {
  float span = distance(route[i], route[i + 1]);
  float opening = i > 0 ? spoutCorner(i) : 0.0;
  float closing = i + 2 < routeCount ? spoutCorner(i + 1) : 0.0;
  return vec3(span, opening, closing);
}

vec2 routeTotals() {
  float bend = 0.5 * BEND_WEIGHT;
  vec2 totals = vec2(0.0);
  for (int i = 0; i + 1 < routeCount; i++) {
    vec3 segment = routeSegment(i);
    totals.x += segment.x;
    totals.y += segment.x - segment.y - segment.z + (segment.y > 0.0 ? bend : 0.0)
      + (segment.z > 0.0 ? bend : 0.0);
  }
  return totals;
}

void follow(Spout spout) {
  for (int i = 0; i < PIPE_POINTS; i++) route[i] = spout.points[i];
  routeCount = spout.count;
  routeBend = spout.bend;
}
#endif

float spoutLength() {
  return routeTotals().x;
}

float spoutRun(float t) {
  float bend = 0.5 * BEND_WEIGHT;
  float left = t * routeTotals().y;
  float s = 0.0;
  for (int i = 0; i + 1 < routeCount; i++) {
    vec3 segment = routeSegment(i);
    float opening = segment.y;
    float closing = segment.z;
    float straight = segment.x - opening - closing;
    if (opening > 0.0) {
      if (left <= bend) return s + opening * left / bend;
      left -= bend;
    }
    s += opening;
    if (left <= straight) return s + left;
    left -= straight;
    s += straight;
    if (closing > 0.0) {
      if (left <= bend) return s + closing * left / bend;
      left -= bend;
    }
    s += closing;
  }
  return s;
}

vec3 spoutCentre(float s, out vec3 tangent) {
  float start = 0.0;
  tangent = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i + 1 < routeCount; i++) {
    vec3 a = routePoint(i);
    vec3 b = routePoint(i + 1);
    vec3 segment = routeSegment(i);
    float span = segment.x;
    bool last = i + 2 >= routeCount;
    if (span < 1e-4 && !last) continue;
    vec3 along = (b - a) / max(span, 1e-4);
    if (s <= start + span || last) {
      float into = s - start;
      tangent = along;
      if (i > 0) {
        float w = segment.y;
        if (into < w) {
          vec3 before = normalize(a - routePoint(i - 1));
          float u = 0.5 + 0.5 * into / w;
          tangent = normalize(mix(before, along, u));
          return mix(mix(a - before * w, a, u), mix(a, a + along * w, u), u);
        }
      }
      if (!last) {
        float w = segment.z;
        float left = span - into;
        if (left < w) {
          vec3 after = normalize(routePoint(i + 2) - b);
          float u = 0.5 - 0.5 * left / w;
          tangent = normalize(mix(along, after, u));
          return mix(mix(b - along * w, b, u), mix(b, b + after * w, u), u);
        }
      }
      return a + along * into;
    }
    start += span;
  }
  return routePoint(0);
}

mat3 spoutFrame(vec3 tangent) {
  vec3 across = normalize(cross(tangent, normalize(FRAME_HINT)));
  return mat3(across, cross(tangent, across), tangent);
}

vec3 spoutLip(float radius) {
  vec3 tangent;
  vec3 end = spoutCentre(spoutLength(), tangent);
  vec3 down = vec3(0.0, -1.0, 0.0);
  vec3 rim = down - tangent * dot(down, tangent);
  if (dot(rim, rim) < 0.01) return end + down * 0.004;
  return end + normalize(rim) * (1.1 * radius + 0.004);
}
