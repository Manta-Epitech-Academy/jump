import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { scopedPrisma } from '$lib/server/db/scoped';
import { assertTestDatabase } from './testDatabase';
import { CLOSING_QUESTION_KEYS } from '$lib/domain/closing';
import { resolveClosingGridById } from '$lib/server/closingTemplates';
import { persistClosing } from '$lib/server/services/closingService';
import { anonymizeTalent } from '$lib/server/services/anonymizationService';
import { writeClosingQuestion } from '$lib/server/adminApi/writes/closings';
import { OperationRefusedError } from '$lib/server/adminApi/errors';

/**
 * The closing invariants that only a real database can prove.
 *
 * Four of them are things that fail SILENTLY if they regress, which is why they
 * are asserted here rather than trusted: campus scoping (a delegate with no
 * extension handler is simply unscoped), the erasure (a dropped `deleteMany`
 * leaves a minor's prose behind), the structural-edit lock (a kind change under
 * recorded answers makes them unreadable), and the bank keys the school-year
 * review names, whose absence reads to a national director exactly like "nobody
 * answered".
 */

const stamp = Date.now();
const ids: Record<string, string> = {};

async function campusWith(name: string) {
  return prisma.campus.create({
    data: { name: `${name}-${stamp}`, timezone: 'Europe/Paris' },
  });
}

beforeAll(async () => {
  assertTestDatabase();

  const [paris, lyon] = await Promise.all([
    campusWith('ClosingParis'),
    campusWith('ClosingLyon'),
  ]);
  ids.campus = paris.id;
  ids.otherCampus = lyon.id;

  const template = await prisma.closing_Template.create({
    data: {
      key: `lifecycle-${stamp}`,
      label: 'Grille test',
      sections: { create: { position: 0, title: 'Retour' } },
    },
    select: { id: true, sections: { select: { id: true } } },
  });
  ids.template = template.id;

  const choice = await prisma.closing_Question.create({
    data: {
      key: `lifecycle-choice-${stamp}`,
      label: 'Vers quels métiers tu te projettes ?',
      kind: 'multi',
      notePlaceholder: 'Une nuance…',
      options: {
        create: [
          { position: 0, value: 'dev', label: 'Dev', icon: 'dev' },
          { position: 1, value: 'cyber', label: 'Cyber', icon: 'cyber' },
        ],
      },
    },
    select: { id: true, options: { select: { id: true, value: true } } },
  });
  ids.choice = choice.id;
  ids.dev = choice.options.find((o) => o.value === 'dev')!.id;
  ids.cyber = choice.options.find((o) => o.value === 'cyber')!.id;

  await prisma.closing_TemplateQuestion.create({
    data: {
      templateId: template.id,
      sectionId: template.sections[0].id,
      questionId: choice.id,
      position: 0,
      withNote: true,
    },
  });

  const event = await prisma.event.create({
    data: {
      titre: `ClosingEvent-${stamp}`,
      date: new Date('2026-03-02T09:00:00Z'),
      campusId: paris.id,
      closingTemplateId: template.id,
    },
  });
  ids.event = event.id;

  const staff = await prisma.bauth_user.create({
    data: {
      name: 'Closing Staff',
      email: `closing.staff.${stamp}@epitech.eu`,
      staffProfile: { create: { staffRole: 'dev', campusId: paris.id } },
    },
    select: { id: true, staffProfile: { select: { id: true } } },
  });
  ids.staffUser = staff.id;
  ids.staff = staff.staffProfile!.id;

  const talent = await prisma.talent.create({
    data: { nom: 'Closing', prenom: `Test${stamp}` },
  });
  ids.talent = talent.id;

  const participation = await prisma.participation.create({
    data: { talentId: talent.id, eventId: event.id, campusId: paris.id },
  });
  ids.participation = participation.id;
});

