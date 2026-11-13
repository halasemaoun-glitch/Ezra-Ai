export const DEFAULT_MIC_SENSITIVITY = 50;
export const MIN_MIC_SENSITIVITY = 0;
export const MAX_MIC_SENSITIVITY = 100;

export function normalizeMicSensitivity(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_MIC_SENSITIVITY;
  return Math.max(MIN_MIC_SENSITIVITY, Math.min(MAX_MIC_SENSITIVITY, Math.round(numeric)));
}

/** Expo speech-recognition volumechange values are provider-reported levels, commonly 0..10. */
export function scaleMicLevel(rawLevel: number, sensitivity: number): number {
  const safeRaw = Number.isFinite(rawLevel) ? Math.max(0, Math.min(10, rawLevel)) : 0;
  const gain = 0.75 + normalizeMicSensitivity(sensitivity) / 200;
  return Math.max(0, Math.min(1, (safeRaw / 10) * gain));
}

/** A lower threshold at higher sensitivity helps catch normal conversational speech. */
export function getMicInterruptionThreshold(sensitivity: number): number {
  return 0.5 - (normalizeMicSensitivity(sensitivity) * 0.002);
}

/** Require several consecutive frames to reduce false interruptions from brief noise. */
export function getMicInterruptionFramesRequired(sensitivity: number): number {
  return 5 - Math.floor(normalizeMicSensitivity(sensitivity) / 50);
}

/** Android recognition hint: lower sensitivity requires a longer stable speech segment. */
export function getMinimumSpeechLengthMs(sensitivity: number): number {
  return Math.round(420 - normalizeMicSensitivity(sensitivity) * 2);
}

/** Android recognition hints: higher sensitivity finalizes shorter pauses sooner. */
export function getPossibleSilenceLengthMs(sensitivity: number): number {
  return Math.round(1050 - normalizeMicSensitivity(sensitivity) * 5);
}

export function getCompleteSilenceLengthMs(sensitivity: number): number {
  return Math.round(1800 - normalizeMicSensitivity(sensitivity) * 7);
}
