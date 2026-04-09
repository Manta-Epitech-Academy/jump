<script lang="ts">
  import * as Avatar from '$lib/components/ui/avatar';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import {
    ArrowRightLeft,
    Trash2,
    BookOpen,
    Plus,
    Sprout,
    Ban,
    TriangleAlert,
  } from '@lucide/svelte';
  import { enhance } from '$app/forms';
  import { cn } from '$lib/utils';
  import { resolve } from '$app/paths';
  import BringPcBadge from '../../components/BringPcBadge.svelte';
  import { m } from '$lib/paraglide/messages.js';

  let {
    participation,
    onDelete,
    onManageSubjects,
  }: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    participation: any;
    onDelete: (id: string) => void;
    onManageSubjects: (
      participationId: string,
      currentSubjectIds: string[],
    ) => void;
  } = $props();

  function formatFirstName(name: string | undefined) {
    if (!name) return '';
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  }

  let subjects = $derived(participation.subjects?.map((ps: any) => ps.subject) || []);
  let hasSubjects = $derived(subjects.length > 0);

  let alerts = $derived(participation.alerts || []);
  let hasAlerts = $derived(alerts.length > 0);
  let hasDanger = $derived(alerts.some((a: any) => a.type === 'danger'));

  let isNewStudent = $derived.by(() => {
    const count = participation.studentProfile?.eventsCount || 0;
    const isPresent = participation.isPresent ? 1 : 0;
    return count - isPresent === 0;
  });

  function getSubjectAlert(subjectName: string) {
    const alerts = participation.alerts || [];
    return alerts.find((a: any) => a.message.includes(`"${subjectName}"`));
  }
</script>

<div
  class="group relative flex items-center justify-between rounded-sm border border-l-4 p-3 transition-all hover:border-epi-blue {hasDanger
    ? 'border-l-destructive bg-red-50 dark:bg-red-950/30'
    : hasAlerts
      ? 'border-l-epi-orange bg-orange-50 dark:bg-orange-950/30'
      : 'border-l-transparent bg-card'}"
>
  <div class="flex items-center gap-4">
    <a
      href={resolve(`/students/${participation.studentProfile?.id}`)}
      class="relative block transition-opacity hover:opacity-80"
      tabindex="-1"
      aria-hidden="true"
    >
      <Avatar.Root class="rounded-sm border-2 border-transparent">
        <Avatar.Fallback class="bg-primary/5 font-bold text-primary">
          {participation.studentProfile?.nom?.[0]}{participation.studentProfile?.prenom?.[0]}
        </Avatar.Fallback>
      </Avatar.Root>
    </a>
    <div>
      <div class="flex items-center gap-2">
        <a
          href={resolve(`/students/${participation.studentProfile?.id}`)}
          class="text-sm font-bold transition-colors hover:text-epi-blue"
        >
          <span class="uppercase">{participation.studentProfile?.nom}</span>
          {formatFirstName(participation.studentProfile?.prenom)}
        </a>
        {#if isNewStudent}
          <Badge
            variant="outline"
            class="gap-1 border-green-200 bg-green-50 px-1 py-0 text-[9px] text-green-700 dark:border-green-900 dark:bg-green-900/30 dark:text-green-400"
          >
            <Sprout class="h-2.5 w-2.5" />
            {m.event_builder_new_student()}
          </Badge>
        {/if}
      </div>

      <div class="mt-0.5 flex items-center gap-2">
        <span class="text-xs font-black text-muted-foreground uppercase">
          {participation.studentProfile?.niveau}
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

  <!-- DISPLAY SUBJECTS LIST -->
  <div class="flex flex-1 flex-wrap items-center gap-2 px-6">
    {#if hasSubjects}
      {#each subjects as sub}
        {@const alert = getSubjectAlert(sub.nom)}

        {#if alert}
          <Tooltip.Provider delayDuration={100}>
            <Tooltip.Root>
              <Tooltip.Trigger>
                <Badge
                  variant="outline"
                  class={cn(
                    'cursor-help gap-1.5 border-2 transition-all',
                    alert.type === 'danger'
                      ? 'border-destructive/30 bg-red-50 text-destructive hover:border-destructive'
                      : 'border-orange-200 bg-orange-50 text-orange-700 hover:border-orange-400',
                  )}
                >
                  {#if alert.type === 'danger'}
                    <Ban class="h-3 w-3" />
                  {:else}
                    <TriangleAlert class="h-3 w-3" />
                  {/if}
                  {sub.nom}
                </Badge>
              </Tooltip.Trigger>
              <Tooltip.Content
                class="border-l-4 {alert.type === 'danger'
                  ? 'border-l-destructive'
                  : 'border-l-epi-orange'}"
              >
                <p class="text-xs font-bold">{alert.message}</p>
              </Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        {:else}
          <Badge
            variant="secondary"
            class="gap-1.5 border bg-muted/50 px-2 text-[10px] font-bold"
          >
            <BookOpen class="h-3 w-3 text-muted-foreground" />
            {sub.nom}
          </Badge>
        {/if}
      {/each}
    {:else}
      <span
        class="animate-pulse text-[10px] font-black tracking-widest text-epi-orange uppercase"
      >
        {m.event_builder_selection_required()}
      </span>
    {/if}
  </div>

  <div class="flex items-center gap-3">
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="outline"
              size="sm"
              class="h-8 gap-2 px-3 text-[10px] font-bold uppercase transition-opacity {!hasSubjects
                ? 'border-epi-orange text-epi-orange opacity-100 hover:bg-epi-orange hover:text-white'
                : 'opacity-0 group-hover:opacity-100'}"
              onclick={() =>
                onManageSubjects(
                  participation.id,
                  subjects.map((s: any) => s.id),
                )}
            >
              {#if !hasSubjects}
                <Plus class="h-3 w-3" />
                {m.event_builder_assign()}
              {:else}
                <ArrowRightLeft class="h-3 w-3" />
                {m.event_builder_manage()}
              {/if}
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>
          <p>{!hasSubjects ? m.event_builder_choose_subject() : m.event_builder_modify_subjects()}</p>
        </Tooltip.Content>
      </Tooltip.Root>

      <div>
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
              {m.event_builder_remove_from_event()}
            </p>
          </Tooltip.Content>
        </Tooltip.Root>
      </div>
    </Tooltip.Provider>
  </div>
</div>
