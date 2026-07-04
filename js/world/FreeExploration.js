import * as THREE from 'three';
import { ProceduralPlanet } from './ProceduralPlanet.js';
import { PlanetSurface } from './PlanetSurface.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const tmp3 = new THREE.Vector3();

// ---- Escala "god-sized" (estilo No Man's Sky) --------------------------------
// WORLD_SCALE multiplica UNIFORMEMENTE radios de planeta, separación orbital
// (AU_UNITS), radios de estrella y orígenes de sistema. Como todo escala junto,
// las PROPORCIONES se conservan intactas — pero la nave (fija ~7,4 u) y el
// astronauta (ojos a 0,34 u, NO escalan) quedan diminutos frente a planetas de
// decenas de unidades: el horizonte se curva menos, el descenso es más largo y
// los mundos imponen. Todo lo derivado del radio (atmósfera, aterrizaje, fog,
// metros/unidad de la telemetría) se reescala solo. El modo Sistema Solar usa su
// propia escala (VISUAL_AU) y NO se ve afectado.
const WORLD_SCALE = 2.6;
const AU_UNITS = 72 * WORLD_SCALE;
const EARTH_RADIUS_KM = 6371;

// ---- Clases de bioma (estilo No Man's Sky): cada planeta rocoso pertenece a
// una y eso define paleta, agua, nubes, flora, fauna, peligro ambiental,
// clima y qué cristal mineral abunda en su superficie. ----
const BIOME_KINDS = {
  exuberante: {
    label: 'EXUBERANTE',
    palette: [0x2e6b34, 0x1c3a24, 0x8fb86a],
    atmoTint: 0x63b8ff,
    water: -0.055, waterColor: 0x0d4d7a, clouds: 0.7,
    floraDensity: 1.0, fauna: true,
    hazardLevel: 0, hazardKind: '',
    crystal: { res: 'sodio', color: 0xffd85e },
    weather: ['CLIMA TEMPLADO', 'LLUVIAS SUAVES', 'BRISAS CÁLIDAS'],
    floraColor: 0x3f9a4e, canopyColor: 0x2f8a44, trunkColor: 0x5a4632, rockColor: 0x7d8188
  },
  oceanico: {
    label: 'OCEÁNICO',
    palette: [0x0b356d, 0x116050, 0x93cfff],
    atmoTint: 0x63b8ff,
    water: -0.02, waterColor: 0x0a3f6e, clouds: 0.85,
    floraDensity: 0.7, fauna: true,
    hazardLevel: 0, hazardKind: '',
    crystal: { res: 'sodio', color: 0xffd85e },
    weather: ['TORMENTAS MARINAS', 'HUMEDAD ALTA', 'NIEBLA COSTERA'],
    floraColor: 0x2f9a6e, canopyColor: 0x2a8a60, trunkColor: 0x4a5a42, rockColor: 0x6d7a82
  },
  arido: {
    label: 'ÁRIDO',
    palette: [0xb66b3d, 0x6a3420, 0xe0b06e],
    atmoTint: 0xffbc65,
    water: null, waterColor: 0, clouds: 0.15,
    floraDensity: 0.25, fauna: true,
    hazardLevel: 0.35, hazardKind: 'CALOR DESECANTE',
    crystal: { res: 'sodio', color: 0xffd85e },
    weather: ['VIENTOS ABRASIVOS', 'SEQUÍA PERPETUA', 'TORMENTAS DE ARENA'],
    floraColor: 0x8a9a3e, canopyColor: 0x7a8a34, trunkColor: 0x6a4a2a, rockColor: 0xa07850
  },
  helado: {
    label: 'HELADO',
    palette: [0x9ed8e8, 0x426a7c, 0xf2fbff],
    atmoTint: 0xaadfff,
    water: null, waterColor: 0, clouds: 0.5,
    floraDensity: 0.18, fauna: false,
    hazardLevel: 0.55, hazardKind: 'FRÍO EXTREMO',
    crystal: { res: 'dioxita', color: 0xa8ecff },
    weather: ['VENTISCAS GÉLIDAS', 'NIEVE PERMANENTE', 'HIELO ETERNO'],
    floraColor: 0x7ac9d8, canopyColor: 0x9adfe8, trunkColor: 0x5a7a86, rockColor: 0x8fb2c2
  },
  toxico: {
    label: 'TÓXICO',
    palette: [0x5a7a2e, 0x3a2a4e, 0xb8d85e],
    atmoTint: 0x9aff5e,
    water: -0.06, waterColor: 0x3a6e2a, clouds: 0.6,
    floraDensity: 0.8, fauna: true,
    hazardLevel: 0.6, hazardKind: 'TOXICIDAD ATMOSFÉRICA',
    crystal: { res: 'amoniaco', color: 0xb6ff5e },
    weather: ['LLUVIA ÁCIDA', 'NIEBLA VENENOSA', 'ESPORAS FLOTANTES'],
    floraColor: 0x8ab82e, canopyColor: 0x6a9a3e, trunkColor: 0x4a3a5e, rockColor: 0x6a7a52
  },
  abrasador: {
    label: 'ABRASADOR',
    palette: [0x7b2d22, 0x301014, 0xf0995a],
    atmoTint: 0xff8a3a,
    water: null, waterColor: 0, clouds: 0.2,
    floraDensity: 0.08, fauna: false,
    hazardLevel: 0.75, hazardKind: 'CALOR EXTREMO',
    crystal: { res: 'fosfato', color: 0xffb066 },
    weather: ['TORMENTAS DE FUEGO', 'CALOR SOFOCANTE', 'CENIZA VOLCÁNICA'],
    floraColor: 0xb85a2e, canopyColor: 0xa04a28, trunkColor: 0x3a1a12, rockColor: 0x8a4a3a
  },
  irradiado: {
    label: 'IRRADIADO',
    palette: [0x5a8a4e, 0x2a3a1e, 0xd8ff6e],
    atmoTint: 0xb8ff4e,
    water: null, waterColor: 0, clouds: 0.35,
    floraDensity: 0.3, fauna: false,
    hazardLevel: 0.7, hazardKind: 'RADIACIÓN EXTREMA',
    crystal: { res: 'uranio', color: 0x9dff3d },
    weather: ['TORMENTAS RADIACTIVAS', 'VIENTO IONIZADO', 'LLUVIA CONTAMINADA'],
    floraColor: 0x8adf3e, canopyColor: 0x6abf3e, trunkColor: 0x3a4a22, rockColor: 0x7a8a5a
  },
  muerto: {
    label: 'MUERTO',
    palette: [0x4d4f52, 0x24282d, 0x9a8c7b],
    atmoTint: 0,
    water: null, waterColor: 0, clouds: 0,
    floraDensity: 0, fauna: false,
    hazardLevel: 0.4, hazardKind: 'SIN ATMÓSFERA',
    crystal: { res: 'cobalto', color: 0x6ea8ff },
    weather: ['VACÍO SILENCIOSO', 'SIN CLIMA', 'POLVO ESTÁTICO'],
    floraColor: 0, canopyColor: 0, trunkColor: 0, rockColor: 0x6d6f72
  }
};

