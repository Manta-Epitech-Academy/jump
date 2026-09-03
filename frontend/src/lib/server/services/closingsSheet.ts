import type { Prisma } from '@prisma/client';
import {
  CLOSING_RECOMMENDATIONS,
  CLOSING_STATUS_LABELS,
  closingListStatus,
  type ClosingGrid,
} from '$lib/domain/closing';
import { FORMER_STAFF_LABEL } from '$lib/domain/staff';
import type { XlsxCell, XlsxSheet } from '$lib/server/xlsx';
import {
  buildClosingSynthesis,
  closingPdfSelect,
  type SynthesisQuestion,
} from './closingPdfGenerator';

/**
 * One event's closings as a spreadsheet.
 *
 * The values come from `buildClosingSynthesis`, the same projection the PDF
 * prints, rather than from a second pass over the answer rows. That is the whole
 * point of building it here: a cell and a line of the synthesis document cannot
 * then disagree about what a student answered, and the grid's own wording
 * (`labelOverride`), the option order (`position`) and the questions a grid has
 * since dropped are all already handled there.
 *
 * Kept out of the route and free of Prisma calls so the column algebra below -
 * the part that can be subtly wrong - is testable without a database.
 */

/** `closingPdfSelect` plus what a sheet needs and one document does not: the
 *  join key, and the status, since a sheet lists closings that are not done. */
export const closingsSheetSelect = {
  ...closingPdfSelect,
  talentId: true,
  status: true,
} as const satisfies Prisma.Closing_RecordSelect;

export type ClosingForSheet = Prisma.Closing_RecordGetPayload<{
  select: typeof closingsSheetSelect;
}>;

/** A visible enrolment of the event, in the order the sheet should list it. */
export interface ClosingsSheetRosterRow {
  talentId: string;
  prenom: string;
  nom: string;
  externalId: string | null;
}

export interface ClosingsSheetInput {
  roster: ClosingsSheetRosterRow[];
  records: ClosingForSheet[];
  /** Every grid the records were conducted with, keyed by `templateId`. */
  grids: ReadonlyMap<string, ClosingGrid>;
  /** The grid the event names today. Its read-back order leads the columns. */
  currentGrid: ClosingGrid;
  /** IANA zone of the campus, so `conductedAt` reads as the local wall clock. */
  timezone: string;
}

/**
 * Status suffix for a row whose closing exists but whose enrolment does not.
 *
 * Spelled out rather than left as a bare "Finalisé", because a reader counting
 * rows against the event's roster would otherwise find one too many with nothing
 * to explain it. The Salesforce sync deletes every participation its payload
 * omits and a closing survives that on purpose (`Closing_Record` keys on
 * `(talentId, eventId)`, never on the participation), so this row IS the trace
 * of work that was done.
 */
const ORPHAN_STATUS_SUFFIX = ' (inscription retirée)';

/** Header suffix for a question the event's current grid does not ask. */
const OFF_GRID_SUFFIX = ' [hors grille actuelle]';

const FIXED_HEADERS = [
  'Prénom',
  'Nom',
  'Identifiant SF',
  'Statut',
  'Conduit par',
  'Conduit le',
  'Verdict',
  'Note du verdict',
  "Notes de l'équipe",
] as const;

const FIXED_WIDTHS = [16, 16, 20, 28, 22, 18, 20, 40, 44];

/** Width of a per-question column: room for a sentence of free text. */
const QUESTION_WIDTH = 32;

