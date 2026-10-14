struct Garment {
  int kind;
  float shape;
  float peg;
  float pegs;
  float droop;
  float trim;
  float stitches;
  float worn;
};

float groove(float toEdge, float blur, float width) {
  return 1.0 - smoothstep(width - blur, width + blur, toEdge);
}

float seam(float distance, float width) {
  return groove(abs(distance), fwidth(distance), width);
}

Garment garment(float seed, vec2 cloth, float fold) {
  float u = cloth.x;
  float au = abs(u);
  float drop = cloth.y;
  float size = fract(seed * 7.31);
  Garment piece = Garment(int(seed * 6.0), 1.0, 0.0, 0.09, 0.0, 0.0, 0.0, 0.0);
  if (piece.kind == 1) {
    float width = mix(0.15, 0.23, size);
    float hem = mix(0.4, 0.6, fract(seed * 11.7));
    piece.shape = max(au - width, drop - hem);
    piece.trim = step(abs(drop - hem + 0.09), 0.025) + step(abs(drop - hem + 0.15), 0.01);
    piece.stitches = seam(drop - 0.03, 0.004) + seam(drop - hem + 0.03, 0.004);
    piece.pegs = width - 0.03;
  } else if (piece.kind == 2) {
    float body = max(au - 0.17, drop - 0.58);
    float sleeve = max(au - min(0.17 + 0.6 * (drop - 0.36), 0.26), max(0.36 - drop, drop - 0.56));
    float neck = length(vec2(u, drop - 0.6)) - 0.065;
    piece.shape = max(min(body, sleeve), -neck);
    piece.stitches = seam(neck - 0.018, 0.004) + seam(au - 0.17, 0.004) * step(0.36, drop) + seam(drop - 0.03, 0.004);
    vec2 print = abs(vec2(u, drop - 0.3)) - vec2(0.07, 0.05);
    piece.trim = step(0.45, fract(seed * 41.0)) * (1.0 - step(0.0, max(print.x, print.y)));
    piece.worn = 1.0 - smoothstep(0.0, 0.02, neck);
    piece.pegs = 0.14;
  } else if (piece.kind == 3) {
    float hem = mix(0.7, 0.85, size);
    piece.shape = max(au - 0.15 + 0.02 * drop / hem, drop - hem);
    float crotch = min(0.012 + 0.03 * (drop - 0.3) - au, drop - 0.3);
    piece.shape = max(piece.shape, crotch);
    vec2 pocket = abs(vec2(au - 0.08, drop - 0.14)) - vec2(0.04, 0.05);
    piece.stitches = seam(drop - 0.05, 0.004) + seam(au - 0.13, 0.003) * step(0.05, drop)
      + seam(max(pocket.x, pocket.y), 0.003) + seam(crotch + 0.012, 0.003) + seam(drop - hem + 0.025, 0.003);
    piece.trim = 1.0 - smoothstep(0.045, 0.05, drop);
    float knee = (drop - 0.5) / 0.08;
    piece.worn = exp(-knee * knee) * (1.0 - smoothstep(0.04, 0.1, abs(au - 0.075)));
    piece.pegs = 0.12;
  } else if (piece.kind == 4) {
    vec2 leg = abs(vec2(au - 0.09, drop - 0.11)) - vec2(0.023, 0.118);
    vec2 foot = abs(vec2(au - 0.13, drop - 0.22)) - vec2(0.038, 0.023);
    piece.shape = min(length(max(leg, 0.0)) + min(max(leg.x, leg.y), 0.0),
      length(max(foot, 0.0)) + min(max(foot.x, foot.y), 0.0)) - 0.012;
    piece.trim = 1.0 - smoothstep(0.045, 0.055, drop) + smoothstep(0.16, 0.172, au)
      + smoothstep(0.222, 0.234, drop) * (1.0 - smoothstep(0.098, 0.11, au));
    piece.stitches = seam(drop - 0.055, 0.003);
  } else if (piece.kind == 5) {
    float width = mix(0.22, 0.26, size);
    float hem = mix(0.75, 0.92, fract(seed * 13.3));
    piece.shape = max(au - width, drop - hem);
    piece.trim = 1.0 - step(0.06, drop);
    piece.stitches = 0.6 * (seam(u, 0.003) + seam(drop - hem * 0.5, 0.003)) + seam(drop - hem + 0.02, 0.003);
    piece.pegs = width - 0.03;
  }
  piece.shape += smoothstep(0.0, 0.25, drop) * (piece.kind == 4 ? 0.25 : 1.0) * (0.007 * fold + 0.014 * (valueNoise(vec2(u * 9.0, drop * 6.0 + seed * 20.0)) - 0.5));
  piece.droop = 0.025 * max(1.0 - pow(au / piece.pegs, 2.0), 0.0) + 0.3 * max(au - piece.pegs - 0.02, 0.0);
  if (piece.kind != 4) piece.shape = max(piece.shape, piece.droop - drop);
  piece.peg = max(abs(au - piece.pegs) - 0.008, drop + 0.01 - 0.05);
  return piece;
}

bool garmentCut(Garment piece) {
  return piece.kind == 0 || min(piece.shape, piece.peg) > 0.0;
}

float ragHem(float seed, vec2 cloth, float height) {
  return height * mix(0.55, 1.0, valueNoise(vec2(cloth.x * 14.0, seed * 50.0)));
}

bool ragTorn(float seed, vec2 cloth, float hem) {
  return cloth.y > hem || valueNoise(cloth * 8.0 + seed * 30.0) > 0.86;
}

vec2 onSheet(vec2 cloth, vec2 size) {
  return vec2(cloth.x / size.x + 0.5, 1.0 - cloth.y / size.y);
}

bool sheetTorn(vec2 local, float bottom, vec2 at) {
  float inward = min(1.6 * min(at.x, 1.0 - at.x), at.y);
  return fbm(local * 2.5 + bottom * 7.0) > 0.5 + 1.1 * inward;
}
