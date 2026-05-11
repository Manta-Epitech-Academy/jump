<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import CalendarSync from '@lucide/svelte/icons/calendar-sync';
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import LinkIcon from '@lucide/svelte/icons/link';
  import Mail from '@lucide/svelte/icons/mail';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { authClient } from '$lib/auth-client';

  type SyncMode = 'graph' | 'email' | 'off';

  type SyncState = {
    mode: SyncMode;
    status:
      | { kind: 'connected'; lastRefreshedAt: string | Date | null }
      | {
          kind: 'needs_reauth';
          reason: 'no_account' | 'missing_scope' | 'no_refresh_token';
        }
      | { kind: 'email_ready'; recipient: string | null };
    syncedCount: number;
    lastSyncedAt: string | Date | null;
  } | null;

  type Props = {
    sync: SyncState;
    /** Where the OAuth callback should land after re-consent (graph mode). */
    returnTo: string;
    /** Dev / superdev: the "Tout renvoyer" item targets the whole event
     *  (every assigned staff). Otherwise it targets only the actor. */
    canResyncAll: boolean;
  };

  let { sync, returnTo, canResyncAll }: Props = $props();

  let submitting = $state(false);
  let reconnecting = $state(false);
  let forceResyncForm: HTMLFormElement | null = $state(null);

  let needsReauth = $derived(sync?.status.kind === 'needs_reauth');
  let isEmailMode = $derived(sync?.mode === 'email');

  let lastSyncedAt = $derived(
    sync?.lastSyncedAt ? new Date(sync.lastSyncedAt) : null,
  );
  let lastSyncedLabel = $derived(
    lastSyncedAt
      ? new Intl.DateTimeFormat('fr-FR', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }).format(lastSyncedAt)
      : null,
  );

  // Label vocabulary changes per mode: Graph = "synchronisé" (push to
  // Outlook directly); email = "invitation envoyée" (mailbox invite).
  let idleLabel = $derived(
    isEmailMode ? 'Envoyer les invitations' : 'Synchroniser vers Outlook',
  );
  let syncedNoun = $derived(isEmailMode ? 'invitation' : 'synchronisé');
  let busyLabel = $derived(
    isEmailMode ? 'Envoi en cours...' : 'Synchronisation...',
  );
  // Force-resync dropdown is hidden for graph + self: in that combo it does
  // exactly what the main "Synchroniser vers Outlook" button already does
  // (clearEmailSyncCache is a no-op outside email mode). The other three
  // combos each have a distinct purpose, so they stay visible.
  let showForceDropdown = $derived(isEmailMode || canResyncAll);
  let mainButtonClass = $derived(
    showForceDropdown
      ? 'gap-2 rounded-l-sm rounded-r-none border-r-0'
      : 'gap-2 rounded-sm',
  );

  // 3-case matrix (graph+self is unreachable — see showForceDropdown).
  let forceLabel = $derived(
    isEmailMode
      ? canResyncAll
        ? 'Renvoyer toutes les invitations'
        : 'Renvoyer mes invitations'
      : 'Resynchroniser tous les calendriers',
  );
  let forceHint = $derived(
    isEmailMode
      ? canResyncAll
        ? "Force le renvoi d'une invitation à chaque staff de l'événement."
        : 'Force le renvoi de vos invitations Outlook.'
      : "Pousse l'état actuel vers le calendrier Outlook de chaque staff connecté.",
  );

  async function handleReconnect() {
    reconnecting = true;
    try {
      await authClient.signIn.social({
        provider: 'microsoft',
        callbackURL: returnTo,
      });
    } finally {
      reconnecting = false;
    }
  }

  function triggerForceResync() {
    forceResyncForm?.requestSubmit();
  }
</script>

