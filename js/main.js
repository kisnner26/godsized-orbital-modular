import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Input } from './systems/Input.js';
import { GamepadController } from './systems/Gamepad.js';
import { ModelLoader } from './systems/ModelLoader.js';
import { Narrator } from './systems/Narrator.js';
import { ShipAudio } from './systems/ShipAudio.js';
import { Radio } from './systems/Radio.js';
import { Player } from './world/Player.js';
import { Cockpit } from './world/Cockpit.js';
import { SolarSystem } from './world/SolarSystem.js';
import { FreeExploration } from './world/FreeExploration.js';
import { buildSpaceEnvironment } from './world/SpaceEnvironment.js';
import { Inventory } from './systems/Inventory.js';
import { Exosuit } from './systems/Exosuit.js';
import { SurfaceGameplay } from './systems/SurfaceGameplay.js';
import { WeaponSystem } from './systems/WeaponSystem.js';
import { SuitHUD } from './ui/SuitHUD.js';
import { HUD } from './ui/HUD.js';
import { PhysicsOverlay } from './ui/PhysicsOverlay.js';
import { GuidedLesson } from './ui/GuidedLesson.js';
import { SystemMap2D } from './ui/SystemMap2D.js';

const canvas = document.getElementById('game');
const boot = document.getElementById('boot');
const bootStatus = document.getElementById('bootStatus');
const startBtn = document.getElementById('startSimulation');
const startSolarBtn = document.getElementById('startSolarMode');
const studioSplash = document.getElementById('studioSplash');
const bootLoader = document.getElementById('bootLoader');
const storyLoading = document.getElementById('storyLoading');
const storyLoadTitle = document.getElementById('storyLoadTitle');
const storyLoadText = document.getElementById('storyLoadText');
const storyLoadBar = document.getElementById('storyLoadBar');
const mainMenu = document.getElementById('mainMenu');
const menuStatus = document.getElementById('menuStatus');
const openMenuSettingsBtn = document.getElementById('openMenuSettings');
const closeMenuSettingsBtn = document.getElementById('closeMenuSettings');
const menuSettings = document.getElementById('menuSettings');
const menuBloom = document.getElementById('menuBloom');
const menuBloomVal = document.getElementById('menuBloomVal');
const menuVolume = document.getElementById('menuVolume');
const menuVolumeVal = document.getElementById('menuVolumeVal');
const hudEl = document.getElementById('hud');
const helmetEl = document.getElementById('helmet');
const panel = document.getElementById('controlPanel');
const missionTitle = document.getElementById('missionTitle');
const thrustPower = document.getElementById('thrustPower');
const maxSpeed = document.getElementById('maxSpeed');
const approachOverlay = document.getElementById('approachOverlay');
const studyMenu = document.getElementById('studyMenu');
const exitObservation = document.getElementById('exitObservation');
const speedControl = document.getElementById('speedControl');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const speedo = document.getElementById('speedo');
const shipRadio = document.getElementById('shipRadio');
const radioToggle = document.getElementById('radioToggle');
const radioNext = document.getElementById('radioNext');
const radioStation = document.getElementById('radioStation');
const radioVolume = document.getElementById('radioVolume');
const bodySwitcher = document.getElementById('bodySwitcher');
const bodyName = document.getElementById('bodyName');
const bodyOptions = document.getElementById('bodyOptions');
const controlsHint = document.getElementById('controlsHint');
const padToast = document.getElementById('padToast');
const cinematic = document.getElementById('cinematic');
const lessonLaunch = document.getElementById('lessonLaunch');
const lessonPanel = document.getElementById('lessonPanel');
const lessonDiagram = document.getElementById('lessonDiagram');
const interactPrompt = document.getElementById('interactPrompt');
const hudToggle = document.getElementById('hudToggle');
const collapseSunBtn = document.getElementById('collapseSunBtn');
const restoreSunBtn = document.getElementById('restoreSunBtn');
let modeSolar = document.getElementById('modeSolar');
let modeFree = document.getElementById('modeFree');
let modeStatus = document.getElementById('modeStatus');

let studioFinished = false;
let assetsReady = false;

function setBootState(state) {
  if (boot) boot.dataset.state = state;
}

function setMainMenuReady(ready, message) {
  assetsReady = ready;
  startBtn.disabled = !ready;
  if (startSolarBtn) startSolarBtn.disabled = !ready;
  if (menuStatus) menuStatus.textContent = message;
}

function revealMainMenu() {
  storyLoading?.classList.add('hidden');
  mainMenu?.classList.remove('hidden');
  setBootState('menu');
}

