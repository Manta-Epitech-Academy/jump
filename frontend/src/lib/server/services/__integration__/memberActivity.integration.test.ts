/**
 * One member's activity, checked against real rows.
 *
 * Three things this pins, each of which the previous shape got wrong and none of
 * which a mocked client could have settled.
 *
 * CONNECTIONS ARE THEIR OWN LIST. They used to come from `bauth_session`, which
 * the schema says twice is not a login history, and they now come from the
 * session keys. Mixed back into the feature list they are unfindable: page views
 * outnumber logins by an order of magnitude and the list is capped, so the cap
 * alone would hide them.
 *
 * DAYS OF ACTIVITY ARE DISTINCT DAYS. A login count answers "how much does this
 * person come" wrongly, because a session lives a fortnight, so the day count is
 * the figure the dialog leads with and it must not be a row count.
 *
 * THE FIGURES ARE NOT CAPPED. Both lists are, deliberately. A count that stopped
 * at the cap would report a plateau for exactly the members who use Jump most.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  getMemberActivity,
  MEMBER_SESSIONS_LIMIT,
} from '$lib/server/usage/memberActivity';

const stamp = Date.now();
const CAMPUS = `MemberActivity-${stamp}`;

const DAY = 86_400_000;
const TODAY = new Date();
const YESTERDAY = new Date(TODAY.getTime() - DAY);

let campusId = '';
/** The member whose answer every shape assertion reads. */
let member = '';
/** A second member, used for the cap and to prove the scope is per person. */
let heavyUser = '';
const staffIds: string[] = [];
const userIds: string[] = [];

async function seedStaff(n: number) {
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
    data: { userId: user.id, campusId, staffRole: 'dev' },
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

  member = await seedStaff(1);
  heavyUser = await seedStaff(2);

  // Two days, two logins, two feature uses, one of them under impersonation.
  await use(member, USAGE_FEATURES.DEV_SESSION, YESTERDAY, 'm-s1');
  await use(member, USAGE_FEATURES.DEV_INSCRITS_VIEW, YESTERDAY, 'm-v1');
  await use(member, USAGE_FEATURES.ADMIN_SESSION, TODAY, 'm-s2');
  await use(member, USAGE_FEATURES.DEV_INSCRITS_EXPORT, TODAY, 'm-v2', true);

  // One day, more logins than the list can show.
  for (let i = 0; i < MEMBER_SESSIONS_LIMIT + 5; i += 1) {
    await use(heavyUser, USAGE_FEATURES.DEV_SESSION, TODAY, `h-s${i}`);
  }
});

afterAll(async () => {
  await prisma.usage_FeatureUse.deleteMany({ where: { campusId } });
  await prisma.staffProfile.deleteMany({ where: { id: { in: staffIds } } });
  await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.campus.delete({ where: { id: campusId } });
});

describe('getMemberActivity', () => {
  it('lists the logins apart from the features, and names the space of each', async () => {
    const activity = await getMemberActivity(member);

    expect(activity.sessions).toHaveLength(2);
    // Newest first, and the space is what differs between two rows that would
    // otherwise both read "Connexions à l'espace…".
    expect(activity.sessions[0].espace).toBe('Espace admin');
    expect(activity.sessions[1].espace).toBe('Espace dev');

    // And the same rows must NOT appear a second time among the features.
    expect(activity.uses).toHaveLength(2);
    const labels = activity.uses.map((u) => u.libelle);
    expect(labels.some((label) => label.startsWith('Connexions'))).toBe(false);
  });

  it('counts days of activity, not rows', async () => {
    // Four rows over two calendar days. Counting rows would report four, which
    // is the number that makes a fortnightly visitor look daily.
    const activity = await getMemberActivity(member);
    expect(activity.activeDays).toBe(2);
    expect(activity.loginCount).toBe(2);
  });

  it('keeps an impersonated row, and says so', async () => {
    // The recorder attributes it to the admin doing the impersonating, never to
    // the member being explored, so on this member's own dialog it is their own
    // work. The aggregates drop these rows; this surface must not.
    const activity = await getMemberActivity(member);
    const explored = activity.uses.filter((u) => u.impersonated);
    expect(explored).toHaveLength(1);
  });

  it('counts every login in the window, not only the ones it lists', async () => {
    const activity = await getMemberActivity(heavyUser);
    expect(activity.sessions).toHaveLength(MEMBER_SESSIONS_LIMIT);
    expect(activity.loginCount).toBe(MEMBER_SESSIONS_LIMIT + 5);
    // One member's volume must never leak into another's answer.
    expect(activity.activeDays).toBe(1);
  });
});
