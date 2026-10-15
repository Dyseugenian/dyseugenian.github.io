precision highp float;

#include "chunks/noise.glsl"

uniform sampler2D uSource;
uniform vec2 uResolution;
uniform float uPixelRatio;
uniform float uFrame;
uniform vec2 uFocus;

out vec4 outColor;

const vec2 FOCUS = vec2(0.36, 1.0);
const float BLUR_RADIUS = 2.0;
const int BLUR_TAPS = 12;

void main() {
  vec2 pixel = gl_FragCoord.xy;
  vec2 uv = pixel / uResolution;
  float edge = smoothstep(FOCUS.x, FOCUS.y, length((uv - uFocus) * vec2(uResolution.x / uResolution.y, 1.0)));
  vec4 color = texture(uSource, uv);
  float radius = BLUR_RADIUS * uPixelRatio * edge * edge;
  if (radius > 0.5) {
    float turn = 6.2832 * ign(pixel + mod(uFrame, 64.0) * vec2(5.588, 3.17));
    for (int i = 1; i < BLUR_TAPS; i++) {
      float angle = float(i) * 2.39996 + turn;
      float reach = sqrt(float(i) / float(BLUR_TAPS - 1)) * radius;
      color += texture(uSource, uv + reach * vec2(cos(angle), sin(angle)) / uResolution);
    }
    color /= float(BLUR_TAPS);
  }
  outColor = color;
}
