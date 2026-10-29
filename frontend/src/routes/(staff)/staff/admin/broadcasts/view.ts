import type { BroadcastChannel, BroadcastStatus } from '@prisma/client';
import type { FacetDef } from '$lib/domain/listFacets';
import { defineListView } from '$lib/domain/listView';
import {
  BROADCAST_CHANNEL_LABELS,
  BROADCAST_CHANNELS,
  BROADCAST_STATUS_LABELS,
} from '$lib/domain/broadcasts';

/**
 * The send list's view, in the address every staff list shares
 * (`$lib/domain/listView`): the channel (`canal`) and the send's state
 * (`statut`) filter from their columns. The list is the 50 most recent sends,
 * newest first, and does not sort.
 */

export const BROADCASTS_FACETS = ['canal', 'statut'] as const;

export type BroadcastsFacet = (typeof BROADCASTS_FACETS)[number];

export const BROADCASTS_VIEW = defineListView({ facets: BROADCASTS_FACETS });

type BroadcastRow = { channel: BroadcastChannel; status: BroadcastStatus };

export const BROADCASTS_FACET_DEFS: Record<
  BroadcastsFacet,
  FacetDef<BroadcastRow>
> = {
  canal: {
    title: 'Canal',
    valuesOf: (b) => [b.channel],
    vocabulary: () =>
      BROADCAST_CHANNELS.map((c) => [c, BROADCAST_CHANNEL_LABELS[c]]),
  },
  statut: {
    title: 'Statut',
    valuesOf: (b) => [b.status],
    // The send's life in order: queued, sending, then how it ended.
    vocabulary: () => Object.entries(BROADCAST_STATUS_LABELS),
  },
};
