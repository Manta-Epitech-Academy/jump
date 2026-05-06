<script lang="ts">
  import { Bug, Lightbulb, Lock, Inbox, Plus } from '@lucide/svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import * as Table from '$lib/components/ui/table';
  import { formatDateTimeFr } from '$lib/utils';
  import { resolve } from '$app/paths';
  import { TICKET_CATEGORY_LABELS } from '$lib/domain/tickets';
  import NewTicketDialog from '$lib/components/tickets/NewTicketDialog.svelte';

  type Ticket = {
    id: string;
    title: string;
    category: string;
    status: string;
    lastMessageAt: string;
    messageCount: number;
    unread: boolean;
  };

  let {
    tickets,
    basePath,
  }: {
    tickets: Ticket[];
    basePath: '/staff/dev' | '/staff/pedago';
  } = $props();

  let openTickets = $derived(tickets.filter((t) => t.status === 'open'));
  let closedTickets = $derived(tickets.filter((t) => t.status === 'closed'));
  let dialogOpen = $state(false);
</script>

<div class="space-y-6">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        Mes <span class="text-epi-pink">Tickets</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        Suggestions et bugs envoyés à l'équipe admin
      </p>
    </div>
    <Button onclick={() => (dialogOpen = true)} class="gap-2">
      <Plus class="h-4 w-4" />
      Nouveau feedback
    </Button>
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title class="flex items-center gap-2 uppercase">
        <Inbox class="h-4 w-4 text-epi-pink" />
        En cours ({openTickets.length})
      </Card.Title>
    </Card.Header>
    <Card.Content class="p-0">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Type</Table.Head>
            <Table.Head>Titre</Table.Head>
            <Table.Head class="text-center">Messages</Table.Head>
            <Table.Head>Dernière activité</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each openTickets as ticket}
            <Table.Row
              class="cursor-pointer hover:bg-muted/40"
              onclick={() =>
                (window.location.href = resolve(
                  `${basePath}/tickets/${ticket.id}` as any,
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
              <Table.Cell class="text-center">{ticket.messageCount}</Table.Cell>
              <Table.Cell class="text-sm text-muted-foreground">
                {formatDateTimeFr(ticket.lastMessageAt)}
              </Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell colspan={4} class="text-center text-muted-foreground">
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
          <Lock class="h-4 w-4 text-muted-foreground" />
          Clos ({closedTickets.length})
        </Card.Title>
      </Card.Header>
      <Card.Content class="p-0">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Type</Table.Head>
              <Table.Head>Titre</Table.Head>
              <Table.Head class="text-center">Messages</Table.Head>
              <Table.Head>Dernière activité</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each closedTickets as ticket}
              <Table.Row
                class="cursor-pointer hover:bg-muted/40"
                onclick={() =>
                  (window.location.href = resolve(
                    `${basePath}/tickets/${ticket.id}` as any,
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

<NewTicketDialog bind:open={dialogOpen} {basePath} />
