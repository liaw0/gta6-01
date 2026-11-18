// All sound is synthesized with WebAudio — no audio files, no network.
// Engine hum, police sirens, gunshots, chimes and a low-key bass groove.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      // engine: sawtooth through a lowpass, pitch follows speed
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
      // siren: two-tone square wave, toggled by timer
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'square';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.ctx.destination);
      this.sirenOsc.start();
      this.startMusic();
    } catch (e) { this.ctx = null; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.engineGain) this.engineGain.gain.value = m ? 0 : (this._engineLevel || 0);
    if (this.sirenGain) this.sirenGain.gain.value = (m || !this._sirenOn) ? 0 : 0.045;
  }

  engine(ratio, speed) {
    if (!this.ctx || this.muted) return;
    this._engineLevel = 0.015 + ratio * 0.05;
    this.engineGain.gain.value = this._engineLevel;
    this.engineOsc.frequency.value = 52 + ratio * 130 + (speed < 0 ? 8 : 0);
  }

  engineStart() { this.blip(660, 0.09, 'sine', 0.12); }
  door() { this.blip(180, 0.08, 'square', 0.08); }
  thud() { this.noise(0.12, 300); }

  siren(on) {
    this._sirenOn = on;
    if (!this.ctx) return;
    if (on && !this.sirenTimer) {
      let hi = false;
      this.sirenTimer = setInterval(() => {
        if (this.muted) { this.sirenGain.gain.value = 0; return; }
        hi = !hi;
        this.sirenOsc.frequency.value = hi ? 720 : 540;
        this.sirenGain.gain.value = 0.035;
      }, 380);
    } else if (!on && this.sirenTimer) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
      this.sirenGain.gain.value = 0;
    }
  }

  gunshot() {
    this.noise(0.16, 1800);
    this.blip(140, 0.1, 'square', 0.16);
  }

  reload() { this.blip(520, 0.05, 'sine', 0.1); setTimeout(() => this.blip(760, 0.05, 'sine', 0.1), 120); }

  chime() { this.blip(880, 0.12, 'sine', 0.14); setTimeout(() => this.blip(1318, 0.16, 'sine', 0.14), 110); }

  jingle() {
    if (!this.ctx) return;
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.16), i * 110));
  }

  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(); o.stop(this.ctx.currentTime + dur + 0.02);
  }

  noise(dur, cutoff) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = this.ctx.createGain(); g.gain.value = 0.5;
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start();
  }

  // A slow, moody bass groove: A minor, one note per beat, quiet.
  startMusic() {
    if (this.musicTimer) return;
    const notes = [110, 0, 130.8, 0, 98, 0, 146.8, 0, 110, 0, 130.8, 0, 164.8, 146.8, 130.8, 98];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const f = notes[this.musicStep % notes.length];
      this.musicStep += 1;
      if (f) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.05, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.42);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(); o.stop(this.ctx.currentTime + 0.45);
      }
    }, 460);
  }
}
