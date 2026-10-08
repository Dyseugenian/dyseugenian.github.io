const float CRACK_CELL = 3.2;
const vec3 CRACK_WAVES = vec3(0.45, 0.16, 0.05);
const vec2 CRACK_WIDTH = vec2(0.0012, 0.028);
const float CORNER_CRACKS = 0.3;
const float LEACH_DROP = 0.7;
const float CRAZE_CELL = 0.3;
const float CRAZE_GAPS = 0.35;

struct Crack {
  vec2 start;
  vec2 dir;
  float len;
  float peak;
  float widest;
  float key;
};

struct Fracture {
  float open;
  float deep;
  float halo;
  float lip;
  float healed;
  float leach;
  float residue;
};

float jag(float x, float key, out float slope) {
  float index = floor(x);
  float a = hash12(vec2(index, key));
  float b = hash12(vec2(index + 1.0, key));
  slope = b - a;
  return mix(a, b, fract(x)) - 0.5;
}

float crackPath(float s, float key, out float slope) {
  vec3 slopes;
  float offset = CRACK_WAVES.x * jag(s / CRACK_WAVES.x, key, slopes.x)
    + CRACK_WAVES.y * jag(s / CRACK_WAVES.y, key + 17.0, slopes.y)
    + CRACK_WAVES.z * jag(s / CRACK_WAVES.z, key + 29.0, slopes.z);
  float ramp = smoothstep(0.0, 0.1, s);
  slope = 0.5 * (slopes.x + slopes.y + slopes.z) * ramp;
  return (0.5 * offset + 0.25 * (valueNoise(vec2(s * 0.6, key)) - 0.5)) * ramp;
}

float taper(float u, float peak) {
  return u < peak ? pow(u / max(peak, 1e-3), 0.5) : pow((1.0 - u) / (1.0 - peak), 0.7);
}

void crackSegment(vec2 p, vec2 start, vec2 dir, float len, float peak, float widest, float key, float upright,
  float footprint, inout Fracture fracture) {
  vec2 rel = p - start;
  float s = dot(rel, dir);
  float t = dot(rel, vec2(-dir.y, dir.x));
  bool healed = hash12(vec2(key, 251.0)) < 0.15 && widest < 0.004;
  if (s > -0.05 && s < len + 0.05 && abs(t) < 0.4) {
    float slope;
    float offset = crackPath(s, key, slope);
    float d = abs(t - offset) / sqrt(1.0 + slope * slope);
    float shape = taper(clamp(s / len, 0.0, 1.0), peak);
    float width = widest * shape * mix(0.45, 1.3, valueNoise(vec2(s * 7.0, key + 3.0)))
      * smoothstep(0.3, 0.5, valueNoise(vec2(s * 4.0, key + 9.0)) + 0.4 * shape);
    float halfWidth = 0.5 * width;
    float soft = max(halfWidth, 0.5 * footprint);
    float open = (1.0 - smoothstep(soft - 0.5 * footprint, soft + 0.5 * footprint, d)) * halfWidth / soft;
    if (healed) {
      fracture.healed = max(fracture.healed, open);
    } else {
      fracture.open = max(fracture.open, open);
      fracture.deep = max(fracture.deep, open * smoothstep(0.002, 0.012, width));
      fracture.lip = max(fracture.lip, exp(-max(d - halfWidth, 0.0) / (0.4 * width + footprint))
        * smoothstep(0.005, 0.014, width) * (1.0 - open));
      fracture.halo = max(fracture.halo, exp(-d / (0.008 + 2.5 * width)) * smoothstep(0.001, 0.006, width)
        * mix(0.3, 1.0, valueNoise(p * 9.0 + key)));
    }
  }

  if (upright < 0.5 || healed || abs(dir.x) < 0.25 || widest < 0.003) return;
  float along = (p.x - start.x) / dir.x;
  if (along < 0.0 || along > len) return;
  float slope;
  float drop = start.y + dir.y * along + dir.x * crackPath(along, key, slope) - p.y;
  if (drop < 0.0 || drop > LEACH_DROP) return;
  float reach = mix(0.12, 0.45, hash12(vec2(key, 257.0)));
  float strands = smoothstep(0.25, 0.7, valueNoise(vec2(p.x * 22.0, key)))
    * mix(0.5, 1.0, valueNoise(vec2(p.x * 70.0, p.y * 3.0 + key)));
  float leach = exp(-drop / reach) * (1.0 - smoothstep(0.6 * LEACH_DROP, LEACH_DROP, drop)) * strands
    * smoothstep(0.002, 0.008, widest * taper(along / len, peak));
  if (leach > fracture.leach) {
    fracture.leach = leach;
    fracture.residue = hash12(vec2(key, 263.0));
  }
}

vec3 crackSpan(vec2 cell) {
  vec2 middle = (cell + 0.3 + 0.4 * vec2(hash12(cell + 213.0), hash12(cell + 217.0))) * CRACK_CELL;
  return vec3(middle, mix(0.5, 2.4, hash12(cell + 219.0)));
}

bool crackNear(vec2 p, vec2 cell, float upright) {
  float density = mix(0.3, 0.95, smoothstep(0.25, 0.75, valueNoise(cell * 0.37 + 5.0)));
  if (hash12(cell + 211.0) > density) return false;
  vec3 span = crackSpan(cell);
  vec2 away = p - span.xy;
  float reach = 0.6 * span.z + 0.4;
  return abs(away.x) < reach && away.y < reach && away.y > -reach - LEACH_DROP * upright;
}

