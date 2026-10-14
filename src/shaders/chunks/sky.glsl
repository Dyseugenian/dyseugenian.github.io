uniform sampler2D uSkyMap;

const vec2 FLASH_REACH = vec2(0.8, 1.0);

vec3 skyColor(vec2 pixel, vec2 resolution) {
  return texture(uSkyMap, pixel / resolution).rgb;
}

vec4 skyAt(vec2 pixel, vec2 resolution) {
  return texture(uSkyMap, pixel / resolution);
}

vec3 skyClear(vec4 sky) {
  return sky.rgb * (1.0 - sky.a);
}

vec3 skyFlash(vec4 sky, float veiled) {
  return sky.rgb * sky.a * smoothstep(FLASH_REACH.x, FLASH_REACH.y, veiled);
}
