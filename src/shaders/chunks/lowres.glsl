uniform highp usampler2D uLow;
uniform sampler2D uLowDepth;
uniform vec2 uLowSize;
uniform vec2 uResolution;
uniform vec2 uDepthRange;

struct Low {
  vec4 layer;
  vec3 scatter;
  float mist;
  float cloud;
  vec4 mask;
};

vec4 unpackBytes(uint bytes) {
  return vec4(uvec4(bytes, bytes >> 8, bytes >> 16, bytes >> 24) & 0xFFu) / 255.0;
}

float viewDepth(float z) {
  float ndc = 2.0 * z - 1.0;
  return 2.0 * uDepthRange.x * uDepthRange.y
    / (uDepthRange.y + uDepthRange.x - ndc * (uDepthRange.y - uDepthRange.x));
}

Low sampleLow(vec3 normal) {
  vec2 at = gl_FragCoord.xy * uLowSize / uResolution - 0.5;
  vec2 base = floor(at);
  vec2 f = at - base;
  float depth = viewDepth(gl_FragCoord.z);
  vec4 layer = vec4(0.0);
  vec4 air = vec4(0.0);
  vec4 shape = vec4(0.0);
  vec4 mask = vec4(0.0);
  float total = 0.0;
  float best = -1.0;
  vec4 bestLayer = vec4(0.0);
  vec4 bestAir = vec4(0.0);
  vec4 bestShape = vec4(0.0);
  for (int n = 0; n < 4; n++) {
    vec2 corner = vec2(n % 2, n / 2);
    ivec2 texel = ivec2(clamp(base + corner, vec2(0.0), uLowSize - 1.0));
    float bilinear = mix(1.0 - f.x, f.x, corner.x) * mix(1.0 - f.y, f.y, corner.y);
    float lowDepth = viewDepth(texelFetch(uLowDepth, texel, 0).r);
    uvec4 tap = texelFetch(uLow, texel, 0);
    vec4 tapShape = unpackBytes(tap.z);
    vec2 across = tapShape.xy * 2.0 - 1.0;
    vec3 lowNormal = vec3(across, sqrt(max(1.0 - dot(across, across), 0.0)));
    float alike = exp(-abs(lowDepth - depth) / (0.02 * depth)) * smoothstep(0.6, 0.95, dot(lowNormal, normal));
    vec4 tapLayer = unpackBytes(tap.x);
    vec4 tapAir = unpackBytes(tap.y);
    float weight = bilinear * alike;
    layer += tapLayer * weight;
    air += tapAir * weight;
    shape += tapShape * weight;
    total += weight;
    mask = max(mask, unpackBytes(tap.w));
    if (alike > best) {
      best = alike;
      bestLayer = tapLayer;
      bestAir = tapAir;
      bestShape = tapShape;
    }
  }
  if (total < 1e-3) {
    layer = bestLayer;
    air = bestAir;
    shape = bestShape;
    mask = vec4(1.0);
  } else {
    layer /= total;
    air /= total;
    shape /= total;
  }
  Low low;
  low.layer = vec4(layer.rgb * layer.rgb * 1.2, layer.a * 1.1);
  low.scatter = air.rgb * air.rgb * 4.0;
  low.mist = air.a;
  low.cloud = shape.z;
  low.mask = mask;
  return low;
}
