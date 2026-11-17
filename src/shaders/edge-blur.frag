precision highp float;

#include "chunks/noise.glsl"

uniform sampler2D uSource;
uniform vec2 uResolution;
uniform float uPixelRatio;
uniform float uSourceScale;
uniform float uFrame;
uniform vec2 uFocus;

out vec4 outColor;

const vec2 FOCUS = vec2(0.36, 1.0);
const float BLUR_RADIUS = 2.0;
const int BLUR_TAPS = 12;
const float SHARPEN = 1.0;

void main() {
  vec2 pixel = gl_FragCoord.xy;
  vec2 uv = pixel / uResolution;
  float edge = smoothstep(FOCUS.x, FOCUS.y, length((uv - uFocus) * vec2(uResolution.x / uResolution.y, 1.0)));
  vec4 color = texture(uSource, uv);
  if (uSourceScale < 1.0) {
    vec2 texel = 1.0 / (uResolution * uSourceScale);
    vec3 up = textureLod(uSource, uv + vec2(0.0, texel.y), 0.0).rgb;
    vec3 down = textureLod(uSource, uv - vec2(0.0, texel.y), 0.0).rgb;
    vec3 left = textureLod(uSource, uv - vec2(texel.x, 0.0), 0.0).rgb;
    vec3 right = textureLod(uSource, uv + vec2(texel.x, 0.0), 0.0).rgb;
    vec3 lowest = min(color.rgb, min(min(up, down), min(left, right)));
    vec3 highest = max(color.rgb, max(max(up, down), max(left, right)));
    vec3 sharp = color.rgb + SHARPEN * (1.0 - edge) * (4.0 * color.rgb - up - down - left - right) * 0.25;
    color.rgb = clamp(sharp, lowest, highest);
  }
  float radius = BLUR_RADIUS * uPixelRatio * edge * edge;
  if (radius > 0.5) {
    float turn = 6.2832 * ign(pixel + mod(uFrame, 64.0) * vec2(5.588, 3.17));
    for (int i = 1; i < BLUR_TAPS; i++) {
      float angle = float(i) * 2.39996 + turn;
      float reach = sqrt(float(i) / float(BLUR_TAPS - 1)) * radius;
      color += textureLod(uSource, uv + reach * vec2(cos(angle), sin(angle)) / uResolution, 0.0);
    }
    color /= float(BLUR_TAPS);
  }
  outColor = color;
}
