<script lang="ts">
  import { MessageSquare, ArrowRight } from '@lucide/svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Avatar from '$lib/components/ui/avatar';
  import { Button } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';

  type InterviewRow = {
    id: string;
    date: Date | string;
    talent: { id: string; nom: string; prenom: string };
  };

  type Props = {
    eventId: string;
    interviews: InterviewRow[];
    timezone: string;
  };

  let { eventId, interviews, timezone }: Props = $props();

  const interviewsHref = $derived(
    resolve(`/staff/dev/events/${eventId}/interviews`),
  );

  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    });
</script>

<Card.Root class="rounded-sm shadow-sm dark:shadow-none">
  <Card.Header
    class="flex flex-row items-center justify-between border-b bg-muted/30 pt-4 pb-3"
  >
    <Card.Title
      class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
    >
      <MessageSquare class="h-4 w-4 text-epi-blue" />
      Mes prochains entretiens
    </Card.Title>
    <Button
      variant="ghost"
      size="sm"
      class="text-[10px] font-bold tracking-widest uppercase"
      href={interviewsHref}
    >
      Tout voir <ArrowRight class="ml-1 h-3 w-3" />
    </Button>
  </Card.Header>
  <Card.Content class="p-0">
    {#if interviews.length === 0}
      <div class="px-5 py-8 text-center text-sm text-muted-foreground">
        Aucun entretien planifié pour vous.
      </div>
    {:else}
      <div class="divide-y divide-border/50">
        {#each interviews as iv (iv.id)}
          <a
            href={resolve(`/staff/dev/students/${iv.talent.id}`)}
            class="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
          >
            <Avatar.Root class="h-8 w-8 rounded-sm border">
              <Avatar.Fallback
                class="bg-primary/10 text-[10px] font-bold text-primary uppercase"
              >
                {iv.talent.nom[0]}{iv.talent.prenom[0]}
              </Avatar.Fallback>
            </Avatar.Root>
            <div class="min-w-0 flex-1">
              <div
                class="truncate text-sm font-bold uppercase transition-colors group-hover:text-epi-blue"
              >
                {iv.talent.nom}
                <span class="capitalize">{iv.talent.prenom}</span>
              </div>
              <div
                class="mt-0.5 font-mono text-[10px] font-bold tracking-widest text-epi-blue uppercase"
              >
                {formatDate(iv.date)}
              </div>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
