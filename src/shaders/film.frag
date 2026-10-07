precision highp float;

#include "chunks/noise.glsl"

uniform sampler2D uScene;
uniform float uTime;
uniform float uFps;
uniform vec2 uResolution;
uniform float uPixelRatio;
uniform float uGrain;
uniform float uAberration;
uniform sampler2D uRoles;
uniform sampler2D uRoleGlow;
uniform vec4 uRolesRect;
uniform float uRolesOpacity;
uniform vec4 uRoleBoxes[3];
uniform vec2 uRoleInkEdges[3];
uniform vec3 uRoleOpacity;
uniform vec3 uRoleActive;
uniform vec3 uRoleSpread;
uniform vec3 uRoleFade;
uniform vec2 uPointer;
uniform vec2 uGlowPoint;
uniform float uCanHover;
uniform float uPresence;
uniform vec2 uReach;
uniform vec3 uOchre;
uniform vec3 uCream;

in vec2 vWarp;

out vec4 outColor;

const float PULL_SHARPNESS = 1.6;
const float GLOW_STRENGTH = 4.0;
const float GLOW_RADIUS = 40.0;
const float GLOW_RANGE = 360.0;
const float GLOW_SPLIT = 0.6;
const float SPREAD_SOFTNESS = 0.35;

float pullAt(vec2 pixel) {
  vec2 reach = (pixel - uPointer) / uReach;
  return uCanHover * uPresence * exp(-pow(dot(reach, reach), PULL_SHARPNESS));
}

float glowAt(vec2 pixel) {
  vec2 nearest = clamp(uGlowPoint, uRolesRect.xy, uRolesRect.xy + uRolesRect.zw);
  float approach = 1.0 - smoothstep(0.2 * GLOW_RANGE * uPixelRatio, GLOW_RANGE * uPixelRatio, distance(uGlowPoint, nearest));
  float across = (pixel.x - nearest.x) / (GLOW_RADIUS * uPixelRatio);
  return uCanHover * uPresence * approach * exp(-across * across);
}

int roleAt(vec2 local) {
  for (int i = 0; i < 3; i++) {
    vec4 box = uRoleBoxes[i];
    if (all(greaterThanEqual(local, box.xy)) && all(lessThanEqual(local, box.zw))) return i;
  }
  return -1;
}

vec2 roleInk(vec2 texel) {
  vec2 local = texel / uRolesRect.zw;
  if (any(lessThan(local, vec2(0.0))) || any(greaterThan(local, vec2(1.0)))) return vec2(0.0);
  int role = roleAt(local);
  float opacity = (role < 0 ? 1.0 : uRoleOpacity[role]) * uRolesOpacity;
  return vec2(texture(uRoles, local).a, texture(uRoleGlow, local).a) * opacity;
}

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

  vec3 film = tint * alpha + under * (1.0 - alpha);

  vec2 texel = pixel - uRolesRect.xy;
  vec2 local = texel / uRolesRect.zw;
  int role = uRoleFade.x > uRoleFade.y ? (uRoleFade.x > uRoleFade.z ? 0 : 2) : (uRoleFade.y > uRoleFade.z ? 1 : 2);
  float left = uRoleInkEdges[role].x;
  float right = uRoleInkEdges[role].y;
  float fromCenter = abs(texel.x - (left + right) * 0.5) / ((right - left) * 0.5);
  float front = uRoleSpread[role] * (1.0 + SPREAD_SOFTNESS);
  float reveal = 1.0 - smoothstep(front - SPREAD_SOFTNESS, front, fromCenter);
  float focus = roleAt(local) == role ? reveal * uRoleFade[role] : 0.0;
  float calm = 1.0 - max(uRoleActive.x, max(uRoleActive.y, uRoleActive.z));
  vec3 ink = mix(mix(uOchre, uCream, pullAt(pixel) * calm), uCream, focus);
  float glow = glowAt(pixel) * calm;
  vec2 split = vec2(GLOW_SPLIT * uPixelRatio * max(glow, focus), 0.0);
  vec2 red = roleInk(texel - split);
  vec2 green = roleInk(texel);
  vec2 blue = roleInk(texel + split);
  film += ink * vec3(red.y, green.y, blue.y) * glow * GLOW_STRENGTH;
  outColor = vec4(mix(film, ink, vec3(red.x, green.x, blue.x)), 1.0);
}
