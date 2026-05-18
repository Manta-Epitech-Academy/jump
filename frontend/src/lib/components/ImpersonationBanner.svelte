<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { authClient } from '$lib/auth-client';
  import { Button } from '$lib/components/ui/button';
  import LogOut from '@lucide/svelte/icons/log-out';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import { toast } from 'svelte-sonner';
  import StagePhaseOverrideToggle from '$lib/components/dev/StagePhaseOverrideToggle.svelte';
  import type { EventLifecycleStatus } from '$lib/domain/eventLifecycle';
  import { onDestroy } from 'svelte';

  let busy = $state(false);
  let bannerEl = $state<HTMLDivElement | null>(null);

  // Layouts compute their viewport height as
  // calc(100dvh - var(--impersonation-banner-h)). Keep the var in sync with
  // the rendered banner so wrapping or content changes don't push the
  // sidebar past the bottom of the screen.
  $effect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!bannerEl) {
      root.style.setProperty('--impersonation-banner-h', '0px');
      return;
    }
    const apply = () => {
      root.style.setProperty(
        '--impersonation-banner-h',
        `${bannerEl!.offsetHeight}px`,
      );
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(bannerEl);
    return () => {
      ro.disconnect();
      root.style.setProperty('--impersonation-banner-h', '0px');
    };
  });

  onDestroy(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty(
      '--impersonation-banner-h',
      '0px',
    );
  });

  const session = $derived(
    page.data.session as { impersonatedBy?: string | null } | null,
  );
  const user = $derived(
    page.data.user as { email?: string; name?: string | null } | null,
  );
  const isImpersonating = $derived(Boolean(session?.impersonatedBy));
  const canOverridePhase = $derived(Boolean(page.data.canOverridePhase));
  const phaseOverride = $derived(
    (page.data.phaseOverride ?? null) as EventLifecycleStatus | null,
  );
  const realPhase = $derived(
    (page.data.activeStage?.realStatus ?? null) as EventLifecycleStatus | null,
  );

  async function stopImpersonating() {
    if (busy) return;
    busy = true;
    try {
      await authClient.admin.stopImpersonating();
      await goto(resolve('/staff/admin/users'), { invalidateAll: true });
    } catch (err) {
      console.error(err);
      toast.error('Impossible de revenir au compte admin.');
      busy = false;
    }
  }
</script>

{#if isImpersonating}
  <div
    bind:this={bannerEl}
    class="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-100 px-4 py-2 text-sm text-amber-900 shadow-sm dark:bg-amber-950/80 dark:text-amber-100"
    role="alert"
  >
    <div class="flex items-center gap-2">
      <UserCheck class="h-4 w-4 shrink-0" />
      <span>
        Connecté en tant que
        <strong>{user?.name || user?.email || 'utilisateur'}</strong>
        {#if user?.name && user?.email}
          ({user.email})
        {/if}
        — session admin en pause.
      </span>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      {#if canOverridePhase}
        <StagePhaseOverrideToggle current={phaseOverride} {realPhase} />
      {/if}
      <Button
        variant="outline"
        size="sm"
        class="gap-1 border-amber-500/60 bg-amber-50 text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-100"
        onclick={stopImpersonating}
        disabled={busy}
      >
        <LogOut class="h-3.5 w-3.5" />
        Revenir au compte admin
      </Button>
    </div>
  </div>
{/if}
