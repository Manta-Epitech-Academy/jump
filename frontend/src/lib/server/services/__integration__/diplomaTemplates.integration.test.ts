/**
 * Authoring a certificate over the API, through the wrapper rather than around
 * it, so what is under test includes the audit row that makes a mutation
 * accountable.
 *
 * The refusals are the load-bearing part. A certificate design is stored HTML and
 * CSS that a real Chrome executes inside the cluster, so what must not be
 * possible is more interesting here than what must.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { createAdminAccount } from './adminApiAccount';
import { mintToken } from '$lib/server/adminApi/tokens';
import { adminApiWrite } from '$lib/server/adminApi/route';

const postTemplate = adminApiWrite('write_diploma_template');
const postEventTemplate = adminApiWrite('write_event_diploma_template');
const postInscritsOptions = adminApiWrite('write_event_inscrits_options');

async function call(
  handler: RequestHandler,
  secret: string,
  body: unknown,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const request = new Request('http://localhost/api/admin/write/x', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`,
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

/** A minimal design that renders. */
const VALID = {
  styleCss: '.title { font-family: Anton, sans-serif; font-size: 40px; }',
  bodyHtml:
    '<h1 class="title">Certificat de test</h1><p>{prenom} {nom} - {ville}</p><div>{signatures}</div>',
  pageWidthPx: 1123,
  pageHeightPx: 794,
};

describe('certificate authoring (integration)', () => {
  const stamp = Date.now();
  const code = `test-cert-${stamp}`;
  let adminUserId = '';
  let secret = '';
  let eventId = '';
  let campusId = '';

  beforeAll(async () => {
    assertTestDatabase();
    const admin = await createAdminAccount(`cert.admin.${stamp}@epitech.eu`);
    adminUserId = admin.id;
    secret = (
      await mintToken(adminUserId, { label: 'Écriture', writeEnabled: true })
    ).secret;

    const campus = await prisma.campus.create({
      data: { name: `CertCampus-${stamp}`, timezone: 'Europe/Paris' },
    });
    campusId = campus.id;
    const event = await prisma.event.create({
      data: {
        titre: `CertEvent-${stamp}`,
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
      await prisma.event.deleteMany({ where: { campusId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
      await prisma.diploma_Template.deleteMany({ where: { code } });
      await prisma.bauth_user.delete({ where: { id: adminUserId } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('creates a certificate, and reports it as new', async () => {
    const { status, payload } = await call(postTemplate, secret, {
      code,
      label: 'Certificat de test',
      ...VALID,
    });

    expect(status).toBe(200);
    expect(payload.applied).toBe(true);
    // Nothing existed before, so there is nothing to restore it to.
    expect(payload.before).toBeNull();
    expect(payload.after).toMatchObject({ code, label: 'Certificat de test' });
  }, 60_000);

  it('records the previous design in the audit row, so an edit is recoverable', async () => {
    const { payload } = await call(postTemplate, secret, {
      code,
      label: 'Certificat de test v2',
      ...VALID,
      bodyHtml: '<h1 class="title">Version deux</h1><p>{prenom}</p>',
    });

    expect(payload.applied).toBe(true);
    expect(payload.before).toMatchObject({ label: 'Certificat de test' });
    expect(payload.after).toMatchObject({ label: 'Certificat de test v2' });

    const row = await prisma.adminApi_Call.findFirst({
      where: { operation: 'write_diploma_template', status: 200 },
      orderBy: { createdAt: 'desc' },
      select: { before: true, after: true },
    });
    // The full previous text, not a digest: it is what makes a bad edit undoable.
    expect(JSON.stringify(row?.before)).toContain('Certificat de test');
    expect(JSON.stringify(row?.after)).toContain('Version deux');
  }, 60_000);

  it('is safe to repeat: the same design twice reports no change', async () => {
    const body = { code, label: 'Certificat de test v2', ...VALID };
    await call(postTemplate, secret, body);
    const { payload } = await call(postTemplate, secret, body);
    expect(payload.before).toEqual(payload.after);
  }, 60_000);

  it('refuses a misspelled placeholder, and stores nothing', async () => {
    // It would print as `{dateDbut}` on paper, which is why this is a refusal and
    // not something the renderer carries through.
    const { status, payload } = await call(postTemplate, secret, {
      code: `${code}-typo`,
      label: 'Avec une coquille',
      ...VALID,
      bodyHtml: '<p>Réalisé le {dateDbut}</p>',
    });

    expect(status).toBe(400);
    expect(String(payload.error)).toContain('{dateDbut}');
    expect(
      await prisma.diploma_Template.findUnique({
        where: { code: `${code}-typo` },
      }),
    ).toBeNull();
  }, 60_000);

  it('refuses anything that would fetch, and says why', async () => {
    for (const design of [
      { styleCss: "@import url('http://evil/x.css');" },
      { styleCss: '.a { background: url(http://evil/x.png); }' },
      { bodyHtml: '<p style="background: url(http://evil/x.png)">x</p>' },
      { bodyHtml: '<script>fetch("http://evil")</script><p>x</p>' },
      { bodyHtml: '<p onclick="fetch(1)">x</p>' },
    ]) {
      const { status, payload } = await call(postTemplate, secret, {
        code: `${code}-remote`,
        label: 'Distant',
        ...VALID,
        ...design,
      });
      expect(status, JSON.stringify(design)).toBe(400);
      expect(String(payload.error).length).toBeGreaterThan(30);
    }
    expect(
      await prisma.diploma_Template.findUnique({
        where: { code: `${code}-remote` },
      }),
    ).toBeNull();
  }, 60_000);

  it('attaches a certificate to an event and detaches it again', async () => {
    const template = await prisma.diploma_Template.findUniqueOrThrow({
      where: { code },
      select: { id: true },
    });

    const attached = await call(postEventTemplate, secret, {
      eventId,
      templateId: template.id,
    });
    expect(attached.status).toBe(200);
    expect(attached.payload.after).toMatchObject({ certificate: { code } });

    // Omitting the id is how the event stops issuing one: patch semantics cannot
    // express "clear it", which is why this is its own operation.
    const detached = await call(postEventTemplate, secret, { eventId });
    expect(detached.payload.after).toMatchObject({ certificate: null });
  });

  it('refuses to delete a certificate an event still issues', async () => {
    const template = await prisma.diploma_Template.findUniqueOrThrow({
      where: { code },
      select: { id: true },
    });
    await call(postEventTemplate, secret, {
      eventId,
      templateId: template.id,
    });

    // There is no delete operation by design; this is the schema-level backstop
    // for a hand-deletion, so an event is never left silently issuing nothing.
    await expect(
      prisma.diploma_Template.delete({ where: { id: template.id } }),
    ).rejects.toThrow();

    await call(postEventTemplate, secret, { eventId });
  });

  it('refuses inscrits sub-options when the section is off', async () => {
    const { status, payload } = await call(postInscritsOptions, secret, {
      eventId,
      showStatutColumn: true,
    });
    expect(status).toBe(400);
    expect(String(payload.error)).toContain('Inscrits');
  });

  it('changes an inscrits sub-option once the section is on', async () => {
    // The field that used to be reachable through no write at all.
    await prisma.eventConfig_Module.create({
      data: { eventId, moduleKey: 'inscrits' },
    });

    const { status, payload } = await call(postInscritsOptions, secret, {
      eventId,
      showStatutColumn: true,
    });
    expect(status).toBe(200);
    expect(payload.before).toMatchObject({ showStatutColumn: false });
    expect(payload.after).toMatchObject({ showStatutColumn: true });
  });
});
