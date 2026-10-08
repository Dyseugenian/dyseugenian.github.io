#include "hash.glsl"

uniform sampler2D uNoise;
uniform sampler2D uFbm;

const float NOISE_SIZE = 256.0;
const vec2 NOISE_SLICE = vec2(37.0, 17.0);
const float FBM_CELLS = 32.0;

float valueNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec2 slices = textureLod(uNoise, (cell.xy + NOISE_SLICE * cell.z + f.xy + 0.5) / NOISE_SIZE, 0.0).rg;
  return mix(slices.r, slices.g, f.z);
}

float fbm(vec3 p) {
  float sum = 0.0;
  float weight = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    sum += valueNoise(p) * weight;
    p = p * 2.03 + 17.0;
    weight *= 0.5;
  }
  return sum;
}

float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return textureLod(uNoise, (cell + f + 0.5) / NOISE_SIZE, 0.0).r;
}

float fbm(vec2 p) {
  return textureLod(uFbm, p / FBM_CELLS, 0.0).r;
}
