vec3 skyColor(vec2 pixel, vec2 resolution, vec2 vanish, vec4 backlights, float time, vec3 sky, vec3 haze, vec3 rim) {
  vec2 offset = (pixel - vanish) / resolution.y;
  float radius = length(offset);
  vec2 direction = offset / max(radius, 1e-4);
  float cloud = fbm(vec3(direction * 1.8, log(radius + 0.03) * 1.6 - time * 0.12));
  vec3 color = mix(sky, haze, 0.3 * smoothstep(0.35, 0.8, cloud));
  float glow = exp(-2.5 * length(pixel - backlights.xy) / resolution.y)
    + exp(-2.5 * length(pixel - backlights.zw) / resolution.y);
  return mix(color, rim, 0.3 * glow * mix(0.7, 1.0, cloud));
}
