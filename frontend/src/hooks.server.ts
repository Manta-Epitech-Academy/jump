import type { Handle } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { prisma } from '$lib/server/db';
import { applyRouteGuards } from '$lib/server/auth/guards';

export const handle: Handle = async ({ event, resolve }) => {
  // 1. Get session from BetterAuth
  const sessionData = await auth.api.getSession({
    headers: event.request.headers,
  });

  event.locals.user = sessionData?.user ?? null;
  event.locals.session = sessionData?.session ?? null;
  event.locals.staffProfile = null;
  event.locals.studentProfile = null;

  // 2. Load domain profiles — check both since the cached role may be stale
  if (event.locals.user) {
    event.locals.staffProfile = await prisma.staffProfile.findUnique({
      where: { userId: event.locals.user.id },
      include: { campus: true },
    });

    event.locals.studentProfile = await prisma.studentProfile.findUnique({
      where: { userId: event.locals.user.id },
      include: { campus: true },
    });
  }

  // 3. Route guards
  const guardResponse = applyRouteGuards(event);
  if (guardResponse) return guardResponse;

  return resolve(event);
};
