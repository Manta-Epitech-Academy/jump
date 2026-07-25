/**
 * Auto-generates a domain-grouped Entity-Relationship map of the database as
 * Mermaid diagrams in `docs/database.md`, straight from `prisma/schema.prisma`.
 *
 * Why a homemade script rather than a community generator (prisma-markdown,
 * prisma-erd-generator): this project runs bleeding-edge Prisma 7, where those
 * generators lag and break on each bump. This uses Prisma's OWN parser
 * (`getDMMF`), so it always tracks the installed Prisma version, adds no runtime
 * dependency, and gives full control over the domain grouping.
 *
 * Run `bun run db:erd` (also chained after `bun run db:generate`). The output is
 * committed and versioned: a schema change regenerates it, so the git diff of
 * `docs/database.md` is the human-readable "what changed in the DB" record.
 *
 * The output file is generated; never hand-edit it. Group a newly-added model by
 * adding it to DOMAINS below (an unmapped model is placed in "Autres" and logged
 * as a warning, so it is never silently dropped).
 */
import { getDMMF } from '@prisma/internals';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// Structural types derived from Prisma's own parser output, so we depend on no
// separate `@prisma/generator-helper` package for the shapes.
type Datamodel = Awaited<ReturnType<typeof getDMMF>>['datamodel'];
type Model = Datamodel['models'][number];

// Optional CLI args render an arbitrary schema/output — e.g. a past git
// revision — for before/after comparisons: `bun run db:erd <schema> <out>`.
const SCHEMA_PATH = process.argv[2] ?? 'prisma/schema.prisma';
const OUT_PATH = process.argv[3] ?? 'docs/database.md';

// Ordered domains. Each model lands in exactly one; the order here is the order
// of sections in the output. Keep the groupings meaningful — they are the story
// the map tells. A model absent from every list falls into "Autres" (logged).
//
// Retired models are kept here on purpose: this tool doubles as a before/after
// comparator (`bun run db:erd <old-schema>`), so a past schema still renders in
// its proper section. Entries not present in the current schema are skipped and
// summarised, not treated as errors.
const DOMAINS: { title: string; models: string[] }[] = [
  {
    title: 'Authentification & Profils',
    models: [
      'bauth_user',
      'bauth_session',
      'bauth_account',
      'bauth_verification',
      'OtpAttempt',
      'AuthIdentityRepair',
      'StaffProfile',
      'StaffInvitation',
      'Talent',
      'School',
      'TalentSfImport',
      'Campus',
    ],
  },
  {
    title: 'Cycle de vie talent & RGPD',
    models: [
      'TalentDeletionRequest',
      'ImageRightsDecisionRecord',
      'Note_TalentNote',
      'Schooling_YearRecord',
      'Audit_ImpersonationEvent',
    ],
  },
  {
    title: 'Événements & Participations',
    models: [
      'Event',
      'EventConfig_Module',
      'EventConfig_Template',
      'EventConfig_TemplateModule',
      'EventManta',
      'Participation',
      'StageCompliance',
      'ParticipationActivity',
      'Interview',
      'InterviewReset',
      'EventPresence',
      'EventPresenceClosure',
    ],
  },
  {
    title: 'Planning & Activités',
    models: [
      'Planning',
      'TimeSlot',
      'Activity',
      'ActivityTheme',
      'Theme',
      'ActivityTemplate',
      'ActivityTemplateTheme',
      'PlanningTemplate',
      'PlanningTemplateDay',
      'PlanningTemplateSlot',
    ],
  },
  {
    title: 'Référentiel de compétences',
    models: [
      'RefCompSnapshot',
      'Competence',
      'Skill',
      'SkillLevel',
      'Observable',
      'Subject',
      'SubjectVersion',
      'Document',
      'Section',
      'SubjectObservable',
      'SubjectQuiz',
      'TalentObservableState',
      'TalentCompetenceState',
      'TalentQuizAttempt',
      'StepsProgress',
    ],
  },
  {
    title: 'Progression, Portfolio & XP',
    models: ['PortfolioItem', 'XpGrant', 'XpReward'],
  },
  {
    title: 'Minijeux',
    models: ['MinigameConfig', 'MinigamePublication', 'MinigameAttempt'],
  },
  {
    title: 'Feedback',
    models: [
      'Feedback_Form',
      'Feedback_Section',
      'Feedback_Question',
      'Feedback_QuestionOption',
      'Feedback_Submission',
      'Feedback_Answer',
      'Feedback_AnswerOption',
    ],
  },
  {
    title: 'Communication & Support',
    models: [
      'Broadcast',
      'BroadcastRecipient',
      'MessageTemplate',
      'EmailActionMapping',
      'OnboardingReminder',
      'OnboardingPdfJob',
      'Ticket',
      'TicketMessage',
    ],
  },
  {
    title: "Contenus & Centres d'intérêt",
    models: ['CmsPage', 'CmsImage', 'Interest', 'TalentInterest'],
  },
  {
    title: 'Configuration & Système',
    models: [
      'CampusFeatureFlag',
      'AppSetting',
      'Signatory',
      'AdminFile',
      'SyncError',
    ],
  },
];

