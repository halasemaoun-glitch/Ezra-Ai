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

/** Lower threshold at higher sensitivity, while retaining a sustained-frame anti-echo guard. */
export function getMicInterruptionThreshold(sensitivity: number): number {
  return 0.78 - (normalizeMicSensitivity(sensitivity) * 0.0032);
}

/** Android recognition hint: lower sensitivity requires a longer stable speech segment. */
export function getMinimumSpeechLengthMs(sensitivity: number): number {
  return Math.round(500 - normalizeMicSensitivity(sensitivity) * 4);
}

/** Android recognition hints: higher sensitivity finalizes shorter pauses sooner. */
export function getPossibleSilenceLengthMs(sensitivity: number): number {
  return Math.round(1250 - normalizeMicSensitivity(sensitivity) * 3);
}

export function getCompleteSilenceLengthMs(sensitivity: number): number {
  return Math.round(2150 - normalizeMicSensitivity(sensitivity) * 5);
}
