// Campo de ruido del terreno planetario. ¡ATENCIÓN!: este código tiene una
// réplica exacta en CPU (ProceduralPlanet.js: hash3/noise3/fbm3/ridged3 y
// getHeightAtDirection). Cualquier cambio aquí DEBE replicarse allí o el
// terreno visible (GPU) dejará de coincidir con el terreno físico (CPU) y la
// nave/el jugador flotarán o se hundirán en el suelo.

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float value = 0.0;
  float amp = 0.52;
  for (int i = 0; i < 5; i++) {
    value += noise3(p) * amp;
    p *= 2.03;
    amp *= 0.48;
  }
  return value;
}

float ridged(vec3 p) {
  float n = 1.0 - abs(noise3(p) * 2.0 - 1.0);
  return n * n;
}

// uNoiseOffset desplaza el dominio del ruido por planeta (semilla): cada
// mundo tiene continentes/montañas totalmente distintos con el mismo código.
float terrainHeight(vec3 dir, float amp) {
  vec3 d = dir + uNoiseOffset;
  float continents = smoothstep(0.34, 0.78, fbm(d * 1.45 + vec3(11.7, 4.1, 8.3)));
  float plains = fbm(d * 5.5 + vec3(3.0, 9.5, 2.4));
  float mountains = ridged(d * 11.0 + vec3(7.4, 1.7, 5.8));
  float highlands = smoothstep(0.58, 0.90, fbm(d * 3.2 + vec3(1.4, 6.8, 12.5)));
  float h = continents * 0.48 + plains * 0.18 + mountains * highlands * 0.42;
  h -= 0.18;
  return h * amp;
}
