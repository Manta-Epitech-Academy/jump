<script lang="ts">
  import { enhance } from '$app/forms';
  import {
    ArrowLeft,
    Bug,
    Lightbulb,
    Lock,
    LockOpen,
    Send,
  } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { Textarea } from '$lib/components/ui/textarea';
  import { resolve } from '$app/paths';
  import { TICKET_CATEGORY_LABELS } from '$lib/domain/tickets';
  import TicketThread from '$lib/components/tickets/TicketThread.svelte';
  import { toast } from 'svelte-sonner';

  let { data } = $props();

  let body = $state('');
  let isClosed = $derived(data.ticket.status === 'closed');
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

        <form
          method="POST"
          action={isClosed ? '?/reopen' : '?/close'}
          use:enhance={() =>
            ({ result, update }) => {
              if (result.type === 'success') {
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
                body = '';
                toast.success('Réponse envoyée');
                update();
              } else if (result.type === 'failure') {
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
