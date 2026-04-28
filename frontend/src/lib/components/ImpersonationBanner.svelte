<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { authClient } from '$lib/auth-client';
  import { Button } from '$lib/components/ui/button';
  import { LogOut, UserCheck } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';

  let busy = $state(false);

  const session = $derived(
    page.data.session as { impersonatedBy?: string | null } | null,
  );
  const user = $derived(
    page.data.user as { email?: string; name?: string | null } | null,
  );
  const isImpersonating = $derived(Boolean(session?.impersonatedBy));

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
    class="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-amber-500/40 bg-amber-100 px-4 py-2 text-sm text-amber-900 shadow-sm dark:bg-amber-950/80 dark:text-amber-100"
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
{/if}
