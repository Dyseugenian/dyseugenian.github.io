precision highp float;

#include "chunks/noise.glsl"

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 uFrame;
uniform vec3 uCenter;
uniform float uDrop;
uniform float uRadius;
uniform float uHideBehind;
uniform float uFlow;
uniform float uRipple;
uniform vec4 uRippleShapes[RIPPLES];
uniform vec4 uRippleWaves[RIPPLES];
uniform float uBendAngles[BENDS];
uniform vec2 uBendOffsets[BENDS];
uniform float uBendWidth;
uniform float uTime;
uniform float uPixelRatio;
uniform float uOpacity;
uniform vec3 uDim;
uniform vec3 uBright;

in vec3 position;
in vec3 aLook;
in vec4 aBreak;

out vec3 vColor;
out float vAlpha;

const float PI = 3.14159265;

float smootherstep(float edge0, float edge1, float x) {
  float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float angleAt(float time) {
  float track = fract(position.x / PI + time * uFlow);
  return position.x < PI ? PI - track * PI : PI + track * PI;
}

float angleGap(float from, float to) {
  return mod(from - to + PI, 2.0 * PI) - PI;
}

float rippleAt(float angle) {
  float offset = 0.0;
  for (int i = 0; i < RIPPLES; i++) {
    vec4 shape = uRippleShapes[i];
    vec4 wave = uRippleWaves[i];
    float duration = shape.z;
    float age = uTime - shape.y;
    if (age >= duration) continue;

    float envelope = smootherstep(0.0, duration * 0.3, age) * smootherstep(duration, duration * 0.3, age);
    float gap = angleGap(angle, shape.x);
    float crest = cos(gap / shape.w * wave.x - wave.z * age / wave.y * 2.0 * PI);
    offset += envelope * wave.w * crest * exp(-gap * gap / (shape.w * shape.w));
  }
  return offset * uRipple;
}

vec2 bendAt(float angle) {
  vec2 offset = vec2(0.0);
  for (int i = 0; i < BENDS; i++) {
    float gap = angleGap(angle, uBendAngles[i]);
    offset += uBendOffsets[i] * exp(-gap * gap / (uBendWidth * uBendWidth));
  }
  return offset;
}

void main() {
  float angle = angleAt(uTime);
  float ripple = rippleAt(angle);
  vec3 center = uCenter - uDrop * uFrame[2];
  vec2 onCircle = vec2(cos(angle), sin(angle)) * (uRadius + position.y + ripple);
  vec3 point = center + uFrame * vec3(onCircle, position.z + ripple * 0.5);

  float behind = step(point.z, uCenter.z);
  vec4 viewPoint = modelViewMatrix * vec4(point, 1.0);
  vec4 viewCenter = modelViewMatrix * vec4(uCenter, 1.0);
  float hideRadius = uHideBehind * length(modelViewMatrix[0].xyz);
  float fromCenter = distance(viewPoint.xy * viewCenter.z / viewPoint.z, viewCenter.xy) / hideRadius;
  float covered = behind * (1.0 - smoothstep(0.98, 1.02, fromCenter));

  point.xy += bendAt(angle);

  float age = uTime - aBreak.x;
  if (age < SCATTER_SECONDS) {
    vec2 outward = normalize((uFrame * vec3(cos(angle), sin(angle), 0.0)).xy);
    vec2 push = aBreak.w > 0.5 ? vec2(cos(aBreak.y), sin(aBreak.y)) : outward;
    float turn = (hash13(position * 3.9 + 1.0) - 0.5) * 0.7;
    push = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * push;
    float reach = mix(0.04, 0.16, hash13(position * 7.3)) * (0.3 + aBreak.z);
    vec2 drift = vec2(valueNoise(vec3(position.xy * 9.0, age * 0.5)), valueNoise(vec3(position.yz * 9.0, age * 0.5))) - 0.5;
    float away = 1.0 - pow(1.0 - min(age / 1.4, 1.0), 3.0);
    float scatter = away * smootherstep(SCATTER_SECONDS, 1.6, age);
    point.xy += (push * reach + drift * 0.05) * scatter;
  }

  gl_Position = projectionMatrix * modelViewMatrix * vec4(point, 1.0);
  gl_PointSize = aLook.x * uPixelRatio;

  float flicker = 0.85 + 0.15 * sin(uTime * 3.0 + aLook.z * 6.2832);
  vColor = mix(uDim, uBright, aLook.y);
  vAlpha = aLook.y * flicker * (1.0 - covered) * uOpacity;
}
