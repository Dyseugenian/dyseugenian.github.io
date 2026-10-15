precision highp float;

uniform sampler2D uSource;
uniform vec2 uTexel;
uniform vec2 uTarget;
uniform float uFirst;

out vec4 outColor;

const vec2 THRESHOLD = vec2(0.12, 0.8);

vec3 bright(vec2 uv) {
  vec3 color = texture(uSource, uv).rgb;
  if (uFirst < 0.5) return color;
  float peak = max(color.r, max(color.g, color.b));
  return color * smoothstep(THRESHOLD.x, THRESHOLD.y, peak) / (1.0 + peak);
}

void main() {
  vec2 uv = gl_FragCoord.xy * uTarget;
  vec2 corner = 0.5 * uTexel;
  vec3 sum = 4.0 * bright(uv);
  sum += bright(uv + vec2(-corner.x, -corner.y));
  sum += bright(uv + vec2(corner.x, -corner.y));
  sum += bright(uv + vec2(-corner.x, corner.y));
  sum += bright(uv + vec2(corner.x, corner.y));
  outColor = vec4(sum / 8.0, 1.0);
}
