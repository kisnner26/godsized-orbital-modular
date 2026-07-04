import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Superficie planetaria viva (estilo No Man's Sky): alrededor del jugador se
// materializan por celdas —determinísticamente, a partir de la semilla del
// planeta— árboles, plantas, rocas de ferrita, cristales y flores de oxígeno,
// todos minables con el láser, además de fauna errante escaneable. Todo usa
// InstancedMesh (un draw call por tipo de prop) y vive en el grupo del
// planeta, así hereda el origen flotante sin trabajo extra.

const tmpDir = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---- Geometrías de props (low-poly, una sola geometría fusionada por tipo) ----

// mergeGeometries exige que TODAS las piezas sean indexadas o ninguna:
// Cylinder/Cone/Sphere vienen indexadas pero Icosahedron/Octahedron no.
// Normalizamos todo a no-indexado antes de fusionar.
function nix(geometry) {
  if (!geometry.index) return geometry;
  const out = geometry.toNonIndexed();
  geometry.dispose();
  return out;
}

function mergeParts(parts) {
  return mergeGeometries(parts.map(nix));
}

function treeGeometry(rnd) {
  const trunk = new THREE.CylinderGeometry(0.06, 0.11, 0.9, 5);
  trunk.translate(0, 0.45, 0);
  const parts = [trunk];
  const layers = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < layers; i++) {
    const r = 0.42 - i * 0.11;
    const canopy = new THREE.IcosahedronGeometry(Math.max(0.16, r), 0);
    canopy.scale(1, 0.75 + rnd() * 0.4, 1);
    canopy.translate((rnd() - 0.5) * 0.12, 0.85 + i * 0.34, (rnd() - 0.5) * 0.12);
    parts.push(canopy);
  }
  return mergeParts(parts);
}

function plantGeometry(rnd) {
  const parts = [];
  const blades = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < blades; i++) {
    const blade = new THREE.ConeGeometry(0.05, 0.34 + rnd() * 0.22, 4);
    const a = (i / blades) * Math.PI * 2;
    blade.translate(0, 0.16, 0);
    blade.rotateX(0.5 + rnd() * 0.3);
    blade.rotateY(a);
    parts.push(blade);
  }
  return mergeParts(parts);
}

function rockGeometry(rnd) {
  const rock = new THREE.IcosahedronGeometry(0.32, 1);
  const pos = rock.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const n = 1 + (rnd() - 0.5) * 0.55;
    pos.setXYZ(i, pos.getX(i) * n, pos.getY(i) * n * 0.72, pos.getZ(i) * n);
  }
  pos.needsUpdate = true;
  rock.computeVertexNormals();
  rock.translate(0, 0.16, 0);
  return rock;
}

function crystalGeometry(rnd) {
  const parts = [];
  const shards = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < shards; i++) {
    const shard = new THREE.OctahedronGeometry(0.16 + rnd() * 0.1, 0);
    shard.scale(0.55, 1.6 + rnd() * 1.2, 0.55);
    shard.rotateX((rnd() - 0.5) * 0.7);
    shard.rotateZ((rnd() - 0.5) * 0.7);
    shard.translate((rnd() - 0.5) * 0.3, 0.2, (rnd() - 0.5) * 0.3);
    parts.push(shard);
  }
  return mergeParts(parts);
}

function flowerGeometry(rnd) {
  const stem = new THREE.CylinderGeometry(0.02, 0.03, 0.3, 4);
  stem.translate(0, 0.15, 0);
  const bud = new THREE.IcosahedronGeometry(0.11 + rnd() * 0.04, 0);
  bud.translate(0, 0.36, 0);
  return mergeParts([stem, bud]);
}

function creatureGeometry() {
  const body = new THREE.IcosahedronGeometry(0.24, 1);
  body.scale(1.35, 0.9, 0.9);
  body.translate(0, 0.34, 0);
  const head = new THREE.IcosahedronGeometry(0.14, 0);
  head.translate(0.36, 0.48, 0);
  const parts = [body, head];
  for (const [x, z] of [[0.16, 0.12], [0.16, -0.12], [-0.16, 0.12], [-0.16, -0.12]]) {
    const leg = new THREE.CylinderGeometry(0.035, 0.03, 0.3, 4);
    leg.translate(x, 0.15, z);
    parts.push(leg);
  }
  return mergeParts(parts);
}

