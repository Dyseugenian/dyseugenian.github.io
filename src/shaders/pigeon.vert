precision highp float;

#include "chunks/hash.glsl"
#include "chunks/inset.glsl"
#include "chunks/rooms.glsl"

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uTileHeight;
uniform float uBay;
uniform float uOuterX;

in vec3 position;
in vec3 normal;
in float aPart;
in vec3 aSurface;
in float aHead;
in vec3 aFolded;
in vec3 aFoldedNormal;
in vec3 aOffset;
in vec2 aTile;
in float aStorey;
in float aIndex;

out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;
out vec3 vShape;
out vec3 vSurface;
flat out float vPart;
flat out vec2 vTile;
flat out float vSeed;

const float PI = 3.14159;
const float TAU = 6.28318;
const float STAY = 46.0;
const float SLOT = 6.0;
const float CROUCH = 0.45;
const float SPEED = 5.0;
const float FLAP = 6.0;
const float STRIDE = 0.08;
const float PECK = 3.2;
const float GLANCE = 1.9;
const float FACING = 11.0;
const float LEDGE_Y = 1.15;
const float LEDGE_Z = -1.42;
const float SILL_Y = 0.55;
const float AC_TOP = 1.82;
const float AC_Z = -1.48;
const float RIB_TOP = 2.025;
const float EDGE_WIDTH = 1.75;
const float AWAY = 1e3;
const float WRIST = 0.14;
const float TAIL_LENGTH = 0.12;
const float TAIL_BASE = 0.017;
const vec3 CENTER = vec3(0.0, 0.1, -0.01);
const vec3 NECK = vec3(0.0, 0.16, 0.05);
const vec3 SHOULDER = vec3(0.035, 0.145, 0.04);
const vec3 TAIL = vec3(0.0, 0.075, -0.135);
const vec3 HIP = vec3(0.018, 0.035, 0.012);

struct Perch {
  vec3 at;
  vec2 range;
};

struct Wing {
  float sweep;
  float lift;
  float twist;
  float reach;
  float flex;
  float hand;
};

const Wing FOLDED = Wing(1.72, -0.06, 1.3, 0.38, 0.0, 0.0);
const Wing GLIDE = Wing(0.2, 0.18, 0.06, 1.0, 0.4, -0.08);
const Wing SETTLING = Wing(0.7, 0.3, 0.35, 0.8, 0.6, 0.0);
const Wing STRETCH = Wing(0.95, -0.5, 0.35, 0.95, 0.25, -0.1);

mat3 yaw(float angle) {
  return mat3(cos(angle), 0.0, -sin(angle), 0.0, 1.0, 0.0, sin(angle), 0.0, cos(angle));
}

mat3 pitch(float angle) {
  return mat3(1.0, 0.0, 0.0, 0.0, cos(angle), -sin(angle), 0.0, sin(angle), cos(angle));
}

mat3 roll(float angle) {
  return mat3(cos(angle), sin(angle), 0.0, -sin(angle), cos(angle), 0.0, 0.0, 0.0, 1.0);
}

float wrapAngle(float angle) {
  return mod(angle + PI, TAU) - PI;
}

float mixAngle(float from, float to, float t) {
  return from + wrapAngle(to - from) * t;
}

float window(float from, float rise, float to, float fall, float t) {
  return smoothstep(from, from + rise, t) * (1.0 - smoothstep(to - fall, to, t));
}

Wing mixWing(Wing a, Wing b, float t) {
  return Wing(mix(a.sweep, b.sweep, t), mix(a.lift, b.lift, t), mix(a.twist, b.twist, t),
    mix(a.reach, b.reach, t), mix(a.flex, b.flex, t), mix(a.hand, b.hand, t));
}

Wing unfold(Wing folded, Wing spread, float open) {
  float swing = smoothstep(0.4, 1.0, open);
  float bend = smoothstep(0.2, 0.8, open);
  float press = smoothstep(0.0, 0.5, open);
  return Wing(mix(folded.sweep, spread.sweep, swing), mix(folded.lift, spread.lift, swing),
    mix(folded.twist, spread.twist, press), mix(folded.reach, spread.reach, bend), mix(folded.flex, spread.flex, bend),
    mix(folded.hand, spread.hand, bend));
}

