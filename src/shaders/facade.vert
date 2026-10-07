precision highp float;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

in vec3 position;
in vec3 normal;
in float aKind;
in vec3 aOffset;
in vec2 aTile;
in vec3 aMin;
in vec3 aMax;

out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;
out float vKind;
flat out vec2 vTile;
flat out vec3 vMin;
flat out vec3 vMax;

void main() {
  vec4 world = modelMatrix * vec4(position + aOffset, 1.0);
  vWorld = world.xyz;
  vLocal = position;
  vNormal = mat3(modelMatrix) * normal;
  vKind = aKind;
  vTile = aTile;
  vMin = aMin;
  vMax = aMax;
  gl_Position = projectionMatrix * viewMatrix * world;
}
