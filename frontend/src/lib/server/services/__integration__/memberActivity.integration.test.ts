/**
 * One member's coverage, checked against real rows.
 *
 * Four things this pins, none of which a mocked client could settle.
 *
 * A FEATURE IS ONE ROW, WHATEVER ITS VOLUME. The answer used to be the forty
 * most recent gestures in reverse chronological order, so a member's tenth
 * export pushed their first out of the list and an absence meant nothing. The
 * fold is what makes the counts and the "never opened" set true at the same
 * time.
 *
 * DAYS OF ACTIVITY ARE DISTINCT DAYS. A login count answers "how much does this
 * person come" wrongly, because a session lives a fortnight, so the day count is
 * the figure the dialog leads with and it must not be a row count. Sessions stay
 * out of the feature list for the same reason: they are those two figures, not
 * something somebody chose to open.
 *
 * THE NEVER-OPENED SET FOLLOWS THE SPACES THE MEMBER WORKS IN. A `dev` is never
 * reproached for the admin catalogue they cannot reach, and an admin who
 * explores a campus produces dev-space rows against themselves, so their own
 * space is not the whole answer.
 *
 * AN EMPTY WINDOW IS NOT AN ABSENT MEMBER, AND IT IS NOT A VERDICT EITHER. A
 * member whose last visit predates the retention window answers with zeroes,
 * not with `null`: `null` is reserved for a profile that does not exist, which
 * is what lets the route tell a stale link apart from an outage. And the
 * never-opened set is EMPTY for them rather than full, because no row in the
 * window means nothing was measured, and naming their whole catalogue would
 * print an absence of measurement as an absence of use.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { StaffRole } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import {
  USAGE_FEATURES,
  USAGE_FEATURE_DEFS,
  USAGE_FEATURE_KEYS,
} from '$lib/domain/usage';
import { getMemberActivity } from '$lib/server/usage/memberActivity';

const stamp = Date.now();
const CAMPUS = `MemberActivity-${stamp}`;

const DAY = 86_400_000;
const TODAY = new Date();
const YESTERDAY = new Date(TODAY.getTime() - DAY);

const INSCRITS = USAGE_FEATURE_DEFS[USAGE_FEATURES.DEV_INSCRITS_VIEW].label;
const EXPORT = USAGE_FEATURE_DEFS[USAGE_FEATURES.DEV_INSCRITS_EXPORT].label;
const ACTIVITE =
  USAGE_FEATURE_DEFS[USAGE_FEATURES.ADMIN_STAFF_ACTIVITY_OPEN].label;

let campusId = '';
/** A dev, whose answer the fold and the day count are read off. */
let member = '';
/** An admin who explores a campus, so their rows span two spaces. */
let explorer = '';
/** A member with both dates set and nothing inside the window. */
let lapsed = '';
const staffIds: string[] = [];
const userIds: string[] = [];

async function seedStaff(n: number, staffRole: StaffRole) {
  const user = await prisma.bauth_user.create({
    data: {
      id: `member-activity-user-${stamp}-${n}`,
      email: `member-activity-${stamp}-${n}@epitech.eu`,
      name: `Member Activity ${n}`,
      emailVerified: true,
    },
  });
  userIds.push(user.id);
  const profile = await prisma.staffProfile.create({
    data: { userId: user.id, campusId, staffRole },
  });
  staffIds.push(profile.id);
  return profile.id;
}

function use(
  staffProfileId: string,
  feature: string,
  occurredAt: Date,
  key: string,
  impersonated = false,
) {
  return prisma.usage_FeatureUse.create({
    data: {
      feature,
      actorKind: 'staff',
      staffProfileId,
      campusId,
      impersonated,
      dedupeKey: `${stamp}-${key}`,
      occurredAt,
    },
  });
}

beforeAll(async () => {
  assertTestDatabase();

  const campus = await prisma.campus.create({
    data: { name: CAMPUS, timezone: 'Europe/Paris' },
  });
  campusId = campus.id;

  member = await seedStaff(1, 'dev');
  explorer = await seedStaff(2, 'admin');
  lapsed = await seedStaff(3, 'dev');

  // Two calendar days, two logins, and a feature opened more often than the one
  // beside it so the ordering has something to order.
  await use(member, USAGE_FEATURES.DEV_SESSION, YESTERDAY, 'm-s1');
  await use(member, USAGE_FEATURES.DEV_SESSION, TODAY, 'm-s2');
  await use(member, USAGE_FEATURES.DEV_INSCRITS_VIEW, YESTERDAY, 'm-v1');
  await use(member, USAGE_FEATURES.DEV_INSCRITS_VIEW, TODAY, 'm-v2');
  await use(member, USAGE_FEATURES.DEV_INSCRITS_VIEW, TODAY, 'm-v3');
  await use(member, USAGE_FEATURES.DEV_INSCRITS_EXPORT, TODAY, 'm-e1');

  // An admin's own space, plus the dev-space rows an exploration attributes to
  // them.
  await use(explorer, USAGE_FEATURES.ADMIN_SESSION, TODAY, 'x-s1');
  await use(explorer, USAGE_FEATURES.ADMIN_STAFF_ACTIVITY_OPEN, TODAY, 'x-a1');
  await use(explorer, USAGE_FEATURES.DEV_INSCRITS_VIEW, TODAY, 'x-v1', true);
  await use(explorer, USAGE_FEATURES.DEV_INSCRITS_VIEW, TODAY, 'x-v2', true);
});

