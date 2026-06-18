<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { SvelteSet } from 'svelte/reactivity';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Mail from '@lucide/svelte/icons/mail';
  import Plus from '@lucide/svelte/icons/plus';
  import X from '@lucide/svelte/icons/x';
  import LogIn from '@lucide/svelte/icons/log-in';
  import Users from '@lucide/svelte/icons/users';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Table from '$lib/components/ui/table';
  import * as Select from '$lib/components/ui/select';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as Avatar from '$lib/components/ui/avatar';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { Badge } from '$lib/components/ui/badge';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import ConfirmDeleteDialog from '$lib/components/admin/ConfirmDeleteDialog.svelte';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import Pagination from '$lib/components/staff/datatable/Pagination.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import type { ColumnDef } from '$lib/components/staff/datatable/types';
  import { STAFF_ROLES, getStaffRoleLabel } from '$lib/domain/staff';
  import type { StaffRole } from '@prisma/client';
  import { track, errReason } from '$lib/analytics';
  let { data } = $props();

  type MemberRow = (typeof data)['members'][number];
  type InvitationRow = (typeof data)['invitations'][number];

  let submitting = $state<string | null>(null);
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });

  let deleteDialogOpen = $state(false);
  let userToDelete = $state<string | null>(null);

  // ----- Invitations: search + sort + bulk selection -----------------------
  let inviteSearch = $state('');
  let inviteSortKey = $state<string | null>('createdAt');
  let inviteSortDir = $state<'asc' | 'desc'>('desc');
  const selectedInvites = new SvelteSet<string>();
  let bulkCancelOpen = $state(false);
  let bulkCancelling = $state(false);

  const filteredInvites = $derived(
    data.invitations.filter((i) =>
      i.email.toLowerCase().includes(inviteSearch.trim().toLowerCase()),
    ),
  );
  const sortedInvites = $derived.by(() => {
    const dir = inviteSortDir === 'asc' ? 1 : -1;
    return [...filteredInvites].sort(
      (a, b) => dir * compareInvite(a, b, inviteSortKey),
    );
  });
  function compareInvite(
    a: InvitationRow,
    b: InvitationRow,
    key: string | null,
  ): number {
    switch (key) {
      case 'email':
        return a.email.localeCompare(b.email, 'fr');
      case 'role':
        return (a.staffRole ?? '').localeCompare(b.staffRole ?? '', 'fr');
      case 'createdAt':
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      default:
        return 0;
    }
  }
  function toggleInviteSort(key: string) {
    if (inviteSortKey === key)
      inviteSortDir = inviteSortDir === 'asc' ? 'desc' : 'asc';
    else {
      inviteSortKey = key;
      inviteSortDir = 'asc';
    }
  }

  const inviteColumns: ColumnDef[] = [
    { key: 'email', label: 'Email', sortable: true },
    { key: 'campus', label: 'Campus' },
    { key: 'role', label: 'Rôle', sortable: true },
    { key: 'invitedBy', label: 'Invité par' },
    { key: 'createdAt', label: 'Âge', sortable: true },
    { key: 'actions', label: 'Actions', align: 'right' },
  ];

  function relativeAge(date: string | Date): string {
    const days = Math.floor(
      (Date.now() - new Date(date).getTime()) / 86_400_000,
    );
    if (days < 1) return "Aujourd'hui";
    if (days === 1) return 'Hier';
    if (days < 30) return `Il y a ${days} j`;
    if (days < 365) return `Il y a ${Math.floor(days / 30)} mois`;
    const years = Math.floor(days / 365);
    return `Il y a ${years} an${years > 1 ? 's' : ''}`;
  }

  // ----- Members: search + sort --------------------------------------------
  // Initial query lets the command palette deep-link here (staff → users?q=…).
  let memberSearch = $state(page.url.searchParams.get('q') ?? '');
  let memberSortKey = $state<string | null>('name');
  let memberSortDir = $state<'asc' | 'desc'>('asc');

  const memberName = (u: MemberRow) => u.name || '';
  const filteredMembers = $derived(
    data.members.filter((u) => {
      const q = memberSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        (u.name ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
      );
    }),
  );
  const sortedMembers = $derived.by(() => {
    const dir = memberSortDir === 'asc' ? 1 : -1;
    return [...filteredMembers].sort(
      (a, b) => dir * compareMember(a, b, memberSortKey),
    );
  });
  function compareMember(
    a: MemberRow,
    b: MemberRow,
    key: string | null,
  ): number {
    switch (key) {
      case 'name':
        return memberName(a).localeCompare(memberName(b), 'fr');
      case 'email':
        return (a.email ?? '').localeCompare(b.email ?? '', 'fr');
      default:
        return 0;
    }
  }
  function toggleMemberSort(key: string) {
    if (memberSortKey === key)
      memberSortDir = memberSortDir === 'asc' ? 'desc' : 'asc';
    else {
      memberSortKey = key;
      memberSortDir = 'asc';
    }
  }

  const memberColumns: ColumnDef[] = [
    { key: 'name', label: 'Utilisateur', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'campus', label: 'Campus' },
    { key: 'role', label: 'Rôle' },
    { key: 'actions', label: 'Actions', align: 'right' },
  ];

  // ----- Pagination ---------------------------------------------------------
  // Both lists grow (invitations especially — stale ones pile up), and they
  // stack, so an unpaginated invitations table buries the members roster below
  // it. Page each so neither runs long; searching resets to page 1.
  const PER_PAGE = 10;
  let invitePage = $state(1);
  let memberPage = $state(1);
  const inviteTotalPages = $derived(Math.ceil(sortedInvites.length / PER_PAGE));
  const pagedInvites = $derived(
    sortedInvites.slice((invitePage - 1) * PER_PAGE, invitePage * PER_PAGE),
  );
  const memberTotalPages = $derived(Math.ceil(sortedMembers.length / PER_PAGE));
  const pagedMembers = $derived(
    sortedMembers.slice((memberPage - 1) * PER_PAGE, memberPage * PER_PAGE),
  );

  // Keep the members search in sync with `?q` on navigation: when the command
  // palette deep-links here while already on this page, the component isn't
  // remounted, so the $state initializer above won't see the new query. Typing
  // in the search box doesn't touch the URL, so this only fires on navigation.
  $effect(() => {
    const q = page.url.searchParams.get('q');
    if (q !== null) {
      memberSearch = q;
      memberPage = 1;
    }
  });

  // ----- Invite dialog ------------------------------------------------------
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
          track('admin_invitation_sent', {
            role: $inviteForm.staffRole,
            campus: $inviteForm.campusId ?? null,
          });
          inviteOpen = false;
          toast.success(result.data?.form?.message || 'Invitation envoyée');
        } else if (result.type === 'failure' && result.data?.form?.message) {
          track('admin_invitation_failed', {
            role: $inviteForm.staffRole,
            reason: errReason(result),
          });
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

  // ----- Impersonation (unified endpoint) ----------------------------------
  let impersonating = $state<string | null>(null);

  async function loginAs(
    userId: string,
    staffRole: StaffRole | null,
    targetCampus: string | null,
  ) {
    if (impersonating) return;
    impersonating = userId;
    try {
      const res = await fetch(resolve('/staff/admin/impersonate'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'staff', id: userId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        track('impersonation_failed', {
          reason: `http_${res.status}`,
          targetRole: staffRole ?? 'unknown',
        });
        toast.error(body?.message ?? 'Impersonation refusée.');
        return;
      }
      const { redirect } = (await res.json()) as { redirect: string };
      track('impersonation_started', {
        targetRole: staffRole ?? 'unknown',
        targetAccountType: staffRole ? 'staff' : 'talent',
        targetCampus,
      });
      // Full-page navigation so the new session cookie is read fresh and route
      // guards re-evaluate.
      window.location.href = redirect;
    } catch (err) {
      console.error(err);
      track('impersonation_failed', {
        reason: errReason(err),
        targetRole: staffRole ?? 'unknown',
      });
      toast.error("Erreur lors de l'impersonation.");
    } finally {
      impersonating = null;
    }
  }
</script>

<svelte:head>
  <title>Utilisateurs</title>
</svelte:head>

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

  <!-- Invitations -->
  <section class="space-y-3">
    <h2 class="font-heading text-lg tracking-wide uppercase">
      Invitations en attente
      <span class="ml-2 text-sm text-muted-foreground"
        >({data.invitations.length})</span
      >
    </h2>

    <DataTableToolbar
      searchValue={inviteSearch}
      onSearchInput={(v) => {
        inviteSearch = v;
        invitePage = 1;
      }}
      searchPlaceholder="Rechercher un email…"
      count={sortedInvites.length}
      countNoun="invitation"
    >
      {#snippet countActions()}
        {#if selectedInvites.size > 0}
          <Button
            variant="destructive"
            size="sm"
            class="h-7 gap-1.5"
            onclick={() => (bulkCancelOpen = true)}
          >
            <X class="h-3.5 w-3.5" />
            Annuler la sélection ({selectedInvites.size})
          </Button>
        {/if}
      {/snippet}
    </DataTableToolbar>

    <SortableTable
      columns={inviteColumns}
      rows={pagedInvites}
      sortKey={inviteSortKey}
      sortDir={inviteSortDir}
      onSort={toggleInviteSort}
      rowKey={(i) => i.id}
      selectable
      selected={selectedInvites}
    >
      {#snippet row(inv)}
        <Table.Cell>
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
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
          <Badge variant="secondary">{getStaffRoleLabel(inv.staffRole)}</Badge>
        </Table.Cell>
        <Table.Cell class="text-sm text-muted-foreground">
          {inv.invitedBy?.name ?? inv.invitedBy?.email ?? '—'}
        </Table.Cell>
        <Table.Cell class="text-sm text-muted-foreground">
          {relativeAge(inv.createdAt)}
        </Table.Cell>
        <Table.Cell class="text-right">
          <form
            method="POST"
            action="?/cancelInvitation&id={inv.id}"
            class="inline"
            use:enhance={() => {
              return async ({ update, result }) => {
                if (result.type === 'success') {
                  track('admin_invitation_cancelled');
                  toast.success('Invitation annulée');
                }
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
                <Tooltip.Content><p>Annuler l'invitation</p></Tooltip.Content>
              </Tooltip.Root>
            </Tooltip.Provider>
          </form>
        </Table.Cell>
      {/snippet}

      {#snippet empty()}
        <EmptyState
          icon={Mail}
          title="Aucune invitation"
          description={inviteSearch
            ? 'Aucune invitation ne correspond à cette recherche.'
            : 'Aucune invitation en attente.'}
        />
      {/snippet}
    </SortableTable>

    <Pagination
      page={invitePage}
      totalPages={inviteTotalPages}
      onPageChange={(p) => (invitePage = p)}
    />
  </section>

  <!-- Members -->
  <section id="members" class="scroll-mt-20 space-y-3">
    <h2 class="font-heading text-lg tracking-wide uppercase">
      Membres actifs
      <span class="ml-2 text-sm text-muted-foreground"
        >({data.members.length})</span
      >
    </h2>

    <DataTableToolbar
      searchValue={memberSearch}
      onSearchInput={(v) => {
        memberSearch = v;
        memberPage = 1;
      }}
      searchPlaceholder="Rechercher un membre…"
      count={sortedMembers.length}
      countNoun="membre"
    />

    <SortableTable
      columns={memberColumns}
      rows={pagedMembers}
      sortKey={memberSortKey}
      sortDir={memberSortDir}
      onSort={toggleMemberSort}
      rowKey={(u) => u.id}
    >
      {#snippet row(user)}
        <Table.Cell>
          <div class="flex items-center gap-3">
            <Avatar.Root class="h-8 w-8">
              <Avatar.Image src={user.image ?? undefined} />
              <Avatar.Fallback class="text-xs font-bold"
                >{user.name?.substring(0, 2).toUpperCase() ||
                  'ST'}</Avatar.Fallback
              >
            </Avatar.Root>
            <span class="font-bold">{user.name || 'Sans nom'}</span>
          </div>
        </Table.Cell>
        <Table.Cell>
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
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
            {@const fromCampus = user.staffProfile?.campus?.name ?? null}
            <form
              id="campus-form-{user.id}"
              method="POST"
              action="?/updateCampus"
              use:enhance={() => {
                submitting = `campus-${user.id}`;
                const toCampus =
                  data.campuses?.find(
                    (c) =>
                      c.id ===
                      (document.querySelector<HTMLInputElement>(
                        `#campus-form-${user.id} input[name="campusId"]`,
                      )?.value ?? ''),
                  )?.name ?? null;
                return async ({ update, result }) => {
                  if (result.type === 'success') {
                    track('admin_user_campus_updated', {
                      fromCampus,
                      toCampus,
                    });
                    toast.success('Campus mis à jour');
                  }
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
          {@const fromRole = user.staffProfile?.staffRole ?? null}
          <form
            id="role-form-{user.id}"
            method="POST"
            action="?/updateRole"
            use:enhance={() => {
              submitting = `role-${user.id}`;
              const toRole =
                document.querySelector<HTMLInputElement>(
                  `#role-form-${user.id} input[name="staffRole"]`,
                )?.value ?? null;
              return async ({ update, result }) => {
                if (result.type === 'success') {
                  track('admin_user_role_updated', { fromRole, toRole });
                  toast.success('Rôle mis à jour');
                }
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
                      <span class="text-xs font-semibold">{role.label}</span>
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
          <div class="flex items-center justify-end gap-1">
            {#if user.id !== data.currentUserId && user.staffProfile?.staffRole && user.staffProfile.staffRole !== 'admin'}
              <Tooltip.Provider delayDuration={300}>
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        variant="ghost"
                        size="icon"
                        class="text-muted-foreground hover:text-epi-pink"
                        disabled={impersonating === user.id}
                        onclick={() =>
                          loginAs(
                            user.id,
                            user.staffProfile?.staffRole ?? null,
                            user.staffProfile?.campus?.name ?? null,
                          )}
                      >
                        <LogIn class="h-4 w-4" />
                      </Button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content
                    ><p>Se connecter en tant que ce membre</p></Tooltip.Content
                  >
                </Tooltip.Root>
              </Tooltip.Provider>
            {/if}
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
          </div>
        </Table.Cell>
      {/snippet}

      {#snippet empty()}
        <EmptyState
          icon={Users}
          title="Aucun membre"
          description={memberSearch
            ? 'Aucun membre ne correspond à cette recherche.'
            : 'Aucun membre staff.'}
        />
      {/snippet}
    </SortableTable>

    <Pagination
      page={memberPage}
      totalPages={memberTotalPages}
      onPageChange={(p) => (memberPage = p)}
    />
  </section>

  <ConfirmDeleteDialog
    bind:open={deleteDialogOpen}
    action="?/deleteUser&id={userToDelete}"
    title="Révoquer l'accès"
    description="Êtes-vous sûr de vouloir supprimer ce membre du Staff ? Il perdra l'accès à l'application."
  />

  <AlertDialog.Root bind:open={bulkCancelOpen}>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>Annuler les invitations</AlertDialog.Title>
        <AlertDialog.Description>
          {selectedInvites.size} invitation{selectedInvites.size > 1 ? 's' : ''}
          {selectedInvites.size > 1 ? 'seront supprimées' : 'sera supprimée'} définitivement.
          Les personnes concernées ne pourront plus se connecter avec ce lien.
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel disabled={bulkCancelling}>Retour</AlertDialog.Cancel
        >
        <form
          method="POST"
          action="?/cancelInvitationsBulk"
          use:enhance={() => {
            bulkCancelling = true;
            return async ({ update, result }) => {
              bulkCancelling = false;
              if (result.type === 'success') {
                track('admin_invitation_cancelled_bulk', {
                  count: selectedInvites.size,
                });
                toast.success('Invitations annulées');
                selectedInvites.clear();
                bulkCancelOpen = false;
              } else {
                toast.error('Échec de l’annulation.');
              }
              await update();
            };
          }}
        >
          {#each [...selectedInvites] as id (id)}
            <input type="hidden" name="ids" value={id} />
          {/each}
          <AlertDialog.Action type="submit" disabled={bulkCancelling}>
            Annuler la sélection
          </AlertDialog.Action>
        </form>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>

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
