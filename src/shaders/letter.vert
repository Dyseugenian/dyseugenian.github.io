precision highp float;
precision highp int;

uniform float uTileHeight;

#include "chunks/hash.glsl"
#include "chunks/rooms.glsl"
#include "chunks/inset.glsl"
#include "chunks/ducts.glsl"
#include "chunks/glyphs.glsl"
#include "chunks/presence.glsl"

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
uniform float uFogDensity;
uniform vec3 uConcrete;
uniform vec3 uLinen;
uniform vec3 uSalt;
uniform vec3 uMadder;
uniform vec3 uGrime;
uniform vec3 uDenim;

in vec3 position;
in vec3 aOffset;
in vec2 aTile;
in float aStorey;
in float aIndex;

out vec2 vGlyph;
out vec2 vWall;
flat out vec4 vShape;
flat out vec4 vHand;
flat out vec3 vPaint;
flat out float vFade;
flat out float vBlur;

const float CHANCE = 0.3;
const float BAND_CHANCE = 0.35;
const float WEATHERED = 0.4;
const float LINE_STEP = 1.45;
const float GAP = 1.3 / 6.0;
const int LONGEST = 32;
const vec2 FADE = vec2(55.0, 70.0);

const float BRUSH = 0.0;
const float MARKER = 1.0;
const float CHALK = 2.0;
const float SPRAY = 3.0;
const float SIGN = 4.0;
const float SIDE_WALL = 1.4;

struct Area {
  vec3 center;
  vec2 size;
  ivec2 messages;
  vec4 hands;
  float side;
};

bool sideOf(vec2 room, float base, out Area area) {
  float side = room.x < 0.5 ? -1.0 : 1.0;
  if (abs(room.x) > 2.5 || airConditioned(room) && airConditionerMount(room).w == side) return false;
  bool block = blockBack(room.x + max(side, 0.0), room.y) < 1e2;
  vec3 center = vec3(side * SIDE_WALL, base + (block ? 3.15 : 2.1), -0.65);
  area = Area(center, vec2(1.1, block ? 0.65 : 1.0), MESSAGES_SIDE, vec4(0.5, 0.5, 1.0, 1.0), side);
  return true;
}

bool areaOf(vec2 tile, float storey, vec2 room, out Area area) {
  vec2 climbed = vec2(tile.x, mod(tile.y + uTilesClimbed, 4096.0));
  float base = storey * 0.5 * uTileHeight;
  float pick = hash12(room + 1303.0);
  bool blocked = blockless(tile) < 0.5 && abs(tile.x - 0.5) < 2.6;
  if (plantFloor(room)) {
    if (hash12(room + 1301.0) > BAND_CHANCE) return false;
    area = Area(vec3(-0.7, base + 0.28, 0.6), vec2(3.6, 0.42), MESSAGES_BAND, vec4(0.25, 0.25, 0.25, 0.4), 0.0);
    return true;
  }
  if (hash12(room + 1301.0) > CHANCE) return false;
  if (pick >= 0.3 && pick < 0.45 && sideOf(room, base, area)) return true;
  if (pick < 0.45) {
    area = Area(vec3(0.0, base + 0.85, -1.3), vec2(2.2, 0.5), MESSAGES_LEDGE, vec4(0.45, 0.6, 0.7, 0.9), 0.0);
    return true;
  }
  if (pick < 0.75) {
    if (!blocked || storey < 0.5 || ladderBeside(tile.x, room.y) || ducted(room, storey)) return false;
    area = Area(vec3(-2.1, base + 2.9, 0.0), vec2(1.2, 1.4), MESSAGES_PIER, vec4(0.15, 0.35, 0.5, 0.7), 0.0);
    return true;
  }
  if (!blocked || storey > 0.5 || blockRemoved(climbed) || holedBlock(climbed) || ducted(room, storey)) return false;
  float front = BLOCK_FRONT - blockInset(climbed);
  area = Area(vec3(-2.1, base + 1.8, front), vec2(1.6, 1.4), MESSAGES_BLOCK, vec4(0.4, 0.4, 0.4, 0.75), 0.0);
  return true;
}

float handOf(vec4 hands, float pick) {
  return pick < hands.x ? BRUSH : pick < hands.y ? MARKER : pick < hands.z ? CHALK : pick < hands.w ? SPRAY : SIGN;
}

