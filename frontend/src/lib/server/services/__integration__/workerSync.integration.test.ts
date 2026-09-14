/**
 * One whole synchronisation run, against a real database.
 *
 * The unit tests cover the decision in isolation and the shape of the answer
 * the worker parses. What neither can see is the loop those two close: a run
 * opens, pushes, closes, and the NEXT decision depends on how it closed. That
 * loop is where the promise of the refonte lives (« zéro perte »), and it is
 * only observable with rows.
 *
 * Four properties are worth a test each, and each is a way the sync loses data
 * quietly rather than loudly:
 *  - a failed run must not move the watermark, or its window is skipped;
 *  - a `full` push prunes and an `incremental` one must not, because a deletion
 *    in Salesforce moves no modstamp and so is invisible to any delta;
 *  - a roster Jump cannot resolve is refused rather than applied as an empty one;
 *  - a source on a campus with no external name is never served, which is the
 *    isolation a generated environment rests on;
 *  - a contact Salesforce sent with no name costs its own row and nothing else,
 *    because refusing the batch over it stalls every campaign for good.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { syncEvents, syncParticipations, syncTalents } from '../syncService';
import { closeRun, lastOkRun, openRun } from '../syncRunService';
import { getWorkerConfig, listWorkerSources } from '../syncConfigService';
import { workerConfigAnswerSchema } from '$lib/validation/workerSync';
import { assertTestDatabase } from './testDatabase';

describe('the worker sync loop (integration)', () => {
  const stamp = Date.now();
  const armedExternalName = `TEST_ARMED_${stamp}`;
  const eventExternalId = `test_ws_event_${stamp}`;
  const otherEventExternalId = `test_ws_event_other_${stamp}`;

  const talents = [
    {
      external_id: `test_ws_a_${stamp}`,
      first_name: 'Alix',
      last_name: 'Un',
      email: `alix.${stamp}@example.test`,
    },
    {
      external_id: `test_ws_b_${stamp}`,
      first_name: 'Bao',
      last_name: 'Deux',
      email: `bao.${stamp}@example.test`,
    },
  ];

  // A contact Salesforce accepts and Jump cannot name. `Contact.FirstName` is
  // optional there, so this is ordinary data rather than a malformed payload.
  const namelessExternalId = `test_ws_noname_${stamp}`;

  let armedCampusId = '';
  let darkCampusId = '';
  const runIds: string[] = [];

  beforeAll(async () => {
    assertTestDatabase();
    // Two campuses on purpose: one Jump has mapped to Salesforce, one it has
    // not. The second is every generated environment.
    const armed = await prisma.campus.create({
      data: {
        name: `Test Armed ${stamp}`,
        externalName: armedExternalName,
      },
      select: { id: true },
    });
    const dark = await prisma.campus.create({
      data: { name: `Test Dark ${stamp}` },
      select: { id: true },
    });
    armedCampusId = armed.id;
    darkCampusId = dark.id;
  });

  afterAll(async () => {
    try {
      await prisma.sync_Source.deleteMany({
        where: { campusId: { in: [armedCampusId, darkCampusId] } },
      });
      await prisma.sync_Run.deleteMany({ where: { id: { in: runIds } } });
      const created = await prisma.talent.findMany({
        where: { externalId: { in: talents.map((t) => t.external_id) } },
        select: { id: true, userId: true },
      });
      await prisma.talent.deleteMany({
        where: { id: { in: created.map((t) => t.id) } },
      });
      await prisma.bauth_user.deleteMany({
        where: {
          id: {
            in: created
              .map((t) => t.userId)
              .filter((id): id is string => id !== null),
          },
        },
      });
      await prisma.syncError.deleteMany({
        where: { attemptedExtId: namelessExternalId },
      });
      await prisma.event.deleteMany({
        where: { externalId: { in: [eventExternalId, otherEventExternalId] } },
      });
      await prisma.campus.deleteMany({
        where: { id: { in: [armedCampusId, darkCampusId] } },
      });
    } catch {
      // ignore: the test database is disposable
    }
  });

  it('serves only sources whose campus Jump has mapped to Salesforce', async () => {
    const armedSource = await prisma.sync_Source.create({
      data: {
        salesforceCampaignId: `701A${stamp}`.slice(0, 18),
        kind: 'parent',
        campusId: armedCampusId,
      },
      select: { salesforceCampaignId: true },
    });
    const darkSource = await prisma.sync_Source.create({
      data: {
        salesforceCampaignId: `701D${stamp}`.slice(0, 18),
        kind: 'orphan',
        campusId: darkCampusId,
      },
      select: { salesforceCampaignId: true },
    });

    const served = await listWorkerSources();
    const ids = served.map((s) => s.salesforceCampaignId);

    expect(ids).toContain(armedSource.salesforceCampaignId);
    // The whole of the worker isolation: configured, and inert, because there
    // is no external name for the worker to resolve the campus by.
    expect(ids).not.toContain(darkSource.salesforceCampaignId);

    // And disabling is a flag, so it takes the source out of the answer without
    // losing the configuration.
    await prisma.sync_Source.update({
      where: { salesforceCampaignId: armedSource.salesforceCampaignId },
      data: { enabled: false },
    });
    const afterDisable = (await listWorkerSources()).map(
      (s) => s.salesforceCampaignId,
    );
    expect(afterDisable).not.toContain(armedSource.salesforceCampaignId);
  });

  it('answers the config in a shape the worker will parse', async () => {
    const answer = await getWorkerConfig();

    // Through JSON, not just as an object: `since: undefined` is present in one
    // and gone from the other, and the worker rejects the second.
    const overTheWire = JSON.parse(JSON.stringify(answer));
    expect(workerConfigAnswerSchema.safeParse(overTheWire).success).toBe(true);
  });

  it('runs a full pass: events, talents, enrolments, and a prune', async () => {
    const run = await openRun('full');
    runIds.push(run.id);

    const events = await syncEvents([
      {
        external_id: eventExternalId,
        title: `Stage ${stamp}`,
        date: '2026/07/08',
        campus_ext_name: armedExternalName,
      },
      // A campus nobody has armed: skipped and counted, never a refusal that
      // costs the rest of the batch its sync.
      {
        external_id: otherEventExternalId,
        title: `Ailleurs ${stamp}`,
        campus_ext_name: `TEST_UNKNOWN_${stamp}`,
      },
    ]);
    expect(events).toMatchObject({ created: 1, skipped: 1 });
    expect(events.unresolvedCampuses).toEqual([`TEST_UNKNOWN_${stamp}`]);

    const identities = await syncTalents(talents);
    expect((identities as { error?: string }).error).toBeUndefined();

    const first = await syncParticipations(
      eventExternalId,
      {
        [talents[0].external_id]: 'Met',
        [talents[1].external_id]: 'Connected',
      },
      'full',
    );
    expect(first).toMatchObject({ upserted: 2, removed: 0 });

    // A full pass carries the whole campaign, so a member missing from it is a
    // member who left. This is the only pass allowed to say that.
    const pruning = await syncParticipations(
      eventExternalId,
      { [talents[0].external_id]: 'Met' },
      'full',
    );
    expect(pruning).toMatchObject({ upserted: 1, removed: 1 });

    expect(
      await closeRun(run.id, {
        status: 'ok',
        counters: { events: 1, talents: 2, participations: 1 },
      }),
    ).toEqual({ ok: true });
  });

  it('never prunes on an incremental, because a deletion moves no modstamp', async () => {
    await syncParticipations(
      eventExternalId,
      {
        [talents[0].external_id]: 'Met',
        [talents[1].external_id]: 'Ready',
      },
      'full',
    );

    // The same roster minus one, sent as a delta. Absence proves nothing here:
    // Salesforce reports touched campaigns, and removing a member from one
    // touches nothing at all.
    const delta = await syncParticipations(
      eventExternalId,
      { [talents[0].external_id]: 'Met' },
      'incremental',
    );

    expect(delta).toMatchObject({ removed: 0 });
    const event = await prisma.event.findUnique({
      where: { externalId: eventExternalId },
      select: { id: true },
    });
    expect(
      await prisma.participation.count({ where: { eventId: event!.id } }),
    ).toBe(2);
  });

  it('refuses a full roster it cannot resolve rather than emptying the event', async () => {
    const unknownIds = await syncParticipations(
      eventExternalId,
      { [`test_ws_ghost_${stamp}`]: 'Met' },
      'full',
    );
    expect(unknownIds).toHaveProperty('error');

    const empty = await syncParticipations(eventExternalId, {}, 'full');
    expect(empty).toHaveProperty('error');

    const event = await prisma.event.findUnique({
      where: { externalId: eventExternalId },
      select: { id: true },
    });
    expect(
      await prisma.participation.count({ where: { eventId: event!.id } }),
    ).toBe(2);
  });

  it('skips a nameless contact and still reconciles the rest of the batch', async () => {
    // This used to `return` mid-loop, so the route answered 400, the run closed
    // in error and the watermark stayed put - which made the next tick replay
    // the identical page onto the identical row. One contact with no first name
    // stopped every campaign from syncing, permanently.
    const result = await syncTalents([
      { external_id: namelessExternalId, first_name: '', last_name: 'Sansnom' },
      ...talents,
    ]);

    expect(result).toMatchObject({ invalid: 1 });
    expect(result).not.toHaveProperty('error');

    // The rows after it in the batch were still reconciled, which is the whole
    // point: the abort abandoned them.
    expect(
      await prisma.talent.count({
        where: { externalId: { in: talents.map((t) => t.external_id) } },
      }),
    ).toBe(talents.length);
    expect(
      await prisma.talent.findUnique({
        where: { externalId: namelessExternalId },
      }),
    ).toBeNull();

    // Skipped, not silent: a talent who never appears in Jump with nothing
    // saying why is the failure mode this surface is written against.
    const logged = await prisma.syncError.findFirst({
      where: { attemptedExtId: namelessExternalId },
      select: { errorType: true, resolved: true },
    });
    expect(logged).toMatchObject({
      errorType: 'MISSING_NAME',
      resolved: false,
    });
  });

  it('leaves the watermark alone when a run fails, so its window is replayed', async () => {
    const before = await lastOkRun('incremental');

    const failed = await openRun('incremental');
    runIds.push(failed.id);
    await closeRun(failed.id, { status: 'error', error: 'boom' });

    expect(await lastOkRun('incremental')).toEqual(before);

    const succeeded = await openRun('incremental');
    runIds.push(succeeded.id);
    await closeRun(succeeded.id, {
      status: 'ok',
      counters: { events: 0, talents: 0, participations: 0 },
    });

    const after = await lastOkRun('incremental');
    expect(after).not.toBeNull();
    expect(after!.finishedAt.getTime()).toBeGreaterThan(
      before?.finishedAt.getTime() ?? 0,
    );
  });

  it('refuses to close a run twice, so a retry cannot walk the watermark back', async () => {
    const run = await openRun('incremental');
    runIds.push(run.id);
    await closeRun(run.id, {
      status: 'ok',
      counters: { events: 1, talents: 1, participations: 1 },
    });

    // The worker fires this second call when its own success call is what
    // failed. Applying it would rewrite an ok run as an error over data that
    // did land.
    expect(await closeRun(run.id, { status: 'error', error: 'late' })).toEqual({
      ok: false,
      reason: 'already_closed',
    });

    expect(
      await closeRun('sync_run_that_never_existed', {
        status: 'ok',
        counters: { events: 0, talents: 0, participations: 0 },
      }),
    ).toEqual({ ok: false, reason: 'not_found' });
  });
});
