<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import * as Card from '$lib/components/ui/card';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import GitCompareArrows from '@lucide/svelte/icons/git-compare-arrows';
  import Download from '@lucide/svelte/icons/download';
  import CloudDownload from '@lucide/svelte/icons/cloud-download';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';
  import type { DiffField } from '$lib/server/services/reconciliationService';

  let { data } = $props();

  const FIELD_LABELS: Record<DiffField, string> = {
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

  function displayValue(field: DiffField, value: string | null): string {
    if (!value) return '—';
    if (field === 'civilite') return CIVILITE_LABELS[value] ?? value;
    return value;
  }

  // Adopting Salesforce overwrites a talent-confirmed value with no trivial undo,
  // so it is gated behind a confirm dialog. One dialog, driven by the row the
  // reviewer clicked.
  let adoptOpen = $state(false);
  let adopting = $state(false);
  let adoptTarget = $state<{
    talentId: string;
    field: DiffField;
    fieldLabel: string;
    talentName: string;
    jump: string;
    sf: string;
  } | null>(null);

  function askAdopt(
    talent: { talentId: string; prenom: string; nom: string },
    field: DiffField,
    jump: string | null,
    sf: string | null,
  ) {
    adoptTarget = {
      talentId: talent.talentId,
      field,
      fieldLabel: FIELD_LABELS[field],
      talentName: `${talent.prenom} ${talent.nom}`,
      jump: displayValue(field, jump),
      sf: displayValue(field, sf),
    };
    adoptOpen = true;
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
          Divergences Salesforce
        </h1>
        <p class="text-sm text-muted-foreground">
          {data.totalFields}
          {data.totalFields > 1 ? 'écarts' : 'écart'} sur
          {data.totalTalents}
          {data.totalTalents > 1 ? 'talents' : 'talent'} — entre l'info confirmée
          par le talent (qui fait foi) et ce que Salesforce envoie. Exportez le CSV
          pour pousser ces corrections, et les données absentes de Salesforce (contacts
          parents), via le script externe. Chaque écart reste listé tant que Salesforce
          ne porte pas la valeur : le prochain sync le solde tout seul.
        </p>
      </div>
    </div>
    <a
      href={resolve('/staff/admin/sf-conflicts/export')}
      class="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
      download
    >
      <Download class="h-4 w-4" /> Exporter CSV
    </a>
  </div>

  {#if data.diffs.length === 0}
    <Card.Root class="rounded-sm">
      <Card.Content class="py-12 text-center text-sm text-muted-foreground">
        Aucune divergence : tout ce que les talents ont confirmé concorde avec
        Salesforce.
      </Card.Content>
    </Card.Root>
  {:else}
    {#each data.diffs as t (t.talentId)}
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
                <th class="px-5 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {#each t.diffs as d (d.field)}
                <tr class="border-b last:border-0">
                  <td class="px-5 py-2.5 align-middle">
                    <span class="font-medium">{FIELD_LABELS[d.field]}</span>
                    {#if d.kind === 'missing'}
                      <span
                        class="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                        title="Salesforce n'a pas cette donnée — à transmettre"
                      >
                        absente de SF
                      </span>
                    {/if}
                  </td>
                  <td class="px-5 py-2.5 align-middle text-epi-blue">
                    {displayValue(d.field, d.jump)}
                  </td>
                  <td class="px-5 py-2.5 align-middle text-muted-foreground">
                    {displayValue(d.field, d.sf)}
                  </td>
                  <!-- Jump wins by default (optimistic) — there is no "keep Jump"
                       action: the value already stands, and the row must remain in
                       the CSV until Salesforce is actually updated. The only manual
                       move is siding with Salesforce, and only for a conflict (a
                       missing field has nothing to adopt). It writes this one
                       column, never the rest of the talent. -->
                  <td class="px-5 py-2.5 align-middle">
                    <div class="flex items-center justify-end">
                      {#if d.kind === 'conflict'}
                        <Button
                          variant="ghost"
                          size="sm"
                          class="gap-1.5 text-muted-foreground"
                          title="Salesforce a raison : écraser la valeur du talent"
                          onclick={() => askAdopt(t, d.field, d.jump, d.sf)}
                        >
                          <CloudDownload class="h-3.5 w-3.5" /> Adopter Salesforce
                        </Button>
                      {:else}
                        <span class="text-xs text-muted-foreground">
                          via export CSV
                        </span>
                      {/if}
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

<AlertDialog.Root bind:open={adoptOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title class="font-heading text-xl tracking-tight uppercase">
        Adopter la valeur Salesforce
      </AlertDialog.Title>
      <AlertDialog.Description>
        La valeur <strong>{adoptTarget?.fieldLabel}</strong> confirmée par
        <strong>{adoptTarget?.talentName}</strong> (« {adoptTarget?.jump} ») sera
        remplacée par celle de Salesforce (« {adoptTarget?.sf} »). Action immédiate
        sur des données réelles, sans annulation directe.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={adopting}>Annuler</AlertDialog.Cancel>
      <form
        method="POST"
        action="?/adoptSf"
        use:enhance={() => {
          adopting = true;
          return async ({ result, update }) => {
            adopting = false;
            if (result.type === 'success') {
              adoptOpen = false;
              toast.success('Valeur Salesforce adoptée');
              await update();
            } else {
              toast.error('Échec de l’opération.');
            }
          };
        }}
      >
        <input
          type="hidden"
          name="talentId"
          value={adoptTarget?.talentId ?? ''}
        />
        <input type="hidden" name="field" value={adoptTarget?.field ?? ''} />
        <AlertDialog.Action
          type="submit"
          disabled={adopting}
          class={buttonVariants({ variant: 'default' })}
        >
          {#if adopting}
            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" /> Adoption…
          {:else}
            Adopter Salesforce
          {/if}
        </AlertDialog.Action>
      </form>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
