precision highp float;

uniform sampler2D uMist;
uniform vec2 uResolution;

out vec4 outColor;

void main() {
  outColor = texture(uMist, gl_FragCoord.xy / uResolution);
}
