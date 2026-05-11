<script lang="ts">
  import Megaphone from '@lucide/svelte/icons/megaphone';
  import Mail from '@lucide/svelte/icons/mail';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import * as Card from '$lib/components/ui/card';
  import { resolve } from '$app/paths';

  type Item = {
    id: string;
    status: 'pending' | 'sent' | 'failed';
    sentAt: Date | string | null;
    openedAt: Date | string | null;
    talentId: string | null;
    parentOfTalentId: string | null;
    recipientEmail: string | null;
    recipientPhone: string | null;
    broadcast: {
      id: string;
      name: string;
      channel: 'mail' | 'sms';
      subjectSnapshot: string | null;
      createdAt: Date | string;
    };
  };

  let { items }: { items: Item[]; timezone: string } = $props();

  const formatter = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
</script>

<Card.Root class="rounded-sm border shadow-sm dark:shadow-none">
  <Card.Header class="border-b bg-muted/30 pt-4 pb-4">
    <Card.Title
      class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
    >
      <Megaphone class="h-4 w-4 text-epi-blue" />
      Communications reçues
    </Card.Title>
  </Card.Header>
  <Card.Content class="pt-5">
    {#if items.length === 0}
      <p class="text-sm text-muted-foreground italic">
        Aucun envoi reçu pour le moment.
      </p>
    {:else}
      <ul class="space-y-2 text-sm">
        {#each items as item (item.id)}
          <li
            class="flex items-start justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2"
          >
            <div class="min-w-0 flex-1">
              <div
                class="flex items-center gap-2 text-xs text-muted-foreground"
              >
                {#if item.broadcast.channel === 'mail'}
                  <Mail class="h-3.5 w-3.5" />
                {:else}
                  <MessageSquare class="h-3.5 w-3.5" />
                {/if}
                <span>
                  {item.parentOfTalentId
                    ? 'envoyé au parent'
                    : 'envoyé au talent'}
                </span>
                <span
                  >· {formatter.format(
                    new Date(item.broadcast.createdAt),
                  )}</span
                >
              </div>
              <a
                href={resolve(`/staff/admin/broadcasts/${item.broadcast.id}`)}
                class="block truncate font-medium hover:underline"
              >
                {item.broadcast.name}
              </a>
              {#if item.broadcast.subjectSnapshot}
                <p class="truncate text-xs text-muted-foreground">
                  {item.broadcast.subjectSnapshot}
                </p>
              {/if}
            </div>
            <div class="flex shrink-0 flex-col items-end gap-1 text-xs">
              <span
                class="rounded px-2 py-0.5 {item.status === 'sent'
                  ? 'bg-emerald-100 text-emerald-800'
                  : item.status === 'failed'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-slate-100 text-slate-700'}"
              >
                {item.status}
              </span>
              {#if item.openedAt || true}
                <span class="text-emerald-600">Ouvert</span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </Card.Content>
</Card.Root>
