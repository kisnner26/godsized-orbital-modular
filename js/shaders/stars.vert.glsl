// Estrellas con parpadeo sutil: cada una tiene su propia fase (aPhase), así
// el brillo y el tamaño oscilan de forma independiente en vez de latir todas
// a la vez. El tamaño en pantalla usa la misma atenuación por distancia que
// THREE.PointsMaterial (300 / -z).
attribute vec3 color;
attribute float aPhase;
attribute float aSize;
uniform float uTime;
uniform float uPointScale;
varying vec3 vColor;
varying float vTwinkle;
bool isPerspectiveMatrix( mat4 m ) { return m[ 2 ][ 3 ] == - 1.0; }
#include <logdepthbuf_pars_vertex>
void main() {
  vColor = color;
  float tw = sin(uTime * (1.4 + fract(aPhase) * 1.6) + aPhase * 3.0) * 0.5 + 0.5;
  vTwinkle = 0.5 + tw * 0.7;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  // uPointScale (≈SKY_SCALE·1800): el firmamento se aleja ×SKY_SCALE para
  // quedar más allá de los planetas a escala real; sin un factor grande las
  // estrellas atenuarían a sub-píxel. Clamp para que no revienten de cerca.
  gl_PointSize = clamp(aSize * vTwinkle * (uPointScale / -mvPosition.z), 0.0, 6.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}