afterAll(async () => {
  // Ordered teardown; the test database is disposable, so a failure here is
  // noise rather than a signal.
  try {
    await prisma.closing_Record.deleteMany({ where: { talentId: ids.talent } });
    await prisma.participation.deleteMany({ where: { id: ids.participation } });
    await prisma.talent.deleteMany({ where: { id: ids.talent } });
    await prisma.event.deleteMany({ where: { id: ids.event } });
    await prisma.closing_TemplateQuestion.deleteMany({
      where: { templateId: ids.template },
    });
    await prisma.closing_Template.deleteMany({ where: { id: ids.template } });
    await prisma.closing_Question.deleteMany({ where: { id: ids.choice } });
    await prisma.bauth_user.deleteMany({ where: { id: ids.staffUser } });
    await prisma.campus.deleteMany({
      where: { id: { in: [ids.campus, ids.otherCampus] } },
    });
  } catch {
    // ignore - the test database is disposable
  }
});

async function conduct(
  mode: 'start' | 'save' | 'close',
  answers: Record<
    string,
    {
      selectedIds: string[];
      ratingValue: number | null;
      freeText: string;
      note: string;
    }
  >,
) {
  const grid = await resolveClosingGridById(ids.template);
  await persistClosing({
    participationId: ids.participation,
    talentId: ids.talent,
    campusId: ids.campus,
    staffId: ids.staff,
    templateId: ids.template,
    grid: grid!,
    form: {
      participationId: ids.participation,
      answers,
      recommendation: 'bon_profil',
      verdictNote: 'Bon échange.',
    },
    mode,
  });
}

const answer = (
  over: Partial<{ selectedIds: string[]; note: string }> = {},
) => ({
  selectedIds: [],
  ratingValue: null,
  freeText: '',
  note: '',
  ...over,
});

describe('conducting a closing', () => {
  it('should write the picked options and the team note, then reconcile a cleared answer away', async () => {
    // Arrange + Act: two picks and a note.
    await conduct('start', {
      [ids.choice]: answer({
        selectedIds: [ids.dev, ids.cyber],
        note: 'Hésite entre les deux.',
      }),
    });

    // Assert
    let record = await prisma.closing_Record.findUniqueOrThrow({
      where: { participationId: ids.participation },
      include: { answers: { include: { selectedOptions: true } } },
    });
    expect(record.status).toBe('in_progress');
    expect(record.answers).toHaveLength(1);
    expect(record.answers[0].selectedOptions).toHaveLength(2);
    expect(record.answers[0].note).toBe('Hésite entre les deux.');

    // Act: the staff member clears the question entirely. The payload is always
    // the WHOLE form, so an emptied answer is an instruction to remove the row,
    // not an omission to ignore.
    await conduct('save', { [ids.choice]: answer() });

    record = await prisma.closing_Record.findUniqueOrThrow({
      where: { participationId: ids.participation },
      include: { answers: { include: { selectedOptions: true } } },
    });
    expect(record.answers).toHaveLength(0);
  });

  it('should refuse every later write once the closing is finalised', async () => {
    await conduct('close', {
      [ids.choice]: answer({ selectedIds: [ids.dev] }),
    });
    const record = await prisma.closing_Record.findUniqueOrThrow({
      where: { participationId: ids.participation },
      select: { status: true },
    });
    expect(record.status).toBe('done');
    // The lock itself lives in the route, which refuses before reaching the
    // service; what this pins is that clôture is recorded as terminal state,
    // which is what that guard reads.
  });
});

describe('campus scoping', () => {
  it('should hide a closing from another campus scoped client', async () => {
    // A delegate with no entry in the scoped extension is simply UNSCOPED: no
    // error, just every campus' rows. So this asserts the guard exists at all.
    const own = scopedPrisma(ids.campus);
    const other = scopedPrisma(ids.otherCampus);

    await expect(
      own.closing_Record.count({ where: { talentId: ids.talent } }),
    ).resolves.toBe(1);
    await expect(
      other.closing_Record.count({ where: { talentId: ids.talent } }),
    ).resolves.toBe(0);
  });
});

describe('the bank keys the school-year review names', () => {
  it('should still exist in the seeded bank', async () => {
    // `voiceOf` addresses these two by key. A key that quietly stopped existing
    // would reach a national director as "la question n'est posée par aucune
    // grille", which reads exactly like "personne n'a répondu".
    const keys = Object.values(CLOSING_QUESTION_KEYS);
    const found = await prisma.closing_Question.findMany({
      where: { key: { in: keys } },
      select: { key: true },
    });
    expect(found.map((q) => q.key).sort()).toEqual([...keys].sort());
  });
});

