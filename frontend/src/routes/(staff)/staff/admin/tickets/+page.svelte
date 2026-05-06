<script lang="ts">
  import { LifeBuoy, Bug, Lightbulb, Inbox } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge';
  import * as Card from '$lib/components/ui/card';
  import * as Table from '$lib/components/ui/table';
  import { Switch } from '$lib/components/ui/switch';
  import { formatDateTimeFr } from '$lib/utils';
  import { resolve } from '$app/paths';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { TICKET_CATEGORY_LABELS } from '$lib/domain/tickets';

  let { data } = $props();

  let openTickets = $derived(data.tickets.filter((t) => t.status === 'open'));
  let closedTickets = $derived(
    data.tickets.filter((t) => t.status === 'closed'),
  );

  let optimistic = $state<boolean | null>(null);
  let toggling = $state(false);
  let ticketsEnabled = $derived(optimistic ?? data.ticketsEnabled);

  async function handleToggle(next: boolean) {
    if (toggling) return;
    toggling = true;
    optimistic = next;
    try {
      const response = await fetch('/api/admin/tickets-enabled', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!response.ok) throw new Error(await response.text());
      await invalidateAll();
      toast.success(next ? 'Tickets activés' : 'Tickets désactivés');
    } catch {
      toast.error('Échec de la mise à jour');
    } finally {
      optimistic = null;
      toggling = false;
    }
  }
</script>

<div class="space-y-6">
  <div>
    <h1 class="font-heading text-3xl tracking-wide uppercase">
      <span class="text-epi-pink">Tickets</span> staff
    </h1>
    <p class="text-sm font-bold text-muted-foreground uppercase">
      Suggestions et bugs remontés par les équipes
    </p>
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title class="flex items-center gap-2 uppercase">
        <LifeBuoy class="h-4 w-4 text-epi-pink" />
        Activation du système
      </Card.Title>
    </Card.Header>
    <Card.Content>
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-sm font-bold">
            {ticketsEnabled ? 'Tickets activés' : 'Tickets désactivés'}
          </p>
          <p class="text-xs text-muted-foreground">
            {#if ticketsEnabled}
              Les dev et pédago peuvent envoyer suggestions et bugs depuis leur
              espace.
            {:else}
              Les dev et pédago ne peuvent plus créer de nouveau ticket. Les
              tickets existants restent visibles ici.
            {/if}
          </p>
        </div>
        <Switch
          checked={ticketsEnabled}
          disabled={toggling}
          onCheckedChange={handleToggle}
        />
      </div>
    </Card.Content>
  </Card.Root>

  <Card.Root>
    <Card.Header>
      <Card.Title class="flex items-center gap-2 uppercase">
        <Inbox class="h-4 w-4 text-epi-pink" />
        Ouverts ({openTickets.length})
      </Card.Title>
    </Card.Header>
    <Card.Content class="p-0">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Type</Table.Head>
            <Table.Head>Titre</Table.Head>
            <Table.Head>Auteur</Table.Head>
            <Table.Head class="text-center">Messages</Table.Head>
            <Table.Head>Dernier message</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each openTickets as ticket}
            <Table.Row
              class="cursor-pointer hover:bg-muted/40"
              onclick={() =>
                (window.location.href = resolve(
                  `/staff/admin/tickets/${ticket.id}`,
                ))}
            >
              <Table.Cell>
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
              </Table.Cell>
              <Table.Cell class="font-bold">
                <div class="flex items-center gap-2">
                  {#if ticket.unread}
                    <span class="h-2 w-2 rounded-full bg-epi-pink"></span>
                  {/if}
                  {ticket.title}
                </div>
              </Table.Cell>
              <Table.Cell>
                <div class="flex flex-col">
                  <span class="text-sm">{ticket.author.name ?? '—'}</span>
                  <span class="text-xs text-muted-foreground"
                    >{ticket.author.email}</span
                  >
                </div>
              </Table.Cell>
              <Table.Cell class="text-center">{ticket.messageCount}</Table.Cell>
              <Table.Cell class="text-sm text-muted-foreground">
                {formatDateTimeFr(ticket.lastMessageAt)}
              </Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell colspan={5} class="text-center text-muted-foreground">
                Aucun ticket ouvert.
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </Card.Content>
  </Card.Root>

  {#if closedTickets.length > 0}
    <Card.Root>
      <Card.Header>
        <Card.Title class="flex items-center gap-2 uppercase">
          <LifeBuoy class="h-4 w-4 text-muted-foreground" />
          Clos ({closedTickets.length})
        </Card.Title>
      </Card.Header>
      <Card.Content class="p-0">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Type</Table.Head>
              <Table.Head>Titre</Table.Head>
              <Table.Head>Auteur</Table.Head>
              <Table.Head class="text-center">Messages</Table.Head>
              <Table.Head>Dernier message</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each closedTickets as ticket}
              <Table.Row
                class="cursor-pointer hover:bg-muted/40"
                onclick={() =>
                  (window.location.href = resolve(
                    `/staff/admin/tickets/${ticket.id}`,
                  ))}
              >
                <Table.Cell>
                  <Badge variant="outline">
                    {TICKET_CATEGORY_LABELS[
                      ticket.category as keyof typeof TICKET_CATEGORY_LABELS
                    ] ?? ticket.category}
                  </Badge>
                </Table.Cell>
                <Table.Cell class="font-bold text-muted-foreground">
                  {ticket.title}
                </Table.Cell>
                <Table.Cell class="text-sm text-muted-foreground"
                  >{ticket.author.email}</Table.Cell
                >
                <Table.Cell class="text-center text-muted-foreground"
                  >{ticket.messageCount}</Table.Cell
                >
                <Table.Cell class="text-sm text-muted-foreground">
                  {formatDateTimeFr(ticket.lastMessageAt)}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
