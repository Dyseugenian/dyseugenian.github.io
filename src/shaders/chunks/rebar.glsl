const float REBAR_COVER = 0.045;
const float REBAR_SPACING = 0.2;
const float REBAR_RADIUS = 0.014;
const float RIB_PITCH = 0.02;

float barLine(float at, float extent) {
  float last = extent - REBAR_COVER;
  float count = max(floor((last - REBAR_COVER) / REBAR_SPACING), 0.0);
  float nearest = REBAR_COVER + clamp(round((at - REBAR_COVER) / REBAR_SPACING), 0.0, count) * REBAR_SPACING;
  return abs(at - last) < abs(at - nearest) ? last : nearest;
}

vec3 toBars(vec3 at, vec3 extent) {
  return abs(at - vec3(barLine(at.x, extent.x), barLine(at.y, extent.y), barLine(at.z, extent.z)));
}

float toRebar(vec3 at, vec3 lo, vec3 hi) {
  vec3 from = at - lo;
  vec3 extent = hi - lo;
  vec3 grid = toBars(from, extent);
  vec3 cover = min(abs(from - REBAR_COVER), abs(extent - REBAR_COVER - from));
  float alongX = min(length(vec2(cover.y, grid.z)), length(vec2(grid.y, cover.z)));
  float alongY = min(length(vec2(cover.x, grid.z)), length(vec2(grid.x, cover.z)));
  float alongZ = min(length(vec2(cover.x, grid.y)), length(vec2(grid.x, cover.y)));
  return min(min(alongX, alongY), alongZ);
}

float rebarRibs(float along, float slant) {
  return 1.0 - smoothstep(0.06, 0.2, abs(fract(along / RIB_PITCH + 0.35 * slant) - 0.5));
}
