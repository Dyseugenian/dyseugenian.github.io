const float CLOUD_SPACING = 60.0;
const float CLOUD_THICKNESS = 2.5;
const float CLOUD_DENSITY = 0.35;

float clouds(vec3 from, vec3 to) {
  float rise = max(to.y - from.y, 1e-3);
  float depth = 0.0;
  for (int i = 0; i < 4; i++) {
    float center = (floor(from.y / CLOUD_SPACING) + float(i)) * CLOUD_SPACING;
    vec3 crossing = from + (to - from) * clamp((center - from.y) / rise, 0.0, 1.0);
    float across = atan((to.y - center) / CLOUD_THICKNESS) - atan((from.y - center) / CLOUD_THICKNESS);
    if (across < 0.02) continue;
    float puffs = fbm(vec3(crossing.xz * vec2(0.06, 0.1) + vec2(uTime * 0.05, center), uTime * 0.03));
    depth += smoothstep(0.35, 0.7, puffs) * CLOUD_THICKNESS * across;
  }
  return 1.0 - exp(-CLOUD_DENSITY * depth * length(to - from) / rise);
}