const BIOME_POOL = ['exuberante', 'oceanico', 'arido', 'helado', 'toxico', 'abrasador', 'irradiado', 'muerto'];

// Nombres procedurales de planetas (estilo NMS: pronunciables + sufijo).
const P_SYL = ['Ath', 'Bel', 'Cor', 'Dra', 'Eku', 'Fen', 'Gal', 'Hor', 'Ith', 'Kor',
  'Lum', 'Mar', 'Nov', 'Oxo', 'Pra', 'Quel', 'Rin', 'Sol', 'Ter', 'Uxa', 'Vor', 'Wex', 'Yll', 'Zan'];
const P_SYL2 = ['ara', 'bos', 'cira', 'dium', 'era', 'fal', 'gon', 'hem', 'ios', 'kar',
  'lon', 'mira', 'nos', 'oria', 'pex', 'quor', 'ros', 'tania', 'urn', 'via', 'xis', 'yr', 'zul'];
const P_SUF = ['', '', '', ' Prime', ' Mayor', ' Menor', ' IX', ' V', ' XII', ' Omega'];

function planetName(rnd) {
  return P_SYL[Math.floor(rnd() * P_SYL.length)]
    + P_SYL2[Math.floor(rnd() * P_SYL2.length)]
    + P_SUF[Math.floor(rnd() * P_SUF.length)];
}

