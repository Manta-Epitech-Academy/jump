<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Trophy, SignalLow } from '@lucide/svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Avatar from '$lib/components/ui/avatar';
  import { Badge } from '$lib/components/ui/badge';
  import { Separator } from '$lib/components/ui/separator';
  import { cn } from '$lib/utils';

  let {
    student,
    stats,
    xpProgress,
    accent,
    hideName = false,
    avatarViewTransitionName,
    afterIdentity,
    beforeStats,
    footer,
  }: {
    student: any;
    stats: { totalEvents: number; presentCount: number; lateCount: number };
    xpProgress: number;
    accent: 'blue' | 'teal';
    hideName?: boolean;
    avatarViewTransitionName?: string;
    afterIdentity?: Snippet;
    beforeStats?: Snippet;
    footer?: Snippet;
  } = $props();

  const borderClass = $derived(
    accent === 'teal' ? 'border-t-epi-teal-solid' : 'border-t-epi-blue',
  );
  const levelBadgeClass = $derived(
    accent === 'teal'
      ? 'border-epi-teal-solid font-bold text-epi-teal-solid uppercase tracking-tight'
      : 'border-epi-blue font-bold text-epi-blue uppercase tracking-tight',
  );

  function getInitials(prenom: string, nom: string) {
    return (nom[0] + prenom[0]).toUpperCase();
  }

  function getDifficultyColor(diff: string) {
    switch (diff) {
      case 'Débutant':
        return 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/30 dark:bg-green-900/20 dark:text-green-400';
      case 'Intermédiaire':
        return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-400';
      case 'Avancé':
        return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/30 dark:bg-purple-900/20 dark:text-purple-400';
      default:
        return 'border-border text-muted-foreground';
    }
  }
</script>

<Card.Root
  class={cn(
    'overflow-hidden border-t-4 shadow-md dark:shadow-none dark:ring-1 dark:ring-border/50',
    borderClass,
  )}
>
  <Card.Header class="flex flex-col items-center pt-8 pb-4 text-center">
    <span
      class="block rounded-full"
      style:view-transition-name={avatarViewTransitionName}
    >
      <Avatar.Root
        class="h-28 w-28 border-4 border-muted bg-white shadow-sm dark:shadow-none dark:ring-1 dark:ring-border/50"
      >
        <Avatar.Fallback
          class="bg-secondary text-3xl font-bold text-secondary-foreground"
          >{getInitials(student.prenom, student.nom)}</Avatar.Fallback
        >
      </Avatar.Root>
    </span>
    {#if !hideName}
      <!-- Tightened header typography -->
      <Card.Title
        class="mt-6 font-heading text-2xl leading-none tracking-[-0.03em]"
        ><span class="uppercase">{student.nom}</span>
        {student.prenom}</Card.Title
      >
    {/if}
    <div
      class={cn(
        'flex flex-col items-center gap-1.5',
        hideName ? 'mt-6' : 'mt-3',
      )}
    >
      <Badge variant="outline" class={cn('px-3 py-0.5', levelBadgeClass)}
        >{student.niveau}</Badge
      >
      <Badge
        variant="outline"
        class={cn(
          'px-2 py-0.5 text-[10px] font-bold uppercase',
          getDifficultyColor(student.niveauDifficulte || 'Débutant'),
        )}
      >
        <SignalLow class="mr-1 h-3 w-3" />
        {student.niveauDifficulte || 'Débutant'}
      </Badge>
    </div>
  </Card.Header>
  <Card.Content class="space-y-8 px-6 pb-8">
    {#if afterIdentity}
      <div class="p-1">
        {@render afterIdentity()}
      </div>
      <Separator />
    {/if}

    <div class="space-y-4 text-center">
      <div class="relative inline-flex items-center justify-center">
        <div
          class="absolute inset-0 rounded-full bg-epi-orange/30 blur-xl"
        ></div>
        <Trophy
          class="duration-2000ms relative h-10 w-10 animate-bounce text-epi-orange drop-shadow-lg dark:drop-shadow-none"
        />
      </div>
      <div class="flex flex-col items-center">
        <Badge
          variant="outline"
          class={cn(
            'mt-2 mb-2 px-4 py-1 text-xs font-black tracking-widest uppercase shadow-sm dark:shadow-none',
            student.xp >= 500
              ? 'shiny-badge border-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
              : 'border-border text-muted-foreground',
          )}
        >
          {student.xp >= 500 ? 'Expert ✦' : 'Novice'}
        </Badge>
        <span
          class="text-4xl font-black tracking-tighter text-foreground italic"
          >{student.xp}<span
            class="ml-1 font-heading text-xl text-epi-orange not-italic"
            >XP</span
          ></span
        >
      </div>
      <div
        class="relative h-4 w-full overflow-hidden rounded-full bg-muted shadow-inner dark:bg-muted/20"
      >
        <div
          class="relative h-full overflow-hidden bg-epi-orange transition-all duration-1000 ease-out"
          style="width: {xpProgress}%;"
        >
          <div
            class="animate-stripes absolute inset-0 h-full w-full bg-[linear-gradient(45deg,rgba(255,255,255,.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.15)_50%,rgba(255,255,255,.15)_75%,transparent_75%,transparent)] bg-size-[1rem_1rem]"
          ></div>
        </div>
      </div>
    </div>

    {#if beforeStats}
      <Separator />
      {@render beforeStats()}
    {/if}

    <Separator />

    <div
      class={cn(
        'grid gap-4 text-center',
        stats.lateCount > 0 ? 'grid-cols-3' : 'grid-cols-2',
      )}
    >
      <div
        class="rounded-lg bg-muted/40 p-3 ring-1 ring-border/20 dark:bg-muted/10"
      >
        <div class="text-xl font-black">{stats.totalEvents}</div>
        <div
          class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          Particip.
        </div>
      </div>
      <div
        class="rounded-lg bg-muted/40 p-3 ring-1 ring-border/20 dark:bg-muted/10"
      >
        <div class="text-xl font-black">{stats.presentCount}</div>
        <div
          class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          Présences
        </div>
      </div>
      {#if stats.lateCount > 0}
        <div
          class="rounded-lg bg-orange-50 p-3 ring-1 ring-orange-200/50 dark:bg-orange-950/20 dark:ring-orange-900/30"
        >
          <div class="text-xl font-black text-orange-500">
            {stats.lateCount}
          </div>
          <div
            class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
          >
            Retards
          </div>
        </div>
      {/if}
    </div>

    {#if footer}
      <div class="pt-2">
        {@render footer()}
      </div>
    {/if}
  </Card.Content>
</Card.Root>
