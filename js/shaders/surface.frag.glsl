uniform vec3 uSunDirection;
uniform vec3 uCameraPosition;
uniform vec3 uPaletteA;
uniform vec3 uPaletteB;
uniform vec3 uPaletteC;
// Fog atmosférico manual (este material no usa el fog integrado de Three):
// mismo modelo lineal smoothstep(near, far) que THREE.Fog para que el terreno
// se funda EXACTAMENTE igual que los props (MeshStandardMaterial) de encima.
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vWorldPosition;
varying vec3 vNormalW;
varying float vHeight;
varying float vMoisture;

#include <logdepthbuf_pars_fragment>

void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormalW);
  float ndl = max(dot(n, normalize(uSunDirection)), 0.0);
  float hemi = n.y * 0.5 + 0.5;

  vec3 ocean = mix(vec3(0.025, 0.13, 0.26), uPaletteA, 0.32);
  vec3 shore = mix(vec3(0.54, 0.50, 0.34), uPaletteC, 0.34);
  vec3 plains = mix(uPaletteA, uPaletteB, 0.34);
  vec3 forest = mix(uPaletteA * 0.55, uPaletteB, 0.40);
  vec3 desert = mix(uPaletteC, vec3(0.55, 0.42, 0.22), 0.24);
  vec3 rock = mix(uPaletteB, vec3(0.42, 0.39, 0.36), 0.42);
  vec3 snow = vec3(0.82, 0.88, 0.88);

  vec3 land = mix(desert, plains, smoothstep(0.25, 0.68, vMoisture));
  land = mix(land, forest, smoothstep(0.58, 0.92, vMoisture) * smoothstep(-0.05, 0.28, vHeight));
  land = mix(land, rock, smoothstep(0.32, 0.62, vHeight));
  land = mix(land, snow, smoothstep(0.58, 0.88, vHeight) + smoothstep(0.88, 0.98, abs(n.y)));
  vec3 col = mix(ocean, shore, smoothstep(-0.16, -0.08, vHeight));
  col = mix(col, land, smoothstep(-0.08, 0.02, vHeight));

  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  float diffuse = 0.13 + ndl * 1.05;
  float bounce = 0.10 * hemi;
  col *= diffuse + bounce;
  col += vec3(0.13, 0.34, 0.50) * rim * 0.18;

  // Perspectiva aérea: el terreno lejano se funde con el color del cielo,
  // ocultando el popping del LOD durante el descenso atmosférico.
  float fogF = smoothstep(uFogNear, uFogFar, distance(vWorldPosition, uCameraPosition));
  col = mix(col, uFogColor, fogF);

  gl_FragColor = vec4(col, 1.0);
}
