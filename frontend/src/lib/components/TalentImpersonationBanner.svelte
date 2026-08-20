<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { fly } from 'svelte/transition';
  import { authClient } from '$lib/auth-client';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import LogOut from '@lucide/svelte/icons/log-out';
  import { toast } from 'svelte-sonner';
  import PlanningPreviewToggle from '$lib/components/talent/PlanningPreviewToggle.svelte';
  import type { PlanningPreview } from '$lib/server/talentPlanningPreview';

  // Shown to an admin impersonating a talent. The talent portal is a light,
  // sidebar-less layout, so the staff-rail ImpersonationCard doesn't fit here.
  // Styled as a floating iOS-style notification pill that slides up from the
  // bottom-left corner: deliberately rounded/blurred (off-brand vs the square
  // DS) to read as a transient system overlay, not part of the talent UI.
  // Tucked into the corner and dimmed at rest so it stops competing with the
  // content; brightens to full opacity on hover when the admin reaches for it.
  // Shares BetterAuth's `session.impersonatedBy` signal and stop-impersonating
  // call.

  let busy = $state(false);

  const session = $derived(
    page.data.session as { impersonatedBy?: string | null } | null,
  );
  const talent = $derived(
    page.data.talent as { prenom?: string; nom?: string } | null,
  );
  const isImpersonating = $derived(Boolean(session?.impersonatedBy));
  const name = $derived(
    [talent?.prenom, talent?.nom].filter(Boolean).join(' ') || 'ce talent',
  );
  // Dev-tooling: cycle the dashboard "Planning à venir" widget through its
  // states. Resolved by the root layout load; only true while impersonating a
  // talent, so the toggle never shows on a real student's session.
  const canPreviewPlanning = $derived(Boolean(page.data.canPreviewPlanning));
  const planningPreview = $derived(
    (page.data.planningPreview ?? null) as PlanningPreview | null,
  );

  async function stopImpersonating() {
    if (busy) return;
    busy = true;
    try {
      await authClient.admin.stopImpersonating();
      // Full-page nav, mirroring the impersonate-start path
      // (admin/talents/+page.svelte): the BetterAuth stop call swaps the
      // session cookie back to the admin, so we want the next request
      // evaluated fresh rather than reusing the impersonated client state.
      // A full reload also tears down talent-space globals that an SPA nav
      // would not: Crisp injects a side-effecting widget into the document
      // with no Svelte teardown, so an in-app `goto` left its chat bubble
      // floating over the admin space.
      window.location.href = resolve('/staff/admin/talents');
    } catch (err) {
      console.error(err);
      toast.error('Impossible de revenir au compte admin.');
      busy = false;
    }
  }
</script>

{#if isImpersonating}
  <div class="pointer-events-none fixed bottom-3 left-3 z-[60]">
    <div
      in:fly={{ y: 80, duration: 320, opacity: 0 }}
      class="pointer-events-auto flex max-w-xs flex-col gap-2 rounded-2xl border border-black/5 bg-white/85 p-2.5 opacity-65 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl transition-opacity duration-200 focus-within:opacity-100 hover:opacity-100 dark:border-white/10 dark:bg-slate-900/85 dark:ring-white/10"
      role="alert"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-epi-together text-white"
        >
          <UserCheck class="h-[18px] w-[18px]" />
        </div>
        <div class="min-w-0 flex-1">
          <p
            class="text-[11px] font-bold tracking-wide text-epi-together uppercase"
          >
            Mode admin
          </p>
          <p
            class="truncate text-sm leading-tight font-semibold text-foreground"
          >
            Session de {name}
          </p>
        </div>
        <button
          type="button"
          onclick={stopImpersonating}
          disabled={busy}
          class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-epi-together px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-epi-together/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut class="h-3.5 w-3.5" />
          Revenir
        </button>
      </div>
      {#if canPreviewPlanning}
        <PlanningPreviewToggle current={planningPreview} />
      {/if}
    </div>
  </div>
{/if}
