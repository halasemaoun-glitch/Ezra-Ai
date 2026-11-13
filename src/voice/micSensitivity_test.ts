import {
  DEFAULT_MIC_SENSITIVITY,
  getMicInterruptionThreshold,
  advanceMicInterruptionFrames,
  getMicInterruptionFramesRequired,
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
  if (Math.abs(normal - 0.4) > 0.0001) throw new Error('default threshold should respond to normal conversational speech');
  if (getMicInterruptionFramesRequired(0) !== 5 || getMicInterruptionFramesRequired(50) !== 4 || getMicInterruptionFramesRequired(100) !== 3) throw new Error('interruption debounce must shorten as sensitivity increases');
});

Deno.test('interruption detection requires consecutive above-threshold voice frames', () => {
  const first = advanceMicInterruptionFrames(0, 0.5, 50);
  const second = advanceMicInterruptionFrames(first, 0.48, 50);
  const reset = advanceMicInterruptionFrames(second, 0.2, 50);
  const recovered = advanceMicInterruptionFrames(reset, 0.5, 50);
  if (first !== 1 || second !== 2 || reset !== 0 || recovered !== 1) throw new Error('quiet frames must reset the interruption attack window');
  if (advanceMicInterruptionFrames(3, 0.5, 50) !== 4) throw new Error('normal sensitivity should confirm after four strong frames');
  if (advanceMicInterruptionFrames(3, 0.5, 100) !== 3) throw new Error('high sensitivity should cap confirmation at three frames');
  if (advanceMicInterruptionFrames(3, Number.NaN, 50) !== 0) throw new Error('invalid mic levels must reset interruption detection');
});

Deno.test('sensitivity adjusts Android speech duration and silence hints monotonically', () => {
  if (getMinimumSpeechLengthMs(0) <= getMinimumSpeechLengthMs(100)) throw new Error('low sensitivity should require longer speech');
  if (getPossibleSilenceLengthMs(0) <= getPossibleSilenceLengthMs(100)) throw new Error('higher sensitivity should accept shorter pauses');
  if (getCompleteSilenceLengthMs(0) <= getCompleteSilenceLengthMs(100)) throw new Error('higher sensitivity should finalize shorter pauses');
  if (getMinimumSpeechLengthMs(50) !== 320 || getPossibleSilenceLengthMs(50) !== 800 || getCompleteSilenceLengthMs(50) !== 1450) throw new Error('default recognition hints mismatch');
});