afterAll(async () => {
  await prisma.usage_FeatureUse.deleteMany({ where: { campusId } });
  await prisma.staffProfile.deleteMany({ where: { id: { in: staffIds } } });
  await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.campus.delete({ where: { id: campusId } });
});

describe('getMemberActivity', () => {
  it('folds the rows per feature, busiest first, sessions excluded', async () => {
    const activity = await getMemberActivity(member);
    expect(activity).not.toBeNull();

    expect(activity!.features.map((f) => f.libelle)).toEqual([
      INSCRITS,
      EXPORT,
    ]);
    expect(activity!.features[0].utilisations).toBe(3);
    expect(activity!.features[0].espace).toBe('Espace dev');
    expect(activity!.features[1].utilisations).toBe(1);

    // The two session rows are the counters below, never a thirteenth feature.
    expect(
      activity!.features.some((f) => f.libelle.startsWith('Connexions')),
    ).toBe(false);
  });

  it('counts days of activity, not rows', async () => {
    // Six rows over two calendar days. Counting rows would report six, which is
    // the number that makes a fortnightly visitor look daily.
    const activity = await getMemberActivity(member);
    expect(activity!.activeDays).toBe(2);
    expect(activity!.loginCount).toBe(2);
  });

  it('keeps the impersonated rows and says how many of the count they are', async () => {
    // The recorder attributes them to the admin doing the impersonating, never
    // to the person being explored, so on this member's own dialog it is their
    // own work. The aggregates drop these rows; this surface must not.
    const activity = await getMemberActivity(explorer);
    const inscrits = activity!.features.find((f) => f.libelle === INSCRITS);
    expect(inscrits?.utilisations).toBe(2);
    expect(inscrits?.enExploration).toBe(2);

    const own = activity!.features.find((f) => f.libelle === ACTIVITE);
    expect(own?.enExploration).toBe(0);
  });

  it('never reproaches a dev for the admin catalogue', async () => {
    const activity = await getMemberActivity(member);
    const missing = activity!.jamaisOuvertes;

    // Everything it names belongs to the space this member actually works in.
    expect(missing.every((f) => f.espace === 'Espace dev')).toBe(true);
    // And what they have used is not in it.
    expect(missing.map((f) => f.libelle)).not.toContain(INSCRITS);
    expect(missing.map((f) => f.libelle)).not.toContain(EXPORT);
    expect(missing.length).toBeGreaterThan(0);
  });

  it('spans both spaces for an admin who explores a campus', async () => {
    const activity = await getMemberActivity(explorer);
    const spaces = new Set(activity!.jamaisOuvertes.map((f) => f.espace));

    expect(spaces).toContain('Espace admin');
    // Not their own space: an exploration produced dev-space rows against them,
    // so the dev catalogue is theirs to be measured against too.
    expect(spaces).toContain('Espace dev');
    expect(spaces).not.toContain('Espace talent');

    const labels = activity!.jamaisOuvertes.map((f) => f.libelle);
    expect(labels).not.toContain(INSCRITS);
    expect(labels).not.toContain(ACTIVITE);
    // The export is dev-space and untouched by this member, so it is precisely
    // what the set exists to name.
    expect(labels).toContain(EXPORT);
  });

  it('answers zeroes, not null, for a member with nothing in the window', async () => {
    const activity = await getMemberActivity(lapsed);

    expect(activity).not.toBeNull();
    expect(activity!.activeDays).toBe(0);
    expect(activity!.loginCount).toBe(0);
    expect(activity!.features).toEqual([]);
  });

  it('names nothing when nothing was measured', async () => {
    const activity = await getMemberActivity(lapsed);

    // NOT the whole dev catalogue. This member has no row in the window, so
    // what they have or have not opened is unmeasured, and answering it with
    // every feature they work with reads as a verdict on somebody the data says
    // nothing about. The member who HAS rows, above, is the one this set is
    // for - and it is non-empty there, so this is not an assertion that the
    // query is broken.
    expect(activity!.jamaisOuvertes).toEqual([]);

    const devKeys = USAGE_FEATURE_KEYS.filter((key) => {
      const definition = USAGE_FEATURE_DEFS[key];
      return (
        definition.audience === 'staff' &&
        definition.kind !== 'session' &&
        definition.space === 'dev'
      );
    });
    expect(devKeys.length).toBeGreaterThan(0);
  });

  it('is null for a profile that does not exist', async () => {
    // The route answers 404 off this, so a stale link stops rendering as the
    // same « Chargement impossible » a database outage would.
    expect(await getMemberActivity(`missing-${stamp}`)).toBeNull();
  });
});
