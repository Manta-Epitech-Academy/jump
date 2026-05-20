import type { Page } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { FlagKey } from './featureFlags';

export type WorkspaceHomeCrumb = { label: string; href: string };

type PageLike = Pick<Page, 'url' | 'data'>;

type DevData = {
  activeStage?: { id?: string };
  event?: { id?: string };
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
  // With coding_club, /staff/dev renders the full workspace dashboard.
  if (hasFlag(data.featureFlags, 'coding_club')) {
    return { label: 'Tableau de bord', href: resolve('/staff/dev') };
  }
  // Without coding_club, /staff/dev redirects to the active stage overview
  // (src/routes/(staff)/staff/dev/+page.server.ts). Crumb to the destination
  // directly so the label matches what's in the sidebar ("Vue d'ensemble"),
  // and skip it when the page's loaded event IS the active stage — comparing
  // IDs (not URLs) avoids a hydration flash on the overview page itself.
  const stageId = data.activeStage?.id;
  if (!stageId) return null;
  if (data.event?.id === stageId) return null;
  return {
    label: "Vue d'ensemble",
    href: resolve(`/staff/dev/events/${stageId}`),
  };
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
