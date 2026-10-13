uniform vec3 uSalt;
uniform vec3 uGrime;
uniform vec3 uRust;
uniform vec3 uMoss;

const vec3 STAIN_SIZES = vec3(10.0, 3.5, 1.2);
const vec3 STAIN_COVER = vec3(0.4, 0.45, 0.2);
const vec3 STAIN_SALTS = vec3(0.0, 31.0, 67.0);

void tint(inout vec4 layer, vec3 colour, float amount) {
  layer = vec4(mix(layer.rgb, colour, amount), layer.a * (1.0 - amount));
}

void stain(inout vec4 layer, vec2 wall, vec2 warp, float size, float salt, float cover, float upright, float footprint) {
  vec2 at = (wall + warp * size * 0.6) / size;
  at.y *= mix(1.0, 0.7, upright);
  vec2 shaped = at + 0.45 * (vec2(fbm(at * 1.1 + salt + 5.0), fbm(at * 1.1 + salt + 23.0)) - 0.5);
  float coarse = fbm(at * 2.7 + salt);
  float fine = valueNoise(at * 9.0 + salt + 3.0);
  float grain = mix(0.5, valueNoise(at * 31.0 + salt), resolved(31.0 / size, footprint));
  float ragged = (coarse - 0.5) + 0.45 * (fine - 0.5) + 0.2 * (grain - 0.5);
  float droplets = mix(0.0, valueNoise(at * 17.0 + salt + 41.0), resolved(17.0 / size, footprint));
  float flow = mix(1.0, mix(0.6, 1.1, valueNoise(vec2(at.x * 20.0, at.y * 1.5) + salt)), upright);
  float clumps = mix(0.35, 1.0, smoothstep(0.3, 0.7, valueNoise(at * 14.0 + salt))) * mix(0.6, 1.0, grain);
  vec2 base = floor(shaped - 0.5);
  for (int n = 0; n < 4; n++) {
    vec2 cell = base + vec2(n % 2, n / 2);
    vec2 key = cell + salt;
    if (hash12(key) > cover * smoothstep(0.2, 0.6, valueNoise(cell * 0.43 + salt))) continue;
    float scale = mix(0.06, 0.22, hash12(key + 2.0));
    vec2 center = cell + 0.5 + max(1.0 - 4.4 * scale, 0.0) * (vec2(hash12(key + 3.0), hash12(key + 5.0)) - 0.5);
    float heading = 6.2832 * hash12(key + 11.0);
    float lobes = 2.0 + floor(5.0 * hash12(key + 7.0));
    vec2 local = (shaped - center) / scale;
    vec2 swirl = 2.5 * (vec2(fbm(local * 0.6 + key * 1.3), fbm(local * 0.6 + key * 1.3 + 19.0)) - 0.47);
    vec2 blob = shaped + scale * mix(0.2, 0.5, hash12(key + 73.0)) * swirl;
    float runLength = min(mix(0.6, 2.5, hash12(key + 41.0)) * scale, 0.15) * step(0.4, hash12(key + 53.0));
    float field = 0.0;
    float runs = 0.0;
    vec2 lobe = center;
    for (int i = 0; i < 6; i++) {
      if (float(i) >= lobes) break;
      vec2 lobeKey = key + float(i) * 7.31;
      heading += 2.6 * (hash12(lobeKey + 13.0) - 0.5);
      vec2 from = i % 2 == 1 ? center : lobe;
      if (i > 0) lobe = from + scale * mix(0.5, 1.0, hash12(lobeKey + 11.0)) * vec2(cos(heading), sin(heading) - 0.4 * upright);
      float radius = scale * mix(0.4, 0.85, hash12(lobeKey + 17.0)) * (i == 0 ? 1.3 : 1.0);
      vec2 offset = blob - lobe;
      offset.y *= offset.y < 0.0 ? mix(1.0, 0.6, upright) : mix(1.0, 1.4, upright);
      float tilt = 3.1416 * hash12(lobeKey + 19.0);
      offset = mat2(cos(tilt), sin(tilt), -sin(tilt), cos(tilt)) * offset;
      offset.x /= mix(1.0, 1.8, hash12(lobeKey + 23.0));
      field += exp(-dot(offset, offset) / (radius * radius));
      float column = (blob.x - lobe.x) / radius;
      float below = lobe.y - blob.y - 0.5 * radius;
      runs = max(runs, exp(-column * column) * smoothstep(-radius, 0.0, below) * exp(-max(below, 0.0) / max(runLength, 1e-3)));
    }
    if (field < 0.02 && runs * upright < 0.02) continue;
    float outline = 2.5 * (fbm(local * 1.1 + key * 1.7) - 0.47) + 0.6 * (valueNoise(local * 3.0 + key) - 0.5)
      + mix(0.0, 0.35 * (valueNoise(local * 8.0 + key) - 0.5), resolved(8.0 / (scale * size), footprint));
    float threshold = mix(0.35, 0.6, hash12(key + 31.0));
    float edged = field + mix(0.2, 0.5, hash12(key + 37.0)) * (outline + 0.5 * ragged) * smoothstep(0.0, threshold, field);
    float soft = mix(0.04, 0.4, pow(hash12(key + 43.0), 1.5)) + footprint / (size * scale);
    float holes = step(0.65, hash12(key + 71.0)) * smoothstep(0.62, 0.7, fbm(local * 1.3 + key * 2.3 + 13.0));
    float fill = smoothstep(threshold, threshold + soft, edged) * (1.0 - 0.85 * holes);
    float satellites = step(0.5, hash12(key + 47.0)) * smoothstep(0.76, 0.82, droplets)
      * smoothstep(0.15, 0.6, edged / threshold) * (1.0 - fill);
    float strands = smoothstep(0.5, 0.8, valueNoise(vec2((shaped.x - center.x) / scale * mix(2.0, 5.0, hash12(key + 59.0)), key.y + 5.0)));
    float drips = upright * runs * strands * (1.0 - fill);
    float core = mix(0.5, 1.0, smoothstep(threshold, threshold + 0.7, edged));
    float pooled = mix(1.0, mix(1.25, 0.7, smoothstep(-1.5, 1.5, (shaped.y - center.y) / scale)), upright);
    float amount = max(fill * core * flow * mix(0.6, 1.0, fine) * pooled, max(0.8 * drips, 0.7 * satellites));
    float depth = mix(0.15, 0.5, hash12(key + 29.0)) * mix(0.5, 1.0, smoothstep(0.06, 0.15, scale * size))
      * mix(1.0, 0.7, smoothstep(0.8, 2.0, scale * size));
    float kind = hash12(key + 23.0);
    vec4 over = step(vec4(0.4, 0.6, 0.72, 0.84), vec4(kind));
    vec4 kinds = vec4(1.0 - over.x, over.xyz - over.yzw);
    float lines = resolved(25.0 / size, footprint) * step(0.4, hash12(key + 61.0));
    float inner = threshold + mix(0.15, 0.4, hash12(key + 67.0));
    float tide = exp(-abs(edged - threshold) / 0.02) + 0.6 * exp(-abs(edged - inner) / 0.015);
    float halo = smoothstep(threshold - 0.12, threshold, edged) * (1.0 - fill);
    float crust = smoothstep(threshold, threshold + 0.1, edged) * mix(0.2, 1.0, grain) * mix(0.5, 1.0, fine);
    layer *= mix(1.0, (1.0 - depth * amount - 0.12 * tide * lines) * (1.0 + 0.06 * halo), kinds.x);
    tint(layer, uGrime, kinds.y * min(1.5 * depth * amount, 0.85));
    tint(layer, uSalt * 1.08, kinds.z * min(1.2 * depth, 0.45) * max(crust, max(0.6 * drips, 0.5 * satellites)));
    tint(layer, uRust * mix(0.6, 0.9, fine), kinds.w * depth * amount);
    tint(layer, uMoss * mix(0.7, 1.1, fine), over.w * min(1.6 * depth * fill * core * clumps, 0.7));
  }
}

