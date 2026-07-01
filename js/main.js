import * as THREE from 'three';
import { Engine } from './core/Engine.js?v=world';
import { Input } from './systems/Input.js?v=noMouse';
import { GamepadController } from './systems/Gamepad.js?v=turbo';
import { ModelLoader } from './systems/ModelLoader.js';
import { Narrator } from './systems/Narrator.js?v=esc';
import { ShipAudio } from './systems/ShipAudio.js?v=esc';
import { Player } from './world/Player.js?v=turbo';
import { Cockpit } from './world/Cockpit.js?v=turbo';
import { SolarSystem } from './world/SolarSystem.js?v=scenarios2';
import { FreeExploration } from './world/FreeExploration.js?v=exploration2';
import { buildSpaceEnvironment } from './world/SpaceEnvironment.js';
import { HUD } from './ui/HUD.js';
import { PhysicsOverlay } from './ui/PhysicsOverlay.js?v=fp2';

const canvas = document.getElementById('game');
const boot = document.getElementById('boot');
const bootStatus = document.getElementById('bootStatus');
const startBtn = document.getElementById('startSimulation');
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
const bodySwitcher = document.getElementById('bodySwitcher');
const bodyName = document.getElementById('bodyName');
const bodyOptions = document.getElementById('bodyOptions');
const controlsHint = document.getElementById('controlsHint');
const padToast = document.getElementById('padToast');
const cinematic = document.getElementById('cinematic');
let modeSolar = document.getElementById('modeSolar');
let modeFree = document.getElementById('modeFree');
let modeStatus = document.getElementById('modeStatus');

const engine = new Engine(canvas);
const input = new Input(canvas);
const player = new Player(engine.camera, input);
const loader = new ModelLoader(bootStatus);
const cockpit = new Cockpit(engine.scene, loader);
const solar = new SolarSystem(engine.scene);
const freeExploration = new FreeExploration(engine.scene, engine.camera);
const narrator = new Narrator();
const shipAudio = new ShipAudio(input, player);
const physics = new PhysicsOverlay(solar);

engine.scene.add(player.rig);
const sky = buildSpaceEnvironment(engine.scene).sky;
solar.build();

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
const MODE_SPEED_LIMITS = { solar: 300, free: 600 };

function refreshGameplayControls() {
  modeSolar = modeSolar || document.getElementById('modeSolar');
  modeFree = modeFree || document.getElementById('modeFree');
  modeStatus = modeStatus || document.getElementById('modeStatus');
}

