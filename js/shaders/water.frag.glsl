// Océano: esfera al nivel del mar con fresnel + brillo especular del sol y
// un vaivén sutil. Transparente para que se adivine el fondo en aguas bajas.
uniform vec3 uPlanetCenter;
uniform vec3 uCameraPosition;
uniform vec3 uSunDirection;
uniform vec3 uWaterColor;
uniform float uTime;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vWorldPosition;
varying vec3 vNormalW;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormalW);
  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  vec3 sunDir = normalize(uSunDirection);
  // Perturbación barata del normal (olas) sin texturas.
  vec3 p = vWorldPosition * 2.2;
  n = normalize(n + 0.045 * vec3(
    sin(p.x * 3.1 + uTime * 1.4) + sin(p.z * 2.3 - uTime),
    0.0,
    sin(p.z * 2.9 + uTime * 1.1) + sin(p.x * 2.1 - uTime * 0.8)
  ));
  float ndl = max(dot(n, sunDir), 0.0);
  float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  vec3 halfDir = normalize(sunDir + viewDir);
  float spec = pow(max(dot(n, halfDir), 0.0), 90.0) * ndl;
  vec3 col = uWaterColor * (0.16 + ndl * 0.9);
  col += vec3(1.0, 0.95, 0.8) * spec * 1.4;
  col += uWaterColor * fres * 0.5;
  float alpha = clamp(0.62 + fres * 0.3, 0.0, 0.94);

  // Mismo fog atmosférico que el terreno: el mar lejano se funde con el cielo.
  float fogF = smoothstep(uFogNear, uFogFar, distance(vWorldPosition, uCameraPosition));
  col = mix(col, uFogColor, fogF);
  alpha = mix(alpha, 1.0, fogF * 0.6);

  gl_FragColor = vec4(col, alpha);
}
