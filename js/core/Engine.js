import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Efecto de "velocidad luz": desenfoque radial hacia el centro de pantalla
// (estelas de estrellas) + un ligero viraje de color (azul al frente, como un
// corrimiento al azul relativista estilizado) que crece con uWarp (0..1).
const WARP_SHADER = {
  uniforms: { tDiffuse: { value: null }, uWarp: { value: 0 } },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uWarp;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uWarp <= 0.001) { gl_FragColor = base; return; }
      vec2 toCenter = vUv - 0.5;
      vec3 col = vec3(0.0);
      float total = 0.0;
      const int SAMPLES = 20;
      for (int i = 0; i < SAMPLES; i++) {
        float t = float(i) / float(SAMPLES - 1);
        float scale = 1.0 - uWarp * 0.62 * t;
        vec2 uv = 0.5 + toCenter * scale;
        float w = 1.0 - t * 0.85;
        col += texture2D(tDiffuse, uv).rgb * w;
        total += w;
      }
      col /= total;
      col = mix(base.rgb, col, uWarp);
      col += vec3(0.05, 0.14, 0.22) * uWarp;
      gl_FragColor = vec4(col, base.a);
    }
  `
};

export class Engine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x01040a);
    // Escala moderada (estilo del video de referencia): los planetas se ven
    // como esferas al acercarse, no llenan la pantalla. Con far 12000 el
    // z-buffer lineal basta y sobra — sin coste de z-buffer logarítmico.
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 12000);
    this.camera.position.set(0, 1.55, 1.2);

    // antialias solo puede decidirse al crear el contexto: el preset
    // "Rendimiento" guardado lo desactiva en la siguiente carga (main.js lee
    // localStorage antes de construir el motor).
    // (Los shaders custom conservan los chunks <logdepthbuf_*>; sin
    // logarithmicDepthBuffer, USE_LOGDEPTHBUF no se define y expanden a nada.)
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: opts.antialias !== false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.62, 0.55, 0.62);
    this.composer.addPass(this.bloom);
    this.warpPass = new ShaderPass(WARP_SHADER);
    this.composer.addPass(this.warpPass);

    this.clock = new THREE.Clock();
    this.updaters = [];
    this.worldSystems = [];   // sistemas de mundo (planetas procedurales) montados en el motor

    this.targetFps = 0;       // 0 = sin límite (el rAF va al ritmo nativo)
    this.detectedHz = 60;     // se mide en detectRefreshRate()
    this.fps = 60;            // FPS reales suavizados (para mostrar en Ajustes)
    this._lastFrame = 0;

    window.addEventListener('resize', () => this.resize());
  }

  // Limita los FPS renderizados. Con 0 se vuelve al ritmo nativo del monitor.
  // En portátiles flojos, saltar frames es la palanca más directa: la física
  // usa dt real, así que la simulación va igual de rápido con menos carga.
  setTargetFps(fps) {
    this.targetFps = Math.max(0, Number(fps) || 0);
  }

  shouldUseComposer() {
    return !!(this.bloom?.enabled || this.warpPass?.enabled);
  }

  // Mide la frecuencia nativa del monitor muestreando deltas de rAF (no hay
  // API directa). Mediana de ~24 frames redondeada al estándar más cercano.
  detectRefreshRate() {
    return new Promise(resolve => {
      const deltas = [];
      let prev = 0;
      const sample = (t) => {
        if (prev) deltas.push(t - prev);
        prev = t;
        if (deltas.length < 24) { requestAnimationFrame(sample); return; }
        deltas.sort((a, b) => a - b);
        const median = deltas[Math.floor(deltas.length / 2)];
        const raw = 1000 / Math.max(1, median);
        const standards = [60, 75, 90, 120, 144, 165, 240];
        let hz = standards[0];
        for (const s of standards) if (Math.abs(s - raw) < Math.abs(hz - raw)) hz = s;
        // pantallas por debajo de 60 (o navegador limitando): usa la medida
        if (raw < 55) hz = Math.max(24, Math.round(raw));
        this.detectedHz = hz;
        resolve(hz);
      };
      requestAnimationFrame(sample);
    });
  }

  // Monta un sistema de mundo (p.ej. sistemas procedurales de Exploración)
  // en el bucle de render. Cualquier objeto con update(dt) queda inyectado en el
  // requestAnimationFrame principal del motor.
  mountWorldSystem(system) {
    if (system && typeof system.update === 'function') this.worldSystems.push(system);
    return system;
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  }

  addUpdater(fn) { this.updaters.push(fn); }

  start() {
    const tick = (now) => {
      requestAnimationFrame(tick);
      // Limitador de FPS: si aún no toca renderizar este frame, salir sin
      // tocar nada. clock.getDelta() del frame que SÍ corre devuelve el
      // tiempo real acumulado, así que la simulación no se ralentiza.
      if (this.targetFps > 0) {
        const interval = 1000 / this.targetFps;
        if (now - this._lastFrame < interval - 0.75) return;
        // avanza en múltiplos del intervalo para no acumular deriva
        this._lastFrame = now - ((now - this._lastFrame) % interval);
      } else {
        this._lastFrame = now;
      }
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (dt > 0) this.fps += (1 / dt - this.fps) * 0.06;   // medidor suavizado
      for (const fn of this.updaters) fn(dt);
      for (const sys of this.worldSystems) sys.update(dt);   // planetas procedurales
      if (this.shouldUseComposer()) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(tick);
  }
}
