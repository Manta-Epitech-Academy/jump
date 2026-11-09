/**
 * « Venu » (#491): a talent came to an event once it is over and something
 * attests it, a status the event counts as attended, an émargement or a
 * closing; an activity, done from anywhere, does not. Every dev screen reads it
 * through one projection, `Participation.attendanceAttested`, and these tests
 * hold, on real SQL, that each writer of a proof keeps it true: the sync (a
 * status changed in Salesforce lands at the next pass), the émargement, the
 * closings, and the three operations that move or delete a talent's proofs
 * (erasure, reset to import, merge). Each goes through the writer itself, so
 * a writer that stops re-deriving the projection fails here.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { syncEvents, syncParticipations, syncTalents } from '../syncService';
import { markAllPresentInSlot, writePresenceCell } from '../presenceService';
import { persistClosing } from '../closingService';
import { resetClosing } from '../closingResetService';
import { anonymizeTalent } from '../anonymizationService';
import { resetTalentToImport } from '../talentAccount';
import { mergeTalents } from '../talentMergeService';
import { enterWorkshop } from '../workshopService';
import { recomputeAttendance } from '../attendance';
import { attendedBeforeWhere } from '$lib/domain/attendance';
import { writeEventConfig } from '$lib/server/adminApi/writes/events';
import { bulkEventConfig } from '$lib/server/adminApi/writes/bulk';
import { writeSyncMemberStatus } from '$lib/server/adminApi/writes/sync';
import type { CellStatus } from '$lib/domain/eventPresence';
import { assertTestDatabase } from './testDatabase';

const stamp = Date.now();
const campusExternalName = `ATT_CAMPUS_${stamp}`;
const campusName = `Att Campus ${stamp}`;
// A catalogue word of this run's own: the catalogue is platform-wide and has no
// delete.
const stageWord = `4 - EN STAGE ${stamp}`;
const keys = [
  'met',
  'ready',
  'emarge',
  'cell',
  'closing',
  'workshop',
  'erased',
  'reset',
  'survivor',
  'absorbed',
] as const;
type Key = (typeof keys)[number];
const talents = keys.map((key) => ({
  external_id: `att_${key}_${stamp}`,
  first_name: 'Att',
  last_name: key,
  email: `att.${key}.${stamp}@example.test`,
}));
const ext = Object.fromEntries(
  keys.map((key, i) => [key, talents[i].external_id]),
) as Record<Key, string>;

// One past event per proof, so a proof never rides on another one's roster,
// and one event still to come.
const events = {
  club: { external_id: `att_club_${stamp}`, start_date: '2026-03-02' },
  emarge: { external_id: `att_emarge_${stamp}`, start_date: '2026-03-09' },
  closing: { external_id: `att_closing_${stamp}`, start_date: '2026-03-16' },
  workshop: { external_id: `att_workshop_${stamp}`, start_date: '2026-03-23' },
  cell: { external_id: `att_cell_${stamp}`, start_date: '2026-03-30' },
  erased: { external_id: `att_erased_${stamp}`, start_date: '2026-04-06' },
  reset: { external_id: `att_reset_${stamp}`, start_date: '2026-04-13' },
  merge: { external_id: `att_merge_${stamp}`, start_date: '2026-04-20' },
  upcoming: { external_id: `att_upcoming_${stamp}`, start_date: '2099-06-01' },
};
type EventKey = keyof typeof events;

describe('« venu », the attendance projection (integration)', () => {
  let campusId = '';
  const eventIds = {} as Record<EventKey, string>;
  const talentIds = {} as Record<Key, string>;
  const instanceSlug = `att-instance-${stamp}`;
  const activitySlug = `att-activity-${stamp}`;
  let templateId = '';
  let staffId = '';
  const staffUserId = `att-staff-${stamp}`;

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({
        data: { name: campusName, externalName: campusExternalName },
      })
    ).id;
    await syncEvents(
      Object.entries(events).map(([key, e]) => ({
        ...e,
        title: `Att ${key}`,
        campus_ext_name: campusExternalName,
        end_date: null,
      })),
    );
    for (const [key, e] of Object.entries(events))
      eventIds[key as EventKey] = (
        await prisma.event.findUniqueOrThrow({
          where: { externalId: e.external_id },
          select: { id: true },
        })
      ).id;
    await syncTalents(talents);
    for (const key of keys)
      talentIds[key] = (
        await prisma.talent.findUniqueOrThrow({
          where: { externalId: ext[key] },
          select: { id: true },
        })
      ).id;
    await prisma.bauth_user.create({
      data: {
        id: staffUserId,
        email: `att-staff-${stamp}@epitech.eu`,
        name: 'Att Staff',
        emailVerified: true,
      },
    });
    staffId = (
      await prisma.staffProfile.create({
        data: { userId: staffUserId, campusId, staffRole: 'dev' },
      })
    ).id;
    templateId = (
      await prisma.closing_Template.create({
        data: { key: `att_${stamp}`, label: `Att ${stamp}` },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      // By id: the erasure scrubs the external id it would be found by.
      const ours = { id: { in: Object.values(talentIds) } };
      const created = await prisma.talent.findMany({
        where: ours,
        select: { userId: true },
      });
      await prisma.closing_Record.deleteMany({ where: { campusId } });
      await prisma.closing_ResetEvent.deleteMany({
        where: { talentId: talentIds.closing },
      });
      await prisma.talentDeletionRequest.deleteMany({
        where: { talentId: ours.id },
      });
      await prisma.workshop_Participation.deleteMany({ where: { campusId } });
      await prisma.talent.deleteMany({ where: ours });
      await prisma.event.deleteMany({ where: { campusId } });
      await prisma.closing_Template.deleteMany({ where: { id: templateId } });
      await prisma.workshop_Activity.deleteMany({
        where: { slug: activitySlug },
      });
      await prisma.workshop_Instance.deleteMany({
        where: { slug: instanceSlug },
      });
      const userIds = created
        .map((t) => t.userId)
        .filter((id): id is string => id != null);
      await prisma.staffProfile.deleteMany({ where: { id: staffId } });
      await prisma.bauth_user.deleteMany({
        where: { id: { in: [...userIds, staffUserId] } },
      });
      await prisma.campus.delete({ where: { id: campusId } });
      await prisma.sync_MemberStatus.deleteMany({
        where: { status: stageWord },
      });
    } catch {
      // ignore: the test database is disposable
    }
  });

  /** Who came to this event, read the way every dev screen reads it. */
  const cameTo = async (event: EventKey, reference = new Date()) => {
    const rows = await prisma.participation.findMany({
      where: { eventId: eventIds[event], ...attendedBeforeWhere(reference) },
      select: { talent: { select: { externalId: true } } },
    });
    return rows.map((row) => row.talent.externalId).sort();
  };

  /** Open a closing the way the conduct page does, with nothing answered yet. */
  const startClosing = (talent: Key, event: EventKey) =>
    persistClosing({
      talentId: talentIds[talent],
      eventId: eventIds[event],
      campusId,
      staffId,
      templateId,
      grid: {
        templateId,
        key: `att_${stamp}`,
        label: `Att ${stamp}`,
        sections: [],
        synthesisSections: [],
      },
      form: {
        talentId: talentIds[talent],
        answers: {},
        recommendation: null,
        verdictNote: '',
      },
      mode: 'start',
    });

  /** Émarge a talent present on the morning of a single-day event. */
  const markPresent = (talent: Key, event: EventKey, status: CellStatus) =>
    writePresenceCell(
      {
        talentId: talentIds[talent],
        eventId: eventIds[event],
        day: new Date(`${events[event].start_date}T00:00:00Z`),
        slot: 'morning',
      },
      { status, source: 'manual', markedById: staffId },
    );

  it('counts a status the event attests as attended, MET by default', async () => {
    await syncParticipations(
      events.club.external_id,
      { [ext.met]: 'MET', [ext.ready]: 'READY' },
      'full',
    );
    expect(await cameTo('club')).toEqual([ext.met]);
  });

  it('follows a status changed in Salesforce at the next pass', async () => {
    await syncParticipations(
      events.club.external_id,
      { [ext.ready]: 'MET' },
      'incremental',
    );
    expect(await cameTo('club')).toEqual([ext.met, ext.ready].sort());

    await syncParticipations(
      events.club.external_id,
      { [ext.ready]: 'READY' },
      'incremental',
    );
    expect(await cameTo('club')).toEqual([ext.met]);
  });

  it('never counts an event that is not over, whatever proves it', async () => {
    await syncParticipations(
      events.upcoming.external_id,
      { [ext.met]: 'MET' },
      'full',
    );
    const row = await prisma.participation.findFirstOrThrow({
      where: { eventId: eventIds.upcoming, talentId: talentIds.met },
      select: { attendanceAttested: true },
    });
    // The proof is projected; « over » is applied on read.
    expect(row.attendanceAttested).toBe(true);
    expect(await cameTo('upcoming')).toEqual([]);
  });

  it('counts a half-day émargé present, on a status that attests nothing', async () => {
    await syncParticipations(
      events.emarge.external_id,
      { [ext.emarge]: 'READY' },
      'full',
    );
    expect(await cameTo('emarge')).toEqual([]);
    await markAllPresentInSlot(
      campusId,
      eventIds.emarge,
      new Date('2026-03-09T00:00:00Z'),
      'morning',
      null,
    );
    expect(await cameTo('emarge')).toEqual([ext.emarge]);
  });

  it('follows one cell marked and cleared, by a staff member or a scan', async () => {
    await syncParticipations(
      events.cell.external_id,
      { [ext.cell]: 'READY' },
      'full',
    );
    await markPresent('cell', 'cell', 'late');
    expect(await cameTo('cell')).toEqual([ext.cell]);
    await markPresent('cell', 'cell', 'pending');
    expect(await cameTo('cell')).toEqual([]);
    await markPresent('cell', 'cell', 'absent');
    expect(await cameTo('cell')).toEqual([]);
  });

  it('counts a closing, and forgets it once the closing is reset', async () => {
    await syncParticipations(
      events.closing.external_id,
      { [ext.closing]: 'READY' },
      'full',
    );
    await startClosing('closing', 'closing');
    expect(await cameTo('closing')).toEqual([ext.closing]);
    const closing = await prisma.closing_Record.findUniqueOrThrow({
      where: {
        talentId_eventId: {
          talentId: talentIds.closing,
          eventId: eventIds.closing,
        },
      },
      select: { id: true },
    });

    await resetClosing({
      closingId: closing.id,
      resetByStaffId: staffId,
      reason: 'Closing ouvert par erreur',
    });
    expect(await cameTo('closing')).toEqual([]);
  });

  it('does not count an activity: it is done from anywhere, after the event too', async () => {
    await syncParticipations(
      events.workshop.external_id,
      { [ext.workshop]: 'READY' },
      'full',
    );
    const instance = await prisma.workshop_Instance.create({
      data: { slug: instanceSlug, baseUrl: 'https://ctfd.example.test' },
    });
    const activity = await prisma.workshop_Activity.create({
      data: { slug: activitySlug, instanceId: instance.id, label: 'Att' },
    });
    await enterWorkshop(talentIds.workshop, {
      activityId: activity.id,
      activitySlug,
      instanceSlug,
      baseUrl: instance.baseUrl,
      eventId: eventIds.workshop,
      campusId,
    });
    await recomputeAttendance(prisma, { eventIds: [eventIds.workshop] });
    expect(await cameTo('workshop')).toEqual([]);
  });

  it('forgets a closing erased with its talent', async () => {
    await syncParticipations(
      events.erased.external_id,
      { [ext.erased]: 'READY' },
      'full',
    );
    await startClosing('erased', 'erased');
    expect(await cameTo('erased')).toEqual([ext.erased]);
    // The enrolment outlives the erasure on an event that has started; the
    // closing that proved the visit does not.
    await prisma.$transaction((tx) => anonymizeTalent(tx, talentIds.erased));
    expect(await cameTo('erased')).toEqual([]);
  });

  it('forgets the émargement a reset to import deletes', async () => {
    await syncParticipations(
      events.reset.external_id,
      { [ext.reset]: 'READY' },
      'full',
    );
    await markPresent('reset', 'reset', 'present');
    expect(await cameTo('reset')).toEqual([ext.reset]);
    await resetTalentToImport(talentIds.reset);
    expect(await cameTo('reset')).toEqual([]);
  });

  it("counts an absorbed talent's émargement on the survivor's own enrolment", async () => {
    await syncParticipations(
      events.merge.external_id,
      { [ext.survivor]: 'READY', [ext.absorbed]: 'READY' },
      'full',
    );
    await markPresent('absorbed', 'merge', 'present');
    expect(await cameTo('merge')).toEqual([ext.absorbed]);
    await prisma.$transaction((tx) =>
      mergeTalents(tx, talentIds.survivor, [talentIds.absorbed]),
    );
    expect(await cameTo('merge')).toEqual([ext.survivor]);
  });

  it('counts a visit only before the event looked at, never the same day', async () => {
    const clubDay = new Date('2026-03-02T00:00:00Z');
    const nextDay = new Date('2026-03-04T00:00:00Z');
    expect(await cameTo('club', clubDay)).toEqual([]);
    expect(await cameTo('club', nextDay)).toEqual([ext.met]);
  });

  it('lets the PO count another status as a visit over the admin API', async () => {
    await writeEventConfig({
      eventId: eventIds.club,
      attendanceStatuses: ['MET', 'ready'],
    });
    expect(await cameTo('club')).toEqual([ext.met, ext.ready].sort());
  });

  it('stops counting a status the event stops showing', async () => {
    await writeEventConfig({
      eventId: eventIds.club,
      shownStatuses: ['READY'],
    });
    const detail = await prisma.eventConfig_ShownStatus.findMany({
      where: { eventId: eventIds.club },
      select: { status: true, attestsAttendance: true },
    });
    expect(detail).toEqual([{ status: 'READY', attestsAttendance: true }]);
    // MET is masked now, so the talent who carries it is not shown at all.
    expect(await cameTo('club')).toEqual([ext.ready]);
    await writeEventConfig({
      eventId: eventIds.club,
      shownStatuses: ['READY', 'MET'],
      attendanceStatuses: ['MET'],
    });
    expect(await cameTo('club')).toEqual([ext.met]);
  });

  it('refuses to count a status the event does not show', async () => {
    await expect(
      writeEventConfig({
        eventId: eventIds.club,
        attendanceStatuses: ['CONNECTED'],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('counts a status on many events at once, in a plan', async () => {
    await writeSyncMemberStatus({ memberStatus: stageWord });
    const params = {
      eventIds: [eventIds.club, eventIds.emarge],
      showStatuses: [stageWord],
      attestStatuses: [stageWord],
    };
    const plan = await bulkEventConfig(params);
    if (plan.applied) throw new Error('a call without digest is a dry run');
    await bulkEventConfig({ ...params, planDigest: plan.planDigest });
    const rows = await prisma.eventConfig_ShownStatus.findMany({
      where: { status: stageWord },
      select: { eventId: true, attestsAttendance: true },
    });
    expect(rows.map((r) => r.attestsAttendance)).toEqual([true, true]);
    // What each event already counted is kept.
    expect(await cameTo('club')).toEqual([ext.met]);
  });

  it('refuses a catalogue word counted by default but masked by default', async () => {
    await expect(
      writeSyncMemberStatus({
        memberStatus: stageWord,
        shownByDefault: false,
        attestsByDefault: true,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
