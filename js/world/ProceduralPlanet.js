import * as THREE from 'three';
import SURFACE_VERT from '../shaders/surface.vert.glsl';
import SURFACE_FRAG from '../shaders/surface.frag.glsl';
import ATMOS_VERT from '../shaders/atmosphere.vert.glsl';
import ATMOS_FRAG from '../shaders/atmosphere.frag.glsl';
import WATER_FRAG from '../shaders/water.frag.glsl';
import CLOUD_FRAG from '../shaders/clouds.frag.glsl';

const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const scratchC = new THREE.Vector3();
const scratchD = new THREE.Vector3();

// Fog "apagado": far astronómico para que el smoothstep dé siempre 0.
const FOG_OFF_NEAR = 1e6;
const FOG_OFF_FAR = 1e7;

class PlanetChunk {
  constructor(planet, a, b, c, level) {
    this.planet = planet;
    this.a = a.clone().normalize();
    this.b = b.clone().normalize();
    this.c = c.clone().normalize();
    this.level = level;
    this.children = null;
    this.mesh = null;
    this.centerDir = new THREE.Vector3().addVectors(this.a, this.b).add(this.c).normalize();
  }

  update(cameraWorld) {
    const p = this.planet;

    // Culling de horizonte: a escala planetaria, más de la mitad de los chunks
    // caen sobre la cara oculta del planeta (por detrás del horizonte). Sin
    // esto se subdividían y renderizaban miles de parches invisibles — el
    // origen del desplome de FPS al aterrizar. Si el chunk (con un margen para
    // los que rozan el limbo) está bajo el horizonte del observador, se libera
    // por completo y no se toca.
    if (this.centerDir.dot(p.camDirFromCenter) < p.horizonCos) {
      if (this.children) this.disposeChildren();
      this.setMeshVisible(false);
      return;
    }

    const centerWorld = scratchA.copy(this.centerDir)
      .multiplyScalar(p.radius + p.terrainAmplitude * 0.5)
      .add(p.group.position);
    const distance = cameraWorld.distanceTo(centerWorld);
    const splitDistance = p.lodDistances[this.level] || 0;
    const shouldSplit = this.level < p.maxLevel && distance < splitDistance;

    if (shouldSplit) {
      this.ensureChildren();
      this.setMeshVisible(false);
      for (const child of this.children) child.update(cameraWorld);
      return;
    }

    if (this.children && distance > splitDistance * 1.22) {
      this.disposeChildren();
    } else if (this.children) {
      this.setMeshVisible(false);
      for (const child of this.children) child.update(cameraWorld);
      return;
    }

    this.ensureMesh();
    this.setMeshVisible(true);
  }

  ensureChildren() {
    if (this.children) return;
    const ab = scratchB.copy(this.a).add(this.b).normalize().clone();
    const bc = scratchC.copy(this.b).add(this.c).normalize().clone();
    const ca = scratchD.copy(this.c).add(this.a).normalize().clone();
    const level = this.level + 1;
    this.children = [
      new PlanetChunk(this.planet, this.a, ab, ca, level),
      new PlanetChunk(this.planet, ab, this.b, bc, level),
      new PlanetChunk(this.planet, ca, bc, this.c, level),
      new PlanetChunk(this.planet, ab, bc, ca, level)
    ];
  }

  ensureMesh() {
    if (this.mesh) return;
    const geometry = this.planet.buildPatchGeometry(this.a, this.b, this.c, this.level);
    this.mesh = new THREE.Mesh(geometry, this.planet.surfaceMaterial);
    this.mesh.frustumCulled = true;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.planet.surfaceGroup.add(this.mesh);
  }

  setMeshVisible(visible) {
    if (this.mesh) this.mesh.visible = visible;
  }

  disposeChildren() {
    if (!this.children) return;
    for (const child of this.children) child.dispose();
    this.children = null;
  }

