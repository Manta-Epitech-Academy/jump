/**
 * Graph backend — pushes Interview events into the user's own Outlook
 * calendar via Microsoft Graph using their delegated `Calendars.ReadWrite`
 * token. Tokens come from the BetterAuth `bauth_account` row for the
 * `microsoft` provider; we refresh on demand against the v2 token endpoint.
 *
 * One-way Jump → Outlook. User-side edits are not pulled; the next
 * reconcile rewrites the event from Jump's source of truth.
 */

import { env } from '$env/dynamic/private';
import { prisma } from '$lib/server/db';
import type { bauth_account, Interview, Talent } from '@prisma/client';
import { INTERVIEW_SLOT_MINUTES } from '$lib/domain/interview';
import type {
  CalendarSyncBackend,
  CalendarSyncState,
  ReconcileOpts,
  ReconcileResult,
} from './types';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_HOST = 'https://login.microsoftonline.com';
const TOKEN_REFRESH_BUFFER_MS = 60_000;

/**
 * Azure AD `oauth2/v2.0/token` error codes that mean the stored refresh
 * token will never work again — the only recovery is interactive re-OAuth.
 *
 *   - `invalid_grant`: refresh token revoked, expired past its sliding
 *     window, password changed, or device-level revocation.
 *   - `interaction_required` / `consent_required`: tenant policy requires
 *     a fresh consent screen (e.g. admin revoked the app's
 *     `Calendars.ReadWrite` consent).
 *
 * Anything else — HTTP 429, 5xx, transient network errors, app-level
 * `invalid_client` (deployment misconfig, not user-fixable) — leaves the
 * tokens alone. Previously we cleared on any 4xx, which forced re-OAuth on
 * throttling and on tenant-side hiccups.
 */
const NON_RECOVERABLE_OAUTH_ERRORS = new Set([
  'invalid_grant',
  'interaction_required',
  'consent_required',
]);

async function readOauthError(
  res: Response,
): Promise<{ error?: string; error_description?: string } | null> {
  try {
    return (await res.json()) as { error?: string; error_description?: string };
  } catch {
    return null;
  }
}

// ─── Connection inspection ────────────────────────────────────────────────

async function getMicrosoftAccount(
  userId: string,
): Promise<bauth_account | null> {
  return prisma.bauth_account.findFirst({
    where: { userId, providerId: 'microsoft' },
    orderBy: { updatedAt: 'desc' },
  });
}

function accountHasCalendarsScope(account: bauth_account): boolean {
  if (!account.scope) return false;
  return /(^|[\s,])Calendars\.ReadWrite([\s,]|$)/i.test(account.scope);
}

// ─── Token plumbing ───────────────────────────────────────────────────────

async function getValidAccessToken(userId: string): Promise<string | null> {
  const account = await getMicrosoftAccount(userId);
  if (!account || !accountHasCalendarsScope(account)) return null;

  const now = Date.now();
  const expiresAt = account.accessTokenExpiresAt?.getTime() ?? 0;
  if (account.accessToken && expiresAt - TOKEN_REFRESH_BUFFER_MS > now) {
    return account.accessToken;
  }
  if (!account.refreshToken) return null;
  return refreshAccessToken(account);
}

