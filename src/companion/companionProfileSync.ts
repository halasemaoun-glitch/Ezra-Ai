export type CompanionProfile = {
  personality: string[];
  communicationStyle: string;
  preferredAddress: string;
  affection: number;
  humor: number;
  userName: string;
  occupation: string;
  lifestyle: string;
  extraInstructions: string;
};

export type CompanionProfileSnapshot = {
  profile: CompanionProfile;
  updatedAt: string;
};

export type CompanionProfileCloudRow = {
  owner_id: string;
  profile: CompanionProfile;
  updated_at: string;
};

export const DEFAULT_COMPANION_PROFILE: CompanionProfile = {
  personality: ['ودود', 'ذكي', 'هادئ'],
  communicationStyle: 'متوازن',
  preferredAddress: '',
  affection: 2,
  humor: 2,
  userName: '',
  occupation: '',
  lifestyle: '',
  extraInstructions: '',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const boundedText = (value: unknown, fallback: string, maxLength: number): string =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : fallback;

const boundedLevel = (value: unknown, fallback: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(4, Math.floor(Number(value)))) : fallback;

export function normalizeCompanionProfile(value: unknown): CompanionProfile {
  const source = isRecord(value) ? value : {};
  const traits = Array.isArray(source.personality)
    ? [...new Set(source.personality.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))].slice(0, 8)
    : DEFAULT_COMPANION_PROFILE.personality;
  return {
    personality: traits,
    communicationStyle: boundedText(source.communicationStyle, DEFAULT_COMPANION_PROFILE.communicationStyle, 80),
    preferredAddress: boundedText(source.preferredAddress, '', 80),
    affection: boundedLevel(source.affection, DEFAULT_COMPANION_PROFILE.affection),
    humor: boundedLevel(source.humor, DEFAULT_COMPANION_PROFILE.humor),
    userName: boundedText(source.userName, '', 80),
    occupation: boundedText(source.occupation, '', 120),
    lifestyle: boundedText(source.lifestyle, '', 500),
    extraInstructions: boundedText(source.extraInstructions, '', 1200),
  };
}

export function normalizeCompanionSnapshot(
  value: unknown,
  fallbackUpdatedAt = '1970-01-01T00:00:00.000Z',
): CompanionProfileSnapshot {
  const source = isRecord(value) ? value : {};
  const rawProfile = isRecord(source.profile) ? source.profile : source;
  const rawUpdatedAt = typeof source.updatedAt === 'string' ? source.updatedAt
    : typeof source.updated_at === 'string' ? source.updated_at : fallbackUpdatedAt;
  const parsed = Date.parse(rawUpdatedAt);
  return {
    profile: normalizeCompanionProfile(rawProfile),
    updatedAt: Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallbackUpdatedAt,
  };
}

export function mergeCompanionProfileSnapshots(
  local: CompanionProfileSnapshot,
  cloud: CompanionProfileSnapshot | null,
): CompanionProfileSnapshot {
  const normalizedLocal = normalizeCompanionSnapshot(local);
  if (!cloud) return normalizedLocal;
  const normalizedCloud = normalizeCompanionSnapshot(cloud);
  return Date.parse(normalizedCloud.updatedAt) >= Date.parse(normalizedLocal.updatedAt)
    ? normalizedCloud
    : normalizedLocal;
}

export function companionProfileToCloudRow(
  snapshot: CompanionProfileSnapshot,
  ownerId: string,
): CompanionProfileCloudRow {
  return {
    owner_id: ownerId,
    profile: normalizeCompanionProfile(snapshot.profile),
    updated_at: normalizeCompanionSnapshot(snapshot).updatedAt,
  };
}

export function companionProfileFromCloudRow(row: {
  profile: unknown;
  updated_at: string;
}): CompanionProfileSnapshot {
  return normalizeCompanionSnapshot({ profile: row.profile, updated_at: row.updated_at });
}