vec3 paintOf(float hand, float pick, bool pale) {
  if (pale) return pick < 0.5 ? uSalt * 1.6 : uLinen * 1.4;
  if (hand == CHALK) return pick < 0.4 ? uSalt * 1.6 : uLinen * 1.3;
  if (hand == MARKER) return pick < 0.6 ? uGrime : pick < 0.85 ? uDenim : uMadder;
  if (hand == SIGN) return pick < 0.4 ? uMadder : pick < 0.75 ? uLinen : uGrime;
  if (hand == SPRAY) return pick < 0.4 ? uGrime : pick < 0.65 ? uMadder : pick < 0.85 ? uLinen : uDenim;
  return pick < 0.35 ? uLinen : pick < 0.6 ? uMadder : pick < 0.8 ? uGrime : uDenim;
}

void main() {
  gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  vec2 room = roomOf(aTile, aStorey);
  Area area;
  if (!areaOf(aTile, aStorey, room, area)) return;

  float seed = hash12(room + 1307.0);
  int message = area.messages.x + int(hash12(room + 1309.0) * float(area.messages.y));
  float storeyNumber = area.messages == MESSAGES_PIER
    ? ceil((room.y + 1.0) / uPlantEvery) * uPlantEvery + 1.0
    : room.y + 1.0;
  int number = int(storeyNumber);
  int digits = number >= 1000 ? 4 : number >= 100 ? 3 : number >= 10 ? 2 : 1;

  int codes[LONGEST];
  int count = 0;
  ivec2 span = MESSAGES[message];
  for (int k = 0; k < span.y; k++) {
    int code = MESSAGE_CODES[span.x + k];
    if (code == GLYPH_NUMBER) {
      for (int d = digits - 1; d >= 0; d--) {
        int power = d == 3 ? 1000 : d == 2 ? 100 : d == 1 ? 10 : 1;
        codes[count++] = GLYPH_DIGITS + (number / power) % 10;
      }
    } else {
      codes[count++] = code;
    }
  }

  float hand = handOf(area.hands, hash12(room + 1311.0));
  bool vertical = (area.messages == MESSAGES_PIER || area.messages == MESSAGES_SIDE) && count <= 6 && hash12(room + 1313.0) < 0.35;
  for (int k = 0; k < count; k++) {
    if (codes[k] == GLYPH_NEWLINE) vertical = false;
  }

  float widest = 0.0;
  float lines = 1.0;
  float line = 0.0;
  int slot = int(aIndex);
  int seen = 0;
  int code = -1;
  float lineIndex = 0.0;
  float cursor = 0.0;
  float lineStart = 0.0;
  for (int k = 0; k < count; k++) {
    int c = codes[k];
    bool breaks = c == GLYPH_NEWLINE || vertical && k > 0;
    if (breaks) {
      widest = max(widest, line - GAP);
      line = 0.0;
      lines += 1.0;
    }
    if (c == GLYPH_NEWLINE) continue;
    if (c != 0 && seen++ == slot) {
      code = c;
      lineIndex = lines - 1.0;
      cursor = line;
    }
    line += GLYPHS[c].z;
  }
  widest = max(widest, line - GAP);
  if (code < 0) return;
  if (uPresence > 0.5) {
    markPresent();
    return;
  }

  float lineWidth = 0.0;
  float row = 0.0;
  line = 0.0;
  for (int k = 0; k < count; k++) {
    int c = codes[k];
    if (c == GLYPH_NEWLINE || vertical && k > 0) {
      if (row == lineIndex) lineWidth = line - GAP;
      row += 1.0;
      line = 0.0;
    }
    if (c != GLYPH_NEWLINE) line += GLYPHS[c].z;
  }
  if (row == lineIndex) lineWidth = line - GAP;

  vec4 shapes = vec4(hash12(room + 1315.0), hash12(room + 1317.0), hash12(room + 1319.0), hash12(room + 1321.0));
  vec2 caps = hand == BRUSH ? vec2(0.18, 0.45) : hand == MARKER ? vec2(0.08, 0.18)
    : hand == CHALK ? vec2(0.12, 0.3) : hand == SPRAY ? vec2(0.2, 0.5) : vec2(0.12, 0.3);
  vec2 widths = hand == BRUSH ? vec2(0.07, 0.12) : hand == MARKER ? vec2(0.04, 0.06)
    : hand == CHALK ? vec2(0.05, 0.08) : hand == SPRAY ? vec2(0.06, 0.1) : vec2(0.09, 0.13);
  float steady = hand == SIGN ? 0.3 : 1.0;
  float blockHeight = 1.0 + (lines - 1.0) * LINE_STEP;
  float cap = min(mix(caps.x, caps.y, shapes.x), min(0.95 * area.size.x / widest, area.size.y / blockHeight));
  vec2 fit = area.size / cap;

  float drift = (shapes.y - 0.5) * 0.35 * steady;
  float droop = (shapes.z - 0.5) * 0.5 * steady;
  float tilt = (shapes.w - 0.5) * 0.1 * steady;
  float slant = (hash12(room + 1323.0) - 0.3) * 0.25 * steady;
  float align = vertical ? 0.5 : hash12(room + 1325.0);
  float glyphWidth = GLYPHS[code].z - GAP;
  float start = -0.5 * fit.x + (fit.x - (vertical ? glyphWidth : lineWidth)) * align
    + (hash12(vec2(lineIndex, seed) + 1327.0) - 0.5) * 0.3 * steady;
  float top = 0.5 * blockHeight + (fit.y - blockHeight) * (hash12(room + 1329.0) - 0.5);
  float baseline = top - 1.0 - lineIndex * LINE_STEP;

  vec4 own = vec4(hash12(vec2(float(slot), seed) + 1331.0), hash12(vec2(float(slot), seed) + 1333.0),
    hash12(vec2(float(slot), seed) + 1335.0), hash12(vec2(float(slot), seed) + 1337.0));
  float measure = max(lineWidth, 1.0);
  float x = vertical ? 0.0 : cursor;
  float along = x / measure;
  float scale = (1.0 + drift * (along - 0.5)) * mix(0.93, 1.07, own.x);
  float placed = x + drift * (x * x / (2.0 * measure) - 0.5 * x) + (own.y - 0.5) * 0.1 * steady;
  float lift = droop * along * along + (own.z - 0.5) * 0.12 * steady;
  float spin = (own.w - 0.5) * 0.14 * steady;

  float width = mix(widths.x, widths.y, hash12(room + 1339.0));
  float drips = hand == BRUSH ? 0.35 : hand == SPRAY ? 0.25 : hand == SIGN ? 0.1 : 0.0;
  float pad = (hand == SPRAY ? 3.0 * width : width) + 0.12;
  float drop = drips > 0.0 ? 1.2 : 0.0;
  vec2 glyph = vec2(mix(-pad, glyphWidth + pad, position.x + 0.5), mix(-pad - drop, 1.0 + pad, position.y + 0.5));

  vec2 center = vec2(0.5 * glyphWidth, 0.5);
  vec2 turned = center + mat2(cos(spin), sin(spin), -sin(spin), cos(spin)) * (glyph - center);
  turned.x += slant * turned.y;
  vec2 text = vec2(start + placed, baseline + lift) + scale * turned;
  text = mat2(cos(tilt), sin(tilt), -sin(tilt), cos(tilt)) * text;
  vec2 wall = area.center.xy + cap * text;

  vec4 near = modelMatrix * vec4(area.center + aOffset, 1.0);
  float distance = length(near.xyz - cameraPosition);
  float standoff = 0.004 + 0.0004 * distance;
  vec3 local = area.side == 0.0
    ? vec3(wall, area.center.z + standoff)
    : vec3(area.center.x - area.side * standoff, wall.y, area.center.z + area.side * (wall.x - area.center.x));
  vec4 world = modelMatrix * vec4(local + aOffset, 1.0);
  vFade = (1.0 - smoothstep(FADE.x, FADE.y, distance)) * exp(-distance * uFogDensity);
  if (vFade <= 0.0) return;

  float worn = hash12(room + 1341.0);
  float age = hand == SIGN ? mix(0.3, 0.9, worn) : 0.8 * worn * worn;
  vec3 paint = paintOf(hand, hash12(room + 1343.0), area.side != 0.0);
  vFade *= area.side != 0.0 ? 1.8 : 1.0;
  vBlur = area.side == 0.0 && hash12(room + 1345.0) < WEATHERED ? mix(0.35, 1.0, hash12(room + 1347.0)) : 0.0;
  vPaint = clamp(pow(paint / uConcrete, vec3(1.25)), 0.0, 2.0);
  vGlyph = glyph;
  vWall = wall;
  vShape = vec4(float(code), width, 0.045 * steady, 0.05 * steady);
  vHand = vec4(hand, age, seed, drips);
  gl_Position = projectionMatrix * viewMatrix * world;
}
