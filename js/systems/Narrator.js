export class Narrator {
  constructor() {
    this.box = document.getElementById('subtitle');
    this.text = document.getElementById('subtitleText');
    this.speaker = document.getElementById('subtitleSpeaker');
    this.voices = [];
    this.voice = null;
    this.ready = false;
    this.enabled = true;   // narración por voz (TTS) on/off desde ajustes
    this.audioCtx = null;  // se crea al primer uso (los navegadores exigen un gesto del usuario)
    this.masterGain = null;
    this.ambienceNoise = null;
    this.ambienceGain = null;
    if ('speechSynthesis' in window) {
      const load = () => {
        this.voices = window.speechSynthesis.getVoices();
        this.voice = this.pickSpanishVoice();
        this.ready = true;
      };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
  }

  // Prioriza, en orden: voces neuronales "Online (Natural)" de Edge/Windows
  // (con diferencia las mejores disponibles gratis vía Web Speech API),
  // luego voces "mejoradas/premium" (macOS), luego una lista de voces
  // conocidas de buena calidad, y por último cualquier voz remota (no local),
  // que casi siempre suena mejor que la voz offline por defecto del sistema.
  pickSpanishVoice() {
    const es = this.voices.filter(v => (v.lang || '').toLowerCase().startsWith('es'));
    if (!es.length) return null;

    const natural = es.find(v => /natural|neural/i.test(v.name));
    if (natural) return natural;

    const enhanced = es.find(v => /enhanced|premium|mejorad/i.test(v.name));
    if (enhanced) return enhanced;

    const preferred = [
      'Google español', 'Google español de Estados Unidos',
      'Mónica', 'Monica', 'Paulina', 'Marisol', 'Jorge', 'Juan', 'Diego',
      'Microsoft Sabina', 'Microsoft Helena', 'Microsoft Laura', 'Microsoft Raul',
      'Microsoft Pablo', 'Microsoft Alvaro', 'Microsoft Dalia', 'Microsoft Elvira',
      'Microsoft Yolanda', 'Microsoft Xochitl'
    ];
    for (const name of preferred) {
      const hit = es.find(v => v.name.includes(name));
      if (hit) return hit;
    }
    return es.find(v => !v.localService) || es[0];
  }

  // El audio de speechSynthesis no se puede interceptar ni filtrar (no expone
  // ningún AudioNode/MediaStream): el navegador lo manda directo a la salida.
  // Para lograr el efecto "radio de traje espacial" sin depender de una API de
  // pago, generamos nosotros mismos el ruido de fondo y los clics de
  // transmisión con Web Audio, sonando ALREDEDOR de la voz en vez de
  // filtrarla — el mismo truco de diseño de sonido que usan cine/TV para
  // comunicaciones de radio.
  ensureAudio() {
    if (this.audioCtx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.audioCtx = new AudioContext();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.value = 0.55;
    this.masterGain.connect(this.audioCtx.destination);
    this.buildAmbience();
  }

  makeNoiseBuffer(seconds) {
    const ctx = this.audioCtx;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // Estática de fondo continua y muy tenue, tipo "canal abierto", que sube un
  // poco mientras se habla y vuelve a bajar al terminar la frase.
  buildAmbience() {
    const ctx = this.audioCtx;
    const noise = ctx.createBufferSource();
    noise.buffer = this.makeNoiseBuffer(2);
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2000;
    band.Q.value = 0.55;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    noise.connect(band).connect(gain).connect(this.masterGain);
    noise.start();
    this.ambienceNoise = noise;
    this.ambienceGain = gain;
  }

  // Clic corto tipo botón de transmisión (PTT) de una radio EVA.
  playRadioClick(freq = 1800) {
    const ctx = this.audioCtx;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
    osc.connect(g).connect(this.masterGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }

  // Ráfaga de estática con timbre de altavoz pequeño (pasa-banda estrecho en
  // medios-agudos), igual que al abrir/cerrar un canal de radio real.
  playStaticBurst(duration = 0.3, peak = 0.28) {
    const ctx = this.audioCtx;
    const noise = ctx.createBufferSource();
    noise.buffer = this.makeNoiseBuffer(duration);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1600;
    band.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(peak, ctx.currentTime + 0.025);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    noise.connect(band).connect(g).connect(this.masterGain);
    noise.start();
    noise.stop(ctx.currentTime + duration);
  }

  openChannel() {
    if (!this.audioCtx) return;
    this.playRadioClick(1800);
    this.playStaticBurst(0.22, 0.3);
    const ctx = this.audioCtx;
    this.ambienceGain.gain.cancelScheduledValues(ctx.currentTime);
    this.ambienceGain.gain.setValueAtTime(this.ambienceGain.gain.value, ctx.currentTime);
    this.ambienceGain.gain.linearRampToValueAtTime(0.045, ctx.currentTime + 0.12);
  }

  closeChannel() {
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    this.ambienceGain.gain.cancelScheduledValues(ctx.currentTime);
    this.ambienceGain.gain.setValueAtTime(this.ambienceGain.gain.value, ctx.currentTime);
    this.ambienceGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
    this.playStaticBurst(0.16, 0.22);
    this.playRadioClick(1200);
  }

  say(spanishLine, duration = 5200) {
    if (this.box && this.text) {
      this.speaker.textContent = 'ASTRONAUTA';
      this.text.textContent = spanishLine;
      this.box.classList.remove('hidden');
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => this.box.classList.add('hidden'), duration);
    }

    if (!this.enabled || !('speechSynthesis' in window)) return;
    try {
      this.ensureAudio();
      this.openChannel();
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(spanishLine);
      const v = this.voice || this.pickSpanishVoice();
      if (v) { u.voice = v; u.lang = v.lang; }
      else u.lang = 'es-ES';
      // Cadencia medida y algo más grave, como una comunicación de misión.
      u.rate = 0.97;
      u.pitch = 0.9;
      u.volume = 1.0;
      clearTimeout(this._closeTimer);
      const close = () => { u.onend = null; u.onerror = null; this.closeChannel(); };
      u.onend = close;
      u.onerror = close;
      // Respaldo por si el navegador no llega a disparar onend/onerror.
      this._closeTimer = setTimeout(close, duration + 500);
      window.speechSynthesis.speak(u);
    } catch (err) {
      console.warn('Narrator unavailable:', err);
    }
  }
}
