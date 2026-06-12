<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import { resolve } from '$app/paths';
  import { getStaffRoleRedirectPath } from '$lib/domain/staff';
  import { describeGroup } from '$lib/domain/permissions';
  import ErrorTerminal from '$lib/components/errors/ErrorTerminal.svelte';

  const status = $derived(page.status);
  const role = $derived(page.data.staffProfile?.staffRole);
  const workspacePath = $derived(
    getStaffRoleRedirectPath(role) ?? '/staff/login',
  );
  const gating = $derived(
    page.error?.code === 'staff_group_required' && page.error.group
      ? describeGroup(page.error.group)
      : null,
  );
</script>

{#if status === 403}
  <!-- A role-gated 403 keeps its bespoke, helpful message (which role, who to
       contact) rather than the generic terminal — the actionable detail matters
       more here than the brand flourish. -->
  <div
    class="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center"
  >
    <ShieldAlert class="h-12 w-12 text-destructive" />
    <h1 class="text-2xl font-bold uppercase">Action réservée</h1>
    {#if gating}
      <p class="max-w-md text-sm text-muted-foreground">
        Cette page est réservée au rôle <strong>{gating.label}</strong>.
        Contactez {gating.contact} si vous pensez y avoir accès.
      </p>
    {:else}
      <p class="max-w-md text-sm text-muted-foreground">
        Cette opération est réservée aux responsables de l'espace.
      </p>
    {/if}
    <Button href={resolve(workspacePath)}>Retour à l'espace</Button>
  </div>
{:else}
  <ErrorTerminal
    homeHref={resolve(workspacePath)}
    homeLabel="Retour à l'espace"
  />
{/if}
