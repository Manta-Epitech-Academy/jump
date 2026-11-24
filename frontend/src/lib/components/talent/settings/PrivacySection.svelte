<!--
  « Confidentialité »: what the talent decides about their data, as the 2027
  mockup groups it. First the usage measurement and the objection to it (RGPD
  art. 21): the switch is the whole point, measurement runs on legitimate
  interest, so it is on until refused, and refusing it has to actually stop
  it. The detail sits in a Collapsible rather than a tooltip because this is
  text a person must be able to read and re-read before deciding. Then the
  account deletion, which is a request the team handles, never a wipe on the
  spot.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { Button } from '#lib/components/ui/button/index.ts';
  import * as AlertDialog from '#lib/components/ui/alert-dialog/index.ts';
  import { Switch } from '#lib/components/ui/switch/index.ts';
  import * as Collapsible from '#lib/components/ui/collapsible/index.ts';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import BarChart3 from '@lucide/svelte/icons/bar-chart-3';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { track, daysBetween } from '#lib/analytics.ts';
  import { formatDateFr } from '#lib/utils.ts';
  // The same constant the purge reads. This sentence is a retention promise
  // made to a minor, so it must never be able to state a delay we do not keep,
  // which is exactly what a literal here did.
  import { USAGE_RAW_RETENTION_MONTHS } from '#lib/domain/usage.ts';
  import SettingsSection from './SettingsSection.svelte';

  type Deletion = {
    status: 'pending' | 'rejected';
    at: Date;
    note: string | null;
  };

  let {
    usageAnalyticsOptedOut,
    deletion,
    student,
    participationsCount,
  }: {
    usageAnalyticsOptedOut: boolean;
    deletion: Deletion | null;
    /** For the deletion request's analytics only. */
    student: { createdAt: Date; lastActiveAt: Date | null } | null;
    participationsCount: number;
  } = $props();

  let deleteDialogOpen = $state(false);
  let requesting = $state(false);
  let cancelling = $state(false);
  let acknowledging = $state(false);

  // Mirrors the server so the switch reads right on load, then follows the
  // optimistic flip below. `usageAnalyticsOptedOut` is the truth; this is
  // just what is on screen between the click and the response.
  let usageOptedOut = $state(false);
  $effect(() => {
    usageOptedOut = usageAnalyticsOptedOut;
  });
  let usageForm: HTMLFormElement | null = $state(null);
</script>

