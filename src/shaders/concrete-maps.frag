precision highp float;
precision highp int;

uniform sampler2D uHeight;
uniform float uSize;
uniform float uMeters;

out vec4 outColor;

const float DEPTH = 0.004;

float heightAt(ivec2 texel) {
  ivec2 size = textureSize(uHeight, 0);
  return texelFetch(uHeight, (texel + size) % size, 0).r;
}

void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  float texel = 1.0 / uSize;
  float center = heightAt(at);
  float east = heightAt(at + ivec2(1, 0));
  float west = heightAt(at - ivec2(1, 0));
  float north = heightAt(at + ivec2(0, 1));
  float south = heightAt(at - ivec2(0, 1));
  float scale = DEPTH / (2.0 * texel * uMeters);
  vec3 normal = normalize(vec3((west - east) * scale, (south - north) * scale, 1.0));

  float around = heightAt(at + ivec2(4, 0)) + heightAt(at - ivec2(4, 0))
    + heightAt(at + ivec2(0, 4)) + heightAt(at - ivec2(0, 4));
  float cavity = clamp(0.5 + 2.0 * (center - around * 0.25), 0.0, 1.0);
  outColor = vec4(normal.xy * 0.5 + 0.5, clamp(center * 0.8 + 0.2, 0.0, 1.0), cavity);
}
