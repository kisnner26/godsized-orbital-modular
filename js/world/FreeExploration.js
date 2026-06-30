import * as THREE from 'three';
import { ProceduralPlanet } from './ProceduralPlanet.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const tmp3 = new THREE.Vector3();

const AU_UNITS = 72;
const EARTH_RADIUS_KM = 6371;

const PALETTES = {
  basalt: [0x4d4f52, 0x24282d, 0x9a8c7b],
  desert: [0xb66b3d, 0x6a3420, 0xe0b06e],
  ocean: [0x0b356d, 0x116050, 0x93cfff],
  ice: [0x9ed8e8, 0x426a7c, 0xf2fbff],
  ember: [0x7b2d22, 0x301014, 0xf0995a]
};

const SOLAR_SYSTEM = {
  name: 'SISTEMA SOL',
  origin: new THREE.Vector3(0, -26, -260),
  star: { name: 'SOL', radius: 12, color: 0xffb142, halo: 0xff6a1a, safeRadius: 25 },
  bodies: [
    rocky('Mercurio', 0.39, 2439, 0.38, 0, 'basalt', 0.025),
    rocky('Venus', 0.72, 6052, 0.91, 0xffbc65, 'desert', 0.045),
    rocky('Tierra', 1.0, 6371, 1.0, 0x63b8ff, 'ocean', 0.055),
    rocky('Marte', 1.52, 3390, 0.38, 0xd77a48, 'desert', 0.07),
    gas('Jupiter', 5.2, 69911, 2.5, 0xd6a070, 0xb16a3e),
    gas('Saturno', 9.58, 58232, 1.07, 0xe4c38d, 0x8d6a42, true),
    gas('Urano', 19.2, 25362, 0.89, 0x9be8e8, 0x5aa6b3, true),
    gas('Neptuno', 30.1, 24622, 1.14, 0x4778ff, 0x1d3f9a)
  ]
};

const EXTRA_SYSTEMS = [
  proceduralSystem('KEPLER-186', new THREE.Vector3(-1380, 120, -1360), 12, 0xff7b52, 0xff3344, 9812),
  proceduralSystem('TRAPPIST-1', new THREE.Vector3(1720, -84, -1680), 10, 0xff624a, 0xff2730, 24191),
  proceduralSystem('LACAILLE-9352', new THREE.Vector3(980, 210, 1260), 13, 0xffd27a, 0x75a8ff, 6321),
  proceduralSystem('GLIESE-667 C', new THREE.Vector3(-1820, -160, 1120), 11, 0xff9866, 0xff5b30, 17333)
];

const EXPLORATION_SYSTEMS = [SOLAR_SYSTEM, ...EXTRA_SYSTEMS];

