import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import {
  catalogueGaps,
  thumbnailOf,
  type CatalogueDomain,
  type CatalogueSubject,
} from '$lib/domain/workshopCatalogue';
import { supervisorJoinUrl, workshopCoverUrl } from '$lib/domain/workshops';

/**
 * The subject catalogue as its readers see it: the dev space's page lists the
 * complete subjects, the admin API reads every domain. Both are global, like
 * the activities themselves (`db/scoped.ts` gives the workshop models no scoped
 * delegate), so this reads `prisma` directly. Its writers are `write_workshop`
 * (a subject's domains, level and notions), `write_workshop_domain` (the
 * domains) and `write_workshop_instance` (the supervisor code of the instance
 * serving a subject).
 */

/** The columns a domain is shown with, for an `include` or a `select`. */
export const WORKSHOP_DOMAIN_SELECT = {
  key: true,
  label: true,
  archivedAt: true,
} satisfies Prisma.Workshop_DomainSelect;

type WorkshopDomainRow = Prisma.Workshop_DomainGetPayload<{
  select: typeof WORKSHOP_DOMAIN_SELECT;
}>;

export type WorkshopDomainView = CatalogueDomain & { archived: boolean };

/** A row as it is shown. */
export function workshopDomainView(row: WorkshopDomainRow): WorkshopDomainView {
  return {
    key: row.key,
    label: row.label,
    archived: row.archivedAt !== null,
  };
}

export type WorkshopDomainListItem = WorkshopDomainView & {
  /** Subjects filed under it, archived domains included. */
  subjects: number;
};

export const WorkshopCatalogueService = {
  /**
   * The subjects the catalogue shows, alphabetical: every complete one
   * (`catalogueGaps`), whatever campus offers it. Read whole and kept in code
   * rather than filtered in SQL, so the rule of what is complete lives in one
   * place; the table holds a few dozen rows.
   */
  async listShown(): Promise<CatalogueSubject[]> {
    const rows = await prisma.workshop_Activity.findMany({
      where: { enabled: true },
      orderBy: { label: 'asc' },
      select: {
        slug: true,
        label: true,
        enabled: true,
        tagline: true,
        level: true,
        notions: true,
        instance: { select: { baseUrl: true, supervisorCode: true } },
        domains: {
          select: { domain: { select: { key: true, label: true } } },
          orderBy: { domain: { label: 'asc' } },
        },
        coverImages: {
          select: {
            kind: true,
            key: true,
            stillKey: true,
            width: true,
            height: true,
          },
        },
      },
    });
    return rows.flatMap((row) => {
      const gaps = catalogueGaps({
        enabled: row.enabled,
        tagline: row.tagline,
        level: row.level,
        domainCount: row.domains.length,
        pictureCount: row.coverImages.length,
      });
      if (gaps.length > 0) return [];
      const picture = thumbnailOf(row.coverImages);
      // Narrowing only: `catalogueGaps` has already required each of them.
      if (!row.tagline || !row.level || !picture) return [];
      return [
        {
          slug: row.slug,
          label: row.label,
          tagline: row.tagline,
          level: row.level,
          domains: row.domains.map(({ domain }) => domain),
          notions: row.notions,
          thumbnail: {
            url: workshopCoverUrl(picture.stillKey ?? picture.key),
            width: picture.width,
            height: picture.height,
          },
          supervisor: row.instance.supervisorCode
            ? {
                code: row.instance.supervisorCode,
                joinUrl: supervisorJoinUrl(row.instance.baseUrl),
              }
            : null,
        },
      ];
    });
  },

  /** Every domain, archived ones included, alphabetical by label. */
  async listDomains(): Promise<WorkshopDomainListItem[]> {
    const rows = await prisma.workshop_Domain.findMany({
      orderBy: { label: 'asc' },
      select: {
        ...WORKSHOP_DOMAIN_SELECT,
        _count: { select: { activities: true } },
      },
    });
    return rows.map((row) => ({
      ...workshopDomainView(row),
      subjects: row._count.activities,
    }));
  },
};
