import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { WorkshopCatalogueService } from '$lib/server/services/workshopCatalogue';
import { stillKeyOf } from '$lib/domain/pictures';
import { workshopCoverKey, workshopCoverUrl } from '$lib/domain/workshops';
import { assertTestDatabase } from './testDatabase';

/**
 * Which subjects the dev space's catalogue shows, read the way its page reads
 * them. `catalogueGaps` decides what is complete and is unit-tested; this holds
 * the service to it, so a subject that lacks any one piece stays off the page
 * however the query in front of the rule is written.
 */
describe('the subject catalogue (integration)', () => {
  const stamp = Date.now();
  const slug = (name: string) => `catalogue-${name}-${stamp}`;
  const domainKey = `catalogue-${stamp}`;
  const archivedKey = `catalogue-archive-${stamp}`;
  let instanceId = '';

  /** A complete subject, less whatever `without` names. */
  async function subject(
    name: string,
    without: 'enabled' | 'tagline' | 'level' | 'domains' | 'picture' | null,
    domains: string[] = [domainKey],
  ) {
    const data: Prisma.Workshop_ActivityUncheckedCreateInput = {
      slug: slug(name),
      label: `Sujet ${name}`,
      instanceId,
      enabled: without !== 'enabled',
      tagline: without === 'tagline' ? null : `Accroche ${name}`,
      level: without === 'level' ? null : 'beginner',
    };
    const { id } = await prisma.workshop_Activity.create({ data });
    if (without !== 'domains') {
      await prisma.workshop_ActivityDomain.createMany({
        data: domains.map((key) => ({ activityId: id, domainKey: key })),
      });
    }
    if (without !== 'picture') {
      const key = workshopCoverKey(id, 'media', 'test', 'gif');
      await prisma.workshop_CoverImage.create({
        data: {
          activityId: id,
          kind: 'media',
          sourceUrl: 'https://assets.test.invalid/media.gif',
          key,
          stillKey: stillKeyOf(key),
          contentType: 'image/gif',
          width: 640,
          height: 400,
        },
      });
    }
    return id;
  }

  beforeAll(async () => {
    assertTestDatabase();
    instanceId = (
      await prisma.workshop_Instance.create({
        data: {
          slug: `catalogue-host-${stamp}`,
          baseUrl: 'https://catalogue.ctfd.invalid',
        },
      })
    ).id;
    await prisma.workshop_Domain.createMany({
      data: [
        { key: domainKey, label: `Domaine ${stamp}` },
        {
          key: archivedKey,
          label: `Domaine archivé ${stamp}`,
          archivedAt: new Date(),
        },
      ],
    });
    await subject('complet', null);
    await subject('archive', null, [archivedKey]);
    for (const gap of [
      'enabled',
      'tagline',
      'level',
      'domains',
      'picture',
    ] as const) {
      await subject(`sans-${gap}`, gap);
    }
  });

  afterAll(async () => {
    try {
      await prisma.workshop_Activity.deleteMany({ where: { instanceId } });
      await prisma.workshop_Instance.deleteMany({ where: { id: instanceId } });
      await prisma.workshop_Domain.deleteMany({
        where: { key: { in: [domainKey, archivedKey] } },
      });
    } catch {
      // ignore: the test database is disposable
    }
  });

  const shown = async () =>
    (await WorkshopCatalogueService.listShown()).filter((s) =>
      s.slug.endsWith(`-${stamp}`),
    );

  it('shows a complete subject only, whatever piece another one lacks', async () => {
    expect((await shown()).map((s) => s.slug).sort()).toEqual(
      [slug('archive'), slug('complet')].sort(),
    );
  });

  it('keeps a subject under a domain archived since, and draws an animation still', async () => {
    const archived = (await shown()).find((s) => s.slug === slug('archive'))!;
    expect(archived.domains).toEqual([
      { key: archivedKey, label: `Domaine archivé ${stamp}` },
    ]);
    const { id } = await prisma.workshop_Activity.findUniqueOrThrow({
      where: { slug: slug('archive') },
    });
    expect(archived.thumbnail.url).toBe(
      workshopCoverUrl(
        stillKeyOf(workshopCoverKey(id, 'media', 'test', 'gif')),
      ),
    );
  });
});
