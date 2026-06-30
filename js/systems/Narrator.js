export class Narrator {
  constructor() {
    this.box = document.getElementById('subtitle');
    this.text = document.getElementById('subtitleText');
    this.speaker = document.getElementById('subtitleSpeaker');
    this.voices = [];
    this.voice = null;
    this.ready = false;
    this.enabled = true;   // narración por voz (TTS) on/off desde ajustes
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

  // Prioriza voces neuronales/naturales en español (es-ES o es-419/es-MX).
  pickSpanishVoice() {
    const es = this.voices.filter(v => (v.lang || '').toLowerCase().startsWith('es'));
    if (!es.length) return null;
    // Nombres de voces de alta calidad conocidas en macOS/Chrome/Edge
    const preferred = [
      'Google español', 'Google español de Estados Unidos',
      'Mónica', 'Monica', 'Paulina', 'Marisol', 'Jorge', 'Juan',
      'Microsoft Sabina', 'Microsoft Helena', 'Microsoft Laura',
      'Microsoft Alvaro', 'Microsoft Dalia', 'Microsoft Elvira'
    ];
    for (const name of preferred) {
      const hit = es.find(v => v.name.includes(name));
      if (hit) return hit;
    }
    // Prefiere las marcadas como locales/naturales antes que las remotas
    return es.find(v => !v.localService) || es[0];
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
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(spanishLine);
      const v = this.voice || this.pickSpanishVoice();
      if (v) { u.voice = v; u.lang = v.lang; }
      else u.lang = 'es-ES';
      // Parámetros naturales (sin el tono robótico anterior)
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;
      window.speechSynthesis.speak(u);
    } catch (err) {
      console.warn('Narrator unavailable:', err);
    }
  }
}