const dmmf = await getDMMF({ datamodel: readFileSync(SCHEMA_PATH, 'utf-8') });
const models = dmmf.datamodel.models;
const modelByName = new Map(models.map((m) => [m.name, m]));

// --- Assign every model to a domain (unmapped -> "Autres", logged) ---
const domainOf = new Map<string, string>();
const retired: string[] = [];
for (const d of DOMAINS)
  for (const name of d.models) {
    if (!modelByName.has(name)) retired.push(name);
    domainOf.set(name, d.title);
  }
if (retired.length)
  console.warn(
    `ℹ ${retired.length} grouped model(s) absent from this schema (retired or other revision): ${retired.join(', ')}`,
  );
const orphans: string[] = [];
for (const m of models)
  if (!domainOf.has(m.name)) {
    orphans.push(m.name);
    domainOf.set(m.name, 'Autres');
  }
if (orphans.length)
  console.warn(
    `⚠ ${orphans.length} model(s) not grouped, placed in "Autres": ${orphans.join(', ')}`,
  );
const sections = orphans.length
  ? [...DOMAINS, { title: 'Autres', models: orphans }]
  : DOMAINS;

// --- Per-model key sets (PK / UK) from the DMMF ---
function keySets(model: Model) {
  const pk = new Set<string>();
  if (model.primaryKey) model.primaryKey.fields.forEach((f) => pk.add(f));
  const uk = new Set<string>();
  for (const grp of model.uniqueFields) grp.forEach((f) => uk.add(f));
  const fk = new Set<string>();
  for (const f of model.fields)
    if (f.relationFromFields) f.relationFromFields.forEach((s) => fk.add(s));
  return { pk, uk, fk };
}

// Mermaid attribute line: `<type> <name> <PK,FK,UK>`. Only scalar/enum columns
// are attributes; object (relation) fields are drawn as edges instead.
function renderEntity(model: Model): string {
  const { pk, uk, fk } = keySets(model);
  const lines: string[] = [];
  for (const f of model.fields) {
    if (f.kind === 'object') continue;
    const keys: string[] = [];
    if (f.isId || pk.has(f.name)) keys.push('PK');
    if (fk.has(f.name)) keys.push('FK');
    if (f.isUnique || uk.has(f.name)) keys.push('UK');
    const type = f.isList ? `${f.type}[]` : f.type;
    lines.push(
      `    ${type} ${f.name}${keys.length ? ' ' + keys.join(',') : ''}`,
    );
  }
  return `  ${model.name} {\n${lines.join('\n')}\n  }`;
}

