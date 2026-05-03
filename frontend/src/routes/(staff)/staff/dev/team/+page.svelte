<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { Plus, Mail, X, LoaderCircle } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
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
  import { STAFF_ROLES, getStaffRoleLabel } from '$lib/domain/staff';

  let { data } = $props();

  const INVITABLE_ROLES = STAFF_ROLES.filter((r) => r.value !== 'admin');

  let submitting = $state<string | null>(null);
  let inviteOpen = $state(false);

  const {
    form: inviteForm,
    errors: inviteErrors,
    enhance: inviteEnhance,
    delayed: inviteDelayed,
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

<svelte:head>
  <title>Équipe du campus</title>
</svelte:head>

<div class="space-y-6 pb-12">
  <PageBreadcrumb
    items={[
      { label: 'Dashboard', href: resolve('/staff/dev') },
      { label: 'Équipe' },
    ]}
  />
  <div class="flex items-end justify-between gap-4">
    <div>
      <h1 class="font-heading text-3xl tracking-wide text-epi-blue uppercase">
        Équipe du campus<span class="text-epi-teal">_</span>
      </h1>
      <p
        class="mt-1 text-sm font-bold tracking-widest text-muted-foreground uppercase"
      >
        Inviter de nouveaux membres et ajuster leurs rôles
      </p>
    </div>
    <Button
      onclick={openInvite}
      class="gap-2 rounded-sm bg-epi-blue text-white shadow-sm hover:bg-epi-blue/90"
    >
      <Plus class="h-4 w-4" />
      Inviter
    </Button>
  </div>

  <section class="space-y-3">
    <h2
      class="flex items-center gap-2 font-sans text-base font-bold tracking-wide text-foreground uppercase"
    >
      Invitations en attente
      <span class="text-sm text-muted-foreground"
        >({data.invitations?.length ?? 0})</span
      >
    </h2>
    <div
      class="rounded-sm border bg-card shadow-sm dark:border-border/50 dark:shadow-none"
    >
      <Table.Root>
        <Table.Header class="bg-muted/30">
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
              <Table.Cell
                colspan={4}
                class="py-8 text-center text-muted-foreground"
              >
                Aucune invitation en attente.
              </Table.Cell>
            </Table.Row>
          {:else}
            {#each data.invitations as inv}
              <Table.Row class="hover:bg-muted/20">
                <Table.Cell>
                  <div
                    class="flex items-center gap-2 text-sm font-bold text-foreground"
                  >
                    <Mail class="h-4 w-4 text-muted-foreground" />
                    {inv.email}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <Badge
                    variant="secondary"
                    class="rounded-sm text-[9px] tracking-widest uppercase"
                    >{getStaffRoleLabel(inv.staffRole)}</Badge
                  >
                </Table.Cell>
                <Table.Cell class="text-sm font-medium text-muted-foreground">
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
                              class="rounded-sm text-destructive hover:bg-destructive/10"
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

  <section class="mt-8 space-y-3">
    <h2
      class="flex items-center gap-2 font-sans text-base font-bold tracking-wide text-foreground uppercase"
    >
      Membres actifs
      <span class="text-sm text-muted-foreground"
        >({data.members?.length ?? 0})</span
      >
    </h2>
    <div
      class="rounded-sm border bg-card shadow-sm dark:border-border/50 dark:shadow-none"
    >
      <Table.Root>
        <Table.Header class="bg-muted/30">
          <Table.Row>
            <Table.Head>Utilisateur</Table.Head>
            <Table.Head>Email</Table.Head>
            <Table.Head>Rôle</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#if (data.members?.length ?? 0) === 0}
            <Table.Row>
              <Table.Cell
                colspan={3}
                class="py-8 text-center text-muted-foreground"
              >
                Aucun membre pour ce campus.
              </Table.Cell>
            </Table.Row>
          {:else}
            {#each data.members as user}
              {@const currentRole = user.staffProfile?.staffRole ?? null}
              {@const isAdmin = currentRole === 'admin'}
              {@const nameParts = (user.name || 'Sans nom').trim().split(' ')}
              {@const lastName = nameParts[0]}
              {@const firstName = nameParts.slice(1).join(' ')}
              {@const initials =
                (
                  (lastName?.[0] ?? '') + (firstName?.[0] ?? '')
                ).toUpperCase() || 'ST'}
              <Table.Row class="hover:bg-muted/20">
                <Table.Cell>
                  <div class="flex items-center gap-3">
                    <Avatar.Root class="h-8 w-8 rounded-sm">
                      <Avatar.Fallback
                        class="bg-primary/10 text-[10px] font-bold text-primary"
                        >{initials}</Avatar.Fallback
                      >
                    </Avatar.Root>
                    <span
                      class="text-sm font-bold tracking-tight text-foreground"
                    >
                      <span class="uppercase">{lastName}</span
                      >{#if firstName}&nbsp;<span class="capitalize"
                          >{firstName}</span
                        >{/if}
                    </span>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <div
                    class="flex items-center gap-2 text-sm font-medium text-muted-foreground"
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
                    <Badge
                      variant="secondary"
                      class="rounded-sm text-[10px] tracking-wider uppercase"
                      >Admin</Badge
                    >
                  {:else}
                    <form
                      id="role-form-{user.id}"
                      method="POST"
                      action="?/updateMemberRole"
                      class="flex items-center gap-2"
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
                        <Select.Trigger
                          class="h-8 w-42 rounded-sm bg-background text-[10px] font-bold tracking-widest uppercase"
                        >
                          {getStaffRoleLabel(currentRole)}
                        </Select.Trigger>
                        <Select.Content class="min-w-72 rounded-sm">
                          {#each INVITABLE_ROLES as role}
                            <Select.Item value={role.value} class="py-2">
                              <div class="flex flex-col gap-0.5">
                                <span
                                  class="text-[11px] font-bold tracking-widest uppercase"
                                  >{role.label}</span
                                >
                                <span
                                  class="text-[10px] font-medium text-muted-foreground normal-case"
                                  >{role.description}</span
                                >
                              </div>
                            </Select.Item>
                          {/each}
                        </Select.Content>
                      </Select.Root>
                      {#if submitting === `role-${user.id}`}
                        <LoaderCircle
                          class="h-4 w-4 animate-spin text-epi-blue"
                        />
                      {/if}
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
    <Dialog.Content class="rounded-sm sm:max-w-md">
      <Dialog.Header>
        <Dialog.Title class="text-lg font-bold tracking-tight uppercase"
          >Inviter un membre</Dialog.Title
        >
        <Dialog.Description class="text-sm">
          Le membre rejoindra votre campus avec le rôle choisi dès sa première
          connexion.
        </Dialog.Description>
      </Dialog.Header>

      <form
        method="POST"
        action="?/invite"
        use:inviteEnhance
        class="space-y-6 py-2"
      >
        <div class="space-y-4 rounded-sm border bg-muted/10 p-5">
          <div class="space-y-2">
            <Label for="invite-email" class="text-xs font-bold uppercase"
              >Email Epitech</Label
            >
            <Input
              id="invite-email"
              name="email"
              type="email"
              bind:value={$inviteForm.email}
              placeholder="prenom.nom@epitech.eu"
              autocomplete="off"
              class="rounded-sm bg-background"
            />
            {#if $inviteErrors.email}
              <p class="text-xs text-destructive">{$inviteErrors.email}</p>
            {/if}
          </div>

          <div class="space-y-2">
            <div class="flex items-center gap-1.5">
              <Label for="invite-role" class="text-xs font-bold uppercase"
                >Rôle</Label
              >
            </div>
            <Select.Root
              type="single"
              name="staffRole"
              bind:value={$inviteForm.staffRole}
            >
              <Select.Trigger
                id="invite-role"
                class="w-full rounded-sm bg-background text-xs font-bold tracking-widest uppercase"
              >
                {getStaffRoleLabel($inviteForm.staffRole)}
              </Select.Trigger>
              <Select.Content class="min-w-72 rounded-sm">
                {#each INVITABLE_ROLES as role}
                  <Select.Item value={role.value} class="py-2">
                    <div class="flex flex-col gap-0.5">
                      <span
                        class="text-[10px] font-bold tracking-widest uppercase"
                        >{role.label}</span
                      >
                      <span
                        class="text-xs font-medium text-muted-foreground normal-case"
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
        </div>

        <Dialog.Footer>
          <Button
            type="button"
            variant="ghost"
            class="rounded-sm"
            onclick={() => (inviteOpen = false)}>Annuler</Button
          >
          <Button
            type="submit"
            disabled={$inviteDelayed}
            class="rounded-sm bg-epi-blue text-white shadow-sm hover:bg-epi-blue/90 dark:shadow-none"
          >
            {#if $inviteDelayed}
              <LoaderCircle class="mr-2 h-4 w-4 animate-spin" /> Envoi...
            {:else}
              Inviter
            {/if}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>
</div>
