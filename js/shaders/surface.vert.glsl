// Terreno HORNEADO: la geometría ya llega desplazada (radio+relieve) y con
// normales calculadas en CPU (ver ProceduralPlanet.buildPatchGeometry). El
// vértex shader solo transforma la posición y pasa los datos de color.
// aHeight = relieve normalizado (-1..1), aMoisture = humedad (para bioma).
attribute float aHeight;
attribute float aMoisture;
varying vec3 vWorldPosition;
varying vec3 vNormalW;
varying float vHeight;
varying float vMoisture;

bool isPerspectiveMatrix( mat4 m ) { return m[ 2 ][ 3 ] == - 1.0; }
#include <logdepthbuf_pars_vertex>

void main() {
  vHeight = aHeight;
  vMoisture = aMoisture;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}
