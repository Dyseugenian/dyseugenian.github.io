precision highp float;

uniform sampler2D uSource;
uniform vec2 uTexel;
uniform vec2 uTarget;

out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy * uTarget;
  vec2 t = uTexel;
  vec3 sum = texture(uSource, uv + vec2(-2.0 * t.x, 0.0)).rgb;
  sum += texture(uSource, uv + vec2(2.0 * t.x, 0.0)).rgb;
  sum += texture(uSource, uv + vec2(0.0, -2.0 * t.y)).rgb;
  sum += texture(uSource, uv + vec2(0.0, 2.0 * t.y)).rgb;
  sum += 2.0 * texture(uSource, uv + vec2(-t.x, -t.y)).rgb;
  sum += 2.0 * texture(uSource, uv + vec2(t.x, -t.y)).rgb;
  sum += 2.0 * texture(uSource, uv + vec2(-t.x, t.y)).rgb;
  sum += 2.0 * texture(uSource, uv + vec2(t.x, t.y)).rgb;
  outColor = vec4(sum / 12.0, 1.0);
}
