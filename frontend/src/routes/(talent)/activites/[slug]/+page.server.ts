import type { Actions, PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import {
  WORKSHOP_TICKET_SECRET,
  WORKSHOP_TICKET_KEY_ID,
} from '$app/env/private';
import { recordUsage } from '#lib/server/usage/record.ts';
import { USAGE_FEATURES } from '#lib/domain/usage.ts';
import {
  enterWorkshop,
  resolveWorkshopEntry,
} from '#lib/server/services/workshopService.ts';
import {
  mintWorkshopTicket,
  workshopDisplayName,
} from '#lib/server/workshops/ticket.ts';

/**
 * Action-only route, like `/staff/settings`: the control lives on the talent
 * dashboard, so a direct GET has no page to render and bounces home.
 *
 * A POST and not a link, and that is the load-bearing part. `load` runs on
 * SvelteKit's speculative hover-preload, so an entry behind a `GET` would mint a
 * ticket, and open a participation, for a talent who merely moved the mouse over
 * the card. The minigame play page carries the same scar in a comment.
 */
export const load: PageServerLoad = async () => {
  throw redirect(303, '/');
};

export const actions: Actions = {
  default: async ({ params, locals }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');

    const secret = WORKSHOP_TICKET_SECRET;
    const kid = WORKSHOP_TICKET_KEY_ID;
    if (!secret || !kid) {
      console.error(
        '[workshops] WORKSHOP_TICKET_SECRET / WORKSHOP_TICKET_KEY_ID not configured.',
      );
      throw error(503, 'Les activités sont momentanément indisponibles.');
    }

    // The gate: only an activity one of the talent's own events offers. An
    // unknown slug, a switched-off activity and one nobody offered them
    // are one refusal on purpose, so the answer tells a prober nothing.
    const entry = await resolveWorkshopEntry(locals.talent.id, params.slug);
    if (!entry) {
      throw error(
        403,
        "Cette activité n'est pas proposée par tes événements. Passe par ta page d'accueil.",
      );
    }

    const session = await enterWorkshop(locals.talent.id, entry);

    const token = mintWorkshopTicket({
      talentId: locals.talent.id,
      displayName: workshopDisplayName(locals.talent.prenom, locals.talent.nom),
      slug: entry.instanceSlug,
      content: entry.activitySlug,
      kid,
      secret,
      session,
    });

    // After the mint, like the minigame's `play` action: what is catalogued is an
    // opening that actually happened.
    recordUsage(USAGE_FEATURES.TALENT_WORKSHOP_OPEN, {
      locals,
      eventId: entry.eventId,
    });

    // The one external destination is the instance this entry resolved to: a
    // curated `Workshop_Instance` row, never anything the request carried.
    throw redirect(303, `${entry.baseUrl}/jump/enter?t=${token}`, {
      external: [new URL(entry.baseUrl).origin],
    });
  },
};
