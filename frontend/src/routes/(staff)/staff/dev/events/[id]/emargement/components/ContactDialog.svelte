<script lang="ts">
  import { resolve } from '$app/paths';
  import Phone from '@lucide/svelte/icons/phone';
  import Mail from '@lucide/svelte/icons/mail';
  import Users from '@lucide/svelte/icons/users';
  import * as Dialog from '$lib/components/ui/dialog';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import { civiliteCourtesyTitle } from '$lib/domain/profile';
  import { cohortNounForms } from '$lib/domain/event';
  import { formatPhoneForDisplay } from '$lib/domain/phone';
  import type { PresenceRow } from './types';

  let {
    open = $bindable(),
    row,
    cohortNoun,
    eventId,
  }: {
    open: boolean;
    row: PresenceRow | null;
    cohortNoun: string | null;
    eventId: string;
  } = $props();

  const noun = $derived(cohortNounForms(cohortNoun));

  type Guardian = {
    civilite: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  type ContactDetails = {
    civilite: string | null;
    fullName: string;
    phone: string | null;
    email: string | null;
    guardians: Guardian[];
  };

  let loading = $state(false);
  let loadError = $state(false);
  let details = $state<ContactDetails | null>(null);

  async function loadContactDetails(talentId: string): Promise<void> {
    loading = true;
    loadError = false;
    details = null;
    try {
      const res = await fetch(
        resolve(`/staff/dev/events/${eventId}/emargement/contact/${talentId}`),
      );
      if (!res.ok) throw new Error('request_failed');
      const payload = (await res.json()) as ContactDetails;
      details = payload;
    } catch {
      loadError = true;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (!open || !row) return;
    void loadContactDetails(row.talentId);
  });
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
      <span class="">{display}</span>
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
          Appelez le {noun.singular} en priorité, puis sa famille s'il ne répond pas.
        </Dialog.Description>
      </Dialog.Header>

      <div class="space-y-5">
        {#if loading}
          <p class="text-sm text-muted-foreground italic">Chargement…</p>
        {:else if loadError}
          <p class="text-sm text-destructive">
            Impossible de charger les coordonnées.
          </p>
        {:else if details}
          <div class="space-y-2">
            <h4 class="epi-overline text-muted-foreground">Élève</h4>
            {@render identityLine(details.civilite, details.fullName)}
            {#if details.phone}
              {@render phoneRow(details.phone, 'Copier le téléphone élève')}
            {:else if details.email}
              {@render emailRow(details.email, "Copier l'email élève")}
            {:else}
              <p class="text-sm text-muted-foreground italic">
                Aucune coordonnée
              </p>
            {/if}
          </div>

          <div class="space-y-3 border-t pt-4">
            <h4
              class="flex items-center gap-1.5 epi-overline text-muted-foreground"
            >
              <Users class="h-3 w-3" />
              {details.guardians.length > 1
                ? 'Responsables légaux'
                : 'Responsable légal'}
            </h4>
            {#if details.guardians.length === 0}
              <p class="text-sm text-muted-foreground italic">
                Aucune information renseignée
              </p>
            {:else}
              {#each details.guardians as guardian, i (i)}
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
        {:else}
          <p class="text-sm text-muted-foreground italic">Aucune coordonnée</p>
        {/if}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
