<script lang="ts">
  import FileCheck from '@lucide/svelte/icons/file-check';
  import FileClock from '@lucide/svelte/icons/file-clock';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import UserX from '@lucide/svelte/icons/user-x';
  import * as Card from '$lib/components/ui/card';
  import { formatDateFr } from '$lib/utils';

  let {
    student,
    timezone,
  }: {
    student: {
      userId: string | null;
      lastActiveAt: Date | string | null;
      infoValidatedAt: Date | string | null;
    };
    timezone: string;
  } = $props();

  const accountState = $derived(
    student.userId
      ? student.lastActiveAt
        ? ('active' as const)
        : ('created' as const)
      : ('none' as const),
  );
</script>

<Card.Root class="rounded-sm border shadow-sm dark:shadow-none">
  <Card.Header class="border-b bg-muted/30 pt-4 pb-4">
    <Card.Title
      class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
    >
      <UserCheck class="h-4 w-4 text-epi-blue" />
      Onboarding plateforme
    </Card.Title>
  </Card.Header>
  <Card.Content class="space-y-2 pt-5">
    <div class="flex items-center gap-2 text-sm">
      {#if accountState === 'active'}
        <UserCheck class="h-4 w-4 shrink-0 text-green-500" />
        <span class="flex-1">Compte plateforme actif</span>
        <span class="text-xs text-muted-foreground">
          Dernière connexion : {formatDateFr(student.lastActiveAt!, timezone)}
        </span>
      {:else if accountState === 'created'}
        <FileClock class="h-4 w-4 shrink-0 text-amber-500" />
        <span class="flex-1 text-muted-foreground">
          Compte créé, jamais connecté
        </span>
      {:else}
        <UserX class="h-4 w-4 shrink-0 text-destructive" />
        <span class="flex-1 text-muted-foreground">Aucun compte plateforme</span
        >
      {/if}
    </div>
    <div class="flex items-center gap-2 text-sm">
      {#if student.infoValidatedAt}
        <FileCheck class="h-4 w-4 shrink-0 text-green-500" />
        <span class="flex-1">Profil complété</span>
        <span class="text-xs text-muted-foreground">
          {formatDateFr(student.infoValidatedAt, timezone)}
        </span>
      {:else}
        <FileClock class="h-4 w-4 shrink-0 text-amber-500" />
        <span class="flex-1 text-muted-foreground">Profil incomplet</span>
      {/if}
    </div>
  </Card.Content>
</Card.Root>