const SOLAR_SYSTEM = {
  name: 'SISTEMA SOL',
  origin: new THREE.Vector3(0, -26, -260).multiplyScalar(WORLD_SCALE),
  star: { name: 'SOL', radius: 12, color: 0xffb142, halo: 0xff6a1a, safeRadius: 25 },
  bodies: [
    rocky('Mercurio', 0.39, 2439, 0.38, 'muerto', 0.025),
    rocky('Venus', 0.72, 6052, 0.91, 'abrasador', 0.045),
    rocky('Tierra', 1.0, 6371, 1.0, 'exuberante', 0.055),
    rocky('Marte', 1.52, 3390, 0.38, 'arido', 0.07),
    gas('Jupiter', 5.2, 69911, 2.5, 0xd6a070, 0xb16a3e),
    gas('Saturno', 9.58, 58232, 1.07, 0xe4c38d, 0x8d6a42, true),
    gas('Urano', 19.2, 25362, 0.89, 0x9be8e8, 0x5aa6b3, true),
    gas('Neptuno', 30.1, 24622, 1.14, 0x4778ff, 0x1d3f9a)
  ]
};

const EXTRA_SYSTEMS = [
  proceduralSystem('KEPLER-186', new THREE.Vector3(-1380, 120, -1360).multiplyScalar(WORLD_SCALE), 12, 0xff7b52, 0xff3344, 9812),
  proceduralSystem('TRAPPIST-1', new THREE.Vector3(1720, -84, -1680).multiplyScalar(WORLD_SCALE), 10, 0xff624a, 0xff2730, 24191),
  proceduralSystem('LACAILLE-9352', new THREE.Vector3(980, 210, 1260).multiplyScalar(WORLD_SCALE), 13, 0xffd27a, 0x75a8ff, 6321),
  proceduralSystem('GLIESE-667 C', new THREE.Vector3(-1820, -160, 1120).multiplyScalar(WORLD_SCALE), 11, 0xff9866, 0xff5b30, 17333)
];

const EXPLORATION_SYSTEMS = [SOLAR_SYSTEM, ...EXTRA_SYSTEMS];
const DISCOVERY_KEY = 'orion7.discoveries';

export class FreeExploration {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.enabled = false;
    this.systems = [];
    this.planets = [];
    this.bodies = [];
    // Carga diferida de sistemas: solo el del spawn se construye al entrar; los
    // demás se materializan al acercarse. originShift acumula el origin-shift
    // para colocar bien los sistemas construidos tarde.
    this.pendingSystems = [];
    this.originShift = new THREE.Vector3();
    this.markers = new THREE.Group();
    this.markers.name = 'EXPLORATION_NAV_MARKERS';
    this.markers.visible = false;
    this.scene.add(this.markers);
    this.activePlanet = null;
    this.surfaceBody = null;      // cuerpo con foco atmosférico (o null en vuelo libre)
    this.surface = null;          // PlanetSurface de props/fauna del cuerpo con foco
    this.surfaceBodyPrevMaxLevel = 4;
    this.metersPerUnit = 1000;
    this.telemetry = {
      altitudeMeters: 0,
      altitudeUnits: 0,
      biome: 'ESPACIO',
      insideAtmosphere: false,
      hazard: 'none',
      hazardLevel: 0,
      hazardKind: '',
      landAltitude: 0,
      world: 'EXPLORACION',
      system: 'SISTEMA SOL'
    };

    // Descubrimientos persistentes (estilo NMS: la primera visita a un mundo
    // queda registrada y recompensada).
    try { this.discoveries = JSON.parse(localStorage.getItem(DISCOVERY_KEY) || '{}'); }
    catch { this.discoveries = {}; }

    this.onEnterAtmosphere = null;  // (body, isNewDiscovery) => void
    this.onExitAtmosphere = null;   // (body) => void

    // ---- Transición atmosférica seamless (espacio ↔ cielo del planeta) ----
    // skyFade (0..1): cuánto se funden las estrellas/nebulosas tras el cielo
    // (main.js lo pasa a SpaceEnvironment.setFade). El fondo de la escena se
    // interpola de espacio profundo al color del cielo, y un fog lineal
    // coherente (THREE.Fog para props + uniforms manuales en los shaders de
    // terreno/agua) crea perspectiva aérea y oculta el popping del LOD.
    this.skyFade = 0;
    this.baseBackground = new THREE.Color(0x01040a);
    this.skyBlendColor = new THREE.Color();
    this.fog = new THREE.Fog(0x01040a, 1e6, 1e7);

