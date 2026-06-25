import type { Page } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { FlagKey } from './featureFlags';

export type WorkspaceHomeCrumb = { label: string; href: string };

type PageLike = Pick<Page, 'url' | 'data'>;

type DevData = {
  featureFlags?: Iterable<string>;
};

type PedagoData = {
  staffProfile?: { staffRole?: string };
};

function hasFlag(flags: Iterable<string> | undefined, key: FlagKey): boolean {
  if (!flags) return false;
  if (flags instanceof Set) return flags.has(key);
  for (const f of flags) if (f === key) return true;
  return false;
}

function devHomeCrumb(page: PageLike): WorkspaceHomeCrumb | null {
  const data = (page.data ?? {}) as DevData;
  // With coding_club, /staff/dev renders the full workspace dashboard, so it is
  // a real home destination. Without it, /staff/dev only redirects into the
  // current event's surfaces (no standalone landing), so there is no home crumb
  // to add: the event's own crumb, rendered by the page, is the top of the trail.
  if (hasFlag(data.featureFlags, 'coding_club')) {
    return { label: 'Tableau de bord', href: resolve('/staff/dev') };
  }
  return null;
}

function pedagoHomeCrumb(page: PageLike): WorkspaceHomeCrumb {
  const data = (page.data ?? {}) as PedagoData;
  const label =
    data.staffProfile?.staffRole === 'manta' ? "Aujourd'hui" : 'Dashboard Live';
  return { label, href: resolve('/staff/pedago') };
}

export function getWorkspaceHomeCrumb(
  page: PageLike,
): WorkspaceHomeCrumb | null {
  const path = page.url.pathname;
  if (path.startsWith('/staff/dev')) return devHomeCrumb(page);
  if (path.startsWith('/staff/pedago')) return pedagoHomeCrumb(page);
  return null;
}
