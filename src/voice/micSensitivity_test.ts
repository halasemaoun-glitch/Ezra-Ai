import {
  DEFAULT_MIC_SENSITIVITY,
  getMicInterruptionThreshold,
  getMinimumSpeechLengthMs,
  getPossibleSilenceLengthMs,
  getCompleteSilenceLengthMs,
  normalizeMicSensitivity,
  scaleMicLevel,
} from './micSensitivity.ts';

Deno.test('normalizes sensitivity and keeps a safe default', () => {
  if (normalizeMicSensitivity(undefined) !== DEFAULT_MIC_SENSITIVITY) throw new Error('default mismatch');
  if (normalizeMicSensitivity(-20) !== 0) throw new Error('lower bound mismatch');
  if (normalizeMicSensitivity(130) !== 100) throw new Error('upper bound mismatch');
  if (normalizeMicSensitivity(42.7) !== 43) throw new Error('rounding mismatch');
});

Deno.test('higher sensitivity increases the displayed mic level', () => {
  const low = scaleMicLevel(4, 0);
  const normal = scaleMicLevel(4, 50);
  const high = scaleMicLevel(4, 100);
  if (!(low < normal && normal < high)) throw new Error('sensitivity gain must be monotonic');
  if (scaleMicLevel(5, 50) !== 0.5) throw new Error('default sensitivity must preserve the current mic level');
  if (scaleMicLevel(20, 100) !== 1) throw new Error('mic level must be capped');
});

Deno.test('higher sensitivity lowers the voice interruption threshold', () => {
  const low = getMicInterruptionThreshold(0);
  const normal = getMicInterruptionThreshold(50);
  const high = getMicInterruptionThreshold(100);
  if (!(low > normal && normal > high)) throw new Error('interruption threshold must be inverse to sensitivity');
  if (Math.abs(normal - 0.62) > 0.0001) throw new Error('default threshold should preserve current behavior');
});

Deno.test('sensitivity adjusts Android speech duration and silence hints monotonically', () => {
  if (getMinimumSpeechLengthMs(0) <= getMinimumSpeechLengthMs(100)) throw new Error('low sensitivity should require longer speech');
  if (getPossibleSilenceLengthMs(0) <= getPossibleSilenceLengthMs(100)) throw new Error('higher sensitivity should accept shorter pauses');
  if (getCompleteSilenceLengthMs(0) <= getCompleteSilenceLengthMs(100)) throw new Error('higher sensitivity should finalize shorter pauses');
  if (getMinimumSpeechLengthMs(50) !== 300 || getPossibleSilenceLengthMs(50) !== 1100 || getCompleteSilenceLengthMs(50) !== 1900) throw new Error('default recognition hints mismatch');
});