// Nombres procedurales de fauna (género + especie a partir de sílabas).
const SYL_A = ['Ter', 'Vak', 'Ori', 'Ket', 'Zun', 'Mor', 'Ael', 'Rho', 'Cal', 'Ixi'];
const SYL_B = ['ran', 'dus', 'lix', 'mo', 'ther', 'vek', 'nia', 'gos', 'pel', 'quor'];
function creatureName(rnd) {
  return SYL_A[Math.floor(rnd() * SYL_A.length)] + SYL_B[Math.floor(rnd() * SYL_B.length)]
    + ' ' + SYL_A[Math.floor(rnd() * SYL_A.length)].toLowerCase() + SYL_B[Math.floor(rnd() * SYL_B.length)];
}

// Pesos de aparición de cada tipo de prop según el bioma LOCAL del terreno
// (el que devuelve ProceduralPlanet.getBiomeAtDirection para ese punto).
const BIOME_WEIGHTS = {
  BOSQUE:     { arbol: 5, planta: 3, roca: 1, cristal: 0.4, flor: 1 },
  LLANURA:    { arbol: 1, planta: 4, roca: 2, cristal: 0.7, flor: 1.4 },
  DESIERTO:   { arbol: 0, planta: 1, roca: 4, cristal: 1.6, flor: 0.6 },
  CORDILLERA: { arbol: 0.3, planta: 0.8, roca: 4, cristal: 1.8, flor: 0.3 },
  HIELO:      { arbol: 0, planta: 0.4, roca: 2.5, cristal: 2.2, flor: 0.4 },
  COSTA:      { arbol: 0.8, planta: 2.5, roca: 1.5, cristal: 0.5, flor: 1 },
  OCEANO:     { arbol: 0, planta: 0, roca: 0, cristal: 0, flor: 0 }
};

export class PlanetSurface {
  // profile: ver FreeExploration.biomeProfileFor — { key, floraColor, canopyColor,
  //   trunkColor, rockColor, crystal: {res, color}, floraDensity, fauna }
  constructor(planet, profile, seed) {
    this.planet = planet;
    this.profile = profile;
    this.seed = seed >>> 0;
    this.group = new THREE.Group();
    this.group.name = 'PLANET_SURFACE_PROPS';
    planet.group.add(this.group);

    this.cellSize = 7;                       // unidades de arco por celda
    this.range = 20;                         // radio (unidades) donde se materializan props
    this.cells = new Map();                  // key -> { nodes: [] }
    this.cellTimer = 1;
    this.nodes = new Map();                  // nodeId -> node activo (minable)
    this._nodeId = 0;

    this.types = this.buildTypes(profile);
    this.buildFauna(profile);
  }

  buildTypes(profile) {
    const rnd = seededRandom(this.seed ^ 0x51ab);
    const mk = (id, geometry, matOpts, capacity, yieldRes, yieldAmt, scale) => {
      const material = new THREE.MeshStandardMaterial({ flatShading: true, ...matOpts });
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.count = capacity;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;   // se reparte alrededor del jugador; el culling por instancia no aplica
      for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, HIDDEN_MATRIX);
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
      const free = [];
      for (let i = capacity - 1; i >= 0; i--) free.push(i);
      return { id, mesh, free, yieldRes, yieldAmt, scale };
    };

