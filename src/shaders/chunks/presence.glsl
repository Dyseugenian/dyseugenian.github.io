uniform float uPresence;
uniform vec2 uPresenceSize;
uniform float uPresenceBase;

void markPresent() {
  float slot = uPresenceBase + float(gl_InstanceID);
  vec2 texel = vec2(mod(slot, uPresenceSize.x), floor(slot / uPresenceSize.x)) + 0.5;
  gl_Position = vec4(texel / uPresenceSize * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}
