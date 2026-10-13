uniform sampler2D uSkyMap;

vec3 skyColor(vec2 pixel, vec2 resolution) {
  return texture(uSkyMap, pixel / resolution).rgb;
}
