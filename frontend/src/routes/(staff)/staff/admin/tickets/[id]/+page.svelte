<script lang="ts">
  import { enhance } from '$app/forms';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Bug from '@lucide/svelte/icons/bug';
  import Lightbulb from '@lucide/svelte/icons/lightbulb';
  import Lock from '@lucide/svelte/icons/lock';
  import LockOpen from '@lucide/svelte/icons/lock-open';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Send from '@lucide/svelte/icons/send';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { Textarea } from '$lib/components/ui/textarea';
  import { resolve } from '$app/paths';
  import { TICKET_CATEGORY_LABELS } from '$lib/domain/tickets';
  import TicketThread from '$lib/components/tickets/TicketThread.svelte';
  import { toast } from 'svelte-sonner';
  import { track, errReason, secondsBetween } from '$lib/analytics';

  function hoursSince(iso: string): number {
    return Math.max(0, Math.floor((secondsBetween(iso) ?? 0) / 3600));
  }
  function daysSince(iso: string): number {
    return Math.max(0, Math.floor((secondsBetween(iso) ?? 0) / 86400));
  }
  function minutesSince(iso: string): number {
    return Math.max(0, Math.floor((secondsBetween(iso) ?? 0) / 60));
  }

  let { data } = $props();

  let body = $state('');
  let isClosed = $derived(data.ticket.status === 'closed');
  let teamsHref = $derived(
    `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(data.ticket.author.email)}`,
  );
</script>

<div class="mx-auto max-w-3xl space-y-6">
  <a
    href={resolve('/staff/admin/tickets')}
    class="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"
  >
    <ArrowLeft class="h-4 w-4" />
    Retour aux tickets
  </a>

  <Card.Root>
    <Card.Header>
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            {#if data.ticket.category === 'bug'}
              <Badge variant="destructive" class="gap-1">
                <Bug class="h-3 w-3" />
                {TICKET_CATEGORY_LABELS.bug}
              </Badge>
            {:else}
              <Badge variant="secondary" class="gap-1">
                <Lightbulb class="h-3 w-3" />
                {TICKET_CATEGORY_LABELS.suggestion}
              </Badge>
            {/if}
            {#if isClosed}
              <Badge variant="outline" class="gap-1">
                <Lock class="h-3 w-3" />
                Fermé
              </Badge>
            {/if}
          </div>
          <Card.Title class="text-xl">{data.ticket.title}</Card.Title>
          <p class="text-xs text-muted-foreground">
            Ouvert par <span class="font-bold"
              >{data.ticket.author.name ?? data.ticket.author.email}</span
            >
          </p>
        </div>

        <div class="flex items-center gap-2">
          <Button
            href={teamsHref}
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            size="sm"
            class="gap-2"
          >
            <MessageCircle class="h-4 w-4" />
            Contacter Teams
          </Button>

          <form
            method="POST"
            action={isClosed ? '?/reopen' : '?/close'}
            use:enhance={() =>
              ({ result, update }) => {
                if (result.type === 'success') {
                  track('ticket_status_changed', {
                    side: 'admin',
                    fromStatus: data.ticket.status,
                    toStatus: isClosed ? 'open' : 'closed',
                    category: data.ticket.category,
                    ticketAgeDays: daysSince(data.ticket.createdAt),
                  });
                  toast.success(isClosed ? 'Ticket réouvert' : 'Ticket fermé');
                  update();
                }
              }}
          >
            <Button type="submit" variant="outline" size="sm" class="gap-2">
              {#if isClosed}
                <LockOpen class="h-4 w-4" />
                Rouvrir
              {:else}
                <Lock class="h-4 w-4" />
                Fermer
              {/if}
            </Button>
          </form>
        </div>
      </div>
    </Card.Header>
    <Card.Content>
      <TicketThread messages={data.ticket.messages} viewSide="admin" />
    </Card.Content>
  </Card.Root>

  {#if !isClosed}
    <Card.Root>
      <Card.Content class="pt-6">
        <form
          method="POST"
          action="?/reply"
          use:enhance={() =>
            ({ result, update }) => {
              if (result.type === 'success') {
                const lastAuthorMsg = [...data.ticket.messages]
                  .reverse()
                  .find((m) => m.side === 'author');
                track('ticket_replied', {
                  side: 'admin',
                  category: data.ticket.category,
                  ticketAgeHours: hoursSince(data.ticket.createdAt),
                  responseTimeMin: lastAuthorMsg
                    ? minutesSince(lastAuthorMsg.createdAt)
                    : null,
                });
                body = '';
                toast.success('Réponse envoyée');
                update();
              } else if (result.type === 'failure') {
                track('ticket_reply_failed', {
                  side: 'admin',
                  reason: errReason((result as any).data),
                });
                toast.error("Échec de l'envoi");
              }
            }}
          class="space-y-3"
        >
          <Textarea
            name="body"
            bind:value={body}
            placeholder="Écrire une réponse..."
            rows={4}
            required
          />
          <div class="flex justify-end">
            <Button type="submit" disabled={body.trim().length === 0}>
              <Send class="mr-2 h-4 w-4" />
              Envoyer
            </Button>
          </div>
        </form>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