<SettingsSection title="Confidentialité">
  <div class="flex items-center justify-between gap-3">
    <div class="flex min-w-0 items-center gap-3">
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-epi-blue/10"
      >
        <BarChart3 class="h-4 w-4 text-epi-blue" />
      </div>
      <span class="text-sm font-bold text-foreground-secondary">
        Compter les pages que j’utilise
      </span>
    </div>
    <form
      bind:this={usageForm}
      method="POST"
      action="?/setUsageAnalytics"
      use:enhance={() =>
        async ({ update }) => {
          await update({ reset: false });
        }}
    >
      <input
        type="hidden"
        name="optOut"
        value={usageOptedOut ? 'false' : 'true'}
      />
      <Switch
        checked={!usageOptedOut}
        aria-label="Compter les pages que j’utilise"
        onCheckedChange={(next) => {
          usageOptedOut = !next;
          usageForm?.requestSubmit();
        }}
      />
    </form>
  </div>
  <Collapsible.Root class="mt-3">
    <Collapsible.Trigger
      class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-epi-blue transition-colors hover:bg-epi-blue/10"
    >
      Ce que ça enregistre
      <ChevronDown class="h-3.5 w-3.5" />
    </Collapsible.Trigger>
    <Collapsible.Content
      class="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground"
    >
      <p>
        On compte ce que tu ouvres sur Jump (pages, documents, jeux, activités,
        questionnaires) pour savoir ce qui sert. Ton nom n’y figure pas, et ces
        données sont effacées au bout de {USAGE_RAW_RETENTION_MONTHS}
        mois.
      </p>
      <p>
        Tu peux désactiver ce comptage à tout moment : plus rien ne sera alors
        enregistré.
      </p>
    </Collapsible.Content>
  </Collapsible.Root>

  <div class="mt-5 border-t border-border pt-5">
    {#if deletion?.status === 'pending'}
      <div class="rounded-xl border border-warning/30 bg-warning/10 p-5">
        <h2 class="mb-1 text-sm font-bold text-warning">
          Demande de suppression en cours
        </h2>
        <p class="text-xs leading-relaxed text-warning/80">
          Ta demande du {formatDateFr(deletion.at)} a été transmise à l'équipe. Ton
          compte reste actif tant qu'elle n'a pas été traitée. Tu peux l'annuler tant
          que ce n'est pas fait.
        </p>
        <form
          action="?/cancelDeletion"
          method="POST"
          use:enhance={() => {
            cancelling = true;
            return async ({ result, update }) => {
              await update();
              cancelling = false;
              if (result.type === 'success') {
                toast.success('Demande de suppression annulée.');
              }
            };
          }}
        >
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={cancelling}
            class="mt-3 h-9 rounded-xl border-warning/30 bg-transparent text-xs font-bold text-warning hover:bg-warning/10"
          >
            {cancelling ? 'Annulation…' : 'Annuler ma demande'}
          </Button>
        </form>
      </div>
    {:else if deletion?.status === 'rejected'}
      <div class="rounded-xl border border-border bg-background p-5">
        <h2 class="mb-1 text-sm font-bold text-foreground-secondary">
          Demande de suppression refusée
        </h2>
        <p class="text-xs leading-relaxed text-muted-foreground">
          Ta demande du {formatDateFr(deletion.at)} n'a pas été acceptée par l'équipe.
        </p>
        {#if deletion.note}
          <blockquote
            class="mt-2 border-l-2 border-border pl-3 text-xs leading-relaxed text-foreground-secondary"
          >
            {deletion.note}
          </blockquote>
        {/if}
        <p class="mt-2 text-xs leading-relaxed text-muted-foreground">
          Tu peux refaire une demande ou contacter l'équipe pour en savoir plus.
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <form
            action="?/requestDeletion"
            method="POST"
            use:enhance={() => {
              requesting = true;
              return async ({ result, update }) => {
                await update();
                requesting = false;
                if (result.type === 'success') {
                  toast.success('Nouvelle demande transmise à l’équipe.');
                }
              };
            }}
          >
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={requesting}
              class="h-9 rounded-xl text-xs font-bold"
            >
              {requesting ? 'Envoi…' : 'Faire une nouvelle demande'}
            </Button>
          </form>
          <form
            action="?/acknowledgeRejection"
            method="POST"
            use:enhance={() => {
              acknowledging = true;
              return async ({ update }) => {
                await update();
                acknowledging = false;
              };
            }}
          >
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={acknowledging}
              class="h-9 rounded-xl text-xs font-bold text-muted-foreground"
            >
              {acknowledging ? '…' : 'J’ai compris'}
            </Button>
          </form>
        </div>
      </div>
    {:else}
      <Button
        variant="outline"
        size="sm"
        onclick={() => (deleteDialogOpen = true)}
        class="h-9 cursor-pointer rounded-xl border-destructive/30 text-xs font-bold text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        Supprimer mon compte
      </Button>
    {/if}
  </div>
</SettingsSection>

<AlertDialog.Root bind:open={deleteDialogOpen}>
  <AlertDialog.Content
    class="fixed top-[50%] left-[50%] z-50 w-[calc(100%-2rem)] max-w-sm translate-x-[-50%] translate-y-[-50%] rounded-xl border-0 bg-card p-8 shadow-raised duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
  >
    <div class="flex flex-col items-center text-center">
      <div
        class="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10"
      >
        <Trash2 class="h-7 w-7 text-destructive" />
      </div>
      <AlertDialog.Title class="text-foreground">
        Supprimer mon compte
      </AlertDialog.Title>
      <AlertDialog.Description
        class="mt-3 text-sm leading-relaxed text-muted-foreground"
      >
        Ta demande sera transmise à l'équipe. Ton compte
        <strong class="text-foreground-secondary">reste actif</strong>
        jusqu'à son traitement, puis ton profil, tes participations et ta progression
        seront
        <strong class="text-foreground-secondary"
          >définitivement anonymisés</strong
        >. Tu pourras annuler tant que la demande n'a pas été traitée.
      </AlertDialog.Description>
    </div>
    <div class="mt-6 flex flex-col gap-3">
      <form
        action="?/requestDeletion"
        method="POST"
        use:enhance={() => {
          requesting = true;
          track('account_deletion_requested', {
            accountAgeDays: daysBetween(student?.createdAt),
            lastActiveDaysAgo: daysBetween(student?.lastActiveAt),
            participationsCount,
          });
          return async ({ result, update }) => {
            await update();
            requesting = false;
            deleteDialogOpen = false;
            if (result.type === 'success') {
              toast.success('Demande de suppression transmise à l’équipe.');
            }
          };
        }}
      >
        <Button
          type="submit"
          disabled={requesting}
          class="h-12 w-full rounded-xl bg-destructive tracking-normal text-status-foreground normal-case shadow-raised transition-ui hover:bg-destructive/90"
        >
          {#if requesting}
            Envoi en cours…
          {:else}
            Demander la suppression
          {/if}
        </Button>
      </form>
      <AlertDialog.Cancel
        class="h-12 w-full rounded-xl border border-border bg-transparent text-sm font-bold text-foreground-secondary transition-ui hover:bg-background"
      >
        Annuler
      </AlertDialog.Cancel>
    </div>
  </AlertDialog.Content>
</AlertDialog.Root>
