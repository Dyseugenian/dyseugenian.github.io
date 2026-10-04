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

in vec3 position;
in vec3 color;
in vec2 aCell;
in vec2 aGrid;
in vec4 aPiece;
in float aCompleted;

out vec3 vColor;

const float GHOST = 0.1;

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
  float c = round(cos(angle));
  float s = round(sin(angle));
  return mat2(c, s, -s, c) * offset;
}

vec3 tintAsPiece(vec3 color) {
  float tone = mix(0.25, 1.15, hash13(vec3(aPiece.xy, aPiece.z + 9.0)));
  float warmth = hash13(vec3(aPiece.xy, aPiece.z + 4.0)) * smoothstep(0.6, 1.0, tone);
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 tinted = mix(color, uOchre * luma, 0.25 * warmth);
  return min(mix(vec3(luma), tinted, smoothstep(0.25, 0.9, tone)) * tone * mix(0.6, 1.0, smoothstep(0.25, 0.7, tone)), 1.0);
}

float stepsDone(float since, float steps, float settle) {
  return min(floor(since * (steps + 1.0) / settle), steps);
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
  float since = tick - aPiece.z;
  float settle = max(aPiece.w - aPiece.z - 3.0, 1.0);
  float turns = floor(hash13(vec3(aPiece.xy, aPiece.z)) * 4.0);
  float slides = floor(hash13(vec3(aPiece.xy, aPiece.z + 5.0)) * 5.0) - 2.0;
  float quarters = turns - stepsDone(since, turns, settle);
  float slide = sign(slides) * (abs(slides) - stepsDone(since, abs(slides), settle * 0.8));
  vec2 grid = aPiece.xy + turnQuarters(aGrid - aPiece.xy, quarters) + vec2(slide, aPiece.w - tick) * BLOCK;
  point += grid - aGrid;

  vec2 inBlock = mod(grid, BLOCK);
  float shadow = float(inBlock.x > BLOCK - 2.0 || inBlock.y < 2.0);
  float light = float(inBlock.x < 2.0 || inBlock.y > BLOCK - 2.0) * (1.0 - shadow);
  vColor = tintAsPiece(vColor);
  vColor = min(vColor * (1.0 + 0.6 * light), 1.0);
  vColor = mix(vColor, uBackground, 0.5 * shadow);
  vColor = mix(uBackground, vColor, uTetris * min((tick - max(aPiece.z, 0.0) + 1.0) / FADE_IN_TICKS, 1.0));
#else
  float sinceLand = tick - aPiece.w;
  float sinceComplete = tick - aCompleted;
  float luma = dot(vColor, vec3(0.299, 0.587, 0.114));
  vec3 ghost = mix(uBackground, uCream, GHOST * luma);
  vColor = mix(vColor, ghost, uTetris * step(sinceLand, -1.0));
  vec3 piece = tintAsPiece(vColor);
  vec3 locking = sinceLand == 0.0 ? mix(piece, uCream, 0.45)
    : sinceLand <= 2.0 ? piece
    : mix(piece, vColor, 0.5);
  vColor = mix(vColor, locking, uTetris * step(0.0, sinceLand) * step(sinceLand, 3.0));
  float blinking = step(0.0, sinceComplete) * step(sinceComplete, CLEAR_TICKS - 1.0) * mod(sinceComplete, 2.0);
  vColor = mix(vColor, ghost, blinking * (1.0 - sinceComplete / CLEAR_TICKS) * uTetris);
#endif

  gl_Position = projectionMatrix * modelViewMatrix * vec4(point, position.z, 1.0);
}
