// Hash without Sine, Dave Hoskins
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

// Interleaved gradient noise, Jimenez 2014
float ign(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

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
