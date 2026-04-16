/**
 * Tracks the last successful worker sync as in-memory module state.
 * Resets on process restart — acceptable for a debugging/observability signal.
 */

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

let lastSync: SyncRecord | null = null;

export function recordSync(record: Omit<SyncRecord, 'at'>): void {
  lastSync = { ...record, at: new Date() };
}

export function getLastSync(): SyncRecord | null {
  return lastSync;
}