    const types = {};
    if (profile.floraDensity > 0) {
      types.arbol = mk('arbol', treeGeometry(rnd),
        { color: profile.canopyColor, roughness: 0.85 }, 320, 'carbono', 22, [1.0, 2.2]);
      types.planta = mk('planta', plantGeometry(rnd),
        { color: profile.floraColor, roughness: 0.8 }, 380, 'carbono', 9, [0.5, 1.1]);
      types.flor = mk('flor', flowerGeometry(rnd),
        { color: 0xff5a4a, emissive: 0xff2a1a, emissiveIntensity: 0.55, roughness: 0.6 },
        200, 'oxigeno', 8, [0.5, 0.9]);
    }
    types.roca = mk('roca', rockGeometry(rnd),
      { color: profile.rockColor, roughness: 0.95 }, 380, 'ferrita', 16, [0.8, 2.4]);
    types.cristal = mk('cristal', crystalGeometry(rnd), {
      color: profile.crystal.color,
      emissive: profile.crystal.color,
      emissiveIntensity: 0.85,
      roughness: 0.25,
      transparent: true,
      opacity: 0.92
    }, 220, profile.crystal.res, 14, [0.8, 1.8]);
    types.cobalto = mk('cobalto', crystalGeometry(rnd), {
      color: 0x4d8dff, emissive: 0x2a5dff, emissiveIntensity: 0.9,
      roughness: 0.25, transparent: true, opacity: 0.92
    }, 120, 'cobalto', 12, [0.7, 1.4]);
    return types;
  }

  buildFauna(profile) {
    this.creatures = [];
    if (!profile.fauna) { this.faunaMesh = null; return; }
    const rnd = seededRandom(this.seed ^ 0xfa0a);
    const count = 5 + Math.floor(rnd() * 3);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(rnd(), 0.45, 0.5),
      flatShading: true,
      roughness: 0.75
    });
    this.faunaMesh = new THREE.InstancedMesh(creatureGeometry(), material, count);
    this.faunaMesh.frustumCulled = false;
    this.group.add(this.faunaMesh);
    for (let i = 0; i < count; i++) {
      this.creatures.push({
        dir: new THREE.Vector3(),      // dirección radial (posición sobre la esfera)
        heading: rnd() * Math.PI * 2,  // rumbo tangente
        speed: 0.9 + rnd() * 0.8,
        scale: 0.8 + rnd() * 1.4,
        phase: rnd() * 10,
        placed: false,
        scanned: false,
        name: creatureName(rnd)
      });
    }
  }

  // ---- Ciclo de celdas: materializa/retira props según la posición del jugador ----

  update(dt, playerWorldPos) {
    this.cellTimer += dt;
    if (this.cellTimer >= 0.4) {
      this.cellTimer = 0;
      this.refreshCells(playerWorldPos);
    }
    this.updateFauna(dt, playerWorldPos);
  }

  refreshCells(playerWorldPos) {
    const planet = this.planet;
    this.group.worldToLocal(tmpA.copy(playerWorldPos));
    tmpA.normalize();
    // OJO: spawnCell reutiliza los mismos vectores scratch de este módulo, así
    // que la dirección del jugador y la base de la rejilla se guardan como
    // escalares locales antes de entrar al bucle.
    const px = tmpA.x, py = tmpA.y, pz = tmpA.z;
    const Q = Math.max(2, planet.radius / this.cellSize);
    const minDot = Math.cos((this.range * 1.6) / planet.radius);

    // Celdas candidatas: el cubo 3x3x3 alrededor de la celda del jugador,
    // proyectado de vuelta a la esfera (las repetidas se deduplican por clave).
    const wanted = new Set();
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const ix = Math.round(px * Q + dx * 0.9);
      const iy = Math.round(py * Q + dy * 0.9);
      const iz = Math.round(pz * Q + dz * 0.9);
      if (ix === 0 && iy === 0 && iz === 0) continue;
      const key = `${ix},${iy},${iz}`;
      if (wanted.has(key)) continue;
      tmpC.set(ix, iy, iz).normalize();
      if (tmpC.x * px + tmpC.y * py + tmpC.z * pz < minDot) continue;
      wanted.add(key);
      if (!this.cells.has(key)) this.spawnCell(key, tmpC.clone());
    }

    for (const [key, cell] of this.cells) {
      if (!wanted.has(key)) this.despawnCell(key, cell);
    }
  }

  spawnCell(key, centerDir) {
    const planet = this.planet;
    const rnd = seededRandom(hashString(key) ^ this.seed);
    const cell = { nodes: [] };
    this.cells.set(key, cell);

    // Base tangente de la celda para repartir los props dentro de ella.
    tmpA.set(0, 1, 0);
    if (Math.abs(centerDir.y) > 0.94) tmpA.set(1, 0, 0);
    const t1 = tmpB.crossVectors(centerDir, tmpA).normalize().clone();
    const t2 = tmpC.crossVectors(centerDir, t1).normalize().clone();
    const span = this.cellSize / planet.radius;

    const density = 8 + Math.floor(rnd() * 6 + this.profile.floraDensity * 6);
    for (let i = 0; i < density; i++) {
      const dir = tmpDir.copy(centerDir)
        .addScaledVector(t1, (rnd() - 0.5) * span)
        .addScaledVector(t2, (rnd() - 0.5) * span)
        .normalize();
      const h = planet.getHeightAtDirection(dir);
      if (planet.waterLevel !== null && h / planet.terrainAmplitude < planet.waterLevel + 0.015) continue;
      const biome = planet.getBiomeAtDirection(dir, h);
      const weights = BIOME_WEIGHTS[biome];
      if (!weights) continue;

      let total = 0;
      for (const t in weights) if (this.types[t]) total += weights[t] * (t === 'arbol' || t === 'planta' || t === 'flor' ? this.profile.floraDensity : 1);
      // El cobalto aparece poco y en cualquier bioma sólido.
      total += 0.25;
      if (total <= 0.01) continue;
      let pick = rnd() * total;
      let chosen = 'cobalto';
      for (const t in weights) {
        if (!this.types[t]) continue;
        const w = weights[t] * (t === 'arbol' || t === 'planta' || t === 'flor' ? this.profile.floraDensity : 1);
        if (pick < w) { chosen = t; break; }
        pick -= w;
      }

      const type = this.types[chosen];
      if (!type || !type.free.length) continue;
      const instId = type.free.pop();
      const scale = type.scale[0] + rnd() * (type.scale[1] - type.scale[0]);
      const localPos = dir.clone().multiplyScalar(planet.radius + h);
      tmpQ.setFromUnitVectors(UP, dir);
      tmpM.compose(localPos, tmpQ.multiply(new THREE.Quaternion().setFromAxisAngle(UP, rnd() * Math.PI * 2)), tmpS.setScalar(scale));
      type.mesh.setMatrixAt(instId, tmpM);
      type.mesh.instanceMatrix.needsUpdate = true;

      const node = {
        id: this._nodeId++,
        type,
        instId,
        resource: type.yieldRes,
        amountLeft: Math.round(type.yieldAmt * (0.75 + rnd() * 0.6) * Math.min(2, scale)),
        localPos,
        scale,
        alive: true
      };
      cell.nodes.push(node);
      this.nodes.set(node.id, node);
    }
  }

  despawnCell(key, cell) {
    for (const node of cell.nodes) {
      if (node.alive) {
        node.type.mesh.setMatrixAt(node.instId, HIDDEN_MATRIX);
        node.type.mesh.instanceMatrix.needsUpdate = true;
      }
      node.type.free.push(node.instId);
      node.alive = false;
      this.nodes.delete(node.id);
    }
    this.cells.delete(key);
  }

  // Posición en mundo de un nodo (target reutilizable).
  nodeWorldPos(node, target) {
    return this.group.localToWorld(target.copy(node.localPos));
  }

  // Nodos vivos a menos de `radius` del punto dado (en unidades de mundo).
  collectNodesNear(worldPos, radius, out) {
    out.length = 0;
    const r2 = radius * radius;
    for (const node of this.nodes.values()) {
      if (!node.alive) continue;
      this.nodeWorldPos(node, tmpA);
      if (tmpA.distanceToSquared(worldPos) <= r2) out.push(node);
    }
    return out;
  }

  // Extrae `amount` del nodo. Devuelve lo realmente extraído; si el nodo se
  // agota, desaparece del mundo (la instancia se oculta y se libera).
  extract(node, amount) {
    if (!node.alive) return 0;
    const got = Math.min(node.amountLeft, amount);
    node.amountLeft -= got;
    // Encoge el prop a medida que se mina, como feedback visual.
    const k = Math.max(0.25, node.amountLeft / Math.max(1, got + node.amountLeft));
    if (node.amountLeft <= 0) {
      node.alive = false;
      node.type.mesh.setMatrixAt(node.instId, HIDDEN_MATRIX);
      this.nodes.delete(node.id);
    } else {
      tmpDir.copy(node.localPos).normalize();
      tmpQ.setFromUnitVectors(UP, tmpDir);
      tmpM.compose(node.localPos, tmpQ, tmpS.setScalar(node.scale * (0.55 + 0.45 * k)));
      node.type.mesh.setMatrixAt(node.instId, tmpM);
    }
    node.type.mesh.instanceMatrix.needsUpdate = true;
    return got;
  }

  // ---- Fauna errante ----

  updateFauna(dt, playerWorldPos) {
    if (!this.faunaMesh) return;
    const planet = this.planet;
    // playerDir en vector propio: los scratch se reutilizan dentro del bucle.
    const playerDir = this._playerDir || (this._playerDir = new THREE.Vector3());
    this.group.worldToLocal(playerDir.copy(playerWorldPos));
    playerDir.normalize();
    const t = performance.now() * 0.001;

    for (let i = 0; i < this.creatures.length; i++) {
      const c = this.creatures[i];
      if (c.dead) continue;   // abatida: se queda oculta (no reaparece)
      if (!c.placed || c.dir.dot(playerDir) < Math.cos(60 / planet.radius)) {
        // (Re)aparece a 18-30 unidades del jugador, fuera de su vista inmediata.
        const a = Math.random() * Math.PI * 2;
        const away = (18 + Math.random() * 12) / planet.radius;
        tmpB.set(0, 1, 0);
        if (Math.abs(playerDir.y) > 0.94) tmpB.set(1, 0, 0);
        tmpC.crossVectors(playerDir, tmpB).normalize();
        tmpB.crossVectors(playerDir, tmpC).normalize();
        c.dir.copy(playerDir)
          .addScaledVector(tmpC, Math.cos(a) * away)
          .addScaledVector(tmpB, Math.sin(a) * away)
          .normalize();
        c.placed = true;
      }

      // Huye si el jugador se acerca; si no, deambula con rumbo ruidoso.
      const distUnits = c.dir.angleTo(playerDir) * planet.radius;
      const fleeing = distUnits < 7;
      c.heading += (Math.sin(t * 0.4 + c.phase) * 0.8 + (fleeing ? 2.4 : 0)) * dt;
      const speed = (fleeing ? c.speed * 3 : c.speed) * dt / planet.radius;

      // Avanza sobre la esfera a lo largo del rumbo tangente.
      tmpB.set(0, 1, 0);
      if (Math.abs(c.dir.y) > 0.94) tmpB.set(1, 0, 0);
      const e1 = tmpC.crossVectors(c.dir, tmpB).normalize();
      const e2 = tmpB.crossVectors(c.dir, e1).normalize();
      c.dir.addScaledVector(e1, Math.cos(c.heading) * speed)
           .addScaledVector(e2, Math.sin(c.heading) * speed)
           .normalize();

      const h = planet.getHeightAtDirection(c.dir);
      const underwater = planet.waterLevel !== null && h / planet.terrainAmplitude < planet.waterLevel;
      const bob = Math.abs(Math.sin(t * 7 + c.phase)) * 0.08 * c.scale;
      tmpA.copy(c.dir).multiplyScalar(planet.radius + Math.max(h, underwater ? planet.waterLevel * planet.terrainAmplitude : h) + bob);
      tmpQ.setFromUnitVectors(UP, c.dir);
      tmpQ.multiply(new THREE.Quaternion().setFromAxisAngle(UP, -c.heading + Math.PI / 2));
      tmpM.compose(tmpA, tmpQ, tmpS.setScalar(c.scale));
      this.faunaMesh.setMatrixAt(i, tmpM);
    }
    this.faunaMesh.instanceMatrix.needsUpdate = true;
  }

  creatureWorldPos(c, target) {
    return this.group.localToWorld(target.copy(c.dir).multiplyScalar(this.planet.radius + this.planet.getHeightAtDirection(c.dir) + 0.3));
  }

  // Abate una criatura: la marca como muerta y colapsa su instancia (escala 0)
  // para que desaparezca del InstancedMesh sin reordenar el resto.
  killCreature(c) {
    if (!c || c.dead) return;
    c.dead = true;
    const i = this.creatures.indexOf(c);
    if (i >= 0 && this.faunaMesh) {
      tmpM.makeScale(0, 0, 0);
      this.faunaMesh.setMatrixAt(i, tmpM);
      this.faunaMesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const key of [...this.cells.keys()]) this.despawnCell(key, this.cells.get(key));
    for (const t in this.types) {
      const type = this.types[t];
      this.group.remove(type.mesh);
      type.mesh.geometry.dispose();
      type.mesh.material.dispose();
      type.mesh.dispose();
    }
    if (this.faunaMesh) {
      this.group.remove(this.faunaMesh);
      this.faunaMesh.geometry.dispose();
      this.faunaMesh.material.dispose();
      this.faunaMesh.dispose();
    }
    this.planet.group.remove(this.group);
  }
}
