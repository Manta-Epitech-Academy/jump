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
    afterIdentity,
    beforeStats,
    footer,
  }: {
    student: any;
    stats: { presentCount: number; lateCount: number };
    xpProgress: number;
    accent: 'blue' | 'teal';
    afterIdentity?: Snippet;
    beforeStats?: Snippet;
    footer?: Snippet;
  } = $props();

  const borderClass = $derived(
    accent === 'teal' ? 'border-t-epi-teal' : 'border-t-epi-blue',
  );
  const levelBadgeClass = $derived(
    accent === 'teal'
      ? 'border-epi-teal font-bold text-epi-teal uppercase'
      : 'border-epi-blue font-bold text-epi-blue uppercase',
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

<Card.Root class={cn('overflow-hidden border-t-4 shadow-md', borderClass)}>
  <Card.Header class="flex flex-col items-center pb-2 text-center">
    <Avatar.Root class="h-24 w-24 border-4 border-muted bg-white shadow-sm">
      <Avatar.Fallback
        class="bg-secondary text-2xl font-bold text-secondary-foreground"
        >{getInitials(student.prenom, student.nom)}</Avatar.Fallback
      >
    </Avatar.Root>
    <Card.Title class="mt-4 text-xl"
      ><span class="uppercase">{student.nom}</span> {student.prenom}</Card.Title
    >
    <div class="mt-1 flex flex-col items-center gap-1">
      <Badge variant="outline" class={levelBadgeClass}>{student.niveau}</Badge>
      <Badge
        variant="outline"
        class={cn(
          'text-[10px] font-bold uppercase',
          getDifficultyColor(student.niveauDifficulte || 'Débutant'),
        )}
      >
        <SignalLow class="mr-1 h-3 w-3" />
        {student.niveauDifficulte || 'Débutant'}
      </Badge>
    </div>
  </Card.Header>
  <Card.Content class="space-y-6">
    {#if afterIdentity}
      {@render afterIdentity()}
      <Separator />
    {/if}

    <div class="space-y-3 text-center">
      <div class="relative inline-flex items-center justify-center">
        <div
          class="absolute inset-0 rounded-full bg-epi-orange/30 blur-lg"
        ></div>
        <Trophy
          class="duration-2000ms relative h-8 w-8 animate-bounce text-epi-orange"
        />
      </div>
      <div class="flex flex-col items-center">
        <Badge
          variant="outline"
          class={cn(
            'mt-2 mb-2 px-3 py-1 text-sm font-black tracking-widest uppercase',
            student.xp >= 500
              ? 'shiny-badge border-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
              : 'border-border text-muted-foreground',
          )}
        >
          {student.xp >= 500 ? 'Expert ✦' : 'Novice'}
        </Badge>
        <span
          class="text-3xl font-black tracking-tighter text-foreground italic"
          >{student.xp}<span class="ml-1 text-lg text-epi-orange not-italic"
            >XP</span
          ></span
        >
      </div>
      <div
        class="relative h-4 w-full overflow-hidden rounded-full bg-muted shadow-inner"
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

    <div class="grid grid-cols-2 gap-4 text-center">
      <div class="rounded-sm bg-muted/30 p-2">
        <div class="text-lg font-bold">{stats.presentCount}</div>
        <div class="text-[9px] font-bold text-muted-foreground uppercase">
          Présences
        </div>
      </div>
      {#if stats.lateCount > 0}
        <div class="rounded-sm bg-muted/30 p-2">
          <div class="text-lg font-bold text-orange-500">{stats.lateCount}</div>
          <div class="text-[9px] font-bold text-muted-foreground uppercase">
            Retards
          </div>
        </div>
      {/if}
    </div>

    {#if footer}
      {@render footer()}
    {/if}
  </Card.Content>
</Card.Root>
