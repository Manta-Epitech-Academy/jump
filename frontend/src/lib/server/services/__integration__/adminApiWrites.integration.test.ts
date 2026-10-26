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
import {
  getEventDetail,
  getEventTemplates,
  getWorkshops,
  type EventDetail,
} from '$lib/server/services/adminStats/configuration';
import { ADMIN_API_OPERATIONS } from '$lib/server/adminApi/operations';

const postConfig = adminApiWrite('write_event_config');
const postBulk = adminApiWrite('bulk_event_config');
const postTemplate = adminApiWrite('write_event_template');
const postRequestSync = adminApiWrite('ops_request_sync');
const postReleasePruneHold = adminApiWrite('ops_release_prune_hold');
const postWorkshopInstance = adminApiWrite('write_workshop_instance');
const postCategory = adminApiWrite('write_event_category');
const postWorkshop = adminApiWrite('write_workshop');
const postDomain = adminApiWrite('write_workshop_domain');

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
      startTime: '09:30',
    });

    expect(status).toBe(200);
    expect(payload.applied).toBe(true);
    expect(payload.before).toMatchObject({ startTime: null });
    expect(payload.after).toMatchObject({
      startTime: '09:30',
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
    expect(row?.before).toMatchObject({ startTime: null });
    expect(row?.after).toMatchObject({ startTime: '09:30' });
  });

  it('is safe to repeat: the same call lands on the same state', async () => {
    const { status, payload } = await call(postConfig, writeSecret, {
      eventId,
      startTime: '09:30',
    });

    expect(status).toBe(200);
    expect(payload.before).toEqual(payload.after);
  });

  it('refuses a read-only token, and logs the refusal', async () => {
    const { status, payload } = await call(postConfig, readSecret, {
      eventId,
      startTime: '10:00',
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
      startTme: '10:00',
    });
    expect(status).toBe(400);
  });

  // The end day is the Salesforce campaign's and only the sync writes it, so a
  // call still sending one is told so rather than answered with a success
  // that the next pass would undo.
  it('refuses an end date, which Salesforce owns', async () => {
    const { status } = await call(postConfig, writeSecret, {
      eventId,
      endDate: '2027-04-01',
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
  // to no public name and leave it live, in the dev switcher under its raw
  // Salesforce title.
  it('refuses to clear the public name of an event that stays visible', async () => {
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
      publicName: null,
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

    await prisma.eventConfig_Module.deleteMany({
      where: { eventId: live.id },
    });
    await prisma.event.delete({ where: { id: live.id } });
  });

  // No end day is a single-day event, not a missing field: the sync writes
  // `null` for a campaign with no `EndDate`, and nothing in Jump can supply
  // one. Asking for it refused every single-day campaign, and once the sync
  // cleared the end day of a visible event, refused every later save of it.
  it('shows an event Salesforce gave no end day, and keeps it editable', async () => {
    const singleDay = await prisma.event.create({
      data: {
        titre: `WriteSingleDay-${stamp}`,
        publicName: 'Coding Club d’un jour',
        date: new Date(Date.now() + 30 * 86_400_000),
        campusId,
        modules: { create: { moduleKey: 'inscrits' } },
      },
    });

    const shown = await call(postConfig, writeSecret, {
      eventId: singleDay.id,
      visible: true,
    });
    expect(shown.status).toBe(200);
    expect(shown.payload.after).toMatchObject({ visibleInDevWorkspace: true });

    const edited = await call(postConfig, writeSecret, {
      eventId: singleDay.id,
      startTime: '14:00',
    });
    expect(edited.status).toBe(200);
    expect(edited.payload.after).toMatchObject({
      startTime: '14:00',
      visibleInDevWorkspace: true,
    });

    await prisma.eventConfig_Module.deleteMany({
      where: { eventId: singleDay.id },
    });
    await prisma.event.delete({ where: { id: singleDay.id } });
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
      publicName: null,
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

  // What a value posted by mistake from a chat is undone with (#402). The admin
  // dialog clears these by sending an empty string; the API takes null, the
  // spelling its own read returns for an unset field.
  it('clears the arrival time and the cohort noun on null', async () => {
    const event = await prisma.event.create({
      data: {
        titre: `WriteClear-${stamp}`,
        cohortNoun: 'stagiaire',
        date: new Date(Date.now() + 30 * 86_400_000),
        endDate: new Date(Date.now() + 31 * 86_400_000),
        startMinutes: 9 * 60 + 30,
        campusId,
      },
    });

    const { status, payload } = await call(postConfig, writeSecret, {
      eventId: event.id,
      cohortNoun: null,
      startTime: null,
    });

    expect(status).toBe(200);
    expect(payload.before).toMatchObject({
      cohortNoun: 'stagiaire',
      startTime: '09:30',
    });
    expect(payload.after).toMatchObject({ cohortNoun: null, startTime: null });
    const after = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(after.cohortNoun).toBeNull();
    expect(after.startMinutes).toBeNull();

    await prisma.event.delete({ where: { id: event.id } });
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
      modules: ['inscrits', 'emargement'],
      moduleSettings: { inscrits: { showStatutColumn: true } },
      visible: true,
    });

    expect(status).toBe(200);
    expect(payload.before).toMatchObject({ visibleInDevWorkspace: false });
    expect(payload.after).toMatchObject({
      publicName: 'Stage de seconde',
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
  // an empty object, the references the preset points at come back too, and a
  // name or a time the preset does not carry comes back as the null the write
  // clears with (#402), not as an empty string it refuses.
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
    const blankName = `Modèle vide ${stamp}`;

    // The save answers with the preset as the preset read returns it, so a
    // preset carrying nothing reads null there too, never ''.
    const blankSaved = await call(postTemplate, writeSecret, {
      eventId: target.id,
      name: blankName,
    });
    expect(blankSaved.status).toBe(200);
    expect(blankSaved.payload.after).toMatchObject({
      publicName: null,
      cohortNoun: null,
      startTime: null,
    });

    const configured = await call(postConfig, writeSecret, {
      eventId: source.id,
      startTime: '14:00',
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
      publicName: null,
      cohortNoun: null,
      startTime: '14:00',
      moduleSettings: { inscrits: { showStatutColumn: true }, closings: {} },
      closingTemplateId: grid.id,
      diplomaTemplateId: null,
    });

    const applied = await call(postConfig, writeSecret, {
      eventId: target.id,
      publicName: preset.publicName,
      cohortNoun: preset.cohortNoun,
      startTime: preset.startTime,
      modules: preset.modules,
      moduleSettings: preset.moduleSettings,
      shownStatuses: preset.shownStatuses,
      feedbackFormId: preset.feedbackFormId,
      diplomaTemplateId: preset.diplomaTemplateId,
      closingTemplateId: preset.closingTemplateId,
    });
    expect(applied.status).toBe(200);
    expect(applied.payload.after).toMatchObject({
      publicName: null,
      cohortNoun: null,
      startTime: '14:00',
      modules: ['closings', 'inscrits'],
      moduleSettings: { inscrits: { showStatutColumn: true } },
      closingTemplateId: grid.id,
    });

    await prisma.eventConfig_Template.deleteMany({
      where: { name: { in: [name, blankName] } },
    });
    await prisma.event.deleteMany({
      where: { id: { in: [source.id, target.id] } },
    });
    await prisma.closing_Template.delete({ where: { id: grid.id } });
  });

  // An event may keep a grid while its closings section is off (switching the
  // section back on finds it again), but a preset saved from it must not carry
  // the grid: applying it would attach one nobody chose, and a grid a preset
  // names cannot be deleted. The wizard always dropped it; the API did not.
  it('carries no reference for a section the preset leaves off', async () => {
    const grid = await prisma.closing_Template.create({
      data: { key: `preset_off_grid_${stamp}`, label: 'Grille éteinte' },
    });
    const source = await prisma.event.create({
      data: {
        titre: `WritePresetOff-${stamp}`,
        date: new Date(Date.now() + 30 * 86_400_000),
        campusId,
      },
    });
    const name = `Modèle sans closing ${stamp}`;

    const configured = await call(postConfig, writeSecret, {
      eventId: source.id,
      modules: ['inscrits'],
      closingTemplateId: grid.id,
    });
    expect(configured.status).toBe(200);
    expect(configured.payload.after).toMatchObject({
      closingTemplateId: grid.id,
    });

    const saved = await call(postTemplate, writeSecret, {
      eventId: source.id,
      name,
    });
    expect(saved.status).toBe(200);
    expect(saved.payload.after).toMatchObject({
      modules: ['inscrits'],
      closingTemplateId: null,
    });

    await prisma.eventConfig_Template.deleteMany({ where: { name } });
    await prisma.event.deleteMany({ where: { id: source.id } });
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
      cohortNoun: 'stagiaire',
      modules: ['inscrits'],
      visible: true,
    });

    expect(status).toBe(400);
    expect(String(payload.error)).toContain('nom public');
    const after = await prisma.event.findUniqueOrThrow({
      where: { id: blank.id },
      include: { modules: true },
    });
    expect(after.cohortNoun).toBeNull();
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
        { slug: snake.slug },
        { slug: pacman.slug, labelOverride: 'Pacman' },
      ],
    });
    expect(status).toBe(200);
    expect(payload.after).toMatchObject({
      workshops: [
        { slug: snake.slug, labelOverride: null },
        { slug: pacman.slug, labelOverride: 'Pacman' },
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
      workshops: [{ slug: `nowhere-${stamp}` }],
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

  // A write that replaces a list or a reference is only safe to call after
  // reading what it replaces, so every field write_event_config takes has to
  // come back from config_event_detail, in a form the write takes again. The
  // activities did not (#400): rattaching one meant overwriting the event's list
  // blind. Written as a round trip, so a field the read drops fails here, and a
  // new write field fails until it is read back. Each entry rebuilds the write's
  // value from the read: the activities, the statuses and the scalar fields are
  // taken as read, so a rename or a reshape of those fails too. It runs on a
  // blank event as well, because a value set is not the only one read back:
  // an unset field came back as '' where the write refused it (#402).
  it('reads back every field it writes, in a form it takes again', async () => {
    const readBack: Record<string, (detail: EventDetail) => unknown> = {
      publicName: (d) => d.event.value.publicName,
      cohortNoun: (d) => d.event.value.cohortNoun,
      startTime: (d) => d.event.value.startTime,
      categoryKey: (d) => d.category.value?.key ?? null,
      // A set on both sides: the write takes any order, the read lists the
      // catalogue's. Sorted so the comparison is about membership only.
      modules: (d) =>
        d.modules.value
          .filter((m) => m.enabled)
          .map((m) => m.module)
          .sort(),
      moduleSettings: (d) =>
        Object.fromEntries(
          d.modules.value
            .filter((m) => m.enabled && m.settings !== null)
            .map((m) => [m.module, m.settings]),
        ),
      shownStatuses: (d) => d.shownStatuses.value,
      visible: (d) => d.configState.value.state === 'shown',
      feedbackFormId: (d) => d.feedbackForm.value?.id ?? null,
      diplomaTemplateId: (d) => d.certificate.value?.templateId ?? null,
      closingTemplateId: (d) => d.closingGrid.value?.templateId ?? null,
      workshops: (d) => d.workshops.value,
    };
    const writable = Object.keys(
      ADMIN_API_OPERATIONS.write_event_config.schema.shape,
    ).filter((field) => field !== 'eventId');
    expect(
      writable.filter((field) => !(field in readBack)),
      'write_event_config fields config_event_detail does not read back',
    ).toEqual([]);
    expect(
      Object.keys(readBack).filter((field) => !writable.includes(field)),
      'read-back entries naming no write_event_config field',
    ).toEqual([]);

    /** Reads the event, sends the read back, and expects nothing to move. */
    async function echoRead(id: string) {
      const detail = await getEventDetail(id);
      const read = Object.fromEntries(
        writable.map((field) => [field, readBack[field]!(detail)]),
      );
      const echoed = await call(postConfig, writeSecret, {
        eventId: id,
        ...read,
      });
      expect(echoed.status).toBe(200);
      expect(echoed.payload.after).toEqual(echoed.payload.before);
      return { detail, read };
    }

    const form = await prisma.feedback_Form.create({
      data: { slug: `readback-form-${stamp}`, title: 'Bilan relu' },
    });
    const certificate = await prisma.diploma_Template.create({
      data: {
        code: `readback_cert_${stamp}`,
        label: 'Certificat relu',
        styleCss: '',
        bodyHtml: '<p>{prenom}</p>',
        pageWidthPx: 1123,
        pageHeightPx: 794,
      },
    });
    const grid = await prisma.closing_Template.create({
      data: { key: `readback_grid_${stamp}`, label: 'Grille relue' },
    });
    const category = await prisma.eventConfig_Category.create({
      data: {
        key: `readback-camp-${stamp}`,
        label: `Camp relu ${stamp}`,
        color: '#ff5f3a',
      },
    });
    const host = await prisma.workshop_Instance.create({
      data: {
        slug: `readback-host-${stamp}`,
        baseUrl: 'https://host.example.org',
      },
    });
    const [pacman, snake] = await Promise.all(
      ['pacman', 'snake'].map((name) =>
        prisma.workshop_Activity.create({
          data: {
            slug: `readback-${name}-${stamp}`,
            instanceId: host.id,
            label: name,
          },
        }),
      ),
    );
    const [event, blank] = await Promise.all(
      ['WriteReadBack', 'WriteReadBackBlank'].map((titre) =>
        prisma.event.create({
          data: {
            titre: `${titre}-${stamp}`,
            date: new Date(Date.now() + 30 * 86_400_000),
            campusId,
          },
        }),
      ),
    );

    const written = {
      publicName: 'Camp relu',
      cohortNoun: 'campeur',
      startTime: '09:30',
      categoryKey: category.key,
      modules: ['bilan', 'closings', 'inscrits'],
      moduleSettings: { inscrits: { showStatutColumn: true } },
      shownStatuses: ['MET', 'READY'],
      visible: true,
      feedbackFormId: form.id,
      diplomaTemplateId: certificate.id,
      closingTemplateId: grid.id,
      workshops: [
        { slug: snake.slug, labelOverride: null },
        { slug: pacman.slug, labelOverride: 'Pacman' },
      ],
    };
    expect(Object.keys(written).sort()).toEqual([...writable].sort());
    const configured = await call(postConfig, writeSecret, {
      eventId: event.id,
      ...written,
    });
    expect(configured.status).toBe(200);

    const { read } = await echoRead(event.id);
    expect(read).toMatchObject({
      ...written,
      modules: [...written.modules].sort(),
    });

    const { detail: blankDetail } = await echoRead(blank.id);
    expect(blankDetail.event.value).toMatchObject({
      publicName: null,
      cohortNoun: null,
      startTime: null,
    });
    expect(blankDetail.category.value).toBeNull();

    await prisma.eventConfig_Workshop.deleteMany({
      where: { eventId: event.id },
    });
    await prisma.eventConfig_Module.deleteMany({
      where: { eventId: event.id },
    });
    await prisma.event.deleteMany({
      where: { id: { in: [event.id, blank.id] } },
    });
    await prisma.workshop_Activity.deleteMany({
      where: { id: { in: [pacman.id, snake.id] } },
    });
    await prisma.workshop_Instance.delete({ where: { id: host.id } });
    await prisma.eventConfig_Category.delete({ where: { key: category.key } });
    await prisma.closing_Template.delete({ where: { id: grid.id } });
    await prisma.diploma_Template.delete({ where: { id: certificate.id } });
    await prisma.feedback_Form.delete({ where: { id: form.id } });
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
    const unnamed = await prisma.event.create({
      data: {
        titre: `BulkUnnamed-${stamp}`,
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
      [ready.id, unnamed.id].sort(),
    );
    expect(plan.changes.find((c) => c.eventId === ready.id)?.visible).toEqual({
      from: false,
      to: true,
    });
    expect(plan.skipped).toEqual([
      expect.objectContaining({
        eventId: unnamed.id,
        reason: expect.stringContaining('nom public'),
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
    expect(byId.get(unnamed.id)?.devActivatedAt).toBeNull();
    expect(byId.get(unnamed.id)?.modules).toHaveLength(1);
    expect(byId.get(past.id)?.modules).toHaveLength(0);

    await prisma.eventConfig_Module.deleteMany({
      where: { eventId: { in: [ready.id, unnamed.id, past.id] } },
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

  // One host is one row: the plugin holds a single slug, so a second instance
  // on an address already declared can only be a copy error.
  describe('declaring a CTFd host', () => {
    const first = `write-host-${stamp}`;
    const second = `write-host-other-${stamp}`;
    const address = `https://host-${stamp}.example.invalid`;
    const elsewhere = `https://elsewhere-${stamp}.example.invalid`;

    afterAll(async () => {
      await prisma.workshop_Instance.deleteMany({
        where: { slug: { in: [first, second] } },
      });
    });

    it('refuses a second instance on an address already declared, naming the holder', async () => {
      expect(
        (
          await call(postWorkshopInstance, writeSecret, {
            instance: first,
            baseUrl: address,
          })
        ).status,
      ).toBe(200);

      // The trailing slash is normalised away before the comparison.
      const { status, payload } = await call(
        postWorkshopInstance,
        writeSecret,
        { instance: second, baseUrl: `${address}/` },
      );

      expect(status).toBe(400);
      expect(String(payload.error)).toContain(`« ${first} »`);
      expect(
        await prisma.workshop_Instance.count({ where: { slug: second } }),
      ).toBe(0);
    });

    it('is safe to repeat: the same slug on its own address changes nothing', async () => {
      const { status, payload } = await call(
        postWorkshopInstance,
        writeSecret,
        { instance: first, baseUrl: address },
      );

      expect(status).toBe(200);
      expect(payload.before).toEqual(payload.after);
    });

    it('refuses the same host typed under the other scheme', async () => {
      const { status, payload } = await call(
        postWorkshopInstance,
        writeSecret,
        { instance: second, baseUrl: address.replace('https:', 'http:') },
      );

      expect(status).toBe(400);
      expect(String(payload.error)).toContain(`« ${first} »`);
    });

    it('takes a non-default port as another host', async () => {
      const { status } = await call(postWorkshopInstance, writeSecret, {
        instance: second,
        baseUrl: `${address}:8443`,
      });

      expect(status).toBe(200);
    });

    it('lets an address go to another instance once its holder has moved', async () => {
      await call(postWorkshopInstance, writeSecret, {
        instance: first,
        baseUrl: elsewhere,
      });
      const { status, payload } = await call(
        postWorkshopInstance,
        writeSecret,
        { instance: second, baseUrl: address },
      );

      expect(status).toBe(200);
      expect(payload.after).toMatchObject({
        instance: second,
        baseUrl: address,
      });
    });
  });

  describe('event categories', () => {
    const club = `write-club-${stamp}`;
    const stage = `write-stage-${stamp}`;
    const preset = `Preset catégorie ${stamp}`;
    const keptPreset = `Preset catégorie archivée ${stamp}`;
    const eventIds: string[] = [];

    async function newEvent(categoryKey: string | null = null) {
      const event = await prisma.event.create({
        data: {
          titre: `WriteCategory-${stamp}-${eventIds.length}`,
          date: new Date(Date.now() + 30 * 86_400_000),
          campusId,
          categoryKey,
        },
      });
      eventIds.push(event.id);
      return event.id;
    }

    afterAll(async () => {
      await prisma.eventConfig_Template.deleteMany({
        where: { name: { in: [preset, keptPreset] } },
      });
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
      // The bulk case reaches every event of the campus, the shared ones too,
      // and a category still carried cannot be deleted.
      await prisma.event.updateMany({
        where: { campusId },
        data: { categoryKey: null },
      });
      await prisma.eventConfig_Category.deleteMany({
        where: { key: { in: [club, stage] } },
      });
    });

    it('creates a category, then renames, recolours, archives and unarchives it', async () => {
      // Any case is taken, one is stored: the colour reads back as the write
      // takes it again.
      const created = await call(postCategory, writeSecret, {
        categoryKey: club,
        label: 'Coding Club',
        color: '#013AFB',
      });
      expect(created.status).toBe(200);
      expect(created.payload.before).toBeNull();
      expect(created.payload.after).toEqual({
        categoryKey: club,
        label: 'Coding Club',
        color: '#013afb',
        archived: false,
      });

      const renamed = await call(postCategory, writeSecret, {
        categoryKey: club,
        label: 'Club du mercredi',
        color: '#7a5cff',
      });
      expect(renamed.payload.after).toMatchObject({
        label: 'Club du mercredi',
        color: '#7a5cff',
        archived: false,
      });

      const archived = await call(postCategory, writeSecret, {
        categoryKey: club,
        archived: true,
      });
      expect(archived.payload.after).toMatchObject({
        label: 'Club du mercredi',
        archived: true,
      });
      // Archiving again keeps the first instant: nothing moves.
      const before = await prisma.eventConfig_Category.findUniqueOrThrow({
        where: { key: club },
      });
      await call(postCategory, writeSecret, {
        categoryKey: club,
        archived: true,
      });
      expect(
        (
          await prisma.eventConfig_Category.findUniqueOrThrow({
            where: { key: club },
          })
        ).archivedAt,
      ).toEqual(before.archivedAt);

      const back = await call(postCategory, writeSecret, {
        categoryKey: club,
        archived: false,
      });
      expect(back.payload.after).toMatchObject({ archived: false });
    });

    it('refuses to create a category without a colour, and a label another one holds', async () => {
      const incomplete = await call(postCategory, writeSecret, {
        categoryKey: stage,
        label: 'Stage',
      });
      expect(incomplete.status).toBe(400);
      expect(String(incomplete.payload.error)).toContain('color');

      // Case does not tell two categories apart in a legend.
      const taken = await call(postCategory, writeSecret, {
        categoryKey: stage,
        label: 'CLUB DU MERCREDI',
        color: '#ff1ef7',
      });
      expect(taken.status).toBe(400);
      expect(String(taken.payload.error)).toContain(`« ${club} »`);

      // A colour name is not a colour the calendar can paint.
      const named = await call(postCategory, writeSecret, {
        categoryKey: stage,
        label: 'Stage',
        color: 'rose',
      });
      expect(named.status).toBe(400);
      expect(
        await prisma.eventConfig_Category.count({ where: { key: stage } }),
      ).toBe(0);
    });

    it('gives an event a category, and refuses an archived one as a new choice', async () => {
      await call(postCategory, writeSecret, {
        categoryKey: stage,
        label: `Stage ${stamp}`,
        color: '#ff1ef7',
      });
      const id = await newEvent();

      const given = await call(postConfig, writeSecret, {
        eventId: id,
        categoryKey: stage,
      });
      expect(given.status).toBe(200);
      expect(given.payload.after).toMatchObject({ categoryKey: stage });

      await call(postCategory, writeSecret, {
        categoryKey: club,
        archived: true,
      });
      const refused = await call(postConfig, writeSecret, {
        eventId: id,
        categoryKey: club,
      });
      expect(refused.status).toBe(400);
      expect(String(refused.payload.error)).toContain('archivée');

      const unknown = await call(postConfig, writeSecret, {
        eventId: id,
        categoryKey: `nowhere-${stamp}`,
      });
      expect(unknown.status).toBe(400);
      expect(String(unknown.payload.error)).toContain(
        'config_event_categories',
      );

      const cleared = await call(postConfig, writeSecret, {
        eventId: id,
        categoryKey: null,
      });
      expect(cleared.payload.after).toMatchObject({ categoryKey: null });
    });

    // AC3: archiving takes a category off the list, never off the events that
    // carry it, so sending such an event's configuration back unchanged works.
    it('lets an event keep a category archived since', async () => {
      const id = await newEvent(club);

      const detail = await getEventDetail(id);
      expect(detail.category.value).toMatchObject({
        key: club,
        archived: true,
      });
      const echoed = await call(postConfig, writeSecret, {
        eventId: id,
        categoryKey: detail.category.value?.key ?? null,
        publicName: 'Club gardé',
      });
      expect(echoed.status).toBe(200);
      expect(echoed.payload.after).toMatchObject({ categoryKey: club });

      // A preset is a copy of the configuration, archived category included:
      // it is an event, not a preset, that may not newly receive one.
      const saved = await call(postTemplate, writeSecret, {
        eventId: id,
        name: keptPreset,
      });
      expect(saved.status).toBe(200);
      expect(saved.payload.after).toMatchObject({ categoryKey: club });
    });

    // AC2: a preset is a copy, so retargeting it later reaches no event it was
    // applied to.
    it("leaves configured events alone when a preset's category changes", async () => {
      const source = await newEvent(stage);
      expect(
        (
          await call(postTemplate, writeSecret, {
            eventId: source,
            name: preset,
          })
        ).payload.after,
      ).toMatchObject({ categoryKey: stage });

      const applied = await newEvent();
      const template = (await getEventTemplates()).templates.value.find(
        (t) => t.name === preset,
      );
      await call(postConfig, writeSecret, {
        eventId: applied,
        categoryKey: template?.categoryKey,
      });

      await prisma.event.update({
        where: { id: source },
        data: { categoryKey: null },
      });
      await call(postTemplate, writeSecret, { eventId: source, name: preset });

      expect(
        (await prisma.event.findUniqueOrThrow({ where: { id: applied } }))
          .categoryKey,
      ).toBe(stage);
    });

    it('plans a category across events, and refuses an archived one before planning', async () => {
      const id = await newEvent();
      const filter = {
        campus: `WriteCampus-${stamp}`,
        categoryKey: stage,
      };

      const dry = await call(postBulk, writeSecret, filter);
      expect(dry.status).toBe(200);
      const plan = dry.payload.plan as {
        changes: { eventId: string; category?: unknown }[];
      };
      expect(plan.changes.find((c) => c.eventId === id)?.category).toEqual({
        from: null,
        to: stage,
      });

      const applied = await call(postBulk, writeSecret, {
        ...filter,
        planDigest: dry.payload.planDigest,
      });
      expect(applied.status).toBe(200);
      expect(
        (await prisma.event.findUniqueOrThrow({ where: { id } })).categoryKey,
      ).toBe(stage);

      const archived = await call(postBulk, writeSecret, {
        campus: `WriteCampus-${stamp}`,
        categoryKey: club,
      });
      expect(archived.status).toBe(400);
      expect(String(archived.payload.error)).toContain('archivée');
    });
  });

  describe('the subject catalogue', () => {
    const host = `catalogue-${stamp}`;
    const subject = `catalogue-sujet-${stamp}`;
    const cyber = `cyber-${stamp}`;
    const ai = `ia-${stamp}`;
    const retired = `electronique-${stamp}`;

    beforeAll(async () => {
      await call(postWorkshopInstance, writeSecret, {
        instance: host,
        baseUrl: `https://${host}.ctfd.test`,
      });
      await call(postWorkshop, writeSecret, {
        slug: subject,
        label: 'Sujet de catalogue',
        instance: host,
      });
    });

    afterAll(async () => {
      await prisma.workshop_Activity.deleteMany({ where: { slug: subject } });
      await prisma.workshop_Instance.deleteMany({ where: { slug: host } });
      await prisma.workshop_Domain.deleteMany({
        where: { key: { in: [cyber, ai, retired] } },
      });
    });

    const activityRead = async () =>
      (await getWorkshops()).activities.value.find((a) => a.slug === subject)!;

    it('creates a domain, then renames, archives and unarchives it', async () => {
      const created = await call(postDomain, writeSecret, {
        domainKey: cyber,
        label: `Cyber ${stamp}`,
      });
      expect(created.status).toBe(200);
      expect(created.payload.before).toBeNull();
      expect(created.payload.after).toEqual({
        domainKey: cyber,
        label: `Cyber ${stamp}`,
        archived: false,
      });

      const renamed = await call(postDomain, writeSecret, {
        domainKey: cyber,
        label: `Cybersécurité ${stamp}`,
      });
      expect(renamed.payload.after).toMatchObject({
        label: `Cybersécurité ${stamp}`,
      });

      await call(postDomain, writeSecret, { domainKey: cyber, archived: true });
      // Archiving again keeps the first instant: nothing moves.
      const first = await prisma.workshop_Domain.findUniqueOrThrow({
        where: { key: cyber },
      });
      await call(postDomain, writeSecret, { domainKey: cyber, archived: true });
      expect(
        (
          await prisma.workshop_Domain.findUniqueOrThrow({
            where: { key: cyber },
          })
        ).archivedAt,
      ).toEqual(first.archivedAt);

      const back = await call(postDomain, writeSecret, {
        domainKey: cyber,
        archived: false,
      });
      expect(back.payload.after).toMatchObject({ archived: false });
    });

    it('refuses to create a domain without a label, and a label another one holds', async () => {
      const incomplete = await call(postDomain, writeSecret, { domainKey: ai });
      expect(incomplete.status).toBe(400);
      expect(String(incomplete.payload.error)).toContain('label');

      // Case does not tell two domains apart in the filter.
      const taken = await call(postDomain, writeSecret, {
        domainKey: ai,
        label: `CYBERSÉCURITÉ ${stamp}`,
      });
      expect(taken.status).toBe(400);
      expect(String(taken.payload.error)).toContain(`« ${cyber} »`);
      expect(await prisma.workshop_Domain.count({ where: { key: ai } })).toBe(
        0,
      );
    });

    it('files a subject, leaves its filing alone when a call does not name it, and clears it', async () => {
      await call(postDomain, writeSecret, {
        domainKey: ai,
        label: `IA ${stamp}`,
      });

      const filed = await call(postWorkshop, writeSecret, {
        slug: subject,
        level: 'expert',
        notions: [' FSM ', 'Arbres de décision', 'fsm', '  '],
        domains: [cyber, ai],
      });
      expect(filed.status).toBe(200);
      expect(filed.payload.after).toMatchObject({
        level: 'expert',
        // Trimmed, the blank and the repeat dropped whatever its case.
        notions: ['FSM', 'Arbres de décision'],
        domains: [ai, cyber].sort(),
      });

      const relabelled = await call(postWorkshop, writeSecret, {
        slug: subject,
        label: 'Sujet renommé',
      });
      expect(relabelled.payload.after).toMatchObject({
        level: 'expert',
        notions: ['FSM', 'Arbres de décision'],
        domains: [ai, cyber].sort(),
      });

      const cleared = await call(postWorkshop, writeSecret, {
        slug: subject,
        level: null,
        notions: [],
        domains: [],
      });
      expect(cleared.payload.after).toMatchObject({
        level: null,
        notions: [],
        domains: [],
      });
    });

    it('refuses an unknown domain, and an archived one unless the subject already carries it', async () => {
      const unknown = await call(postWorkshop, writeSecret, {
        slug: subject,
        domains: [`inconnu-${stamp}`],
      });
      expect(unknown.status).toBe(400);
      expect(String(unknown.payload.error)).toContain('config_workshops');

      await call(postDomain, writeSecret, {
        domainKey: retired,
        label: `Électronique ${stamp}`,
      });
      await call(postWorkshop, writeSecret, {
        slug: subject,
        domains: [retired],
      });
      await call(postDomain, writeSecret, {
        domainKey: retired,
        archived: true,
      });

      // Carried before it was archived: kept, so the read sent back is taken.
      const kept = await call(postWorkshop, writeSecret, {
        slug: subject,
        domains: [retired, cyber],
      });
      expect(kept.status).toBe(200);

      await call(postWorkshop, writeSecret, { slug: subject, domains: [] });
      const fresh = await call(postWorkshop, writeSecret, {
        slug: subject,
        domains: [retired],
      });
      expect(fresh.status).toBe(400);
      expect(String(fresh.payload.error)).toContain('archivé');
    });

    it('reads back its filing in the shape the write takes, with what it lacks for the catalogue', async () => {
      await call(postWorkshop, writeSecret, {
        slug: subject,
        level: 'beginner',
        notions: ['Encodage'],
        domains: [cyber],
      });
      const read = await activityRead();
      // No tagline and no picture yet: the catalogue does not show it.
      expect(read.missingForCatalogue).toEqual(['tagline', 'picture']);

      const echoed = await call(postWorkshop, writeSecret, {
        slug: subject,
        level: read.level,
        notions: read.notions,
        domains: read.domains,
      });
      expect(echoed.status).toBe(200);
      expect(echoed.payload.after).toEqual(echoed.payload.before);

      const domains = (await getWorkshops()).domains.value;
      expect(domains.find((d) => d.key === cyber)).toMatchObject({
        archived: false,
        subjects: 1,
      });
      expect(domains.find((d) => d.key === retired)).toMatchObject({
        archived: true,
        subjects: 0,
      });
    });
  });
});
