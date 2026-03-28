import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import {
  createAllContexts,
  refreshAll,
  setLocals,
  exportAllCookies,
  getSystemClient,
  applyRouteGuards,
} from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  const cookieHeader = event.request.headers.get('cookie') || '';
  const { adminPb, staffPb, studentPb } = createAllContexts(cookieHeader);
  const systemPb = await getSystemClient();

  await refreshAll(adminPb, staffPb, studentPb);
  setLocals(event, adminPb, staffPb, studentPb, systemPb);

  const guardResponse = applyRouteGuards(event);
  if (guardResponse) return guardResponse;

  const response = await resolve(event);
  exportAllCookies(response, adminPb, staffPb, studentPb, dev);

  return response;
};