function formatInstant(date: Date, timezone: string): string {
  return date.toLocaleString('fr-FR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The header a question column carries.
 *
 * A rating's ceiling goes in the header rather than into every cell, so the
 * cells stay real numbers Excel can sort and average. A question the current
 * grid does not ask is marked: its cells are blank for every closing conducted
 * under the current grid, and a blank there means "not asked", never zero.
 */
function questionHeader(
  q: { kind: string; label: string; max?: number | null },
  onCurrentGrid: boolean,
): string {
  const max = q.kind === 'rating' && q.max != null ? ` (sur ${q.max})` : '';
  return `${q.label}${max}${onCurrentGrid ? '' : OFF_GRID_SUFFIX}`;
}

/** The answer as one cell: a rating stays numeric, everything else is text. */
function answerCell(q: SynthesisQuestion): XlsxCell {
  if (Array.isArray(q.value)) return q.value.join(', ');
  return q.value;
}

/**
 * Column identity, in order: what the event's grid asks today, then anything a
 * record was actually asked under another grid.
 *
 * The second half is not hypothetical. `Closing_Record.templateId` is pinned, so
 * retargeting an event leaves closings conducted under the previous grid, and
 * dropping a question from a grid leaves answers behind it. Either way the answer
 * is a fact about a real conversation, and an export that omitted it would be
 * hiding recorded work - the same reason every renderer prints them under an
 * explicit "Questions retirées" heading.
 *
 * Keyed on the BANK question's id, never on its wording: a grid reads a question
 * aloud in its own words, so two grids asking the same question share a column.
 */
function questionColumns(input: ClosingsSheetInput): {
  ids: string[];
  headers: Map<string, string>;
} {
  const headers = new Map<string, string>();
  const ids: string[] = [];
  const onCurrentGrid = new Set<string>();

  for (const section of input.currentGrid.synthesisSections) {
    for (const q of section.questions) {
      onCurrentGrid.add(q.id);
      if (headers.has(q.id)) continue;
      ids.push(q.id);
      // Named off the grid, with no record involved, which is what keeps a
      // question nobody has answered yet visible as an empty column.
      headers.set(q.id, questionHeader(q, true));
    }
  }

  // Records in the order the caller listed them, so the columns a second grid
  // contributes are stable rather than dependent on who was seen first.
  for (const record of input.records) {
    const grid = input.grids.get(record.templateId);
    if (!grid) continue;
    for (const section of buildClosingSynthesis(record, grid)) {
      for (const q of section.questions) {
        if (headers.has(q.id)) continue;
        ids.push(q.id);
        headers.set(q.id, questionHeader(q, onCurrentGrid.has(q.id)));
      }
    }
  }

  return { ids, headers };
}

export function buildClosingsSheet(input: ClosingsSheetInput): XlsxSheet {
  const { ids, headers } = questionColumns(input);
  const byTalent = new Map(input.records.map((r) => [r.talentId, r]));

  const rowFor = (
    person: ClosingsSheetRosterRow,
    record: ClosingForSheet | undefined,
    orphan: boolean,
  ): XlsxCell[] => {
    const status =
      CLOSING_STATUS_LABELS[closingListStatus(record)] +
      (orphan ? ORPHAN_STATUS_SUFFIX : '');

    const grid = record ? input.grids.get(record.templateId) : undefined;
    const answers = new Map<string, SynthesisQuestion>();
    const notes: string[] = [];
    if (record && grid) {
      for (const section of buildClosingSynthesis(record, grid)) {
        for (const q of section.questions) {
          answers.set(q.id, q);
          // The team's own words, kept out of the answer cells: they are a
          // different voice from the student's, and one column of them reads as
          // prose where one per question would double the sheet's width.
          if (q.note) notes.push(`${q.label} : ${q.note}`);
        }
      }
    }

    const conductedBy = record
      ? (record.staff?.user?.name ?? FORMER_STAFF_LABEL)
      : // Nobody conducted it yet. Deliberately not the former-staff label,
        // which says something else entirely: that whoever did has left.
        '';

    return [
      person.prenom,
      person.nom,
      person.externalId ?? '',
      status,
      conductedBy,
      record?.conductedAt
        ? formatInstant(record.conductedAt, input.timezone)
        : '',
      record?.recommendation
        ? CLOSING_RECOMMENDATIONS[record.recommendation].label
        : '',
      record?.verdictNote ?? '',
      notes.join('\n'),
      // A blank here is "this question was not asked of this closing", which is
      // not a zero. Same distinction `stats_closing_insights` draws by carrying
      // `asked` beside `answered`.
      ...ids.map((id) => {
        const q = answers.get(id);
        return q ? answerCell(q) : null;
      }),
    ];
  };

  // Every enrolment, plus every closing whose enrolment is gone. A roster row
  // with no closing answers the coverage question ("who is left"), which is why
  // this is not a list of records; an orphan record is work that was done, which
  // is why it is not a list of enrolments either.
  const rosterIds = new Set(input.roster.map((r) => r.talentId));
  const rows: XlsxCell[][] = [
    ...input.roster.map((row) =>
      rowFor(row, byTalent.get(row.talentId), false),
    ),
    ...input.records
      .filter((r) => !rosterIds.has(r.talentId))
      .map((record) =>
        rowFor(
          {
            talentId: record.talentId,
            prenom: record.talent.prenom,
            nom: record.talent.nom,
            externalId: record.talent.externalId,
          },
          record,
          true,
        ),
      ),
  ];

  return {
    name: 'Closings',
    headers: [...FIXED_HEADERS, ...ids.map((id) => headers.get(id) ?? id)],
    rows,
    colWidths: [...FIXED_WIDTHS, ...ids.map(() => QUESTION_WIDTH)],
  };
}