  dispose() {
    this.disposeChildren();
    if (this.mesh) {
      this.planet.surfaceGroup.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
  }
}

export class ProceduralPlanet {
  constructor(scene, camera, options = {}) {
    this.scene = scene;
    this.camera = camera;
    this.radius = options.radius ?? 58;
    this.terrainAmplitude = options.terrainAmplitude ?? 7.5;
    this.atmosphereRadius = options.atmosphereRadius ?? 73;
    this.metersPerUnit = options.metersPerUnit ?? 1000;
    this.maxLevel = options.maxLevel ?? 4;
    this.patchResolution = options.patchResolution ?? 10;
    // Semilla de terreno: desplaza el dominio del ruido para que cada planeta
    // tenga una geografía única (misma fórmula, mundo distinto).
    this.noiseOffset = options.noiseOffset ? options.noiseOffset.clone() : new THREE.Vector3();
    // Nivel del mar normalizado (-1..1 respecto a terrainAmplitude) o null.
    this.waterLevel = options.waterLevel ?? null;
    this.cloudiness = options.cloudiness ?? 0;
    // Umbrales de subdivisión por nivel, ligados al tamaño angular real del
    // parche: un chunk de nivel L abarca un arco ≈ (2·R·1.05)/2^L; se divide
    // cuando la cámara está a menos de ~2.4 de esos arcos. Así la subdivisión
    // se concentra donde de verdad se ve detalle y no se dispara en la lejanía
    // (junto con el culling de horizonte, evita los miles de chunks que
    // hundían los FPS al aterrizar). 13 niveles bastan para que a ras de suelo
    // el triángulo mida decímetros y la curvatura desaparezca.
    const chunkArc = this.radius * 2.1;   // arco aproximado del chunk raíz (nivel 0)
    this.lodDistances = options.lodDistances ||
      Array.from({ length: 12 }, (_, i) => (chunkArc / 2 ** i) * 1.9);
    // Culling de horizonte (lo puebla update()): dirección centro→cámara y
    // coseno del ángulo del horizonte con margen para montañas y chunks que
    // rozan el limbo.
    this.camDirFromCenter = new THREE.Vector3(0, 1, 0);
    this.horizonCos = -1;
    this.time = 0;
    this.lodTimer = 1;
    this.telemetry = {
      altitudeMeters: 0,
      altitudeUnits: 0,
      biome: 'ESPACIO',
      insideAtmosphere: false
    };

    this.group = new THREE.Group();
    this.group.name = 'PROCEDURAL_PLANET_SYSTEM';
    this.group.position.copy(options.position || new THREE.Vector3(82, -42, -42));
    scene.add(this.group);

    this.surfaceGroup = new THREE.Group();
    this.surfaceGroup.name = 'GPU_TERRAIN_QUADTREE';
    this.group.add(this.surfaceGroup);

    // Dirección del sol compartida por TODOS los materiales del planeta
    // (superficie, atmósfera, agua, nubes): FreeExploration la actualiza cada
    // cuadro apuntando desde la estrella real del sistema → día/noche reales.
    this.sunDirection = new THREE.Vector3(-0.45, 0.55, 0.70).normalize();
    // Fog atmosférico compartido (perspectiva aérea durante el descenso):
    // FreeExploration lo anima vía setFog(); en reposo queda "apagado".
    this.fogColor = new THREE.Color(0x01040a);
    this.fogNear = { value: FOG_OFF_NEAR };
    this.fogFar = { value: FOG_OFF_FAR };
    this.cameraWorld = new THREE.Vector3();
    this.centerWorld = new THREE.Vector3();
    this.worldQuaternion = new THREE.Quaternion();
    this.inverseQuaternion = new THREE.Quaternion();
    this.sample = {
      center: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      surfaceRadius: 0,
      altitudeUnits: 0,
      altitudeMeters: 0,
      biome: 'ESPACIO',
      insideAtmosphere: false,
      underwater: false
    };

    this.surfaceMaterial = this.createSurfaceMaterial();
    this.atmosphere = this.createAtmosphere();
    this.group.add(this.atmosphere);
    this.water = this.waterLevel !== null ? this.createWater(options.waterColor) : null;
    if (this.water) this.group.add(this.water);
    this.clouds = this.cloudiness > 0 ? this.createClouds() : null;
    if (this.clouds) this.group.add(this.clouds);

    this.roots = this.createIcosahedronRoots();
  }

  createSurfaceMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uRadius: { value: this.radius },
        uTerrainAmp: { value: this.terrainAmplitude },
        uPlanetCenter: { value: this.group.position },
        uCameraPosition: { value: new THREE.Vector3() },
        uSunDirection: { value: this.sunDirection },
        uNoiseOffset: { value: this.noiseOffset },
        uPaletteA: { value: new THREE.Color(0x0b356d) },
        uPaletteB: { value: new THREE.Color(0x116050) },
        uPaletteC: { value: new THREE.Color(0x93cfff) },
        uFogColor: { value: this.fogColor },
        uFogNear: this.fogNear,
        uFogFar: this.fogFar
      },
      vertexShader: SURFACE_VERT,
      fragmentShader: SURFACE_FRAG,
      // Doble cara: red de seguridad contra grietas mínimas de T-junction y
      // contra ver "por debajo" del suelo al asomarse a un borde.
      side: THREE.DoubleSide,
      fog: false
    });
  }

  createAtmosphere() {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uPlanetCenter: { value: this.group.position },
        uCameraPosition: { value: new THREE.Vector3() },
        uSunDirection: { value: this.sunDirection },
        uRadius: { value: this.radius },
        uAtmosphereRadius: { value: this.atmosphereRadius }
      },
      vertexShader: ATMOS_VERT,
      fragmentShader: ATMOS_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(this.atmosphereRadius, 96, 64), material);
    mesh.name = 'RAYLEIGH_MIE_ATMOSPHERE';
    mesh.frustumCulled = false;
    return mesh;
  }

  createWater(waterColor) {
    const seaRadius = this.radius + this.waterLevel * this.terrainAmplitude;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uPlanetCenter: { value: this.group.position },
        uCameraPosition: { value: new THREE.Vector3() },
        uSunDirection: { value: this.sunDirection },
        uWaterColor: { value: new THREE.Color(waterColor || 0x0d4d7a) },
        uTime: { value: 0 },
        uFogColor: { value: this.fogColor },
        uFogNear: this.fogNear,
        uFogFar: this.fogFar
      },
      vertexShader: ATMOS_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(seaRadius, 96, 64), material);
    mesh.name = 'PLANET_OCEAN';
    mesh.renderOrder = 1;
    return mesh;
  }

  createClouds() {
    // Capa alta (80% del grosor atmosférico): desde el suelo se ven como un
    // techo de nubes lejano, no como niebla a la altura de la cabeza.
    const shellRadius = this.radius + (this.atmosphereRadius - this.radius) * 0.8;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uPlanetCenter: { value: this.group.position },
        uCameraPosition: { value: new THREE.Vector3() },
        uSunDirection: { value: this.sunDirection },
        uNoiseOffset: { value: this.noiseOffset },
        uTime: { value: 0 },
        uCoverage: { value: this.cloudiness }
      },
      vertexShader: ATMOS_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(shellRadius, 72, 48), material);
    mesh.name = 'PLANET_CLOUDS';
    mesh.renderOrder = 2;
    return mesh;
  }

  // Fog atmosférico de este planeta (lo anima FreeExploration durante el
  // descenso). Los uniforms son objetos compartidos entre superficie y agua,
  // así que basta con mutarlos aquí.
  setFog(color, near, far) {
    this.fogColor.copy(color);
    this.fogNear.value = near;
    this.fogFar.value = far;
  }

  clearFog() {
    this.fogNear.value = FOG_OFF_NEAR;
    this.fogFar.value = FOG_OFF_FAR;
  }

  createIcosahedronRoots() {
    const source = new THREE.IcosahedronGeometry(1, 0);
    const base = source.index ? source.toNonIndexed() : source;
    const pos = base.attributes.position;
    const roots = [];
    for (let i = 0; i < pos.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(pos, i);
      const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
      roots.push(new PlanetChunk(this, a, b, c, 0));
    }
    if (base !== source) source.dispose();
    base.dispose();
    return roots;
  }

  buildPatchGeometry(a, b, c, level) {
    // Resolución acotada: crecer sin límite con el nivel dispararía el coste
    // de construcción y de render; 18 basta (a nivel de suelo el triángulo ya
    // mide decímetros) y baja mucho el recuento de tris frente a 26.
    const resolution = Math.max(4, Math.min(18, this.patchResolution + level * 2));
    const R = this.radius;
    const amp = this.terrainAmplitude;
    const off = this.noiseOffset;
    const positions = [];
    const heights = [];    // aHeight = h/amp  (para colorear en el fragment)
    const moist = [];      // aMoisture
    const indices = [];
    const indexOf = [];
    const dir = scratchA;

    // ---- Terreno HORNEADO en CPU ----
    // El desplazamiento se aplica AQUÍ, con la MISMA getHeightAtDirection que
    // usa la colisión (paridad exacta por construcción, no por replicar el
    // ruido en dos sitios). El vértex shader ya solo transforma la posición.
    for (let i = 0; i <= resolution; i++) {
      indexOf[i] = [];
      for (let j = 0; j <= resolution - i; j++) {
        const u = i / resolution;
        const v = j / resolution;
        const w = 1 - u - v;
        dir.set(0, 0, 0).addScaledVector(a, w).addScaledVector(b, u).addScaledVector(c, v).normalize();
        const h = this.getHeightAtDirection(dir);
        indexOf[i][j] = positions.length / 3;
        positions.push(dir.x * (R + h), dir.y * (R + h), dir.z * (R + h));
        heights.push(h / amp);
        moist.push(fbm3(dir, off, 4.1, 19.1, 2.3, 13.2));
      }
    }

    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution - i; j++) {
        const v0 = indexOf[i][j];
        const v1 = indexOf[i + 1][j];
        const v2 = indexOf[i][j + 1];
        indices.push(v0, v1, v2);
        if (j < resolution - i - 1) {
          const v3 = indexOf[i + 1][j + 1];
          indices.push(v1, v3, v2);
        }
      }
    }

    // Normales del terreno horneado (superficie sola, antes del faldón): así
    // los vértices del borde reciben una normal suave del propio relieve y no
    // quedan contaminados por la pared vertical del faldón.
    const surfGeo = new THREE.BufferGeometry();
    surfGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions.slice(), 3));
    surfGeo.setIndex(indices.slice());
    surfGeo.computeVertexNormals();
    const normals = Array.from(surfGeo.attributes.normal.array);
    surfGeo.dispose();

    // ---- Faldón anti-grietas (horneado, vértices PROPIOS) ----
    // Cada parche baja una cortina vertical por su perímetro hasta ~medio
    // relieve por debajo del suelo. Al ser vértices duplicados con su propia
    // normal, tapan las grietas de T-junction entre LODs vecinos SIN alterar
    // el sombreado de la superficie. skirtDrop en unidades de mundo.
    const loop = [];
    for (let i = 0; i <= resolution; i++) loop.push(indexOf[i][0]);
    for (let k = 1; k <= resolution; k++) loop.push(indexOf[resolution - k][k]);
    for (let j = resolution - 1; j >= 1; j--) loop.push(indexOf[0][j]);
    const skirtDrop = amp * 0.9 + 0.05;
    const rimStart = positions.length / 3;
    for (const vi of loop) {
      const px = positions[vi * 3], py = positions[vi * 3 + 1], pz = positions[vi * 3 + 2];
      const len = Math.hypot(px, py, pz) || 1;
      // rim superior (copia de la posición del borde)
      positions.push(px, py, pz);
      heights.push(heights[vi]); moist.push(moist[vi]);
      normals.push(px / len, py / len, pz / len);
      // rim inferior (hundido a lo largo del radio de la posición desplazada)
      const s = 1 - skirtDrop / len;
      positions.push(px * s, py * s, pz * s);
      heights.push(heights[vi]); moist.push(moist[vi]);
      normals.push(px / len, py / len, pz / len);
    }
    const L = loop.length;
    for (let k = 0; k < L; k++) {
      const t0 = rimStart + k * 2, b0 = t0 + 1;
      const t1 = rimStart + ((k + 1) % L) * 2, b1 = t1 + 1;
      indices.push(t0, b0, b1, t0, b1, t1);   // pared del faldón (una cara basta, material DoubleSide)
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('aHeight', new THREE.Float32BufferAttribute(heights, 1));
    geometry.setAttribute('aMoisture', new THREE.Float32BufferAttribute(moist, 1));
    geometry.setIndex(indices);
    // Geometría ya en su posición real (radio+relieve): el bounding sphere
    // calculado es exacto, sin el antiguo hack de escalarlo.
    geometry.computeBoundingSphere();
    return geometry;
  }

  update(dt) {
    this.time += dt;
    this.camera.getWorldPosition(this.cameraWorld);
    this.group.getWorldPosition(this.centerWorld);
    this.surfaceMaterial.uniforms.uCameraPosition.value.copy(this.cameraWorld);
    this.surfaceMaterial.uniforms.uPlanetCenter.value.copy(this.centerWorld);
    this.atmosphere.material.uniforms.uCameraPosition.value.copy(this.cameraWorld);
    this.atmosphere.material.uniforms.uPlanetCenter.value.copy(this.centerWorld);
    if (this.water) {
      this.water.material.uniforms.uCameraPosition.value.copy(this.cameraWorld);
      this.water.material.uniforms.uPlanetCenter.value.copy(this.centerWorld);
      this.water.material.uniforms.uTime.value = this.time;
    }
    if (this.clouds) {
      this.clouds.material.uniforms.uCameraPosition.value.copy(this.cameraWorld);
      this.clouds.material.uniforms.uPlanetCenter.value.copy(this.centerWorld);
      this.clouds.material.uniforms.uTime.value = this.time;
      this.clouds.rotation.y += dt * 0.004;   // deriva lenta de la capa de nubes
    }

    // El planeta NO rota sobre sí mismo: el terreno bajo los pies (y los
    // props instanciados encima) permanecen fijos mientras se explora. El
    // ciclo día/noche viene de la posición real de la estrella del sistema.
    this.lodTimer += dt;
    if (this.lodTimer >= 0.16) {
      this.lodTimer = 0;
      // Datos de horizonte para el culling de los chunks: dirección
      // centro→cámara y coseno del ángulo del horizonte + margen (montañas y
      // chunks que rozan el limbo). A gran altura R/(R+h)→pequeño y se ve casi
      // el hemisferio entero; a ras de suelo el cono útil es estrecho.
      scratchA.copy(this.cameraWorld).sub(this.centerWorld);
      const camDist = Math.max(this.radius + 0.001, scratchA.length());
      this.camDirFromCenter.copy(scratchA).multiplyScalar(1 / camDist);
      const horizonAngle = Math.acos(THREE.MathUtils.clamp(this.radius / camDist, -1, 1));
      this.horizonCos = Math.cos(Math.min(Math.PI, horizonAngle + 0.16));
      for (const root of this.roots) root.update(this.cameraWorld);
    }
  }

  sampleTerrain(worldPosition) {
    this.group.getWorldPosition(this.centerWorld);
    this.group.getWorldQuaternion(this.worldQuaternion);
    this.inverseQuaternion.copy(this.worldQuaternion).invert();
    const toPoint = scratchA.copy(worldPosition).sub(this.centerWorld);
    const distance = toPoint.length();
    if (distance < 1e-5) toPoint.set(0, 1, 0);
    const worldDir = toPoint.normalize();
    const localDir = scratchB.copy(worldDir).applyQuaternion(this.inverseQuaternion).normalize();
    const height = this.getHeightAtDirection(localDir);
    const surfaceRadius = this.radius + height;
    const altitudeUnits = distance - surfaceRadius;
    const biome = this.getBiomeAtDirection(localDir, height);
    const altitudeMeters = altitudeUnits * this.metersPerUnit;
    this.sample.center.copy(this.centerWorld);
    this.sample.normal.copy(worldDir);
    this.sample.surfaceRadius = surfaceRadius;
    this.sample.altitudeUnits = altitudeUnits;
    this.sample.altitudeMeters = altitudeMeters;
    this.sample.biome = biome;
    this.sample.insideAtmosphere = distance < this.atmosphereRadius;
    this.sample.underwater = this.waterLevel !== null &&
      distance < this.radius + this.waterLevel * this.terrainAmplitude;
    return this.sample;
  }

  getTelemetryFor(worldPosition) {
    const sample = this.sampleTerrain(worldPosition);
    this.telemetry.altitudeMeters = sample.altitudeMeters;
    this.telemetry.altitudeUnits = sample.altitudeUnits;
    this.telemetry.biome = sample.biome;
    this.telemetry.insideAtmosphere = sample.insideAtmosphere;
    return this.telemetry;
  }

  getHeightAtDirection(dir) {
    const off = this.noiseOffset;
    const continents = smoothstep(0.34, 0.78, fbm3(dir, off, 1.45, 11.7, 4.1, 8.3));
    const plains = fbm3(dir, off, 5.5, 3.0, 9.5, 2.4);
    const mountains = ridged3(dir, off, 11.0, 7.4, 1.7, 5.8);
    const highlands = smoothstep(0.58, 0.90, fbm3(dir, off, 3.2, 1.4, 6.8, 12.5));
    return (continents * 0.48 + plains * 0.18 + mountains * highlands * 0.42 - 0.18) * this.terrainAmplitude;
  }

  getBiomeAtDirection(dir, height) {
    const normalizedHeight = height / this.terrainAmplitude;
    const moisture = fbm3(dir, this.noiseOffset, 4.1, 19.1, 2.3, 13.2);
    const warmth = 1 - Math.abs(dir.y);
    if (normalizedHeight < -0.09) return 'OCEANO';
    if (normalizedHeight < -0.02) return 'COSTA';
    if (normalizedHeight > 0.58 || warmth < 0.13) return 'HIELO';
    if (normalizedHeight > 0.34) return 'CORDILLERA';
    if (moisture < 0.30 && warmth > 0.42) return 'DESIERTO';
    if (moisture > 0.60) return 'BOSQUE';
    return 'LLANURA';
  }

  dispose() {
    for (const root of this.roots) root.dispose();
    this.surfaceMaterial.dispose();
    this.atmosphere.geometry.dispose();
    this.atmosphere.material.dispose();
    if (this.water) { this.water.geometry.dispose(); this.water.material.dispose(); }
    if (this.clouds) { this.clouds.geometry.dispose(); this.clouds.material.dispose(); }
    this.scene.remove(this.group);
  }

  shiftOrigin(offset) {
    this.group.position.sub(offset);
  }
}

