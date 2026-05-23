<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import GitCompareArrows from '@lucide/svelte/icons/git-compare-arrows';
  import Download from '@lucide/svelte/icons/download';
  import Check from '@lucide/svelte/icons/check';
  import CloudDownload from '@lucide/svelte/icons/cloud-download';
  import type { ConflictField } from '$lib/server/services/reconciliationService';

  let { data } = $props();

  const FIELD_LABELS: Record<ConflictField, string> = {
    nom: 'Nom',
    prenom: 'Prénom',
    phone: 'Téléphone',
    civilite: 'Civilité',
    school: 'Lycée',
  };

  const CIVILITE_LABELS: Record<string, string> = {
    homme: 'Homme',
    femme: 'Femme',
    autre: 'Autre',
  };

  function displayValue(field: ConflictField, value: string | null): string {
    if (!value) return '—';
    if (field === 'civilite') return CIVILITE_LABELS[value] ?? value;
    return value;
  }
</script>

<div class="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div class="flex items-center gap-3">
      <GitCompareArrows class="h-6 w-6 text-epi-blue" />
      <div>
        <h1
          class="font-heading text-2xl tracking-wide text-foreground uppercase"
        >
          Conflits Salesforce
        </h1>
        <p class="text-sm text-muted-foreground">
          {data.totalFields}
          {data.totalFields > 1 ? 'divergences' : 'divergence'} sur
          {data.totalTalents}
          {data.totalTalents > 1 ? 'talents' : 'talent'} — entre l'info confirmée
          par le talent et ce que Salesforce envoie.
        </p>
      </div>
    </div>
    {#if data.totalFields > 0}
      <a
        href={resolve('/staff/admin/sf-conflicts/export')}
        class="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        download
      >
        <Download class="h-4 w-4" /> Exporter CSV
      </a>
    {/if}
  </div>

  {#if data.conflicts.length === 0}
    <Card.Root class="rounded-sm">
      <Card.Content class="py-12 text-center text-sm text-muted-foreground">
        Aucun conflit : tout ce que les talents ont confirmé concorde avec
        Salesforce.
      </Card.Content>
    </Card.Root>
  {:else}
    {#each data.conflicts as t (t.talentId)}
      <Card.Root class="rounded-sm shadow-sm dark:shadow-none">
        <div
          class="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-3"
        >
          <div>
            <p class="font-medium">{t.prenom} {t.nom}</p>
            <p class="text-xs text-muted-foreground">
              {t.email ?? '—'}
              {#if t.externalId}· SF {t.externalId}{/if}
            </p>
          </div>
        </div>
        <Card.Content class="p-0">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b text-left text-xs text-muted-foreground">
                <th class="px-5 py-2 font-medium">Champ</th>
                <th class="px-5 py-2 font-medium">Jump (confirmé)</th>
                <th class="px-5 py-2 font-medium">Salesforce</th>
                <th class="px-5 py-2 text-right font-medium">Conserver</th>
              </tr>
            </thead>
            <tbody>
              {#each t.conflicts as c (c.field)}
                <tr class="border-b last:border-0">
                  <td class="px-5 py-2.5 align-middle font-medium">
                    {FIELD_LABELS[c.field]}
                  </td>
                  <td class="px-5 py-2.5 align-middle text-epi-blue">
                    {displayValue(c.field, c.jump)}
                  </td>
                  <td class="px-5 py-2.5 align-middle text-muted-foreground">
                    {displayValue(c.field, c.sf)}
                  </td>
                  <!-- Resolution is per field: each button writes only this one
                       column, never the rest of the talent. -->
                  <td class="px-5 py-2.5 align-middle">
                    <div class="flex items-center justify-end gap-2">
                      <form method="POST" action="?/acceptJump" use:enhance>
                        <input
                          type="hidden"
                          name="talentId"
                          value={t.talentId}
                        />
                        <input type="hidden" name="field" value={c.field} />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          class="gap-1.5"
                          title="Garder la valeur Jump (Salesforce sera réaligné)"
                        >
                          <Check class="h-3.5 w-3.5" /> Jump
                        </Button>
                      </form>
                      <form method="POST" action="?/adoptSf" use:enhance>
                        <input
                          type="hidden"
                          name="talentId"
                          value={t.talentId}
                        />
                        <input type="hidden" name="field" value={c.field} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          class="gap-1.5 text-muted-foreground"
                          title="Prendre la valeur Salesforce"
                        >
                          <CloudDownload class="h-3.5 w-3.5" /> Salesforce
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </Card.Content>
      </Card.Root>
    {/each}
  {/if}
</div>
