float resolved(float frequency, float footprint) {
  return 1.0 - smoothstep(0.2, 0.6, footprint * frequency);
}

mat3 faceFrame(vec3 normal) {
  vec3 facing = abs(normal);
  if (facing.y > 0.5) return mat3(vec3(1, 0, 0), vec3(0, 0, 1), normal);
  if (facing.x > 0.5) return mat3(vec3(0, 0, 1), vec3(0, 1, 0), normal);
  return mat3(vec3(1, 0, 0), vec3(0, 1, 0), normal);
}
