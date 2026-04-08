import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { auth } from '$lib/server/auth';
import { prisma } from '$lib/server/db';
import { applyRouteGuards } from '$lib/server/auth/guards';

const i18nHandle: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
    event.request = localizedRequest;
    return resolve(event, {
      transformPageChunk: ({ html }) =>
        html.replace('%lang%', locale).replace('%dir%', 'ltr'),
    });
  });

const authHandle: Handle = async ({ event, resolve }) => {
  const sessionData = await auth.api.getSession({
    headers: event.request.headers,
  });

  event.locals.user = sessionData?.user ?? null;
  event.locals.session = sessionData?.session ?? null;
  event.locals.staffProfile = null;
  event.locals.studentProfile = null;

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

  const guardResponse = applyRouteGuards(event);
  if (guardResponse) return guardResponse;

  return resolve(event);
};

export const handle: Handle = sequence(i18nHandle, authHandle);
