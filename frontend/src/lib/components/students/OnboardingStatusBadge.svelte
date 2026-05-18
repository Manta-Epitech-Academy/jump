<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import Send from '@lucide/svelte/icons/send';
  import type { Component } from 'svelte';
  import { cn } from '$lib/utils';
  import type { TalentOnboardingStatus } from '$lib/domain/talentOnboarding';

  let {
    status,
    class: className = '',
  }: { status: TalentOnboardingStatus; class?: string } = $props();

  type Variant = { label: string; icon: Component; cls: string };

  const VARIANTS: Record<TalentOnboardingStatus, Variant> = {
    'not-ready': {
      label: 'À relancer',
      icon: Send,
      cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/15 dark:text-amber-300',
    },
    done: {
      label: 'Prêt',
      icon: Check,
      cls: 'bg-green-50 text-green-700 dark:bg-green-900/15 dark:text-green-300',
    },
  };

  const v = $derived(VARIANTS[status]);
</script>

<span
  class={cn(
    'inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] font-medium',
    v.cls,
    className,
  )}
>
  <v.icon class="h-3 w-3 shrink-0" />
  {v.label}
</span>