function revealLoader() {
  mainMenu?.classList.add('hidden');
  storyLoading?.classList.add('hidden');
  setBootState('loading');
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

window.setTimeout(() => {
  studioFinished = true;
  if (assetsReady) revealMainMenu();
  else revealLoader();
}, 2600);

// Ajustes de rendimiento persistidos (calidad gráfica + FPS objetivo). Se
// leen ANTES de crear el motor porque el antialias solo puede decidirse al
// crear el contexto WebGL: el preset "Rendimiento" lo desactiva.
let perfSaved = {};
try { perfSaved = JSON.parse(localStorage.getItem('orion7.perf') || '{}'); } catch { /* localStorage bloqueado */ }
function savePerf(patch) {
  Object.assign(perfSaved, patch);
  try { localStorage.setItem('orion7.perf', JSON.stringify(perfSaved)); } catch { /* sin persistencia */ }
}

const engine = new Engine(canvas, { antialias: perfSaved.gfx !== 'gfxLow' });
const input = new Input(canvas);
const player = new Player(engine.camera, input);
const loader = new ModelLoader(bootStatus);
const cockpit = new Cockpit(engine.scene, loader);
const solar = new SolarSystem(engine.scene);
const freeExploration = new FreeExploration(engine.scene, engine.camera);
const narrator = new Narrator();
const shipAudio = new ShipAudio(input, player);
const radio = new Radio();

// ---- Capa de gameplay estilo No Man's Sky (Exploración) ----
const inventory = new Inventory();
const exosuit = new Exosuit(inventory);
player.exosuit = exosuit;   // combustible de la mochila propulsora a pie
const suitHud = new SuitHUD(inventory, exosuit);
const weaponSystem = new WeaponSystem({
  scene: engine.scene,
  camera: engine.camera,
  player,
  exploration: freeExploration,   // la fauna de la superficie es el objetivo
  hudEl: document.getElementById('weaponHud'),
  toggleEl: document.getElementById('weaponHudToggle'),
  listEl: document.getElementById('weaponList'),
  nameEl: document.getElementById('weaponName'),
  ammoEl: document.getElementById('weaponAmmo'),
  toast: (text, cls, ms) => suitHud.toast(text, cls, ms),
  onKill: (name, reward) => {
    inventory.addUnits(reward);
    suitHud.toast(`<span class="toast__name">Presa abatida: <b>${name}</b></span><span class="toast__qty">+${reward} u</span>`, 'toast--units', 4200);
  }
});
const surfaceGameplay = new SurfaceGameplay({
  scene: engine.scene,
  camera: engine.camera,
  player,
  exploration: freeExploration,
  inventory,
  exosuit,
  markersEl: document.getElementById('resMarkers'),
  scanPulseEl: document.getElementById('scanPulse')
});
const entryVignette = document.getElementById('entryVignette');
const footReticle = document.getElementById('footReticle');

surfaceGameplay.onScanInfo = (text) => suitHud.toast(text, '', 5200);
surfaceGameplay.onCreature = (name, reward) => {
  suitHud.toast(`<span class="toast__name">Especie analizada: <b>${name}</b></span><span class="toast__qty">+${reward} u</span>`, 'toast--units', 5600);
};

exosuit.onWarning = (text) => {
  suitHud.toast(text, 'toast--warn', 5600);
  narrator.say(text, 5200);
};
exosuit.onDeath = () => {
  // Fallo del exotraje: los sistemas de emergencia reaniman al piloto junto a
  // la nave aparcada (sin perder inventario, estilo NMS suave).
  if (player.mode === 'onfoot' && player.parkedShip) {
    player.footPos.copy(player.parkedShip.position).addScaledVector(player.footUp, 1.2);
    player.footVelY = 0;
  }
  exosuit.refill();
  suitHud.toast('<b>EL EXOTRAJE HA FALLADO</b> · Reanimación de emergencia junto a la nave', 'toast--danger', 7000);
  narrator.say('Fallo crítico del exotraje. Los sistemas de emergencia te han reanimado junto a la nave.', 6500);
};

freeExploration.onEnterAtmosphere = (body, isNew) => {
  suitHud.showPlanetCard(body);
  if (isNew) {
    const reward = 150 + Math.floor(Math.random() * 100);
    inventory.addUnits(reward);
    suitHud.showDiscovery('PLANETA DESCUBIERTO', body.name.toUpperCase(), `${body.biomeLabel} · ${body.weather} · +${reward} unidades`);
    narrator.say(`Nuevo mundo registrado: ${body.name}. Bioma ${body.biomeLabel.toLowerCase()}. ${body.hazardKind ? 'Precaución: ' + body.hazardKind.toLowerCase() + '.' : 'Condiciones benignas.'}`, 8000);
  } else {
    narrator.say(`Entrando en la atmósfera de ${body.name}. Desciende y pulsa F a baja altura para aterrizar.`, 6000);
  }
};
freeExploration.onExitAtmosphere = () => {
  suitHud.hidePlanetCard();
  surfaceGameplay.clearMarkers();
  surfaceGameplay.stopMining();
};

function doSuitRecharge() {
  if (gameplayMode !== 'free' || player.mode !== 'onfoot') return;
  const result = exosuit.recharge();
  if (result) {
    suitHud.toast(`Exotraje recargado: ${result}`, '', 4200);
    surfaceGameplay.pickupBlip(660);
  } else {
    suitHud.toast('Sin recursos para recargar (Carbono, Oxígeno o Sodio).', 'toast--warn', 4600);
  }
}
const physics = new PhysicsOverlay(solar);
const map2d = new SystemMap2D();
map2d.onToggle = (open) => {
  if (open) narrator.say(
    'Mapa a escala real: todos los planetas obedecen la misma ley de gravitación. Fíjate en que los interiores se mueven mucho más rápido que los exteriores.',
    8000
  );
};
const lesson = new GuidedLesson({
  player, solar, narrator,
  launchBtn: lessonLaunch,
  panel: lessonPanel,
  titleEl: document.getElementById('lessonStepTitle'),
  dotsEl: document.getElementById('lessonDots'),
  diagram: lessonDiagram,
  prevBtn: document.getElementById('lessonPrev'),
  nextBtn: document.getElementById('lessonNext'),
  playPauseBtn: document.getElementById('lessonPlayPause'),
  closeBtn: document.getElementById('lessonClose'),
  onStart: () => {
    bodySwitcher.classList.add('hidden');
    systemSpeed.classList.add('hidden');
    controlsHint.classList.add('hidden');
    map2d.hide();
    map2d.setButtonVisible(false);
  },
  onStop: () => {
    if (player.mode === 'observe') {
      bodySwitcher.classList.remove('hidden');
      systemSpeed.classList.remove('hidden');
      controlsHint.classList.remove('hidden');
      map2d.setButtonVisible(true);
      updateBodySwitcher();
    }
  }
});

engine.scene.add(player.rig);
const spaceEnv = buildSpaceEnvironment(engine.scene);
const sky = spaceEnv.sky;
// solar.build() se DIFIERE a la primera entrada en modo Sistema Solar (abajo,
// vía ensureSolarBuilt) para que arrancar en Exploración sea mucho más rápido:
// el modo solar construye 8 planetas de alta teselación, el Sol, 2200
// asteroides y texturas remotas, y casi nadie lo necesita al arrancar.
function ensureSolarBuilt() { solar.build(); }

const _camWorld = new THREE.Vector3();
const fade = document.getElementById('fade');
const cineTitle = document.getElementById('cineTitle');
const INTRO_SHIP_POS = new THREE.Vector3(0, 0, 34);

let solarApproachStarted = false;
let menuShown = false;
let lastNarration = 0;
let lastShipEvent = '';
let shipEventCooldown = 0;
let introState = -1;   // -1 sin iniciar, 0..3 fases de la cinemática
let gameplayMode = 'solar';
// El mundo de Exploración es god-sized (WORLD_SCALE): sube el tope de velocidad
// para que cruzar entre planetas grandes no se sienta lento. El modo solar
// mantiene su escala propia.
const MODE_SPEED_LIMITS = { solar: 300, free: 1600 };

function refreshGameplayControls() {
  modeSolar = modeSolar || document.getElementById('modeSolar');
  modeFree = modeFree || document.getElementById('modeFree');
  modeStatus = modeStatus || document.getElementById('modeStatus');
}

// Al pulsar INICIAR: arranca la cinemática de abordaje en primera persona.
function startSimulation() {
  if (gameplayMode === 'free') return startFreeSimulation();
  ensureSolarBuilt();   // modo solar: construir el sistema si aún no existe

  shipAudio.start();
  boot.classList.add('hidden');
  document.body.classList.add('is-flight');

  cockpit.makeIntroShip(INTRO_SHIP_POS);
  cockpit.spawnMeteorFlyby(INTRO_SHIP_POS);
  cockpit.setIntroEVA();
  player.startIntro(INTRO_SHIP_POS);

  cineTitle.textContent = 'ABORDAJE · ORION-07';
  cinematic.classList.remove('hidden');
  fade.classList.add('hidden');
  fade.style.opacity = '0';
  introState = 0;
  narrator.say('Orion cero siete lista. Subiendo a bordo y ocupando la cabina.', 5000);
}

function startFreeSimulation() {
  shipAudio.start();
  boot.classList.add('hidden');
  document.body.classList.add('is-flight');
  cinematic.classList.add('hidden');
  fade.classList.add('hidden');
  fade.style.opacity = '0';
  cockpit.removeIntroShip();
  cockpit.setFlightView('third');
  cockpit.startFlight();
  freeExploration.enter(player);
  input.lock();

  hudEl.classList.remove('hidden');
  helmetEl.classList.add('hidden');
  speedControl.classList.remove('hidden');
  speedo.classList.remove('hidden');
  shipRadio?.classList.remove('hidden');
  controlsHint.classList.remove('hidden');
  setSpeedLimitForMode('free', MODE_SPEED_LIMITS.free);
  if (missionTitle) missionTitle.textContent = 'ORION-07 / EXPLORACIÓN';
  updateControlsHint();
  narrator.say('Exploración activa. Cada planeta rocoso es un mundo único con bioma, clima y recursos propios. Cruza una atmósfera, vuela bajo y pulsa F para aterrizar y explorar a pie.', 9000);
}

function startExplorationFromMenu() {
  if (!assetsReady || startBtn.disabled) return;
  boot.classList.add('hidden');
  setGameplayMode('free');
  startFreeSimulation();
}

function startSolarFromMenu() {
  if (!assetsReady || startSolarBtn?.disabled) return;
  ensureSolarBuilt();
  setGameplayMode('solar');
  startSimulation();
}

// Transición a vuelo manual (tras la cinemática de abordaje).
function enterFlight() {
  player.startSimulation();
  player.firstPerson = true;          // empezamos dentro de la cabina
  cockpit.setFlightView('first');
  input.lock();

  hudEl.classList.remove('hidden');
  helmetEl.classList.add('hidden');
  speedControl.classList.remove('hidden');
  speedo.classList.remove('hidden');
  shipRadio?.classList.remove('hidden');
  cinematic.classList.add('hidden');
  if (missionTitle) missionTitle.textContent = 'ORION-07 / VUELO';

  narrator.say('Cabina presurizada. Pulsa V para alternar primera y tercera persona. Acércate al sistema solar.', 7000);
}

// Máquina de estados de la cinemática de abordaje.
function updateIntroSequence() {
  if (player.mode !== 'intro') return;
  const stage = player.introStage;
  if (stage >= 1 && introState < 1) {
    introState = 1;
    fade.classList.remove('hidden');
    fade.style.opacity = '1';         // fundido a negro al "entrar"
  }
  if (stage >= 2 && introState < 2) {
    introState = 2;
    cockpit.removeIntroShip();
    cockpit.setFlightView('first');   // ya dentro de la cabina
    player.firstPerson = true;
    fade.style.opacity = '0';         // se revela el interior
  }
  if (player.introFinished && introState < 3) {
    introState = 3;
    enterFlight();
  }
}

function beginApproachIfClose() {
  if (gameplayMode !== 'solar' || solarApproachStarted || player.mode !== 'flight') return;
  const center = solar.getSystemCenterWorld();
  const d = player.rig.position.distanceTo(center);
  if (d < 112) {
    solarApproachStarted = true;
    cineTitle.textContent = 'APROXIMACIÓN AL SISTEMA SOLAR';
    cinematic.classList.remove('hidden');     // barras cinematográficas
    panel.classList.add('hidden');
    speedControl.classList.add('hidden');
    speedo.classList.add('hidden');
    shipRadio?.classList.add('hidden');
    controlsHint.classList.add('hidden');
    cockpit.startObservation();               // ocultar la nave durante la cinemática
    player.beginSolarApproach(center);
    input.unlock();
    narrator.say('Secuencia cinematográfica de aproximación al sistema solar.', 4500);
  }
}

// Al terminar la cinemática (5 s) iniciamos la observación con la Tierra.
function onCinematicEnd() {
  if (menuShown) return;
  menuShown = true;
  cinematic.classList.add('hidden');
  enterObservation(2);   // TIERRA
}

// Cuerpos observables con condiciones iniciales realistas (velocidad circular
// v = sqrt(G·M/r) salvo el cometa, que va muy rápido y excéntrico).
const TEX = 'https://threejs.org/examples/textures/planets/';
const BODY_PRESETS = [
  { label: 'MERCURIO', type: 'planet', au: 0.39, v: 47.9, vz: 0,
    look: { name:'Mercurio', url: TEX+'mercury.jpg', radius:.5, rough:.9, colors:['#918477','#554b42','#b0a090'] },
    line: 'Mercurio: muy cerca del Sol, la gravedad es intensa y su velocidad orbital es la mayor de todos.' },
  { label: 'VENUS', type: 'planet', au: 0.72, v: 35.0, vz: 0,
    look: { name:'Venus', url: TEX+'venus.jpg', radius:.8, rough:.85, atmo:0xffbc65, colors:['#d39c57','#8a5527','#f2c987'] },
    line: 'Venus orbita a treinta y cinco kilómetros por segundo bajo la atracción del Sol.' },
  { label: 'TIERRA', type: 'planet', au: 1.0, v: 29.8, vz: 0,
    look: { name:'Tierra', url: TEX+'earth_atmos_2048.jpg', radius:.9, rough:.6, atmo:0x63b8ff, colors:['#083777','#1e6a4e','#9cc5ff'] },
    line: 'La Tierra se mueve bajo la gravedad solar. Su velocidad tangencial la mantiene en órbita.' },
  { label: 'MARTE', type: 'planet', au: 1.52, v: 24.1, vz: 0,
    look: { name:'Marte', url: TEX+'mars_1k_color.jpg', radius:.65, rough:.9, colors:['#b45128','#6a2e19','#d17b48'] },
    line: 'Marte, más lejos del Sol, siente menos fuerza y orbita más despacio.' },
  { label: 'JÚPITER', type: 'planet', au: 5.2, v: 13.1, vz: 0,
    look: { name:'Jupiter', url: TEX+'jupiter.jpg', radius:1.9, rough:.74, colors:['#b17a4d','#e1c08e','#6d4b35'] },
    line: 'Júpiter, muy lejos del Sol, completa su órbita lentamente a trece kilómetros por segundo.' },
  { label: 'SATURNO', type: 'planet', au: 9.58, v: 9.7, vz: 0,
    look: { name:'Saturno', url: TEX+'saturn.jpg', radius:1.6, rough:.77, ring:true, colors:['#c7a876','#f1d6a2','#69533a'] },
    line: 'Saturno orbita aún más despacio, a menos de diez kilómetros por segundo, con sus enormes anillos.' },
  { label: 'URANO', type: 'planet', au: 19.2, v: 6.8, vz: 0,
    look: { name:'Urano', url: TEX+'uranus.jpg', radius:1.3, rough:.62, atmo:0x80f2ff, ring:true, ringColor:0x9ed8e8, ringOpacity:0.25, colors:['#81d2d1','#386d79','#b3ffff'] },
    line: 'Urano, lejísimos del Sol, completa su órbita muy lentamente a casi siete kilómetros por segundo.' },
  { label: 'NEPTUNO', type: 'planet', au: 30.1, v: 5.4, vz: 0,
    look: { name:'Neptuno', url: TEX+'neptune.jpg', radius:1.3, rough:.65, atmo:0x4f87ff, colors:['#21458e','#466fe6','#101c54'] },
    line: 'Neptuno es el más lejano: la gravedad solar allí es débil y su velocidad orbital la menor de todos.' },
  { label: 'COMETA', type: 'comet', au: 0.58, v: 55, vz: 8,
    look: { radius:.42 },
    line: 'El cometa responde a la gravedad del Sol. Su alta velocidad inicial produce una trayectoria excéntrica.' },
  { label: 'ESTRELLA MASIVA', scenario: 'massive', type: 'planet', au: 2.0, v: 73, vz: 0,
    look: { name:'Planeta', url: TEX+'mars_1k_color.jpg', radius:.7, rough:.85, colors:['#b45128','#6a2e19','#d17b48'] },
    line: 'Estrella masiva: con doce masas solares la gravedad es enorme, así que el planeta debe ir muchísimo más rápido para no caer.' },
  { label: 'PÚLSAR', scenario: 'pulsar', type: 'planet', au: 0.25, v: 70, vz: 6,
    look: { name:'Planeta', url: TEX+'mercury.jpg', radius:.45, rough:.9, colors:['#918477','#554b42','#b0a090'] },
    line: 'Púlsar: una estrella de neutrones que gira a gran velocidad. Su densidad extrema curva con fuerza las órbitas cercanas.' },
  { label: 'BINARIO', scenario: 'binary', type: 'planet', au: 5.0, v: 26, vz: 0,
    look: { name:'Tierra', url: TEX+'earth_atmos_2048.jpg', radius:.8, rough:.6, atmo:0x63b8ff, colors:['#083777','#1e6a4e','#9cc5ff'] },
    line: 'Sistema binario: dos estrellas orbitan su centro común y el planeta siente la gravedad combinada de ambas.' },
  { label: 'SOL', scenario: 'sunwobble', type: 'star', au: -0.00496, v: 0.01245, vz: 0,
    look: { name:'Sol', radius: 1.2 },
    line: 'Incluso el Sol se mueve: la gravedad de Júpiter lo desplaza en un pequeño círculo, del tamaño de su propio radio, alrededor del centro de masa del sistema solar.' }
];
let currentBodyIndex = 2;

function fillConditions(b) {
  document.getElementById('bodyType').value = b.type;
  document.getElementById('posX').value = b.au ?? 1;
  document.getElementById('posY').value = 0;
  document.getElementById('posZ').value = 0;
  document.getElementById('velX').value = 0;
  document.getElementById('velY').value = b.v ?? 0;
  document.getElementById('velZ').value = b.vz ?? 0;
  document.getElementById('condBody').textContent = b.label;
}

function enterObservation(index) {
  currentBodyIndex = (index + BODY_PRESETS.length) % BODY_PRESETS.length;
  const b = BODY_PRESETS[currentBodyIndex];
  solar.setScenario(b.scenario || 'solar');
  solar.setObservationMode(true);
  solar.makeSimBody(b.type, b.au, 0, 0, 0, b.v, b.vz || 0, b.look || {});
  fillConditions(b);

  studyMenu.classList.add('hidden');
  exitObservation.classList.remove('hidden');
  panel.classList.add('hidden');
  speedControl.classList.add('hidden');
  speedo.classList.add('hidden');
  shipRadio?.classList.add('hidden');
  bodySwitcher.classList.remove('hidden');
  systemSpeed.classList.remove('hidden');
  hudToggle?.classList.remove('hidden');
  map2d.setButtonVisible(true);
  document.body.classList.add('is-observation');
  input.unlock();
  cockpit.startObservation();
  const camDist = b.type === 'comet' ? 12 : (b.look?.radius || 0.9) * 4 + 2.5;
  player.startObservation(() => solar.getSimBodyWorldPosition(), b.label, camDist);
  physics.show(b.label);
  solar.setVectorsVisible(true);
  updateBodySwitcher();
  lesson.setEarthAvailable(b.label === 'TIERRA');
  collapseSunBtn?.classList.toggle('hidden', b.label !== 'SOL');
  restoreSunBtn?.classList.add('hidden');
  if (missionTitle) missionTitle.textContent = `OBSERVACIÓN / ${b.label}`;
  narrator.say(b.line, 7000);
}

// Cambiar de cuerpo dentro de la observación (sin salir).
function cycleBody(dir) {
  if (player.mode !== 'observe') return;
  enterObservation(currentBodyIndex + dir);
}

function selectBodyByLabel(label) {
  const i = BODY_PRESETS.findIndex(b => b.label === label);
  if (i >= 0) enterObservation(i);
}

function updateBodySwitcher() {
  const cur = BODY_PRESETS[currentBodyIndex];
  bodyName.textContent = cur.label;
  [...bodyOptions.children].forEach(btn => {
    btn.classList.toggle('active', btn.dataset.label === cur.label);
  });
}

// Atajo de teclado: planeta (Tierra) o cometa.
function observe(type) {
  selectBodyByLabel(type === 'comet' ? 'COMETA' : 'TIERRA');
}

function exitObserveMode() {
  lesson.stop();
  lessonLaunch.classList.add('hidden');
  exitObservation.classList.add('hidden');
  panel.classList.add('hidden');
  bodySwitcher.classList.add('hidden');
  systemSpeed.classList.add('hidden');
  cinematic.classList.add('hidden');
  studyMenu.classList.add('hidden');
  collapseSunBtn?.classList.add('hidden');
  hudToggle?.classList.add('hidden');
  setObservationHudCollapsed(false);
  map2d.hide();
  map2d.setButtonVisible(false);
  physics.hide();
  solar.setVectorsVisible(false);
  solar.setObservationMode(false);
  solar.setScenario('solar');
  player.exitObservation();
  cockpit.startFlight();
  document.body.classList.remove('is-observation');
  speedControl.classList.remove('hidden');
  speedo.classList.remove('hidden');
  shipRadio?.classList.remove('hidden');
  input.lock();

  // Reiniciamos el flujo: la nave vuelve al punto de partida y se puede
  // volver a aproximar al sistema solar como al inicio.
  solarApproachStarted = false;
  menuShown = false;

  if (missionTitle) missionTitle.textContent = 'ORION-07 / THIRD PERSON FLIGHT';
  narrator.say(
    'Observación cerrada. Volvemos a la posición inicial; ya puedes pilotar de nuevo.',
    5200
  );
}

// Experimento mental: ¿qué pasaría si el Sol colapsara en un agujero negro?
// Respuesta correcta (y contraintuitiva): si conserva su masa, nada cambia
// para las órbitas — F = G·M·m/r² solo depende de masa y distancia, nunca
// del tamaño del objeto. Lo mostramos volviendo a la vista general para que
// se vean los ocho planetas siguiendo exactamente la misma órbita.
function explainSunCollapse() {
  solar.setSunCollapsed(true);
  exitObserveMode();
  narrator.say(
    'Si el Sol colapsara en un agujero negro conservando toda su masa, la gravedad sobre los planetas no cambiaría en nada: la ley de gravitación universal depende de la masa y la distancia, nunca del tamaño del objeto. Mira el sistema: las ocho órbitas siguen exactamente igual. Solo cambiarían si el Sol perdiera masa en el proceso.',
    11000
  );
  restoreSunBtn?.classList.remove('hidden');
}

restoreSunBtn?.addEventListener('click', () => {
  solar.setSunCollapsed(false);
  restoreSunBtn.classList.add('hidden');
  narrator.say('El Sol vuelve a la normalidad. Las órbitas nunca dejaron de ser las mismas.', 4500);
});

collapseSunBtn?.addEventListener('click', explainSunCollapse);

// HUD de observación: "×" para ocultarlo todo y apreciar solo el universo.
function setObservationHudCollapsed(collapsed) {
  document.body.classList.toggle('is-hud-collapsed', collapsed);
  if (hudToggle) hudToggle.textContent = collapsed ? '☰' : '×';
}
hudToggle?.addEventListener('click', () => {
  setObservationHudCollapsed(!document.body.classList.contains('is-hud-collapsed'));
});

function setGameplayMode(mode) {
  if (mode !== 'solar' && mode !== 'free') return;
  if (gameplayMode === mode) return;
  refreshGameplayControls();

  gameplayMode = mode;
  player.gameplayMode = mode;
  setSpeedLimitForMode(mode, MODE_SPEED_LIMITS[mode]);
  modeSolar?.classList.toggle('active', mode === 'solar');
  modeFree?.classList.toggle('active', mode === 'free');
  modeSolar?.setAttribute('aria-pressed', String(mode === 'solar'));
  modeFree?.setAttribute('aria-pressed', String(mode === 'free'));
  if (modeStatus) modeStatus.textContent = mode === 'solar' ? 'Órbitas y observación' : 'Exploración procedural';
  if (!startBtn.disabled) startBtn.textContent = 'EXPLORAR';
  document.body.classList.toggle('is-free-mode', mode === 'free');

  lesson.stop();
  lessonLaunch.classList.add('hidden');
  const hasStarted = boot.classList.contains('hidden');
  if (mode === 'free') {
    solar.group.visible = false;
    panel.classList.add('hidden');
    studyMenu.classList.add('hidden');
    exitObservation.classList.add('hidden');
    bodySwitcher.classList.add('hidden');
    systemSpeed.classList.add('hidden');
    cinematic.classList.add('hidden');
    physics.hide();
    solar.setVectorsVisible(false);
    document.body.classList.remove('is-observation');
    solarApproachStarted = false;
    menuShown = false;
    if (hasStarted) startFreeSimulation();
  } else {
    ensureSolarBuilt();   // cambiar a modo solar: construir si aún no existe
    freeExploration.exit(player);
    suitHud.setVisible(false);
    suitHud.hidePlanetCard();
    suitHud.invPanel.classList.add('hidden');
    footReticle.classList.add('hidden');
    surfaceGameplay.stopMining();
    surfaceGameplay.clearMarkers();
    entryVignette.style.opacity = '0';
    solar.group.visible = true;
    if (hasStarted) {
      player.exitObservation();
      cockpit.startFlight();
      input.lock();
      hudEl.classList.remove('hidden');
      speedControl.classList.remove('hidden');
      speedo.classList.remove('hidden');
      shipRadio?.classList.remove('hidden');
      controlsHint.classList.remove('hidden');
      bodySwitcher.classList.add('hidden');
      systemSpeed.classList.add('hidden');
      physics.hide();
      if (missionTitle) missionTitle.textContent = 'ORION-07 / VUELO';
      narrator.say('Modo sistema solar activo. Vuelve a acercarte al sistema para observar cuerpos y órbitas.', 5600);
    }
  }
  updateControlsHint();
}

startBtn.addEventListener('click', startExplorationFromMenu);
startSolarBtn?.addEventListener('click', startSolarFromMenu);
openMenuSettingsBtn?.addEventListener('click', () => menuSettings?.classList.toggle('hidden'));
closeMenuSettingsBtn?.addEventListener('click', () => menuSettings?.classList.add('hidden'));
document.addEventListener('click', e => {
  if (e.target.closest('#modeSolar')) setGameplayMode('solar');
  if (e.target.closest('#modeFree')) setGameplayMode('free');
});
canvas.addEventListener('click', () => {
  if (player.mode === 'flight' && !paused) input.lock();
});

// ---------- Menú de ajustes (ESC): pausa + sonido + modo + gráficos ----------
const settingsMenu = document.getElementById('settingsMenu');
let paused = false;
function openSettings() {
  paused = true;
  settingsMenu.classList.remove('hidden');
  surfaceGameplay.stopMining();   // corta el láser (y su sonido) al pausar
  input.unlock();   // mostrar cursor para interactuar
}
function closeSettings() {
  paused = false;
  settingsMenu.classList.add('hidden');
  if (boot.classList.contains('hidden') && player.mode === 'flight') input.lock();
}
function toggleSettings() {
  if (settingsMenu.classList.contains('hidden')) openSettings(); else closeSettings();
}
document.getElementById('settingsClose').addEventListener('click', closeSettings);
settingsMenu.addEventListener('mousedown', e => { if (e.target === settingsMenu) closeSettings(); });

// Sonido
const setVolume = document.getElementById('setVolume');
const setVolumeVal = document.getElementById('setVolumeVal');
setVolume.addEventListener('input', () => {
  setVolumeVal.textContent = setVolume.value;
  if (menuVolume && menuVolume !== document.activeElement) menuVolume.value = setVolume.value;
  if (menuVolumeVal) menuVolumeVal.textContent = setVolume.value;
  shipAudio.setMasterVolume(Number(setVolume.value) / 100);
});
menuVolume?.addEventListener('input', () => {
  setVolume.value = menuVolume.value;
  setVolumeVal.textContent = menuVolume.value;
  if (menuVolumeVal) menuVolumeVal.textContent = menuVolume.value;
  shipAudio.setMasterVolume(Number(menuVolume.value) / 100);
});
// Radio de a bordo: rock de los 90 (emisoras reales via radio-browser.info)
radio.onStationChange = label => { if (radioStation) radioStation.textContent = label; };
radio.onPlayStateChange = playing => {
  if (radioToggle) radioToggle.textContent = playing ? '❚❚' : '▶';
  shipRadio?.classList.toggle('is-playing', playing);
};
radioToggle?.addEventListener('click', () => radio.toggle());
radioNext?.addEventListener('click', () => radio.next());
radioVolume?.addEventListener('input', () => radio.setVolume(Number(radioVolume.value) / 100));
radio.setVolume(Number(radioVolume?.value ?? 45) / 100);

document.getElementById('setVoice').addEventListener('change', e => {
  narrator.enabled = e.target.checked;
  if (!narrator.enabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
});

// Gráficos
const setBloom = document.getElementById('setBloom');
const setBloomVal = document.getElementById('setBloomVal');
setBloom.addEventListener('input', () => {
  const s = Number(setBloom.value) / 100;
  setBloomVal.textContent = s.toFixed(2);
  if (menuBloom && menuBloom !== document.activeElement) menuBloom.value = setBloom.value;
  if (menuBloomVal) menuBloomVal.textContent = s.toFixed(2);
  engine.bloom.strength = s;
});
menuBloom?.addEventListener('input', () => {
  const s = Number(menuBloom.value) / 100;
  setBloom.value = menuBloom.value;
  setBloomVal.textContent = s.toFixed(2);
  if (menuBloomVal) menuBloomVal.textContent = s.toFixed(2);
  engine.bloom.strength = s;
});
const GFX = {
  // En "Rendimiento" el bloom se APAGA del todo (bloomOn:false): el
  // UnrealBloomPass hace varias pasadas de desenfoque a pantalla completa y
  // es el mayor coste de GPU del juego — apagarlo es la diferencia entre
  // "va fatal" y "va fluido" en gráficas integradas (portátiles Windows).
  gfxLow:   { pr: 1.0, bloom: 0.35, bloomOn: false, shadows: false, maxLevel: 3 },
  gfxMed:   { pr: 1.5, bloom: 0.62, bloomOn: true,  shadows: true,  maxLevel: 4 },
  gfxHigh:  { pr: 2.0, bloom: 0.85, bloomOn: true,  shadows: true,  maxLevel: 5 },
  gfxUltra: { pr: 2.5, bloom: 1.0,  bloomOn: true,  shadows: true,  maxLevel: 6 }
};
function applyGraphics(preset) {
  const cfg = GFX[preset]; if (!cfg) return;
  Object.keys(GFX).forEach(id => document.getElementById(id).classList.toggle('active', id === preset));
  document.querySelectorAll('[data-menu-gfx]').forEach(btn => btn.classList.toggle('active', btn.dataset.menuGfx === preset));
  engine.renderer.setPixelRatio(Math.min(devicePixelRatio, cfg.pr));
  engine.composer.setSize(innerWidth, innerHeight);
  engine.renderer.shadowMap.enabled = cfg.shadows;
  engine.bloom.enabled = cfg.bloomOn;
  engine.bloom.strength = cfg.bloom;
  setBloom.value = Math.round(cfg.bloom * 100);
  setBloomVal.textContent = cfg.bloom.toFixed(2);
  if (menuBloom) menuBloom.value = setBloom.value;
  if (menuBloomVal) menuBloomVal.textContent = cfg.bloom.toFixed(2);
  freeExploration.setMaxLevel?.(cfg.maxLevel);
  savePerf({ gfx: preset });
}
Object.keys(GFX).forEach(id => document.getElementById(id).addEventListener('click', () => applyGraphics(id)));
document.querySelectorAll('[data-menu-gfx]').forEach(btn => {
  btn.addEventListener('click', () => applyGraphics(btn.dataset.menuGfx));
});
shipAudio.setMasterVolume(Number(setVolume.value) / 100);
if (menuVolume) menuVolume.value = setVolume.value;
if (menuVolumeVal) menuVolumeVal.textContent = setVolume.value;

// GPU integrada detectada y sin preferencia guardada → arrancar en
// "Rendimiento". Es el caso típico del portátil Windows que va a tirones
// con el preset Equilibrado pensado para GPUs dedicadas o Apple Silicon.
function detectWeakGpu() {
  try {
    const gl = engine.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /intel(?!.*arc)|uhd graphics|iris|hd graphics|swiftshader|llvmpipe|mali|adreno/i.test(r);
  } catch { return false; }
}
const weakGpu = detectWeakGpu();
applyGraphics(GFX[perfSaved.gfx] ? perfSaved.gfx : (weakGpu ? 'gfxLow' : 'gfxMed'));

// ---- FPS objetivo (limitador) + detección de Hz nativos del monitor ----
const fpsOptionsEl = document.getElementById('fpsOptions');
const fpsStatusEl = document.getElementById('fpsStatus');
let currentFpsChoice = typeof perfSaved.fps === 'number' ? perfSaved.fps : null;
function applyFps(fps) {
  currentFpsChoice = Math.max(0, Number(fps) || 0);
  engine.setTargetFps(currentFpsChoice);
  savePerf({ fps: currentFpsChoice });
  if (fpsOptionsEl) [...fpsOptionsEl.children].forEach(b =>
    b.classList.toggle('active', Number(b.dataset.fps) === currentFpsChoice));
  updateFpsStatus();
}
function getNativeAlignedFpsOptions(hz) {
  const nativeHz = Math.max(24, Math.round(hz || 60));
  const options = new Set([30, 60, 120, 144, 165, 240]);
  if (nativeHz >= 50) {
    options.add(nativeHz);
    for (const div of [2, 3, 4]) {
      const fps = Math.round(nativeHz / div);
      if (fps >= 24) options.add(fps);
    }
  }
  return [...options].sort((a, b) => a - b);
}
function getDefaultFps(hz) {
  const nativeHz = Math.max(24, Math.round(hz || 60));
  if (weakGpu) return nativeHz <= 75 ? 30 : Math.round(nativeHz / 2);
  return Math.min(60, nativeHz);
}
function updateFpsStatus() {
  if (!fpsStatusEl) return;
  const cap = engine.targetFps > 0 ? `${engine.targetFps} FPS` : `${engine.detectedHz} Hz nativo`;
  fpsStatusEl.textContent = `Pantalla ${engine.detectedHz} Hz · objetivo ${cap} · real ${Math.round(engine.fps)} FPS`;
}
function buildFpsOptions(hz) {
  if (!fpsOptionsEl) return;
  fpsOptionsEl.innerHTML = '';
  const nativeHz = Math.max(24, Math.round(hz || 60));
  const caps = getNativeAlignedFpsOptions(nativeHz);
  for (const f of caps) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.fps = f;
    b.textContent = f === nativeHz ? `${f} FPS / Hz` : `${f} FPS`;
    b.addEventListener('click', () => applyFps(f));
    fpsOptionsEl.appendChild(b);
  }
  const native = document.createElement('button');
  native.type = 'button';
  native.dataset.fps = 0;
  native.textContent = `Nativo (${nativeHz} Hz)`;
  native.addEventListener('click', () => applyFps(0));
  fpsOptionsEl.appendChild(native);

  applyFps(currentFpsChoice !== null ? currentFpsChoice : getDefaultFps(nativeHz));
}
// Cap conservador desde el primer frame; al medir los Hz reales se reconstruyen
// opciones comunes hasta 240 FPS, más divisores alineados al monitor
// (mitad/tercio/cuarto/nativo) para evitar saltos irregulares.
engine.setTargetFps(currentFpsChoice !== null ? currentFpsChoice : (weakGpu ? 30 : 60));
let fpsStatusTimer = 0;
engine.addUpdater(dt => {
  fpsStatusTimer += dt;
  if (fpsStatusTimer >= 0.5) {
    fpsStatusTimer = 0;
    updateFpsStatus();
  }
});
engine.detectRefreshRate().then(hz => buildFpsOptions(hz));

document.getElementById('observePlanet').addEventListener('click', () => observe('planet'));
document.getElementById('observeComet').addEventListener('click', () => observe('comet'));
exitObservation.addEventListener('click', exitObserveMode);

function setFlightView(first) {
  player.firstPerson = first;
  cockpit.setFlightView(first ? 'first' : 'third');
  updateControlsHint();
}
function toggleFlightView() {
  if (player.mode === 'flight') setFlightView(!player.firstPerson);
  else if (player.mode === 'onfoot') {
    player.firstPerson = true;
    cockpit.applyFootView();
    updateControlsHint();
  }
}

// Interacción deliberada (tecla F / Triángulo, estilo NMS): aterrizar la nave
// volando bajo dentro de la atmósfera, o volver a abordarla estando a pie
// junto a donde quedó aparcada. Ya no hay aterrizaje automático.
function tryInteract() {
  if (player.canBoard()) {
    cockpit.hideLandedMarker();
    player.board();
  } else if (player.canLand()) {
    player.land();
  }
}

player.onLand = () => {
  cockpit.showLandedMarker(player.parkedShip.position, player.parkedShip.quaternion);
  cockpit.startOnFoot();
  player.firstPerson = true;
  cockpit.applyFootView();
  input.lock();
  speedo.classList.add('hidden');
  speedControl.classList.add('hidden');
  shipRadio?.classList.add('hidden');
  suitHud.setVisible(true);
  footReticle.classList.remove('hidden');
  if (missionTitle) missionTitle.textContent = 'A PIE / EXPLORACIÓN SUPERFICIE';
  updateControlsHint();
  narrator.say('Aterrizaje completado. Traje presurizado: mina con E, escanea con C, recarga el traje con R y usa el arsenal (1-9) para cazar la fauna.', 8000);
};

player.onBoard = () => {
  cockpit.startFlight();
  // El foco atmosférico se mantiene: seguimos dentro de la atmósfera y la
  // superficie viva solo se libera al salir de ella (ver FreeExploration).
  surfaceGameplay.stopMining();
  surfaceGameplay.clearMarkers();
  speedo.classList.remove('hidden');
  speedControl.classList.remove('hidden');
  shipRadio?.classList.remove('hidden');
  suitHud.setVisible(false);
  footReticle.classList.add('hidden');
  suitHud.invPanel.classList.add('hidden');
  if (missionTitle) missionTitle.textContent = 'ORION-07 / EXPLORACIÓN';
  updateControlsHint();
  narrator.say('Propulsores de despegue activados. Acelera para ganar altura.', 4600);
};

// Rueda del ratón: zoom en observación.
input.onWheel = (deltaY) => {
  if (player.mode === 'observe') player.zoomObservation(deltaY > 0 ? 1.08 : 0.93);
};

input.onKeyDown = (code) => {
  // P abre/cierra el menú de pausa (salvo si se escribe en un campo)
  if (code === 'KeyP') {
    const el = document.activeElement;
    const typing = el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
    if (!typing) { toggleSettings(); return; }
  }
  if (paused) return;
  if (code === 'KeyC' && gameplayMode === 'solar') panel.classList.toggle('hidden');
  if (code === 'KeyV') toggleFlightView();
  if (code === 'KeyF' && gameplayMode === 'free') tryInteract();
  if (code === 'KeyC' && gameplayMode === 'free' && player.mode === 'onfoot') surfaceGameplay.scan();
  if (gameplayMode === 'free' && player.mode === 'onfoot') {
    if (/^Digit[1-9]$/.test(code)) { weaponSystem.select(Number(code.slice(5)) - 1); return; }
    if (code === 'KeyX') { weaponSystem.reload(); return; }
    if (code === 'KeyB') { weaponSystem.toggleHudCollapsed(); return; }
    if (code === 'KeyQ') { weaponSystem.next(-1); return; }
    if (code === 'KeyE' && input.keys.AltLeft) { weaponSystem.next(1); return; }
  }
  if (code === 'KeyR' && gameplayMode === 'free') doSuitRecharge();
  if (code === 'KeyI' && gameplayMode === 'free' && (player.mode === 'onfoot' || player.mode === 'flight')) suitHud.toggleInventory();
  if (code === 'KeyL' && gameplayMode === 'free') {
    const active = player.toggleLightSpeed();
    narrator.say(
      active
        ? 'Interruptor de velocidad luz activado. Mantén W para acelerar hacia c; el tiempo a bordo empezará a dilatarse.'
        : 'Interruptor de velocidad luz desactivado. Volviendo a velocidad normal.',
      active ? 6500 : 4000
    );
  }
  if (code === 'Equal' || code === 'NumpadAdd') setMaxSpeed(Number(maxSpeed.value) + 10);
  if (code === 'Minus' || code === 'NumpadSubtract') setMaxSpeed(Number(maxSpeed.value) - 10);
  const canSelect = !studyMenu.classList.contains('hidden') || player.mode === 'observe';
  if (code === 'Digit1' && canSelect) observe('planet');
  if (code === 'Digit2' && canSelect) observe('comet');
  if (player.mode === 'observe') {
    if (code === 'ArrowLeft') cycleBody(-1);
    if (code === 'ArrowRight') cycleBody(1);
    if (code === 'KeyH') setObservationHudCollapsed(!document.body.classList.contains('is-hud-collapsed'));
    if (code === 'KeyM') map2d.toggle();
  }
};

document.getElementById('closePanel').addEventListener('click', () => panel.classList.add('hidden'));
document.getElementById('applyOrbit').addEventListener('click', () => {
  const type = document.getElementById('bodyType').value;
  // Mantiene la apariencia (textura) del cuerpo actual al re-aplicar condiciones.
  const cur = BODY_PRESETS[currentBodyIndex];
  const look = type === cur.type ? (cur.look || {}) : {};
  solar.makeSimBody(
    type,
    Number(document.getElementById('posX').value),
    Number(document.getElementById('posY').value),
    Number(document.getElementById('posZ').value),
    Number(document.getElementById('velX').value),
    Number(document.getElementById('velY').value),
    Number(document.getElementById('velZ').value),
    look
  );
  if (player.mode === 'observe') {
    const camDist = type === 'comet' ? 12 : (look.radius || 0.9) * 4 + 2.5;
    player.startObservation(() => solar.getSimBodyWorldPosition(), cur.label, camDist);
  }
  narrator.say('Condiciones iniciales actualizadas. Observa cómo cambia la trayectoria.', 5200);
});

function syncShipTuning() {
  player.setEngineTuning(Number(thrustPower.value) / 100, Number(maxSpeed.value));
}

function setSpeedLimitForMode(mode, value = null) {
  const cap = MODE_SPEED_LIMITS[mode] || MODE_SPEED_LIMITS.solar;
  speedSlider.max = String(cap);
  maxSpeed.max = String(cap);
  setMaxSpeed(value ?? Math.min(Number(speedSlider.value) || cap, cap));
}

// Fuente única de verdad para la velocidad máxima; refleja en ambos controles.
function setMaxSpeed(v) {
  const cap = MODE_SPEED_LIMITS[gameplayMode] || MODE_SPEED_LIMITS.solar;
  const val = Math.max(3, Math.min(cap, Math.round(Number(v) || cap)));
  maxSpeed.value = val;
  speedSlider.value = val;
  speedValue.textContent = val;
  syncShipTuning();
}

thrustPower.addEventListener('input', syncShipTuning);
maxSpeed.addEventListener('input', () => setMaxSpeed(maxSpeed.value));
speedSlider.addEventListener('input', () => setMaxSpeed(speedSlider.value));
document.getElementById('speedUp').addEventListener('click', () => setMaxSpeed(Number(speedSlider.value) + 10));
document.getElementById('speedDown').addEventListener('click', () => setMaxSpeed(Number(speedSlider.value) - 10));
setSpeedLimitForMode('solar', MODE_SPEED_LIMITS.solar);

// ---- Velocidad del sistema solar (modo observación) ----
const systemSpeed = document.getElementById('systemSpeed');
const sysSpeedSlider = document.getElementById('sysSpeedSlider');
const sysSpeedValue = document.getElementById('sysSpeedValue');
function setSystemSpeed(v) {
  const val = Math.max(0.1, Math.min(5, Number(v) || 1));
  solar.setTimeScale(val);
  sysSpeedSlider.value = val;
  sysSpeedValue.textContent = `${val.toFixed(1)}×`;
}
sysSpeedSlider.addEventListener('input', () => setSystemSpeed(sysSpeedSlider.value));
document.getElementById('sysSpeedDown').addEventListener('click', () => setSystemSpeed(Number(sysSpeedSlider.value) - 0.2));
document.getElementById('sysSpeedUp').addEventListener('click', () => setSystemSpeed(Number(sysSpeedSlider.value) + 0.2));
setSystemSpeed(0.2);

// ---- Selector de cuerpos (modo observación) ----
BODY_PRESETS.forEach(b => {
  const btn = document.createElement('button');
  btn.textContent = b.label;
  btn.dataset.label = b.label;
  btn.addEventListener('click', () => selectBodyByLabel(b.label));
  bodyOptions.appendChild(btn);
});
document.getElementById('bodyPrev').addEventListener('click', () => cycleBody(-1));
document.getElementById('bodyNext').addEventListener('click', () => cycleBody(1));

// ---- Mando PS4 / compatible ----
let padConnected = false;
const gamepad = new GamepadController(input, {
  speedUp: () => setMaxSpeed(Number(speedSlider.value) + 10),
  speedDown: () => setMaxSpeed(Number(speedSlider.value) - 10),
  togglePause: () => toggleSettings(),
  togglePanel: () => { if (gameplayMode === 'solar') panel.classList.toggle('hidden'); },
  toggleView: () => toggleFlightView(),
  cycleBody: (d) => cycleBody(d),
  zoom: (f) => { if (player.mode === 'observe') player.zoomObservation(f); },
  exitObserve: () => { if (player.mode === 'observe') exitObserveMode(); },
  interact: () => tryInteract(),
  scan: () => { if (gameplayMode === 'free' && player.mode === 'onfoot') surfaceGameplay.scan(); },
  recharge: () => doSuitRecharge(),
  toggleMap: () => { if (player.mode === 'observe') map2d.toggle(); },
  onConnect: (name) => {
    padConnected = true;
    padToast.textContent = `🎮 ${name} conectado`;
    padToast.classList.remove('hidden');
    clearTimeout(window.__padToastT);
    window.__padToastT = setTimeout(() => padToast.classList.add('hidden'), 3600);
    updateControlsHint();
  },
  onDisconnect: () => { padConnected = false; updateControlsHint(); }
});

// ---- Leyenda de botones (siempre visible) ----
const HINTS = {
  flight: [
    ['L-Stick / ←→↑↓', 'Girar'], ['R2 / ✕', 'Acelerar'], ['L2 / ◯', 'Frenar'],
    ['L1 R1', 'Lateral'], ['△ / ▢', 'Subir / Bajar'], ['L3', 'Impulso'],
    ['M / R3', 'Turbo x5'], ['D-Pad ↑↓', 'Velocidad'], ['V / D-Pad ▶', '1ª / 3ª persona'], ['Options', 'Panel']
  ],
  free: [
    ['L-Stick / ←→↑↓', 'Girar'], ['R2 / ✕', 'Acelerar'], ['L2 / ◯', 'Frenar'],
    ['L1 R1', 'Lateral'], ['△ / ▢', 'Subir / Bajar'], ['M / R3', 'Turbo x5'],
    ['F', 'Aterrizar (bajo)'], ['I', 'Inventario'], ['V', '1ª / 3ª persona'], ['L', 'Velocidad luz']
  ],
  onfoot: [
    ['L-Stick / WASD', 'Caminar'], ['R-Stick / ←→↑↓', 'Mirar'], ['L1 / Shift', 'Correr'],
    ['✕ / Espacio', 'Saltar · mantener: propulsor'], ['E / R2', 'Minar'], ['C / L2', 'Escáner'],
    ['Click', 'Disparar'], ['1-9', 'Armas'], ['X', 'Recargar arma'], ['B', 'Ocultar arsenal'], ['R / ◯', 'Recargar traje'],
    ['I', 'Inventario'], ['△ / F', 'Volver a la nave']
  ],
  observe: [
    ['D-Pad ◀ ▶', 'Cambiar cuerpo'], ['Rueda / L2 R2', 'Zoom'], ['◯', 'Salir'], ['C', 'Condiciones'],
    ['M / R3', 'Mapa 2D'], ['H', 'Ocultar HUD']
  ]
};
function updateControlsHint() {
  const mode = player.mode === 'observe' ? 'observe' : player.mode === 'onfoot' ? 'onfoot' : gameplayMode === 'free' ? 'free' : 'flight';
  const rows = HINTS[mode];
  const head = padConnected ? '' : '<span class="hint__kb">Mando o teclado</span>';
  controlsHint.innerHTML = head + rows.map(
    ([b, a]) => `<span class="hint"><b>${b}</b> ${a}</span>`
  ).join('');
}
let hintMode = '';

const hud = new HUD(player, solar, freeExploration);

async function bootGame() {
  try {
    await cockpit.loadAll(player.rig, engine.camera);
    bootStatus.textContent = 'Motores, cabina y modelos listos.';
    startBtn.textContent = 'EXPLORAR';
    setMainMenuReady(true, 'Listo para explorar.');
    if (studioFinished) revealMainMenu();
  } catch (err) {
    console.error(err);
    bootStatus.textContent = 'No se pudo cargar un GLB. Puedes iniciar con el entorno base.';
    startBtn.textContent = 'EXPLORAR';
    setMainMenuReady(true, 'Modelos incompletos; el entorno base está disponible.');
    if (studioFinished) revealMainMenu();
  }
}

engine.addUpdater(dt => {
  gamepad.update(dt, player.mode);   // se sondea siempre (incl. en pausa, para reanudar con Select)
  if (paused) return;                // menú de ajustes abierto → simulación congelada
  if (player.mode !== hintMode) {
    hintMode = player.mode;
    updateControlsHint();
    const showHint = player.mode === 'flight' || player.mode === 'observe' || player.mode === 'onfoot';
    controlsHint.classList.toggle('hidden', !showHint);
  }
  player.setTurbo(input.keys.KeyM);
  player.update(dt);
  weaponSystem.update(dt, gameplayMode === 'free' && player.mode === 'onfoot');
  // Efecto visual de velocidad luz: estelas radiales + viraje de color, suavizado
  // para que no salte de golpe al acelerar/frenar.
  const targetWarp = gameplayMode === 'free' ? player.lightSpeedBeta : 0;
  const warpUniform = engine.warpPass.uniforms.uWarp;
  warpUniform.value += (targetWarp - warpUniform.value) * Math.min(1, dt * 3);
  // Con el warp en reposo la pasada entera se salta (ahorra un blit a
  // pantalla completa por frame, que en una GPU integrada no es gratis).
  engine.warpPass.enabled = warpUniform.value > 0.002;
  if (gameplayMode === 'free' && player.canBoard()) {
    interactPrompt.innerHTML = 'Presiona <b>F</b> para volver a la nave';
    interactPrompt.classList.remove('hidden');
  } else if (gameplayMode === 'free' && player.canLand()) {
    interactPrompt.innerHTML = 'Presiona <b>F</b> para aterrizar';
    interactPrompt.classList.remove('hidden');
  } else {
    interactPrompt.classList.add('hidden');
  }

  // ---- Bucle NMS: minería, exotraje, viñeta de entrada atmosférica ----
  if (gameplayMode === 'free') {
    const miningHeld = player.mode === 'onfoot' && (input.keys.KeyE || (input.thrustFwd || 0) > 0.3);
    surfaceGameplay.update(dt, miningHeld);
    exosuit.update(dt, {
      onFoot: player.mode === 'onfoot',
      inShip: player.mode === 'flight',
      running: player.mode === 'onfoot' && player.speed > 3.4,
      jetpacking: player.jetpacking,
      grounded: player.footGrounded,
      hazardLevel: player.mode === 'onfoot' ? player.hazardLevel : 0,
      hazardKind: player.hazardKind
    });
    suitHud.update();
    entryVignette.style.opacity = player.mode === 'flight' ? (player.entryHeat * 0.85).toFixed(2) : '0';
  } else {
    entryVignette.style.opacity = '0';
  }
  shipEventCooldown = Math.max(0, shipEventCooldown - dt);
  if (gameplayMode === 'free' && player.statusEvent && player.statusEvent !== lastShipEvent && shipEventCooldown <= 0) {
    lastShipEvent = player.statusEvent;
    shipEventCooldown = 6;
    narrator.say(player.statusEvent, 5200);
  }
  updateIntroSequence();
  engine.camera.getWorldPosition(_camWorld);
  sky.position.copy(_camWorld);   // el cielo sigue a la cámara (skybox)
  spaceEnv.stars.userData.uniforms.uTime.value += dt;
  // Transición atmosférica: el cielo profundo se funde según el descenso.
  spaceEnv.setFade(gameplayMode === 'free' ? freeExploration.skyFade : 0);
  spaceEnv.update(dt);
  cockpit.update(dt, player);
  if (gameplayMode === 'solar') solar.update(dt);
  if (gameplayMode === 'solar') map2d.update(dt, solar.timeScale);
  hud.update(dt);
  if (gameplayMode === 'solar') physics.update(dt);
  if (gameplayMode === 'solar') lesson.update(dt);
  shipAudio.update(dt);
  if (gameplayMode === 'solar') {
    beginApproachIfClose();
    if (player.approachFinished) onCinematicEnd();
  }

  if (gameplayMode === 'solar' && player.mode === 'observe' && !lesson.active) {
    lastNarration += dt;
    if (lastNarration > 22) {
      lastNarration = 0;
      narrator.say('La trayectoria está determinada por la posición, la velocidad y la fuerza gravitatoria del Sol.', 6500);
    }
  } else {
    lastNarration = 0;
  }
});

// Los sistemas procedurales de Exploración quedan montados en el bucle de render
// del motor (requestAnimationFrame). Se ejecuta tras los updaters (player ya
// actualizado) y solo trabaja cuando Exploración está activa.
engine.mountWorldSystem({
  update: (dt) => {
    if (paused) return;
    if (gameplayMode === 'free') freeExploration.update(dt, player);
  }
});

engine.start();
bootGame();

// Hook de depuración (consola): window.orion.player, .freeExploration, etc.
window.orion = { engine, player, freeExploration, inventory, exosuit, surfaceGameplay, suitHud, cockpit, weaponSystem };
