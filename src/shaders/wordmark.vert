precision highp float;

#include "chunks/noise.glsl"

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uPixelSize;
uniform float uTime;
uniform vec3 uBackground;
uniform float uTetris;
uniform float uTetrisTime;
uniform vec3 uCream;
uniform vec3 uOchre;
uniform float uTetrisEnd;
uniform float uBinary;
uniform float uBinaryTime;
uniform float uMotion;
uniform float uMotionTime;

in vec3 position;
in vec3 color;
in vec2 aCell;
in vec2 aGrid;
in vec4 aPiece;
in float aCompleted;
in vec4 aDigit;
in vec3 aPen;

out vec3 vColor;

const float GHOST = 0.1;
const int DIGITS[2] = int[2](0x7B6F, 0x749A);
const float HOLLOW_END = 0.08;
const float FILL_END = 0.7;
const float BLINK_START = 0.82;
const float RESTORE_START = 0.88;
const float FLIP_RATE = 14.0;
const float DIGIT_WARM = 0.4;
const float GLIDE_TICKS = 2.0;

float blink(float size, float rate, float chance, float salt) {
  vec2 block = floor(aCell / size);
  float clock = uTime * rate + hash13(vec3(block, salt));
  float pick = hash13(vec3(block, floor(clock) + salt * 17.0));
  float shown = step(1.0 - chance, pick) * step(fract(clock), 0.4);
  float dim = step(0.5, hash13(vec3(block + 3.0, floor(clock) + salt)));
  return shown * (dim * 2.0 - 1.0);
}

float crackEdge(vec2 point) {
  vec2 base = floor(point);
  vec2 local = fract(point);
  float nearest = 8.0;
  float second = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(x, y);
      vec2 seed = base + offset;
      vec2 site = offset + vec2(hash13(vec3(seed, 1.0)), hash13(vec3(seed, 2.0))) - local;
      float distance = dot(site, site);
      if (distance < nearest) {
        second = nearest;
        nearest = distance;
      } else if (distance < second) {
        second = distance;
      }
    }
  }
  return sqrt(second) - sqrt(nearest);
}

float cracks() {
  vec2 point = aCell / 22.0;
  point += (vec2(valueNoise(vec3(aCell * 0.12, 4.0)), valueNoise(vec3(aCell * 0.12, 9.0))) - 0.5) * 0.35;
  float line = step(crackEdge(point) * 22.0, 1.1);
  float frame = floor(uTime * 12.0);
  float spread = valueNoise(vec3(aCell * 0.02, frame * 0.04));
  float grown = step(0.6, spread + 0.2 * valueNoise(vec3(aCell * 0.3, frame * 0.7)));
  float grain = step(0.2, hash13(vec3(aCell, frame)));
  return line * grown * grain;
}

float scratches() {
  vec2 direction = normalize(vec2(1.0, 0.32));
  float along = dot(aCell, direction);
  float across = dot(aCell, vec2(-direction.y, direction.x));
  across += (valueNoise(vec3(along * 0.05, across * 0.01, 2.0)) - 0.5) * 3.0;
  float band = floor(across / 7.0);
  float segment = floor(along / 36.0 + hash13(vec3(band, 5.0, 1.0)));
  float frame = floor(uTime * 12.0);
  float hold = floor(frame / 3.0 + hash13(vec3(band, segment, 3.0)) * 3.0);
  float present = step(0.92, hash13(vec3(band, segment, hold)));
  float reveal = step(fract(along / 36.0 + hash13(vec3(band, 5.0, 1.0))), hash13(vec3(band, segment, frame)) * 2.0);
  float thin = step(abs(fract(across / 7.0) - 0.5) * 7.0, 0.5);
  return present * reveal * thin;
}

vec2 turnQuarters(vec2 offset, float quarters) {
  float angle = -quarters * 1.5707963;
  return mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * offset;
}

vec3 tintAsPiece(vec3 color) {
  float tone = mix(0.25, 1.15, hash13(vec3(aPiece.xy, aPiece.z + 9.0)));
  float warmth = hash13(vec3(aPiece.xy, aPiece.z + 4.0)) * smoothstep(0.6, 1.0, tone);
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 tinted = mix(color, uOchre * luma, 0.25 * warmth);
  return min(mix(vec3(luma), tinted, smoothstep(0.25, 0.9, tone)) * tone * mix(0.6, 1.0, smoothstep(0.25, 0.7, tone)), 1.0);
}

vec3 fillWithDigits(vec3 surface) {
  float progress = uBinaryTime / uTetrisEnd;
  float scale = abs(aDigit.z);
  surface = aDigit.z < 0.0 ? uBackground : surface;
  float luma = dot(surface, vec3(0.299, 0.587, 0.114));
  vec3 ghost = mix(uBackground, uCream, GHOST * luma);
  vec3 binary = mix(surface, ghost, smoothstep(0.0, HOLLOW_END, progress));
  vec2 font = floor((aCell - aDigit.xy) / max(scale, 1.0));
  float since = uBinaryTime - mix(HOLLOW_END, FILL_END, aDigit.w) * uTetrisEnd;
  bool inGlyph = scale > 0.0 && since >= 0.0 && all(greaterThanEqual(font, vec2(0.0))) && font.x < 3.0 && font.y < 5.0;
  if (inGlyph) {
    float pick = hash13(vec3(aDigit.xy, scale));
    float maxFlips = floor(2.0 + pick * 4.0);
    float flips = min(floor(since * FLIP_RATE), maxFlips);
    int value = int(floor(pick * 8.0) + flips) & 1;
    if (((DIGITS[value] >> (int(font.y) * 3 + int(font.x))) & 1) == 1) {
      float level = flips < maxFlips ? 1.0 : mix(0.35, 1.0, pow(hash13(vec3(aDigit.xy, 5.0)), 0.7));
      float blinkPhase = (progress - BLINK_START) / (RESTORE_START - BLINK_START);
      float blink = step(0.0, blinkPhase) * step(blinkPhase, 1.0) * step(0.5, fract(blinkPhase * 2.0));
      float cooled = 1.0 - pow(1.0 - min(since / DIGIT_WARM, 1.0), 3.0);
      binary = mix(mix(uOchre, uCream * level, cooled), ghost, blink);
    }
  }
  binary = mix(binary, surface, smoothstep(RESTORE_START, 1.0, progress));
  return mix(surface, binary, uBinary);
}

