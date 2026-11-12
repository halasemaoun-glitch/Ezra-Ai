import {
  EMPTY_STUDY_PROGRESS,
  mergeStudyProgressSnapshots,
  normalizeStudyProgress,
  normalizeStudySnapshot,
  studyProgressFromCloudRow,
  studyProgressToCloudRow,
} from './studyProgressSync.ts';

Deno.test('normalizes malformed or legacy local progress safely', () => {
  const value = normalizeStudyProgress({
    reviewedCardIds: ['card-1', 'card-1', 4],
    completedCaseIds: null,
    quizAttempts: -3,
    bestQuizScore: 'bad',
    lastQuizScore: 2.8,
  });
  if (value.reviewedCardIds.length !== 1 || value.completedCaseIds.length !== 0 ||
      value.quizAttempts !== 0 || value.bestQuizScore !== 0 || value.lastQuizScore !== 2) {
    throw new Error('Study progress normalization failed');
  }
});

Deno.test('legacy progress is wrapped with a stable timestamp', () => {
  const snapshot = normalizeStudySnapshot({ ...EMPTY_STUDY_PROGRESS, quizAttempts: 2 });
  if (snapshot.progress.quizAttempts !== 2 || snapshot.updatedAt !== '1970-01-01T00:00:00.000Z') {
    throw new Error('Legacy progress snapshot migration failed');
  }
});

Deno.test('merge unions reviewed items and preserves monotonic counters', () => {
  const merged = mergeStudyProgressSnapshots(
    { progress: { ...EMPTY_STUDY_PROGRESS, reviewedCardIds: ['a'], quizAttempts: 2, bestQuizScore: 3, lastQuizScore: 1 }, updatedAt: '2026-11-01T00:00:00.000Z' },
    { progress: { ...EMPTY_STUDY_PROGRESS, reviewedCardIds: ['b'], completedCaseIds: ['case-1'], quizAttempts: 4, bestQuizScore: 5, lastQuizScore: 4 }, updatedAt: '2026-11-02T00:00:00.000Z' },
  );
  if (merged.progress.reviewedCardIds.length !== 2 || merged.progress.completedCaseIds[0] !== 'case-1' ||
      merged.progress.quizAttempts !== 4 || merged.progress.bestQuizScore !== 5 || merged.progress.lastQuizScore !== 4) {
    throw new Error('Study progress merge failed');
  }
});

Deno.test('latest snapshot supplies last quiz score while completed items are never lost', () => {
  const merged = mergeStudyProgressSnapshots(
    { progress: { ...EMPTY_STUDY_PROGRESS, reviewedCardIds: ['local'], lastQuizScore: 5 }, updatedAt: '2026-11-03T00:00:00.000Z' },
    { progress: { ...EMPTY_STUDY_PROGRESS, completedCaseIds: ['cloud'], lastQuizScore: 2 }, updatedAt: '2026-11-02T00:00:00.000Z' },
  );
  if (merged.progress.lastQuizScore !== 5 || merged.progress.completedCaseIds[0] !== 'cloud') {
    throw new Error('Snapshot conflict resolution failed');
  }
});

Deno.test('cloud payload is explicitly scoped to the authenticated owner', () => {
  const snapshot = normalizeStudySnapshot({ ...EMPTY_STUDY_PROGRESS, quizAttempts: 1, updatedAt: '2026-11-05T00:00:00.000Z' });
  const row = studyProgressToCloudRow(snapshot, 'user-123');
  const restored = studyProgressFromCloudRow(row);
  if (row.owner_id !== 'user-123' || restored.progress.quizAttempts !== 1 || restored.updatedAt !== snapshot.updatedAt) {
    throw new Error('Cloud study progress mapping failed');
  }
});
