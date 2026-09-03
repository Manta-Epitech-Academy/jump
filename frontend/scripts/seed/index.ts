/**
 * The generator.
 *
 *   bun run seed --env dev --profile dev --today 2026-08-30
 *
 * Deterministic by construction: the same `--seed` and the same `--today`
 * produce the same rows, ids included. Both are printed in the manifest, so any
 * dataset anybody is looking at can be rebuilt exactly.
 *
 * It refuses to run without `--env`, and refuses production outright. It
 * truncates what it previously wrote before filling, so the cost of a wrong
 * target is not a messy database but a destroyed one - which is why the guard
 * comes before anything else, including reading its own arguments.
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import {
  createClient,
  loadEnv,
  type SeedContext,
  type ManifestEntry,
} from './context';
import {
  assertGeneratorOwnsDataset,
  assertWritableTarget,
  SEED_TARGETS,
} from './guard';
import { createClock, parseAnchor } from './clock';
import { createRng } from './rng';
import { isProfileName, PROFILES } from './profiles';
import { World } from './world';
import { SCENARIOS } from './scenarios';
import { flush, wipe } from './writer';
import { MANIFEST_SETTING_KEY, renderManifest } from './manifest';
import { runChecks } from './assert';
import {
  seedInterests,
  seedEmailTemplates,
  seedBroadcastTemplates,
} from './catalog/interestsAndTemplates';
import {
  FEEDBACK_FORM_SLUGS,
  seedFeedbackForms,
} from './catalog/feedbackForms';
import { MINIGAMES } from './catalog/platform';
import { STAGE_TEMPLATE_KEY } from './catalog/closings';

const DEFAULT_SEED = 20260830;

type Args = {
  env?: string;
  profile: string;
  today?: string;
  seed: number;
  check: boolean;
  catalogOnly: boolean;
  out?: string;
  help: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    profile: 'dev',
    seed: DEFAULT_SEED,
    check: false,
    catalogOnly: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    const value = () => argv[++i];
    if (token === '--env') args.env = value();
    else if (token === '--profile') args.profile = value() ?? 'dev';
    else if (token === '--today') args.today = value();
    else if (token === '--seed') args.seed = Number(value());
    else if (token === '--out') args.out = value();
    else if (token === '--check') args.check = true;
    else if (token === '--catalog-only') args.catalogOnly = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`Unknown argument "${token}".`);
  }
  return args;
}

const USAGE = `bun run seed --env <cible> --profile <profil> --today <YYYY-MM-DD> [options]

  --env           ${SEED_TARGETS.join(' | ')}. Obligatoire : rien n'est écrit sans.
  --profile       ${Object.keys(PROFILES).join(' | ')}. Défaut : dev.
  --today         L'ancre. Obligatoire : le générateur ne lit jamais l'horloge.
  --seed          Graine du tirage. Défaut : ${DEFAULT_SEED}.
  --check         Vérifie le résultat avec le domaine, après l'écriture.
  --catalog-only  N'écrit que les référentiels, sans toucher aux données.
  --out           Écrit le manifeste « où trouver quoi » dans ce fichier.`;

/**
 * The rotation curation. Not part of the wipe: `MinigameConfig` is a host
 * decision about which games are in play, keyed on the game slug rather than on
 * an id, and re-running the generator has no business resetting it.
 */
async function seedMinigameRotation(
  prisma: PrismaClient,
  anchor: Date,
): Promise<void> {
  for (const [index, game] of MINIGAMES.entries()) {
    await prisma.minigameConfig.upsert({
      where: { game: game.game },
      update: {},
      create: {
        game: game.game,
        weight: game.weight,
        // One game switched off. `enabled` is the whole curation control, and a
        // rotation where every game is on renders the off state nowhere - so
        // neither the toggle nor the filter that honours it is ever exercised.
        enabled: index !== 1,
        updatedAt: anchor,
      },
    });
  }
}

/**
 * Reads the rows that already exist when the scenarios start, and that the
 * generator composes against rather than recreating.
 *
 * Two provenances, and the distinction does not matter to a scenario: what a
 * migration owns (the closing question bank, the stage grid, the certificate)
 * and what the catalogue seeders just wrote a few lines above (the interests,
 * the bilan forms). Both are outside the buffer, so both have to be read back
 * for their ids.
 */
