#include "hash.glsl"

float valueNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash13(cell), hash13(cell + vec3(1, 0, 0)), f.x),
      mix(hash13(cell + vec3(0, 1, 0)), hash13(cell + vec3(1, 1, 0)), f.x),
      f.y),
    mix(
      mix(hash13(cell + vec3(0, 0, 1)), hash13(cell + vec3(1, 0, 1)), f.x),
      mix(hash13(cell + vec3(0, 1, 1)), hash13(cell + vec3(1, 1, 1)), f.x),
      f.y),
    f.z);
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
  return mix(
    mix(hash12(cell), hash12(cell + vec2(1, 0)), f.x),
    mix(hash12(cell + vec2(0, 1)), hash12(cell + vec2(1, 1)), f.x),
    f.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float weight = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    sum += valueNoise(p) * weight;
    p = p * 2.03 + 17.0;
    weight *= 0.5;
  }
  return sum;
}
