import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpE = new THREE.Vector3();
const rayDir = new THREE.Vector3();
const rayStart = new THREE.Vector3();

const CREATURE_HP = 55;   // aguante base de la fauna (varias balas de armas ligeras)

const WEAPONS = [
  { id: 'pulse', key: '1', name: 'Pistola Pulsar', kind: 'ray', damage: 18, fireRate: 5.5, range: 34, spread: 0.012, mag: 18, reload: 1.1, color: 0x72ffe4, pellets: 1 },
  { id: 'carbine', key: '2', name: 'Carabina Orion', kind: 'ray', damage: 11, fireRate: 10, range: 48, spread: 0.018, mag: 32, reload: 1.4, color: 0x9ab8ff, pellets: 1 },
  { id: 'scatter', key: '3', name: 'Escopeta Nebula', kind: 'ray', damage: 9, fireRate: 1.35, range: 18, spread: 0.09, mag: 8, reload: 1.8, color: 0xffb15e, pellets: 7 },
  { id: 'plasma', key: '4', name: 'Lanza Plasma', kind: 'orb', damage: 42, fireRate: 1.6, range: 42, spread: 0.025, mag: 10, reload: 1.7, color: 0xff5d9a, pellets: 1 },
  { id: 'rail', key: '5', name: 'Railgun Relámpago', kind: 'rail', damage: 68, fireRate: 0.72, range: 70, spread: 0.004, mag: 5, reload: 2.2, color: 0xbff7ff, pellets: 1 },
  { id: 'cryo', key: '6', name: 'Crioblaster', kind: 'ray', damage: 14, fireRate: 4.2, range: 28, spread: 0.035, mag: 16, reload: 1.5, color: 0x8fe8ff, pellets: 3, slow: 0.45 },
  { id: 'rocket', key: '7', name: 'Cohete Gravitón', kind: 'blast', damage: 86, fireRate: 0.45, range: 52, spread: 0.018, mag: 3, reload: 2.6, color: 0xff7050, pellets: 1, radius: 4.8 },
  { id: 'arc', key: '8', name: 'Arco Fotónico', kind: 'arc', damage: 26, fireRate: 3.8, range: 32, spread: 0.05, mag: 24, reload: 1.3, color: 0xd6ff73, pellets: 2 },
  { id: 'ak47', key: '9', name: 'AK-47 Meshy', kind: 'ray', damage: 13, fireRate: 11.5, range: 58, spread: 0.022, mag: 30, reload: 1.65, color: 0xffd08a, pellets: 1, model: './assets/models/ak47_meshy.glb' }
];