export class FreeExploration {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.enabled = false;
    this.systems = [];
    this.planets = [];
    this.bodies = [];
    this.markers = new THREE.Group();
    this.markers.name = 'EXPLORATION_NAV_MARKERS';
    this.markers.visible = false;
    this.scene.add(this.markers);
    this.activePlanet = null;
    this.metersPerUnit = 1000;
    this.telemetry = {
      altitudeMeters: 0,
      altitudeUnits: 0,
      biome: 'ESPACIO',
      insideAtmosphere: false,
      hazard: 'none',
      world: 'EXPLORACION',
      system: 'SISTEMA SOL'
    };
  }

  enter(player) {
    if (!this.systems.length) this.build();
    this.enabled = true;
    for (const system of this.systems) system.group.visible = true;
    for (const body of this.bodies) body.group.visible = true;
    this.markers.visible = true;
    player.setTerrainProvider(this);
    player.gameplayMode = 'free';
    player.startSimulation();
    player.firstPerson = false;
    player.rig.position.copy(this.getSafeSpawn());
    player.rig.rotation.set(0, 0, 0);
    player.vel.set(0, 0, -0.9);
    player.input.yaw = -0.36;
    player.input.pitch = -0.08;
    player.shipYaw = player.input.yaw;
    player.shipPitch = player.input.pitch;
    player.shipRoll = 0;
    player.maxSpeed = Math.max(player.maxSpeed, 600);
    player.camera.position.copy(player.explorationChaseCam || player.chaseCam);
    player.camera.lookAt(player.explorationChaseLook || player.chaseLook);
  }

  exit(player) {
    this.enabled = false;
    for (const system of this.systems) system.group.visible = false;
    for (const body of this.bodies) body.group.visible = false;
    this.markers.visible = false;
    this.activePlanet = null;
    player.setTerrainProvider(null);
  }

  build() {
    for (const spec of EXPLORATION_SYSTEMS) this.buildSystem(spec);
  }

  buildSystem(spec) {
    const systemGroup = new THREE.Group();
    systemGroup.name = `EXPLORATION_SYSTEM_${spec.name}`;
    systemGroup.position.copy(spec.origin);
    systemGroup.visible = false;
    this.scene.add(systemGroup);

    const star = this.createStar(spec.star, spec);
    systemGroup.add(star.group);
    this.systems.push({ ...spec, group: systemGroup, star });
    this.bodies.push(star);
    this.addMarker({
      name: spec.name,
      position: spec.origin,
      radius: Math.max(spec.star.safeRadius, 90),
      tint: spec.star.halo,
      system: spec.name,
      kind: 'system'
    });

    for (const bodySpec of spec.bodies) {
      const angle = bodySpec.phase;
      const orbitRadius = bodySpec.orbitAu * AU_UNITS;
      const worldPosition = tmp.set(
        spec.origin.x + Math.cos(angle) * orbitRadius,
        spec.origin.y + bodySpec.inclination,
        spec.origin.z + Math.sin(angle) * orbitRadius
      ).clone();

      const body = bodySpec.kind === 'gas'
        ? this.createGasGiant(bodySpec, worldPosition, spec)
        : this.createRockyPlanet(bodySpec, worldPosition, spec);

      this.bodies.push(body);
      if (body.planet) this.planets.push(body.planet);
      this.addOrbit(systemGroup, orbitRadius, bodySpec.tint || 0x2a5a70);
      this.addMarker({
        name: bodySpec.name,
        position: worldPosition,
        radius: body.radius,
        tint: bodySpec.tint || 0x72ffe4,
        system: spec.name,
        kind: body.kind
      });
    }
  }

  createStar(starSpec, systemSpec) {
    const group = new THREE.Group();
    group.name = `STAR_${starSpec.name}`;
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(starSpec.radius, 96, 64),
      new THREE.MeshBasicMaterial({ color: starSpec.color, toneMapped: false })
    );
    group.add(core);

    const haloTex = makeRadialTexture('rgba(255,220,120,1)', 'rgba(255,80,0,0)');
    for (const [scale, opacity] of [[5.5, 0.46], [10, 0.20], [17, 0.08]]) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTex,
        color: starSpec.halo,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      sprite.scale.set(starSpec.radius * scale, starSpec.radius * scale, 1);
      group.add(sprite);
    }
    group.add(new THREE.PointLight(starSpec.color, 18, 2400, 1.05));

    return {
      kind: 'star',
      name: starSpec.name,
      system: systemSpec.name,
      group,
      radius: starSpec.radius,
      atmosphereRadius: starSpec.safeRadius,
      metersPerUnit: 25000000,
      hazard: 'star',
      sample: makeSample()
    };
  }

  createRockyPlanet(spec, position, systemSpec) {
    const radius = displayRadiusFromKm(spec.radiusKm);
    const terrainAmplitude = Math.max(0.55, radius * spec.relief);
    const atmosphereRadius = radius + Math.max(3.6, radius * (spec.atmosphere ? 0.32 : 0.14));
    const planet = new ProceduralPlanet(this.scene, this.camera, {
      position,
      radius,
      terrainAmplitude,
      atmosphereRadius,
      metersPerUnit: (spec.radiusKm * 1000) / radius,
      patchResolution: 8,
      maxLevel: 4
    });
    planet.name = spec.name;
    planet.group.name = `EXPLORABLE_ROCKY_${spec.name}`;
    planet.group.visible = false;
    tintProceduralPlanet(planet, PALETTES[spec.palette] || PALETTES.basalt, spec.atmosphere);

    return {
      kind: 'rocky',
      name: spec.name,
      system: systemSpec.name,
      group: planet.group,
      planet,
      radius,
      atmosphereRadius,
      gravity: spec.gravity,
      radiusKm: spec.radiusKm,
      metersPerUnit: planet.metersPerUnit,
      hazard: 'solid',
      sample: makeSample()
    };
  }

  createGasGiant(spec, position, systemSpec) {
    const radius = Math.max(15, Math.sqrt(spec.radiusKm / EARTH_RADIUS_KM) * 8.2);
    const atmosphereRadius = radius * 2.15;
    const group = new THREE.Group();
    group.name = `EXPLORABLE_GAS_${spec.name}`;
    group.position.copy(position);
    group.visible = false;
    this.scene.add(group);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 128, 96),
      new THREE.MeshStandardMaterial({
        map: makeGasTexture(spec.tint, spec.band),
        roughness: 0.78,
        metalness: 0.0,
        emissive: new THREE.Color(spec.band),
        emissiveIntensity: 0.08
      })
    );
    group.add(mesh);

    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(atmosphereRadius, 96, 64),
      new THREE.MeshBasicMaterial({
        color: spec.tint,
        transparent: true,
        opacity: 0.065,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    group.add(atmo);

    if (spec.ring) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(radius * 1.35, radius * 2.35, 192),
        new THREE.MeshBasicMaterial({
          color: spec.band,
          transparent: true,
          opacity: 0.42,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      ring.rotation.x = Math.PI / 2.08;
      group.add(ring);
    }

    return {
      kind: 'gas',
      name: spec.name,
      system: systemSpec.name,
      group,
      mesh,
      radius,
      atmosphereRadius,
      collapseRadius: radius * 0.92,
      gravity: spec.gravity,
      radiusKm: spec.radiusKm,
      metersPerUnit: (spec.radiusKm * 1000) / radius,
      hazard: 'gas',
      sample: makeSample()
    };
  }

  addOrbit(systemGroup, radius, color) {
    const pts = [];
    for (let i = 0; i <= 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const orbit = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.13, depthWrite: false })
    );
    systemGroup.add(orbit);
  }

  addMarker(data) {
    const marker = new THREE.Group();
    marker.position.copy(data.position);
    marker.userData = data;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(data.radius * 1.35, data.radius * 1.45, 96),
      new THREE.MeshBasicMaterial({
        color: data.tint,
        transparent: true,
        opacity: data.kind === 'system' ? 0.18 : 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    ring.rotation.x = Math.PI / 2;
    marker.add(ring);

    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeBeaconTexture(),
      color: data.tint,
      transparent: true,
      opacity: data.kind === 'system' ? 0.42 : 0.56,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    beacon.position.y = data.radius * 1.8;
    beacon.scale.setScalar(data.radius * (data.kind === 'system' ? 0.55 : 0.72));
    marker.add(beacon);

    this.markers.add(marker);
  }

  update(dt, player) {
    if (!this.enabled) return;
    let nearest = null;
    let nearestScore = Infinity;
    for (const body of this.bodies) {
      if (body.kind === 'rocky') body.planet.update(dt);
      if (body.kind === 'gas') body.group.rotation.y += dt * 0.035;
      if (body.kind === 'star') body.group.rotation.y += dt * 0.02;
      body.group.getWorldPosition(tmp);
      const score = tmp2.copy(player.rig.position).sub(tmp).lengthSq();
      if (score < nearestScore) {
        nearestScore = score;
        nearest = body;
      }
    }
    this.activePlanet = nearest;
    this.updateMarkers(dt, player);
    this.getTelemetryFor(player.rig.position);
  }

  updateMarkers(dt, player) {
    const camPos = player.rig.position;
    for (const marker of this.markers.children) {
      const d = tmp.copy(marker.position).sub(camPos).length();
      const scale = THREE.MathUtils.clamp(d * 0.010, 0.42, marker.userData.kind === 'system' ? 7.5 : 4.2);
      marker.scale.setScalar(scale);
      marker.lookAt(camPos);
      const ring = marker.children[0];
      if (ring) ring.rotation.z += dt * (marker.userData.kind === 'system' ? 0.08 : 0.18);
    }
  }

  sampleTerrain(worldPosition) {
    const body = this.findNearestBody(worldPosition);
    if (!body) return emptySample(worldPosition);
    if (body.kind === 'rocky') {
      const sample = body.planet.sampleTerrain(worldPosition);
      sample.kind = 'rocky';
      sample.hazard = 'solid';
      sample.hazardLevel = sample.insideAtmosphere ? 0.12 : 0;
      sample.gravity = body.gravity;
      sample.world = body.name;
      sample.system = body.system;
      sample.metersPerUnit = body.metersPerUnit;
      this.copyTelemetry(sample);
      return sample;
    }
    const sample = body.kind === 'gas'
      ? this.sampleGasGiant(body, worldPosition)
      : this.sampleStar(body, worldPosition);
    this.copyTelemetry(sample);
    return sample;
  }

  sampleGasGiant(body, worldPosition) {
    body.group.getWorldPosition(tmp);
    const toPoint = tmp2.copy(worldPosition).sub(tmp);
    const distance = Math.max(toPoint.length(), 1e-5);
    const normal = tmp3.copy(toPoint).multiplyScalar(1 / distance);
    const altitudeUnits = distance - body.radius;
    const pressureDepth = THREE.MathUtils.clamp((body.atmosphereRadius - distance) / (body.atmosphereRadius - body.collapseRadius), 0, 1);
    const sample = body.sample;
    sample.center.copy(tmp);
    sample.normal.copy(normal);
    sample.surfaceRadius = body.radius;
    sample.altitudeUnits = altitudeUnits;
    sample.altitudeMeters = altitudeUnits * body.metersPerUnit;
    sample.biome = pressureDepth > 0 ? 'ATMOSFERA DENSA' : 'ESPACIO';
    sample.insideAtmosphere = distance < body.atmosphereRadius;
    sample.kind = 'gas';
    sample.hazard = 'gas';
    sample.hazardLevel = pressureDepth;
    sample.fatal = distance < body.collapseRadius;
    sample.gravity = body.gravity;
    sample.world = body.name;
    sample.system = body.system;
    sample.metersPerUnit = body.metersPerUnit;
    return sample;
  }

  sampleStar(body, worldPosition) {
    const center = body.group.getWorldPosition(tmp);
    const toPoint = tmp2.copy(worldPosition).sub(center);
    const distance = Math.max(toPoint.length(), 1e-5);
    const normal = tmp3.copy(toPoint).multiplyScalar(1 / distance);
    const heat = THREE.MathUtils.clamp((body.atmosphereRadius - distance) / body.atmosphereRadius, 0, 1);
    const sample = body.sample;
    sample.center.copy(center);
    sample.normal.copy(normal);
    sample.surfaceRadius = body.radius;
    sample.altitudeUnits = distance - body.radius;
    sample.altitudeMeters = sample.altitudeUnits * body.metersPerUnit;
    sample.biome = heat > 0 ? 'CORONA ESTELAR' : 'ESPACIO';
    sample.insideAtmosphere = distance < body.atmosphereRadius;
    sample.kind = 'star';
    sample.hazard = 'star';
    sample.hazardLevel = heat;
    sample.fatal = distance < body.radius * 1.08;
    sample.gravity = 28;
    sample.world = body.name;
    sample.system = body.system;
    sample.metersPerUnit = body.metersPerUnit;
    return sample;
  }

  getTelemetryFor(worldPosition) {
    const body = this.findNearestBody(worldPosition);
    if (!body) {
      Object.assign(this.telemetry, {
        altitudeMeters: 0,
        altitudeUnits: 0,
        biome: 'ESPACIO',
        insideAtmosphere: false,
        hazard: 'none',
        world: 'ESPACIO',
        system: 'RUTA PROFUNDA'
      });
      return this.telemetry;
    }
    return this.copyTelemetry(this.sampleTerrain(worldPosition));
  }

  copyTelemetry(sample) {
    this.telemetry.altitudeMeters = sample.altitudeMeters;
    this.telemetry.altitudeUnits = sample.altitudeUnits;
    this.telemetry.biome = sample.insideAtmosphere ? sample.biome : 'ESPACIO';
    this.telemetry.insideAtmosphere = sample.insideAtmosphere;
    this.telemetry.hazard = sample.hazard || 'none';
    this.telemetry.hazardLevel = sample.hazardLevel || 0;
    this.telemetry.world = sample.world || 'MUNDO';
    this.telemetry.system = sample.system || 'SISTEMA';
    return this.telemetry;
  }

  findNearestBody(worldPosition) {
    let nearest = null;
    let nearestSurface = Infinity;
    for (const body of this.bodies) {
      const center = this.getBodyCenter(body, tmp);
      const influence = body.atmosphereRadius || body.radius;
      const d = tmp2.copy(worldPosition).sub(center).length() - influence;
      if (d < nearestSurface) {
        nearestSurface = d;
        nearest = body;
      }
    }
    return nearest;
  }

  getBodyCenter(body, target) {
    body.group.getWorldPosition(target);
    return target;
  }

  getSystemOrigin(name) {
    const system = this.systems.find(s => s.name === name);
    return system?.group.position || tmp3.set(0, 0, 0);
  }

  getSafeSpawn() {
    const earth = this.bodies.find(b => b.name === 'Tierra');
    if (!earth) return new THREE.Vector3(72, 18, -205);
    return this.getBodyCenter(earth, new THREE.Vector3()).add(new THREE.Vector3(0, earth.atmosphereRadius + 34, 38));
  }

  getSafeSpawnNear(sample) {
    if (!sample?.center || !sample?.normal) return this.getSafeSpawn();
    const lift = Math.max(80, (sample.surfaceRadius || 20) + 65);
    return sample.center.clone().addScaledVector(sample.normal, lift);
  }

  shiftOrigin(offset) {
    for (const system of this.systems) system.group.position.sub(offset);
    for (const body of this.bodies) {
      if (body.kind === 'rocky') body.planet.shiftOrigin(offset);
      else if (body.kind === 'gas') body.group.position.sub(offset);
    }
    for (const marker of this.markers.children) marker.position.sub(offset);
  }

  setMaxLevel(level) {
    for (const planet of this.planets) planet.maxLevel = Math.max(1, level | 0);
  }

  dispose() {
    for (const planet of this.planets) planet.dispose();
    for (const system of this.systems) this.scene.remove(system.group);
    this.scene.remove(this.markers);
    this.systems.length = 0;
    this.planets.length = 0;
    this.bodies.length = 0;
  }
}

function rocky(name, orbitAu, radiusKm, gravity, atmosphere, palette, relief) {
  return {
    kind: 'rocky',
    name,
    orbitAu,
    radiusKm,
    gravity,
    atmosphere,
    palette,
    relief,
    phase: seededPhase(name),
    inclination: (seededPhase(`${name}-i`) - Math.PI) * 2.2,
    tint: atmosphere || 0x9affde
  };
}

function gas(name, orbitAu, radiusKm, gravity, tint, band, ring = false) {
  return {
    kind: 'gas',
    name,
    orbitAu,
    radiusKm,
    gravity,
    tint,
    band,
    ring,
    phase: seededPhase(name),
    inclination: (seededPhase(`${name}-i`) - Math.PI) * 3.0
  };
}

function proceduralSystem(name, origin, starRadius, starColor, haloColor, seed) {
  const rnd = seededRandom(seed);
  const bodyCount = 5 + Math.floor(rnd() * 3);
  const bodies = [];
  for (let i = 0; i < bodyCount; i++) {
    const orbitAu = 0.72 + i * (0.42 + rnd() * 0.36);
    const isGas = i > 2 && rnd() > 0.48;
    if (isGas) {
      bodies.push(gas(
        `${name}-${roman(i + 1)}`,
        orbitAu,
        22000 + rnd() * 62000,
        0.8 + rnd() * 2.4,
        randomColor(rnd, [0.52, 0.70], [0.35, 0.62], [0.48, 0.72]),
        randomColor(rnd, [0.05, 0.12], [0.28, 0.46], [0.35, 0.58]),
        rnd() > 0.58
      ));
    } else {
      const palette = ['basalt', 'desert', 'ocean', 'ice', 'ember'][Math.floor(rnd() * 5)];
      bodies.push(rocky(
        `${name}-${roman(i + 1)}`,
        orbitAu,
        2600 + rnd() * 7600,
        0.2 + rnd() * 1.35,
        rnd() > 0.42 ? randomColor(rnd, [0.48, 0.62], [0.45, 0.75], [0.55, 0.72]) : 0,
        palette,
        0.035 + rnd() * 0.06
      ));
    }
    bodies[bodies.length - 1].phase = rnd() * Math.PI * 2;
    bodies[bodies.length - 1].inclination = (rnd() - 0.5) * 18;
  }
  return {
    name,
    origin,
    star: { name: `${name} A`, radius: starRadius, color: starColor, halo: haloColor, safeRadius: starRadius * 3.5 },
    bodies
  };
}

function displayRadiusFromKm(radiusKm) {
  return Math.max(4.2, Math.cbrt(radiusKm / EARTH_RADIUS_KM) * 6.4);
}

function tintProceduralPlanet(planet, palette, atmosphereColor) {
  const uniforms = planet.surfaceMaterial.uniforms;
  uniforms.uPaletteA.value.set(palette[0]);
  uniforms.uPaletteB.value.set(palette[1]);
  uniforms.uPaletteC.value.set(palette[2]);
  planet.atmosphere.material.uniforms.uAtmosphereTint = { value: new THREE.Color(atmosphereColor || 0x73d9ff) };
}

function makeSample() {
  return {
    center: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 1, 0),
    surfaceRadius: 0,
    altitudeUnits: 0,
    altitudeMeters: 0,
    biome: 'ESPACIO',
    insideAtmosphere: false,
    hazard: 'none',
    hazardLevel: 0,
    fatal: false,
    world: 'MUNDO',
    system: 'SISTEMA',
    metersPerUnit: 1000
  };
}