bool cellCrack(vec2 cell, int branch, float upright, out Crack crack) {
  vec3 span = crackSpan(cell);
  vec2 middle = span.xy;
  float len = span.z;
  float kind = hash12(cell + 223.0);
  float lean = hash12(cell + 227.0) - 0.5;
  float angle = kind < 0.35 ? 1.5708 + 0.4 * lean
    : kind < 0.7 ? sign(lean) * (0.6 + 0.8 * abs(lean))
    : kind < 0.85 ? 0.3 * lean : 6.2832 * lean;
  if (upright < 0.5) angle = 6.2832 * lean;
  vec2 dir = vec2(cos(angle), sin(angle));
  float peak = mix(0.25, 0.75, hash12(cell + 229.0));
  float widest = mix(CRACK_WIDTH.x, CRACK_WIDTH.y, pow(hash12(cell + 231.0), 2.5));
  float key = floor(hash12(cell + 233.0) * 4096.0);
  crack = Crack(middle - 0.5 * len * dir, dir, len, peak, widest, key);
  if (branch == 0) return true;

  float branchKey = key + 53.0 * float(branch);
  if (hash12(vec2(branchKey, 239.0)) > 0.5) return false;
  float at = mix(0.2, 0.8, hash12(vec2(branchKey, 241.0))) * len;
  float slope;
  vec2 fork = crack.start + at * dir + crackPath(at, key, slope) * vec2(-dir.y, dir.x);
  float turn = (branch == 1 ? 1.0 : -1.0) * mix(0.35, 1.0, hash12(vec2(branchKey, 243.0)));
  vec2 branchDir = vec2(cos(angle + turn), sin(angle + turn));
  float branchLen = mix(0.15, 0.35, hash12(vec2(branchKey, 247.0))) * len;
  crack = Crack(fork, branchDir, branchLen, 0.0, 0.6 * widest * taper(at / len, peak), branchKey);
  return true;
}

bool cornerCrack(vec2 p, vec2 fromLow, vec2 extent, out Crack crack) {
  vec2 side = step(0.5 * extent, fromLow);
  vec2 corner = p - fromLow + side * extent;
  if (hash12(corner * 1.31 + 271.0) > CORNER_CRACKS) return false;
  float len = min(mix(0.3, 1.3, hash12(corner + 273.0)), 0.4 * length(extent));
  if (len < 0.25) return false;
  vec2 inward = (1.0 - 2.0 * side) * extent;
  float angle = atan(inward.y, inward.x) + mix(-0.3, 0.3, hash12(corner + 277.0));
  float widest = mix(0.002, 0.012, hash12(corner + 281.0));
  crack = Crack(corner, vec2(cos(angle), sin(angle)), len, 0.0, widest, floor(hash12(corner + 283.0) * 4096.0));
  return true;
}

Fracture fractures(vec2 p, vec2 fromLow, vec2 extent, float upright, float footprint) {
  Fracture fracture = Fracture(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
  vec2 home = floor(p / CRACK_CELL);
  vec2 toward = sign(fract(p / CRACK_CELL) - 0.5);
  vec2 nearby[4];
  int count = 0;
  for (int n = 0; n < 4; n++) {
    vec2 cell = home + toward * vec2(n % 2, n / 2);
    if (crackNear(p, cell, upright)) {
      nearby[count] = cell;
      count++;
    }
  }
  int segments = 3 * count + (upright > 0.5 ? 1 : 0);
  for (int n = 0; n < segments; n++) {
    Crack crack;
    bool found = n == 3 * count ? cornerCrack(p, fromLow, extent, crack) : cellCrack(nearby[n / 3], n % 3, upright, crack);
    if (found) {
      crackSegment(p, crack.start, crack.dir, crack.len, crack.peak, crack.widest, crack.key, upright, footprint,
        fracture);
    }
  }
  return fracture;
}

vec2 crazeSite(vec2 cell) {
  return vec2(hash12(cell + 301.0), hash12(cell + 307.0));
}

float crazing(vec2 p, float footprint) {
  vec2 warp = vec2(valueNoise(p * 2.3 + 311.0), valueNoise(p * 2.3 + 313.0)) - 0.5;
  vec2 at = p / CRAZE_CELL + 0.45 * warp + 0.08 * (valueNoise(p * 40.0) - 0.5);
  vec2 home = floor(at);
  vec2 nearest;
  vec2 runnerUp;
  vec2 toNearest;
  vec2 toRunnerUp;
  float closest = 8.0;
  float next = 8.0;
  for (int n = 0; n < 9; n++) {
    vec2 cell = home + vec2(n % 3 - 1, n / 3 - 1);
    vec2 toSite = cell + crazeSite(cell) - at;
    float d = dot(toSite, toSite);
    if (d < closest) {
      next = closest;
      runnerUp = nearest;
      toRunnerUp = toNearest;
      closest = d;
      nearest = cell;
      toNearest = toSite;
    } else if (d < next) {
      next = d;
      runnerUp = cell;
      toRunnerUp = toSite;
    }
  }
  float edgeKey = hash12(nearest + runnerUp + 3.7 * abs(nearest - runnerUp) + 317.0);
  if (edgeKey < CRAZE_GAPS) return 0.0;
  float toEdge = dot(0.5 * (toNearest + toRunnerUp), normalize(toRunnerUp - toNearest));
  float strength = (edgeKey - CRAZE_GAPS) / (1.0 - CRAZE_GAPS);
  float halfWidth = mix(0.0004, 0.0011, strength)
    * smoothstep(0.25, 0.55, valueNoise(p * 12.0 + edgeKey * 97.0));
  float soft = max(halfWidth, 0.5 * footprint);
  return (1.0 - smoothstep(soft - 0.5 * footprint, soft + 0.5 * footprint, toEdge * CRAZE_CELL)) * halfWidth / soft
    * mix(0.4, 1.0, strength);
}
