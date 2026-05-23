<script lang="ts">
  import { enhance } from '$app/forms';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Bug from '@lucide/svelte/icons/bug';
  import Lightbulb from '@lucide/svelte/icons/lightbulb';
  import Lock from '@lucide/svelte/icons/lock';
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
  function minutesSince(iso: string): number {
    return Math.max(0, Math.floor((secondsBetween(iso) ?? 0) / 60));
  }

  type Message = {
    id: string;
    body: string;
    createdAt: string;
    side: 'admin' | 'author';
    author: { name: string | null; email: string };
  };

  let {
    ticket,
    basePath,
  }: {
    ticket: {
      id: string;
      title: string;
      category: string;
      status: string;
      createdAt: string;
      messages: Message[];
    };
    basePath: '/staff/dev' | '/staff/pedago';
  } = $props();

  let body = $state('');
  let isClosed = $derived(ticket.status === 'closed');
</script>

<div class="mx-auto max-w-3xl space-y-6">
  <a
    href={resolve(`${basePath}/tickets` as any)}
    class="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"
  >
    <ArrowLeft class="h-4 w-4" />
    Retour à mes tickets
  </a>

  <Card.Root>
    <Card.Header>
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          {#if ticket.category === 'bug'}
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
              Fermé par l'admin
            </Badge>
          {/if}
        </div>
        <Card.Title class="text-xl">{ticket.title}</Card.Title>
      </div>
    </Card.Header>
    <Card.Content>
      <TicketThread messages={ticket.messages} viewSide="author" />
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
                const lastAdminMsg = [...ticket.messages]
                  .reverse()
                  .find((m) => m.side === 'admin');
                track('ticket_replied', {
                  side: 'author',
                  category: ticket.category,
                  ticketAgeHours: hoursSince(ticket.createdAt),
                  responseTimeMin: lastAdminMsg
                    ? minutesSince(lastAdminMsg.createdAt)
                    : null,
                });
                body = '';
                toast.success('Message envoyé');
                update();
              } else if (result.type === 'failure') {
                track('ticket_reply_failed', {
                  side: 'author',
                  reason: errReason(result),
                });
                toast.error("Échec de l'envoi");
              }
            }}
          class="space-y-3"
        >
          <Textarea
            name="body"
            bind:value={body}
            placeholder="Ajouter un message..."
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
  {:else}
    <p class="text-center text-sm text-muted-foreground">
      Ce ticket est clos. Crée-en un nouveau pour signaler autre chose.
    </p>
  {/if}
</div>