{#if !sync || sync.mode === 'off'}
  <!-- Loader didn't surface state, or feature disabled. -->
{:else if needsReauth}
  <Button
    variant="outline"
    class="gap-2 rounded-sm"
    onclick={handleReconnect}
    disabled={reconnecting}
    aria-label="Connecter Outlook pour synchroniser les entretiens"
  >
    <LinkIcon class="h-4 w-4" />
    {reconnecting ? 'Redirection...' : 'Connecter Outlook'}
  </Button>
{:else}
  <div class="flex items-stretch">
    <form
      action="?/syncCalendar"
      method="POST"
      class="contents"
      use:enhance={() => {
        submitting = true;
        return async ({ result, update }) => {
          submitting = false;
          if (result.type === 'success') {
            const counts = (
              result.data as
                | {
                    sync?: {
                      created: number;
                      updated: number;
                      deleted: number;
                      failed: number;
                    };
                  }
                | undefined
            )?.sync;
            if (counts) {
              const total = counts.created + counts.updated + counts.deleted;
              const verb = isEmailMode ? 'Invitations' : 'Outlook';
              if (total === 0 && counts.failed === 0) {
                toast.success(
                  isEmailMode
                    ? 'Tout est déjà à jour'
                    : 'Calendrier déjà à jour',
                );
              } else {
                const parts: string[] = [];
                if (counts.created)
                  parts.push(
                    isEmailMode
                      ? `${counts.created} invité${counts.created > 1 ? 's' : ''}`
                      : `${counts.created} créé(s)`,
                  );
                if (counts.updated) parts.push(`${counts.updated} mis à jour`);
                if (counts.deleted)
                  parts.push(
                    isEmailMode
                      ? `${counts.deleted} annulé(s)`
                      : `${counts.deleted} retiré(s)`,
                  );
                toast.success(`${verb} : ${parts.join(' · ')}`);
                if (counts.failed > 0) {
                  toast.warning(`${counts.failed} entretien(s) en échec`);
                }
              }
            }
            await update();
          } else if (result.type === 'failure') {
            const data = result.data as
              | { needsReauth?: boolean; message?: string }
              | undefined;
            if (data?.needsReauth) {
              toast.error(data.message ?? 'Reconnexion Microsoft requise');
              await handleReconnect();
            } else {
              toast.error(data?.message ?? 'Synchronisation impossible');
            }
          } else {
            toast.error('Synchronisation impossible');
          }
        };
      }}
    >
      <Button
        type="submit"
        variant="outline"
        class={mainButtonClass}
        disabled={submitting}
      >
        {#if submitting}
          <CalendarSync class="h-4 w-4 animate-spin" />
          {busyLabel}
        {:else if sync.syncedCount > 0}
          <CheckCircle2 class="h-4 w-4 text-epi-teal-solid" />
          {sync.syncedCount}
          {syncedNoun}{sync.syncedCount > 1 ? 's' : ''}
          {#if lastSyncedLabel}
            <span
              class="text-[10px] tracking-widest text-muted-foreground uppercase"
            >
              · {lastSyncedLabel}
            </span>
          {/if}
        {:else if isEmailMode}
          <Mail class="h-4 w-4" />
          {idleLabel}
        {:else}
          <CalendarSync class="h-4 w-4" />
          {idleLabel}
        {/if}
      </Button>
    </form>

    {#if showForceDropdown}
      <!-- Hidden form posts to the force-resync action; the dropdown item
           calls .requestSubmit() so we still get use:enhance on the response. -->
      <form
        bind:this={forceResyncForm}
        action="?/forceResync"
        method="POST"
        class="hidden"
        use:enhance={() => {
          submitting = true;
          return async ({ result, update }) => {
            submitting = false;
            if (result.type === 'success') {
              const data = result.data as
                | {
                    forceResync?:
                      | { scope: 'event'; dispatched: number }
                      | {
                          scope: 'self';
                          sync: {
                            created: number;
                            updated: number;
                            deleted: number;
                            failed: number;
                          };
                        };
                  }
                | undefined;
              const fr = data?.forceResync;
              if (fr?.scope === 'event') {
                toast.success(
                  isEmailMode
                    ? `Renvoi des invitations déclenché pour ${fr.dispatched} staff.`
                    : `Resynchronisation Outlook déclenchée pour ${fr.dispatched} staff.`,
                );
              } else if (fr?.scope === 'self') {
                const parts: string[] = [];
                if (fr.sync.created) parts.push(`${fr.sync.created} envoyé(s)`);
                if (fr.sync.updated)
                  parts.push(`${fr.sync.updated} renvoyé(s)`);
                if (fr.sync.deleted) parts.push(`${fr.sync.deleted} annulé(s)`);
                toast.success(
                  parts.length
                    ? `Invitations : ${parts.join(' · ')}`
                    : 'Tout est déjà à jour',
                );
                if (fr.sync.failed > 0) {
                  toast.warning(`${fr.sync.failed} entretien(s) en échec`);
                }
              }
              await update();
            } else if (result.type === 'failure') {
              const data = result.data as { message?: string } | undefined;
              toast.error(data?.message ?? 'Renvoi impossible');
            } else {
              toast.error('Renvoi impossible');
            }
          };
        }}
      ></form>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              type="button"
              variant="outline"
              class="cursor-pointer rounded-l-none rounded-r-sm px-2"
              disabled={submitting}
              aria-label="Plus d’actions de synchronisation"
            >
              <ChevronDown class="h-4 w-4" />
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="w-72 rounded-sm">
          <DropdownMenu.Item
            onclick={triggerForceResync}
            disabled={submitting}
            class="cursor-pointer items-start gap-2"
          >
            <RotateCcw class="mt-0.5 h-4 w-4 shrink-0" />
            <div class="flex flex-col">
              <span>{forceLabel}</span>
              <span class="text-[11px] text-muted-foreground">{forceHint}</span>
            </div>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}
  </div>
{/if}