float streaks(vec2 wall, float footprint) {
  float region = smoothstep(0.45, 0.75, valueNoise(wall * vec2(0.12, 0.03) + 61.0));
  if (region == 0.0) return 0.0;
  float column = valueNoise(vec2(wall.x * 1.6, wall.y * 0.05 + 11.0));
  float reach = smoothstep(0.25, 0.65, valueNoise(vec2(wall.x * 0.9 + 3.0, wall.y * 0.4)));
  float strand = mix(0.5, valueNoise(vec2(wall.x * 7.0, wall.y * 0.15 + 5.0)), resolved(7.0, footprint));
  float fibre = mix(0.5, valueNoise(vec2(wall.x * 23.0, wall.y * 0.3 + 2.0)), resolved(23.0, footprint));
  return region * smoothstep(0.5, 0.8, column) * reach * mix(0.3, 1.0, strand) * mix(0.6, 1.2, fibre);
}

vec4 stains(vec2 wall, float upright, float weathering, float footprint) {
  vec4 layer = vec4(0.0, 0.0, 0.0, 1.0);
  vec2 wallWarp = vec2(fbm(wall * 0.3 + 71.0), fbm(wall * 0.3 + 79.0)) - 0.5;
  vec3 cover = STAIN_COVER * mix(0.6, 1.4, weathering);
  vec3 sizes = STAIN_SIZES;
  vec3 salts = STAIN_SALTS;
  for (int i = 0; i < 3; i++) {
    stain(layer, wall, wallWarp, sizes.x, salts.x, cover.x, upright, footprint);
    sizes = sizes.yzx;
    salts = salts.yzx;
    cover = cover.yzx;
  }
  layer *= 1.0 - 0.3 * upright * streaks(wall, footprint);
  return layer;
}
