/**
 * What the admin space stores rather than computes: the shared file library, the
 * welcome pages the CMS editor writes, the images embedded in them, and the
 * impersonation audit.
 *
 * All four tables were empty on every profile, and each is empty in a way that
 * reads as working. A file library with no file, a welcome page nobody wrote and
 * an impersonation audit with nothing in it all render as a tidy empty state,
 * so the only way to find out the screen was never exercised is to put a row in
 * it. `AdminFile.uploadedById` in particular used to CASCADE - deleting one
 * account destroyed the files that person had put in a shared library - and the
 * `SetNull` that replaced it has no visible effect until a row carries a null.
 *
 * The bytes are not here. `s3Key` names an object in the bucket, and a seeded
 * environment has no bucket behind it: the rows exist so the lists, the counts,
 * the sorting and the « ancien membre » rendering have something to work on,
 * and a download resolves to nothing. That is the same trade `signatureKey` and
 * `rulesFilePath` already make.
 */

import type { World, StaffRef, EventRef } from '../world';
import { id } from '../ids';

/** The one slug the welcome-pages editor writes. */
const WELCOME_SLUG = 'welcome';

const LIBRARY_FILES = [
  {
    key: 'plaquette',
    name: 'Plaquette Epitech Academy 2026.pdf',
    contentType: 'application/pdf',
    size: 1_842_112,
  },
  {
    key: 'autorisation',
    name: 'Autorisation de sortie (modèle).docx',
    contentType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 38_204,
  },
  {
    key: 'planning-type',
    name: 'Planning type stage de seconde.xlsx',
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 91_680,
  },
];

export function addAdminFiles(world: World, uploader: StaffRef): void {
  const clock = world.ctx.clock;
  for (const [index, file] of LIBRARY_FILES.entries()) {
    world.buffer.adminFile.push({
      id: id('adf', file.key),
      name: file.name,
      s3Key: `admin-files/${file.key}.bin`,
      contentType: file.contentType,
      size: file.size,
      // The last one was put there by somebody who has since left. The library
      // is shared, so the file stays and the row says « ancien membre »; that
      // is the entire behavioural difference between the `SetNull` this column
      // carries now and the cascade it used to.
      uploadedById: index === LIBRARY_FILES.length - 1 ? null : uploader.id,
      createdAt: clock.days(-90 + index * 10),
    });
  }
}

/**
 * A welcome page on a couple of events, plus the image one of them embeds.
 *
 * Whether an image is still in use is decided by the content itself - the
 * `/api/cms/images/<id>` URL inside some page's HTML - and never by a column. So
 * one image is referenced by a page and one is not, because the orphan is the
 * only row that exercises the reference scan at all, and it is what an unused
 * image is supposed to look like.
 */
export function addWelcomePages(
  world: World,
  opts: { events: readonly EventRef[]; author: StaffRef },
): void {
  const clock = world.ctx.clock;
  const [first, second] = opts.events;
  if (!first) return;

  const usedImageId = id('cmi', 'salle');
  const orphanImageId = id('cmi', 'orpheline');
  for (const [key, size] of [
    [usedImageId, 184_320],
    [orphanImageId, 96_040],
  ] as const) {
    world.buffer.cmsImage.push({
      id: key,
      s3Key: `cms-images/${key}.webp`,
      contentType: 'image/webp',
      width: 1280,
      height: 720,
      size,
      // The orphan was also uploaded by somebody who has since left, which is
      // the same `SetNull` the file library carries and the same rendering.
      uploadedById: key === orphanImageId ? null : opts.author.id,
      createdAt: clock.days(-45),
    });
  }

  world.buffer.cmsPage.push({
    id: id('cms', first.id.replace(/^sd_/, '')),
    slug: WELCOME_SLUG,
    eventId: first.id,
    content: [
      '<h2>Bienvenue !</h2>',
      `<p>On est content de t’accueillir sur <strong>${first.titre}</strong>. Pense à arriver un quart d’heure en avance le premier jour.</p>`,
      `<p><img src="/api/cms/images/${usedImageId}" alt="La salle de cours" /></p>`,
      '<p>À très vite.</p>',
    ].join(''),
    updatedBy: opts.author.userId,
    updatedAt: clock.days(-40),
  });

  // A second page whose last editor has since been deleted. `updatedBy` used to
  // be RESTRICT, which made anyone who had ever touched a page undeletable
  // behind a bare « Erreur lors de la suppression du membre ».
  if (second) {
    world.buffer.cmsPage.push({
      id: id('cms', second.id.replace(/^sd_/, '')),
      slug: WELCOME_SLUG,
      eventId: second.id,
      content:
        '<h2>Bienvenue !</h2><p>Le programme détaillé arrive très bientôt.</p>',
      updatedBy: null,
      updatedAt: clock.days(-30),
    });
  }
}

/**
 * The impersonation audit.
 *
 * Both target kinds, and both a finished session and one still open: `endedAt`
 * is nullable precisely so a session that was never exited stays visible, and
 * that is the row an admin reviewing the log is looking for. A dataset where
 * every session ended cleanly renders the case that matters never.
 */
export function addImpersonationAudit(
  world: World,
  opts: { admin: StaffRef; staffTarget: StaffRef; talentUserId: string | null },
): void {
  const clock = world.ctx.clock;

  world.buffer.audit_ImpersonationEvent.push({
    id: id('aie', 'staff'),
    adminUserId: opts.admin.userId,
    targetUserId: opts.staffTarget.userId,
    targetKind: 'staff',
    startedAt: clock.at(-6, 10, 12),
    endedAt: clock.at(-6, 10, 41),
  });

  if (opts.talentUserId) {
    world.buffer.audit_ImpersonationEvent.push({
      id: id('aie', 'talent'),
      adminUserId: opts.admin.userId,
      targetUserId: opts.talentUserId,
      targetKind: 'talent',
      // Never exited: the session lapsed on its own idle window.
      startedAt: clock.at(-2, 15, 3),
      endedAt: null,
    });
  }
}
