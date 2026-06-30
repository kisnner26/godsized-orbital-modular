export class ShipAudio {
  constructor(input, player) {
    this.input = input;
    this.player = player;
    this.ctx = null;
    this.master = null;
    this.hum = null;
    this.humGain = null;
    this.thrust = null;
    this.thrustGain = null;
    this.filter = null;
  }

  start() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._vol ?? 0.34;
    this.master.connect(this.ctx.destination);

    this.hum = this.ctx.createOscillator();
    this.hum.type = 'sawtooth';
    this.hum.frequency.value = 42;
    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0.035;
    const humFilter = this.ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 180;
    this.hum.connect(humFilter);
    humFilter.connect(this.humGain);
    this.humGain.connect(this.master);
    this.hum.start();

    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.thrust = this.ctx.createBufferSource();
    this.thrust.buffer = buffer;
    this.thrust.loop = true;
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'bandpass';
    this.filter.frequency.value = 120;
    this.filter.Q.value = 0.65;
    this.thrustGain = this.ctx.createGain();
    this.thrustGain.gain.value = 0.0;
    this.thrust.connect(this.filter);
    this.filter.connect(this.thrustGain);
    this.thrustGain.connect(this.master);
    this.thrust.start();
  }

  setMasterVolume(v) {
    this._vol = Math.max(0, Math.min(1, Number(v) || 0));
    if (this.master) this.master.gain.value = this._vol;
  }

  update(dt) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const speed = this.player?.speed || 0;
    const maxS = this.player?.maxSpeed || 18;
    const sf = Math.min(speed / maxS, 1);          // fracción de velocidad 0..1
    const throttle = this.player?.throttle || 0;   // empuje 0..1

    // El rugido del motor crece notablemente con la velocidad y el empuje.
    const target = 0.05 + sf * 0.45 + throttle * 0.20;
    this.thrustGain.gain.setTargetAtTime(target, now, 0.07);
    this.humGain.gain.setTargetAtTime(0.03 + sf * 0.12, now, 0.15);
    this.hum.frequency.setTargetAtTime(36 + sf * 78, now, 0.14);
    this.filter.frequency.setTargetAtTime(120 + sf * 900 + throttle * 320, now, 0.1);
  }
}