function emptySample(worldPosition) {
  return {
    center: tmp.copy(worldPosition),
    normal: tmp2.set(0, 1, 0),
    surfaceRadius: 0,
    altitudeUnits: 0,
    altitudeMeters: 0,
    biome: 'ESPACIO',
    insideAtmosphere: false,
    hazard: 'none',
    hazardLevel: 0,
    fatal: false,
    world: 'ESPACIO',
    system: 'RUTA PROFUNDA',
    metersPerUnit: 1000
  };
}

function makeBeaconTexture() {
  return makeRadialTexture('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)');
}

function makeRadialTexture(colorA, colorB) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, colorA);
  g.addColorStop(0.24, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, colorB);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGasTexture(tint, band) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 512;
  const ctx = cv.getContext('2d');
  const a = new THREE.Color(tint);
  const b = new THREE.Color(band);
  ctx.fillStyle = `#${a.getHexString()}`;
  ctx.fillRect(0, 0, cv.width, cv.height);
  for (let y = 0; y < cv.height; y++) {
    const wave = Math.sin(y * 0.035) * 0.5 + 0.5;
    const c = a.clone().lerp(b, wave * 0.75);
    ctx.fillStyle = `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${0.28 + wave * 0.35})`;
    ctx.fillRect(0, y, cv.width, 1 + (y % 7));
  }
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.ellipse(Math.random() * cv.width, Math.random() * cv.height, 80 + Math.random() * 180, 8 + Math.random() * 28, Math.random() * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 12;
  return tex;
}

function seededPhase(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) / 4294967295) * Math.PI * 2;
}

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randomColor(rnd, hRange, sRange, lRange) {
  const c = new THREE.Color();
  c.setHSL(
    hRange[0] + rnd() * (hRange[1] - hRange[0]),
    sRange[0] + rnd() * (sRange[1] - sRange[0]),
    lRange[0] + rnd() * (lRange[1] - lRange[0])
  );
  return c.getHex();
}

function roman(n) {
  return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][n - 1] || String(n);
}
