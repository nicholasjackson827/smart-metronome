export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// BPM always refers to quarter notes; the denominator sets the beat length.
export function stepDuration(bpm, denominator, subdivision) {
  return (60 / bpm) * (4 / denominator) / subdivision;
}

export function nearestBeat(time, beats, offsetMs = 0) {
  const adjusted = time - offsetMs / 1000;
  let nearest = null;
  for (const beat of beats) {
    const error = (adjusted - beat.time) * 1000;
    if (!nearest || Math.abs(error) < Math.abs(nearest.error)) nearest = { ...beat, error };
  }
  return nearest;
}

export function classify(error, tolerance = 25) {
  return Math.abs(error) <= tolerance ? 'on-time' : error < 0 ? 'early' : 'late';
}

export function rampTempo(bpm, increment, target) {
  return Math.min(Math.max(bpm, target), bpm + increment);
}
