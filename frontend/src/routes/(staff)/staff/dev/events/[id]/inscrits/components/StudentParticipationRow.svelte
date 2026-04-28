<script lang="ts">
  import * as Avatar from '$lib/components/ui/avatar';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Trash2, Sprout, FileCheck, Trophy } from '@lucide/svelte';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import BringPcBadge from '$lib/components/events/BringPcBadge.svelte';
  import type { ParticipationWithDetails } from '$lib/types';
  import { cn } from '$lib/utils';

  let {
    participation,
    onDelete,
    showCompliance = false,
  }: {
    participation: ParticipationWithDetails;
    onDelete: (id: string) => void;
    showCompliance?: boolean;
  } = $props();

  function formatFirstName(name: string | undefined) {
    if (!name) return '';
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }

  let isNewStudent = $derived.by(() => {
    const count = participation.talent?.eventsCount || 0;
    const isPresent = participation.isPresent ? 1 : 0;
    return count - isPresent === 0;
  });

  let signedCount = $derived(
    (participation.stageCompliance?.charteSigned ? 1 : 0) +
      (participation.stageCompliance?.conventionSigned ? 1 : 0) +
      (participation.stageCompliance?.imageRightsSigned ? 1 : 0),
  );
</script>

<div
  class="group relative flex items-center justify-between rounded-sm border border-l-4 border-l-transparent bg-card p-3 transition-all hover:border-epi-blue"
>
  <div class="flex items-center gap-4">
    <a
      href={resolve(`/staff/dev/students/${participation.talent?.id}`)}
      class="relative block transition-opacity hover:opacity-80"
      tabindex="-1"
      aria-hidden="true"
    >
      <Avatar.Root class="rounded-sm border-2 border-transparent">
        <Avatar.Fallback class="bg-primary/5 font-bold text-primary">
          {participation.talent?.nom?.[0]}{participation.talent?.prenom?.[0]}
        </Avatar.Fallback>
      </Avatar.Root>
    </a>
    <div>
      <div class="flex items-center gap-2">
        <a
          href={resolve(`/staff/dev/students/${participation.talent?.id}`)}
          class="text-sm font-bold transition-colors hover:text-epi-blue"
        >
          <span class="uppercase">{participation.talent?.nom}</span>
          {formatFirstName(participation.talent?.prenom)}
        </a>
        {#if isNewStudent}
          <Badge
            variant="outline"
            class="gap-1 border-green-200 bg-green-50 px-1 py-0 text-[9px] text-green-700 dark:border-green-900 dark:bg-green-900/30 dark:text-green-400"
          >
            <Sprout class="h-2.5 w-2.5" />
            Nouveau
          </Badge>
        {/if}
      </div>

      <div class="mt-0.5 flex items-center gap-2">
        <span class="text-xs font-black text-muted-foreground uppercase">
          {participation.talent?.niveau}
        </span>
        <form
          method="POST"
          action="?/toggleBringPc"
          use:enhance={() => {
            participation.bringPc = !participation.bringPc;
            return async ({ result, update }) => {
              if (result.type === 'failure' || result.type === 'error') {
                participation.bringPc = !participation.bringPc;
              }
              await update();
            };
          }}
          class="inline"
        >
          <input type="hidden" name="id" value={participation.id} />
          <input
            type="hidden"
            name="state"
            value={participation.bringPc.toString()}
          />
          <BringPcBadge bringPc={participation.bringPc} />
        </form>
      </div>
    </div>
  </div>

  <div class="flex items-center gap-3">
    <div class="hidden items-center gap-3 sm:flex">
      <div
        class="flex items-center gap-1.5 text-xs font-bold text-muted-foreground"
      >
        <Trophy class="h-3.5 w-3.5 text-epi-orange" />
        <span class="font-mono text-foreground"
          >{participation.talent?.xp ?? 0}</span
        >
        <span class="text-[10px] tracking-widest uppercase">XP</span>
      </div>
      <div
        class="flex items-center gap-1.5 text-xs font-bold text-muted-foreground"
      >
        <span class="font-mono text-foreground"
          >{participation.talent?.eventsCount ?? 0}</span
        >
        <span class="text-[10px] tracking-widest uppercase">part.</span>
      </div>
      {#if showCompliance}
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Badge
                  {...props}
                  variant="outline"
                  class={cn(
                    'gap-1 px-1.5 py-0 text-[10px] tracking-widest uppercase',
                    signedCount === 3
                      ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-400'
                      : signedCount > 0
                        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400'
                        : 'border-border text-muted-foreground',
                  )}
                >
                  <FileCheck class="h-3 w-3" />
                  {signedCount}/3
                </Badge>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>
              <p class="text-xs font-bold uppercase">
                Documents signés (charte, convention, droit à l'image)
              </p>
            </Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      {/if}
    </div>
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-muted-foreground hover:text-destructive"
              onclick={() => onDelete(participation.id)}
            >
              <Trash2 class="trash-icon h-4 w-4" />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>
          <p class="font-bold text-destructive uppercase">
            Retirer de l'événement
          </p>
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  </div>
</div>
