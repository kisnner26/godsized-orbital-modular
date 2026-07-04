// Vértex genérico de cascarones planetarios (atmósfera, océano, nubes):
// posición y normal en espacio de mundo, sin desplazamiento.
varying vec3 vWorldPosition;
varying vec3 vNormalW;
bool isPerspectiveMatrix( mat4 m ) { return m[ 2 ][ 3 ] == - 1.0; }
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
