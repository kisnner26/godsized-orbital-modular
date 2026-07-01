export class HUD {
  constructor(player, solar, planet = null) {
    this.player = player;
    this.solar = solar;
    this.planet = planet;
    this.t = 0;
    this.speed = document.getElementById('speedReadout');
    this.altitude = document.getElementById('altitudeReadout');
    this.biome = document.getElementById('biomeReadout');
    this.o2 = document.getElementById('o2Readout');
    this.clock = document.getElementById('missionClock');
    this.body = document.getElementById('bodyReadout');
    this.speedoNeedle = document.getElementById('speedoNeedle');
    this.speedoValue = document.getElementById('speedoValue');
    this.speedoTurbo = document.getElementById('speedoTurbo');
    this.lightspeedHud = document.getElementById('lightspeedHud');
    this.lsState = document.getElementById('lsState');
    this.lsBeta = document.getElementById('lsBeta');
    this.lsGamma = document.getElementById('lsGamma');
    this.lsProper = document.getElementById('lsProper');
    this.lsCoord = document.getElementById('lsCoord');
  }
  update(dt) {
    this.t += dt;
    const speed = this.player.speedMetersPerSecond ?? this.player.speed * 8;
    this.speed.textContent = this.player.mode === 'observe' ? 'TRAYECTORIA' : `${speed.toFixed(1)} m/s`;
    this.updateSpeedo(speed);
    const hasTerrain = !!this.player.terrainProvider;
    if (this.altitude) this.altitude.textContent = hasTerrain ? formatMeters(this.player.altitudeMeters ?? this.planet?.telemetry?.altitudeMeters ?? 0) : '-- m';
    if (this.biome) this.biome.textContent = hasTerrain ? (this.player.biome || this.planet?.telemetry?.biome || 'ESPACIO') : 'SISTEMA';
    const engineState = this.player.mode === 'observe'
      ? 'ESC PARA SALIR'
      : this.player.mode === 'approach'
        ? 'AUTOPILOTO'
        : (this.player.flightStatus || 'ACTIVOS');
    this.o2.textContent = engineState;
    const s = Math.floor(this.t);
    this.clock.textContent = `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
    if (this.player.gameplayMode === 'free') {
      const tel = this.planet?.telemetry;
      this.body.textContent = tel?.world ? `${tel.world} / ${tel.system}` : 'EXPLORACION';
    }
    else if (this.player.mode === 'observe') this.body.textContent = this.player.observation?.label || 'CUERPO';
    else if (this.player.mode === 'approach') this.body.textContent = 'SISTEMA SOLAR';
    else this.body.textContent = 'VUELO LIBRE';
    this.updateLightspeed();
  }

  // Panel de dilatación temporal: solo se muestra con el interruptor de
  // velocidad luz activo (Exploración), para no saturar el HUD el resto del
  // tiempo.
  updateLightspeed() {
    if (!this.lightspeedHud) return;
    const p = this.player;
    const show = p.gameplayMode === 'free' && p.lightSpeedActive;
    this.lightspeedHud.classList.toggle('hidden', !show);
    if (!show) return;
    if (this.lsState) this.lsState.textContent = 'ACTIVA';
    if (this.lsBeta) this.lsBeta.textContent = (p.lightSpeedBeta ?? 0).toFixed(3) + ' c';
    if (this.lsGamma) this.lsGamma.textContent = (p.lightSpeedGamma ?? 1).toFixed(3);
    if (this.lsProper) this.lsProper.textContent = formatClock(p.properTime || 0);
    if (this.lsCoord) this.lsCoord.textContent = formatClock(p.coordinateTime || 0);
  }

  // Aguja del velocímetro: 0% = -135°, 100% = +135° (barrido de 270°). La
  // velocidad de crucero real depende del empuje configurado (no del tope
  // `maxSpeed`, que casi nunca se alcanza — ver Player.updateFlight), así que
  // una escala fija dejaba la aguja casi plana en vuelo normal. En vez de eso
  // la escala se auto-calibra al máximo reciente: crece al instante si se
  // supera, y se relaja despacio, así la aguja siempre usa bien el dial y
  // "se va a la zona roja" al activar el turbo, sea cual sea el ajuste de
  // empuje del jugador.
  updateSpeedo(speedMS) {
    if (!this.speedoNeedle) return;
    const raw = this.player.speed || 0;
    const prevRef = this.speedoRef || 10;
    this.speedoRef = Math.max(10, raw * 1.15, prevRef * 0.994);
    const frac = Math.max(0, Math.min(1, raw / this.speedoRef));
    const angle = -135 + frac * 270;
    this.speedoNeedle.style.transform = `rotate(${angle}deg)`;
    if (this.speedoValue) this.speedoValue.textContent = this.player.mode === 'observe' ? '—' : speedMS.toFixed(0);
    if (this.speedoTurbo) this.speedoTurbo.classList.toggle('hidden', !this.player.turboActive);
  }
}

function formatClock(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${String(m).padStart(2, '0')}:${rem.toFixed(1).padStart(4, '0')}`;
}

function formatMeters(value) {
  const meters = Number(value) || 0;
  if (Math.abs(meters) >= 1000000) return `${(meters / 1000000).toFixed(2)} Mm`;
  if (Math.abs(meters) >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters.toFixed(0)} m`;
}
