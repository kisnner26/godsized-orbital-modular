import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class ModelLoader {
  constructor(statusEl) {
    this.loader = new GLTFLoader();
    this.statusEl = statusEl;
  }

  setStatus(text) { if (this.statusEl) this.statusEl.textContent = text; }

  async load(name, url) {
    this.setStatus(`Cargando ${name}...`);
    return new Promise((resolve, reject) => {
      this.loader.load(url, gltf => {
        const root = gltf.scene;
        root.traverse(o => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            if (o.material) {
              const mats = Array.isArray(o.material) ? o.material : [o.material];
              mats.forEach(m => {
                m.envMapIntensity = 0.85;
                if ('roughness' in m) m.roughness = Math.max(0.35, m.roughness ?? 0.65);
                if ('metalness' in m) m.metalness = Math.min(1, Math.max(0.05, m.metalness ?? 0.25));
              });
            }
          }
        });
        resolve(root);
      }, undefined, reject);
    });
  }

  normalize(object, targetMaxSize = 6) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const max = Math.max(size.x, size.y, size.z) || 1;
    object.scale.multiplyScalar(targetMaxSize / max);
    const box2 = new THREE.Box3().setFromObject(object);
    const center = box2.getCenter(new THREE.Vector3());
    object.position.sub(center);
    return object;
  }
}
