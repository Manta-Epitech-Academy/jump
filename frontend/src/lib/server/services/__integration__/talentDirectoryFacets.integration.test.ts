import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { resolveTalentFilters } from '../../../../routes/(staff)/staff/admin/talents/facets';

/**
 * The admin talent directory is paged on the server, so its column filters are
 * counted in the database instead of over rows in memory. Two claims rest on
 * Postgres rather than on a `where` shape: the campus filter keeps anyone who
 * attended an event there, so a talent counts once per campus however many of
 * its events they joined; and a ticked value the directory no longer carries
 * (a campus deleted since the link was shared) is dropped before it can empty
 * the list.
 */
describe('talent directory facets (integration)', () => {
  const stamp = Date.now();
  let campusId = '';
  let otherCampusId = '';
  const talentIds: string[] = [];
  const eventIds: string[] = [];

  beforeAll(async () => {
    assertTestDatabase();
    campusId = (
      await prisma.campus.create({ data: { name: `Annuaire ${stamp}` } })
    ).id;
    // A second campus, so the directory carries more than one and the campus
    // facet is offered at all (a single value could not narrow anything).
    otherCampusId = (
      await prisma.campus.create({ data: { name: `Annuaire bis ${stamp}` } })
    ).id;
    const [regular, newcomer] = await Promise.all(
      ['Lou', 'Noé'].map((prenom) =>
        prisma.talent.create({ data: { prenom, nom: `Annuaire${stamp}` } }),
      ),
    );
    talentIds.push(regular.id, newcomer.id);

    const enrol = async (talentId: string, date: string, campus = campusId) => {
      const event = await prisma.event.create({
        data: {
          titre: `Annuaire ${date}`,
          campusId: campus,
          date: new Date(`${date}T00:00:00.000Z`),
        },
      });
      eventIds.push(event.id);
      await prisma.participation.create({
        data: { talentId, eventId: event.id, campusId: campus },
      });
    };
    await enrol(regular.id, '2026-01-10');
    await enrol(regular.id, '2026-03-10');
    await enrol(newcomer.id, '2026-03-11');
    await enrol(newcomer.id, '2026-04-11', otherCampusId);
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
    await prisma.campus.deleteMany({
      where: { id: { in: [campusId, otherCampusId] } },
    });
  });

  it('counts each talent once per campus, however many events they joined', async () => {
    const { facetCounts } = await resolveTalentFilters(new URLSearchParams());
    const campus = facetCounts.find((f) => f.facet === 'campus');
    expect(campus?.counts.find((c) => c.value === campusId)?.count).toBe(2);
  });

  it('drops a ticked campus the directory does not carry', async () => {
    const { filters } = await resolveTalentFilters(
      new URLSearchParams({ campus: `${campusId},campus-supprime` }),
    );
    expect(filters.facets.campus).toEqual([campusId]);
  });
});
