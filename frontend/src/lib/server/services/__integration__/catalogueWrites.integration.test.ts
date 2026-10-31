/**
 * The writes that replaced three admin pages (#483): the template a
 * transactional mail sends from, the centres d'intérêt, and a campus's
 * configuration. Each page wrote whatever its form validated; these refuse what
 * would fail later in silence, which is what is pinned here: a login mail with
 * no code, an interest deleted off every talent, a campus removed from under
 * the rows that reference it.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { createAdminAccount } from './adminApiAccount';
import { mintToken } from '$lib/server/adminApi/tokens';
import { adminApiWrite } from '$lib/server/adminApi/route';
import {
  getEmailActions,
  getInterests,
  getCampusOverview,
} from '$lib/server/services/adminStats/configuration';
import { loadBroadcastTemplate } from '$lib/server/services/broadcast/templates';

const postEmailAction = adminApiWrite('write_email_action');
const postInterest = adminApiWrite('write_interest');
const postCampus = adminApiWrite('write_campus');

/** Calls a handler the way SvelteKit would, with a bearer and a JSON body. */
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

describe('catalogue writes (integration)', () => {
  const stamp = Date.now();
  let adminUserId = '';
  let secret = '';
  const templateIds: string[] = [];
  const interestIds: string[] = [];
  const campusNames: string[] = [];
  let previousOtpTemplate: string | null = null;

  beforeAll(async () => {
    assertTestDatabase();
    const admin = await createAdminAccount(`catalogue.${stamp}@epitech.eu`);
    adminUserId = admin.id;
    secret = (
      await mintToken(adminUserId, { label: 'Écriture', writeEnabled: true })
    ).secret;
    previousOtpTemplate =
      (
        await prisma.emailActionMapping.findUnique({
          where: { actionKey: 'otp_talent' },
        })
      )?.templateId ?? null;
  });

  afterAll(async () => {
    try {
      if (previousOtpTemplate) {
        await prisma.emailActionMapping.update({
          where: { actionKey: 'otp_talent' },
          data: { templateId: previousOtpTemplate },
        });
      }
      await prisma.messageTemplate.deleteMany({
        where: { id: { in: templateIds } },
      });
      await prisma.interest.deleteMany({ where: { id: { in: interestIds } } });
      await prisma.campus.deleteMany({ where: { name: { in: campusNames } } });
      await prisma.adminApi_Call.deleteMany({
        where: { actorUserId: adminUserId },
      });
      await prisma.bauth_user.delete({ where: { id: adminUserId } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  async function template(
    name: string,
    body: string,
    channel: 'mail' | 'sms' = 'mail',
  ) {
    const row = await prisma.messageTemplate.create({
      data: {
        name: `${name} ${stamp}`,
        channel,
        subject: channel === 'mail' ? 'Jump' : null,
        body,
      },
      select: { id: true },
    });
    templateIds.push(row.id);
    return row.id;
  }

  describe('write_email_action', () => {
    it('links a login mail only to a template carrying the code, and never unlinks it', async () => {
      const noCode = await template('Sans code', 'Bonjour {{prenom}}.');
      const withCode = await template('Avec code', 'Ton code : {{otp_code}}');
      const sms = await template('SMS', 'Code {{otp_code}}', 'sms');

      const refusedNoCode = await call(postEmailAction, secret, {
        emailAction: 'otp_talent',
        messageTemplateId: noCode,
      });
      expect(refusedNoCode.status).toBe(400);
      expect(String(refusedNoCode.payload.error)).toContain('{{otp_code}}');

      const refusedSms = await call(postEmailAction, secret, {
        emailAction: 'otp_talent',
        messageTemplateId: sms,
      });
      expect(refusedSms.status).toBe(400);

      const linked = await call(postEmailAction, secret, {
        emailAction: 'otp_talent',
        messageTemplateId: withCode,
      });
      expect(linked.status).toBe(200);
      expect(linked.payload.after).toMatchObject({
        action: 'otp_talent',
        template: { templateId: withCode },
      });

      const unlinked = await call(postEmailAction, secret, {
        emailAction: 'otp_talent',
        messageTemplateId: null,
      });
      expect(unlinked.status).toBe(400);

      const read = (await getEmailActions()).actions.value.find(
        (a) => a.action === 'otp_talent',
      );
      expect(read).toMatchObject({
        template: { templateId: withCode },
        missingRequiredVariables: [],
      });
    });

    // Re-pointing an action unlinks the template it left, which still carries
    // a login code: it must not become something a bulk send can pick.
    it('keeps a template carrying a login code out of bulk sends once unlinked', async () => {
      const first = await template('Code un', 'Code : {{otp_code}}');
      const second = await template('Code deux', 'Code : {{otp_code}} !');
      for (const id of [first, second]) {
        expect(
          (
            await call(postEmailAction, secret, {
              emailAction: 'otp_talent',
              messageTemplateId: id,
            })
          ).status,
        ).toBe(200);
      }
      expect(await loadBroadcastTemplate(first)).toBeNull();

      const plain = await template('Annonce', 'Bonjour {{prenom}}.');
      expect(await loadBroadcastTemplate(plain)).not.toBeNull();
    });

    it('unlinks a mail nothing depends on', async () => {
      const welcome = await template(
        'Bienvenue',
        'Bienvenue {{parent_prenom}}',
      );
      await call(postEmailAction, secret, {
        emailAction: 'parent_welcome',
        messageTemplateId: welcome,
      });
      const unlinked = await call(postEmailAction, secret, {
        emailAction: 'parent_welcome',
        messageTemplateId: null,
      });
      expect(unlinked.status).toBe(200);
      expect(unlinked.payload.after).toMatchObject({ template: null });
    });
  });

  describe('write_interest', () => {
    it('creates one last of its kind, renames it, and archives it off onboarding only', async () => {
      const created = await call(postInterest, secret, {
        kind: 'tech',
        label: `Robotique ${stamp}`,
        emoji: '🤖',
      });
      expect(created.status).toBe(200);
      const interestId = (created.payload.after as { interestId: string })
        .interestId;
      interestIds.push(interestId);

      const renamed = await call(postInterest, secret, {
        interestId,
        label: `Robots ${stamp}`,
      });
      expect(renamed.payload.after).toMatchObject({
        label: `Robots ${stamp}`,
        emoji: '🤖',
        archived: false,
      });

      const archived = await call(postInterest, secret, {
        interestId,
        archived: true,
      });
      expect(archived.payload.after).toMatchObject({ archived: true });
      const read = (await getInterests()).interests.value.find(
        (i) => i.interestId === interestId,
      );
      expect(read).toMatchObject({ archived: true });
      const offered = await prisma.interest.findMany({
        where: { kind: 'tech', archivedAt: null },
        select: { id: true },
      });
      expect(offered.map((i) => i.id)).not.toContain(interestId);
    });

    it('refuses a label another holds, a change of kind, and a creation without its kind', async () => {
      const first = await call(postInterest, secret, {
        kind: 'general',
        label: `Cuisine ${stamp}`,
      });
      const firstId = (first.payload.after as { interestId: string })
        .interestId;
      interestIds.push(firstId);

      const twin = await call(postInterest, secret, {
        kind: 'general',
        label: `cuisine ${stamp}`,
      });
      expect(twin.status).toBe(400);

      const moved = await call(postInterest, secret, {
        interestId: firstId,
        kind: 'tech',
      });
      expect(moved.status).toBe(400);

      const kindless = await call(postInterest, secret, {
        label: `Danse ${stamp}`,
      });
      expect(kindless.status).toBe(400);
    });
  });

  describe('write_campus', () => {
    it('creates a campus, patches what it is given, and reads it back', async () => {
      const name = `Campus API ${stamp}`;
      campusNames.push(name);

      const created = await call(postCampus, secret, {
        campus: name,
        departement: '59',
      });
      expect(created.status).toBe(200);
      expect(created.payload.after).toMatchObject({
        campus: name,
        timezone: 'Europe/Paris',
        departement: '59',
        externalName: null,
      });

      const patched = await call(postCampus, secret, {
        campus: name.toLowerCase(),
        timezone: 'Indian/Reunion',
        contactAddress: 'contact@epitech.eu',
      });
      expect(patched.status).toBe(200);
      expect(patched.payload.after).toMatchObject({
        campus: name,
        departement: '59',
        timezone: 'Indian/Reunion',
        contactAddress: 'contact@epitech.eu',
      });

      const row = (await getCampusOverview()).campuses.value.find(
        (c) => c.campus === name,
      );
      expect(row?.configuration).toMatchObject({
        timezone: 'Indian/Reunion',
        departement: '59',
        academie: expect.any(String),
        contactAddress: 'contact@epitech.eu',
      });
    });

    it('refuses an unknown time zone and an unknown département', async () => {
      const name = `Campus Refus ${stamp}`;
      const zone = await call(postCampus, secret, {
        campus: name,
        timezone: 'Europe/Atlantis',
      });
      expect(zone.status).toBe(400);
      const departement = await call(postCampus, secret, {
        campus: name,
        departement: '999',
      });
      expect(departement.status).toBe(400);
      expect(await prisma.campus.count({ where: { name } })).toBe(0);
    });

    it('removes a campus nothing references, and refuses one an event does', async () => {
      const empty = `Campus Vide ${stamp}`;
      const used = `Campus Utilisé ${stamp}`;
      campusNames.push(empty, used);
      await call(postCampus, secret, { campus: empty });
      await call(postCampus, secret, { campus: used });
      const usedRow = await prisma.campus.findUniqueOrThrow({
        where: { name: used },
      });
      const event = await prisma.event.create({
        data: {
          titre: `CampusRef-${stamp}`,
          date: new Date(Date.now() + 30 * 86_400_000),
          campusId: usedRow.id,
        },
      });

      const refused = await call(postCampus, secret, {
        campus: used,
        remove: true,
      });
      expect(refused.status).toBe(400);
      expect(String(refused.payload.error)).toContain('événements (1)');

      const removed = await call(postCampus, secret, {
        campus: empty,
        remove: true,
      });
      expect(removed.status).toBe(200);
      expect(await prisma.campus.count({ where: { name: empty } })).toBe(0);

      await prisma.event.delete({ where: { id: event.id } });
    });
  });
});
