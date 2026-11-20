import { stepDuration, rampTempo } from './timing.js';

export class PracticeAudio {
  constructor({ onStep, onHit, onLevel, onTempo, onInterrupted }) {
    Object.assign(this, { onStep, onHit, onLevel, onTempo, onInterrupted });
    this.running = false;
    this.events = [];
    this.nodes = new Set();
  }

  async init() {
    if (!this.context || this.context.state === 'closed') {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error('This browser does not support Web Audio. Open Pocket Time in Safari on your iPhone.');
      this.context = new Context({ latencyHint: 'interactive' });
      this.context.onstatechange = () => {
        if (this.running && this.context.state !== 'running') this.onInterrupted();
      };
    }
    await this.context.resume();
  }

  async listen(threshold, route) {
    if (!navigator.mediaDevices?.getUserMedia || !this.context.audioWorklet) {
      throw new Error('Listening needs HTTPS and a browser with microphone support. You can still use the metronome.');
    }
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1,
        echoCancellation: route === 'speaker',
        noiseSuppression: false,
        autoGainControl: false,
      } });
      await this.context.audioWorklet.addModule('/hit-worklet.js');
      this.source = this.context.createMediaStreamSource(this.stream);
      this.worklet = new AudioWorkletNode(this.context, 'hit-processor');
      this.worklet.port.onmessage = ({ data }) => {
        if (data.type === 'hit' && this.running) this.onHit(data.time);
        if (data.type === 'level') this.onLevel(data.peak);
      };
      this.setThreshold(threshold);
      this.source.connect(this.worklet);
      this.worklet.connect(this.context.destination);
      this.stream.getAudioTracks()[0].onended = () => this.onInterrupted();
      await this.context.resume();
    } catch (error) {
      this.releaseMic();
      throw error;
    }
  }

  setThreshold(threshold) { this.worklet?.port.postMessage({ threshold }); }

  start(settings) {
    this.settings = structuredClone(settings);
    this.events = [];
    this.step = 0;
    this.bar = 0;
    this.nextTime = this.context.currentTime + 0.18;
    this.running = true;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 20);
    this.paint();
  }

  schedule() {
    const s = this.settings;
    if (this.nextTime < this.context.currentTime - 0.1) {
      this.onInterrupted();
      return;
    }
    while (this.nextTime < this.context.currentTime + 0.12) {
      if (this.step === 0 && this.bar > 0 && s.ramp && this.bar % s.rampBars === 0) {
        s.bpm = rampTempo(s.bpm, s.rampAmount, s.rampTarget);
      }
      const beat = Math.floor(this.step / s.subdivision);
      const isBeat = this.step % s.subdivision === 0;
      const accent = isBeat ? s.accents[beat] : 1;
      const event = { time: this.nextTime, beat, step: this.step, bar: this.bar, bpm: s.bpm, painted: false };
      this.events.push(event);
      if (accent > 0) this.click(this.nextTime, isBeat, accent === 2);
      this.nextTime += stepDuration(s.bpm, s.denominator, s.subdivision);
      this.step++;
      if (this.step >= s.numerator * s.subdivision) { this.step = 0; this.bar++; }
    }
    this.events = this.events.filter(event => event.time > this.context.currentTime - 4);
  }

  click(time, isBeat, accented) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.frequency.value = accented ? 1500 : isBeat ? 1000 : 720;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(this.settings.volume * (accented ? 0.65 : isBeat ? 0.4 : 0.17), time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
    oscillator.connect(gain).connect(this.context.destination);
    this.nodes.add(oscillator);
    oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(time);
    oscillator.stop(time + 0.04);
  }

  paint() {
    if (!this.running) return;
    const stamp = this.context.getOutputTimestamp?.();
    const now = stamp?.contextTime > 0
      ? stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000
      : this.context.currentTime;
    for (const event of this.events) {
      if (!event.painted && event.time <= now) {
        event.painted = true;
        this.onTempo(event.bpm);
        this.onStep(event);
      }
    }
    this.frame = requestAnimationFrame(() => this.paint());
  }

  releaseMic() {
    this.worklet?.disconnect();
    this.source?.disconnect();
    if (this.worklet) this.worklet.port.onmessage = null;
    this.worklet = null;
    this.source = null;
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.stream = null;
    if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch { /* Optional API. */ } }
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    cancelAnimationFrame(this.frame);
    for (const node of this.nodes) { try { node.stop(); } catch { /* Already stopped. */ } }
    this.nodes.clear();
    this.releaseMic();
  }
}
