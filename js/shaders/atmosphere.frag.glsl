uniform vec3 uPlanetCenter;
uniform vec3 uCameraPosition;
uniform vec3 uSunDirection;
uniform float uRadius;
uniform float uAtmosphereRadius;
varying vec3 vWorldPosition;
varying vec3 vNormalW;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vWorldPosition - uPlanetCenter);
  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  vec3 sunDir = normalize(uSunDirection);
  float camHeight = length(uCameraPosition - uPlanetCenter);
  float inAtmosphere = 1.0 - smoothstep(uRadius, uAtmosphereRadius, camHeight);
  float horizon = pow(1.0 - abs(dot(n, viewDir)), 2.35);
  float sunFacing = smoothstep(-0.25, 0.92, dot(n, sunDir));
  float miePhase = pow(max(dot(viewDir, sunDir), 0.0), 18.0);
  vec3 rayleigh = vec3(0.28, 0.58, 1.0) * horizon * (0.50 + sunFacing * 0.95);
  vec3 mie = vec3(1.0, 0.72, 0.42) * miePhase * horizon * 1.7;
  vec3 innerSky = vec3(0.24, 0.52, 0.88) * inAtmosphere * (0.20 + sunFacing * 0.34);
  float alpha = clamp(horizon * (0.28 + inAtmosphere * 0.58) + miePhase * 0.10, 0.0, 0.72);
  gl_FragColor = vec4(rayleigh + mie + innerSky, alpha);
}
