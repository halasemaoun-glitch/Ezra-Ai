export type StudyProgress = {
  reviewedCardIds: string[];
  completedCaseIds: string[];
  quizAttempts: number;
  bestQuizScore: number;
  lastQuizScore: number;
};

export type StudyProgressSnapshot = {
  progress: StudyProgress;
  updatedAt: string;
};

export type StudyProgressCloudRow = {
  owner_id: string;
  progress: unknown;
  updated_at: string;
};

export const EMPTY_STUDY_PROGRESS: StudyProgress = {
  reviewedCardIds: [],
  completedCaseIds: [],
  quizAttempts: 0,
  bestQuizScore: 0,
  lastQuizScore: 0,
};

const safeCount = (value: unknown): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(Number(value))) : 0;

const safeIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))]
    : [];

export function normalizeStudyProgress(value: unknown): StudyProgress {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    reviewedCardIds: safeIds(source.reviewedCardIds),
    completedCaseIds: safeIds(source.completedCaseIds),
    quizAttempts: safeCount(source.quizAttempts),
    bestQuizScore: safeCount(source.bestQuizScore),
    lastQuizScore: safeCount(source.lastQuizScore),
  };
}

export function normalizeStudySnapshot(value: unknown, fallbackUpdatedAt = '1970-01-01T00:00:00.000Z'): StudyProgressSnapshot {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawProgress = source.progress && typeof source.progress === 'object' ? source.progress : source;
  const rawUpdatedAt = typeof source.updatedAt === 'string' ? source.updatedAt
    : typeof source.updated_at === 'string' ? source.updated_at : fallbackUpdatedAt;
  const parsedTime = Date.parse(rawUpdatedAt);
  return {
    progress: normalizeStudyProgress(rawProgress),
    updatedAt: Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : fallbackUpdatedAt,
  };
}

export function mergeStudyProgressSnapshots(
  local: StudyProgressSnapshot,
  cloud: StudyProgressSnapshot | null,
): StudyProgressSnapshot {
  if (!cloud) return normalizeStudySnapshot(local);
  const localTime = Date.parse(local.updatedAt) || 0;
  const cloudTime = Date.parse(cloud.updatedAt) || 0;
  const newest = cloudTime > localTime ? cloud : local;
  return {
    progress: {
      reviewedCardIds: [...new Set([...local.progress.reviewedCardIds, ...cloud.progress.reviewedCardIds])],
      completedCaseIds: [...new Set([...local.progress.completedCaseIds, ...cloud.progress.completedCaseIds])],
      quizAttempts: Math.max(local.progress.quizAttempts, cloud.progress.quizAttempts),
      bestQuizScore: Math.max(local.progress.bestQuizScore, cloud.progress.bestQuizScore),
      lastQuizScore: newest.progress.lastQuizScore,
    },
    updatedAt: new Date(Math.max(localTime, cloudTime)).toISOString(),
  };
}

export function studyProgressToCloudRow(
  snapshot: StudyProgressSnapshot,
  ownerId: string,
): StudyProgressCloudRow {
  return {
    owner_id: ownerId,
    progress: normalizeStudyProgress(snapshot.progress),
    updated_at: snapshot.updatedAt,
  };
}

export function studyProgressFromCloudRow(row: StudyProgressCloudRow): StudyProgressSnapshot {
  return normalizeStudySnapshot({ progress: row.progress, updated_at: row.updated_at });
}
