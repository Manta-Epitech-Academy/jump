<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { Trash2, Mail, Plus, X } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Table from '$lib/components/ui/table';
  import * as Select from '$lib/components/ui/select';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as Avatar from '$lib/components/ui/avatar';
  import { Badge } from '$lib/components/ui/badge';
  import { Switch } from '$lib/components/ui/switch';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import { STAFF_ROLES, getStaffRoleLabel } from '$lib/domain/staff';
  let { data } = $props();

  let submitting = $state<string | null>(null);
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });

  let deleteDialogOpen = $state(false);
  let userToDelete = $state<string | null>(null);

  let showAllInvitations = $state(false);
  const visibleInvitations = $derived(
    showAllInvitations
      ? (data.invitations ?? [])
      : (data.invitations ?? []).filter(
          (i) => i.invitedByUserId === data.currentUserId,
        ),
  );

  let inviteOpen = $state(false);
  const {
    form: inviteForm,
    errors: inviteErrors,
    enhance: inviteEnhance,
    reset: inviteReset,
  } = superForm(
    untrack(() => data.inviteForm),
    {
      onResult: ({ result }) => {
        if (result.type === 'success') {
          inviteOpen = false;
          toast.success(result.data?.form?.message || 'Invitation envoyée');
        } else if (result.type === 'failure' && result.data?.form?.message) {
          toast.error(result.data.form.message);
        }
      },
    },
  );

  function openInvite() {
    inviteReset();
    inviteOpen = true;
  }

  function confirmDelete(id: string) {
    userToDelete = id;
    deleteDialogOpen = true;
  }

  function getAvatarUrl(_user: any) {
    return undefined;
  }
</script>

