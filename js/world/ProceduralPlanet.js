import * as THREE from 'three';

const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const scratchC = new THREE.Vector3();
const scratchD = new THREE.Vector3();

const TERRAIN_GLSL = `
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float value = 0.0;
  float amp = 0.52;
  for (int i = 0; i < 5; i++) {
    value += noise3(p) * amp;
    p *= 2.03;
    amp *= 0.48;
  }
  return value;
}

float ridged(vec3 p) {
  float n = 1.0 - abs(noise3(p) * 2.0 - 1.0);
  return n * n;
}

float terrainHeight(vec3 dir, float amp) {
  float continents = smoothstep(0.34, 0.78, fbm(dir * 1.45 + vec3(11.7, 4.1, 8.3)));
  float plains = fbm(dir * 5.5 + vec3(3.0, 9.5, 2.4));
  float mountains = ridged(dir * 11.0 + vec3(7.4, 1.7, 5.8));
  float highlands = smoothstep(0.58, 0.90, fbm(dir * 3.2 + vec3(1.4, 6.8, 12.5)));
  float h = continents * 0.48 + plains * 0.18 + mountains * highlands * 0.42;
  h -= 0.18;
  return h * amp;
}
`;

const SURFACE_VERT = `
uniform float uRadius;
uniform float uTerrainAmp;
uniform vec3 uPlanetCenter;
varying vec3 vWorldPosition;
varying vec3 vNormalW;
varying float vHeight;
varying float vMoisture;
${TERRAIN_GLSL}
void main() {
  vec3 dir = normalize(position);
  float h = terrainHeight(dir, uTerrainAmp);
  vec3 displaced = dir * (uRadius + h);
  vHeight = clamp(h / uTerrainAmp, -1.0, 1.0);
  vMoisture = fbm(dir * 4.1 + vec3(19.1, 2.3, 13.2));
  vec4 world = modelMatrix * vec4(displaced, 1.0);
  vWorldPosition = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * dir);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const SURFACE_FRAG = `
