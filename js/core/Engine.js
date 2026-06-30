import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

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
