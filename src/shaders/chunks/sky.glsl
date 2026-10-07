vec3 skyColor(vec2 pixel, vec2 resolution, vec2 vanish, float time, vec3 sky, vec3 haze) {
  vec2 offset = (pixel - vanish) / resolution.y;
  float radius = length(offset);
  vec2 direction = offset / max(radius, 1e-4);
  float cloud = fbm(vec3(direction * 1.8, log(radius + 0.03) * 1.6 - time * 0.12));
  vec3 color = mix(sky, haze, exp(-radius * 2.4));
  return mix(color, haze, 0.45 * smoothstep(0.35, 0.8, cloud) * exp(-radius * 1.2));
}
