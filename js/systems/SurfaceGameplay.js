import * as THREE from 'three';
import { RESOURCES } from './Inventory.js';

// Gameplay de superficie (estilo No Man's Sky): láser de minado que extrae
// recursos de flora/minerales, escáner de pulso que marca los nodos cercanos
// con iconos proyectados en pantalla, y análisis de fauna que recompensa con
// unidades. Sonidos sintetizados con WebAudio (sin assets).

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const camForward = new THREE.Vector3();

const MINE_RANGE = 6.5;        // unidades máximas del láser
const MINE_RATE = 16;          // recurso/segundo extraído
const SCAN_RADIUS = 55;        // unidades del pulso de escáner
const SCAN_DURATION = 18;      // segundos que persisten los marcadores
const MAX_MARKERS = 14;

export class SurfaceGameplay {
  constructor({ scene, camera, player, exploration, inventory, exosuit, markersEl, scanPulseEl }) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.exploration = exploration;
    this.inventory = inventory;
    this.exosuit = exosuit;
    this.markersEl = markersEl;
    this.scanPulseEl = scanPulseEl;
    this.onScanInfo = null;    // (texto) => void — resumen del escaneo
    this.onCreature = null;    // (nombre, unidades) => void — nueva especie

    this.markers = new Map();  // id -> { el, kind, ref, expire }
    this.miningTarget = null;
    this._acc = 0;
    this._nodesScratch = [];
    this.audio = null;

