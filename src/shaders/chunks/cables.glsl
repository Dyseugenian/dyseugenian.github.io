#include "noise-texture.glsl"
#include "light.glsl"
#include "windows.glsl"
#include "inset.glsl"
#include "ducts.glsl"
#include "collectors.glsl"

const float SPAN = 0.0;
const float DANGLE = 1.0;
const float COIL = 2.0;
const float CLIP = 1.0;
const float ANCHOR = 2.0;
const float SIDE_WALL = 1.4;
const float EDGE_WIDTH = 1.75;
const float EDGE_FACE = 3.15;
const float PIER_MIDDLE = -2.1;
const float COURSE = 1.2;
const float BLOCK_JOINT = 1.8;
const float BLOCK_SIDE = -1.15;
const float BLOCK_BACK = -1.0;
const float SILL = 1.15;
const float LEDGE_FRONT = -1.3;
const float GLASS_FOOT = -3.03;
const float STANDOFF = 0.025;
const float RUN_BAYS = 4.0;
const float RUN_CHANCE = 0.2;
const float LEGS = 8.0;
const float BRANCH_LEAD = 0.375;
const float GUST_RATE = 0.35;
const float WIND_SPEED = 9.0;
const float WAVE_SPEED = 5.0;
const float SURGE = 1.6;
const float SURGE_LAG = 0.8;
const float STREET_LINKS = 3.0;
const vec3 POLE_DRIFT = vec3(0.0, -0.8, -2.5);
const float SLAP_EVERY = 11.0;
const float SLAP_CHANCE = 0.45;
const float SLAP_REACH = 0.45;
const float WALL_GAP = 0.012;
const float PIER_HALF = 0.7;
const vec2 STUD_HALF = vec2(0.66, 0.56);
const float STUD_HEIGHT = 0.218;
const float SPOUT_CHANCE = 0.65;
const vec3 UP = vec3(0.0, 1.0, 0.0);
const vec3 OUT = vec3(0.0, 0.0, 1.0);

struct Wire {
  float shape;
  vec3 from;
  vec3 to;
  float sag;
  float pitch;
  vec3 sway;
};

Wire wire;
float leadShare;
float slackFrom;
float slackTo;
vec3 slackBow;
vec3 lead[9];
vec3 leadFace[8];
vec2 crookKey;
vec4 fastener[8];
vec4 fastenerFace[8];
float gustRow;
float gustDelay;
float gustTravel;
vec3 flutterSway;
float flutterRate;
float flutterPhase;
float links;
vec3 onward;
float slapKey;
float size;
float thickness;
float seed;
vec2 cableTile;

float gustAt(float lag) {
  return valueNoise(vec2((uTime - lag) * GUST_RATE, gustRow)) - 0.4;
}

float flutterAt(float lag) {
  return sin(flutterRate * (uTime - lag) + flutterPhase);
}

vec3 swayAt(vec3 sway, float lag, float rest) {
  float gust = gustAt(lag);
  return sway * (gust + rest + SURGE * (gust - gustAt(lag + SURGE_LAG))) + flutterSway * flutterAt(lag);
}

float slapAt(float key) {
  float cycle = uTime / SLAP_EVERY + hash12(vec2(key, 917.0));
  if (hash12(vec2(key, floor(cycle))) > SLAP_CHANCE) return 0.0;
  float since = fract(cycle) * SLAP_EVERY;
  if (since < 0.12) return smoothstep(0.0, 0.12, since);
  return exp(-5.0 * (since - 0.12)) * abs(cos(15.0 * (since - 0.12)));
}

vec3 polePoint(Wire wire, float link) {
  float past = max(link - 1.0, 0.0);
  return link < 0.5 ? wire.from : wire.to + onward * past + POLE_DRIFT * past * past;
}

