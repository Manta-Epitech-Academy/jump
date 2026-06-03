import type { PageServerLoad } from './$types';
import {
  getRelanceMirror,
  getRelanceStats,
  type RelanceMirrorChannel,
  type RelanceMirrorType,
} from '$lib/server/services/communicationStats';

function parsePage(raw: string | null): number {
  const n = parseInt(raw ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseChannel(raw: string | null): RelanceMirrorChannel | undefined {
  return raw === 'email' || raw === 'sms' ? raw : undefined;
}

function parseType(raw: string | null): RelanceMirrorType | undefined {
  return raw === 'student' || raw === 'parent' ? raw : undefined;
}

export const load: PageServerLoad = async ({ url }) => {
  const page = parsePage(url.searchParams.get('page'));
  const channel = parseChannel(url.searchParams.get('channel'));
  const type = parseType(url.searchParams.get('type'));

  const [mirror, stats] = await Promise.all([
    getRelanceMirror({ page, channel, type }),
    getRelanceStats(),
  ]);

  return {
    mirror,
    stats,
    filters: { channel: channel ?? 'all', type: type ?? 'all' },
  };
};