    this.buildBeam();
  }

  buildBeam() {
    this.beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.beam = new THREE.Line(this.beamGeo, new THREE.LineBasicMaterial({
      color: 0xff6a3a, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.beam.frustumCulled = false;
    this.beam.visible = false;
    this.scene.add(this.beam);

    const glowTex = makeGlowTexture();
    this.impact = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffa25e, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.impact.scale.setScalar(0.9);
    this.impact.visible = false;
    this.scene.add(this.impact);

    this.impactLight = new THREE.PointLight(0xff7a3a, 0, 7, 1.6);
    this.scene.add(this.impactLight);
  }

  // ---- Bucle principal ----

  update(dt, miningHeld) {
    const surface = this.exploration.surface;
    const onFoot = this.player.mode === 'onfoot';

    if (!surface || !onFoot || !miningHeld) {
      this.stopMining();
    } else {
      this.mine(dt, surface);
    }
    this.updateMarkers(dt);
  }

  // ---- Láser de minado ----

  mine(dt, surface) {
    const eye = this.camera.getWorldPosition(tmpA);
    this.camera.getWorldDirection(camForward);

    // Selección asistida (como el auto-apuntado de NMS): el nodo con mejor
    // combinación de cercanía y alineación con la mirada, dentro del alcance.
    surface.collectNodesNear(this.player.rig.position, MINE_RANGE + 2, this._nodesScratch);
    let best = null;
    let bestScore = -Infinity;
    for (const node of this._nodesScratch) {
      surface.nodeWorldPos(node, tmpB);
      tmpC.copy(tmpB).sub(eye);
      const dist = tmpC.length();
      if (dist > MINE_RANGE) continue;
      const align = tmpC.normalize().dot(camForward);
      if (align < 0.45 && dist > 2.4) continue;   // muy cerca se mina sin apuntar fino
      const score = align * 2 - dist / MINE_RANGE;
      if (score > bestScore) { bestScore = score; best = node; }
    }

    if (!best) { this.stopMining(); return; }
    this.miningTarget = best;

    // Extracción por pulsos enteros para que los toasts sean legibles.
    this._acc += MINE_RATE * dt;
    const take = Math.floor(this._acc);
    if (take > 0) {
      this._acc -= take;
      const got = surface.extract(best, take);
      if (got > 0) this.inventory.add(best.resource, got);
      if (!best.alive) {
        this.removeMarker(`n${best.id}`);
        this.pickupBlip(1180);
        this.miningTarget = null;
      }
    }

    // Visuales del rayo: origen bajo el ojo, impacto con jitter + luz.
    surface.nodeWorldPos(best, tmpB);
    tmpC.set((Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * 0.16);
    tmpB.add(tmpC);
    const origin = tmpA.addScaledVector(camForward, 0.7);
    origin.y -= 0.14;
    const pos = this.beamGeo.attributes.position;
    pos.setXYZ(0, origin.x, origin.y, origin.z);
    pos.setXYZ(1, tmpB.x, tmpB.y, tmpB.z);
    pos.needsUpdate = true;
    const beamColor = RESOURCES[best.resource]?.color || '#ff6a3a';
    this.beam.material.color.set(beamColor);
    this.beam.visible = true;
    this.impact.material.color.set(beamColor);
    this.impact.position.copy(tmpB);
    this.impact.scale.setScalar(0.7 + Math.random() * 0.5);
    this.impact.visible = true;
    this.impactLight.color.set(beamColor);
    this.impactLight.position.copy(tmpB);
    this.impactLight.intensity = 2.6;
    this.startBeamSound();
  }

  stopMining() {
    this.miningTarget = null;
    this._acc = 0;
    if (this.beam.visible) {
      this.beam.visible = false;
      this.impact.visible = false;
      this.impactLight.intensity = 0;
    }
    this.stopBeamSound();
  }

  // ---- Escáner de pulso ----

  scan() {
    const surface = this.exploration.surface;
    if (!surface) return false;
    this.scanSweepSound();
    if (this.scanPulseEl) {
      this.scanPulseEl.classList.remove('hidden');
      this.scanPulseEl.classList.remove('is-on');
      void this.scanPulseEl.offsetWidth;   // reinicia la animación CSS
      this.scanPulseEl.classList.add('is-on');
    }

    const center = this.player.rig.position;
    surface.collectNodesNear(center, SCAN_RADIUS, this._nodesScratch);
    // Los más cercanos primero; el DOM se limita a MAX_MARKERS iconos.
    this._nodesScratch.sort((a, b) => {
      surface.nodeWorldPos(a, tmpA);
      const da = tmpA.distanceToSquared(center);
      surface.nodeWorldPos(b, tmpA);
      return da - tmpA.distanceToSquared(center);
    });
    const counts = {};
    let placed = 0;
    for (const node of this._nodesScratch) {
      counts[node.resource] = (counts[node.resource] || 0) + 1;
      if (placed >= MAX_MARKERS) continue;
      placed++;
      this.addMarker(`n${node.id}`, 'node', node);
    }

    // Fauna: analizada automáticamente por el pulso (recompensa en unidades).
    let newSpecies = 0;
    for (const c of surface.creatures || []) {
      surface.creatureWorldPos(c, tmpA);
      if (tmpA.distanceTo(center) > SCAN_RADIUS + 20) continue;
      this.addMarker(`c${c.name}`, 'creature', c);
      if (!c.scanned) {
        c.scanned = true;
        newSpecies++;
        const reward = 40 + Math.floor(Math.random() * 60);
        this.inventory.addUnits(reward);
        this.onCreature?.(c.name, reward);
      }
    }

    const parts = Object.entries(counts)
      .map(([id, n]) => `${n}× ${RESOURCES[id]?.name || id}`)
      .slice(0, 4);
    this.onScanInfo?.(parts.length
      ? `Escaneo: ${parts.join(' · ')}${newSpecies ? ` · ${newSpecies} especie(s) nueva(s)` : ''}`
      : 'Escaneo completado: sin depósitos en el radio del pulso.');
    return true;
  }

  addMarker(id, kind, ref) {
    let m = this.markers.get(id);
    if (!m) {
      const el = document.createElement('div');
      el.className = `res-marker res-marker--${kind}`;
      if (kind === 'node') {
        const res = RESOURCES[ref.resource];
        el.innerHTML = `<span class="res-marker__icon" style="--c:${res?.color || '#7dffda'}">${res?.sym || '?'}</span><span class="res-marker__dist"></span>`;
      } else {
        el.innerHTML = `<span class="res-marker__icon res-marker__icon--fauna">✦</span><span class="res-marker__dist">${ref.name}</span>`;
      }
      this.markersEl.appendChild(el);
      m = { el, kind, ref, expire: 0 };
      this.markers.set(id, m);
    }
    m.expire = performance.now() * 0.001 + SCAN_DURATION;
  }

  removeMarker(id) {
    const m = this.markers.get(id);
    if (!m) return;
    m.el.remove();
    this.markers.delete(id);
  }

  updateMarkers() {
    if (!this.markers.size) return;
    const surface = this.exploration.surface;
    const now = performance.now() * 0.001;
    const w = innerWidth, h = innerHeight;
    for (const [id, m] of this.markers) {
      const gone = !surface
        || (m.kind === 'node' && !m.ref.alive)
        || now > m.expire;
      if (gone) { this.removeMarker(id); continue; }
      if (m.kind === 'node') surface.nodeWorldPos(m.ref, tmpA);
      else surface.creatureWorldPos(m.ref, tmpA);

      const dist = tmpA.distanceTo(this.player.rig.position);
      tmpA.project(this.camera);
      if (tmpA.z > 1 || tmpA.z < -1) { m.el.style.display = 'none'; continue; }
      const x = (tmpA.x * 0.5 + 0.5) * w;
      const y = (-tmpA.y * 0.5 + 0.5) * h;
      if (x < -40 || x > w + 40 || y < -40 || y > h + 40) { m.el.style.display = 'none'; continue; }
      m.el.style.display = '';
      m.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
      if (m.kind === 'node') {
        m.el.querySelector('.res-marker__dist').textContent = `${Math.round(dist * 8)} m`;
      }
    }
  }

  clearMarkers() {
    for (const id of [...this.markers.keys()]) this.removeMarker(id);
  }

  // ---- SFX sintetizados ----

  ensureAudio() {
    if (this.audio) return this.audio;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
      this.audio = { ctx, master };
    } catch { this.audio = null; }
    return this.audio;
  }

  startBeamSound() {
    const a = this.ensureAudio();
    if (!a || this.beamOsc) return;
    const osc = a.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 82;
    const osc2 = a.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 137;
    const filter = a.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    const gain = a.ctx.createGain();
    gain.gain.value = 0.0;
    gain.gain.linearRampToValueAtTime(0.4, a.ctx.currentTime + 0.08);
    osc.connect(filter); osc2.connect(filter);
    filter.connect(gain); gain.connect(a.master);
    osc.start(); osc2.start();
    this.beamOsc = { osc, osc2, gain };
  }

  stopBeamSound() {
    if (!this.beamOsc || !this.audio) return;
    const { osc, osc2, gain } = this.beamOsc;
    const t = this.audio.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.1);
    osc.stop(t + 0.12); osc2.stop(t + 0.12);
    this.beamOsc = null;
  }

  pickupBlip(freq = 880) {
    const a = this.ensureAudio();
    if (!a) return;
    const t = a.ctx.currentTime;
    const osc = a.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 0.6, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.09);
    const gain = a.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain); gain.connect(a.master);
    osc.start(t); osc.stop(t + 0.24);
  }

  scanSweepSound() {
    const a = this.ensureAudio();
    if (!a) return;
    const t = a.ctx.currentTime;
    const osc = a.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(960, t + 0.7);
    const gain = a.ctx.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    osc.connect(gain); gain.connect(a.master);
    osc.start(t); osc.stop(t + 0.95);
  }
}

function makeGlowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,220,170,0.6)');
  g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