vec3 wirePoint(Wire wire, float t) {
  if (wire.shape == SPAN) {
    float along = t * links;
    float link = min(floor(along), links - 1.0);
    float u = along - link;
    vec3 start = polePoint(wire, link);
    vec3 end = polePoint(wire, link + 1.0);
    float stretch = length(end - start) / length(wire.to - wire.from);
    float lag = gustDelay + gustTravel * stretch * (link + u);
    return mix(start, end, u) - UP * 4.0 * wire.sag * stretch * u * (1.0 - u)
      + swayAt(wire.sway, lag, 0.0) * stretch * sin(3.1416 * u);
  }
  if (wire.shape == DANGLE) {
    vec3 point = mix(wire.from, wire.to, t) + swayAt(wire.sway, gustDelay + gustTravel * t, 0.4) * t * t;
    point.z = max(point.z - SLAP_REACH * slapAt(slapKey) * t, WALL_GAP);
    return point;
  }
  float angle = 6.2832 * wire.sag * t;
  vec2 oval = wire.to.xy * (1.0 + 0.12 * sin(angle * 0.37 + wire.to.z));
  vec3 across = vec3(cos(wire.pitch), 0.0, sin(wire.pitch));
  vec3 point = wire.from + across * (oval.x * sin(angle) + 0.05 * t) - UP * oval.y * (1.0 - cos(angle));
  return point + wire.sway * (wire.from.y - point.y) / (2.0 * wire.to.y);
}

float pierFace(vec2 at) {
  float pier = cableTile.x + floor((at.x - PIER_MIDDLE) / uBay + 0.5);
  float across = at.x - (pier - cableTile.x) * uBay - PIER_MIDDLE;
  if (abs(across) > PIER_HALF) return -1e3;
  if (blockless(vec2(pier, 0.0)) < 0.5) return 0.0;
  float lifted = at.y + 0.5 * uTileHeight * (mod(abs(cableTile.x), 2.0) - mod(abs(pier), 2.0));
  float rows = floor(lifted / uTileHeight);
  vec2 tile = vec2(pier, mod(cableTile.y + rows, 4096.0));
  float y = lifted - rows * uTileHeight;
  float storey = 2.0 * tile.y + mod(abs(pier), 2.0) + floor(y / (0.5 * uTileHeight));
  if (mod(storey, uPlantEvery) < 0.5 || studDamage(tile, y) < STUD_MISSING) return 0.0;
  vec2 slope = 1.0 - abs(vec2(across, mod(y, STUD_BAND) - 0.5 * STUD_BAND)) / STUD_HALF;
  return STUD_HEIGHT * max(min(slope.x, slope.y), 0.0);
}

float wireRadius(float size) {
  if (size < 0.3) return mix(0.0025, 0.003, size / 0.3);
  if (size < 0.85) return mix(0.005, 0.009, (size - 0.3) / 0.55);
  return mix(0.0125, 0.015, (size - 0.85) / 0.15);
}

vec3 clearOfWall(vec3 point) {
  float face = pierFace(point.xy);
  if (point.z < face - 0.3) return point;
  return vec3(point.xy, max(point.z, face + wireRadius(size) * thickness));
}