uniform vec3 uSunDirection;
uniform vec3 uCameraPosition;
uniform vec3 uPaletteA;
uniform vec3 uPaletteB;
uniform vec3 uPaletteC;
varying vec3 vWorldPosition;
varying vec3 vNormalW;
varying float vHeight;
varying float vMoisture;
void main() {
  vec3 n = normalize(vNormalW);
  float ndl = max(dot(n, normalize(uSunDirection)), 0.0);
  float hemi = n.y * 0.5 + 0.5;

  vec3 ocean = mix(vec3(0.025, 0.13, 0.26), uPaletteA, 0.32);
  vec3 shore = mix(vec3(0.54, 0.50, 0.34), uPaletteC, 0.34);
  vec3 plains = mix(uPaletteA, uPaletteB, 0.34);
  vec3 forest = mix(uPaletteA * 0.55, uPaletteB, 0.40);
  vec3 desert = mix(uPaletteC, vec3(0.55, 0.42, 0.22), 0.24);
  vec3 rock = mix(uPaletteB, vec3(0.42, 0.39, 0.36), 0.42);
  vec3 snow = vec3(0.82, 0.88, 0.88);

  vec3 land = mix(desert, plains, smoothstep(0.25, 0.68, vMoisture));
  land = mix(land, forest, smoothstep(0.58, 0.92, vMoisture) * smoothstep(-0.05, 0.28, vHeight));
  land = mix(land, rock, smoothstep(0.32, 0.62, vHeight));
  land = mix(land, snow, smoothstep(0.58, 0.88, vHeight) + smoothstep(0.88, 0.98, abs(n.y)));
  vec3 col = mix(ocean, shore, smoothstep(-0.16, -0.08, vHeight));
  col = mix(col, land, smoothstep(-0.08, 0.02, vHeight));

  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  float diffuse = 0.13 + ndl * 1.05;
  float bounce = 0.10 * hemi;
  col *= diffuse + bounce;
  col += vec3(0.13, 0.34, 0.50) * rim * 0.18;
  gl_FragColor = vec4(col, 1.0);
}
`;

const ATMOS_VERT = `
varying vec3 vWorldPosition;
varying vec3 vNormalW;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const ATMOS_FRAG = `
uniform vec3 uPlanetCenter;
uniform vec3 uCameraPosition;
uniform vec3 uSunDirection;
uniform float uRadius;
uniform float uAtmosphereRadius;
varying vec3 vWorldPosition;
varying vec3 vNormalW;
void main() {
  vec3 n = normalize(vWorldPosition - uPlanetCenter);
  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  vec3 sunDir = normalize(uSunDirection);
  float camHeight = length(uCameraPosition - uPlanetCenter);
  float inAtmosphere = 1.0 - smoothstep(uRadius, uAtmosphereRadius, camHeight);
  float horizon = pow(1.0 - abs(dot(n, viewDir)), 2.35);
  float sunFacing = smoothstep(-0.25, 0.92, dot(n, sunDir));
  float miePhase = pow(max(dot(viewDir, sunDir), 0.0), 18.0);
  vec3 rayleigh = vec3(0.28, 0.58, 1.0) * horizon * (0.50 + sunFacing * 0.95);
  vec3 mie = vec3(1.0, 0.72, 0.42) * miePhase * horizon * 1.7;
  vec3 innerSky = vec3(0.24, 0.52, 0.88) * inAtmosphere * (0.20 + sunFacing * 0.34);
  float alpha = clamp(horizon * (0.28 + inAtmosphere * 0.58) + miePhase * 0.10, 0.0, 0.72);
  gl_FragColor = vec4(rayleigh + mie + innerSky, alpha);
}
`;

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
    this.lodDistances = options.lodDistances || [
      this.radius * 7.0,
      this.radius * 3.9,
      this.radius * 2.05,
      this.radius * 1.12,
      this.radius * 0.62
    ];
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

    this.sunDirection = new THREE.Vector3(-0.45, 0.55, 0.70).normalize();
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
      insideAtmosphere: false
    };

    this.surfaceMaterial = this.createSurfaceMaterial();
    this.atmosphere = this.createAtmosphere();
    this.group.add(this.atmosphere);

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
        uPaletteA: { value: new THREE.Color(0x0b356d) },
        uPaletteB: { value: new THREE.Color(0x116050) },
        uPaletteC: { value: new THREE.Color(0x93cfff) }
      },
      vertexShader: SURFACE_VERT,
      fragmentShader: SURFACE_FRAG,
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
    const resolution = Math.max(4, this.patchResolution + level * 2);
    const positions = [];
    const normals = [];
    const indices = [];
    const indexOf = [];

    for (let i = 0; i <= resolution; i++) {
      indexOf[i] = [];
      for (let j = 0; j <= resolution - i; j++) {
        const u = i / resolution;
        const v = j / resolution;
        const w = 1 - u - v;
        const dir = new THREE.Vector3()
          .addScaledVector(a, w)
          .addScaledVector(b, u)
          .addScaledVector(c, v)
          .normalize();
        indexOf[i][j] = positions.length / 3;
        positions.push(dir.x, dir.y, dir.z);
        normals.push(dir.x, dir.y, dir.z);
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

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
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

    this.group.rotation.y += dt * 0.006;
    this.lodTimer += dt;
    if (this.lodTimer >= 0.16) {
      this.lodTimer = 0;
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
    const continents = smoothstep(0.34, 0.78, fbm3(dir, 1.45, 11.7, 4.1, 8.3));
    const plains = fbm3(dir, 5.5, 3.0, 9.5, 2.4);
    const mountains = ridged3(dir, 11.0, 7.4, 1.7, 5.8);
    const highlands = smoothstep(0.58, 0.90, fbm3(dir, 3.2, 1.4, 6.8, 12.5));
    return (continents * 0.48 + plains * 0.18 + mountains * highlands * 0.42 - 0.18) * this.terrainAmplitude;
  }

  getBiomeAtDirection(dir, height) {
    const normalizedHeight = height / this.terrainAmplitude;
    const moisture = fbm3(dir, 4.1, 19.1, 2.3, 13.2);
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

function hash3(x, y, z) {
  let n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return n - Math.floor(n);
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

function fbm3(dir, scale, ox, oy, oz) {
  let x = dir.x * scale + ox;
  let y = dir.y * scale + oy;
  let z = dir.z * scale + oz;
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

function ridged3(dir, scale, ox, oy, oz) {
  const n = 1 - Math.abs(noise3(dir.x * scale + ox, dir.y * scale + oy, dir.z * scale + oz) * 2 - 1);
  return n * n;
}