// --- Relations: one edge per relationName, "homed" in the FK-holder's domain ---
type Edge = {
  home: string;
  left: string;
  right: string;
  card: string;
  label: string;
};
const seen = new Set<string>();
const edges: Edge[] = [];
for (const m of models) {
  for (const f of m.fields) {
    if (f.kind !== 'object' || !f.relationName || seen.has(f.relationName))
      continue;
    // Find the partner field (same relationName, the other side).
    let partnerModel: Model | undefined;
    let partner: Model['fields'][number] | undefined;
    for (const cand of models) {
      const pf = cand.fields.find(
        (x) =>
          x.relationName === f.relationName &&
          !(cand.name === m.name && x.name === f.name),
      );
      if (pf) {
        partnerModel = cand;
        partner = pf;
        break;
      }
    }
    if (!partnerModel || !partner) continue;
    seen.add(f.relationName);

    // FK holder = the side carrying relationFromFields (the "child").
    const fSide = { model: m, field: f };
    const pSide = { model: partnerModel, field: partner };
    const holder =
      f.relationFromFields && f.relationFromFields.length ? fSide : pSide;
    const other = holder === fSide ? pSide : fSide;

    let card: string;
    let left: string;
    let right: string;
    let label: string;
    if (f.isList && partner.isList) {
      // many-to-many
      left = fSide.model.name;
      right = pSide.model.name;
      card = '}o--o{';
      label = fSide.field.name;
    } else if (!f.isList && !partner.isList) {
      // one-to-one: referenced side left, FK holder right
      left = other.model.name;
      right = holder.model.name;
      card = holder.field.isRequired ? '||--||' : '||--o|';
      label = other.field.name;
    } else {
      // one-to-many: parent (the non-list, referenced side) left, child right
      const parent = f.isList ? fSide : pSide; // the list field's owner is the "one" parent
      const child = parent === fSide ? pSide : fSide;
      left = parent.model.name;
      right = child.model.name;
      card = child.field.isRequired ? '||--o{' : '|o--o{';
      label = parent.field.name;
    }
    edges.push({
      home: domainOf.get(holder.model.name) ?? 'Autres',
      left,
      right,
      card,
      label,
    });
  }
}

// --- Assemble the markdown ---
const relCount = edges.length;
// Render only sections that actually have models in THIS schema, and count the
// present models (not the DOMAINS catalogue). So a schema that has shed a whole
// domain drops the section entirely instead of showing an empty one — which is
// what makes the same tool render both a past and the current schema cleanly.
const rendered = sections
  .map((s) => ({
    title: s.title,
    members: s.models.filter((n) => modelByName.has(n)),
  }))
  .filter((s) => s.members.length > 0);
const perDomain = rendered
  .map((s) => `| ${s.title} | ${s.members.length} |`)
  .join('\n');

let out = `# Carte de la base de données

> Généré automatiquement par \`bun run db:erd\` depuis \`prisma/schema.prisma\`.
> **Ne pas éditer à la main** — toute modification est écrasée à la régénération.
> Le diff git de ce fichier = le journal lisible des changements de schéma.

## Vue d'ensemble

- **${models.length}** modèles · **${dmmf.datamodel.enums.length}** enums · **${relCount}** relations

| Domaine | Modèles |
| --- | ---: |
${perDomain}
`;

rendered.forEach((s, i) => {
  const memberSet = new Set(s.members);
  const entities = s.members.map((n) => renderEntity(modelByName.get(n)!));
  const homed = edges.filter((e) => e.home === s.title);
  // External endpoints (referenced by a homed edge but not a domain member)
  // render as bare entities so the cross-domain link is visible without
  // duplicating the whole table.
  const external = new Set<string>();
  for (const e of homed) {
    if (!memberSet.has(e.left)) external.add(e.left);
    if (!memberSet.has(e.right)) external.add(e.right);
  }
  const extBlocks = [...external].map((n) => `  ${n} {\n  }`);
  const edgeLines = homed.map(
    (e) => `  ${e.left} ${e.card} ${e.right} : "${e.label}"`,
  );
  out += `\n## ${i + 1} · ${s.title}\n\n\`\`\`mermaid\nerDiagram\n${[...entities, ...extBlocks].join('\n')}\n${edgeLines.join('\n')}\n\`\`\`\n`;
});

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, out);
console.log(
  `✓ ${OUT_PATH}: ${models.length} models, ${dmmf.datamodel.enums.length} enums, ${relCount} relations across ${rendered.length} domains`,
);