<div class="space-y-6">
  <div class="flex items-end justify-between gap-4">
    <div>
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        Membres & <span class="text-epi-pink">invitations</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        Pré-approuver un accès ou modifier un membre existant
      </p>
    </div>
    <Button onclick={openInvite} class="gap-2">
      <Plus class="h-4 w-4" />
      Inviter
    </Button>
  </div>

  <section class="space-y-2">
    <div class="flex items-center justify-between gap-4">
      <h2 class="font-heading text-lg tracking-wide uppercase">
        Invitations en attente
        <span class="ml-2 text-sm text-muted-foreground"
          >({visibleInvitations.length})</span
        >
      </h2>
      <label class="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Afficher toutes les invitations</span>
        <Switch bind:checked={showAllInvitations} />
      </label>
    </div>
    <div class="rounded-sm border bg-card shadow-sm">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Email</Table.Head>
            <Table.Head>Campus</Table.Head>
            <Table.Head>Rôle</Table.Head>
            <Table.Head>Invité par</Table.Head>
            <Table.Head class="text-right">Actions</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#if visibleInvitations.length === 0}
            <Table.Row>
              <Table.Cell colspan={5} class="text-center text-muted-foreground">
                {showAllInvitations
                  ? 'Aucune invitation en attente.'
                  : "Vous n'avez aucune invitation en attente."}
              </Table.Cell>
            </Table.Row>
          {:else}
            {#each visibleInvitations as inv}
              <Table.Row>
                <Table.Cell>
                  <div
                    class="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Mail class="h-3 w-3" />
                    {inv.email}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  {#if inv.staffRole === 'admin'}
                    <span class="text-muted-foreground">—</span>
                  {:else}
                    {inv.campus?.name ?? '—'}
                  {/if}
                </Table.Cell>
                <Table.Cell>
                  <Badge variant="secondary"
                    >{getStaffRoleLabel(inv.staffRole)}</Badge
                  >
                </Table.Cell>
                <Table.Cell class="text-sm text-muted-foreground">
                  {inv.invitedBy?.name ?? inv.invitedBy?.email ?? '—'}
                </Table.Cell>
                <Table.Cell class="text-right">
                  <form
                    method="POST"
                    action="?/cancelInvitation&id={inv.id}"
                    use:enhance={() => {
                      return async ({ update, result }) => {
                        if (result.type === 'success')
                          toast.success('Invitation annulée');
                        await update();
                      };
                    }}
                  >
                    <Tooltip.Provider delayDuration={300}>
                      <Tooltip.Root>
                        <Tooltip.Trigger>
                          {#snippet child({ props })}
                            <Button
                              {...props}
                              type="submit"
                              variant="ghost"
                              size="icon"
                              class="text-destructive hover:bg-destructive/10"
                            >
                              <X class="h-4 w-4" />
                            </Button>
                          {/snippet}
                        </Tooltip.Trigger>
                        <Tooltip.Content
                          ><p>Annuler l'invitation</p></Tooltip.Content
                        >
                      </Tooltip.Root>
                    </Tooltip.Provider>
                  </form>
                </Table.Cell>
              </Table.Row>
            {/each}
          {/if}
        </Table.Body>
      </Table.Root>
    </div>
  </section>

  <section class="space-y-2">
    <h2 class="font-heading text-lg tracking-wide uppercase">
      Membres actifs
      <span class="ml-2 text-sm text-muted-foreground"
        >({data.members?.length ?? 0})</span
      >
    </h2>
    <div class="rounded-sm border bg-card shadow-sm">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Utilisateur</Table.Head>
            <Table.Head>Email</Table.Head>
            <Table.Head>Campus</Table.Head>
            <Table.Head>Rôle</Table.Head>
            <Table.Head class="text-right">Actions</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.members ?? [] as user}
            <Table.Row>
              <Table.Cell>
                <div class="flex items-center gap-3">
                  <Avatar.Root class="h-8 w-8">
                    <Avatar.Image src={getAvatarUrl(user)} />
                    <Avatar.Fallback class="text-xs font-bold"
                      >{user.name?.substring(0, 2).toUpperCase() ||
                        'ST'}</Avatar.Fallback
                    >
                  </Avatar.Root>
                  <span class="font-bold">{user.name || 'Sans nom'}</span>
                </div>
              </Table.Cell>
              <Table.Cell>
                <div
                  class="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Mail class="h-3 w-3" />
                  <a
                    href="mailto:{user.email}"
                    class="transition-colors hover:text-epi-pink hover:underline"
                  >
                    {user.email}
                  </a>
                </div>
              </Table.Cell>
              <Table.Cell>
                {#if user.staffProfile?.staffRole === 'admin'}
                  <span class="text-sm text-muted-foreground">—</span>
                {:else}
                  <form
                    id="campus-form-{user.id}"
                    method="POST"
                    action="?/updateCampus"
                    use:enhance={() => {
                      submitting = `campus-${user.id}`;
                      return async ({ update, result }) => {
                        if (result.type === 'success')
                          toast.success('Campus mis à jour');
                        await update();
                        submitting = null;
                      };
                    }}
                  >
                    <input type="hidden" name="userId" value={user.id} />
                    <Select.Root
                      type="single"
                      name="campusId"
                      value={user.staffProfile?.campusId ?? ''}
                      onValueChange={(v) => {
                        if (!mounted) return;
                        if (submitting) return;
                        if (v === (user.staffProfile?.campusId ?? '')) return;
                        requestAnimationFrame(() => {
                          const form = document.querySelector<HTMLFormElement>(
                            `#campus-form-${user.id}`,
                          );
                          form?.requestSubmit();
                        });
                      }}
                    >
                      <Select.Trigger class="h-8 w-40 text-xs">
                        {user.staffProfile?.campus?.name || 'Aucun campus'}
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="">Aucun campus</Select.Item>
                        {#each data.campuses ?? [] as c}
                          <Select.Item value={c.id}>{c.name}</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  </form>
                {/if}
              </Table.Cell>
              <Table.Cell>
                <form
                  id="role-form-{user.id}"
                  method="POST"
                  action="?/updateRole"
                  use:enhance={() => {
                    submitting = `role-${user.id}`;
                    return async ({ update, result }) => {
                      if (result.type === 'success')
                        toast.success('Rôle mis à jour');
                      await update();
                      submitting = null;
                    };
                  }}
                >
                  <input type="hidden" name="userId" value={user.id} />
                  <Select.Root
                    type="single"
                    name="staffRole"
                    value={user.staffProfile?.staffRole ?? ''}
                    onValueChange={(v) => {
                      if (!mounted) return;
                      if (submitting) return;
                      if (v === (user.staffProfile?.staffRole ?? '')) return;
                      requestAnimationFrame(() => {
                        const form = document.querySelector<HTMLFormElement>(
                          `#role-form-${user.id}`,
                        );
                        form?.requestSubmit();
                      });
                    }}
                  >
                    <Select.Trigger class="h-8 w-36 text-xs">
                      {getStaffRoleLabel(user.staffProfile?.staffRole)}
                    </Select.Trigger>
                    <Select.Content class="min-w-72">
                      <Select.Item value="">Aucun rôle</Select.Item>
                      {#each STAFF_ROLES as role}
                        <Select.Item value={role.value} class="py-2">
                          <div class="flex flex-col gap-0.5">
                            <span class="text-xs font-semibold"
                              >{role.label}</span
                            >
                            <span
                              class="text-[11px] leading-snug text-muted-foreground"
                              >{role.description}</span
                            >
                          </div>
                        </Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </form>
              </Table.Cell>
              <Table.Cell class="text-right">
                <Tooltip.Provider delayDuration={300}>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}
                        <Button
                          {...props}
                          variant="ghost"
                          size="icon"
                          class="text-destructive hover:bg-destructive/10"
                          onclick={() => confirmDelete(user.id)}
                        >
                          <Trash2 class="h-4 w-4" />
                        </Button>
                      {/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content><p>Révoquer l'accès</p></Tooltip.Content>
                  </Tooltip.Root>
                </Tooltip.Provider>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  </section>

  <ConfirmDeleteDialog
    bind:open={deleteDialogOpen}
    action="?/deleteUser&id={userToDelete}"
    title="Révoquer l'accès"
    description="Êtes-vous sûr de vouloir supprimer ce membre du Staff ? Il perdra l'accès à l'application."
  />

  <Dialog.Root bind:open={inviteOpen}>
    <Dialog.Content class="sm:max-w-md">
      <Dialog.Header>
        <Dialog.Title>Inviter un membre</Dialog.Title>
        <Dialog.Description>
          L'utilisateur pourra se connecter avec Microsoft une fois invité. Le
          campus et le rôle sont déjà définis ici.
        </Dialog.Description>
      </Dialog.Header>
      <form method="POST" action="?/invite" use:inviteEnhance class="space-y-4">
        <div class="space-y-2">
          <Label for="invite-email">Email Epitech</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            bind:value={$inviteForm.email}
            placeholder="prenom.nom@epitech.eu"
            autocomplete="off"
          />
          {#if $inviteErrors.email}
            <p class="text-xs text-destructive">{$inviteErrors.email}</p>
          {/if}
        </div>

        {#if $inviteForm.staffRole !== 'admin'}
          <div class="space-y-2">
            <Label for="invite-campus">Campus</Label>
            <Select.Root
              type="single"
              name="campusId"
              bind:value={$inviteForm.campusId}
            >
              <Select.Trigger id="invite-campus" class="w-full">
                {data.campuses?.find((c) => c.id === $inviteForm.campusId)
                  ?.name ?? 'Sélectionner un campus'}
              </Select.Trigger>
              <Select.Content>
                {#each data.campuses ?? [] as c}
                  <Select.Item value={c.id}>{c.name}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            {#if $inviteErrors.campusId}
              <p class="text-xs text-destructive">{$inviteErrors.campusId}</p>
            {/if}
          </div>
        {/if}

        <div class="space-y-2">
          <Label for="invite-role">Rôle</Label>
          <Select.Root
            type="single"
            name="staffRole"
            bind:value={$inviteForm.staffRole}
          >
            <Select.Trigger id="invite-role" class="w-full">
              {getStaffRoleLabel($inviteForm.staffRole)}
            </Select.Trigger>
            <Select.Content class="min-w-72">
              {#each STAFF_ROLES as role}
                <Select.Item value={role.value} class="py-2">
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xs font-semibold">{role.label}</span>
                    <span class="text-[11px] leading-snug text-muted-foreground"
                      >{role.description}</span
                    >
                  </div>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          {#if $inviteErrors.staffRole}
            <p class="text-xs text-destructive">{$inviteErrors.staffRole}</p>
          {/if}
        </div>

        <Dialog.Footer>
          <Button
            type="button"
            variant="ghost"
            onclick={() => (inviteOpen = false)}>Annuler</Button
          >
          <Button type="submit">Inviter</Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>
</div>
