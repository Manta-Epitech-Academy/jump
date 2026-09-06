/**
 * Whether a row exists at all, checked against the schema itself.
 *
 * The other checks in this directory all validate the CONTENT of rows that
 * exist: which enum values appear, whether a projection agrees with its ledger,
 * whether the ladder is standing on every rung, whether a timestamp precedes the
 * anchor. None of them can see a table with nothing in it, or a nullable column
 * that is null on every row, and that turned out to be the shape of almost every
 * hole the generator had. `TalentInterest` was declared in the buffer, ordered in
 * the flush and deleted by the wipe, and no scenario ever pushed a row: five
 * green checks over an empty relation. `Usage_FeatureMonthly` had never been
 * written, so the store that answers beyond the retention window was never once
 * exercised. `Closing_Record.staffId` was set on all 68 rows, so the « Ancien
 * membre » rendering that the `SetNull` migration exists to make possible had no
 * example anywhere.
 *
 * So this asks the schema what states are expressible, and the database whether
 * each one is present:
 *
 *   1. every model has at least one row;
 *   2. every nullable column has a row where it is null AND one where it is not;
 *   3. every boolean column has a row for both values.
 *
 * Like `assert/enums.ts`, the list is NOT written here: it comes out of
 * `schema.prisma` through `getDMMF`. A column added tomorrow is demanded
 * tomorrow, in the pull request that added it, which is the only mechanism that
 * has ever kept a seed honest. The previous generator died of exactly this: it
 * was hand-maintained, nothing measured it, and by the time anybody looked the
 * only credible dataset left was a copy of production.
 *
 * ── The two lists, and why there are two ──────────────────────────────────────
 *
 * A whole-schema check produces exemptions, and a check whose exemption list is
 * comfortable to append to dies of a thousand additions. So the exemptions are
 * split by INTENT, and the two halves behave differently on purpose.
 *
 * `NEVER_SEEDED` is structural: a state this generator cannot produce however
 * much it grows, each line carrying the reason. It is one-directional - a row
 * appearing there later is not an error, because `--check` can be pointed at a
 * database somebody has since logged into, and a session row showing up is not a
 * defect to report.
 *
 * `NOT_YET_SEEDED` is debt: a state that SHOULD exist and does not yet. It is
 * two-directional, and that is what makes the list impossible to pad quietly. An
 * entry whose gap has been closed fails the check and asks to be deleted, so the
 * list can only ever be an exact description of what is missing, and its length
 * is a number that only goes down. Moving a line from here to `NEVER_SEEDED` to
 * silence it is possible, and it is meant to be: it is a visible diff carrying a
 * written reason, which is the same enforcement `stringCatalogues.ts` and
 * `USAGE_MEASURED_ELSEWHERE` already rest on. What is not possible is doing it
 * by accident.
 *
 * A gap in neither list fails outright. That is the door: a new column arrives
 * covered, or it arrives with somebody having written down why not.
 */

import type { PrismaClient } from '@prisma/client';
import { loadDatamodel } from '../schema';

/**
 * States this generator cannot produce, with the reason it cannot.
 *
 * Keyed `Model` or `Model.field`. Read the header before adding a line: this is
 * the half that is never re-examined, so a line that belongs in
 * `NOT_YET_SEEDED` and lands here stops being work anybody will do.
 */