export class WeaponSystem {
  constructor({ scene, camera, player, exploration, hudEl, toggleEl, listEl, nameEl, ammoEl, toast, onKill }) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.exploration = exploration;   // provee la superficie viva (fauna)
    this.hudEl = hudEl;
    this.toggleEl = toggleEl;
    this.listEl = listEl;
    this.nameEl = nameEl;
    this.ammoEl = ammoEl;
    this.toast = toast;
    this.onKill = onKill;   // (nombre, recompensa) => void
    this.weapons = WEAPONS.map(w => ({ ...w, ammo: w.mag, cooldown: 0, reloadT: 0 }));
    this.index = 0;
    this.visible = false;
    this.hudCollapsed = false;
    this.shots = [];
    this.impacts = [];
    this.audio = null;
    this.loader = new GLTFLoader();
    this.viewModel = new THREE.Group();
    this.viewModel.name = 'STORY_WEAPON_VIEWMODEL';
    this.viewModel.visible = false;
    this.camera.add(this.viewModel);
    this.modelCache = new Map();
    this.modelLoadState = new Map();
    this.buildHud();
    this.bindHudToggle();
    this.bindMouse();
    this.loadWeaponModels();
  }

  buildHud() {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';
    for (let i = 0; i < this.weapons.length; i++) {
      const w = this.weapons[i];
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.weaponIndex = String(i);
      button.innerHTML = `<b>${w.key}</b><span>${w.name}</span>`;
      button.addEventListener('click', () => this.select(i));
      this.listEl.appendChild(button);
    }
    this.refreshHud();
  }

  bindMouse() {
    document.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (!this.visible) return;
      if (e.target.closest('button,input,select,textarea,.settings,.menu-settings,.invpanel')) return;
      this.fire();
    });
  }

  bindHudToggle() {
    this.toggleEl?.addEventListener('click', () => this.toggleHudCollapsed());
  }

  setVisible(visible) {
    const next = !!visible;
    if (this.visible !== next) {
      this.visible = next;
      this.updateViewModel();
    }
    this.syncHudVisibility();
    this.refreshHud();
  }

  toggleHudCollapsed(force = !this.hudCollapsed) {
    this.hudCollapsed = !!force;
    this.syncHudVisibility();
    this.toast?.(this.hudCollapsed ? 'Arsenal oculto. Pulsa <b>B</b> para mostrarlo.' : 'Arsenal visible.', '', 1800);
  }

  syncHudVisibility() {
    this.hudEl?.classList.toggle('hidden', !this.visible || this.hudCollapsed);
    if (this.toggleEl) {
      this.toggleEl.classList.toggle('hidden', !this.visible);
      this.toggleEl.classList.toggle('is-collapsed', this.hudCollapsed);
      this.toggleEl.setAttribute('aria-pressed', String(this.hudCollapsed));
      this.toggleEl.textContent = this.hudCollapsed ? 'MOSTRAR' : 'ARSENAL';
      this.toggleEl.title = this.hudCollapsed ? 'Mostrar arsenal (B)' : 'Ocultar arsenal (B)';
    }
  }

  select(index) {
    if (index < 0 || index >= this.weapons.length) return;
    this.index = index;
    this.updateViewModel();
    this.refreshHud();
    this.toast?.(`Arma equipada: <b>${this.weapons[this.index].name}</b>`, '', 2200);
  }

  next(dir = 1) {
    this.select((this.index + dir + this.weapons.length) % this.weapons.length);
  }

  reload() {
    const w = this.weapons[this.index];
    if (w.ammo >= w.mag || w.reloadT > 0) return;
    w.reloadT = w.reload;
    this.refreshHud();
  }

  update(dt, active) {
    this.setVisible(active);
    for (const w of this.weapons) {
      w.cooldown = Math.max(0, w.cooldown - dt);
      if (w.reloadT > 0) {
        w.reloadT = Math.max(0, w.reloadT - dt);
        if (w.reloadT === 0) w.ammo = w.mag;
      }
    }
    this.updateVisuals(dt);
    this.animateViewModel(dt);
    this.refreshHud();
  }

  loadWeaponModels() {
    for (const weapon of this.weapons) {
      if (!weapon.model || this.modelLoadState.has(weapon.id)) continue;
      this.modelLoadState.set(weapon.id, 'loading');
      this.loader.load(weapon.model, gltf => {
        const root = gltf.scene;
        root.name = `WEAPON_MODEL_${weapon.id}`;
        root.traverse(obj => {
          if (!obj.isMesh) return;
          obj.castShadow = true;
          obj.receiveShadow = true;
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(m => {
              if ('roughness' in m) m.roughness = Math.max(0.42, m.roughness ?? 0.6);
              if ('metalness' in m) m.metalness = Math.min(1, Math.max(0.08, m.metalness ?? 0.2));
            });
          }
        });
        normalizeModel(root, 0.72);
        root.position.set(0.36, -0.34, -0.72);
        root.rotation.set(-0.08, -1.58, 0.06);
        this.modelCache.set(weapon.id, root);
        this.modelLoadState.set(weapon.id, 'ready');
        this.updateViewModel();
      }, undefined, () => {
        this.modelLoadState.set(weapon.id, 'error');
      });
    }
  }

  updateViewModel() {
    const weapon = this.weapons[this.index];
    this.viewModel.visible = this.visible && !!weapon?.model && this.player.mode === 'onfoot';
    this.viewModel.clear();
    if (!this.viewModel.visible) return;
    const model = this.modelCache.get(weapon.id);
    if (model) {
      this.viewModel.add(model);
    } else {
      this.viewModel.add(makeFallbackRifle(weapon.color));
    }
  }

  animateViewModel(dt) {
    if (!this.viewModel.visible) return;
    const t = performance.now() * 0.001;
    const w = this.weapons[this.index];
    const recoil = Math.max(0, w.cooldown * w.fireRate);
    this.viewModel.position.set(
      Math.sin(t * 3.1) * 0.006,
      Math.cos(t * 2.4) * 0.005,
      recoil * 0.035
    );
    this.viewModel.rotation.set(recoil * -0.035, recoil * 0.025, Math.sin(t * 2.2) * 0.006);
  }

  fire() {
    if (!this.visible || this.player.mode !== 'onfoot') return false;
    const w = this.weapons[this.index];
    if (w.reloadT > 0 || w.cooldown > 0) return false;
    if (w.ammo <= 0) {
      this.reload();
      this.clickSound(120);
      return false;
    }

    w.ammo--;
    w.cooldown = 1 / w.fireRate;
    if (w.ammo <= 0) w.reloadT = w.reload;
    this.camera.getWorldPosition(rayStart);
    this.camera.getWorldDirection(rayDir);
    rayStart.addScaledVector(rayDir, 0.65);

    // Acumula el daño por criatura (varios perdigones pueden pegar a la misma).
    const damageByCreature = new Map();
    for (let i = 0; i < w.pellets; i++) {
      tmpA.copy(rayDir);
      tmpA.x += (Math.random() - 0.5) * w.spread;
      tmpA.y += (Math.random() - 0.5) * w.spread;
      tmpA.z += (Math.random() - 0.5) * w.spread;
      tmpA.normalize();
      const hit = this.hitCreature(rayStart, tmpA, w);
      const end = hit
        ? tmpB.copy(hit.point)
        : tmpB.copy(rayStart).addScaledVector(tmpA, w.range);
      this.addShot(rayStart, end, w);
      if (hit) {
        this.addImpact(hit.point, w);
        damageByCreature.set(hit.creature, (damageByCreature.get(hit.creature) || 0) + hit.damage);
      }
    }
    for (const [creature, dmg] of damageByCreature) this.applyCreatureDamage(creature, dmg, w);

    this.shotSound(w);
    this.refreshHud();
    return true;
  }

  // Punto más cercano del rayo a cada criatura viva de la superficie.
  hitCreature(origin, dir, weapon) {
    const surface = this.exploration?.surface;
    if (!surface?.creatures?.length) return null;
    const baseRadius = weapon.kind === 'blast' ? (weapon.radius || 3) : 0.9;
    let best = null;
    for (const c of surface.creatures) {
      if (c.dead || !c.placed) continue;
      surface.creatureWorldPos(c, tmpC);
      const radius = baseRadius * (weapon.kind === 'blast' ? 1 : (0.7 + (c.scale || 1) * 0.5));
      const toCenter = tmpD.copy(tmpC).sub(origin);
      const along = THREE.MathUtils.clamp(toCenter.dot(dir), 0, weapon.range);
      const closest = tmpE.copy(origin).addScaledVector(dir, along);
      const miss = closest.distanceTo(tmpC);
      if (miss > radius) continue;
      if (!best || miss < best.miss) best = { creature: c, point: closest.clone(), miss, radius };
    }
    if (!best) return null;
    const falloff = weapon.kind === 'blast' ? THREE.MathUtils.clamp(1 - best.miss / best.radius, 0.3, 1) : 1;
    return { creature: best.creature, point: best.point, damage: weapon.damage * falloff };
  }

  applyCreatureDamage(creature, dmg, weapon) {
    const surface = this.exploration?.surface;
    if (!surface || creature.dead) return;
    creature.hp = (creature.hp ?? CREATURE_HP) - dmg;
    if (creature.hp <= 0) {
      surface.killCreature?.(creature);
      const reward = 30 + Math.floor(Math.random() * 55);
      this.onKill?.(creature.name || 'Fauna', reward);
    } else {
      this.toast?.(`${weapon.name}: <b>${creature.name}</b> · -${Math.round(dmg)}`, 'toast--warn', 1300);
    }
  }

  addShot(start, end, weapon) {
    const geo = new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: weapon.color,
      transparent: true,
      opacity: weapon.kind === 'rail' ? 1 : 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    line.frustumCulled = false;
    this.scene.add(line);
    this.shots.push({ line, life: weapon.kind === 'rail' ? 0.22 : 0.14 });
  }

  addImpact(point, weapon) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makePulseTexture(),
      color: weapon.color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    sprite.position.copy(point);
    sprite.scale.setScalar(weapon.kind === 'blast' ? 2.4 : 0.75);
    this.scene.add(sprite);
    this.impacts.push({ sprite, life: weapon.kind === 'blast' ? 0.5 : 0.28, max: weapon.kind === 'blast' ? 0.5 : 0.28 });
  }

  updateVisuals(dt) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      s.line.material.opacity = Math.max(0, s.line.material.opacity - dt * 4.8);
      if (s.life <= 0) {
        this.scene.remove(s.line);
        s.line.geometry.dispose();
        s.line.material.dispose();
        this.shots.splice(i, 1);
      }
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const p = this.impacts[i];
      p.life -= dt;
      const k = Math.max(0, p.life / p.max);
      p.sprite.material.opacity = k;
      p.sprite.scale.multiplyScalar(1 + dt * 2.2);
      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        this.impacts.splice(i, 1);
      }
    }
  }

  refreshHud() {
    if (!this.hudEl) return;
    const w = this.weapons[this.index];
    if (this.nameEl) this.nameEl.textContent = w.name;
    if (this.ammoEl) this.ammoEl.textContent = w.reloadT > 0 ? 'RECARGANDO' : `${w.ammo}/${w.mag}`;
    if (this.listEl) {
      [...this.listEl.children].forEach((btn, i) => {
        btn.classList.toggle('active', i === this.index);
        btn.classList.toggle('reloading', this.weapons[i].reloadT > 0);
      });
    }
  }

  ensureAudio() {
    if (this.audio) return this.audio;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain();
      master.gain.value = 0.12;
      master.connect(ctx.destination);
      this.audio = { ctx, master };
    } catch { this.audio = null; }
    return this.audio;
  }

  shotSound(weapon) {
    const a = this.ensureAudio();
    if (!a) return;
    const t = a.ctx.currentTime;
    const osc = a.ctx.createOscillator();
    const gain = a.ctx.createGain();
    osc.type = weapon.kind === 'rail' ? 'square' : 'sawtooth';
    osc.frequency.setValueAtTime(weapon.kind === 'blast' ? 90 : 420, t);
    osc.frequency.exponentialRampToValueAtTime(weapon.kind === 'rail' ? 1400 : 170, t + 0.08);
    gain.gain.setValueAtTime(0.42, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain); gain.connect(a.master);
    osc.start(t); osc.stop(t + 0.2);
  }

  clickSound(freq) {
    const a = this.ensureAudio();
    if (!a) return;
    const t = a.ctx.currentTime;
    const osc = a.ctx.createOscillator();
    const gain = a.ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain); gain.connect(a.master);
    osc.start(t); osc.stop(t + 0.1);
  }
}

let pulseTexture = null;
function makePulseTexture() {
  if (pulseTexture) return pulseTexture;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.28, 'rgba(255,255,255,.72)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  pulseTexture = new THREE.CanvasTexture(cv);
  pulseTexture.colorSpace = THREE.SRGBColorSpace;
  return pulseTexture;
}

function normalizeModel(object, targetMaxSize = 1) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z) || 1;
  object.scale.multiplyScalar(targetMaxSize / max);
  const box2 = new THREE.Box3().setFromObject(object);
  const center = box2.getCenter(new THREE.Vector3());
  object.position.sub(center);
  return object;
}

function makeFallbackRifle(color) {
  const group = new THREE.Group();
  group.name = 'FALLBACK_AK_VIEWMODEL';
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.28 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x16120f, roughness: 0.72, metalness: 0.08 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.13, 0.12), material);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.58, 12), material);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.x = 0.48;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.12), dark);
  stock.position.x = -0.38;
  stock.rotation.z = -0.28;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.09), dark);
  mag.position.set(0.05, -0.18, 0);
  mag.rotation.z = -0.18;
  group.add(body, barrel, stock, mag);
  group.position.set(0.36, -0.34, -0.72);
  group.rotation.set(-0.08, -1.58, 0.06);
  return group;
}