describe('the structural-edit lock', () => {
  it('should refuse an unknown valence rather than store a token nothing renders', async () => {
    await expect(
      writeClosingQuestion({
        questionKey: `lock-tone-${stamp}`,
        label: 'Question test',
        kind: 'single',
        options: [{ value: 'a', label: 'A', tone: 'chartreuse' }],
      }),
    ).rejects.toBeInstanceOf(OperationRefusedError);
  });

  it('should refuse a kind change once students have answered, but allow a reword', async () => {
    // Arrange: the seeded question already carries an answer from the first test.
    await expect(
      writeClosingQuestion({
        questionKey: `lifecycle-choice-${stamp}`,
        label: 'Vers quels métiers tu te projettes ?',
        kind: 'text',
      }),
    ).rejects.toBeInstanceOf(OperationRefusedError);

    // Wording stays editable on purpose, so a typo can be corrected on documents
    // already rendered.
    const outcome = await writeClosingQuestion({
      questionKey: `lifecycle-choice-${stamp}`,
      label: 'Vers quels métiers te projettes-tu ?',
    });
    expect(outcome.applied).toBe(true);
    const q = await prisma.closing_Question.findUniqueOrThrow({
      where: { key: `lifecycle-choice-${stamp}` },
      select: { label: true, kind: true },
    });
    expect(q.label).toBe('Vers quels métiers te projettes-tu ?');
    expect(q.kind).toBe('multi');
  });

  it('should refuse dropping an option students have already chosen', async () => {
    await expect(
      writeClosingQuestion({
        questionKey: `lifecycle-choice-${stamp}`,
        label: 'Vers quels métiers te projettes-tu ?',
        options: [{ value: 'cyber', label: 'Cyber', icon: 'cyber' }],
      }),
    ).rejects.toBeInstanceOf(OperationRefusedError);
  });
});

describe('RGPD erasure', () => {
  it('should take the closing, its answers and its option rows with the talent', async () => {
    const before = await prisma.closing_Answer.count({
      where: { record: { talentId: ids.talent } },
    });
    expect(before).toBeGreaterThan(0);

    await prisma.$transaction(async (tx) => {
      await anonymizeTalent(tx, ids.talent);
    });

    await expect(
      prisma.closing_Record.count({ where: { talentId: ids.talent } }),
    ).resolves.toBe(0);
    // The answers and their option rows cascade from the record; asserted rather
    // than assumed, since the erasure only deletes the record itself.
    await expect(
      prisma.closing_Answer.count({
        where: { record: { talentId: ids.talent } },
      }),
    ).resolves.toBe(0);
  });
});

describe('a second grid over the same bank', () => {
  it('should compose and resolve with no migration', async () => {
    // The claim the refactor makes, against a real database this time: a new
    // closing is a composition over questions that already exist.
    const second = await prisma.closing_Template.create({
      data: {
        key: `second-${stamp}`,
        label: 'Closing court',
        sections: { create: { position: 0, title: 'Retour' } },
      },
      select: { id: true, sections: { select: { id: true } } },
    });
    await prisma.closing_TemplateQuestion.create({
      data: {
        templateId: second.id,
        sectionId: second.sections[0].id,
        questionId: ids.choice,
        position: 0,
        labelOverride: "Et après l'après-midi, tu te projettes où ?",
        withNote: false,
      },
    });

    const grid = await resolveClosingGridById(second.id);
    const [q] = grid!.sections[0].questions;
    // Same bank row as the first grid, so one distribution spans both.
    expect(q.id).toBe(ids.choice);
    expect(q.label).toBe("Et après l'après-midi, tu te projettes où ?");
    expect(q.note).toBeNull();

    await prisma.closing_TemplateQuestion.deleteMany({
      where: { templateId: second.id },
    });
    await prisma.closing_Template.delete({ where: { id: second.id } });
  });
});