vec2 tileOf(vec2 room, out float storey) {
  float parity = mod(abs(room.x), 2.0);
  storey = mod(room.y - parity, 2.0);
  return vec2(room.x, mod((room.y - parity - storey) / 2.0, 4096.0));
}

Perch ledgeIn(vec2 room, float pick, float place) {
  float x = room.x * uBay;
  if (abs(x) + 1.4 > uOuterX + 0.01) return Perch(vec3(0.0, 2.0 * AWAY, 0.0), vec2(0.0));
  float storey;
  vec2 tile = tileOf(room, storey);
  float plant = plantFloor(room) ? 1.0 : 0.0;
  float cooled = airConditioned(room) ? 1.0 : 0.0;
  float pier = step(-uOuterX + EDGE_WIDTH + 0.01, x - 2.8);
  float block = pier * (plantFloor(vec2(room.x, room.y - storey)) ? 0.0 : 1.0);
  float edgeSide = x - 1.4 - EDGE_WIDTH < -uOuterX + 0.01 ? -1.0 : x + 1.4 + EDGE_WIDTH > uOuterX - 0.01 ? 1.0 : 0.0;
  float weights[7] = float[7](1.0 - plant, 1.2 * cooled, 0.3 * (1.0 - plant), 0.6 * block, 0.8 * abs(edgeSide), plant, 0.6 * plant);
  float total = 0.0;
  for (int i = 0; i < 7; i++) total += weights[i];
  float chosen = pick * total;
  int kind = 6;
  for (int i = 0; i < 7; i++) {
    chosen -= weights[i];
    if (chosen < 0.0) {
      kind = i;
      break;
    }
  }
  float side = place < 0.5 ? -1.0 : 1.0;
  float along = fract(place * 2.0);
  if (kind == 0) return Perch(vec3(mix(-1.1, 1.1, along), LEDGE_Y, LEDGE_Z), vec2(-1.1, 1.1));
  if (kind == 1) {
    vec4 mount = airConditionerMount(room);
    if (mount.w != 0.0) return Perch(vec3(mount.x, AC_TOP + mount.y, AC_Z + mount.z), vec2(mount.x));
    return Perch(vec3(mount.x + mix(-0.3, 0.3, along), AC_TOP, AC_Z), vec2(mount.x - 0.3, mount.x + 0.3));
  }
  if (kind == 2) return Perch(vec3(side * 1.3, SILL_Y, -2.05), vec2(side * 1.3));
  if (kind == 3) {
    return Perch(vec3(mix(-2.9, -1.3, along), 2.7 - storey * 0.5 * uTileHeight, 0.75 - blockInset(tile)), vec2(-2.9, -1.3));
  }
  if (kind == 4) {
    vec2 rib = edgeSide * vec2(1.55, 3.7);
    return Perch(vec3(mix(rib.x, rib.y, along), RIB_TOP, 0.4), edgeSide > 0.0 ? rib : rib.yx);
  }
  vec2 ledge = vec2(pier > 0.5 ? -2.7 : -1.3, 1.3);
  return Perch(vec3(mix(ledge.x, ledge.y, along), kind == 5 ? SILL_Y : 0.5 * uTileHeight, 0.45), ledge);
}

Perch perchIn(float stay, vec2 room, Perch home, float seed) {
  float choice = hash12(vec2(stay, seed * 113.0));
  if (choice < 0.5) return home;
  if (choice > 0.9) return Perch(vec3(0.0, 2.0 * AWAY, 0.0), vec2(0.0));
  float side = sign(hash12(vec2(stay, seed * 71.0)) - 0.5);
  vec2 hop = choice < 0.62 ? vec2(0.0) : choice < 0.72 ? vec2(0.0, 1.0) : choice < 0.8 ? vec2(0.0, -1.0) : vec2(side, 0.0);
  vec2 target = vec2(room.x + hop.x, mod(room.y + hop.y, 8192.0));
  Perch next = ledgeIn(target, hash12(vec2(stay, seed * 101.0)), hash12(vec2(stay, seed * 103.0)));
  if (next.at.y > AWAY) return home;
  return Perch(next.at + vec3(hop.x * uBay, hop.y * 0.5 * uTileHeight, 0.0), next.range + hop.x * uBay);
}

