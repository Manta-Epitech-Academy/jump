import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import {
  containsToken,
  everyTokenMatches,
  talentSearchWhere,
} from '$lib/server/db/textSearch';
import { requireAdminSession } from '$lib/server/auth/guards';
import { getStaffRoleLabel } from '$lib/domain/staff';
import { niveauLabel } from '$lib/domain/niveau';

// Global "find a person" typeahead for the admin command palette. Admin is
// campus-agnostic, so this is intentionally un-scoped. Three kinds in one call:
// talents, their parent-1 contacts, and staff members. Each result carries the
// `navQ` to drop into the destination list's `?q=` so the palette stays dumb.
const LIMIT = 6;

const fullName = (prenom: string | null, nom: string | null) =>
  `${prenom ?? ''} ${nom ?? ''}`.trim();

export const GET: RequestHandler = async ({ url, locals }) => {
  requireAdminSession(locals);

  // Word by word, like the talents directory the result links into, so
  // "Dupont Léa" finds Léa Dupont whichever kind of person she is.
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < 2) return json([]);

  const [talents, parents, staff] = await Promise.all([
    prisma.talent.findMany({
      where: talentSearchWhere(q),
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      take: LIMIT,
      select: {
        id: true,
        nom: true,
        prenom: true,
        user: { select: { email: true } },
        niveau: true,
      },
    }),
    // Parent-1 only: the active guardian flow (parent-2 accounts are action-less).
    prisma.talent.findMany({
      where: {
        AND: everyTokenMatches(q, (token) => [
          { parentEmail: containsToken(token) },
          { parentNom: containsToken(token) },
          { parentPrenom: containsToken(token) },
        ]),
      },
      orderBy: [{ parentNom: 'asc' }],
      take: LIMIT,
      select: {
        id: true,
        nom: true,
        prenom: true,
        user: { select: { email: true } },
        parentEmail: true,
        parentNom: true,
        parentPrenom: true,
      },
    }),
    prisma.bauth_user.findMany({
      where: {
        staffProfile: { isNot: null },
        AND: everyTokenMatches(q, (token) => [
          { name: containsToken(token) },
          { email: containsToken(token) },
        ]),
      },
      orderBy: { name: 'asc' },
      take: LIMIT,
      select: {
        id: true,
        name: true,
        email: true,
        staffProfile: {
          select: { staffRole: true, campus: { select: { name: true } } },
        },
      },
    }),
  ]);

  const results = [
    ...talents.map((t) => ({
      type: 'talent' as const,
      id: t.id,
      name: fullName(t.prenom, t.nom),
      email: t.user?.email ?? null,
      sub: t.niveau ? niveauLabel(t.niveau) : null,
      navQ: t.user?.email || fullName(t.prenom, t.nom),
    })),
    ...parents.map((t) => ({
      type: 'parent' as const,
      id: t.id,
      name: fullName(t.parentPrenom, t.parentNom) || t.parentEmail || 'Parent',
      email: t.parentEmail,
      sub: `Parent de ${fullName(t.prenom, t.nom)}`,
      // A parent isn't a row of its own: jump to the child in the directory.
      navQ: t.user?.email || fullName(t.prenom, t.nom),
    })),
    ...staff.map((s) => ({
      type: 'staff' as const,
      id: s.id,
      name: s.name || s.email || 'Staff',
      email: s.email,
      // Staff belong to a campus (a real attribute, unlike talents who float
      // across them), so append it to disambiguate same-named colleagues.
      sub: [
        getStaffRoleLabel(s.staffProfile?.staffRole),
        s.staffProfile?.campus?.name,
      ]
        .filter(Boolean)
        .join(' · '),
      navQ: s.email ?? s.name ?? '',
    })),
  ];

  return json(results);
};
