<script lang="ts">
  import { Trophy, Mail, Phone, Users, Pencil } from '@lucide/svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Avatar from '$lib/components/ui/avatar';
  import { Badge } from '$lib/components/ui/badge';
  import { Separator } from '$lib/components/ui/separator';
  import { Button } from '$lib/components/ui/button';
  import { cn, translateDifficulty } from '$lib/utils';
  import { m } from '$lib/paraglide/messages.js';
  import { SignalLow } from '@lucide/svelte';
  let {
    student,
    stats,
    xpProgress,
    onOpenEdit,
  }: {
    student: any;
    stats: { presentCount: number; lateCount: number };
    xpProgress: number;
    onOpenEdit: () => void;
  } = $props();

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

<Card.Root class="overflow-hidden border-t-4 border-t-epi-blue shadow-md">
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
      <Badge
        variant="outline"
        class="border-epi-blue font-bold text-epi-blue uppercase"
        >{student.niveau}</Badge
      >
      <Badge
        variant="outline"
        class={cn(
          'text-[10px] font-bold uppercase',
          getDifficultyColor(student.niveauDifficulte || 'Débutant'),
        )}
      >
        <SignalLow class="mr-1 h-3 w-3" />
        {translateDifficulty(student.niveauDifficulte || 'Débutant')}
      </Badge>
    </div>
  </Card.Header>
  <Card.Content class="space-y-6">
    <div class="flex flex-col gap-2 text-sm text-muted-foreground">
      {#if student.user?.email}<div class="flex items-center gap-2">
          <Mail class="h-3.5 w-3.5" /><span class="truncate"
            >{student.user.email}</span
          >
        </div>{/if}
      {#if student.phone}<div class="flex items-center gap-2">
          <Phone class="h-3.5 w-3.5" /><span>{student.phone}</span>
        </div>{/if}
      {#if student.parentEmail || student.parentPhone}
        <Separator class="my-1" />
        <div class="flex flex-col gap-1">
          <span
            class="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase"
            ><Users class="h-3 w-3" /> {m.student_detail_contact_parent()}</span
          >
          {#if student.parentEmail}<div class="flex items-center gap-2">
              <Mail class="h-3.5 w-3.5" /><span class="truncate"
                >{student.parentEmail}</span
              >
            </div>{/if}
          {#if student.parentPhone}<div class="flex items-center gap-2">
              <Phone class="h-3.5 w-3.5" /><span>{student.parentPhone}</span>
            </div>{/if}
        </div>
      {/if}
    </div>

    <Separator />

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
          {student.xp >= 500 ? m.student_detail_xp_expert() : m.student_detail_xp_novice()}
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
      <div
        class="flex justify-between px-1 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        <span>{m.student_detail_xp_scale_min()}</span>
        <span>{m.student_detail_xp_scale_max()}</span>
      </div>
    </div>

    <Separator />

    <div class="grid grid-cols-2 gap-4 text-center">
      <div class="rounded-sm bg-muted/30 p-2">
        <div class="text-lg font-bold">{stats.presentCount}</div>
        <div class="text-[9px] font-bold text-muted-foreground uppercase">
          {m.student_detail_stat_presences()}
        </div>
      </div>
      {#if stats.lateCount > 0}
        <div class="rounded-sm bg-muted/30 p-2">
          <div class="text-lg font-bold text-orange-500">{stats.lateCount}</div>
          <div class="text-[9px] font-bold text-muted-foreground uppercase">
            {m.student_detail_stat_lates()}
          </div>
        </div>
      {/if}
    </div>

    <Button variant="outline" class="w-full" onclick={onOpenEdit}
      ><Pencil class="mr-2 h-3.5 w-3.5" /> {m.student_detail_edit_profile()}</Button
    >
  </Card.Content>
</Card.Root>