vec3 cableAt(float t) {
  if (t >= leadShare && leadShare < 1.0) return clearOfWall(wirePoint(wire, (t - leadShare) / (1.0 - leadShare)));
  float u = (1.0 - t / leadShare) * LEGS;
  int leg = min(int(u), 7);
  vec3 point = mix(lead[leg], lead[leg + 1], u - float(leg));
  float slack = clamp((u - slackFrom) / (slackTo - slackFrom), 0.0, 1.0);
  point += slackBow * 4.0 * slack * (1.0 - slack);

  float f = u - float(leg);
  vec3 reach = lead[leg + 1] - lead[leg];
  float span = length(reach);
  vec3 along = reach / max(span, 0.0001);
  vec3 face = leadFace[leg];
  vec3 fall = -UP + face * dot(UP, face);
  fall -= along * dot(fall, along);
  vec3 across = cross(face, along);
  float key = float(leg) * 3.1;
  vec4 crook = vec4(hash12(crookKey + key), hash12(crookKey + key + 17.0), hash12(crookKey + key + 29.0),
    hash12(crookKey + key + 41.0));
  float arch = sin(3.1416 * f);
  float bend = (crook.y - 0.5) * arch + (crook.z - 0.5) * sin(6.2832 * f) + 0.5 * (crook.w - 0.5) * sin(9.4248 * f);
  float run = f * span;
  float pinned = clamp(min(run, span - run) / 0.12, 0.0, 1.0);
  vec2 kink = vec2(valueNoise(vec2(run * 2.6, crook.x * 37.0 + key)), valueNoise(vec2(run * 3.4, crook.y * 41.0 + key)))
    - 0.5;
  return clearOfWall(point + fall * span * mix(0.04, 0.12, crook.x) * arch + across * span * 0.08 * bend
    + face * min(0.03, span * 0.02) * crook.w * arch
    + (across * 0.07 * kink.x + fall * 0.05 * kink.y + face * 0.025 * abs(kink.y)) * pinned);
}

void fasten(int slot, vec3 point, vec3 face, float depth, float kind) {
  float relief = pierFace(point.xy);
  if (face.z > 0.5 && relief > 0.0) {
    float front = max(point.z, relief + WALL_GAP);
    depth += front - point.z - relief;
    point.z = front;
  }
  fastener[slot] = vec4(point, kind);
  fastenerFace[slot] = vec4(face, depth);
}

void leadTail(float side, float y, float floorY, float lane) {
  lead[6] = vec3(side * (SIDE_WALL - 0.02), y, LEDGE_FRONT + 0.02);
  lead[7] = vec3(side * 1.1, y, LEDGE_FRONT - 0.1);
  lead[8] = vec3(side * (1.0 - 0.06 * lane), y, GLASS_FOOT);
  fasten(6, lead[6], vec3(-side, 0.0, 0.0), 0.02, CLIP);
  fasten(7, lead[7], UP, y - floorY, CLIP);
  leadFace[6] = UP;
  leadFace[7] = UP;
}

void pierLead(vec3 from, float side, float lane, float base) {
  float edge = side * (SIDE_WALL + 0.06 + 0.05 * lane);
  float y = base + SILL + STANDOFF + 0.03 * lane;
  lead[0] = from;
  lead[1] = vec3(edge, from.y, from.z);
  lead[2] = vec3(edge, mix(from.y, y, 0.5), from.z);
  lead[3] = vec3(edge, y, from.z);
  lead[4] = vec3(side * (SIDE_WALL - 0.02), y, STANDOFF);
  lead[5] = vec3(side * (SIDE_WALL - 0.02), y, -0.65);
  leadTail(side, y, base + SILL, lane);
  leadFace[4] = vec3(-side, 0.0, 0.0);
  leadFace[5] = vec3(-side, 0.0, 0.0);
  fasten(1, lead[1], OUT, from.z, CLIP);
  fasten(2, lead[2], OUT, from.z, CLIP);
  fasten(3, lead[3], OUT, from.z, CLIP);
  fasten(5, lead[5], vec3(-side, 0.0, 0.0), 0.02, CLIP);
}

void blockLead(vec3 from, float front, float lane, float base) {
  float y = base + SILL + STANDOFF + 0.03 * lane;
  lead[0] = from;
  lead[1] = vec3(BLOCK_SIDE - 0.06, from.y, front);
  lead[2] = vec3(BLOCK_SIDE - 0.06, y, front);
  lead[3] = vec3(BLOCK_SIDE + 0.02, y, front);
  lead[4] = vec3(BLOCK_SIDE + 0.02, y, BLOCK_BACK - 0.02);
  lead[5] = vec3(-(SIDE_WALL - 0.02), y, BLOCK_BACK - 0.02);
  leadTail(-1.0, y, base + SILL, lane);
  leadFace[3] = vec3(1.0, 0.0, 0.0);
  leadFace[4] = -OUT;
  leadFace[5] = vec3(1.0, 0.0, 0.0);
  fasten(1, lead[1], OUT, STANDOFF, CLIP);
  fasten(2, lead[2], OUT, STANDOFF, CLIP);
  fasten(4, lead[4], vec3(1.0, 0.0, 0.0), 0.02, CLIP);
  fasten(5, lead[5], -OUT, 0.02, CLIP);
}

