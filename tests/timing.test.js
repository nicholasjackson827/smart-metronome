import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestBeat, stepDuration, classify, rampTempo } from '../src/timing.js';
import { OnsetDetector } from '../public/onset-detector.js';

test('quarter-note BPM respects denominator and subdivisions', () => {
  assert.equal(stepDuration(120, 4, 1), 0.5);
  assert.equal(stepDuration(120, 8, 1), 0.25);
  assert.equal(stepDuration(120, 4, 4), 0.125);
  assert.ok(Math.abs(stepDuration(120, 4, 3) - 1 / 6) < 1e-9);
});
test('signed timing resolves nearest beat across a bar or tempo change', () => {
  const beats = [{ time: 1.5 }, { time: 2 }, { time: 2.48 }];
  assert.ok(Math.abs(nearestBeat(1.98, beats).error + 20) < 1e-8);
  assert.ok(Math.abs(nearestBeat(2.51, beats).error - 30) < 1e-8);
  assert.equal(nearestBeat(2.1, beats, 100).error, 0);
  assert.equal(nearestBeat(1, []), null);
});
test('on-time window is inclusive and ramp never overshoots or drops tempo', () => {
  assert.equal(classify(-25), 'on-time');
  assert.equal(classify(25), 'on-time');
  assert.equal(classify(-26), 'early');
  assert.equal(classify(26), 'late');
  assert.equal(rampTempo(119, 2, 120), 120);
  assert.equal(rampTempo(130, 2, 120), 130);
});

function detect(strokes, { amplitude = 0.5, threshold = 0.025, sampleRate = 48000, noise = 0.001 } = {}) {
  const detector = new OnsetDetector(sampleRate);
  const hits = [];
  const length = Math.ceil((Math.max(0, ...strokes) + 0.4) * sampleRate);
  for (let frame = 0; frame < length; frame += 128) {
    const block = new Float32Array(128);
    for (let i = 0; i < block.length; i++) {
      const time = (frame + i) / sampleRate;
      block[i] = noise * Math.sin(time * 2 * Math.PI * 333);
      for (const stroke of strokes) {
        const age = time - stroke;
        if (age >= 0 && age < 0.08) block[i] += amplitude * Math.exp(-age / 0.006) * Math.cos(age * 2 * Math.PI * 1800);
      }
    }
    hits.push(...detector.process(block, frame / sampleRate, threshold).hits);
  }
  return hits;
}
test('pad-like decaying strokes register once with sample-based timing', () => {
  const expected = [0.2, 0.7, 1.2, 1.7];
  for (const sampleRate of [44100, 48000]) {
    const actual = detect(expected, { sampleRate });
    assert.equal(actual.length, expected.length);
    actual.forEach((time, i) => assert.ok(Math.abs(time - expected[i]) < 0.002));
  }
});
test('detector handles sixteenth notes at 180 BPM and stays quiet on low noise', () => {
  const strokes = Array.from({ length: 16 }, (_, i) => 0.2 + i / 12);
  assert.equal(detect(strokes).length, strokes.length);
  assert.equal(detect([]).length, 0);
});
test('sensitivity allows quiet strokes and rejects signals below its threshold', () => {
  assert.equal(detect([0.2], { amplitude: 0.01 }).length, 0);
  assert.equal(detect([0.2], { amplitude: 0.01, threshold: 0.004 }).length, 1);
});
