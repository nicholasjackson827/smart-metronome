// Shared by the worklet and synthetic signal tests. No main-thread timestamps.
export class OnsetDetector {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.envelope = 0;
    this.floor = 0.001;
    this.lastHit = -Infinity;
    this.armed = true;
    this.previous = 0;
    this.highpass = 0;
  }

  process(samples, startTime, threshold = 0.025) {
    const hits = [];
    let peak = 0;
    const release = Math.exp(-1 / (this.sampleRate * 0.008));
    for (let i = 0; i < samples.length; i++) {
      // Remove DC / low rumble, then follow the transient envelope.
      this.highpass = samples[i] - this.previous + 0.96 * this.highpass;
      this.previous = samples[i];
      const amplitude = Math.abs(this.highpass);
      peak = Math.max(peak, amplitude);
      this.envelope = Math.max(amplitude, this.envelope * release);
      const gate = Math.max(threshold, this.floor * 5);
      const time = startTime + i / this.sampleRate;
      if (this.envelope < gate * 0.45) this.armed = true;
      if (this.armed && amplitude > gate && time - this.lastHit > 0.045) {
        hits.push(time);
        this.lastHit = time;
        this.armed = false;
      }
      // Learn quiet background only, so a ringing hit doesn't raise the floor.
      if (time - this.lastHit > 0.12) this.floor += (Math.min(amplitude, threshold) - this.floor) * 0.0002;
    }
    return { hits, peak };
  }
}
