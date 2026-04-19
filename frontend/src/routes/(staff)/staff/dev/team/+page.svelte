<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { Plus, Mail, X } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import * as Table from '$lib/components/ui/table';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as Avatar from '$lib/components/ui/avatar';
  import { Badge } from '$lib/components/ui/badge';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { getStaffRoleLabel } from '$lib/domain/staff';

  let { data } = $props();

  const INVITABLE_ROLES = [
    { value: 'superdev', label: 'SuperDev' },
    { value: 'dev', label: 'Dev' },
    { value: 'peda', label: 'Péda' },
    { value: 'manta', label: 'Manta' },
  ] as const;

  let submitting = $state<string | null>(null);
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
</script>

<div class="space-y-6 p-6">
  <div class="flex items-end justify-between gap-4">
    <div>
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        Équipe <span class="text-epi-pink">du campus</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        Inviter de nouveaux membres et ajuster leurs rôles
      </p>
    </div>
    <Button onclick={openInvite} class="gap-2">
      <Plus class="h-4 w-4" />
      Inviter
    </Button>
  </div>

  <section class="space-y-2">
    <h2 class="font-heading text-lg tracking-wide uppercase">
      Invitations en attente
      <span class="ml-2 text-sm text-muted-foreground"
        >({data.invitations?.length ?? 0})</span
      >
    </h2>
    <div class="rounded-sm border bg-card shadow-sm">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Email</Table.Head>
            <Table.Head>Rôle</Table.Head>
            <Table.Head>Invité par</Table.Head>
            <Table.Head class="text-right">Actions</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#if (data.invitations?.length ?? 0) === 0}
            <Table.Row>
              <Table.Cell colspan={4} class="text-center text-muted-foreground">
                Aucune invitation en attente.
              </Table.Cell>
            </Table.Row>
          {:else}
            {#each data.invitations as inv}
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
            <Table.Head>Rôle</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#if (data.members?.length ?? 0) === 0}
            <Table.Row>
              <Table.Cell colspan={3} class="text-center text-muted-foreground">
                Aucun membre pour ce campus.
              </Table.Cell>
            </Table.Row>
          {:else}
            {#each data.members as user}
              {@const currentRole = user.staffProfile?.staffRole ?? null}
              {@const isAdmin = currentRole === 'admin'}
              <Table.Row>
                <Table.Cell>
                  <div class="flex items-center gap-3">
                    <Avatar.Root class="h-8 w-8">
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
                  {#if isAdmin}
                    <Badge variant="secondary">Admin</Badge>
                  {:else}
                    <form
                      id="role-form-{user.id}"
                      method="POST"
                      action="?/updateMemberRole"
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
                        value={currentRole ?? ''}
                        onValueChange={(v) => {
                          if (submitting) return;
                          if (!v || v === (currentRole ?? '')) return;
                          requestAnimationFrame(() => {
                            const form =
                              document.querySelector<HTMLFormElement>(
                                `#role-form-${user.id}`,
                              );
                            form?.requestSubmit();
                          });
                        }}
                      >
                        <Select.Trigger class="h-8 w-36 text-xs">
                          {getStaffRoleLabel(currentRole)}
                        </Select.Trigger>
                        <Select.Content>
                          {#each INVITABLE_ROLES as role}
                            <Select.Item value={role.value}
                              >{role.label}</Select.Item
                            >
                          {/each}
                        </Select.Content>
                      </Select.Root>
                    </form>
                  {/if}
                </Table.Cell>
              </Table.Row>
            {/each}
          {/if}
        </Table.Body>
      </Table.Root>
    </div>
  </section>

  <Dialog.Root bind:open={inviteOpen}>
    <Dialog.Content class="sm:max-w-md">
      <Dialog.Header>
        <Dialog.Title>Inviter un membre</Dialog.Title>
        <Dialog.Description>
          Le membre rejoindra votre campus avec le rôle choisi dès sa première
          connexion.
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
            <Select.Content>
              {#each INVITABLE_ROLES as role}
                <Select.Item value={role.value}>{role.label}</Select.Item>
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
