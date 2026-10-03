/**
 * Which Salesforce statuses the dev space shows is set per event (#371), and
 * every dev count and list reads it through one projection,
 * `Participation.shownInDevSpace`. These tests hold the two halves of that
 * contract on real SQL: the sync writes the projection from the event's policy,
 * and a policy change rewrites it for the enrolments already there.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { syncEvents, syncParticipations, syncTalents } from '../syncService';
import {
  defaultShownStatuses,
  setEventShownStatuses,
} from '../devSpaceVisibility';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';
import {
  writeEventConfig,
  writeEventTemplate,
} from '$lib/server/adminApi/writes/events';
import {
  bulkApplyEventTemplate,
  bulkEventShownStatuses,
} from '$lib/server/adminApi/writes/bulk';
import { writeSyncMemberStatus } from '$lib/server/adminApi/writes/sync';
import { getSyncHealth } from '$lib/server/services/adminStats/syncHealth';
import { assertTestDatabase } from './testDatabase';

const stamp = Date.now();
const campusExternalName = `VIS_CAMPUS_${stamp}`;
const stageExternalId = `vis_stage_${stamp}`;
const clubExternalId = `vis_club_${stamp}`;
const talents = ['ready', 'connected', 'legacy'].map((key) => ({
  external_id: `vis_${key}_${stamp}`,
  first_name: 'Vis',
  last_name: key,
  email: `vis.${key}.${stamp}@example.test`,
}));
const [ready, connected, legacy] = talents.map((t) => t.external_id);
const campusName = `Vis Campus ${stamp}`;
const templateName = `Vis Coding Club ${stamp}`;
// A word Salesforce might start sending, unique per run because the catalogue is
// platform-wide and has no delete.
const renamed = `CONFIRMED_${stamp}`;

describe('per-event dev-space visibility (integration)', () => {
  let campusId = '';
  const eventIds: Record<'stage' | 'club', string> = { stage: '', club: '' };

  beforeAll(async () => {
    assertTestDatabase();
    const campus = await prisma.campus.create({
      data: {
        name: campusName,
        externalName: campusExternalName,
      },
    });
    campusId = campus.id;
  });

  afterAll(async () => {
    try {
      const created = await prisma.talent.findMany({
        where: { externalId: { in: talents.map((t) => t.external_id) } },
        select: { userId: true },
      });
      await prisma.talent.deleteMany({
        where: { externalId: { in: talents.map((t) => t.external_id) } },
      });
      await prisma.event.deleteMany({ where: { campusId } });
      await prisma.eventConfig_Template.deleteMany({
        where: { name: templateName },
      });
      await prisma.sync_MemberStatus.deleteMany({ where: { status: renamed } });
      const userIds = created
        .map((t) => t.userId)
        .filter((id): id is string => id != null);
      await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.campus.delete({ where: { id: campusId } });
    } catch {
      // ignore: the test database is disposable
    }
  });

  const shownOn = async (event: 'stage' | 'club') => {
    const rows = await prisma.participation.findMany({
      where: { eventId: eventIds[event], ...visibleParticipationWhere },
      select: { talent: { select: { externalId: true } } },
    });
    return rows.map((row) => row.talent.externalId).sort();
  };

  it('gives an event the sync creates the statuses the catalogue shows by default', async () => {
    await syncEvents([
      {
        external_id: stageExternalId,
        title: 'Stage visibilité',
        campus_ext_name: campusExternalName,
        date: '2026/03/02',
      },
      {
        external_id: clubExternalId,
        title: 'Coding Club visibilité',
        campus_ext_name: campusExternalName,
        date: '2026/03/04',
      },
    ]);
    for (const [key, externalId] of [
      ['stage', stageExternalId],
      ['club', clubExternalId],
    ] as const) {
      const event = await prisma.event.findUniqueOrThrow({
        where: { externalId },
        select: { id: true, shownStatuses: { select: { status: true } } },
      });
      eventIds[key] = event.id;
      expect(event.shownStatuses.map((row) => row.status).sort()).toEqual(
        await defaultShownStatuses(),
      );
    }
  });

  it('shows a word on the event that shows it, and masks it on the one that does not', async () => {
    await prisma.$transaction((tx) =>
      setEventShownStatuses(tx, eventIds.club, ['ready', 'MET', 'Connected']),
    );
    await syncTalents(talents);
    const roster = { [ready]: 'READY', [connected]: 'CONNECTED', [legacy]: '' };
    await syncParticipations(stageExternalId, roster, 'full');
    await syncParticipations(clubExternalId, roster, 'full');

    // The legacy row, with no status, is shown on both: no event can name the
    // absence of a word.
    expect(await shownOn('stage')).toEqual([legacy, ready].sort());
    expect(await shownOn('club')).toEqual([connected, legacy, ready].sort());
  });

  it('recomputes the enrolments already there when an event changes what it shows', async () => {
    await prisma.$transaction((tx) =>
      setEventShownStatuses(tx, eventIds.stage, ['CONNECTED']),
    );
    expect(await shownOn('stage')).toEqual([connected, legacy].sort());

    // And the sync keeps agreeing with it on the next pass.
    await syncParticipations(
      stageExternalId,
      { [ready]: 'READY', [connected]: 'CONNECTED' },
      'incremental',
    );
    expect(await shownOn('stage')).toEqual([connected, legacy].sort());
  });

  it('refuses a word the catalogue does not hold, naming the ones it does', async () => {
    await expect(
      prisma.$transaction((tx) =>
        setEventShownStatuses(tx, eventIds.stage, ['MEET']),
      ),
    ).rejects.toMatchObject({
      status: 400,
      body: { message: expect.stringContaining('READY') },
    });
    // Nothing moved.
    expect(await shownOn('stage')).toEqual([connected, legacy].sort());
  });

  it('refuses at the database a row with no status that is not shown', async () => {
    await expect(
      prisma.participation.updateMany({
        where: { eventId: eventIds.stage, sfMemberStatus: null },
        data: { shownInDevSpace: false },
      }),
    ).rejects.toThrow();
  });

  it('sets what one event shows through write_event_config, and refuses an unknown word', async () => {
    const outcome = await writeEventConfig({
      eventId: eventIds.stage,
      shownStatuses: ['READY', 'MET'],
    });
    expect(outcome).toMatchObject({
      applied: true,
      before: { shownStatuses: ['CONNECTED'] },
      after: { shownStatuses: ['MET', 'READY'] },
    });
    expect(await shownOn('stage')).toEqual([legacy, ready].sort());

    await expect(
      writeEventConfig({ eventId: eventIds.stage, shownStatuses: ['MEET'] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('carries the statuses from a saved template onto every event it is applied to', async () => {
    // The Coding Club shows CONNECTED; saving it as a preset captures that.
    await writeEventTemplate({ eventId: eventIds.club, name: templateName });

    const dryRun = await bulkApplyEventTemplate({
      templateName,
      campus: campusName,
    });
    expect(dryRun.applied).toBe(false);
    if (dryRun.applied) return;
    const applied = await bulkApplyEventTemplate({
      templateName,
      campus: campusName,
      planDigest: dryRun.planDigest,
    });
    expect(applied.applied).toBe(true);

    // The stage now shows what the club showed, enrolments included.
    expect(await shownOn('stage')).toEqual([connected, legacy, ready].sort());
  });

  it('follows a status Salesforce renamed: reported, added, then shown everywhere in one plan', async () => {
    // Salesforce starts sending the new word for the confirmed member.
    await syncParticipations(
      stageExternalId,
      { [ready]: renamed.toLowerCase() },
      'incremental',
    );
    let health = await getSyncHealth();
    expect(health.unrecognisedStatusEvents.value).toContainEqual(
      expect.objectContaining({ eventId: eventIds.stage, statuses: [renamed] }),
    );
    expect(await shownOn('stage')).not.toContain(ready);

    // Added to the catalogue: no longer unknown, still shown nowhere.
    const added = await writeSyncMemberStatus({ memberStatus: renamed });
    expect(added).toMatchObject({
      applied: true,
      before: null,
      after: { memberStatus: renamed, shownByDefault: false },
    });
    health = await getSyncHealth();
    expect(health.memberStatuses.value).toContainEqual(
      expect.objectContaining({ status: renamed, known: true, shownCount: 0 }),
    );
    expect(await shownOn('stage')).not.toContain(ready);

    // Shown on every event of the campus, the old word masked, in one plan.
    const dryRun = await bulkEventShownStatuses({
      showStatuses: [renamed],
      hideStatuses: ['READY'],
      campus: campusName,
    });
    expect(dryRun.applied).toBe(false);
    if (dryRun.applied) return;
    await bulkEventShownStatuses({
      showStatuses: [renamed],
      hideStatuses: ['READY'],
      campus: campusName,
      planDigest: dryRun.planDigest,
    });
    expect(await shownOn('stage')).toContain(ready);
    // Each event kept the rest of what it showed: the club still shows CONNECTED.
    expect(await shownOn('club')).toContain(connected);
  });
});
