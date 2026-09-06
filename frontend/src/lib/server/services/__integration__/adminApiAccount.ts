/**
 * The staff account the curated admin API accepts, for the tests that mint a
 * token against it.
 *
 * A `bauth_user` row on its own is not an admin here, any more than it is
 * anywhere else in Jump: the role lives on `StaffProfile`, and `verifyToken`
 * re-reads it on every call so a demotion cuts the credential. Four integration
 * suites need that fixture, so the rule is stated once and they share it: the
 * day it changes there is one place to fix, not four that quietly disagree.
 */

import { prisma } from '$lib/server/db';

export function createAdminAccount(email: string) {
  return prisma.bauth_user.create({
    data: {
      email,
      role: 'admin',
      staffProfile: { create: { staffRole: 'admin' } },
    },
  });
}
