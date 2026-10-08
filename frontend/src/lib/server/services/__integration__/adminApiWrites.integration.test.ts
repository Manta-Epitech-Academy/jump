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
import { getEventTemplates } from '$lib/server/services/adminStats/configuration';

const postConfig = adminApiWrite('write_event_config');
const postBulk = adminApiWrite('bulk_event_config');
const postTemplate = adminApiWrite('write_event_template');
const postRequestSync = adminApiWrite('ops_request_sync');
const postReleasePruneHold = adminApiWrite('ops_release_prune_hold');

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
      await prisma.sync_Request.deleteMany();
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

  // The same class of mistake as the section above: an id nothing holds is the
  // caller's to correct, so it comes back as a refusal naming where a valid one
  // comes from, never as "Erreur interne", which would leave a model nothing to
  // correct and book an ordinary stale id as a Jump bug in the log, where
  // `ops_api_usage` reports 5xx as something to go and look at. Nothing is
  // mutated on this path, so the fixture survives it.
  it('hands back a missing feedback form as a refusal, not an internal error', async () => {
    const { status, payload } = await call(postConfig, writeSecret, {
      eventId,
      feedbackFormId: `form-does-not-exist-${stamp}`,
    });

    expect(status).toBe(400);
    expect(String(payload.error)).toContain('Formulaire');
    expect(String(payload.error)).toContain('config_feedback_forms');

    const row = await prisma.adminApi_Call.findFirst({
      where: { actorUserId: adminUserId, operation: 'write_event_config' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.status).toBe(400);
  });

  // The activation rule reaching the path that writes the name and the gate in
  // one call. Patch semantics carry the STORED activation into a call that only
  // meant to edit a name, so without the rule this could take a live event down
  // to no public name and leave it live: in the dev switcher, under its raw
  // Salesforce title.
  it('refuses to strip the public name of an event that stays visible', async () => {
    const live = await prisma.event.create({
      data: {
        titre: `WriteLive-${stamp}`,
        publicName: 'Coding Club visible',
        date: new Date(Date.now() + 30 * 86_400_000),
        endDate: new Date(Date.now() + 31 * 86_400_000),
        campusId,
        devActivatedAt: new Date(),
        modules: { create: { moduleKey: 'inscrits' } },
      },
    });

    const { status, payload } = await call(postConfig, writeSecret, {
      eventId: live.id,
      publicName: '',
    });

    expect(status).toBe(400);
    expect(String(payload.error)).toContain('nom public');

    // Refused before the transaction, so the event is untouched rather than
    // half-written.
    const after = await prisma.event.findUniqueOrThrow({
      where: { id: live.id },
    });
    expect(after.publicName).toBe('Coding Club visible');
    expect(after.devActivatedAt).not.toBeNull();

    await prisma.eventConfig_Module.deleteMany({ where: { eventId: live.id } });
    await prisma.event.delete({ where: { id: live.id } });
  });

  // And the way through, so the refusal above is a detour rather than a dead
  // end: hide it and rename it in the same call. The rule is about what may be
  // VISIBLE, never about what may be named, and it is judged on the
  // configuration being saved.
  it('accepts clearing the public name in the call that hides the event', async () => {
    const hidden = await prisma.event.create({
      data: {
        titre: `WriteHidden-${stamp}`,
        publicName: 'Coding Club à masquer',
        date: new Date(Date.now() + 30 * 86_400_000),
        endDate: new Date(Date.now() + 31 * 86_400_000),
        campusId,
        devActivatedAt: new Date(),
        modules: { create: { moduleKey: 'inscrits' } },
      },
    });

    const { status } = await call(postConfig, writeSecret, {
      eventId: hidden.id,
      visible: false,
      publicName: '',
    });

    expect(status).toBe(200);
    const after = await prisma.event.findUniqueOrThrow({
      where: { id: hidden.id },
    });
    expect(after.publicName).toBeNull();
    expect(after.devActivatedAt).toBeNull();

    await prisma.eventConfig_Module.deleteMany({
      where: { eventId: hidden.id },
    });
    await prisma.event.delete({ where: { id: hidden.id } });
  });

  // The reason the facets are one write: configuring a blank event and showing
  // it used to take four tools in an order the caller had to guess, and the
  // activation was judged on what was stored before the others landed.
  it('configures a blank event and shows it in one call', async () => {
    const blank = await prisma.event.create({
      data: {
        titre: `WriteBlank-${stamp}`,
        date: new Date(Date.now() + 30 * 86_400_000),
        campusId,
      },
    });

    const { status, payload } = await call(postConfig, writeSecret, {
      eventId: blank.id,
      publicName: 'Stage de seconde',
      endDate: '2027-05-07',
      modules: ['inscrits', 'emargement'],
      moduleSettings: { inscrits: { showStatutColumn: true } },
      visible: true,
    });

    expect(status).toBe(200);
    expect(payload.before).toMatchObject({ visibleInDevWorkspace: false });
    expect(payload.after).toMatchObject({
      publicName: 'Stage de seconde',
      endDate: '2027-05-07',
      modules: ['emargement', 'inscrits'],
      moduleSettings: { inscrits: { showStatutColumn: true } },
      visibleInDevWorkspace: true,
    });

    await prisma.eventConfig_Module.deleteMany({
      where: { eventId: blank.id },
    });
    await prisma.event.delete({ where: { id: blank.id } });
  });

  // Applying a preset is copying what config_event_templates returns, since no
  // write applies one by name. So what that read returns has to be what the
  // event write takes: the sub-options of a section that has none come back as
  // an empty object, and the references the preset points at come back too.
  it('applies a saved preset to an event by copying what the preset read returns', async () => {
    const grid = await prisma.closing_Template.create({
      data: { key: `preset_grid_${stamp}`, label: 'Grille du modèle' },
    });
    const source = await prisma.event.create({
      data: {
        titre: `WritePresetSource-${stamp}`,
        date: new Date(Date.now() + 30 * 86_400_000),
        campusId,
      },
    });
    const target = await prisma.event.create({
      data: {
        titre: `WritePresetTarget-${stamp}`,
        date: new Date(Date.now() + 30 * 86_400_000),
        campusId,
      },
    });
    const name = `Modèle copié ${stamp}`;

    const configured = await call(postConfig, writeSecret, {
      eventId: source.id,
      modules: ['inscrits', 'closings'],
      moduleSettings: { inscrits: { showStatutColumn: true } },
      closingTemplateId: grid.id,
    });
    expect(configured.status).toBe(200);
    expect(
      (await call(postTemplate, writeSecret, { eventId: source.id, name }))
        .status,
    ).toBe(200);

    const preset = (await getEventTemplates()).templates.value.find(
      (template) => template.name === name,
    )!;
    expect(preset).toMatchObject({
      moduleSettings: { inscrits: { showStatutColumn: true }, closings: {} },
      closingTemplateId: grid.id,
      diplomaTemplateId: null,
    });

    const applied = await call(postConfig, writeSecret, {
      eventId: target.id,
      modules: preset.modules,
      moduleSettings: preset.moduleSettings,
      shownStatuses: preset.shownStatuses,
      feedbackFormId: preset.feedbackFormId,
      diplomaTemplateId: preset.diplomaTemplateId,
      closingTemplateId: preset.closingTemplateId,
    });
    expect(applied.status).toBe(200);
    expect(applied.payload.after).toMatchObject({
      modules: ['closings', 'inscrits'],
      moduleSettings: { inscrits: { showStatutColumn: true } },
      closingTemplateId: grid.id,
    });

    await prisma.eventConfig_Template.delete({ where: { name } });
    await prisma.event.deleteMany({
      where: { id: { in: [source.id, target.id] } },
    });
    await prisma.closing_Template.delete({ where: { id: grid.id } });
  });

  // All or nothing: a refusal on one facet leaves every other facet of the same
  // call unwritten, which is what four separate tools could never promise.
  it('writes nothing when the activation it asks for is refused', async () => {
    const blank = await prisma.event.create({
      data: {
        titre: `WriteRefused-${stamp}`,
        date: new Date(Date.now() + 30 * 86_400_000),
        campusId,
      },
    });

    const { status, payload } = await call(postConfig, writeSecret, {
      eventId: blank.id,
      publicName: 'Stage sans fin',
      modules: ['inscrits'],
      visible: true,
    });

    expect(status).toBe(400);
    expect(String(payload.error)).toContain('date de fin');
    const after = await prisma.event.findUniqueOrThrow({
      where: { id: blank.id },
      include: { modules: true },
    });
    expect(after.publicName).toBeNull();
    expect(after.modules).toEqual([]);
    expect(after.devActivatedAt).toBeNull();

    await prisma.event.delete({ where: { id: blank.id } });
  });

  // A section's options exist only while the section does, so naming them alone
  // is refused, and naming them with the section that enables them is not.
  it('sets a section option only with the section enabled by the same save', async () => {
    const event = await prisma.event.create({
      data: {
        titre: `WriteOptions-${stamp}`,
        date: new Date(Date.now() + 30 * 86_400_000),
        campusId,
      },
    });
    const options = { inscrits: { showStatutColumn: true } };

    const refused = await call(postConfig, writeSecret, {
      eventId: event.id,
      moduleSettings: options,
    });
    expect(refused.status).toBe(400);
    expect(String(refused.payload.error)).toContain('inscrits');

    const accepted = await call(postConfig, writeSecret, {
      eventId: event.id,
      modules: ['inscrits'],
      moduleSettings: options,
    });
    expect(accepted.status).toBe(200);
    expect(accepted.payload.after).toMatchObject({ moduleSettings: options });

    await prisma.eventConfig_Module.deleteMany({
      where: { eventId: event.id },
    });
    await prisma.event.delete({ where: { id: event.id } });
  });

  // Null and omitted are two different instructions under patch semantics: one
  // detaches, the other leaves the reference alone.
  it('detaches a reference on null and keeps it when omitted', async () => {
    const grid = await prisma.closing_Template.create({
      data: { key: `write_grid_${stamp}`, label: 'Grille de test' },
    });
    const event = await prisma.event.create({
      data: {
        titre: `WriteGrid-${stamp}`,
        date: new Date(Date.now() + 30 * 86_400_000),
        campusId,
        closingTemplateId: grid.id,
      },
    });

    const kept = await call(postConfig, writeSecret, {
      eventId: event.id,
      cohortNoun: 'stagiaire',
    });
    expect(kept.payload.after).toMatchObject({ closingTemplateId: grid.id });

    const detached = await call(postConfig, writeSecret, {
      eventId: event.id,
      closingTemplateId: null,
    });
    expect(detached.status).toBe(200);
    expect(detached.payload.after).toMatchObject({ closingTemplateId: null });

    await prisma.event.delete({ where: { id: event.id } });
    await prisma.closing_Template.delete({ where: { id: grid.id } });
  });

  // Replaced whole and in order, and left alone by a call that does not name it.
  it('replaces the activities an event offers, in the order given', async () => {
    const host = await prisma.workshop_Instance.create({
      data: {
        slug: `write-host-${stamp}`,
        baseUrl: 'https://host.example.org',
      },
    });
    const [pacman, snake] = await Promise.all(
      ['pacman', 'snake'].map((name) =>
        prisma.workshop_Activity.create({
          data: {
            slug: `write-${name}-${stamp}`,
            instanceId: host.id,
            label: name,
          },
        }),
      ),
    );
    const event = await prisma.event.create({
      data: {
        titre: `WriteWorkshops-${stamp}`,
        date: new Date(Date.now() + 30 * 86_400_000),
        campusId,
      },
    });

    const { status, payload } = await call(postConfig, writeSecret, {
      eventId: event.id,
      workshops: [
        { slug: snake.slug, durationMinutes: 90 },
        { slug: pacman.slug, durationMinutes: 60, labelOverride: 'Pacman' },
      ],
    });
    expect(status).toBe(200);
    expect(payload.after).toMatchObject({
      workshops: [
        { slug: snake.slug, durationMinutes: 90, labelOverride: null },
        { slug: pacman.slug, durationMinutes: 60, labelOverride: 'Pacman' },
      ],
    });

    const untouched = await call(postConfig, writeSecret, {
      eventId: event.id,
      cohortNoun: 'participant',
    });
    expect(
      (untouched.payload.after as { workshops: unknown[] }).workshops,
    ).toHaveLength(2);

    const unknown = await call(postConfig, writeSecret, {
      eventId: event.id,
      workshops: [{ slug: `nowhere-${stamp}`, durationMinutes: 30 }],
    });
    expect(unknown.status).toBe(400);
    expect(String(unknown.payload.error)).toContain('config_workshops');

    await prisma.eventConfig_Workshop.deleteMany({
      where: { eventId: event.id },
    });
    await prisma.event.delete({ where: { id: event.id } });
    await prisma.workshop_Activity.deleteMany({
      where: { id: { in: [pacman.id, snake.id] } },
    });
    await prisma.workshop_Instance.delete({ where: { id: host.id } });
  });

  it('plans a bulk change before applying it, and applies it on the digest', async () => {
    const filter = { modules: ['inscrits'], campus: `WriteCampus-${stamp}` };

    const dry = await call(postBulk, writeSecret, filter);
    expect(dry.status).toBe(200);
    expect(dry.payload.applied).toBe(false);
    const plan = dry.payload.plan as { changes: { eventId: string }[] };
    expect(plan.changes.map((c) => c.eventId)).toContain(eventId);
    expect(dry.payload.planDigest).toBe(planDigest(plan));

    const applied = await call(postBulk, writeSecret, {
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
    const { status, payload } = await call(postBulk, writeSecret, {
      ...filter,
      planDigest: 'obviously-not-it',
    });

    expect(status).toBe(409);
    expect(String(payload.error)).toContain('empreinte');
  });

  // The facets a bulk change used to split across four tools, in one plan:
  // sections and visibility together, judged on each event as the call leaves
  // it, so an event shown by this call only needs the sections it gives.
  it('gives a series its sections and shows it in one plan, naming what cannot be shown', async () => {
    const bulkCampus = await prisma.campus.create({
      data: { name: `BulkCampus-${stamp}`, timezone: 'Europe/Paris' },
    });
    const soon = new Date(Date.now() + 20 * 86_400_000);
    const ready = await prisma.event.create({
      data: {
        titre: `BulkReady-${stamp}`,
        publicName: 'Coding Club prêt',
        date: soon,
        endDate: soon,
        campusId: bulkCampus.id,
      },
    });
    const noEnd = await prisma.event.create({
      data: {
        titre: `BulkNoEnd-${stamp}`,
        publicName: 'Coding Club sans fin',
        date: soon,
        campusId: bulkCampus.id,
      },
    });
    const past = await prisma.event.create({
      data: {
        titre: `BulkPast-${stamp}`,
        publicName: 'Coding Club passé',
        date: new Date(Date.now() - 60 * 86_400_000),
        endDate: new Date(Date.now() - 60 * 86_400_000),
        campusId: bulkCampus.id,
      },
    });
    const patch = {
      campus: bulkCampus.name,
      onlyUpcoming: true,
      modules: ['inscrits'],
      visible: true,
    };

    const dry = await call(postBulk, writeSecret, patch);
    expect(dry.status).toBe(200);
    const plan = dry.payload.plan as {
      changes: { eventId: string; visible?: unknown }[];
      skipped: { eventId: string; reason: string }[];
    };
    expect(plan.changes.map((c) => c.eventId).sort()).toEqual(
      [ready.id, noEnd.id].sort(),
    );
    expect(plan.changes.find((c) => c.eventId === ready.id)?.visible).toEqual({
      from: false,
      to: true,
    });
    expect(plan.skipped).toEqual([
      expect.objectContaining({
        eventId: noEnd.id,
        reason: expect.stringContaining('date de fin'),
      }),
    ]);

    const applied = await call(postBulk, writeSecret, {
      ...patch,
      planDigest: dry.payload.planDigest,
    });
    expect(applied.status).toBe(200);

    const rows = await prisma.event.findMany({
      where: { campusId: bulkCampus.id },
      select: { id: true, devActivatedAt: true, modules: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(ready.id)?.devActivatedAt).not.toBeNull();
    expect(byId.get(ready.id)?.modules).toHaveLength(1);
    expect(byId.get(noEnd.id)?.devActivatedAt).toBeNull();
    expect(byId.get(noEnd.id)?.modules).toHaveLength(1);
    expect(byId.get(past.id)?.modules).toHaveLength(0);

    await prisma.eventConfig_Module.deleteMany({
      where: { eventId: { in: [ready.id, noEnd.id, past.id] } },
    });
    await prisma.event.deleteMany({ where: { campusId: bulkCampus.id } });
    await prisma.campus.delete({ where: { id: bulkCampus.id } });
  });

  // Its gate is already on, so nothing about it changes, and that is exactly
  // why the plan has to say it: without a section it shows nothing, and a plan
  // silent about it read as having shown it.
  it('names an activated event left with no section among those it cannot show', async () => {
    const bulkCampus = await prisma.campus.create({
      data: { name: `BulkArmed-${stamp}`, timezone: 'Europe/Paris' },
    });
    const soon = new Date(Date.now() + 20 * 86_400_000);
    const armed = await prisma.event.create({
      data: {
        titre: `BulkArmed-${stamp}`,
        publicName: 'Coding Club activé',
        date: soon,
        endDate: soon,
        devActivatedAt: new Date(),
        campusId: bulkCampus.id,
      },
    });

    const dry = await call(postBulk, writeSecret, {
      campus: bulkCampus.name,
      visible: true,
    });
    expect(dry.status).toBe(200);
    const plan = dry.payload.plan as {
      changes: unknown[];
      skipped: { eventId: string; reason: string }[];
    };
    expect(plan.changes).toEqual([]);
    expect(plan.skipped).toEqual([
      expect.objectContaining({
        eventId: armed.id,
        reason: expect.stringContaining('aucune section activée'),
      }),
    ]);

    await prisma.event.delete({ where: { id: armed.id } });
    await prisma.campus.delete({ where: { id: bulkCampus.id } });
  });

  it('refuses a complete status list together with an add or remove', async () => {
    const { status, payload } = await call(postBulk, writeSecret, {
      campus: `WriteCampus-${stamp}`,
      shownStatuses: ['READY'],
      showStatuses: ['MET'],
    });
    expect(status).toBe(400);
    expect(String(payload.error)).toContain('pas les deux');
  });

  it('refuses a filter selecting more events than one bulk call may touch', async () => {
    const wide = await prisma.campus.create({
      data: { name: `WideCampus-${stamp}`, timezone: 'Europe/Paris' },
    });
    await prisma.event.createMany({
      data: Array.from({ length: 201 }, (_, index) => ({
        titre: `Wide-${stamp}-${index}`,
        date: new Date(Date.now() + 10 * 86_400_000),
        campusId: wide.id,
      })),
    });

    const { status, payload } = await call(postBulk, writeSecret, {
      campus: wide.name,
      visible: false,
    });
    expect(status).toBe(400);
    expect(String(payload.error)).toContain('200');

    await prisma.event.deleteMany({ where: { campusId: wide.id } });
    await prisma.campus.delete({ where: { id: wide.id } });
  });

  it('records a requested sync on the audit row, and moves only its date on repeat', async () => {
    const first = await call(postRequestSync, writeSecret, {
      mode: 'incremental',
    });
    expect(first.status).toBe(200);
    expect(first.payload.after).toMatchObject({ mode: 'incremental' });

    const second = await call(postRequestSync, writeSecret, {
      mode: 'incremental',
    });
    expect(second.status).toBe(200);
    // One row per mode: asking twice is still one request, made later.
    expect(second.payload.before).toEqual(first.payload.after);
    expect(await prisma.sync_Request.count()).toBe(1);

    const row = await prisma.adminApi_Call.findFirst({
      where: { actorUserId: adminUserId, operation: 'ops_request_sync' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.after).toMatchObject({ mode: 'incremental' });
  });

  describe('releasing a held prune', () => {
    it('refuses an event with nothing held, naming where holds are listed', async () => {
      const { status, payload } = await call(
        postReleasePruneHold,
        writeSecret,
        {
          eventId,
        },
      );

      expect(status).toBe(400);
      expect(String(payload.error)).toContain('stats_sync_health');
    });

    it('refuses a hold over unresolved members, which only their sync errors lift', async () => {
      await prisma.sync_PruneHold.create({
        data: {
          eventId,
          pendingRemovals: 1,
          sentCount: 2,
          resolvedCount: 1,
          lastHeldAt: new Date(),
        },
      });

      const { status, payload } = await call(
        postReleasePruneHold,
        writeSecret,
        {
          eventId,
        },
      );

      expect(status).toBe(400);
      expect(String(payload.error)).toContain('/staff/admin/sync-errors');
      expect(
        (
          await prisma.sync_PruneHold.findUnique({
            where: { eventId },
            select: { releasedAt: true },
          })
        )?.releasedAt,
      ).toBeNull();

      // And the database refuses the shape outright, whoever writes it.
      await expect(
        prisma.sync_PruneHold.update({
          where: { eventId },
          data: { releasedAt: new Date() },
        }),
      ).rejects.toThrow();

      await prisma.sync_PruneHold.delete({ where: { eventId } });
    });

    it('stamps the release and deletes nothing itself', async () => {
      await prisma.sync_PruneHold.create({
        data: {
          eventId,
          pendingRemovals: 3,
          sentCount: 0,
          resolvedCount: 0,
          lastHeldAt: new Date(),
        },
      });

      const { status, payload } = await call(
        postReleasePruneHold,
        writeSecret,
        {
          eventId,
        },
      );

      expect(status).toBe(200);
      expect(payload.before).toMatchObject({
        pendingRemovals: 3,
        releasedAt: null,
      });
      expect(
        (payload.after as { releasedAt: string | null }).releasedAt,
      ).not.toBeNull();

      const row = await prisma.adminApi_Call.findFirst({
        where: {
          actorUserId: adminUserId,
          operation: 'ops_release_prune_hold',
          status: 200,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(row?.after).toMatchObject({ pendingRemovals: 3 });
    });

    it('is safe to repeat: a second release keeps the first date', async () => {
      const first = await prisma.sync_PruneHold.findUnique({
        where: { eventId },
        select: { releasedAt: true },
      });

      const { status, payload } = await call(
        postReleasePruneHold,
        writeSecret,
        {
          eventId,
        },
      );

      expect(status).toBe(200);
      expect(payload.before).toEqual(payload.after);
      expect(
        (
          await prisma.sync_PruneHold.findUnique({
            where: { eventId },
            select: { releasedAt: true },
          })
        )?.releasedAt,
      ).toEqual(first?.releasedAt);
    });
  });
});