const NEVER_SEEDED: Readonly<Record<string, string>> = {
  // ── L'isolation des workers. À ne jamais lever. ──
  'BroadcastRecipient.lastTriedAt':
    'null veut dire « jamais tentée », ce qui n’existe que sur un destinataire en attente. Le générateur n’en écrit aucun, et cette absence est l’isolation du worker de campagnes : voir `BroadcastStatus.queued` dans `assert/enums.ts` et `assert/inertness.ts`. Toute ligne semée a été tentée, donc porte une date.',
  'Campus.externalName':
    'DÉLIBÉRÉMENT vide, et c’est l’isolation du worker Salesforce elle-même. `listCampuses` ne rend au worker que les campus porteurs d’un nom externe, donc une base semée répond une liste vide et le worker n’a rien à résoudre, sur n’importe quelle machine. Écrire une valeur ici remet les données réelles de mineurs sur un environnement de validation : c’est la divulgation que toute cette branche existe pour supprimer.',

  // ── Ce qui naît d'une connexion réelle, jamais d'une écriture. ──
  bauth_session:
    'une session naît en se connectant. Le seed n’en écrit pas, et la page membres ne les lit plus : une connexion est une ligne `*_connection` de `Usage_FeatureUse`, une par personne, par espace et par jour, jamais une ligne `bauth_session`.',
  bauth_verification:
    'un code OTP en attente, écrit par BetterAuth au moment de l’envoi. Une valeur semée serait un code de connexion valide dans un jeu de données partagé.',
  bauth_account:
    'le lien vers un compte OAuth Microsoft, écrit par BetterAuth au premier SSO. Le seed fait signer tout le monde par OTP, qui n’en crée pas.',
  'bauth_user.image':
    'l’avatar vient du profil Microsoft, écrit au premier SSO, comme `bauth_account` juste au-dessus.',
  OtpAttempt:
    'la trace anti-bruteforce d’une tentative de connexion. Elle naît de la tentative elle-même et est purgée derrière.',

  // ── Une fonctionnalité BetterAuth que Jump n'utilise pas. ──
  'bauth_user.banned':
    'le bannissement est une fonctionnalité du plugin admin de BetterAuth. Jump ne l’expose nulle part et n’écrit jamais ces trois colonnes : bloquer quelqu’un se fait en supprimant son compte.',
  'bauth_user.banReason': 'voir `bauth_user.banned`.',
  'bauth_user.banExpires': 'voir `bauth_user.banned`.',

  // ── Une ligne que le générateur ne réécrit pas. ──
  'MinigameConfig.enabled':
    'la rotation est une curation de l’hôte, écrite en create-only et jamais réinitialisée par une re-génération. Sa valeur dépend donc de l’historique de la base et non de ce run : ni l’une ni l’autre branche n’est garantie, et une vérification qui dépend de l’ordre des exécutions vaut moins que pas de vérification.',
};

/**
 * States that should exist and do not yet, one line per gap.
 *
 * This list is exact by construction: a gap that is fixed fails until its line
 * is removed. Its length is therefore the honest measure of what a person
 * opening this dataset cannot see. Burn it down; do not grow it.
 */
const NOT_YET_SEEDED: Readonly<Record<string, string>> = {
  // ── Les formulaires de bilan, qui viennent de fixtures JSON. ──
  // Toutes ces colonnes se remplissent dans `catalog/feedbackForms/*.json` ou
  // dans le seeder qui les lit, pas dans un scénario. Un même lot.
  'Feedback_Form.allowsAuthenticatedAccess':
    'aucun formulaire ouvert aux seuls talents connectés. C’est le partage identifié / anonyme, donc la moitié non testée du split d’audience.',
  'Feedback_Form.createdById':
    'les formulaires du catalogue n’ont pas d’auteur ; aucun n’a été composé par un membre de l’équipe.',
  'Feedback_Form.updatedById': 'voir `Feedback_Form.createdById`.',
  'Feedback_Form.intro':
    'les trois fixtures portent toutes une intro ; aucune ne montre le rendu sans.',
  'Feedback_Form.personaIconKey':
    'aucune fixture ne nomme de persona, donc l’en-tête illustré du formulaire ne s’affiche jamais.',
  'Feedback_Question.minSelections':
    'aucune question multi ne fixe de minimum, donc la validation « choisis-en au moins N » ne se déclenche nulle part.',
  'Feedback_Submission.matchedAt':
    'aucune soumission publique n’a été rattachée après coup à un talent. C’est l’acte de rapprochement lui-même qui n’a pas d’exemple.',
  'Feedback_Submission.respondentCivility':
    'les soumissions publiques renseignent le nom et l’e-mail, jamais les trois champs facultatifs de l’en-tête.',
  'Feedback_Submission.respondentPhone':
    'voir `Feedback_Submission.respondentCivility`.',
  'Feedback_Submission.respondentCampusLabel':
    'voir `Feedback_Submission.respondentCivility`.',

  // ── Le miroir Salesforce, qui n'est jamais partiel. ──
  // Le miroir est écrit complet pour chaque talent. Salesforce, lui, envoie des
  // fiches trouées, et c'est ce que la réconciliation doit encaisser.
  'TalentSfImport.nom':
    'le miroir est toujours écrit complet. Salesforce envoie des fiches partielles, et une colonne nulle côté miroir est ce que `reconciliationService` doit traiter comme « le CRM ne dit rien » plutôt que comme une divergence.',
  'TalentSfImport.prenom': 'voir `TalentSfImport.nom`.',
  'TalentSfImport.phone': 'voir `TalentSfImport.nom`.',
  'TalentSfImport.sfEmail': 'voir `TalentSfImport.nom`.',
  'TalentSfImport.civilite':
    'la civilité n’est jamais réclamée au CRM, donc la colonne est nulle partout et le côté « ce que Salesforce prétend » de cette ligne ne s’affiche jamais.',

  // ── Divers, un par lot. ──
  'Closing_TemplateSection.synthesisPosition':
    'toutes les sections des grilles semées se placent dans la synthèse. Une section posée au talent mais absente du document produit est une composition légitime, sans exemple.',
  'Interest.emoji':
    'chaque intérêt du catalogue porte un emoji. Un intérêt créé par l’équipe peut ne pas en avoir, et la puce sans emoji ne s’affiche nulle part.',
  'bauth_user.name':
    'tout compte semé porte un nom. BetterAuth autorise un compte sans, et le repli sur l’adresse e-mail n’est jamais rendu.',
};

