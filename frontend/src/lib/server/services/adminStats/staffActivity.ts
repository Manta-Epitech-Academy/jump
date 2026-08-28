/**
 * Whether the team actually logs in, per campus and per role. No names.
 *
 * `StaffProfile` carried no activity column at all before this branch, so there
 * was no way to tell an account invited and never opened from one in daily use,
 * and no way to see a campus that had quietly stopped using Jump. Both are
 * management questions with an operational answer, which is why this is core-tier
 * and not leadership: it is about staffing and enablement, not about the cohort.
 *
 * It reads the two projections on `StaffProfile` rather than the usage rows, and
 * that is the whole reason those columns exist: raw usage is purged at 60 days,
 * so a MAX over it would report "never opened" for anyone who last logged in two
 * months ago, which is precisely the person worth finding.
 *
 * No names, per the tier's rule, and the counts are the useful shape anyway: the
 * question is "combien" and "où", and an admin who needs the person opens
 * `/staff/admin/users`, where the same figures are per row.
 */

import { prisma } from '$lib/server/db';
import type { StaffRole } from '@prisma/client';
import {
  median,
  metric,
  share,
  type Metric,
} from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';

const NEVER_RULE =
  "Un compte dont aucune connexion réelle n'a jamais été enregistrée. Les sessions d'impersonation ne comptent pas : un administrateur qui teste l'espace d'un membre n'est pas ce membre qui se connecte.";

const INACTIVE_DAYS = 30;
const ACTIVE_DAYS = 7;

export type StaffActivityRow = {
  campus: string;
  effectif: number;
  jamaisConnectes: number;
  actifs7Jours: number;
  inactifs30Jours: number;
  partJamaisConnectes: number | null;
  medianeJoursDepuisActivite: number | null;
};

export type StaffActivity = {
  filters: { campus: string };
  effectif: Metric<number>;
  jamaisConnectes: Metric<number>;
  actifs7Jours: Metric<number>;
  inactifs30Jours: Metric<number>;
  medianeJoursDepuisActivite: Metric<number | null>;
  parCampus: Metric<StaffActivityRow[]>;
  parRole: Metric<
    { role: string; effectif: number; jamaisConnectes: number }[]
  >;
};

const daysSince = (date: Date, now: Date) =>
  Math.floor((now.getTime() - date.getTime()) / 86_400_000);

export async function getStaffActivity(
  scope: Scope = {},
): Promise<StaffActivity> {
  const now = new Date();
  const members = await prisma.staffProfile.findMany({
    where: {
      // A profile with no role is blocked from every space, so counting it would
      // report a dormant account as an inactive member. `getStaffRoleRedirectPath`
      // is the other end of that same rule.
      staffRole: { not: null },
      ...(scope.campus ? { campusId: scope.campus.id } : {}),
    },
    select: {
      staffRole: true,
      lastActiveAt: true,
      firstLoginAt: true,
      campus: { select: { name: true } },
    },
  });

  const never = members.filter((m) => m.firstLoginAt === null);
  const active = members.filter(
    (m) => m.lastActiveAt && daysSince(m.lastActiveAt, now) <= ACTIVE_DAYS,
  );
  const inactive = members.filter(
    (m) => m.lastActiveAt && daysSince(m.lastActiveAt, now) > INACTIVE_DAYS,
  );
  const ages = members
    .map((m) => m.lastActiveAt)
    .filter((d): d is Date => d !== null)
    .map((d) => daysSince(d, now));

  const byCampus = new Map<string, typeof members>();
  for (const m of members) {
    // Deliberately a bucket of its own rather than folded into a campus: a member
    // with no campus is a real state (a national account), and hiding them in
    // another campus's row would misstate both.
    const key = m.campus?.name ?? 'sans campus';
    byCampus.set(key, [...(byCampus.get(key) ?? []), m]);
  }

  const byRole = new Map<StaffRole, typeof members>();
  for (const m of members) {
    if (!m.staffRole) continue;
    byRole.set(m.staffRole, [...(byRole.get(m.staffRole) ?? []), m]);
  }

  return {
    filters: { campus: scope.campus?.name ?? 'tous' },
    effectif: metric(
      members.length,
      "Les membres de l'équipe ayant un rôle. Un profil sans rôle est bloqué sur tous les espaces, donc le compter reviendrait à signaler un compte dormant comme un membre inactif.",
    ),
    jamaisConnectes: metric(never.length, NEVER_RULE),
    actifs7Jours: metric(
      active.length,
      `Les membres dont une requête réelle a été enregistrée dans les ${ACTIVE_DAYS} derniers jours. L'activité est horodatée au plus une fois par jour et par personne, donc ce chiffre compte des jours de présence, pas des clics.`,
    ),
    inactifs30Jours: metric(
      inactive.length,
      `Les membres déjà connectés une fois mais dont la dernière activité dépasse ${INACTIVE_DAYS} jours. Distinct des jamais connectés : ceux-là n'ont jamais ouvert leur compte, ceux-ci l'ont abandonné.`,
    ),
    medianeJoursDepuisActivite: metric(
      median(ages),
      "Le nombre médian de jours depuis la dernière activité, parmi les membres déjà connectés une fois. Médiane et non moyenne : quelques comptes très anciens tireraient une moyenne vers le haut et feraient passer une équipe active pour une équipe décrochée. Vaut null si personne ne s'est jamais connecté.",
    ),
    parCampus: metric(
      [...byCampus.entries()]
        .map(([campus, list]) => ({
          campus,
          effectif: list.length,
          jamaisConnectes: list.filter((m) => m.firstLoginAt === null).length,
          actifs7Jours: list.filter(
            (m) =>
              m.lastActiveAt && daysSince(m.lastActiveAt, now) <= ACTIVE_DAYS,
          ).length,
          inactifs30Jours: list.filter(
            (m) =>
              m.lastActiveAt && daysSince(m.lastActiveAt, now) > INACTIVE_DAYS,
          ).length,
          partJamaisConnectes: share(
            list.filter((m) => m.firstLoginAt === null).length,
            list.length,
          ),
          medianeJoursDepuisActivite: median(
            list
              .map((m) => m.lastActiveAt)
              .filter((d): d is Date => d !== null)
              .map((d) => daysSince(d, now)),
          ),
        }))
        .sort((a, b) => a.campus.localeCompare(b.campus, 'fr')),
      "Un campus par ligne, avec sa part de comptes jamais ouverts. « sans campus » est une ligne à part et non un oubli : un compte national n'a pas de campus, et le ranger dans celui d'un autre fausserait les deux.",
    ),
    parRole: metric(
      [...byRole.entries()]
        .map(([role, list]) => ({
          role,
          effectif: list.length,
          jamaisConnectes: list.filter((m) => m.firstLoginAt === null).length,
        }))
        .sort((a, b) => a.role.localeCompare(b.role)),
      "Un rôle par ligne. Les rôles sont ceux de l'enum interne, pas des intitulés de poste.",
    ),
  };
}
