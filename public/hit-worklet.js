import { OnsetDetector } from './onset-detector.js';

class HitProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.detector = new OnsetDetector(sampleRate);
    this.threshold = 0.025;
    this.blocks = 0;
    this.port.onmessage = ({ data }) => { this.threshold = data.threshold; };
  }

  process(inputs) {
    const samples = inputs[0]?.[0];
    if (samples) {
      const { hits, peak } = this.detector.process(samples, currentTime, this.threshold);
      for (const time of hits) this.port.postMessage({ type: 'hit', time });
      if (++this.blocks % 16 === 0) this.port.postMessage({ type: 'level', peak });
    }
    // Outputs intentionally remain silent: microphone audio is never monitored.
    return true;
  }
}
registerProcessor('hit-processor', HitProcessor);