async function refreshAccessToken(
  account: bauth_account,
): Promise<string | null> {
  const tenant = env.MICROSOFT_TENANT_ID || 'common';
  const clientId = env.MICROSOFT_CLIENT_ID;
  const clientSecret = env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret || !account.refreshToken) return null;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: account.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'openid profile email User.Read Calendars.ReadWrite offline_access',
  });

  const res = await fetch(`${TOKEN_HOST}/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const body = await readOauthError(res);
    const oauthError = body?.error;
    if (oauthError && NON_RECOVERABLE_OAUTH_ERRORS.has(oauthError)) {
      console.error(
        'graph token refresh: clearing tokens for re-OAuth',
        oauthError,
        body?.error_description,
      );
      await prisma.bauth_account.update({
        where: { id: account.id },
        data: {
          accessToken: null,
          accessTokenExpiresAt: null,
          refreshToken: null,
          refreshTokenExpiresAt: null,
        },
      });
    } else {
      console.error(
        'graph token refresh failed (transient, tokens preserved)',
        res.status,
        oauthError,
        body?.error_description,
      );
    }
    return null;
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!data.access_token) return null;

  const accessTokenExpiresAt = new Date(
    Date.now() + (data.expires_in ?? 3600) * 1000,
  );
  await prisma.bauth_account.update({
    where: { id: account.id },
    data: {
      accessToken: data.access_token,
      accessTokenExpiresAt,
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      ...(data.scope ? { scope: data.scope } : {}),
    },
  });
  return data.access_token;
}

// ─── Graph event helpers ──────────────────────────────────────────────────

/**
 * Common Graph event payload. Used as-is for PATCH; the create path
 * wraps it with `transactionId` (which is a Graph-side idempotency hint
 * for POST only — sending it on PATCH is just noise).
 */
type GraphEventBody = {
  subject: string;
  body: { contentType: 'text'; content: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  showAs: 'busy';
  isReminderOn: boolean;
  reminderMinutesBeforeStart: number;
};

type GraphEventCreateBody = GraphEventBody & { transactionId: string };

function isoLocal(d: Date): string {
  return d.toISOString().slice(0, 19);
}

function buildGraphBody(
  interview: Interview & { talent: Talent },
): GraphEventBody {
  const start = interview.date;
  const end = new Date(start.getTime() + INTERVIEW_SLOT_MINUTES * 60_000);
  const lines = [
    `Statut : ${interview.status}`,
    interview.talent.phone ? `Tél : ${interview.talent.phone}` : null,
    interview.talent.parentPhone
      ? `Tél parent : ${interview.talent.parentPhone}`
      : null,
    interview.talent.email ? `Email : ${interview.talent.email}` : null,
    interview.globalNote ? `\nNotes : ${interview.globalNote}` : null,
  ].filter((l): l is string => Boolean(l));
  return {
    subject: `Entretien — ${interview.talent.prenom} ${interview.talent.nom}`,
    body: { contentType: 'text', content: lines.join('\n') },
    start: { dateTime: isoLocal(start), timeZone: 'UTC' },
    end: { dateTime: isoLocal(end), timeZone: 'UTC' },
    showAs: 'busy',
    isReminderOn: true,
    reminderMinutesBeforeStart: 10,
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

async function graphCreateEvent(
  token: string,
  body: GraphEventCreateBody,
): Promise<string | null> {
  const res = await fetch(`${GRAPH_BASE}/me/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error('graph create event failed', res.status, await safeText(res));
    return null;
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

async function graphPatchEvent(
  token: string,
  outlookEventId: string,
  body: GraphEventBody,
): Promise<boolean> {
  const res = await fetch(
    `${GRAPH_BASE}/me/events/${encodeURIComponent(outlookEventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (res.ok) return true;
  if (res.status === 404) return false;
  console.error('graph patch event failed', res.status, await safeText(res));
  return false;
}

async function graphDeleteEvent(
  token: string,
  outlookEventId: string,
): Promise<boolean> {
  const res = await fetch(
    `${GRAPH_BASE}/me/events/${encodeURIComponent(outlookEventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (res.ok || res.status === 404) return true;
  console.error('graph delete event failed', res.status, await safeText(res));
  return false;
}

// ─── Backend ──────────────────────────────────────────────────────────────

export const graphBackend: CalendarSyncBackend = {
  mode: 'graph',

  async reconcile(opts: ReconcileOpts): Promise<ReconcileResult> {
    const token = await getValidAccessToken(opts.userId);
    if (!token) return { error: 'needs_reauth' };

    const [interviews, syncs] = await Promise.all([
      prisma.interview.findMany({
        where: {
          staffId: opts.staffProfileId,
          participation: { eventId: opts.eventId },
        },
        include: { talent: true },
      }),
      prisma.outlookCalendarSync.findMany({
        where: {
          userId: opts.userId,
          syncKind: 'graph',
          interview: {
            OR: [
              { staffId: opts.staffProfileId },
              { participation: { eventId: opts.eventId } },
            ],
          },
        },
      }),
    ]);

    const summary = { created: 0, updated: 0, deleted: 0, failed: 0 };
    const syncByInterviewId = new Map(syncs.map((s) => [s.interviewId, s]));
    const liveInterviewIds = new Set(interviews.map((i) => i.id));

    for (const iv of interviews) {
      if (iv.status === 'cancelled') continue;
      const existing = syncByInterviewId.get(iv.id);
      const body = buildGraphBody(iv);
      // `transactionId` is a Graph-side idempotency hint that only
      // applies to POST /events, so we only attach it on create.
      const createBody: GraphEventCreateBody = {
        ...body,
        transactionId: iv.id,
      };
      if (existing) {
        const ok = await graphPatchEvent(token, existing.outlookEventId, body);
        if (ok) {
          await prisma.outlookCalendarSync.update({
            where: { id: existing.id },
            data: { syncedAt: new Date() },
          });
          summary.updated += 1;
        } else {
          // 404 — recreate.
          const newId = await graphCreateEvent(token, createBody);
          if (newId) {
            await prisma.outlookCalendarSync.update({
              where: { id: existing.id },
              data: { outlookEventId: newId },
            });
            summary.created += 1;
          } else {
            summary.failed += 1;
          }
        }
      } else {
        const newId = await graphCreateEvent(token, createBody);
        if (newId) {
          await prisma.outlookCalendarSync.create({
            data: {
              interviewId: iv.id,
              userId: opts.userId,
              outlookEventId: newId,
              syncKind: 'graph',
            },
          });
          summary.created += 1;
        } else {
          summary.failed += 1;
        }
      }
    }

    for (const sync of syncs) {
      const stillAssigned = liveInterviewIds.has(sync.interviewId);
      let cancelled = false;
      if (stillAssigned) {
        const iv = interviews.find((i) => i.id === sync.interviewId);
        cancelled = iv?.status === 'cancelled';
      }
      if (stillAssigned && !cancelled) continue;
      const ok = await graphDeleteEvent(token, sync.outlookEventId);
      if (ok) {
        await prisma.outlookCalendarSync.delete({ where: { id: sync.id } });
        summary.deleted += 1;
      } else {
        summary.failed += 1;
      }
    }

    return summary;
  },

  async loadState(opts: ReconcileOpts): Promise<CalendarSyncState> {
    const account = await getMicrosoftAccount(opts.userId);
    let status: CalendarSyncState['status'];
    if (!account) {
      status = { kind: 'needs_reauth', reason: 'no_account' };
    } else if (!accountHasCalendarsScope(account)) {
      status = { kind: 'needs_reauth', reason: 'missing_scope' };
    } else if (!account.refreshToken) {
      // No refresh token = unrecoverable. Even if `accessToken` is
      // still inside its window, the next expiry leaves us locked out
      // (we ask for `offline_access`, so a missing refresh token means
      // the user revoked or the original consent never granted it).
      // Surface the reauth prompt now rather than waiting for the
      // first failed sync.
      status = { kind: 'needs_reauth', reason: 'no_refresh_token' };
    } else {
      status = { kind: 'connected', lastRefreshedAt: account.updatedAt };
    }

    const agg = await prisma.outlookCalendarSync.aggregate({
      where: {
        userId: opts.userId,
        syncKind: 'graph',
        interview: {
          staffId: opts.staffProfileId,
          participation: { eventId: opts.eventId },
        },
      },
      _count: { _all: true },
      _max: { syncedAt: true },
    });
    return {
      mode: 'graph',
      status,
      syncedCount: agg._count?._all ?? 0,
      lastSyncedAt: agg._max?.syncedAt ?? null,
    };
  },
};
