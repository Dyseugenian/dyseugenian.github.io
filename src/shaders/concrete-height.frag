precision highp float;
precision highp int;

#include "chunks/hash.glsl"

uniform float uSize;

out vec4 outHeight;

float tiledNoise(vec2 p, float cells) {
  vec2 x = p * cells;
  vec2 cell = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(mod(cell, cells)), hash12(mod(cell + vec2(1, 0), cells)), f.x),
    mix(hash12(mod(cell + vec2(0, 1), cells)), hash12(mod(cell + vec2(1, 1), cells)), f.x),
    f.y);
}

float tiledFbm(vec2 p, float cells) {
  float sum = 0.0;
  float weight = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    sum += tiledNoise(p, cells) * weight;
    cells *= 2.0;
    weight *= 0.5;
  }
  return sum;
}

float pits(vec2 p, float cells, float size, float chance) {
  vec2 x = p * cells;
  vec2 cell = floor(x);
  float deepest = 0.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      vec2 neighbour = cell + vec2(i, j);
      vec2 wrapped = mod(neighbour, cells);
      vec2 center = neighbour + 0.15 + 0.7 * vec2(hash12(wrapped), hash12(wrapped + 9.1));
      float radius = size * mix(0.3, 1.0, hash12(wrapped + 4.2)) * step(1.0 - chance, hash12(wrapped + 7.7));
      float inside = 1.0 - length(x - center) / max(radius, 1e-4);
      deepest = max(deepest, sqrt(max(inside, 0.0)));
    }
  }
  return deepest;
}

float height(vec2 p) {
  float h = 0.3 * tiledFbm(p, 4.0) + 0.25 * tiledFbm(p, 24.0);
  h += 0.14 * tiledNoise(p, 140.0) + 0.08 * tiledNoise(p, 320.0);
  h += 0.18 * smoothstep(0.6, 0.9, tiledNoise(p, 70.0));
  float pebble = pits(p, 30.0, 0.32, 0.025);
  h += 0.7 * smoothstep(0.0, 1.0, pebble * pebble);
  h -= 0.8 * pits(p, 44.0, 0.3, 0.1);
  h -= 0.7 * pits(p, 16.0, 0.22, 0.05);
  return h;
}

void main() {
  outHeight = vec4(height(gl_FragCoord.xy / uSize));
}
