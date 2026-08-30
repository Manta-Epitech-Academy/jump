/**
 * Communication analytics: read-only projections over existing rows.
 *
 * Spans two outbound surfaces of the admin Communication hub: bulk broadcasts
 * (`Broadcast`/`BroadcastRecipient`) and transactional mail mappings
 * (`EmailActionMapping`). It owns no state: every figure is a read-time
 * projection via `groupBy`/`count` (the facts-as-rows convention, see
 * CLAUDE.md), so there is nothing to keep in sync and no migration.
 *
 * Admin space is cross-campus by design ("global system overview"), so this
 * service aggregates globally rather than scoping to one campus.
 */
import { prisma } from '$lib/server/db';
import type { BroadcastChannel, BroadcastStatus } from '@prisma/client';
import { BROADCAST_CHANNELS } from '$lib/domain/broadcasts';
import {
  EMAIL_ACTIONS,
  EMAIL_ACTION_KEYS,
  type EmailActionKey,
} from '$lib/domain/emailActions';

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_DAYS = 30;

export interface CommWindow {
  since: Date;
  until: Date;
}

function resolveWindow(win?: Partial<CommWindow>): CommWindow {
  const until = win?.until ?? new Date();
  const since =
    win?.since ?? new Date(until.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS);
  return { since, until };
}

function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

// ── 1. Per-broadcast recipient progress (shared by list + stats) ──────────────
export interface BroadcastProgress {
  sent: number;
  failed: number;
  pending: number;
  opened: number;
}

/**
 * Recipient-status tallies + open count for each given broadcast id. Returns a
 * zero-filled row for every id (so callers can index without a null check).
 * This is the aggregation the broadcasts list + the overview both need.
 */
export async function getBroadcastProgress(
  ids: string[],
): Promise<Record<string, BroadcastProgress>> {
  const progress: Record<string, BroadcastProgress> = {};
  for (const id of ids) {
    progress[id] = { sent: 0, failed: 0, pending: 0, opened: 0 };
  }
  if (ids.length === 0) return progress;

  const [counts, opened] = await Promise.all([
    prisma.broadcastRecipient.groupBy({
      by: ['broadcastId', 'status'],
      where: { broadcastId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.broadcastRecipient.groupBy({
      by: ['broadcastId'],
      where: { broadcastId: { in: ids }, openedAt: { not: null } },
      _count: { _all: true },
    }),
  ]);

  for (const c of counts) {
    const p = progress[c.broadcastId];
    if (p) p[c.status] = c._count._all;
  }
  for (const o of opened) {
    const p = progress[o.broadcastId];
    if (p) p.opened = o._count._all;
  }
  return progress;
}

// ── 2. Broadcast analytics over a time window ─────────────────────────────────
export interface BroadcastChannelStat {
  channel: BroadcastChannel;
  broadcasts: number;
  recipients: number;
  sent: number;
  failed: number;
  pending: number;
  opened: number;
  /** opened / sent, in %. `null` for SMS (no open tracking) and when sent = 0. */
  openRate: number | null;
  /** sent / recipients, in %. `null` when recipients = 0. */
  deliveryRate: number | null;
}

export interface BroadcastTotals {
  broadcasts: number;
  recipients: number;
  sent: number;
  failed: number;
  pending: number;
  opened: number;
  /** Overall mail open rate (mail opened / mail sent). SMS excluded. */
  openRate: number | null;
  deliveryRate: number | null;
}

export interface BroadcastStats {
  window: CommWindow;
  totals: BroadcastTotals;
  byChannel: BroadcastChannelStat[];
  /** Broadcast-level status counts (one per send, not per recipient). */
  byStatus: Record<BroadcastStatus, number>;
}

export async function getBroadcastStats(
  win?: Partial<CommWindow>,
): Promise<BroadcastStats> {
  const window = resolveWindow(win);

  const broadcasts = await prisma.broadcast.findMany({
    where: { createdAt: { gte: window.since, lte: window.until } },
    select: { id: true, channel: true, status: true },
  });
  const progress = await getBroadcastProgress(broadcasts.map((b) => b.id));

  const byStatus: Record<BroadcastStatus, number> = {
    queued: 0,
    sending: 0,
    sent: 0,
    partial_failed: 0,
    failed: 0,
  };
  const acc: Record<
    BroadcastChannel,
    { broadcasts: number; recipients: number } & BroadcastProgress
  > = {
    mail: {
      broadcasts: 0,
      recipients: 0,
      sent: 0,
      failed: 0,
      pending: 0,
      opened: 0,
    },
    sms: {
      broadcasts: 0,
      recipients: 0,
      sent: 0,
      failed: 0,
      pending: 0,
      opened: 0,
    },
  };

  for (const b of broadcasts) {
    byStatus[b.status]++;
    const c = acc[b.channel];
    const p = progress[b.id];
    c.broadcasts++;
    c.sent += p.sent;
    c.failed += p.failed;
    c.pending += p.pending;
    c.opened += p.opened;
    c.recipients += p.sent + p.failed + p.pending;
  }

  const byChannel: BroadcastChannelStat[] = BROADCAST_CHANNELS.map(
    (channel) => {
      const c = acc[channel];
      return {
        channel,
        broadcasts: c.broadcasts,
        recipients: c.recipients,
        sent: c.sent,
        failed: c.failed,
        pending: c.pending,
        opened: c.opened,
        // Open tracking is mail-only; never claim an SMS open rate.
        openRate: channel === 'mail' ? rate(c.opened, c.sent) : null,
        deliveryRate: rate(c.sent, c.recipients),
      };
    },
  );

  const mail = acc.mail;
  const totalRecipients = acc.mail.recipients + acc.sms.recipients;
  const totalSent = acc.mail.sent + acc.sms.sent;
  const totals: BroadcastTotals = {
    broadcasts: broadcasts.length,
    recipients: totalRecipients,
    sent: totalSent,
    failed: acc.mail.failed + acc.sms.failed,
    pending: acc.mail.pending + acc.sms.pending,
    opened: acc.mail.opened + acc.sms.opened,
    // Headline open rate divides by mail sent only (SMS can't be opened).
    openRate: rate(mail.opened, mail.sent),
    deliveryRate: rate(totalSent, totalRecipients),
  };

  return { window, totals, byChannel, byStatus };
}

// ── 3. Recent broadcast activity (overview feed) ──────────────────────────────
export interface RecentBroadcast {
  id: string;
  name: string;
  channel: BroadcastChannel;
  status: BroadcastStatus;
  campusName: string;
  eventTitle: string | null;
  createdAt: Date;
  recipients: number;
  sent: number;
  failed: number;
  opened: number;
}

async function getRecentBroadcasts(limit = 8): Promise<RecentBroadcast[]> {
  const rows = await prisma.broadcast.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      name: true,
      channel: true,
      status: true,
      createdAt: true,
      campus: { select: { name: true } },
      event: { select: { titre: true } },
    },
  });
  const progress = await getBroadcastProgress(rows.map((r) => r.id));
  return rows.map((r) => {
    const p = progress[r.id];
    return {
      id: r.id,
      name: r.name,
      channel: r.channel,
      status: r.status,
      campusName: r.campus.name,
      eventTitle: r.event?.titre ?? null,
      createdAt: r.createdAt,
      recipients: p.sent + p.failed + p.pending,
      sent: p.sent,
      failed: p.failed,
      opened: p.opened,
    };
  });
}