vec3 penFill(vec3 surface) {
  float luma = dot(surface, vec3(0.299, 0.587, 0.114));
  vec3 ghost = mix(uBackground, uCream, GHOST * luma);
  float since = clamp((uMotionTime - aPen.z) / FLOOD_DURATION, 0.0, 1.0);
  float eased = since < 0.5 ? 4.0 * since * since * since : 1.0 - pow(2.0 - 2.0 * since, 3.0) / 2.0;
  float front = eased * (FLOOD_REACH + FLOOD_SOFT);
  float flood = 1.0 - smoothstep(front - FLOOD_SOFT, front, distance(aCell, aPen.xy));
  vec3 drawn = mix(ghost, surface, flood);
  drawn = mix(drawn, uCream, flood * (1.0 - flood) * step(0.0, luma - 0.05));
  vec3 pen = mix(surface, drawn, smoothstep(0.0, PEN_HOLLOW, uMotionTime));
  return mix(surface, pen, uMotion);
}

float glide(float since, float steps, float settle) {
  float interval = settle / (steps + 1.0);
  float moved = clamp(since / interval - 1.0, 0.0, steps);
  return floor(moved) + smoothstep(0.0, min(GLIDE_TICKS, interval), fract(moved) * interval);
}

void main() {
  float tick = floor(uTetrisTime / TICK);

#ifdef FALLING
  if (uTetris == 0.0 || tick < aPiece.z || tick >= aPiece.w) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
#endif

  float flicker = blink(2.0, 2.3, 0.015, 1.0) + blink(5.0, 1.7, 0.03, 2.0) + blink(11.0, 1.2, 0.05, 3.0);
  flicker = clamp(flicker, -1.0, 1.0);
  vec3 surface = flicker > 0.0
    ? mix(color, uBackground, flicker * 0.85)
    : min(color * (1.0 - flicker * 0.3), 1.0);
  float damage = max(cracks() * 0.7, scratches() * 0.45);
  vColor = mix(surface, uBackground, damage);

  vec2 point = position.xy;
  gl_PointSize = uPixelSize + 2.0;

#ifdef FALLING
  float clock = uTetrisTime / TICK;
  float since = clock - aPiece.z;
  float settle = max(aPiece.w - aPiece.z - 3.0, 1.0);
  float turns = floor(hash13(vec3(aPiece.xy, aPiece.z)) * 4.0);
  float slides = floor(hash13(vec3(aPiece.xy, aPiece.z + 5.0)) * 5.0) - 2.0;
  float quarters = turns - glide(since, turns, settle);
  float slide = sign(slides) * (abs(slides) - glide(since, abs(slides), settle * 0.8));
  vec2 offset = aGrid - aPiece.xy;
  point += aPiece.xy + turnQuarters(offset, quarters) - aGrid + floor(vec2(slide, aPiece.w - clock) * BLOCK + 0.5);

  vec2 inBlock = mod(aPiece.xy + round(turnQuarters(offset, round(quarters)) - 0.5) + 0.5, BLOCK);
  float shadow = float(inBlock.x > BLOCK - 2.0 || inBlock.y < 2.0);
  float light = float(inBlock.x < 2.0 || inBlock.y > BLOCK - 2.0) * (1.0 - shadow);
  vColor = tintAsPiece(vColor);
  vColor = min(vColor * (1.0 + 0.6 * light), 1.0);
  vColor = mix(vColor, uBackground, 0.5 * shadow);
  vColor = mix(uBackground, vColor, uTetris * clamp((clock - max(aPiece.z, 0.0)) / FADE_IN_TICKS, 0.0, 1.0));
#else
  if (uTetris > 0.0) {
    float landed = uTetrisTime / TICK - aPiece.w;
    float sinceComplete = tick - aCompleted;
    float luma = dot(vColor, vec3(0.299, 0.587, 0.114));
    vec3 ghost = mix(uBackground, uCream, GHOST * luma);
    vColor = mix(vColor, ghost, uTetris * (1.0 - step(0.0, landed)));
    vec3 piece = tintAsPiece(vColor);
    vec3 flashed = mix(piece, uCream, 0.45 * (1.0 - smoothstep(0.0, 2.0, landed)));
    vec3 locking = mix(flashed, vColor, smoothstep(1.5, 4.0, landed));
    vColor = mix(vColor, locking, uTetris * step(0.0, landed));
    float blinking = step(0.0, sinceComplete) * step(sinceComplete, CLEAR_TICKS - 1.0) * mod(sinceComplete, 2.0);
    vColor = mix(vColor, ghost, blinking * (1.0 - sinceComplete / CLEAR_TICKS) * uTetris);
  }
  if (uBinary > 0.0) vColor = fillWithDigits(vColor);
  if (uMotion > 0.0) vColor = penFill(vColor);
#endif

  if (all(lessThanEqual((vColor - uBackground) * SIGN, vec3(0.0)))) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(point, position.z, 1.0);
}
