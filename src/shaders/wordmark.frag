precision highp float;

#include "chunks/noise.glsl"

uniform float uPixelSize;
uniform vec3 uBackground;

in vec3 vColor;
in float vGlyph;
flat in int vDigit;
flat in float vSeed;

out vec4 outColor;

const int DIGITS[2] = int[2](0x7B6F, 0x749A);
const vec2 GLYPH = vec2(3.0, 5.0);
const float FONT_PIXEL = 2.0;
const float CELL_HEIGHT = 12.0;

float glyphPixel(vec2 devicePoint) {
  vec2 font = floor(devicePoint / uPixelSize / FONT_PIXEL + GLYPH * 0.5);
  if (any(lessThan(font, vec2(0.0))) || any(greaterThanEqual(font, GLYPH))) return 0.0;
  int bit = int(font.y * GLYPH.x + font.x);
  float lit = float((DIGITS[vDigit] >> bit) & 1);
  float reveal = smoothstep(0.1, 0.75, vGlyph);
  return hash13(vec3(font, vSeed * 97.0)) < reveal ? lit : 0.0;
}

float glyphCoverage() {
  vec2 devicePoint = (gl_PointCoord - 0.5) * (CELL_HEIGHT * uPixelSize + 2.0);
  return 0.25 * (
    glyphPixel(devicePoint + vec2(-0.25, -0.25)) +
    glyphPixel(devicePoint + vec2(0.25, -0.25)) +
    glyphPixel(devicePoint + vec2(-0.25, 0.25)) +
    glyphPixel(devicePoint + vec2(0.25, 0.25)));
}

float pixelCoverage() {
  vec2 offset = abs(gl_PointCoord - 0.5) * (uPixelSize + 2.0);
  vec2 overlap = max(min(offset + 0.5, uPixelSize * 0.5) - max(offset - 0.5, -uPixelSize * 0.5), 0.0);
  return overlap.x * overlap.y;
}

void main() {
  float coverage = vGlyph > 0.0 ? glyphCoverage() : pixelCoverage();
  outColor = vec4(max((vColor - uBackground) * SIGN, 0.0), coverage);
}
