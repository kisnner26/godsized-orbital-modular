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
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x01040a);
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.02, 8000);
    this.camera.position.set(0, 1.55, 1.2);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
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

    window.addEventListener('resize', () => this.resize());
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
    const tick = () => {
      requestAnimationFrame(tick);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      for (const fn of this.updaters) fn(dt);
      for (const sys of this.worldSystems) sys.update(dt);   // planetas procedurales
      this.composer.render();
    };
    tick();
  }
}
