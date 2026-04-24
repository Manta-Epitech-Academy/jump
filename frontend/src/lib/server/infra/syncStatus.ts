/**
 * Tracks the last successful worker sync in AppSetting so the value is shared
 * across PM2 cluster workers (module-level state would diverge per worker).
 */

import { prisma } from '$lib/server/db';

export type SyncType = 'campus_list' | 'events' | 'talents';

export type SyncRecord = {
  type: SyncType;
  at: Date;
  campusExtName?: string;
  eventExtId?: string;
  created?: number;
  updated?: number;
  removed?: number;
  skipped?: number;
};

const KEY = 'sync.last';

export async function recordSync(
  record: Omit<SyncRecord, 'at'>,
): Promise<void> {
  const value = JSON.stringify({ ...record, at: new Date() });
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  });
}

export async function getLastSync(): Promise<SyncRecord | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return null;
  const parsed = JSON.parse(row.value) as SyncRecord;
  return { ...parsed, at: new Date(parsed.at) };
}
