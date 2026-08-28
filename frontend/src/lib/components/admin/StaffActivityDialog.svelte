<!--
  One member's recent activity, from the members directory.

  Square dialog per the dev-space language, and the two lists are bounded and
  scrollable rather than left to grow: the row count is decided by the data, not
  by the code, so the box is already wrong the day it ships if it is not capped.
  Viewport-relative so it grows with the screen instead of leaving a letterbox on
  a laptop. Precedent: `TalentXpDetailDialog`.

  The window is stated in the copy on purpose. The raw rows are purged, so the
  honest thing is to say what the list can and cannot cover; the two dates above
  it come from the projections and go back further, which is what makes "jamais
  ouvert depuis l'invitation" answerable at all.
-->
<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { lastActiveLabel } from '$lib/components/staff/lastActive';
  import { formatDateFr } from '$lib/utils';
  import Loader from '@lucide/svelte/icons/loader';
  import Eye from '@lucide/svelte/icons/eye';

  type Use = { libelle: string; at: string; impersonated: boolean };

  type Props = {
    open: boolean;
    /** Null while no row is selected; the dialog fetches when it becomes set. */
    profileId: string | null;
    name: string;
    firstLoginAt: Date | string | null;
    lastActiveAt: Date | string | null;
  };

  let {
    open = $bindable(),
    profileId,
    name,
    firstLoginAt,
    lastActiveAt,
  }: Props = $props();

  let loading = $state(false);
  let failed = $state(false);
  let windowMonths = $state(0);
  let uses = $state<Use[]>([]);
  let sessions = $state<string[]>([]);

  // Fetched when the dialog opens rather than with the roster: 138 members each
  // holding hundreds of rows inside the window would be a payload nobody reads.
  $effect(() => {
    if (!open || !profileId) return;
    const id = profileId;
    loading = true;
    failed = false;
    fetch(`/staff/admin/users/${id}/usage`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((body) => {
        if (profileId !== id) return; // a newer row was opened meanwhile
        windowMonths = body.windowMonths ?? 0;
        uses = body.uses ?? [];
        sessions = body.sessions ?? [];
      })
      .catch(() => {
        failed = true;
      })
      .finally(() => {
        loading = false;
      });
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="flex max-h-[90svh] flex-col overflow-y-auto sm:max-w-lg"
  >
    <Dialog.Header>
      <Dialog.Title>Activité de {name}</Dialog.Title>
      <Dialog.Description>
        Première connexion {firstLoginAt
          ? `le ${formatDateFr(firstLoginAt)}`
          : ': jamais'}, dernière activité {lastActiveLabel(
          lastActiveAt,
        ).toLowerCase()}.
      </Dialog.Description>
    </Dialog.Header>

    {#if loading}
      <p
        class="flex items-center gap-2 py-6 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <Loader class="h-4 w-4 animate-spin" />
        Chargement…
      </p>
    {:else if failed}
      <p class="py-6 text-sm text-muted-foreground">
        Chargement impossible. Réessayez dans un instant.
      </p>
    {:else}
      <div class="space-y-5">
        <section>
          <h3 class="mb-2 epi-overline text-muted-foreground">
            Fonctionnalités utilisées
          </h3>
          {#if uses.length === 0}
            <p class="text-sm text-muted-foreground">
              Aucune utilisation enregistrée sur les {windowMonths} derniers mois.
            </p>
          {:else}
            <ul
              class="max-h-[40svh] space-y-1.5 overflow-y-auto rounded-lg border border-border p-3"
            >
              {#each uses as use, i (`${use.at}-${i}`)}
                <li
                  class="flex items-baseline justify-between gap-3 text-sm text-foreground-secondary"
                >
                  <span class="min-w-0 flex-1">
                    {use.libelle}
                    {#if use.impersonated}
                      <span
                        class="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground"
                      >
                        <Eye class="h-3 w-3" />
                        en exploration
                      </span>
                    {/if}
                  </span>
                  <span class="shrink-0 epi-overline text-muted-foreground">
                    {formatDateFr(use.at)}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>

        <section>
          <h3 class="mb-2 epi-overline text-muted-foreground">Connexions</h3>
          {#if sessions.length === 0}
            <p class="text-sm text-muted-foreground">
              Aucune session en cours. Les sessions closes ne sont pas
              conservées, donc cette liste ne remonte pas dans le temps ; les
              deux dates ci-dessus, elles, sont durables.
            </p>
          {:else}
            <ul
              class="max-h-[25svh] space-y-1.5 overflow-y-auto rounded-lg border border-border p-3"
            >
              {#each sessions as at (at)}
                <li class="text-sm text-foreground-secondary">
                  {formatDateFr(at)}
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
