<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { enhance } from '$app/forms';
  import { cn } from '$lib/utils';
  import { CircleCheck, LifeBuoy } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import type { StepsProgress } from '@prisma/client';

  let {
    progress,
    isCompleted,
  }: {
    progress: StepsProgress;
    isCompleted: boolean;
  } = $props();

  let isCallingManta = $state(false);
  let mantaCooldown = $state(false);
</script>

<div class="absolute right-6 bottom-6 z-30">
  <form
    method="POST"
    action="?/toggleHelp"
    use:enhance={() => {
      isCallingManta = true;
      const previousStatus = progress.status;
      progress.status =
        previousStatus === 'needs_help' ? 'active' : 'needs_help';

      return async ({ result, update }) => {
        isCallingManta = false;
        if (result.type !== 'success') {
          progress.status = previousStatus;
          toast.error('Impossible de contacter le serveur.');
        } else {
          mantaCooldown = true;
          setTimeout(() => (mantaCooldown = false), 5000);
        }
        await update({ reset: false });
      };
    }}
  >
    <input type="hidden" name="progressId" value={progress.id} />
    <input type="hidden" name="currentStatus" value={progress.status} />

    <Button
      type="submit"
      size="lg"
      disabled={isCallingManta || isCompleted || mantaCooldown}
      class={cn(
        'h-14 gap-2 rounded-full font-bold text-white shadow-xl transition-all duration-300',
        progress.status === 'needs_help'
          ? 'scale-100 bg-slate-700 ring-2 shadow-slate-900/20 ring-slate-400 ring-offset-2 hover:bg-slate-800 dark:ring-offset-slate-950'
          : 'bg-epi-orange shadow-epi-orange/30 hover:scale-105 hover:bg-epi-orange/90 active:scale-95',
      )}
    >
      {#if progress.status === 'needs_help'}
        <CircleCheck class="h-5 w-5" />
        <span class="hidden sm:inline">Manta prévenu ! (Annuler)</span>
      {:else}
        <LifeBuoy class={cn('h-5 w-5', isCompleted ? '' : 'animate-pulse')} />
        <span class="hidden sm:inline">Appeler un Manta</span>
      {/if}
    </Button>
  </form>
</div>