// Al pulsar INICIAR: arranca la cinemática de abordaje en primera persona.
function startSimulation() {
  if (gameplayMode === 'free') return startFreeSimulation();

  shipAudio.start();
  boot.classList.add('hidden');
  document.body.classList.add('is-flight');

  cockpit.makeIntroShip(INTRO_SHIP_POS);
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
  controlsHint.classList.remove('hidden');
  setSpeedLimitForMode('free', MODE_SPEED_LIMITS.free);
  if (missionTitle) missionTitle.textContent = 'ORION-07 / EXPLORACION';
  updateControlsHint();
  narrator.say('Exploracion activa. El sistema solar usa distancias orbitales proporcionales y hay otros sistemas procedurales. Los rocosos permiten descenso; los gaseosos y las estrellas son letales.', 8500);
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
    line: 'Sistema binario: dos estrellas orbitan su centro común y el planeta siente la gravedad combinada de ambas.' }
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
  solar.makeSimBody(b.type, b.au, 0, 0, 0, b.v, b.vz || 0, b.look || {});
  fillConditions(b);

  studyMenu.classList.add('hidden');
  exitObservation.classList.remove('hidden');
  panel.classList.add('hidden');
  speedControl.classList.add('hidden');
  bodySwitcher.classList.remove('hidden');
  systemSpeed.classList.remove('hidden');
  document.body.classList.add('is-observation');
  input.unlock();
  cockpit.startObservation();
  const camDist = b.type === 'comet' ? 12 : (b.look?.radius || 0.9) * 4 + 2.5;
  player.startObservation(() => solar.getSimBodyWorldPosition(), b.label, camDist);
  physics.show(b.label);
  solar.setVectorsVisible(true);
  updateBodySwitcher();
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
  exitObservation.classList.add('hidden');
  panel.classList.add('hidden');
  bodySwitcher.classList.add('hidden');
  systemSpeed.classList.add('hidden');
  cinematic.classList.add('hidden');
  studyMenu.classList.add('hidden');
  physics.hide();
  solar.setVectorsVisible(false);
  solar.setScenario('solar');
  player.exitObservation();
  cockpit.startFlight();
  document.body.classList.remove('is-observation');
  speedControl.classList.remove('hidden');
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
  if (!startBtn.disabled) startBtn.textContent = mode === 'solar' ? 'INICIAR SIMULACIÓN' : 'INICIAR EXPLORACIÓN';
  document.body.classList.toggle('is-free-mode', mode === 'free');

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
    freeExploration.exit(player);
    solar.group.visible = true;
    if (hasStarted) {
      player.exitObservation();
      cockpit.startFlight();
      input.lock();
      hudEl.classList.remove('hidden');
      speedControl.classList.remove('hidden');
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

startBtn.addEventListener('click', startSimulation);
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
  shipAudio.setMasterVolume(Number(setVolume.value) / 100);
});
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
  engine.bloom.strength = s;
});
const GFX = {
  gfxLow:   { pr: 1.0, bloom: 0.35, shadows: false, maxLevel: 3 },
  gfxMed:   { pr: 1.5, bloom: 0.62, shadows: true,  maxLevel: 4 },
  gfxHigh:  { pr: 2.0, bloom: 0.85, shadows: true,  maxLevel: 5 },
  gfxUltra: { pr: 2.5, bloom: 1.0,  shadows: true,  maxLevel: 6 }
};
function applyGraphics(preset) {
  const cfg = GFX[preset]; if (!cfg) return;
  Object.keys(GFX).forEach(id => document.getElementById(id).classList.toggle('active', id === preset));
  engine.renderer.setPixelRatio(Math.min(devicePixelRatio, cfg.pr));
  engine.composer.setSize(innerWidth, innerHeight);
  engine.renderer.shadowMap.enabled = cfg.shadows;
  engine.bloom.strength = cfg.bloom;
  setBloom.value = Math.round(cfg.bloom * 100);
  setBloomVal.textContent = cfg.bloom.toFixed(2);
  freeExploration.setMaxLevel?.(cfg.maxLevel);
}
Object.keys(GFX).forEach(id => document.getElementById(id).addEventListener('click', () => applyGraphics(id)));
shipAudio.setMasterVolume(Number(setVolume.value) / 100);

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
}

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
  if (code === 'KeyM') player.toggleTurbo();
  if (code === 'Equal' || code === 'NumpadAdd') setMaxSpeed(Number(maxSpeed.value) + 10);
  if (code === 'Minus' || code === 'NumpadSubtract') setMaxSpeed(Number(maxSpeed.value) - 10);
  const canSelect = !studyMenu.classList.contains('hidden') || player.mode === 'observe';
  if (code === 'Digit1' && canSelect) observe('planet');
  if (code === 'Digit2' && canSelect) observe('comet');
  if (player.mode === 'observe') {
    if (code === 'ArrowLeft') cycleBody(-1);
    if (code === 'ArrowRight') cycleBody(1);
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
setSystemSpeed(1);

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
  toggleTurbo: () => player.toggleTurbo(),
  cycleBody: (d) => cycleBody(d),
  zoom: (f) => { if (player.mode === 'observe') player.zoomObservation(f); },
  exitObserve: () => { if (player.mode === 'observe') exitObserveMode(); },
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
    ['M / R3', 'Turbo x3'], ['D-Pad ↑↓', 'Velocidad'], ['V', '1ª / 3ª persona'], ['Options', 'Panel']
  ],
  free: [
    ['L-Stick / ←→↑↓', 'Girar'], ['R2 / ✕', 'Acelerar'], ['L2 / ◯', 'Frenar'],
    ['L1 R1', 'Lateral'], ['△ / ▢', 'Subir / Bajar'], ['L3', 'Impulso'],
    ['M / R3', 'Turbo x3'], ['V', '1ª / 3ª persona']
  ],
  observe: [
    ['D-Pad ◀ ▶', 'Cambiar cuerpo'], ['Rueda / L2 R2', 'Zoom'], ['◯', 'Salir'], ['C', 'Condiciones']
  ]
};
function updateControlsHint() {
  const mode = player.mode === 'observe' ? 'observe' : gameplayMode === 'free' ? 'free' : 'flight';
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
    bootStatus.textContent = 'Cinemática interior lista. Inicia simulación orbital o cambia a Exploración para viajar entre sistemas procedurales.';
    startBtn.disabled = false;
    startBtn.textContent = gameplayMode === 'solar' ? 'INICIAR SIMULACIÓN' : 'INICIAR EXPLORACIÓN';
  } catch (err) {
    console.error(err);
    bootStatus.textContent = 'No se pudo cargar un GLB. Revisa consola. Puedes iniciar con el entorno base.';
    startBtn.disabled = false;
    startBtn.textContent = gameplayMode === 'solar' ? 'INICIAR SIN MODELOS' : 'INICIAR EXPLORACIÓN';
  }
}

engine.addUpdater(dt => {
  gamepad.update(dt, player.mode);   // se sondea siempre (incl. en pausa, para reanudar con Select)
  if (paused) return;                // menú de ajustes abierto → simulación congelada
  if (player.mode !== hintMode) {
    hintMode = player.mode;
    updateControlsHint();
    const showHint = player.mode === 'flight' || player.mode === 'observe';
    controlsHint.classList.toggle('hidden', !showHint);
  }
  player.update(dt);
  shipEventCooldown = Math.max(0, shipEventCooldown - dt);
  if (gameplayMode === 'free' && player.statusEvent && player.statusEvent !== lastShipEvent && shipEventCooldown <= 0) {
    lastShipEvent = player.statusEvent;
    shipEventCooldown = 6;
    narrator.say(player.statusEvent, 5200);
  }
  updateIntroSequence();
  engine.camera.getWorldPosition(_camWorld);
  sky.position.copy(_camWorld);   // el cielo sigue a la cámara (skybox)
  cockpit.update(dt, player);
  if (gameplayMode === 'solar') solar.update(dt);
  hud.update(dt);
  if (gameplayMode === 'solar') physics.update(dt);
  shipAudio.update(dt);
  if (gameplayMode === 'solar') {
    beginApproachIfClose();
    if (player.approachFinished) onCinematicEnd();
  }

  if (gameplayMode === 'solar' && player.mode === 'observe') {
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
  update: (dt) => { if (!paused && gameplayMode === 'free') freeExploration.update(dt, player); }
});

engine.start();
bootGame();
