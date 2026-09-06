/**
 * Vocabularies carried by `String` columns rather than by Prisma enums.
 *
 * `assert/enums.ts` is self-maintaining because the DMMF announces every enum
 * and every value. A `String` column announces nothing, so a closed vocabulary
 * stored in one is the blind spot of that check: `Participation.sfMemberStatus`
 * drives who the dev space shows and no coverage check could see it.
 *
 * Two directions, and the second is what makes this more than a list.
 *
 *   1. NO STRAY VALUE. No seeded row carries a value the catalogue does not
 *      declare. Always on. It catches the typo (`MEETS`) that a coverage check
 *      alone would let through, which is the risk peculiar to a text column.
 *      Scoped to `sd_` rows: it describes this generator, never what Salesforce
 *      is allowed to send.
 *   2. EVERY VALUE PRESENT. Only where the vocabulary is small and each value
 *      makes the code branch. Without that rule `Usage_FeatureUse.feature` and
 *      its 106 keys would demand a row each, which says nothing.
 *
 * What this cannot do, stated rather than hidden: the column-to-catalogue link
 * is declared by hand below. The alternatives are worse. Guessing from the
 * schema comment is fragile - two of them describe columns that no longer exist
 * and a third lists a value the code never writes. And promoting these columns
 * to Prisma enums would break the anti-corruption boundary on purpose: an
 * unknown Salesforce status would become a write failure in mid-sync, when the
 * whole point is to store what the external system said.
 *
 * Two vocabularies are deliberately absent because they cannot be reached from a
 * plain `bun` script: `ADMIN_API_OPERATION_NAMES` and the document-type keys in
 * `ONBOARDING_DOCUMENTS` both live in server modules that import `$lib`.
 */

import type { PrismaClient } from '@prisma/client';
import { NIVEAUX } from '../../../src/lib/domain/niveau';
import { EVENT_MODULE_KEYS } from '../../../src/lib/domain/eventModules';
import { EMAIL_ACTION_KEYS } from '../../../src/lib/domain/emailActions';
import { USAGE_FEATURE_KEYS } from '../../../src/lib/domain/usage';
import {
  CHOICE_TONES,
  CHOICE_ICON_TOKENS,
} from '../../../src/lib/domain/closing';
import { SF_MEMBER_STATUSES } from '../../../src/lib/domain/sfMemberStatus';
import { INTEREST_KINDS } from '../../../src/lib/domain/interests';
import {
  REGLEMENT_VERSIONS,
  DROIT_IMAGE_VERSIONS,
  versionsInForceAt,
} from '../catalog/documentVersions';

type Catalogue = {
  /** Human name, used in the failure line. */
  readonly vocabulary: string;
  /**
   * Where the vocabulary is stored, one entry per column, each carrying the SQL
   * predicate that restricts it to this generator's own rows. The predicate
   * belongs to the TABLE, not to the vocabulary: `TalentSfImport` is keyed on
   * `talentId` and `EventConfig_Module` on a pair, so neither has an `id`.
   */
  readonly columns: readonly {
    table: string;
    field: string;
    ownedBy: string;
  }[];
  /**
   * Given the school year the anchor falls in, the values that must be
   * accounted for. A function because one catalogue is dated: a document version
   * published for a year that has not begun cannot carry a signature yet, so
   * demanding a row for it would demand an impossible row.
   */
  readonly values: (schoolYear: string) => readonly string[];
  /**
   * Whether every value must have a row. See rule 2 above: true when the set is
   * small and each value branches, false when the catalogue is a directory.
   */
  readonly requireEveryValue: boolean;
};

const BY_ID = `"id" LIKE 'sd_%'`;
/**
 * Catalogue rows a migration inserted, or rows this generator is the only
 * writer of anyway: there is nothing to narrow to.
 */
const EVERY_ROW = 'TRUE';

