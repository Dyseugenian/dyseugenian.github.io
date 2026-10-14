precision highp float;
precision highp int;

#include "chunks/noise-texture.glsl"
#include "chunks/glyphs.glsl"

uniform float uPresence;

in vec2 vGlyph;
in vec2 vWall;
flat in vec4 vShape;
flat in vec4 vHand;
flat in vec3 vPaint;
flat in float vFade;
flat in float vBlur;

out vec4 outColor;

const float BRUSH = 0.0;
const float MARKER = 1.0;
const float CHALK = 2.0;
const float SPRAY = 3.0;
const float SIGN = 4.0;
const float PI = 3.14159;

vec2 shake(vec2 point, float seed, float amount) {
  return amount * (vec2(hash12(point * 61.0 + seed), hash12(point * 61.0 + seed + 7.0)) - 0.5) * 2.0;
}

void main() {
  if (uPresence > 0.5) {
    outColor = vec4(1.0);
    return;
  }
  int code = int(vShape.x + 0.5);
  float width = vShape.y;
  float hand = vHand.x;
  float age = vHand.y;
  float seed = vHand.z * 97.0;
  float pixel = max(length(fwidth(vGlyph)), 1e-4);
  vec2 point = vGlyph + vShape.z * 2.0 * (vec2(valueNoise(vGlyph * 2.3 + seed), valueNoise(vGlyph * 2.3 + seed + 31.0)) - 0.5);
  point.y += vBlur * 0.07 * valueNoise(vec2(point.x * 6.0 + seed, point.y * 0.7));
  float rough = hand == CHALK ? 0.45 : hand == BRUSH ? 0.3 : hand == SIGN ? 0.2 : hand == MARKER ? 0.16 : 0.08;
  float ragged = 0.55 * valueNoise(point * 38.0 + seed) + 0.3 * valueNoise(point * 97.0 + seed + 5.0)
    + 0.3 * valueNoise(point * 8.0 + seed + 9.0);
  float edge = rough * width * (ragged - 0.575) * 2.0;
  float grain = valueNoise(point * 64.0 + seed + 21.0);
  float near = smoothstep(0.012, 0.004, pixel);

  float cover = 0.0;
  float nearest = 1e3;
  int first = int(GLYPHS[code].x);
  int strokes = int(GLYPHS[code].y);
  for (int i = 0; i < strokes; i++) {
    vec4 stroke = GLYPH_STROKES[first + i];
    float index = float(i) + seed;
    vec2 a = stroke.xy + shake(stroke.xy, seed, vShape.w);
    vec2 b = stroke.zw + shake(stroke.zw, seed, vShape.w);
    vec2 ab = b - a;
    float length2 = max(dot(ab, ab), 1e-6);
    float h = clamp(dot(point - a, ab) / length2, 0.0, 1.0);
    vec2 across = vec2(-ab.y, ab.x) / sqrt(length2);
    float bow = (hash12(vec2(index, 3.0)) - 0.5) * 0.12 * vShape.z / 0.045 * sqrt(length2);
    vec2 offset = point - (a + ab * h + across * bow * sin(PI * h));
    float distance = length(offset);

    float press = valueNoise(vec2(h * 4.0, index * 3.7));
    float w = width;
    if (hand == BRUSH) w *= 1.0 + 0.35 * pow(1.0 - h, 6.0) - 0.2 * h * h + 0.3 * (press - 0.5);
    else if (hand == SPRAY) w *= 1.0 + 0.25 * (press - 0.5);
    else w *= 1.0 + 0.12 * (press - 0.5);
    nearest = min(nearest, distance - w);

    w *= 1.0 + 0.35 * vBlur;
    float soft = max(hand == SPRAY ? max(pixel, 0.45 * w) : max(0.75 * pixel, 0.15 * w), 0.45 * vBlur * w);
    float held = max(w, pixel);
    float line = (1.0 - smoothstep(held - soft, held + soft, distance + edge)) * w / held;
    line = mix(line, smoothstep(0.6 * grain, 0.6 * grain + 0.35, line), near);
    if (hand == BRUSH) {
      float bristle = valueNoise(vec2(dot(offset, across) / w * 5.0 + index * 3.1, h * 2.0 + seed));
      float dry = 0.15 + 0.6 * smoothstep(0.5, 1.0, h);
      line *= mix(1.0, smoothstep(dry - 0.15, dry + 0.15, bristle + 0.3), smoothstep(0.01, 0.003, pixel));
    } else if (hand == CHALK) {
      line *= smoothstep(0.25, 0.55, valueNoise(point * 70.0 + seed));
    }
    cover = max(cover, line);

    if (hash12(vec2(index, 5.0)) < vHand.w) {
      bool upright = abs(ab.y) > 0.25 * sqrt(length2);
      vec2 origin = upright ? (a.y < b.y ? a : b) : a + ab * hash12(vec2(index, 9.0));
      float fall = mix(0.15, 1.1, pow(hash12(vec2(index, 11.0)), 2.0));
      float down = (origin.y - point.y) / fall;
      if (down > 0.0 && down < 1.15) {
        float x = origin.x + 0.015 * sin(down * 9.0 + index);
        float drip = 0.45 * w * (1.0 - 0.45 * min(down, 1.0));
        float run = abs(point.x - x);
        if (down > 1.0) run = 1e3;
        float bead = length((point - vec2(x, origin.y - fall)) * vec2(1.0, 0.8)) - 0.25 * w;
        float d = min(run - drip, bead);
        float heldDrip = max(drip, pixel);
        cover = max(cover, (1.0 - smoothstep(-soft, soft, d)) * min(drip / heldDrip, 1.0));
      }
    }
  }

  if (hand == SPRAY) {
    float mist = 0.18 * exp(-max(nearest, 0.0) / (1.4 * width));
    vec2 cell = floor(point * 90.0);
    float speck = step(hash12(cell + seed), 0.35 * exp(-max(nearest, 0.0) / (1.2 * width))) * 0.8;
    cover = max(cover, mix(speck, mist, smoothstep(0.004, 0.015, pixel)));
  }

  float flake = valueNoise(vWall * 22.0 + seed);
  float peel = age * (hand == MARKER ? 0.15 : 0.4) * (1.0 - 0.6 * vBlur);
  float keep = smoothstep(peel - 0.06, peel + 0.06, flake);
  float wash = valueNoise(vec2(vWall.x * 24.0, vWall.y * 1.2) + seed);
  keep *= 1.0 - age * 0.35 * smoothstep(0.55, 0.9, wash);
  float pores = smoothstep(0.74, 0.8, valueNoise(vWall * 300.0 + seed));
  keep *= 1.0 - 0.7 * pores * smoothstep(0.006, 0.002, length(fwidth(vWall)));
  keep *= mix(1.0, mix(0.4, 1.0, smoothstep(0.1, 0.7, valueNoise(vWall * 2.5 + seed + 13.0))), vBlur);
  keep *= mix(0.72, 1.0, valueNoise(point * 3.0 + seed + 17.0));
  float strength = clamp(0.8 * cover * keep * mix(1.0, 0.6, age) * mix(1.0, 0.6, vBlur) * vFade, 0.0, 1.0);
  if (strength < 0.003) discard;
  outColor = vec4(0.5 * mix(vec3(1.0), vPaint, strength), 1.0);
}