Wire streetSpan(vec3 from, vec3 reach, vec2 bend) {
  float sag = (bend.x < 0.6 ? mix(0.1, 0.16, bend.y) : mix(0.04, 0.07, bend.y)) * length(reach);
  vec3 aim = vec3(hash12(reach.xz * 3.1), hash12(reach.yz * 5.7), hash12(reach.xy * 2.3));
  links = STREET_LINKS;
  onward = vec3(sign(reach.x) * mix(16.0, 28.0, aim.x), mix(-2.0, 1.0, aim.y), -mix(1.0, 6.0, aim.z));
  gustTravel = length(reach) / WAVE_SPEED;
  flutterSway = vec3(0.15, 0.0, 0.0);
  return Wire(SPAN, from, from + reach, sag, 0.0, vec3(0.0, 0.0, 0.5));
}

Wire branch(vec2 room, vec3 from, vec3 pick, vec2 bend) {
  float side = (mod(room.x, 2.0) < 0.5) != (bend.y < 0.2) ? 1.0 : -1.0;
  vec3 reach = vec3(side * mix(1.2, 2.6, pick.x) * uBay, -mix(4.0, 12.0, pick.y), mix(9.0, 16.0, pick.z));
  return streetSpan(from, reach, bend);
}

vec3 runClip(vec2 pier, float x, float joint, float second) {
  float shift = hash12(pier + 721.0 + 7.0 * second);
  float depth = hash12(pier + 723.0 + 7.0 * second);
  float along = ladderBeside(pier.x, pier.y) ? mix(-0.08, -0.02, shift) + 0.1 * second : mix(-0.5, 0.5, shift);
  return vec3(x + along, joint, 0.03 + 0.06 * second + 0.03 * depth);
}

bool clearWindow(vec2 room) {
  return !sheeted(room) && !glassBlocks(room) && !boarded(room) && !papered(room) && !grilled(room)
    && !airConditioned(room);
}

bool jointDucted(float pier, float storey) {
  return ducted(vec2(pier, storey), 0.0) || ducted(vec2(pier, mod(storey + 1.0, 8192.0)), 0.0);
}

bool bareAt(float pier, vec2 room, float storey) {
  return mod(storey + abs(pier - room.x), 2.0) > 0.5;
}

float barePierOf(float bay, vec2 room, float storey) {
  return mod(storey + abs(bay - room.x), 2.0) < 0.5 ? bay + 1.0 : bay;
}

void link(float side, float base, float sag, vec3 sway) {
  float y = base + SILL + STANDOFF + 0.15;
  float far = side * uBay;
  lead[0] = vec3(side * 0.7, y, GLASS_FOOT);
  lead[1] = vec3(side * (SIDE_WALL - 0.02), y, LEDGE_FRONT + 0.02);
  lead[2] = vec3(side * (SIDE_WALL - 0.02), y, -0.65);
  lead[3] = vec3(side * (SIDE_WALL - 0.02), y, STANDOFF);
  lead[4] = vec3(side * (SIDE_WALL + 0.05), y, STANDOFF);
  lead[5] = vec3(far - side * (SIDE_WALL + 0.05), y, STANDOFF);
  lead[6] = vec3(far - side * (SIDE_WALL - 0.02), y, STANDOFF);
  lead[7] = vec3(far - side * (SIDE_WALL - 0.02), y, LEDGE_FRONT + 0.02);
  lead[8] = vec3(far - side * 0.7, y, GLASS_FOOT);
  slackFrom = 4.0;
  slackTo = 5.0;
  leadFace[0] = UP;
  leadFace[1] = vec3(-side, 0.0, 0.0);
  leadFace[2] = vec3(-side, 0.0, 0.0);
  leadFace[3] = OUT;
  leadFace[4] = OUT;
  leadFace[5] = OUT;
  leadFace[6] = vec3(side, 0.0, 0.0);
  leadFace[7] = UP;
  slackBow = -UP * sag + sway;
  fasten(1, lead[1], vec3(-side, 0.0, 0.0), 0.02, CLIP);
  fasten(2, lead[2], vec3(-side, 0.0, 0.0), 0.02, CLIP);
  fasten(4, lead[4], OUT, STANDOFF, CLIP);
  fasten(5, lead[5], OUT, STANDOFF, CLIP);
  fasten(7, lead[7], vec3(side, 0.0, 0.0), 0.02, CLIP);
}

