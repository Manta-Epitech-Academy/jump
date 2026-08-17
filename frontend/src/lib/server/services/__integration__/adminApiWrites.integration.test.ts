/**
 * The write tier, exercised through the wrapper rather than around it.
 *
 * The handler is called the way SvelteKit would call it, so what is under test
 * is the whole path: bearer auth, tier and capability, strict validation, the
 * operation itself, and the audit row with its before and after. Calling the
 * write functions directly would have skipped the half of this that makes a
 * mutation accountable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { createAdminAccount } from './adminApiAccount';
import { mintToken } from '$lib/server/adminApi/tokens';
import { adminApiWrite } from '$lib/server/adminApi/route';
import { planDigest } from '$lib/server/adminApi/plan';

const postConfig = adminApiWrite('write_event_config');
const postFeedbackForm = adminApiWrite('write_event_feedback_form');
const postBulkModules = adminApiWrite('bulk_event_modules');

/** Calls a handler the way SvelteKit would, with a bearer and a JSON body. */
async function call(
  handler: RequestHandler,
  secret: string | null,
  body: unknown,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const request = new Request('http://localhost/api/admin/write/event-config', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const response = await handler({
    request,
    url: new URL(request.url),
    locals: {} as App.Locals,
  } as RequestEvent);
  return { status: response.status, payload: await response.json() };
}

describe('admin API writes (integration)', () => {
  const stamp = Date.now();
  let adminUserId = '';
  let writeSecret = '';
  let readSecret = '';
  let eventId = '';
  let campusId = '';

  beforeAll(async () => {
    assertTestDatabase();
    const admin = await createAdminAccount(`writes.admin.${stamp}@epitech.eu`);
    adminUserId = admin.id;

    writeSecret = (
      await mintToken(adminUserId, { label: 'Écriture', writeEnabled: true })
    ).secret;
    readSecret = (await mintToken(adminUserId, { label: 'Lecture' })).secret;

    const campus = await prisma.campus.create({
      data: { name: `WriteCampus-${stamp}`, timezone: 'Europe/Paris' },
    });
    campusId = campus.id;

    const event = await prisma.event.create({
      data: {
        titre: `WriteEvent-${stamp}`,
        publicName: 'Coding Club de test',
        date: new Date(Date.now() + 30 * 86_400_000),
        campusId,
      },
    });
    eventId = event.id;
  });

  afterAll(async () => {
    try {
      await prisma.adminApi_Call.deleteMany({
        where: { actorUserId: adminUserId },
      });
      await prisma.eventConfig_Module.deleteMany({ where: { eventId } });
      await prisma.event.deleteMany({ where: { campusId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
      await prisma.bauth_user.delete({ where: { id: adminUserId } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('applies only the fields it was given, leaving the rest alone', async () => {
    const { status, payload } = await call(postConfig, writeSecret, {
      eventId,
      endDate: '2027-03-15',
    });

    expect(status).toBe(200);
    expect(payload.applied).toBe(true);
    expect(payload.before).toMatchObject({ endDate: '' });
    expect(payload.after).toMatchObject({
      endDate: '2027-03-15',
      // Untouched by a call that never mentioned it: this is what patch
      // semantics buy, and what a full replacement would have wiped.
      publicName: 'Coding Club de test',
    });
  });

  it('writes the change onto the audit row, before and after', async () => {
    const row = await prisma.adminApi_Call.findFirst({
      where: { actorUserId: adminUserId, operation: 'write_event_config' },
      orderBy: { createdAt: 'desc' },
    });

    expect(row?.status).toBe(200);
    expect(row?.before).toMatchObject({ endDate: '' });
    expect(row?.after).toMatchObject({ endDate: '2027-03-15' });
  });

  it('is safe to repeat: the same call lands on the same state', async () => {
    const { status, payload } = await call(postConfig, writeSecret, {
      eventId,
      endDate: '2027-03-15',
    });

    expect(status).toBe(200);
    expect(payload.before).toEqual(payload.after);
  });

  it('refuses a read-only token, and logs the refusal', async () => {
    const { status, payload } = await call(postConfig, readSecret, {
      eventId,
      endDate: '2027-04-01',
    });

    expect(status).toBe(403);
    expect(String(payload.error)).toContain('lecture seule');
    expect(
      await prisma.adminApi_Call.count({
        where: { actorUserId: adminUserId, status: 403 },
      }),
    ).toBeGreaterThan(0);
  });

  it('refuses an unknown parameter rather than ignoring it', async () => {
    const { status } = await call(postConfig, writeSecret, {
      eventId,
      endDated: '2027-04-01',
    });
    expect(status).toBe(400);
  });

  it('refuses an unknown section, instead of reading it as "turn it off"', async () => {
    const { status, payload } = await call(postConfig, writeSecret, {
      eventId,
      modules: ['inscrits', 'emargements'],
    });

    expect(status).toBe(400);
    expect(String(payload.error)).toContain('emargements');
  });

  // The same class of mistake as the section above, except the judgement comes
  // from a service this tier shares with the admin pages, which says "your
  // request is at fault" with `error(400, ...)` rather than with one of this
  // tier's own refusals. That used to reach the caller as "Erreur interne",
  // leaving a model nothing to correct and booking an ordinary stale id as a Jump
  // bug in the log, where `ops_api_usage` reports 5xx as something to go and look
  // at. Nothing is mutated on this path, so the fixture survives it.
  it('hands back a missing feedback form as a refusal, not an internal error', async () => {
    const { status, payload } = await call(postFeedbackForm, writeSecret, {
      eventId,
      formId: `form-does-not-exist-${stamp}`,
    });

    expect(status).toBe(400);
    expect(String(payload.error)).toContain('Formulaire');

    const row = await prisma.adminApi_Call.findFirst({
      where: {
        actorUserId: adminUserId,
        operation: 'write_event_feedback_form',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.status).toBe(400);
  });

  it('plans a bulk change before applying it, and applies it on the digest', async () => {
    const filter = { modules: ['inscrits'], campus: `WriteCampus-${stamp}` };

    const dry = await call(postBulkModules, writeSecret, filter);
    expect(dry.status).toBe(200);
    expect(dry.payload.applied).toBe(false);
    const plan = dry.payload.plan as { changes: { eventId: string }[] };
    expect(plan.changes.map((c) => c.eventId)).toContain(eventId);
    expect(dry.payload.planDigest).toBe(planDigest(plan));

    const applied = await call(postBulkModules, writeSecret, {
      ...filter,
      planDigest: dry.payload.planDigest,
    });
    expect(applied.status).toBe(200);
    expect(applied.payload.applied).toBe(true);

    const modules = await prisma.eventConfig_Module.findMany({
      where: { eventId },
      select: { moduleKey: true },
    });
    expect(modules.map((m) => m.moduleKey)).toEqual(['inscrits']);
  });

  // The reason the digest is recomputed rather than stored: replaying it after
  // the change has landed must not silently redo anything.
  it('refuses a stale digest, naming the fresh one', async () => {
    const filter = { modules: ['inscrits'], campus: `WriteCampus-${stamp}` };
    const { status, payload } = await call(postBulkModules, writeSecret, {
      ...filter,
      planDigest: 'obviously-not-it',
    });

    expect(status).toBe(409);
    expect(String(payload.error)).toContain('empreinte');
  });
});
