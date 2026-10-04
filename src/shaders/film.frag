precision highp float;

#include "chunks/noise.glsl"

uniform sampler2D uScene;
uniform float uTime;
uniform float uFps;
uniform vec2 uResolution;
uniform float uPixelRatio;
uniform float uGrain;
uniform float uAberration;

in vec2 vWarp;

out vec4 outColor;

void main() {
  vec2 pixel = gl_FragCoord.xy;
  vec2 screen = pixel / uResolution - 0.5;
  float frame = floor(uTime * uFps);

  vec2 spread = screen * dot(screen, screen) * uAberration * uPixelRatio / uResolution;

  vec2 sampleUv = pixel / uResolution + vWarp;
  vec4 base = texture(uScene, sampleUv);
  base.r = texture(uScene, sampleUv + spread).r;
  base.b = texture(uScene, sampleUv - spread).b;

  float shade = (hash13(vec3(pixel, frame)) * 2.0 - 1.0) * uGrain;

  vec3 tint = shade > 0.0 ? vec3(1.0) : vec3(0.0);
  float alpha = clamp(abs(shade) + (ign(pixel) - 0.5) / 255.0, 0.0, 1.0);
  vec3 under = base.rgb * base.a;

  outColor = vec4(tint * alpha + under * (1.0 - alpha), alpha + base.a * (1.0 - alpha));
}
