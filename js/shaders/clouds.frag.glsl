// Nubes: cascarón fino con cobertura por fbm 3D que deriva con el tiempo,
// iluminado por el sol y desvanecido en el limbo.
uniform vec3 uPlanetCenter;
uniform vec3 uCameraPosition;
uniform vec3 uSunDirection;
uniform vec3 uNoiseOffset;
uniform float uTime;
uniform float uCoverage;
varying vec3 vWorldPosition;
varying vec3 vNormalW;
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i); float n100 = hash31(i + vec3(1,0,0));
  float n010 = hash31(i + vec3(0,1,0)); float n110 = hash31(i + vec3(1,1,0));
  float n001 = hash31(i + vec3(0,0,1)); float n101 = hash31(i + vec3(1,0,1));
  float n011 = hash31(i + vec3(0,1,1)); float n111 = hash31(i + vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float v = 0.0; float a = 0.52;
  for (int i = 0; i < 4; i++) { v += noise3(p) * a; p *= 2.13; a *= 0.5; }
  return v;
}
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vWorldPosition - uPlanetCenter);
  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  vec3 sunDir = normalize(uSunDirection);
  vec3 d = n + uNoiseOffset;
  float cover = fbm(d * 3.4 + vec3(uTime * 0.012, 0.0, uTime * 0.008));
  cover = smoothstep(0.62 - uCoverage * 0.34, 0.86 - uCoverage * 0.2, cover);
  float ndl = max(dot(n, sunDir), 0.0);
  float limb = abs(dot(n, viewDir));
  vec3 col = mix(vec3(0.28, 0.32, 0.40), vec3(1.05, 1.02, 0.98), 0.12 + ndl * 0.88);
  float alpha = cover * (0.30 + 0.55 * limb);
  // Desde DENTRO de la atmósfera (cámara bajo la capa) las nubes se atenúan:
  // vistas de canto son un muro blanco que tapaba todo el cielo del planeta.
  float shellR = length(vWorldPosition - uPlanetCenter);
  float camR = length(uCameraPosition - uPlanetCenter);
  float inside = smoothstep(shellR * 0.9, shellR * 1.04, camR);
  alpha *= mix(0.38, 1.0, inside);
  gl_FragColor = vec4(col, alpha);
}