function smoothstep(edge0, edge1, x) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Puerto exacto de hash31() en js/shaders/terrain.glsl. ¡Debe coincidir bit a
// bit en estructura con la versión GLSL! Dos algoritmos de ruido diferentes
// harían que el terreno "de verdad" (el que pisa la nave/el jugador,
// calculado aquí en CPU) no coincidiera con el que se ve en pantalla (GPU).
function fract(x) { return x - Math.floor(x); }

function hash3(x, y, z) {
  let px = fract(x * 0.1031);
  let py = fract(y * 0.1031);
  let pz = fract(z * 0.1031);
  const d = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += d; py += d; pz += d;
  return fract((px + py) * pz);
}

function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const n000 = hash3(ix, iy, iz);
  const n100 = hash3(ix + 1, iy, iz);
  const n010 = hash3(ix, iy + 1, iz);
  const n110 = hash3(ix + 1, iy + 1, iz);
  const n001 = hash3(ix, iy, iz + 1);
  const n101 = hash3(ix + 1, iy, iz + 1);
  const n011 = hash3(ix, iy + 1, iz + 1);
  const n111 = hash3(ix + 1, iy + 1, iz + 1);
  const x00 = THREE.MathUtils.lerp(n000, n100, ux);
  const x10 = THREE.MathUtils.lerp(n010, n110, ux);
  const x01 = THREE.MathUtils.lerp(n001, n101, ux);
  const x11 = THREE.MathUtils.lerp(n011, n111, ux);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(x00, x10, uy),
    THREE.MathUtils.lerp(x01, x11, uy),
    uz
  );
}

// Réplica CPU de terrainHeight en GLSL: (dir + uNoiseOffset) * escala + offset
// de octava. La semilla entra sumada a la dirección ANTES de escalar, igual
// que en el shader, para conservar la paridad bit a bit del campo de ruido.
function fbm3(dir, off, scale, ox, oy, oz) {
  let x = (dir.x + off.x) * scale + ox;
  let y = (dir.y + off.y) * scale + oy;
  let z = (dir.z + off.z) * scale + oz;
  let value = 0;
  let amp = 0.52;
  for (let i = 0; i < 5; i++) {
    value += noise3(x, y, z) * amp;
    x *= 2.03;
    y *= 2.03;
    z *= 2.03;
    amp *= 0.48;
  }
  return value;
}

function ridged3(dir, off, scale, ox, oy, oz) {
  const n = 1 - Math.abs(noise3(
    (dir.x + off.x) * scale + ox,
    (dir.y + off.y) * scale + oy,
    (dir.z + off.z) * scale + oz
  ) * 2 - 1);
  return n * n;
}
