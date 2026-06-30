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
  }
  update(dt) {
    this.t += dt;
    const speed = this.player.speedMetersPerSecond ?? this.player.speed * 8;
    this.speed.textContent = this.player.mode === 'observe' ? 'TRAYECTORIA' : `${speed.toFixed(1)} m/s`;
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
  }
}

function formatMeters(value) {
  const meters = Number(value) || 0;
  if (Math.abs(meters) >= 1000000) return `${(meters / 1000000).toFixed(2)} Mm`;
  if (Math.abs(meters) >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters.toFixed(0)} m`;
}