float ramped(float from, float to, float t) {
  float x = clamp((t - from) / (to - from), 0.0, 1.0);
  return (to - from) * (x * x * x - 0.5 * x * x * x * x) + max(t - to, 0.0);
}

float arrive(float t) {
  return -2.0 * t * t * t + 3.0 * t * t + 0.5 * (t * t * t - 2.0 * t * t + t) + 0.12 * (t * t * t - t * t);
}

float arriveRate(float t) {
  return -6.0 * t * t + 6.0 * t + 0.5 * (3.0 * t * t - 4.0 * t + 1.0) + 0.12 * (3.0 * t * t - 2.0 * t);
}

vec3 bezier(vec3 a, vec3 b, vec3 c, vec3 d, float t) {
  float s = 1.0 - t;
  return s * s * s * a + 3.0 * s * s * t * b + 3.0 * s * t * t * c + t * t * t * d;
}

vec3 bezierVelocity(vec3 a, vec3 b, vec3 c, vec3 d, float t) {
  float s = 1.0 - t;
  return 3.0 * s * s * (b - a) + 6.0 * s * t * (c - b) + 3.0 * t * t * (d - c);
}

vec3 bezierBend(vec3 a, vec3 b, vec3 c, vec3 d, float t) {
  return 6.0 * (1.0 - t) * (c - 2.0 * b + a) + 6.0 * t * (d - 2.0 * c + b);
}

vec3 bendWing(vec3 p, inout vec3 n, Wing wing, float handWeight) {
  p.x -= (1.0 - wing.reach) * min(p.x, WRIST);
  vec3 wrist = vec3(WRIST * wing.reach, 0.0, 0.0);
  mat3 hand = yaw(wing.flex) * roll(wing.hand);
  p = mix(p, wrist + hand * (p - wrist), handWeight);
  n = normalize(mix(n, hand * n, handWeight));
  mat3 arm = yaw(wing.sweep) * roll(wing.lift) * pitch(wing.twist);
  p = SHOULDER + arm * p;
  n = arm * n;
  return p;
}

Wing flapping(float phase, float launch, float flare) {
  float downstroke = 0.55;
  float cycle = phase < downstroke ? 0.5 * phase / downstroke : 0.5 + 0.5 * (phase - downstroke) / (1.0 - downstroke);
  float stroke = cos(TAU * cycle);
  float recovery = phase < downstroke ? 0.0 : sin(PI * (phase - downstroke) / (1.0 - downstroke));
  float strength = mix(0.75, 1.15, max(launch, flare));
  return Wing(0.05 + 0.4 * recovery - 0.35 * flare,
    0.2 + 0.85 * strength * stroke + 0.2 * launch * max(stroke, 0.0),
    -0.12 * (1.0 - recovery) + 0.55 * recovery + 0.5 * flare,
    1.0 - 0.3 * recovery,
    0.12 + 1.15 * recovery,
    -0.25 * strength * stroke);
}

vec3 glanceTarget(float n, float seed) {
  float skyward = step(hash12(vec2(n, seed * 41.0)), 0.1);
  float turn = (hash12(vec2(n, seed * 61.0)) - 0.5) * mix(2.2, 1.2, skyward);
  float tilt = mix((hash12(vec2(n, seed * 67.0)) - 0.5) * 0.5, 0.55, skyward);
  return vec3(turn, tilt, skyward * sign(turn) * 0.5);
}

