/**
 * The « où trouver quoi » page.
 *
 * It is reported, never written. Every line comes from a scenario that actually
 * ran, so the page cannot describe a situation the dataset does not contain -
 * which is the failure mode of every hand-written test-data README: it is
 * correct on the day it is written and misleading from the following week.
 *
 * This is the artifact the PO's validation window rests on. The frustration a
 * generated dataset causes is almost never "the names are fake"; it is "I cannot
 * find a case that lets me judge what I have been asked to judge". This page is
 * the answer to that, and its accounts section is the answer to the second one,
 * which is not being able to sign in as the persona a screen is for.
 */

import type { ManifestEntry, SeedContext } from './context';

export function renderManifest(
  ctx: SeedContext,
  meta: { seed: number; rows: number; databaseLabel: string },
): string {
  const lines: string[] = [];

  lines.push('# Où trouver quoi');
  lines.push('');
  lines.push(
    `Jeu de données **${ctx.profile.name}**, ancré au **${ctx.clock.dateKey(ctx.clock.today)}**, graine **${meta.seed}**, ${meta.rows.toLocaleString('fr-FR')} lignes.`,
  );
  lines.push('');
  lines.push(
    'Cette page est produite par le générateur à partir des scénarios réellement exécutés. Elle ne se rédige pas et ne peut donc pas décrire une situation absente du jeu de données.',
  );
  lines.push('');
  lines.push(
    `Pour reproduire exactement ce jeu de données : \`bun run seed --env <cible> --profile ${ctx.profile.name} --today ${ctx.clock.dateKey(ctx.clock.today)} --seed ${meta.seed}\`.`,
  );
  lines.push('');

  const accounts = ctx.manifest.flatMap((entry) => entry.accounts ?? []);
  if (accounts.length > 0) {
    lines.push('## Comptes de connexion');
    lines.push('');
    lines.push(
      'Les comptes staff passent par Microsoft ; les talents et les responsables légaux reçoivent un code à usage unique, redirigé vers l’adresse de développement configurée.',
    );
    lines.push('');
    lines.push('| Rôle | Adresse | Note |');
    lines.push('| --- | --- | --- |');
    for (const account of accounts) {
      lines.push(
        `| ${account.role} | \`${account.email}\` | ${account.note ?? ''} |`,
      );
    }
    lines.push('');
  }

  lines.push('## Scénarios');
  lines.push('');
  for (const entry of ctx.manifest) {
    lines.push(`### ${entry.scenario}`);
    lines.push('');
    lines.push(entry.summary);
    lines.push('');
    const place = [
      entry.campus && `Campus : ${entry.campus}`,
      entry.event && `Événement : ${entry.event}`,
    ]
      .filter(Boolean)
      .join(' · ');
    if (place) {
      lines.push(place);
      lines.push('');
    }
    for (const item of entry.covers) lines.push(`- ${item}`);
    lines.push('');
  }

  return lines.join('\n');
}

/** The key the manifest is stored under, so the app can serve it. */
export const MANIFEST_SETTING_KEY = 'seed.manifest';

export function manifestEntries(ctx: SeedContext): readonly ManifestEntry[] {
  return ctx.manifest;
}
