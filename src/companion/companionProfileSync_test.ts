import {
  DEFAULT_COMPANION_PROFILE,
  companionProfileFromCloudRow,
  companionProfileToCloudRow,
  mergeCompanionProfileSnapshots,
  normalizeCompanionProfile,
  normalizeCompanionSnapshot,
} from './companionProfileSync.ts';

Deno.test('normalizes companion settings and clamps user-controlled values', () => {
  const profile = normalizeCompanionProfile({
    personality: ['ودود', 'ودود', 4, 'مرح'],
    communicationStyle: 'عفوي',
    affection: 9,
    humor: -2,
    extraInstructions: 'x'.repeat(1500),
  });
  if (profile.personality.length !== 2 || profile.affection !== 4 || profile.humor !== 0 ||
      profile.extraInstructions.length !== 1200 || profile.communicationStyle !== 'عفوي') {
    throw new Error('Companion profile normalization failed');
  }
});

Deno.test('supports legacy local profile objects and snapshot envelopes', () => {
  const legacy = normalizeCompanionSnapshot({ ...DEFAULT_COMPANION_PROFILE, userName: 'Hala' }, '2026-11-01T00:00:00.000Z');
  const envelope = normalizeCompanionSnapshot({ profile: { ...DEFAULT_COMPANION_PROFILE, humor: 4 }, updatedAt: '2026-11-02T00:00:00.000Z' });
  if (legacy.profile.userName !== 'Hala' || legacy.updatedAt !== '2026-11-01T00:00:00.000Z' ||
      envelope.profile.humor !== 4 || envelope.updatedAt !== '2026-11-02T00:00:00.000Z') {
    throw new Error('Legacy companion profile migration failed');
  }
});

Deno.test('latest account snapshot wins without mixing separate preference sets', () => {
  const local = normalizeCompanionSnapshot({ profile: { ...DEFAULT_COMPANION_PROFILE, userName: 'Local' }, updatedAt: '2026-11-02T00:00:00.000Z' });
  const cloud = normalizeCompanionSnapshot({ profile: { ...DEFAULT_COMPANION_PROFILE, userName: 'Cloud' }, updatedAt: '2026-11-03T00:00:00.000Z' });
  const merged = mergeCompanionProfileSnapshots(local, cloud);
  if (merged.profile.userName !== 'Cloud') throw new Error('Cloud profile should win when newer');
});

Deno.test('local snapshot wins when it contains a newer unsynced edit', () => {
  const local = normalizeCompanionSnapshot({ profile: { ...DEFAULT_COMPANION_PROFILE, affection: 4 }, updatedAt: '2026-11-04T00:00:00.000Z' });
  const cloud = normalizeCompanionSnapshot({ profile: { ...DEFAULT_COMPANION_PROFILE, affection: 1 }, updatedAt: '2026-11-03T00:00:00.000Z' });
  const merged = mergeCompanionProfileSnapshots(local, cloud);
  if (merged.profile.affection !== 4) throw new Error('Newer local edit should be preserved');
});

Deno.test('cloud payload is explicitly scoped to the authenticated owner', () => {
  const snapshot = normalizeCompanionSnapshot({ profile: { ...DEFAULT_COMPANION_PROFILE, humor: 3 }, updatedAt: '2026-11-05T00:00:00.000Z' });
  const row = companionProfileToCloudRow(snapshot, 'user-123');
  const restored = companionProfileFromCloudRow(row);
  if (row.owner_id !== 'user-123' || restored.profile.humor !== 3 || restored.updatedAt !== snapshot.updatedAt) {
    throw new Error('Companion profile cloud mapping failed');
  }
});
