precision highp float;

#include "chunks/noise.glsl"

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uPixelSize;
uniform float uTime;
uniform vec3 uBackground;
uniform float uBinary;
uniform vec3 uCream;
uniform vec3 uOchre;

in vec3 position;
in vec3 color;
in vec2 aCell;

out vec3 vColor;
out float vGlyph;
flat out int vDigit;
flat out float vSeed;

const vec2 CELL = vec2(8.0, 12.0);
const float WORDMARK_WIDTH = 848.0;
const float SWEEP = 1.4;

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

void main() {
  vec2 cell = floor(aCell / CELL);
  float seed = hash13(vec3(cell, 7.0));
  float delay = aCell.x / WORDMARK_WIDTH * 0.7 + seed * 0.3;
  float progress = clamp(uBinary * (1.0 + SWEEP) - delay * SWEEP, 0.0, 1.0);
  bool anchor = aCell == cell * CELL + floor(CELL / 2.0);

  float flicker = blink(2.0, 2.3, 0.015, 1.0) + blink(5.0, 1.7, 0.03, 2.0) + blink(11.0, 1.2, 0.05, 3.0);
  flicker = clamp(flicker, -1.0, 1.0);
  vec3 surface = flicker > 0.0
    ? mix(color, uBackground, flicker * 0.85)
    : min(color * (1.0 - flicker * 0.3), 1.0);
  float damage = max(cracks() * 0.7, scratches() * 0.45);
  vColor = mix(surface, uBackground, damage);

  vec2 point = position.xy;
  gl_PointSize = uPixelSize + 2.0;
  vGlyph = 0.0;
  vSeed = seed;
  vDigit = 0;

  if (anchor && progress > 0.0) {
    float rate = progress < 0.8 ? 14.0 : 4.0 + 10.0 * seed;
    float clock = uTime * rate + seed * 5.0;
    float sinceFlip = fract(clock) / rate;
    float heat = max(1.0 - smoothstep(0.55, 1.0, progress), 1.0 - smoothstep(0.0, 0.35, sinceFlip));
    point.y -= pow(1.0 - progress, 3.0) * 6.0;
    gl_PointSize = CELL.y * uPixelSize + 2.0;
    vGlyph = progress;
    vDigit = int(step(0.5, hash13(vec3(cell, floor(clock)))));
    float shimmer = hash13(vec3(cell, floor(uTime * 9.0 + seed * 3.0)));
    float level = mix(0.2, 1.0, pow(hash13(vec3(cell, floor(clock) + 31.0)), 0.7));
    vColor = mix(uCream * level * (0.7 + 0.3 * shimmer), uOchre * level, heat * mix(0.35, 0.85, step(progress, 0.8)));
    vColor = mix(vColor, uBackground, step(shimmer, 0.18) * 0.85);
  } else if (!anchor) {
    float vanish = 0.3 + 0.6 * hash13(vec3(aCell, 11.0));
    float rise = smoothstep(vanish - 0.3, vanish, progress);
    point += vec2(hash13(vec3(aCell, 12.0)) - 0.5, 1.0 + hash13(vec3(aCell, 13.0)) * 3.0) * rise * 2.0;
    vColor = mix(vColor, uOchre, rise * 0.6);
    vColor = mix(vColor, uBackground, step(vanish, progress));
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(point, position.z, 1.0);
}
