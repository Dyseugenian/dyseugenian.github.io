precision highp float;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 uVelocity;
uniform float uShape;

in vec3 position;
in vec3 normal;
in vec3 aWine;
in vec3 aWineNormal;

out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;

const float SHUTTER = 0.012;

void main() {
  vec3 local = mix(position, aWine, uShape);
  vec3 bent = normalize(mix(normal, aWineNormal, uShape));
  vec4 world = modelMatrix * vec4(local, 1.0);
  vNormal = normalize(mat3(modelMatrix) * bent);
  world.xyz -= uVelocity * SHUTTER * step(dot(vNormal, uVelocity), 0.0);
  vWorld = world.xyz;
  vLocal = local;
  gl_Position = projectionMatrix * viewMatrix * world;
}
