<!--
  One member's recent activity, from the members directory.

  Square dialog per the dev-space language, and the two lists are bounded and
  scrollable rather than left to grow: the row count is decided by the data, not
  by the code, so the box is already wrong the day it ships if it is not capped.
  Viewport-relative so it grows with the screen instead of leaving a letterbox on
  a laptop. Precedent: `TalentXpDetailDialog`.

  Connections lead, because "does this person come at all" is the question the
  members directory is being read for; what they did once inside answers a
  narrower one. Both lists carry a time, not just a day: two logins on one
  morning rendered as two identical lines, which reads as a display bug rather
  than as data.

  The window is stated once, on the connections figures, and the two dates above
  are stated as durable on purpose. They come from the projections on
  `StaffProfile` and reach back further than any retention, which is what makes
  "invité, jamais ouvert" answerable at all; the lists cannot, and saying so is
  what stops an empty list from reading as an absent member.
-->
<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { lastActiveLabel } from '$lib/components/staff/lastActive';
  import { countNounForm } from '$lib/components/staff/datatable/countLabel';
  import { formatDateFr, formatDateTimeFr } from '$lib/utils';
  import Loader from '@lucide/svelte/icons/loader';
  import Eye from '@lucide/svelte/icons/eye';

  type Use = { libelle: string; at: string; impersonated: boolean };
  type Session = { espace: string; at: string; impersonated: boolean };

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
  let activeDays = $state(0);
  let loginCount = $state(0);
  let uses = $state<Use[]>([]);
  let sessions = $state<Session[]>([]);

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
        activeDays = body.activeDays ?? 0;
        loginCount = body.loginCount ?? 0;
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
          <h3 class="mb-2 epi-overline text-muted-foreground">Connexions</h3>
          {#if sessions.length === 0}
            <p class="text-sm text-muted-foreground">
              Aucune connexion enregistrée sur les {windowMonths} derniers mois. Les
              deux dates ci-dessus remontent plus loin : elles ne dépendent pas de
              cette fenêtre.
            </p>
          {:else}
            <p class="mb-2 text-sm text-foreground-secondary">
              <span class="font-bold text-foreground">{loginCount}</span>
              {countNounForm(loginCount, 'connexion')} et
              <span class="font-bold text-foreground">{activeDays}</span>
              {countNounForm(activeDays, "jour d'activité", "jours d'activité")}
              sur les {windowMonths} derniers mois.
            </p>
            <ul
              class="max-h-[25svh] space-y-1.5 overflow-y-auto rounded-lg border border-border p-3"
            >
              {#each sessions as session, i (`${session.at}-${i}`)}
                <li
                  class="flex items-baseline justify-between gap-3 text-sm text-foreground-secondary"
                >
                  <span class="min-w-0 flex-1">
                    {session.espace}
                    {#if session.impersonated}
                      <span
                        class="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground"
                      >
                        <Eye class="h-3 w-3" />
                        en exploration
                      </span>
                    {/if}
                  </span>
                  <span class="shrink-0 text-xs text-muted-foreground">
                    {formatDateTimeFr(session.at)}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>

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
                  <span class="shrink-0 text-xs text-muted-foreground">
                    {formatDateTimeFr(use.at)}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
