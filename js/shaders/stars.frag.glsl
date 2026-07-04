// uFade (0..1): desvanecimiento atmosférico — al descender a un planeta de
// día las estrellas desaparecen tras el cielo iluminado, como en la realidad.
uniform float uFade;
varying vec3 vColor;
varying float vTwinkle;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec2 uv = gl_PointCoord - 0.5;
  float alpha = smoothstep(0.5, 0.0, length(uv));
  gl_FragColor = vec4(vColor * vTwinkle, alpha * 0.92 * (1.0 - uFade));
}