float facingTarget(float n, float seed) {
  float turned = step(hash12(vec2(n, seed * 79.0)), 0.15);
  return (hash12(vec2(n, seed * 83.0)) - 0.5) * 2.6 + turned * PI;
}

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vec2 room = roomOf(aTile, aStorey);
  float present = aIndex < 0.5 ? 0.18 : aIndex < 1.5 ? 0.08 : 0.05;
  if (hash12(room + 291.0 + 7.0 * aIndex) > present) return;
  vec2 tile = vec2(aTile.x, mod(aTile.y + uTilesClimbed, 4096.0));
  float seed = hash12(room + aIndex * 5.0);
  Perch home = ledgeIn(room, hash12(room + 293.0 + 3.0 * aIndex), fract(hash12(room + 297.0) + 0.31 * aIndex));
  if (home.at.y > AWAY) return;

  float clock = uTime / STAY + seed * 10.0;
  float stay = floor(clock);
  float since = fract(clock) * STAY;
  Perch from = perchIn(stay - 1.0, room, home, seed);
  Perch to = perchIn(stay, room, home, seed);
  bool leaving = to.at.y > AWAY;
  bool arriving = from.at.y > AWAY;
  if (leaving && arriving) return;
  vec3 outward = vec3(sign(hash12(vec2(stay, seed * 37.0)) - 0.5) * 5.0, 9.0, 6.0);
  if (leaving) to.at = from.at + outward;
  if (arriving) from.at = to.at + outward;

  vec3 gap = to.at - from.at;
  float span = length(gap);
  float moves = step(0.01, span);
  float offshore = 2.0 + min(0.4 * span, 1.6);
  vec3 lift = from.at + vec3(0.15 * gap.x, -0.3, offshore);
  vec3 approach = to.at + vec3(-0.15 * gap.x, -0.9, offshore - 0.4);
  float pathLength = 0.5 * (span + length(lift - from.at) + length(approach - lift) + length(to.at - approach));
  float duration = clamp(pathLength / SPEED, 1.2, 4.0);
  float flight = moves > 0.5 ? since - CROUCH : 1e4;
  if (arriving && flight <= 0.0) return;
  if (leaving && flight >= duration) return;

  float progress = clamp(flight / duration, 0.0, 1.0);
  float eased = arrive(progress);
  float pace = arriveRate(progress) / duration;
  vec3 course = bezier(from.at, lift, approach, to.at, eased);
  vec3 velocity = bezierVelocity(from.at, lift, approach, to.at, eased) * pace;
  vec3 bend = bezierBend(from.at, lift, approach, to.at, eased) * pace * pace;

  float flying = moves * smoothstep(-0.02, 0.12, flight) * (1.0 - smoothstep(duration - 0.12, duration, flight));
  float open = moves * smoothstep(-0.1, 0.06, flight) * (1.0 - smoothstep(duration + 0.05, duration + 0.65, flight));
  float launch = moves * smoothstep(-0.15, 0.0, flight) * (1.0 - smoothstep(0.1, 0.5, flight));
  float flare = moves * smoothstep(duration - 0.6, duration - 0.15, flight) * (1.0 - smoothstep(duration, duration + 0.2, flight));
  float crouch = moves * smoothstep(-CROUCH, -0.1, flight) * (1.0 - smoothstep(-0.05, 0.08, flight));
  float touch = moves * smoothstep(duration, duration + 0.1, flight) * (1.0 - smoothstep(duration + 0.1, duration + 0.5, flight));
  float settled = moves > 0.5 ? CROUCH + duration + 0.8 : -1e3;
  Perch perch = from;
  if (flight >= 0.5 * duration) perch = to;

  float slot = floor(since / SLOT);
  float inSlot = since - slot * SLOT;
  float allowed = step(settled, slot * SLOT) * step(slot * SLOT + SLOT, STAY - 0.5);
  float kind = hash12(vec2(stay * 8.0 + slot, seed * 53.0));
  float eventSide = sign(hash12(vec2(stay * 8.0 + slot, seed * 59.0)) - 0.5);
  float loafing = step(hash12(vec2(stay, seed * 29.0)), 0.35);
  float loaf = loafing * smoothstep(max(settled, 0.0) + 2.0, max(settled, 0.0) + 3.2, since) * (1.0 - smoothstep(STAY - 3.7, STAY - 2.5, since));
  float preen = allowed * step(0.55, kind) * step(kind, 0.67) * window(0.5, 0.6, 5.4, 0.6, inSlot);
  float ruffle = allowed * step(0.67, kind) * step(kind, 0.75) * window(0.6, 0.3, 2.2, 0.5, inSlot);
  float stretch = allowed * (1.0 - loafing) * step(0.75, kind) * step(kind, 0.8) * window(0.8, 0.6, 3.8, 0.6, inSlot);
  float flick = allowed * step(0.8, kind) * step(kind, 0.9) * window(0.6, 0.1, 1.5, 0.3, inSlot);
  float strolling = allowed * (1.0 - loafing) * step(0.9, kind);
  float foraging = allowed * (1.0 - loafing) * step(0.4, kind) * step(kind, 0.55);

  float wanted = (hash12(vec2(stay * 8.0 + slot, seed * 47.0)) - 0.5) * mix(0.7, 0.3, foraging);
  float walkSpan = clamp(perch.at.x + wanted, perch.range.x, perch.range.y) - perch.at.x;
  float route = abs(walkSpan) * max(strolling * step(0.08, abs(walkSpan)), foraging * step(0.04, abs(walkSpan)));
  float cycle = max(route / max(floor(route / STRIDE + 0.5), 1.0), 1e-3);
  float walkTime = mix(1.6, 0.9, foraging);
  float outbound = route * smoothstep(0.0, 1.0, clamp((inSlot - 0.6) / walkTime, 0.0, 1.0));
  float inbound = route * smoothstep(0.0, 1.0, clamp((inSlot - 3.2) / walkTime, 0.0, 1.0));
  float walked = sign(walkSpan) * (outbound - inbound);
  float gait = (outbound + inbound) / cycle;
  float walking = step(1e-3, route)
    * (window(0.0, 0.5 * cycle, route, 0.5 * cycle, outbound) + window(0.0, 0.5 * cycle, route, 0.5 * cycle, inbound));
  float walkFacing = mix(sign(walkSpan), -sign(walkSpan), smoothstep(2.5, 3.1, inSlot)) * 0.5 * PI;
  float walkTurn = step(1e-3, route) * window(0.25, 0.35, 5.2, 0.4, inSlot);
  float lowered = foraging * (window(1.55, 0.25, 2.55, 0.3, inSlot) + window(4.15, 0.25, 5.5, 0.35, inSlot));
  float peckCycle = floor(inSlot * PECK);
  float strike = smoothstep(0.7, 0.95, lowered) * step(0.3, hash12(vec2(peckCycle, seed * 89.0)))
    * pow(sin(PI * clamp(fract(inSlot * PECK) / 0.4, 0.0, 1.0)), 2.0);

  float facingClock = (uTime + seed * 50.0) / FACING;
  float facingStep = floor(facingClock);
  float turning = fract(facingClock) * FACING;
  float turnBy = abs(wrapAngle(facingTarget(facingStep, seed) - facingTarget(facingStep - 1.0, seed)));
  float idleHeading = mixAngle(facingTarget(facingStep - 1.0, seed), facingTarget(facingStep, seed),
    smoothstep(0.0, 0.6, turning));
  float shuffle = (1.0 - walkTurn) * step(0.3, turnBy) * window(0.0, 0.05, 0.65, 0.05, turning);
  idleHeading = mixAngle(idleHeading, walkFacing, walkTurn);
  float narrow = 1.0 - step(0.05, perch.range.y - perch.range.x);
  idleHeading = mixAngle(idleHeading, step(0.5 * PI, abs(wrapAngle(idleHeading))) * PI, narrow);
  vec3 departure = bezierVelocity(from.at, lift, approach, to.at, 0.0);
  vec3 arrival = bezierVelocity(from.at, lift, approach, to.at, 1.0);
  vec3 travel = flight < 0.0 ? departure : flight > duration ? arrival : velocity;
  float courseHeading = atan(travel.x, travel.z);
  float onCourse = moves * smoothstep(-CROUCH, -0.15, flight) * (1.0 - smoothstep(duration + 0.3, duration + 1.1, flight));
  float heading = mixAngle(idleHeading, courseHeading, onCourse);

  float horizontal = max(length(velocity.xz), 1e-3);
  float climb = atan(velocity.y, horizontal);
  float sideways = (velocity.z * bend.x - velocity.x * bend.z) / horizontal;
  float shake = sin(TAU * 13.0 * inSlot) * window(1.0, 0.1, 1.7, 0.3, inSlot) * ruffle;
  float posture = moves * smoothstep(-0.02, 0.12, flight) * (1.0 - smoothstep(duration, duration + 0.35, flight));
  float sway = 0.045 * walking * sin(TAU * gait);
  float bank = posture * clamp(-atan(sideways / 9.8), -0.8, 0.8) + 0.18 * shake - 0.06 * preen * eventSide + sway;
  float bodyPitch = mix(0.04 - 0.16 * crouch - 0.1 * stretch - 0.06 * loaf - 0.5 * lowered - 0.12 * touch,
    -0.4 + 0.4 * climb + 0.75 * flare, posture);
  float drop = 0.018 * crouch + 0.032 * loaf + 0.02 * touch;
  float bounce = 0.0025 * walking * cos(2.0 * TAU * gait);
  float puff = 1.0 + 0.12 * ruffle + 0.06 * loaf + 0.008 * sin(TAU * 0.8 * uTime + seed * 20.0) * (1.0 - flying);

  float glanceClock = (uTime + seed * 13.0) / GLANCE;
  float glanceStep = floor(glanceClock);
  float jump = hash12(vec2(glanceStep, seed * 19.0)) * 1.2;
  vec3 look = mix(glanceTarget(glanceStep - 1.0, seed), glanceTarget(glanceStep, seed),
    smoothstep(jump, jump + 0.12, fract(glanceClock) * GLANCE));
  look *= (1.0 - flying) * (1.0 - crouch) * (1.0 - 0.7 * walking);
  look = mix(look, vec3(eventSide * 2.3, -0.55, eventSide * 0.35), preen);
  look.x += 0.5 * shake;
  look.y -= 0.8 * bodyPitch + 0.25 * crouch;
  float footfall = fract(2.0 * gait);
  float thrust = smoothstep(0.0, 1.0, (footfall - 0.55) / 0.45);
  float bob = walking * 0.5 * cycle * (thrust - footfall + 0.28);
  float headRise = walking * 0.004 * sin(PI * thrust);
  look.x += (hash12(vec2(peckCycle, seed * 97.0)) - 0.5) * 0.5 * smoothstep(0.7, 1.0, lowered);
  look.y -= 0.55 * lowered + 0.35 * strike;
  vec3 neckShift = vec3(0.0, -0.01, 0.022) * flying + vec3(0.0, -0.012, -0.01) * loaf
    + vec3(0.0, headRise, bob) + vec3(0.0, -0.004, 0.006) * preen * sin(TAU * 4.0 * inSlot)
    + vec3(0.0, -0.085, 0.045) * lowered + vec3(0.0, -0.035, 0.018) * strike + vec3(0.0, -0.004, 0.012) * touch;

  float flown = max(flight, 0.0);
  float flapPhase = fract(FLAP * flown + 3.0 * (flown - ramped(0.1, 0.6, flown))
    + 2.0 * ramped(duration - 0.6, duration - 0.2, flown));
  float descending = smoothstep(0.15, 0.45, -velocity.y / (length(velocity) + 1e-3));
  float cruise = step(3.0, span) * smoothstep(0.6, 0.9, sin(flight * 2.2 + seed * 9.0));
  float gliding = flying * (1.0 - launch) * (1.0 - flare) * max(descending, cruise);
  Wing beat = mixWing(flapping(flapPhase, launch, flare), GLIDE, gliding);
  beat = mixWing(beat, SETTLING, moves * smoothstep(duration - 0.05, duration + 0.12, flight));

  float tailSpread = clamp(max(launch, flare) + 0.35 * flying + 0.5 * abs(bank) * flying + 0.35 * ruffle + 0.7 * stretch
    + 0.25 * flick, 0.0, 1.0);
  float tailPitch = 0.35 * (1.0 - flying) + 0.45 * flare - 0.3 * crouch - 0.05 * flying + 0.25 * sin(TAU * 5.0 * inSlot) * flick
    + 0.3 * lowered;

  float size = mix(0.78, 0.88, hash12(vec2(seed * 43.0, 7.0)));
  vec3 p = position;
  vec3 n = normal;
  float side = aSurface.z;
  vec3 fluffed = mix(vec3(puff, puff, 1.0), vec3(0.9, 0.9, 1.05), flying);
  float spread = 0.0;
  if (aPart > 4.5 && aPart < 6.5) {
    float wingSide = side;
    float handWeight = smoothstep(0.38, 0.47, aSurface.x);
    float ownEvent = step(0.0, eventSide * wingSide);
    Wing wing = unfold(FOLDED, beat, open);
    wing = mixWing(wing, STRETCH, stretch * ownEvent);
    p.x *= wingSide;
    n.x *= wingSide;
    p = bendWing(p, n, wing, handWeight);
    p.x *= wingSide;
    n.x *= wingSide;
    vec3 shoulder = SHOULDER * vec3(wingSide, 1.0, 1.0);
    mat3 raise = roll(wingSide * (0.22 * preen * ownEvent + 0.06 * ruffle + 0.05 * abs(shake)));
    vec3 rest = shoulder + raise * (CENTER + (aFolded - CENTER) * fluffed - shoulder);
    spread = smoothstep(0.0, 0.45, max(open, stretch * ownEvent));
    p = mix(rest, p, spread);
    n = normalize(mix(raise * aFoldedNormal, n, spread));
  } else if (aPart > 6.5 && aPart < 8.5) {
    float angle = aSurface.x * mix(0.12, 1.05, tailSpread) * (1.0 + 0.2 * flare);
    float along = aSurface.y * TAIL_LENGTH * (1.0 - 0.05 * aSurface.x * aSurface.x);
    vec3 feather = vec3(aSurface.x * TAIL_BASE + sin(angle) * along, aSurface.z * mix(0.012, 0.006, aSurface.y) * (1.0 - aSurface.x * aSurface.x),
      -cos(angle) * along);
    mat3 tilt = pitch(tailPitch);
    p = TAIL + tilt * feather;
    n = tilt * normalize(vec3(0.6 * aSurface.x * (1.0 - aSurface.y), aSurface.z, 0.0));
  } else if (aPart > 8.5) {
    float legSide = side;
    float phase = fract(gait + 0.5 * step(0.0, legSide));
    float swinging = smoothstep(0.0, 1.0, clamp(2.0 * phase - 1.0, 0.0, 1.0));
    float reach = walking * 0.25 * cycle * (phase < 0.5 ? 1.0 - 4.0 * phase : 2.0 * swinging - 1.0);
    float raised = 0.012 * walking * sin(PI * swinging)
      + 0.01 * shuffle * max(sin(TAU * (2.5 * turning + 0.5 * step(0.0, legSide))), 0.0);
    float stretched = stretch * step(0.0, eventSide * legSide);
    float angle = 2.1 * flying * (1.0 - flare) - 0.7 * flare + 0.9 * stretched;
    vec3 hip = HIP * vec3(legSide, 1.0, 1.0);
    float lower = clamp((HIP.y - p.y) / HIP.y, 0.0, 1.0);
    p += vec3(0.0, raised, reach) * lower;
    mat3 leg = pitch(-angle);
    p = hip + leg * (p - hip) + vec3(0.0, 0.026 * flying * (1.0 - flare) + 0.02 * stretched, -0.03 * flying * (1.0 - flare));
    n = leg * n;
    p.y += drop * (1.0 - flying);
    mat3 upright = transpose(pitch(bodyPitch - 0.04) * roll(bank));
    p = mix(p, CENTER + upright * (p - CENTER), lower * (1.0 - posture));
  }
  if (aPart < 4.5) {
    float nodding = aHead;
    mat3 turn = yaw(look.x) * pitch(look.y) * roll(look.z);
    vec3 turned = NECK + neckShift + turn * (p - NECK);
    p = mix(p, turned, nodding);
    n = normalize(mix(n, turn * n, nodding));
    if (aPart < 0.5) p = CENTER + (p - CENTER) * mix(fluffed, vec3(1.0), nodding);
  }

  mat3 body = yaw(heading) * pitch(bodyPitch) * roll(bank);
  vec3 bird = (CENTER + body * (p - CENTER)) * size;
  vec3 at = flight > 0.0 && flight < duration ? course : perch.at + vec3(walked, 0.0, 0.0);
  vec3 local = at + bird - vec3(0.0, drop * (1.0 - flying) - bounce, 0.0) + vec3(0.0, aStorey * 0.5 * uTileHeight, 0.0);
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vWorld = world.xyz;
  vLocal = local;
  vNormal = mat3(modelMatrix) * body * n;
  vShape = position;
  vSurface = vec3(aSurface.xy, aPart > 4.5 && aPart < 6.5 ? spread : aSurface.z);
  vPart = aPart;
  vTile = tile;
  vSeed = seed;
  gl_Position = projectionMatrix * viewMatrix * world;
}
