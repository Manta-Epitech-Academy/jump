<script lang="ts">
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, CircleCheck, Lock } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import type { ActivityStep } from '$lib/server/services/progressService';

  let {
    steps,
    currentIndex,
    unlockedIndex,
    showRoadmapMobile = $bindable(),
    onSelect,
  }: {
    steps: ActivityStep[];
    currentIndex: number;
    unlockedIndex: number;
    showRoadmapMobile: boolean;
    onSelect: (stepId: string) => void;
  } = $props();

  function getStepStatus(index: number) {
    if (index < unlockedIndex) return 'done';
    if (index === unlockedIndex) return 'active';
    return 'locked';
  }

  function handleClick(stepId: string, status: string) {
    if (status === 'locked') return;
    onSelect(stepId);
    showRoadmapMobile = false;
  }
</script>

<aside
  class={cn(
    'absolute inset-y-0 left-0 z-20 w-72 flex-col border-r border-slate-200 bg-slate-50 transition-transform duration-300 md:relative md:flex md:translate-x-0 dark:border-slate-800 dark:bg-slate-950',
    showRoadmapMobile ? 'flex translate-x-0 shadow-2xl' : '-translate-x-full',
  )}
>
  <div class="flex items-center justify-between p-4 md:hidden">
    <span class="font-bold text-slate-500 uppercase">Plan de vol</span>
    <Button
      variant="ghost"
      size="icon"
      onclick={() => (showRoadmapMobile = false)}
    >
      <ArrowLeft class="h-4 w-4" />
    </Button>
  </div>

  <ScrollArea class="flex-1 p-4">
    <div class="space-y-2">
      {#each steps as step, i (step.id)}
        {@const status = getStepStatus(i)}
        {@const isCurrent = i === currentIndex}

        <Button
          variant="ghost"
          disabled={status === 'locked'}
          onclick={() => handleClick(step.id, status)}
          class={cn(
            'flex h-auto w-full items-center gap-3 rounded-xl border p-3 text-left tracking-normal normal-case transition-all',
            isCurrent
              ? 'border-epi-teal-solid bg-epi-teal-solid/10 shadow-sm'
              : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800',
            status === 'locked' &&
              'cursor-not-allowed opacity-50 hover:bg-transparent',
          )}
        >
          <div
            class={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
              status === 'done'
                ? 'bg-epi-teal-solid text-white'
                : isCurrent
                  ? 'bg-white text-epi-teal-solid shadow-sm dark:bg-slate-900'
                  : 'bg-slate-200 text-slate-500 dark:bg-slate-800',
            )}
          >
            {#if status === 'done'}<CircleCheck
                class="h-4 w-4"
              />{:else if status === 'locked'}<Lock
                class="h-4 w-4"
              />{:else}{i + 1}{/if}
          </div>
          <div class="flex flex-col overflow-hidden">
            <span
              class={cn(
                'truncate text-sm font-bold',
                isCurrent
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400',
              )}>{step.title}</span
            >
            <span
              class="text-[10px] font-bold tracking-wider text-slate-400 uppercase"
            >
              {#if step.type === 'theory'}Théorie{:else if step.type === 'exercise'}Exercice{:else}Validation{/if}
            </span>
          </div>
        </Button>
      {/each}
    </div>
  </ScrollArea>
</aside>