async function loadPreexistingRows(
  prisma: PrismaClient,
  world: World,
): Promise<void> {
  const questions = await prisma.closing_Question.findMany({
    select: {
      id: true,
      key: true,
      kind: true,
      max: true,
      options: { select: { id: true } },
    },
  });
  for (const question of questions) {
    world.bank.set(question.key, {
      id: question.id,
      key: question.key,
      kind: question.kind,
      max: question.max,
      optionIds: question.options.map((option) => option.id),
    });
  }

  const stageTemplate = await prisma.closing_Template.findUnique({
    where: { key: STAGE_TEMPLATE_KEY },
    select: { id: true },
  });
  if (!stageTemplate) {
    throw new Error(
      `Aucune grille de closing « ${STAGE_TEMPLATE_KEY} » en base. Elle vient d'une migration : lancez \`prisma migrate deploy\` avant de semer.`,
    );
  }
  world.stageTemplateId = stageTemplate.id;
  world.diplomaTemplateId =
    (await prisma.diploma_Template.findFirst({ select: { id: true } }))?.id ??
    null;

  const forms = await prisma.feedback_Form.findMany({
    select: {
      id: true,
      slug: true,
      sections: {
        select: {
          questions: {
            select: { id: true, type: true, options: { select: { id: true } } },
          },
        },
      },
    },
  });
  // Ordered, so which interests a dossier carries depends on the draw alone and
  // not on the order Postgres happened to return them in.
  const interests = await prisma.interest.findMany({
    select: { id: true, kind: true },
    orderBy: { order: 'asc' },
  });
  for (const interest of interests) {
    if (interest.kind === 'tech') world.interests.tech.push(interest.id);
    else world.interests.general.push(interest.id);
  }

  for (const form of forms) {
    world.feedbackForms.set(form.slug, {
      id: form.id,
      slug: form.slug,
      questions: form.sections.flatMap((section) =>
        section.questions.map((question) => ({
          id: question.id,
          type: question.type,
          optionIds: question.options.map((option) => option.id),
        })),
      ),
    });
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  loadEnv();

  // Before anything else, including reading the rest of the arguments.
  const target = assertWritableTarget(args.env, process.env.DATABASE_URL);

  if (!isProfileName(args.profile)) {
    throw new Error(
      `Unknown --profile "${args.profile}". One of: ${Object.keys(PROFILES).join(', ')}.`,
    );
  }
  const profile = PROFILES[args.profile];
  // Built before the catalogue branch, not inside the full run: the catalogues
  // carry timestamps too, and a row stamped from the wall clock is a row this
  // generator cannot reproduce.
  const clock = createClock(parseAnchor(args.today));

  const prisma = createClient();
  const log = (message: string) => console.log(message);

  try {
    if (args.catalogOnly) {
      // The one mode that is safe against a populated database: create-only,
      // never overwriting a row somebody has since edited.
      log(`Catalogues seulement, cible ${target}.`);
      log(`  intérêts               ${await seedInterests(prisma)}`);
      log(
        `  formulaires de bilan   ${await seedFeedbackForms(prisma, clock.today)}`,
      );
      await seedMinigameRotation(prisma, clock.today);
      const author = await prisma.staffProfile.findFirst({
        select: { userId: true },
      });
      if (author) {
        await seedEmailTemplates(prisma, author.userId);
        await seedBroadcastTemplates(prisma, author.userId);
      } else {
        log(
          '  modèles de message     ignorés : aucun membre d’équipe pour les signer',
        );
      }
      return;
    }

    const manifest: ManifestEntry[] = [];
    const ctx: SeedContext = {
      prisma,
      clock,
      rng: createRng(args.seed),
      target,
      profile,
      manifest,
      log,
    };

    log(
      `Profil ${profile.name}, cible ${target}, ancre ${clock.dateKey(clock.today)}, graine ${args.seed}.`,
    );

    // The third gate, and the only one that needs the database open. It sits
    // before the wipe rather than beside the other two because `--catalog-only`
    // returns above: that mode is create-only and is meant to run against a
    // populated database, which is the one case this refusal would be wrong for.
    await assertGeneratorOwnsDataset(prisma);

    log('Nettoyage :');
    const removed = await wipe(prisma, log, FEEDBACK_FORM_SLUGS);
    log(`  ${removed} lignes retirées.`);

    log('Catalogues :');
    log(`  intérêts               ${await seedInterests(prisma)}`);
    log(
      `  formulaires de bilan   ${await seedFeedbackForms(prisma, clock.today)}`,
    );
    await seedMinigameRotation(prisma, clock.today);

    const world = new World(ctx);
    await loadPreexistingRows(prisma, world);
    if (world.bank.size === 0) {
      throw new Error(
        'La banque de questions de closing est vide. Lancez `prisma migrate deploy` avant de semer : la banque vient d’une migration, pas d’ici.',
      );
    }

    log('Scénarios :');
    for (const scenario of SCENARIOS) {
      await scenario.run(world);
      log(`  ${scenario.name}`);
    }

    world.finalize();

    log('Écriture :');
    const rows = await flush(prisma, world.buffer, log, clock.today);
    log(`  ${rows} lignes écrites.`);

    const markdown = renderManifest(ctx, {
      seed: args.seed,
      rows,
      databaseLabel: target,
    });
    await prisma.appSetting.upsert({
      where: { key: MANIFEST_SETTING_KEY },
      update: { value: markdown, updatedAt: clock.today },
      create: {
        key: MANIFEST_SETTING_KEY,
        value: markdown,
        updatedAt: clock.today,
      },
    });
    if (args.out) {
      await writeFile(path.resolve(args.out), markdown, 'utf8');
      log(`Manifeste écrit dans ${args.out}.`);
    }

    if (args.check) {
      log('Vérification :');
      const failures = await runChecks(prisma, log, clock);
      if (failures > 0) {
        throw new Error(
          `${failures} vérification(s) en échec. Une valeur d’énumération sans ligne se corrige en ajoutant son scénario, pas en retirant la vérification.`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
