import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod';
import { prisma } from '$lib/server/db';
import {
  FEATURE_FLAGS,
  FLAG_KEYS,
  type FlagKey,
} from '$lib/domain/featureFlags';

const campusSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').trim(),
  externalName: z.string().trim().nullable().default(null),
  timezone: z.string().min(1).default('Europe/Paris'),
  flags: z.array(z.enum(FLAG_KEYS as [FlagKey, ...FlagKey[]])).default([]),
});

type CampusFormData = z.infer<typeof campusSchema>;

function computeEffectiveFlags(
  overrides: ReadonlyArray<{ flagKey: string; enabled: boolean }>,
): FlagKey[] {
  const overrideMap = new Map(overrides.map((o) => [o.flagKey, o.enabled]));
  return FLAG_KEYS.filter((key) => {
    const def = FEATURE_FLAGS[key];
    return overrideMap.has(key) ? overrideMap.get(key)! : def.defaultEnabled;
  });
}

async function syncCampusFlags(campusId: string, submitted: FlagKey[]) {
  const submittedSet = new Set(submitted);
  const existing = await prisma.campusFeatureFlag.findMany({
    where: { campusId },
    select: { flagKey: true, enabled: true },
  });
  const existingMap = new Map(existing.map((e) => [e.flagKey, e.enabled]));

  const upserts: { flagKey: string; enabled: boolean }[] = [];
  const deletes: string[] = [];

  for (const key of FLAG_KEYS) {
    const def = FEATURE_FLAGS[key];
    const desired = submittedSet.has(key);
    const differsFromDefault = desired !== def.defaultEnabled;

    if (differsFromDefault) {
      const current = existingMap.get(key);
      if (current !== desired) upserts.push({ flagKey: key, enabled: desired });
    } else if (existingMap.has(key)) {
      deletes.push(key);
    }
  }

  await prisma.$transaction([
    ...upserts.map((u) =>
      prisma.campusFeatureFlag.upsert({
        where: { campusId_flagKey: { campusId, flagKey: u.flagKey } },
        update: { enabled: u.enabled },
        create: { campusId, flagKey: u.flagKey, enabled: u.enabled },
      }),
    ),
    ...deletes.map((key) =>
      prisma.campusFeatureFlag.delete({
        where: { campusId_flagKey: { campusId, flagKey: key } },
      }),
    ),
  ]);
}

export const load: PageServerLoad = async () => {
  const campuses = await prisma.campus.findMany({
    orderBy: { name: 'asc' },
    include: {
      featureFlags: { select: { flagKey: true, enabled: true } },
    },
  });

  const campusesWithFlags = campuses.map((c) => ({
    id: c.id,
    name: c.name,
    externalName: c.externalName,
    timezone: c.timezone,
    flags: computeEffectiveFlags(c.featureFlags),
  }));

  const form = await superValidate(zod4(campusSchema));

  return { campuses: campusesWithFlags, form, flagDefs: FEATURE_FLAGS };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const form = await superValidate(request, zod4(campusSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const created = await prisma.campus.create({
        data: {
          name: form.data.name,
          externalName: form.data.externalName || null,
          timezone: form.data.timezone,
        },
      });
      await syncCampusFlags(created.id, form.data.flags as FlagKey[]);
      return message(form, 'Campus créé avec succès.');
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la création du campus.', {
        status: 500,
      });
    }
  },

  update: async ({ request }) => {
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(campusSchema));
    const id = formData.get('id') as string;

    if (!form.valid || !id) return fail(400, { form });

    try {
      await prisma.campus.update({
        where: { id },
        data: {
          name: form.data.name,
          externalName: form.data.externalName || null,
          timezone: form.data.timezone,
        },
      });
      await syncCampusFlags(id, form.data.flags as FlagKey[]);
      return message(form, 'Campus mis à jour.');
    } catch (err) {
      return message(form, 'Erreur lors de la mise à jour.', { status: 500 });
    }
  },

  delete: async ({ url }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);

    try {
      // SECURITY : Check if the campus is used before deleting
      const [participationsUsed, eventsUsed, staffUsed] = await Promise.all([
        prisma.participation.count({ where: { campusId: id } }),
        prisma.event.count({ where: { campusId: id } }),
        prisma.staffProfile.count({ where: { campusId: id } }),
      ]);

      if (participationsUsed > 0 || eventsUsed > 0 || staffUsed > 0) {
        return fail(400, {
          message: `Suppression impossible : Ce campus contient ${participationsUsed} participations, ${eventsUsed} événements et ${staffUsed} membres du staff.`,
        });
      }

      await prisma.campus.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      return fail(500, { message: 'Erreur lors de la suppression.' });
    }
  },
};