type ColumnGap = {
  /** `Model` or `Model.field`. */
  key: string;
  /** What a reader is told, without the key. */
  detail: string;
};

/** The three states a column can be in, named as the failure line names them. */
const NULL = 'null';
const VALUE = 'une valeur';
const TRUE = 'true';
const FALSE = 'false';

function quote(identifier: string): string {
  if (identifier.includes('"')) {
    throw new Error(`Identifiant impossible à citer : ${identifier}`);
  }
  return `"${identifier}"`;
}

/**
 * The gaps the database actually has, before any exemption is applied.
 *
 * One query per table rather than one per column: the aggregates all read the
 * same rows, and 65 scans beat several hundred.
 */
async function observedGaps(prisma: PrismaClient): Promise<ColumnGap[]> {
  const datamodel = await loadDatamodel();
  const gaps: ColumnGap[] = [];

  for (const model of datamodel.models) {
    const table = model.dbName ?? model.name;

    const columns = model.fields
      .filter((field) => field.kind === 'scalar' && !field.isList)
      .map((field) => ({
        name: field.name,
        column: field.dbName ?? field.name,
        nullable: !field.isRequired,
        boolean: field.type === 'Boolean',
      }))
      .filter((column) => column.nullable || column.boolean);

    const selects = ['count(*)::int AS total'];
    for (const [index, column] of columns.entries()) {
      const quoted = quote(column.column);
      if (column.nullable) {
        selects.push(`count(${quoted})::int AS set_${index}`);
      }
      if (column.boolean) {
        selects.push(
          `count(*) FILTER (WHERE ${quoted})::int AS true_${index}`,
          `count(*) FILTER (WHERE NOT ${quoted})::int AS false_${index}`,
        );
      }
    }

    const [row] = await prisma.$queryRawUnsafe<Record<string, number>[]>(
      `SELECT ${selects.join(', ')} FROM ${quote(table)}`,
    );
    const total = row?.total ?? 0;

    // A model with no rows makes every one of its columns a gap too. Reporting
    // the model alone keeps one cause to one line.
    if (total === 0) {
      gaps.push({ key: model.name, detail: 'aucune ligne' });
      continue;
    }

    for (const [index, column] of columns.entries()) {
      const missing: string[] = [];
      if (column.nullable) {
        const set = row?.[`set_${index}`] ?? 0;
        if (set === 0) missing.push(VALUE);
        if (set === total) missing.push(NULL);
      }
      if (column.boolean) {
        if ((row?.[`true_${index}`] ?? 0) === 0) missing.push(TRUE);
        if ((row?.[`false_${index}`] ?? 0) === 0) missing.push(FALSE);
      }
      if (missing.length > 0) {
        gaps.push({
          key: `${model.name}.${column.name}`,
          detail: `aucune ligne où la colonne vaut ${missing.join(' ni ')}`,
        });
      }
    }
  }

  return gaps;
}

/** How many gaps are currently accepted as debt. Printed on every run. */
export const KNOWN_GAP_COUNT = Object.keys(NOT_YET_SEEDED).length;

export async function coverageFailures(
  prisma: PrismaClient,
): Promise<string[]> {
  const gaps = await observedGaps(prisma);
  const open = new Set(gaps.map((gap) => gap.key));
  const failures: string[] = [];

  for (const gap of gaps) {
    if (gap.key in NEVER_SEEDED) continue;
    if (gap.key in NOT_YET_SEEDED) continue;
    failures.push(`${gap.key} : ${gap.detail}`);
  }

  // The other direction, and the reason the debt list can be trusted: a gap that
  // has been closed must lose its line, or the list stops describing anything.
  for (const key of Object.keys(NOT_YET_SEEDED)) {
    if (open.has(key)) continue;
    failures.push(
      `${key} : désormais couvert. Retirez la ligne de NOT_YET_SEEDED.`,
    );
  }

  return failures.sort();
}
