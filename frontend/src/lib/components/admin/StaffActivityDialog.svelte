<!--
  One member's coverage of the platform, from the members directory.

  Square dialog per the dev-space language, and both lists are bounded and
  scrollable rather than left to grow: the row count is decided by the data, not
  by the code, so the box is already wrong the day it ships if it is not capped.
  Viewport-relative so it grows with the screen instead of leaving a letterbox on
  a laptop. Precedent: `TalentXpDetailDialog`.

  This used to be two reverse-chronological logs, the forty most recent gestures
  and the twenty most recent connections, to the second. It answered no decision:
  whether the account still serves is the two dates in the header, and "what does
  this person not know how to do" cannot be read off the forty most recent rows,
  where an absence means nothing. So the rows are folded per feature, and what
  the member has never opened is listed beside them, which is the half that turns
  a report into a training decision.

  The two dates in the header come from the projections on `StaffProfile` and
  reach back further than any retention, which is what makes "invité, jamais
  ouvert" answerable at all. The window below them cannot, and saying so is what
  stops an empty coverage from reading as an absent member.
-->
<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { InfoTooltip } from '$lib/components/ui/info-tooltip';
  import { lastActiveLabel } from '$lib/components/staff/lastActive';
  import { countNounForm } from '$lib/components/staff/datatable/countLabel';
  import { formatDateFr, formatDateTimeFr } from '$lib/utils';
  import Loader from '@lucide/svelte/icons/loader';
  import Eye from '@lucide/svelte/icons/eye';

  type FeatureUse = {
    libelle: string;
    espace: string;
    utilisations: number;
    dernierUsage: string;
    enExploration: number;
  };
  type NeverOpened = { libelle: string; espace: string };

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

  /**
   * The four answers this dialog can render, as one value rather than a pair of
   * booleans.
   *
   * `missing` is the reason: the route answers 404 for a profile that no longer
   * exists, and with only `loading` and `failed` to carry it a deleted member
   * rendered the outage sentence, telling somebody to retry a fetch that can
   * never succeed. Two booleans also spell four states of which only three are
   * meant to exist; a union spells the states themselves, so the next one
   * cannot be added without a branch to render it.
   */
  type Status = 'loading' | 'missing' | 'failed' | 'ready';

  let status = $state<Status>('loading');
  let windowMonths = $state(0);
  let activeDays = $state(0);
  let features = $state<FeatureUse[]>([]);
  let jamaisOuvertes = $state<NeverOpened[]>([]);

  // Fetched when the dialog opens rather than with the roster: 138 members each
  // holding hundreds of rows inside the window would be a payload nobody reads.
  $effect(() => {
    if (!open || !profileId) return;
    const id = profileId;
    status = 'loading';
    fetch(`/staff/admin/users/${id}/usage`)
      .then((res) => {
        // A stale link and an outage are different answers to the admin, so
        // they are different answers here: null is « ce membre n'existe plus »,
        // a rejection is « la requête a échoué ».
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((body) => {
        if (profileId !== id) return; // a newer row was opened meanwhile
        if (!body) {
          status = 'missing';
          return;
        }
        windowMonths = body.windowMonths ?? 0;
        activeDays = body.activeDays ?? 0;
        features = body.features ?? [];
        jamaisOuvertes = body.jamaisOuvertes ?? [];
        status = 'ready';
      })
      .catch(() => {
        if (profileId !== id) return;
        status = 'failed';
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

    {#if status === 'loading'}
      <p
        class="flex items-center gap-2 py-6 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <Loader class="h-4 w-4 animate-spin" />
        Chargement…
      </p>
    {:else if status === 'missing'}
      <p class="py-6 text-sm text-muted-foreground">
        Ce membre n'existe plus. Rafraîchissez la page pour remettre la liste à
        jour.
      </p>
    {:else if status === 'failed'}
      <p class="py-6 text-sm text-muted-foreground">
        Chargement impossible. Réessayez dans un instant.
      </p>
    {:else}
      <div class="space-y-5">
        <!--
          One figure, and no tooltip under it. There were two, a connexions
          count beside this one, and the tooltip existed to explain why the
          first was ten times too small. A sentence that excuses a number is
          the tell that the number is wrong: the count now reads the days
          somebody came, which is the question being asked.
        -->
        <p class="text-sm text-foreground-secondary">
          <span class="font-bold text-foreground">{activeDays}</span>
          {countNounForm(activeDays, "jour d'activité", "jours d'activité")}
          sur les {windowMonths} derniers mois.
        </p>

        <section>
          <h3 class="mb-2 epi-overline text-muted-foreground">
            Fonctionnalités utilisées
          </h3>
          {#if features.length === 0}
            <p class="text-sm text-muted-foreground">
              Aucune utilisation enregistrée sur les {windowMonths} derniers mois.
              Les deux dates ci-dessus remontent plus loin : elles ne dépendent pas
              de cette fenêtre.
            </p>
          {:else}
            <ul
              class="max-h-[35svh] space-y-2 overflow-y-auto rounded-lg border border-border p-3"
            >
              {#each features as feature (feature.libelle)}
                <li
                  class="flex items-baseline justify-between gap-3 text-sm text-foreground-secondary"
                >
                  <span class="min-w-0 flex-1">
                    {feature.libelle}
                    <span class="text-xs text-muted-foreground"
                      >· {feature.espace}</span
                    >
                    {#if feature.enExploration > 0}
                      <span
                        class="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground"
                      >
                        <Eye class="h-3 w-3" />
                        dont {feature.enExploration} en exploration
                      </span>
                    {/if}
                  </span>
                  <span class="shrink-0 text-right">
                    <span class="font-bold text-foreground"
                      >{feature.utilisations}</span
                    >
                    <span class="ml-2 text-xs text-muted-foreground">
                      {formatDateTimeFr(feature.dernierUsage)}
                    </span>
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </section>

        {#if jamaisOuvertes.length > 0}
          <section>
            <h3 class="mb-2 epi-overline text-muted-foreground">
              Jamais ouvertes
              <InfoTooltip
                text="Les fonctionnalités des espaces où ce membre travaille et qu'il n'a pas ouvertes une seule fois sur la fenêtre."
              />
            </h3>
            <ul
              class="max-h-[25svh] space-y-1.5 overflow-y-auto rounded-lg border border-border p-3"
            >
              {#each jamaisOuvertes as feature (feature.libelle)}
                <li
                  class="flex items-baseline justify-between gap-3 text-sm text-foreground-secondary"
                >
                  <span class="min-w-0 flex-1">{feature.libelle}</span>
                  <span class="shrink-0 text-xs text-muted-foreground">
                    {feature.espace}
                  </span>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
