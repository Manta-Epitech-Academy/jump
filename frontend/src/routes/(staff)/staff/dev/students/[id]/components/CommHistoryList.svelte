<script lang="ts">
  import History from '@lucide/svelte/icons/history';
  import Mail from '@lucide/svelte/icons/mail';
  import * as Card from '$lib/components/ui/card';
  import { formatDateFr } from '$lib/utils';

  type Reminder = {
    id: string;
    type: 'student' | 'parent';
    sentAt: Date | string;
    sender: { name: string | null; email: string | null } | null;
  };

  let { reminders, timezone }: { reminders: Reminder[]; timezone: string } =
    $props();

  const labelByType: Record<Reminder['type'], string> = {
    student: 'Relance Élève',
    parent: 'Relance Parent',
  };
</script>

<Card.Root class="rounded-sm border shadow-sm dark:shadow-none">
  <Card.Header class="border-b bg-muted/30 pt-4 pb-4">
    <Card.Title
      class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
    >
      <History class="h-4 w-4 text-epi-blue" />
      Historique des relances
    </Card.Title>
  </Card.Header>
  <Card.Content class="pt-5">
    {#if reminders.length === 0}
      <p class="text-sm text-muted-foreground italic">
        Aucune relance envoyée à ce talent.
      </p>
    {:else}
      <ul class="space-y-2">
        {#each reminders as r (r.id)}
          <li
            class="flex items-start gap-3 rounded-sm border border-border bg-card p-3"
          >
            <span
              class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground"
            >
              <Mail class="h-3.5 w-3.5" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p class="text-sm font-bold">{labelByType[r.type]}</p>
                <span class="text-[11px] text-muted-foreground">
                  {formatDateFr(r.sentAt, timezone)}
                </span>
              </div>
              <p class="text-xs text-muted-foreground">
                Envoyée par {r.sender?.name ??
                  r.sender?.email ??
                  'staff inconnu'}
              </p>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </Card.Content>
</Card.Root>
