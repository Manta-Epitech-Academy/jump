<script lang="ts">
  import Phone from '@lucide/svelte/icons/phone';
  import Mail from '@lucide/svelte/icons/mail';
  import Users from '@lucide/svelte/icons/users';
  import * as Dialog from '$lib/components/ui/dialog';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import { civiliteCourtesyTitle } from '$lib/domain/profile';
  import { formatPhoneForDisplay } from '$lib/domain/phone';
  import type { PresenceRow } from './types';

  let {
    open = $bindable(),
    row,
  }: {
    open: boolean;
    row: PresenceRow | null;
  } = $props();
</script>

<!-- Courtesy title subordinated to the name, same as the profile "Coordonnées"
     section: "Madame" reads as an honorific and the name stands on its own. -->
{#snippet identityLine(civilite: string | null, name: string | null)}
  {@const title = civiliteCourtesyTitle(civilite)}
  {#if name}
    <p class="text-sm font-semibold">
      {#if title}<span class="font-normal text-muted-foreground">{title}</span
        >{' '}{/if}{name}
    </p>
  {/if}
{/snippet}

<!-- Tap-to-call / mail-to line + a copy button, mirroring the profile card. -->
{#snippet phoneRow(value: string, copyLabel: string)}
  {@const display = formatPhoneForDisplay(value) ?? value}
  <div class="flex items-center gap-1">
    <a
      href={`tel:${value.replace(/\s+/g, '')}`}
      class="group flex flex-1 items-center gap-2 text-sm transition-colors hover:text-epi-blue"
    >
      <Phone class="h-4 w-4 shrink-0 text-muted-foreground" />
      <span class="tabular-nums">{display}</span>
    </a>
    <CopyButton value={display} label={copyLabel} />
  </div>
{/snippet}

{#snippet emailRow(value: string, copyLabel: string)}
  <div class="flex items-center gap-1">
    <a
      href={`mailto:${value}`}
      class="group flex flex-1 items-center gap-2 text-sm transition-colors hover:text-epi-blue"
    >
      <Mail class="h-4 w-4 shrink-0 text-muted-foreground" />
      <span class="truncate">{value}</span>
    </a>
    <CopyButton {value} label={copyLabel} />
  </div>
{/snippet}

<Dialog.Root bind:open>
  <Dialog.Content class="rounded-sm sm:max-w-md">
    {#if row}
      <Dialog.Header>
        <Dialog.Title>Coordonnées</Dialog.Title>
        <Dialog.Description>
          Appelez le stagiaire en priorité, puis sa famille s'il ne répond pas.
        </Dialog.Description>
      </Dialog.Header>

      <div class="space-y-5">
        <div class="space-y-2">
          <h4
            class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
          >
            Élève
          </h4>
          {@render identityLine(row.civilite, `${row.prenom} ${row.nom}`)}
          {#if row.phone}
            {@render phoneRow(row.phone, 'Copier le téléphone élève')}
          {:else if row.email}
            {@render emailRow(row.email, "Copier l'email élève")}
          {:else}
            <p class="text-sm text-muted-foreground italic">
              Aucune coordonnée
            </p>
          {/if}
        </div>

        <div class="space-y-3 border-t pt-4">
          <h4
            class="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
          >
            <Users class="h-3 w-3" />
            {row.guardians.length > 1
              ? 'Responsables légaux'
              : 'Responsable légal'}
          </h4>
          {#if row.guardians.length === 0}
            <p class="text-sm text-muted-foreground italic">
              Aucune information renseignée
            </p>
          {:else}
            {#each row.guardians as guardian, i (i)}
              <div class="space-y-1">
                {@render identityLine(guardian.civilite, guardian.name)}
                {#if guardian.phone}
                  {@render phoneRow(
                    guardian.phone,
                    'Copier le téléphone du responsable',
                  )}
                {:else if guardian.email}
                  {@render emailRow(
                    guardian.email,
                    "Copier l'email du responsable",
                  )}
                {:else}
                  <p class="text-sm text-muted-foreground italic">
                    Aucune coordonnée
                  </p>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