void riser(float side, float base, float storeys) {
  float low = base + SILL + STANDOFF + 0.18;
  float high = low + storeys * 0.5 * uTileHeight;
  float wall = side * (SIDE_WALL - 0.02);
  lead[0] = vec3(side * 0.64, low, GLASS_FOOT);
  for (int i = 1; i < 8; i++) {
    lead[i] = vec3(wall, mix(low, high, float(i - 1) / 6.0), -1.55);
    fasten(i, lead[i], vec3(-side, 0.0, 0.0), 0.02, CLIP);
  }
  lead[8] = vec3(side * 0.64, high, GLASS_FOOT);
  for (int i = 1; i < 7; i++) leadFace[i] = vec3(-side, 0.0, 0.0);
  leadFace[0] = UP;
  leadFace[7] = UP;
}

void hanger(float x, float shift, float base, float storeys, vec3 bow) {
  float low = base - storeys * 0.5 * uTileHeight;
  float front = LEDGE_FRONT + 0.02;
  lead[0] = vec3(x, base + SILL + 0.02, GLASS_FOOT);
  lead[1] = vec3(x, base + SILL + 0.02, front);
  lead[2] = vec3(x, base + 0.55, front);
  lead[6] = vec3(x + shift, low + SILL + 0.02, front);
  lead[3] = mix(lead[2], lead[6], 0.25);
  lead[4] = mix(lead[2], lead[6], 0.5);
  lead[5] = mix(lead[2], lead[6], 0.75);
  lead[7] = vec3(x + shift, low + SILL + 0.02, -2.2);
  lead[8] = vec3(x + shift, low + SILL + 0.02, GLASS_FOOT);
  slackFrom = 2.0;
  slackTo = 6.0;
  leadFace[0] = UP;
  leadFace[6] = UP;
  leadFace[7] = UP;
  slackBow = bow;
  fasten(1, lead[1], OUT, 0.02, CLIP);
  fasten(6, lead[6], OUT, 0.02, CLIP);
  fasten(7, lead[7], UP, 0.02, CLIP);
}

bool pipedLedge(vec2 room) {
  float kind = hash12(room + 509.0);
  return hash12(room + 507.0) < SPOUT_CHANCE && kind >= 0.52 && kind < 0.78 && hash12(room + 229.0) <= 0.55;
}