const CATALOGUES: readonly Catalogue[] = [
  {
    vocabulary: 'statut Salesforce',
    columns: [
      { table: 'Participation', field: 'sfMemberStatus', ownedBy: BY_ID },
    ],
    values: () => SF_MEMBER_STATUSES,
    requireEveryValue: true,
  },
  {
    // One vocabulary over three columns, counted together: what matters is that
    // a value exists somewhere, not that every column carries every value.
    vocabulary: 'niveau',
    columns: [
      { table: 'Talent', field: 'niveau', ownedBy: BY_ID },
      { table: 'Schooling_YearRecord', field: 'niveau', ownedBy: BY_ID },
      {
        table: 'TalentSfImport',
        field: 'niveau',
        ownedBy: `"talentId" LIKE 'sd_%'`,
      },
    ],
    values: () => NIVEAUX,
    requireEveryValue: true,
  },
  {
    // Two tables, and the second is the one that was missing. A preset carries
    // module keys of its own, they are copied onto an event when it is applied,
    // and a key the catalogue no longer declares would have travelled that far
    // with nothing to stop it.
    vocabulary: 'module d’événement',
    columns: [
      {
        table: 'EventConfig_Module',
        field: 'moduleKey',
        ownedBy: `"eventId" LIKE 'sd_%'`,
      },
      {
        table: 'EventConfig_TemplateModule',
        field: 'moduleKey',
        ownedBy: `"templateId" LIKE 'sd_%'`,
      },
    ],
    values: () => EVENT_MODULE_KEYS,
    requireEveryValue: true,
  },
  {
    vocabulary: 'valence d’option de closing',
    columns: [{ table: 'Closing_Option', field: 'tone', ownedBy: EVERY_ROW }],
    values: () => CHOICE_TONES,
    requireEveryValue: true,
  },
  {
    vocabulary: 'icône d’option de closing',
    columns: [{ table: 'Closing_Option', field: 'icon', ownedBy: EVERY_ROW }],
    values: () => CHOICE_ICON_TOKENS,
    requireEveryValue: true,
  },
  {
    vocabulary: 'action e-mail',
    columns: [
      { table: 'EmailActionMapping', field: 'actionKey', ownedBy: EVERY_ROW },
    ],
    values: () => EMAIL_ACTION_KEYS,
    requireEveryValue: true,
  },
  {
    // The frozen version matters as much as the one in force: it is what proves
    // a document already signed still renders from the wording it was pinned to.
    vocabulary: 'version du règlement',
    columns: [
      { table: 'Onboarding_Record', field: 'reglementVersion', ownedBy: BY_ID },
    ],
    values: (schoolYear) => versionsInForceAt(REGLEMENT_VERSIONS, schoolYear),
    requireEveryValue: true,
  },
  {
    vocabulary: 'version du droit à l’image',
    columns: [
      { table: 'ImageRightsDecisionRecord', field: 'version', ownedBy: BY_ID },
    ],
    values: (schoolYear) => versionsInForceAt(DROIT_IMAGE_VERSIONS, schoolYear),
    requireEveryValue: true,
  },
  {
    // Both values branch: the wizard asks the two questions separately and
    // bounds them separately, and the fiche renders the two groups apart.
    vocabulary: 'nature d’intérêt',
    columns: [{ table: 'Interest', field: 'kind', ownedBy: EVERY_ROW }],
    values: () => INTEREST_KINDS,
    requireEveryValue: true,
  },
  {
    vocabulary: 'clé de fonctionnalité mesurée',
    columns: [
      { table: 'Usage_FeatureUse', field: 'feature', ownedBy: EVERY_ROW },
    ],
    values: () => USAGE_FEATURE_KEYS,
    requireEveryValue: false,
  },
];

export async function stringCatalogueFailures(
  prisma: PrismaClient,
  schoolYear: string,
): Promise<string[]> {
  const failures: string[] = [];

  for (const catalogue of CATALOGUES) {
    const values = catalogue.values(schoolYear);
    const seen = new Set<string>();
    for (const column of catalogue.columns) {
      const rows = await prisma.$queryRawUnsafe<{ value: string | null }[]>(
        `SELECT DISTINCT "${column.field}" AS value FROM "${column.table}" WHERE ${column.ownedBy}`,
      );
      for (const row of rows) {
        if (row.value !== null) seen.add(row.value);
      }
    }

    const known = new Set(values);
    const stray = [...seen].filter((value) => !known.has(value)).sort();
    if (stray.length > 0) {
      failures.push(
        `${catalogue.vocabulary} : valeur(s) hors catalogue ${stray.join(', ')}`,
      );
    }

    if (!catalogue.requireEveryValue) continue;
    const absent = values.filter((value) => !seen.has(value));
    if (absent.length > 0) {
      failures.push(
        `${catalogue.vocabulary} : aucune ligne pour ${absent.join(', ')}`,
      );
    }
  }

  return failures;
}
