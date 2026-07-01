// Radio de a bordo: emisoras de internet reales (rock de los 90 / clásico)
// obtenidas en vivo de radio-browser.info, un directorio público y gratuito
// de streams Shoutcast/Icecast. No se guarda ninguna URL de stream a mano:
// se consulta la API y se reproduce lo primero que responda y esté online.
const API_HOSTS = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info'
];
const SEARCH_QUERIES = [
  { tag: '90s rock' },
  { tag: 'rock', name: '90s' },
  { tag: 'classic rock' }
];

export class Radio {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'none';
    this.audio.crossOrigin = 'anonymous';
    this.audio.volume = 0.45;
    this.stations = [];
    this.index = -1;
    this.playing = false;
    this.loading = false;
    this.wantPlay = false;
    this.onStationChange = null; // (label: string) => void
    this.onPlayStateChange = null; // (playing: boolean) => void

    this.audio.addEventListener('playing', () => {
      this.playing = true;
      this.onPlayStateChange?.(true);
    });
    this.audio.addEventListener('pause', () => {
      this.playing = false;
      this.onPlayStateChange?.(false);
    });
    this.audio.addEventListener('error', () => {
      if (this.wantPlay) this.next(true);
    });
  }

  // Busca emisoras reales en el directorio (una sola vez): varias consultas
  // en paralelo por servidor espejo, probando el siguiente espejo solo si el
  // primero no da resultados. Prefiere HTTPS porque la página se sirve por
  // HTTPS (GitHub Pages) y un stream http: puede bloquearse como contenido
  // mixto según el navegador.
  async ensureStations() {
    if (this.stations.length || this.loading) return;
    this.loading = true;
    const found = new Map();
    try {
      for (const host of API_HOSTS) {
        const results = await Promise.allSettled(SEARCH_QUERIES.map(q => {
          const params = new URLSearchParams({ limit: '25', order: 'votes', reverse: 'true', hidebroken: 'true', ...q });
          return fetch(`${host}/json/stations/search?${params}`, { signal: AbortSignal.timeout(6000) })
            .then(r => (r.ok ? r.json() : []));
        }));
        for (const r of results) {
          if (r.status !== 'fulfilled') continue;
          for (const s of r.value) {
            if (!s.url_resolved || s.hls === 1 || found.has(s.stationuuid)) continue;
            found.set(s.stationuuid, s);
          }
        }
        if (found.size >= 5) break;
      }
    } catch { /* nos quedamos con lo que haya reunido hasta el corte */ }
    const all = [...found.values()];
    const https = all.filter(s => s.url_resolved.startsWith('https://'));
    const http = all.filter(s => s.url_resolved.startsWith('http://'));
    this.stations = [...https, ...http];
    this.loading = false;
  }

  async play() {
    this.wantPlay = true;
    await this.ensureStations();
    if (!this.stations.length) {
      this.onStationChange?.('Sin señal');
      return;
    }
    if (this.index < 0) { this.index = 0; this._loadCurrent(); }
    try { await this.audio.play(); } catch { /* necesita un gesto del usuario, se reintenta con el próximo click */ }
  }

  pause() {
    this.wantPlay = false;
    this.audio.pause();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  async next(auto = false) {
    this.onStationChange?.('Sintonizando…');
    await this.ensureStations();
    if (!this.stations.length) return;
    this.index = (this.index + 1) % this.stations.length;
    this._loadCurrent();
    if (this.wantPlay || auto) {
      this.wantPlay = true;
      try { await this.audio.play(); } catch { /* ver arriba */ }
    }
  }

  _loadCurrent() {
    const s = this.stations[this.index];
    if (!s) return;
    this.audio.src = s.url_resolved;
    this.onStationChange?.(s.name || 'Emisora desconocida');
    // Registro de escucha (estadística del directorio); si falla no importa.
    fetch(`${API_HOSTS[0]}/json/url/${s.stationuuid}`).catch(() => {});
  }

  setVolume(v) {
    this.audio.volume = Math.max(0, Math.min(1, Number(v) || 0));
  }
}
