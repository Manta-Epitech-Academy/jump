<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { ShieldAlert, TriangleAlert } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { getStaffRoleRedirectPath } from '$lib/domain/staff';
  import { describeGroup } from '$lib/domain/permissions';

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

<div
  class="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center"
>
  {#if status === 403}
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
  {:else}
    <TriangleAlert class="h-12 w-12 text-destructive" />
    <h1 class="text-2xl font-bold uppercase">Erreur {status}</h1>
    <p class="max-w-md text-sm text-muted-foreground">
      {page.error?.message ?? 'Une erreur inattendue est survenue.'}
    </p>
    <Button href={resolve(workspacePath)}>Retour à l'espace</Button>
  {/if}
</div>
