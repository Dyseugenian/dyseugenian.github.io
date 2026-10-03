precision highp float;

uniform sampler2D uMap;

in vec2 vUv;

out vec4 outColor;

void main() {
  outColor = vec4(texture(uMap, vUv).rgb, 1.0);
}