    // Iluminación de superficie: sol direccional + ambiente hemisférico, solo
    // activos con foco atmosférico (los props/astronauta/nave usan materiales
    // estándar que necesitan luces reales; el terreno se ilumina en su shader).
    this.surfaceSun = new THREE.DirectionalLight(0xfff2dd, 0);
    this.surfaceSun.castShadow = false;
    this.scene.add(this.surfaceSun);
    this.scene.add(this.surfaceSun.target);
    this.surfaceAmbient = new THREE.HemisphereLight(0x8fb8d8, 0x3a3228, 0);
    this.scene.add(this.surfaceAmbient);
  }

  enter(player) {
    if (!this.systems.length) this.build();
    this.enabled = true;
    // El fog vive SIEMPRE en la escena durante Exploración (con far
    // astronómico es invisible); así los materiales estándar compilan una
    // sola vez con soporte de fog y solo animamos color/near/far.
    if (this.scene.background?.isColor) this.baseBackground.copy(this.scene.background);
    this.fog.color.copy(this.baseBackground);
    this.fog.near = 1e6;
    this.fog.far = 1e7;
    this.scene.fog = this.fog;
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
    if (this.surfaceBody) this.exitSurfaceMode();
    this.scene.fog = null;
    this.skyFade = 0;
    if (this.scene.background?.isColor) this.scene.background.copy(this.baseBackground);
    for (const system of this.systems) system.group.visible = false;
    for (const body of this.bodies) body.group.visible = false;
    this.markers.visible = false;
    this.activePlanet = null;
    player.setTerrainProvider(null);
    player.lightSpeedActive = false;
    player.lightSpeedBeta = 0;
    player.lightSpeedGamma = 1;
    player.properTime = 0;
    player.coordinateTime = 0;
  }

  // Foco atmosférico: al cruzar la atmósfera de un planeta rocoso se oculta
  // TODO lo demás (otros sistemas, balizas) y ese planeta sube de nivel de
  // detalle y materializa su superficie viva (flora/minerales/fauna). Es la
  // transición espacio→planeta sin cortes: el resto del universo se congela
  // hasta volver a despegar.
  enterSurfaceMode(body) {
    if (!body || body.kind !== 'rocky' || this.surfaceBody) return false;
    this.surfaceBody = body;
    for (const system of this.systems) system.group.visible = false;
    for (const b of this.bodies) b.group.visible = (b === body);
    this.markers.visible = false;
    this.surfaceBodyPrevMaxLevel = body.planet.maxLevel;
    // Planetas más grandes (WORLD_SCALE) necesitan un nivel más de subdivisión
    // para que el triángulo a ras de suelo siga midiendo decímetros.
    body.planet.maxLevel = Math.max(body.planet.maxLevel, 8);
    if (body.profile) {
      this.surface = new PlanetSurface(body.planet, body.profile, body.seed);
      this.surfaceAmbient.color.set(body.profile.atmoTint || 0x8fb8d8);
      this.surfaceAmbient.groundColor.set(body.profile.palette[1]);
      this.surfaceAmbient.intensity = body.profile.atmoTint ? 0.85 : 0.45;
      this.surfaceSun.intensity = 1.6;
    }

    // Registro de descubrimiento (persistente) la primera vez.
    const key = `${body.system}/${body.name}`;
    const isNew = !this.discoveries[key];
    if (isNew) {
      this.discoveries[key] = Date.now();
      try { localStorage.setItem(DISCOVERY_KEY, JSON.stringify(this.discoveries)); } catch { /* sin persistencia */ }
    }
    this.onEnterAtmosphere?.(body, isNew);
    return true;
  }

  // Al salir de la atmósfera se restauran los demás sistemas/planetas (se
  // reconstruyen texturas/chunks bajo demanda igual que la primera vez), la
  // superficie viva se libera por completo y el detalle vuelve a su nivel
  // normal para no penalizar el vuelo interplanetario.
  exitSurfaceMode() {
    if (!this.surfaceBody) return;
    const body = this.surfaceBody;
    for (const system of this.systems) system.group.visible = true;
    for (const b of this.bodies) b.group.visible = true;
    this.markers.visible = true;
    body.planet.maxLevel = this.surfaceBodyPrevMaxLevel;
    if (this.surface) { this.surface.dispose(); this.surface = null; }
    this.surfaceSun.intensity = 0;
    this.surfaceAmbient.intensity = 0;
    this.surfaceBody = null;
    // De vuelta al espacio: cielo profundo pleno y fog apagado. En el borde
    // de la atmósfera la densidad ya es ~0, así que no hay salto visible.
    body.planet.clearFog();
    this.skyFade = 0;
    if (this.scene.background?.isColor) this.scene.background.copy(this.baseBackground);
    this.fog.color.copy(this.baseBackground);
    this.fog.near = 1e6;
    this.fog.far = 1e7;
    this.onExitAtmosphere?.(body);
  }

  isDiscovered(body) {
    return !!this.discoveries[`${body.system}/${body.name}`];
  }

  build() {
    // Solo el sistema del spawn (SOLAR, que contiene la Tierra para getSafeSpawn)
    // se construye al entrar. Los demás quedan pendientes y se materializan al
    // aproximarse — así entrar a Exploración es mucho más rápido.
    this.buildSystem(SOLAR_SYSTEM);
    this.pendingSystems = [...EXTRA_SYSTEMS];
  }

  // Construye un sistema pendiente cuando el jugador se acerca, colocándolo en
  // coordenadas ya desplazadas si hubo origin-shift, y lo deja visible.
  buildPendingSystems(playerPos) {
    if (!this.pendingSystems.length || this.surfaceBody) return;
    // Umbral entre el radio de un sistema (~1500 u, para construirlo ANTES de
    // alcanzar sus planetas) y la separación entre sistemas (~4600 u, para NO
    // construirlos todos en el spawn). En unidades de mundo ya escaladas.
    const BUILD_RANGE = 2500;
    for (let i = this.pendingSystems.length - 1; i >= 0; i--) {
      const spec = this.pendingSystems[i];
      tmp.copy(spec.origin).sub(this.originShift);
      if (tmp.distanceToSquared(playerPos) > BUILD_RANGE * BUILD_RANGE) continue;
      this.pendingSystems.splice(i, 1);
      const bodyStart = this.bodies.length;
      const markerStart = this.markers.children.length;
      this.buildSystem(spec);
      const sys = this.systems[this.systems.length - 1];
      // Reposiciona el sistema recién creado según el origin-shift acumulado.
      if (this.originShift.lengthSq() > 1e-6) {
        sys.group.position.sub(this.originShift);
        for (let j = bodyStart; j < this.bodies.length; j++) {
          const b = this.bodies[j];
          if (b.kind === 'rocky') b.planet.shiftOrigin(this.originShift);
          else if (b.kind === 'gas') b.group.position.sub(this.originShift);
        }
        for (let j = markerStart; j < this.markers.children.length; j++) {
          this.markers.children[j].position.sub(this.originShift);
        }
      }
      // Coincide con el estado de visibilidad de vuelo libre (todo visible).
      sys.group.visible = true;
      for (let j = bodyStart; j < this.bodies.length; j++) this.bodies[j].group.visible = true;
    }
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
    // La estrella escala con el resto del universo (WORLD_SCALE) para conservar
    // las proporciones: el Sol sigue siendo pequeño frente a la órbita de la
    // Tierra, pero todo es más grande en unidades de mundo.
    const starRadius = starSpec.radius * WORLD_SCALE;
    const safeRadius = starSpec.safeRadius * WORLD_SCALE;
    const group = new THREE.Group();
    group.name = `STAR_${starSpec.name}`;
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(starRadius, 96, 64),
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
      sprite.scale.set(starRadius * scale, starRadius * scale, 1);
      group.add(sprite);
    }
    // Alcance de la luz escalado para que siga iluminando los planetas, ahora
    // más lejos por AU_UNITS mayor.
    group.add(new THREE.PointLight(starSpec.color, 18, 2400 * WORLD_SCALE, 1.05));

    return {
      kind: 'star',
      name: starSpec.name,
      system: systemSpec.name,
      group,
      radius: starRadius,
      atmosphereRadius: safeRadius,
      metersPerUnit: 25000000,
      hazard: 'star',
      sample: makeSample()
    };
  }

  createRockyPlanet(spec, position, systemSpec) {
    const radius = displayRadiusFromKm(spec.radiusKm);
    const terrainAmplitude = Math.max(0.55, radius * spec.relief);
    const profile = BIOME_KINDS[spec.biomeKind] || BIOME_KINDS.muerto;
    const hasAtmo = spec.biomeKind !== 'muerto';
    const atmosphereRadius = radius + Math.max(3.6, radius * (hasAtmo ? 0.32 : 0.14));
    const seed = hashString(`${systemSpec.name}/${spec.name}`);
    const rnd = seededRandom(seed);
    const planet = new ProceduralPlanet(this.scene, this.camera, {
      position,
      radius,
      terrainAmplitude,
      atmosphereRadius,
      metersPerUnit: (spec.radiusKm * 1000) / radius,
      patchResolution: 8,
      maxLevel: 4,
      noiseOffset: new THREE.Vector3(rnd() * 8, rnd() * 8, rnd() * 8),
      waterLevel: profile.water,
      waterColor: profile.waterColor,
      cloudiness: profile.clouds
    });
    planet.name = spec.name;
    planet.group.name = `EXPLORABLE_ROCKY_${spec.name}`;
    planet.group.visible = false;
    tintProceduralPlanet(planet, profile.palette, hasAtmo ? profile.atmoTint : 0);
    if (!hasAtmo) planet.atmosphere.visible = false;

    // Recursos que el escáner/tarjeta del planeta anuncia (y que de verdad
    // aparecen en superficie a través de PlanetSurface).
    const resources = ['ferrita', 'cobalto', profile.crystal.res];
    if (profile.floraDensity > 0) resources.unshift('carbono', 'oxigeno');

    return {
      kind: 'rocky',
      name: spec.name,
      system: systemSpec.name,
      group: planet.group,
      planet,
      profile,
      seed,
      biomeLabel: profile.label,
      weather: profile.weather[Math.floor(rnd() * profile.weather.length)],
      hazardLevel: profile.hazardLevel,
      hazardKind: profile.hazardKind,
      fauna: profile.fauna,
      resources,
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
    const radius = Math.max(30, Math.sqrt(spec.radiusKm / EARTH_RADIUS_KM) * 17) * WORLD_SCALE;
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

    // Transición espacio↔planeta sin cortes, con histéresis para no parpadear
    // justo en el borde de la atmósfera.
    const playerPos = player.rig.position;
    if (this.surfaceBody) {
      this.surfaceBody.group.getWorldPosition(tmp);
      const d = tmp.distanceTo(playerPos);
      if (d > this.surfaceBody.atmosphereRadius * 1.08 && player.mode === 'flight') {
        this.exitSurfaceMode();
      }
    } else {
      const near = this.findNearestBody(playerPos);
      if (near && near.kind === 'rocky') {
        near.group.getWorldPosition(tmp);
        if (tmp.distanceTo(playerPos) < near.atmosphereRadius) this.enterSurfaceMode(near);
      }
    }

    if (this.surfaceBody) {
      // Modo superficie: solo se actualiza (CPU de LOD + GPU de render) el
      // planeta activo y su capa de vida. El resto del universo queda
      // congelado hasta salir.
      const body = this.surfaceBody;
      body.planet.update(dt);
      this.updateSunFor(body);
      if (this.surface) this.surface.update(dt, playerPos);

      // El sol direccional de superficie sigue al jugador desde la dirección
      // real de la estrella (día/noche según dónde estés del planeta).
      this.surfaceSun.position.copy(playerPos).addScaledVector(body.planet.sunDirection, 180);
      this.surfaceSun.target.position.copy(playerPos);

      this.activePlanet = body;
      this.getTelemetryFor(playerPos);
      this.updateAtmosphereBlend(body, playerPos);
      return;
    }

    // Materializa sistemas lejanos al acercarse (carga diferida).
    this.buildPendingSystems(playerPos);

    let nearest = null;
    let nearestScore = Infinity;
    for (const body of this.bodies) {
      body.group.getWorldPosition(tmp);
      const score = tmp2.copy(playerPos).sub(tmp).lengthSq();
      if (body.kind === 'rocky') {
        this.updateSunFor(body);
        // Culling por distancia del LOD: solo recorrer el quadtree del planeta
        // si el jugador está razonablemente cerca. Los planetas lejanos son
        // puntos: no hace falta subdividir su terreno cada frame (gran ahorro
        // de CPU en vuelo interplanetario con muchos cuerpos god-sized).
        const lodRange = body.atmosphereRadius * 6;
        if (score < lodRange * lodRange) body.planet.update(dt);
      }
      if (body.kind === 'gas') body.group.rotation.y += dt * 0.035;
      if (body.kind === 'star') body.group.rotation.y += dt * 0.02;
      if (score < nearestScore) {
        nearestScore = score;
        nearest = body;
      }
    }
    this.activePlanet = nearest;
    this.updateMarkers(dt, player);
    this.getTelemetryFor(playerPos);
  }

  // Mezcla atmosférica continua durante el descenso (estilo NMS): a medida
  // que se baja, el fondo estelar se convierte en cielo del color del planeta
  // (modulado por si es de día o de noche en ese punto), el fog se cierra
  // creando perspectiva aérea que oculta el popping del LOD, y las estrellas
  // se funden (skyFade → SpaceEnvironment). Todo es función suave de la
  // altitud: en el borde de la atmósfera el efecto es exactamente 0.
  updateAtmosphereBlend(body, playerPos) {
    const profile = body.profile;
    if (!profile || !profile.atmoTint) {
      // Mundos sin atmósfera: espacio pleno hasta el suelo (como la Luna).
      this.skyFade = 0;
      return;
    }
    const thick = Math.max(0.001, body.atmosphereRadius - body.radius);
    const density = THREE.MathUtils.clamp(1 - this.telemetry.altitudeUnits / thick, 0, 1);
    body.group.getWorldPosition(tmp);
    tmp2.copy(playerPos).sub(tmp).normalize();
    const sunFacing = THREE.MathUtils.smoothstep(tmp2.dot(body.planet.sunDirection), -0.12, 0.42);

    // Cielo: tinte atmosférico del bioma, oscurecido de noche.
    const dayness = Math.pow(density, 1.25) * (0.16 + 0.84 * sunFacing);
    this.skyBlendColor.set(profile.atmoTint).multiplyScalar(0.20 + 0.80 * sunFacing);
    if (this.scene.background?.isColor) {
      this.scene.background.copy(this.baseBackground).lerp(this.skyBlendColor, dayness);
    }

    // Fog: se cierra al descender. Escalado al RADIO del planeta (el
    // horizonte a pie está a ~sqrt(2·R·h), unas pocas unidades): a ras de
    // suelo far≈1.6·R cubre justo el rango donde el LOD hace pop (0.6·R a
    // 2·R), y en el borde de la atmósfera queda prácticamente abierto.
    // Mismo near/far para THREE.Fog (props, nave) y para los shaders de
    // terreno/agua → fusión idéntica de todas las capas.
    const closeness = Math.pow(density, 0.7);
    const far = body.radius * THREE.MathUtils.lerp(12, 1.5, closeness);
    const near = far * 0.2;
    this.fog.color.copy(this.scene.background?.isColor ? this.scene.background : this.skyBlendColor);
    this.fog.near = near;
    this.fog.far = far;
    body.planet.setFog(this.fog.color, near, far);

    // Las estrellas desaparecen tras el cielo diurno; de noche persisten.
    this.skyFade = density * (0.12 + 0.88 * sunFacing);
  }

  // Dirección del sol del planeta = hacia la estrella REAL de su sistema.
  // Ilumina superficie, atmósfera, agua y nubes de forma coherente: aterrizar
  // en la cara opuesta a la estrella es aterrizar de noche.
  updateSunFor(body) {
    const system = this.systems.find(s => s.name === body.system);
    if (!system) return;
    system.star.group.getWorldPosition(tmp3);
    body.group.getWorldPosition(tmp2);
    body.planet.sunDirection.copy(tmp3.sub(tmp2).normalize());
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
      // El peligro ambiental del planeta (frío/calor/toxicidad/radiación) solo
      // afecta dentro de su atmósfera; el exotraje lo drena a pie.
      sample.hazardLevel = sample.insideAtmosphere ? body.hazardLevel : 0;
      sample.hazardKind = body.hazardKind;
      sample.atmoDepth = sample.insideAtmosphere
        ? THREE.MathUtils.clamp(1 - sample.altitudeUnits / (body.atmosphereRadius - body.radius), 0, 1)
        : 0;
      sample.landAltitude = Math.max(2.5, body.radius * 0.12);
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
    sample.hazardKind = 'PRESIÓN ATMOSFÉRICA';
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
    sample.hazardKind = 'CALOR ESTELAR';
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
        hazardLevel: 0,
        hazardKind: '',
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
    this.telemetry.hazardKind = sample.hazardKind || '';
    this.telemetry.landAltitude = sample.landAltitude || 0;
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
    if (!earth) return new THREE.Vector3(72, 18, -205).multiplyScalar(WORLD_SCALE);
    // Aparece BIEN por encima de la atmósfera (margen relativo al radio, no un
    // offset fijo minúsculo frente a un planeta god-sized) y ligeramente al lado
    // para ver el mundo entero al arrancar.
    const margin = earth.radius * 0.5 + 20;
    return this.getBodyCenter(earth, new THREE.Vector3())
      .add(new THREE.Vector3(0, earth.atmosphereRadius + margin, earth.radius * 0.6));
  }

  getSafeSpawnNear(sample) {
    if (!sample?.center || !sample?.normal) return this.getSafeSpawn();
    // Elevación relativa al radio para quedar SIEMPRE fuera de la atmósfera,
    // sea el cuerpo pequeño o god-sized.
    const r = sample.surfaceRadius || 20;
    const lift = Math.max(80, r * 1.45 + 24);
    return sample.center.clone().addScaledVector(sample.normal, lift);
  }

  shiftOrigin(offset) {
    // Acumula el desplazamiento para colocar bien los sistemas que aún no se
    // han construido (carga diferida) cuando se materialicen más tarde.
    this.originShift.add(offset);
    for (const system of this.systems) system.group.position.sub(offset);
    for (const body of this.bodies) {
      if (body.kind === 'rocky') body.planet.shiftOrigin(offset);
      else if (body.kind === 'gas') body.group.position.sub(offset);
    }
    for (const marker of this.markers.children) marker.position.sub(offset);
    this.surfaceSun.position.sub(offset);
    this.surfaceSun.target.position.sub(offset);
  }

  setMaxLevel(level) {
    for (const planet of this.planets) planet.maxLevel = Math.max(1, level | 0);
    // Con foco atmosférico el planeta activo mantiene su detalle alto.
    if (this.surfaceBody) {
      this.surfaceBodyPrevMaxLevel = Math.max(1, level | 0);
      this.surfaceBody.planet.maxLevel = Math.max(level | 0, 8);
    }
  }

  dispose() {
    if (this.surface) { this.surface.dispose(); this.surface = null; }
    for (const planet of this.planets) planet.dispose();
    for (const system of this.systems) this.scene.remove(system.group);
    this.scene.remove(this.markers);
    this.systems.length = 0;
    this.planets.length = 0;
    this.bodies.length = 0;
  }
}

