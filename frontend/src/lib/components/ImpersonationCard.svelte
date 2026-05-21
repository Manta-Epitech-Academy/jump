<script lang="ts">
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { authClient } from '$lib/auth-client';
  import LogOut from '@lucide/svelte/icons/log-out';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import { toast } from 'svelte-sonner';
  import StagePhaseOverrideToggle from '$lib/components/dev/StagePhaseOverrideToggle.svelte';
  import type { EventLifecycleStatus } from '$lib/domain/eventLifecycle';

  // Impersonation indicator. Lives inside the sidebar (above the footer)
  // rather than as a top banner so it never shifts the viewport. Styled for
  // the dark navy rail, with epi-orange (DS alert tone) flagging the paused
  // admin session.

  let busy = $state(false);

  const session = $derived(
    page.data.session as { impersonatedBy?: string | null } | null,
  );
  const user = $derived(
    page.data.user as { email?: string; name?: string | null } | null,
  );
  const isImpersonating = $derived(Boolean(session?.impersonatedBy));
  const phaseOverride = $derived(
    (page.data.phaseOverride ?? null) as EventLifecycleStatus | null,
  );
  const realPhase = $derived(
    (page.data.activeStage?.realStatus ?? null) as EventLifecycleStatus | null,
  );
  // The toggle previews phase-specific UI of a stage. Show it only when the
  // impersonated dev/superdev actually has a stage to preview — otherwise the
  // control is dead (resolveStageContext returns null → nothing reacts).
  const canOverridePhase = $derived(
    Boolean(page.data.canOverridePhase) && Boolean(page.data.activeStage),
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
  <div class="border-t border-sidebar-border p-3">
    <div
      class="flex flex-col gap-2 rounded-sm border border-epi-orange/40 bg-epi-orange/10 p-3"
      role="alert"
    >
      <div class="flex items-center gap-1.5">
        <UserCheck class="h-3.5 w-3.5 shrink-0 text-epi-orange" />
        <span
          class="font-mono text-[9px] font-bold tracking-widest text-epi-orange uppercase"
        >
          Session admin en pause
        </span>
      </div>
      <div class="min-w-0">
        <p
          class="truncate text-sm leading-tight font-bold text-sidebar-foreground"
        >
          {user?.name || user?.email || 'utilisateur'}
        </p>
        {#if user?.name && user?.email}
          <p
            class="truncate text-xs leading-tight text-sidebar-foreground-muted"
          >
            {user.email}
          </p>
        {/if}
      </div>
      {#if canOverridePhase}
        <StagePhaseOverrideToggle current={phaseOverride} {realPhase} />
      {/if}
      <button
        type="button"
        onclick={stopImpersonating}
        disabled={busy}
        class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-sm bg-epi-orange px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-epi-orange/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogOut class="h-3.5 w-3.5" />
        Revenir au compte admin
      </button>
    </div>
  </div>
{/if}
