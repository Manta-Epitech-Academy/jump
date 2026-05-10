<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import CalendarSync from '@lucide/svelte/icons/calendar-sync';
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
  import LinkIcon from '@lucide/svelte/icons/link';
  import Mail from '@lucide/svelte/icons/mail';
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
  };

  let { sync, returnTo }: Props = $props();

  let submitting = $state(false);
  let reconnecting = $state(false);

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
                isEmailMode ? 'Tout est déjà à jour' : 'Calendrier déjà à jour',
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
      class="gap-2 rounded-sm"
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
{/if}
