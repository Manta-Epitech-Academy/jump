import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { getStaffRoleLabel } from '$lib/domain/staff';
import { niveauLabel } from '$lib/domain/niveau';

// Global "find a person" typeahead for the admin command palette. Admin is
// campus-agnostic, so this is intentionally un-scoped (unlike /api/students,
// which scopes to the dev/pedago caller's campus). Three kinds in one call:
// talents, their parent-1 contacts, and staff members. Each result carries the
// `navQ` to drop into the destination list's `?q=` so the palette stays dumb.
const LIMIT = 6;

const fullName = (prenom: string | null, nom: string | null) =>
  `${prenom ?? ''} ${nom ?? ''}`.trim();

export const GET: RequestHandler = async ({ url, locals }) => {
  if (locals.staffProfile?.staffRole !== 'admin') {
    return new Response('Unauthorized', { status: 401 });
  }

  // Same sanitization as the talents directory search (keeps `@` and `.` so an
  // email query survives).
  const q = (url.searchParams.get('q') ?? '')
    .replace(/[^a-zA-ZÀ-ÿ0-9\s'@.\-]/g, '')
    .trim();
  if (q.length < 2) return json([]);

  const contains = { contains: q, mode: 'insensitive' as const };

  const [talents, parents, staff] = await Promise.all([
    prisma.talent.findMany({
      where: {
        OR: [{ nom: contains }, { prenom: contains }, { email: contains }],
      },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      take: LIMIT,
      select: { id: true, nom: true, prenom: true, email: true, niveau: true },
    }),
    // Parent-1 only — the active guardian flow (parent-2 accounts are action-less).
    prisma.talent.findMany({
      where: {
        OR: [
          { parentEmail: contains },
          { parentNom: contains },
          { parentPrenom: contains },
        ],
      },
      orderBy: [{ parentNom: 'asc' }],
      take: LIMIT,
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        parentEmail: true,
        parentNom: true,
        parentPrenom: true,
      },
    }),
    prisma.bauth_user.findMany({
      where: {
        staffProfile: { isNot: null },
        OR: [{ name: contains }, { email: contains }],
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
      email: t.email,
      sub: t.niveau ? niveauLabel(t.niveau) : null,
      navQ: t.email || fullName(t.prenom, t.nom),
    })),
    ...parents.map((t) => ({
      type: 'parent' as const,
      id: t.id,
      name: fullName(t.parentPrenom, t.parentNom) || t.parentEmail || 'Parent',
      email: t.parentEmail,
      sub: `Parent de ${fullName(t.prenom, t.nom)}`,
      // A parent isn't a row of its own — jump to the child in the directory.
      navQ: t.email || fullName(t.prenom, t.nom),
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