bool layCable(vec2 room, vec2 tile, float storey, float index) {
  leadShare = 0.0;
  cableTile = tile;
  crookKey = room * 1.37 + index * 7.1;
  for (int i = 0; i < 8; i++) leadFace[i] = OUT;
  slackFrom = 0.0;
  slackTo = 1.0;
  slackBow = vec3(0.0);
  for (int i = 0; i < 8; i++) fastener[i] = vec4(0.0);
  links = 1.0;
  onward = vec3(0.0);
  flutterSway = vec3(0.0);
  if (plantFloor(room)) return false;
  float x = room.x * uBay;
  bool leftPier = x - SIDE_WALL - EDGE_WIDTH > -uOuterX + 0.01;
  bool rightPier = x + SIDE_WALL + EDGE_WIDTH < uOuterX - 0.01;
  float base = storey * 0.5 * uTileHeight;
  float key = index * 13.0 + 401.0;
  float chance = hash12(room + key);
  vec3 pick = vec3(hash12(room + key + 1.0), hash12(room + key + 2.0), hash12(room + key + 3.0));
  vec3 more = vec3(hash12(room + key + 4.0), hash12(room + key + 5.0), hash12(room + key + 6.0));
  size = hash12(room + key + 7.0);
  thickness = hash12(room + key + 8.0) < 0.18 ? 2.0 : 1.0;
  seed = pick.y;
  vec2 bend = vec2(hash12(room + key + 9.0), hash12(room + key + 10.0));
  gustRow = room.y * 0.3 + room.x * 0.7;
  gustDelay = 0.6 * hash12(room + key + 11.0);
  gustTravel = 0.0;
  flutterRate = mix(1.6, 2.6, pick.x);
  flutterPhase = pick.y * 40.0;
  slapKey = pick.z * 97.0 + index;
  float gust = gustAt(gustDelay);
  float flutter = flutterAt(gustDelay);
  float side = storey < 0.5 ? 1.0 : -1.0;
  float bareX = storey < 0.5 ? uBay + PIER_MIDDLE : PIER_MIDDLE;
  bool barePier = storey < 0.5 ? rightPier : leftPier;
  float pier = storey < 0.5 ? room.x + 1.0 : room.x;
  bool ladder = ladderBeside(pier, room.y);
  bool clear = clearWindow(room);

  if (index < 1.5) {
    if (!barePier || !clear || chance > 0.105) return false;
    if (index < 0.5 ? plantFloor(room + vec2(0.0, 1.0)) || jointDucted(pier, room.y) : ducted(vec2(pier, room.y), 0.0)) {
      return false;
    }
    vec3 from = vec3(bareX - side * mix(ladder ? 0.4 : 0.35, 0.55, more.y), base + (3.0 - index) * COURSE, STANDOFF);
    pierLead(from, side, index, base);
    fasten(0, from, OUT, STANDOFF, ANCHOR);
    wire = branch(room, from, pick, bend);
    leadShare = BRANCH_LEAD;
    size = mix(0.3, 1.0, size);
    return true;
  }
  if (index < 2.5) {
    if (storey > 0.5 || !leftPier || !clear || chance > 0.135) return false;
    if (blockless(tile) > 0.5 || blockRemoved(tile) || holedBlock(tile) || ducted(room, 0.0)) return false;
    float front = BLOCK_FRONT - blockInset(tile) + STANDOFF;
    vec3 from = vec3(mix(-2.85, -1.6, more.x), BLOCK_JOINT, front);
    blockLead(from, front, 2.0, base);
    fasten(0, from, OUT, STANDOFF, ANCHOR);
    wire = branch(room, from, pick, bend);
    leadShare = BRANCH_LEAD;
    size = mix(0.3, 1.0, size);
    return true;
  }
  if (index > 9.5) {
    if (!clear) return false;
    leadShare = 1.0;
    size = mix(0.2, 0.9, size);
    if (index < 10.5) {
      vec2 neighbour = room + vec2(side, 0.0);
      if (!barePier || ladder || chance > 0.1 || !clearWindow(neighbour)) return false;
      link(side, base, mix(0.15, 0.5, pick.x), vec3(0.02 * flutter, 0.0, 0.04 + 0.08 * (gust + 0.4)));
      return true;
    }
    if (index < 11.5) {
      if (chance > 0.08) return false;
      float wallSide = more.x < 0.5 ? -1.0 : 1.0;
      if (wallSide < 0.0 ? !leftPier : !rightPier) return false;
      float storeys = 1.0 + floor(4.0 * pick.x);
      if (runIn(room.x, room.y)) return false;
      for (int i = 1; i <= 4; i++) {
        if (float(i) > storeys) break;
        vec2 above = vec2(room.x, mod(room.y + float(i), 8192.0));
        if (plantFloor(above) || airConditioned(above) && airConditionerMount(above).w == wallSide) return false;
        if (pipedLedge(above) || float(i) < storeys && runIn(room.x, above.y)) return false;
      }
      if (!clearWindow(vec2(room.x, mod(room.y + storeys, 8192.0)))) return false;
      riser(wallSide, base, storeys);
      return true;
    }
    if (chance > 0.08) return false;
    float storeys = pick.x < 0.7 ? 1.0 : 2.0;
    for (int i = 1; i <= 2; i++) {
      if (float(i) > storeys) break;
      if (plantFloor(room - vec2(0.0, float(i)))) return false;
    }
    if (!clearWindow(vec2(room.x, mod(room.y - storeys, 8192.0)))) return false;
    hanger(mix(-0.8, 0.8, more.x), mix(-0.3, 0.3, more.y), base, storeys,
      vec3(0.03 * flutter, 0.0, mix(0.06, 0.15, pick.z) + 0.06 * (gust + 0.4)));
    return true;
  }

  float lastBay = floor((uOuterX - EDGE_FACE) / uBay + 0.5) - 1.0;
  vec2 line = vec2(0.0, room.y);
  float shift = floor(RUN_BAYS * hash12(line + 701.0));
  float group = floor((room.x + shift) / RUN_BAYS);
  vec2 run = vec2(group, room.y);
  float first = max(group * RUN_BAYS - shift, -lastBay);
  float last = min(group * RUN_BAYS - shift + RUN_BAYS - 1.0, lastBay);
  if (ladderBeside(first, room.y)) first += 1.0;
  if (ladderBeside(last + 1.0, room.y)) last -= 1.0;
  if (hash12(run + 703.0) > RUN_CHANCE || last <= first || room.x < first || room.x > last) return false;
  if (plantFloor(room + vec2(0.0, 1.0))) return false;

  bool bareFirst = bareAt(first, room, storey);
  bool bareLast = bareAt(last + 1.0, room, storey);
  bool firstDucted = jointDucted(first, room.y);
  bool lastDucted = jointDucted(last + 1.0, room.y);
  if (firstDucted && lastDucted) return false;
  bool feedLeft = firstDucted || lastDucted ? lastDucted : bareFirst != bareLast ? bareFirst : hash12(run + 731.0) < 0.5;
  float feedPier = feedLeft ? first : last + 1.0;
  float endPier = feedLeft ? last + 1.0 : first;
  float target = feedLeft ? first + 1.0 + floor(hash12(run + 735.0) * (last - first))
                          : last - 1.0 - floor(hash12(run + 735.0) * (last - first));
  float targetPier = barePierOf(target, room, storey);
  bool doubled = hash12(run + 705.0) < 0.55 && clearWindow(vec2(target, room.y));
  float joint = base + 3.0 * COURSE;
  float second = index == 4.0 || index == 6.0 || index == 9.0 ? 1.0 : 0.0;
  if (second > 0.5 && !doubled) return false;
  size = mix(0.5, 1.0, hash12(run + 711.0 + second));
  thickness = hash12(run + 719.0 + second) < 0.25 ? 2.0 : 1.0;
  seed = hash12(run + 713.0 + second);
  gustRow = room.y * 0.3;
  gustDelay = (x + PIER_MIDDLE) / WIND_SPEED;
  gustTravel = uBay / WIND_SPEED;
  flutterRate = 2.1;
  flutterPhase = hash12(run + 709.0) * 40.0;

  if (index < 4.5) {
    float lo = second > 0.5 ? min(feedPier, targetPier) : first;
    float hi = second > 0.5 ? max(feedPier, targetPier) : last + 1.0;
    if (room.x < lo || room.x + 1.0 > hi) return false;
    vec3 from = runClip(room, PIER_MIDDLE, joint, second);
    vec3 to = runClip(room + vec2(1.0, 0.0), uBay + PIER_MIDDLE, joint, second);
    float slack = hash12(room + 713.0 + second);
    float sag = slack > 0.85 ? mix(0.9, 1.2, pick.z) : mix(0.15, 0.7, slack * slack);
    if (ladderBeside(room.x, room.y) || ladderBeside(room.x + 1.0, room.y)) sag = min(sag, 0.4);
    flutterSway = vec3(0.02, 0.0, 0.02) * (0.3 + sag);
    wire = Wire(SPAN, from, to, sag, 0.0, vec3(0.0, 0.0, 0.25) * (0.3 + sag));
    fasten(0, from, OUT, from.z, CLIP);
    if (room.x + 1.0 == hi) fasten(1, to, OUT, to.z, CLIP);
    return true;
  }
  if (index < 6.5) {
    if (room.x != (feedLeft ? first : last)) return false;
    vec3 from = runClip(vec2(feedPier, room.y), feedLeft ? PIER_MIDDLE : uBay + PIER_MIDDLE, joint, second);
    float outward = feedLeft ? -1.0 : 1.0;
    vec3 aim = vec3(hash12(run + 741.0), hash12(run + 743.0), hash12(run + 745.0));
    vec2 runBend = vec2(hash12(run + 747.0), hash12(run + 749.0));
    bool edge = (feedLeft ? first == -lastBay : last == lastBay) && hash12(run + 733.0) < 0.6;
    vec3 reach = edge
      ? vec3(outward * mix(5.0, 12.0, aim.x), -mix(3.0, 8.0, aim.y), mix(8.0, 14.0, aim.z))
      : vec3(outward * mix(1.2, 2.6, aim.x) * uBay, -mix(4.0, 12.0, aim.y), mix(9.0, 16.0, aim.z));
    if (!bareAt(feedPier, room, storey)) {
      reach = vec3(reach.x, -mix(2.0, 4.0, aim.y), max(reach.z, 12.0));
      runBend.x = 1.0;
    }
    reach += vec3(0.4, 0.3, 0.6) * second;
    wire = streetSpan(from, reach, runBend);
    gustDelay = (x + from.x) / WIND_SPEED;
    fasten(0, from, OUT, from.z, ANCHOR);
    return true;
  }
  if (index < 7.5) {
    if (room.x != (feedLeft ? last : first)) return false;
    vec3 from = runClip(vec2(endPier, room.y), feedLeft ? uBay + PIER_MIDDLE : PIER_MIDDLE, joint, 0.0);
    vec2 oval = vec2(mix(0.18, 0.3, pick.y), mix(0.12, 0.22, pick.z));
    float tilt = mix(-0.35, 0.35, more.z);
    from.z += oval.x * abs(sin(tilt));
    float swing = 0.12 * (gust + 0.4) + 0.02 * flutter;
    wire = Wire(COIL, from, vec3(oval, 9.0 * pick.x), 2.0 + floor(3.0 * more.x), tilt, vec3(0.2 * swing, 0.0, swing));
    return true;
  }
  if (!barePier) return false;
  if (index > 8.5) {
    if (room.x != target) return false;
    pierLead(runClip(vec2(targetPier, room.y), bareX, joint, 1.0), side, 4.0, base);
    leadShare = 1.0;
    return true;
  }
  vec3 clip = runClip(vec2(storey < 0.5 ? room.x + 1.0 : room.x, room.y), bareX, joint, 0.0);
  if (clear && chance < 0.4) {
    pierLead(clip, side, 3.0, base);
    leadShare = 1.0;
    return true;
  }
  if (chance > 0.6 || ladder) return false;
  float drop = mix(0.5, 1.4, pick.x);
  vec3 to = clip + vec3(side * mix(-0.1, 0.1, pick.y), -drop, mix(0.0, 0.2, pick.z));
  gustTravel = 0.6;
  flutterSway = vec3(0.05, 0.0, 0.0) * 0.3 * drop;
  wire = Wire(DANGLE, clip, to, 0.0, 0.0, vec3(0.0, 0.0, 0.3) * 0.3 * drop);
  return true;
}