function rocky(name, orbitAu, radiusKm, gravity, biomeKind, relief) {
  const profile = BIOME_KINDS[biomeKind] || BIOME_KINDS.muerto;
  return {
    kind: 'rocky',
    name,
    orbitAu,
    radiusKm,
    gravity,
    biomeKind,
    relief,
    phase: seededPhase(name),
    inclination: (seededPhase(`${name}-i`) - Math.PI) * 2.2,
    tint: profile.atmoTint || 0x9affde
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
      const biomeKind = BIOME_POOL[Math.floor(rnd() * BIOME_POOL.length)];
      bodies.push(rocky(
        planetName(rnd),
        orbitAu,
        2600 + rnd() * 7600,
        0.2 + rnd() * 1.35,
        biomeKind,
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
  // Raíz cúbica: comprime el rango de tamaños reales. WORLD_SCALE agranda el
  // resultado para el efecto "god-sized" (Tierra ≈ 21·2.6 ≈ 55 u frente a la
  // nave de 7,4 u). La telemetría en metros se mantiene real porque
  // metersPerUnit deriva de este radio.
  return Math.max(15, Math.cbrt(radiusKm / EARTH_RADIUS_KM) * 21) * WORLD_SCALE;
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
    hazardKind: '',
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
    hazardKind: '',
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

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function seededPhase(text) {
  return (hashString(text) / 4294967295) * Math.PI * 2;
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