// ── 4. Transactional mail health ──────────────────────────────────────────────
export interface TransactionalActionHealth {
  key: EmailActionKey;
  label: string;
  mapped: boolean;
  templateId: string | null;
  templateName: string | null;
  updatedAt: Date | null;
}

export interface TransactionalHealth {
  actions: TransactionalActionHealth[];
  mappedCount: number;
  missingCount: number;
  total: number;
  /** True when every action has a template. */
  healthy: boolean;
}

async function getTransactionalHealth(): Promise<TransactionalHealth> {
  const mappings = await prisma.emailActionMapping.findMany({
    select: {
      actionKey: true,
      templateId: true,
      updatedAt: true,
      template: { select: { name: true } },
    },
  });
  const byKey = new Map(mappings.map((m) => [m.actionKey, m]));

  const actions: TransactionalActionHealth[] = EMAIL_ACTION_KEYS.map((key) => {
    const m = byKey.get(key);
    return {
      key,
      label: EMAIL_ACTIONS[key].label,
      mapped: Boolean(m),
      templateId: m?.templateId ?? null,
      templateName: m?.template?.name ?? null,
      updatedAt: m?.updatedAt ?? null,
    };
  });
  const mappedCount = actions.filter((a) => a.mapped).length;
  const missingCount = actions.length - mappedCount;
  return {
    actions,
    mappedCount,
    missingCount,
    total: actions.length,
    healthy: missingCount === 0,
  };
}

// ── 5. One-shot overview aggregate ────────────────────────────────────────────
export interface CommunicationOverview {
  broadcasts: BroadcastStats;
  recentBroadcasts: RecentBroadcast[];
  transactional: TransactionalHealth;
}

export async function getCommunicationOverview(): Promise<CommunicationOverview> {
  const [broadcasts, recentBroadcasts, transactional] = await Promise.all([
    getBroadcastStats(),
    getRecentBroadcasts(),
    getTransactionalHealth(),
  ]);
  return { broadcasts, recentBroadcasts, transactional };
}
