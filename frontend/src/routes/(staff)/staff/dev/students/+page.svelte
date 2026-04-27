<script lang="ts">
  import type { PageData } from './$types';
  import { superForm } from 'sveltekit-superforms';
  import {
    Funnel,
    Ellipsis,
    Pencil,
    Trash2,
    Search,
    Eye,
    Users,
    SignalLow,
    SignalMedium,
    SignalHigh,
    ChevronLeft,
    ChevronRight,
  } from '@lucide/svelte';
  import { buttonVariants, Button } from '$lib/components/ui/button';
  import * as Table from '$lib/components/ui/table';
  import * as Select from '$lib/components/ui/select';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import { untrack } from 'svelte';
  import { resolve } from '$app/paths';
  import { cn } from '$lib/utils';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import StudentAvatarItem from '$lib/components/students/StudentAvatarItem.svelte';
  import StudentFormDialog from './components/StudentFormDialog.svelte';
  import { can } from '$lib/domain/permissions';

  let { data }: { data: PageData } = $props();
  const canDelete = $derived(can('devLead', data.staffProfile?.staffRole));

  const { form, errors, delayed, enhance, reset } = superForm(
    untrack(() => data.form),
    {
      onResult: ({ result }) => {
        if (result.type === 'success') {
          open = false;
          toast.success(result.data?.form.message);
        } else if (result.type === 'failure') {
          toast.error(result.data?.form.message || 'Erreur de validation');
        }
      },
    },
  );

  let open = $state(false);
  let isEditing = $state(false);
  let editId = $state('');
  let searchQuery = $state(page.url.searchParams.get('q') || '');
  let selectedLevel = $state(page.url.searchParams.get('niveau') || 'all');
  let deleteDialogOpen = $state(false);
  let studentToDelete = $state<string | null>(null);
  let searchTimeout: ReturnType<typeof setTimeout>;

  function navigateWithParams(params: Record<string, string>) {
    const url = new URL(page.url);
    url.searchParams.delete('page');
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    goto(url.toString(), { keepFocus: true });
  }

  function handleFilterChange(value: string) {
    selectedLevel = value;
    navigateWithParams({ niveau: value === 'all' ? '' : value });
  }

  function handleSearchInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    searchQuery = value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => navigateWithParams({ q: value }), 300);
  }

  function openEdit(student: any) {
    reset();
    $form.nom = student.nom;
    $form.prenom = student.prenom;
    $form.email = student.user?.email || '';
    $form.phone = student.phone || '';
    $form.parent_email = student.parentEmail || '';
    $form.parent_phone = student.parentPhone || '';
    $form.niveau = student.niveau;
    $form.niveau_difficulte = student.niveauDifficulte || 'Débutant';
    isEditing = true;
    editId = student.id;
    open = true;
  }

  function goToPage(p: number) {
    const url = new URL(page.url);
    if (p > 1) url.searchParams.set('page', String(p));
    else url.searchParams.delete('page');
    goto(url.toString());
  }

  function confirmDelete(id: string) {
    studentToDelete = id;
    deleteDialogOpen = true;
  }

  function getDifficultyColor(diff: string) {
    switch (diff) {
      case 'Débutant':
        return 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/30 dark:bg-green-900/20 dark:text-green-400';
      case 'Intermédiaire':
        return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/20 dark:text-blue-400';
      case 'Avancé':
        return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/30 dark:bg-purple-900/20 dark:text-purple-400';
      default:
        return 'border-border text-muted-foreground';
    }
  }

  const niveaux = [
    '6eme',
    '5eme',
    '4eme',
    '3eme',
    '2nde',
    '1ere',
    'Terminale',
    'Sup',
  ];
</script>

<div class="space-y-6">
  <PageHeader
    title="Talents"
    subtitle="Annuaire et progression des Talents du campus."
  />

  <div class="flex items-center gap-2">
    <!-- Search Input -->
    <div class="relative w-full max-w-50">
      <Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Rechercher..."
        class="rounded-sm bg-white pl-9"
        value={searchQuery}
        oninput={handleSearchInput}
      />
    </div>
    <!-- Level Filter -->
    <div class="w-45">
      <Select.Root
        type="single"
        value={selectedLevel}
        onValueChange={handleFilterChange}
      >
        <Select.Trigger>
          <Funnel class="mr-2 h-4 w-4 text-muted-foreground" />
          {selectedLevel === 'all' ? 'Tous les niveaux' : selectedLevel}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="all">Tous les niveaux</Select.Item>
          {#each niveaux as niveau}<Select.Item value={niveau}
              >{niveau}</Select.Item
            >{/each}
        </Select.Content>
      </Select.Root>
    </div>

    <StudentFormDialog
      bind:open
      {isEditing}
      {editId}
      {form}
      {errors}
      {delayed}
      {enhance}
      action="?/update"
    />

    <ConfirmDeleteDialog
      bind:open={deleteDialogOpen}
      action="?/delete&id={studentToDelete}"
      title="Supprimer le Talent"
      description="Êtes-vous sûr ? Cette action est définitive."
      buttonText="Supprimer"
    />
  </div>

  {#if data.students.length > 0}
    <div
      class="rounded-sm border bg-card shadow-sm dark:border-border/50 dark:shadow-none"
    >
      <Table.Root>
        <Table.Header class="bg-muted/50">
          <Table.Row>
            <Table.Head class="w-60 text-xs font-bold uppercase"
              >Talent</Table.Head
            >
            <Table.Head class="text-xs font-bold uppercase">Niveau</Table.Head>
            <Table.Head class="hidden text-xs font-bold uppercase sm:table-cell"
              >Difficulté</Table.Head
            >
            <Table.Head class="text-right text-xs font-bold uppercase"
              >XP / Événements</Table.Head
            >
            <Table.Head class="w-12.5"></Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.students as student (student.id)}
            {@const diff = student.niveauDifficulte || 'Débutant'}
            <Table.Row class="hover:bg-muted/30">
              <Table.Cell class="font-bold">
                <a
                  href={resolve(`/staff/dev/students/${student.id}`)}
                  class="group block"
                >
                  <StudentAvatarItem {student} showBadge={false} />
                </a>
              </Table.Cell>
              <Table.Cell>
                <Badge
                  variant="secondary"
                  class="rounded-sm bg-epi-blue/5 px-2 py-0 text-[10px] font-bold text-epi-blue uppercase"
                >
                  {student.niveau}
                </Badge>
              </Table.Cell>
              <Table.Cell class="hidden sm:table-cell">
                <Badge
                  variant="outline"
                  class={cn(
                    'text-[9px] font-bold uppercase',
                    getDifficultyColor(diff),
                  )}
                >
                  {#if diff === 'Débutant'}<SignalLow
                      class="mr-1 h-3 w-3"
                    />{:else if diff === 'Intermédiaire'}<SignalMedium
                      class="mr-1 h-3 w-3"
                    />{:else}<SignalHigh class="mr-1 h-3 w-3" />{/if}
                  {diff}
                </Badge>
              </Table.Cell>
              <Table.Cell class="text-right text-muted-foreground">
                <div class="flex flex-col items-end">
                  <span class="font-black text-foreground">{student.xp} XP</span
                  >
                  <span class="text-[10px] font-bold tracking-widest uppercase"
                    >{student.eventsCount} événement{student.eventsCount > 1
                      ? 's'
                      : ''}</span
                  >
                </div>
              </Table.Cell>
              <Table.Cell>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger
                    class={buttonVariants({ variant: 'ghost', size: 'icon' })}
                    ><Ellipsis class="h-4 w-4" /></DropdownMenu.Trigger
                  >
                  <DropdownMenu.Content align="end">
                    <a
                      href={resolve(`/staff/dev/students/${student.id}`)}
                      class="relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground"
                    >
                      <Eye class="mr-2 h-4 w-4 text-epi-blue" /> Voir le dossier
                    </a>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item onclick={() => openEdit(student)}
                      ><Pencil class="mr-2 h-4 w-4" /> Modifier</DropdownMenu.Item
                    >
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item
                      class="cursor-pointer text-destructive"
                      disabled={!canDelete}
                      onclick={() => canDelete && confirmDelete(student.id)}
                    >
                      <Trash2 class="mr-2 h-4 w-4" /> Supprimer
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>

    <!-- Pagination -->
    {#if data.totalPages > 1}
      <div class="flex items-center justify-between">
        <p class="text-sm text-muted-foreground">
          {data.totalItems} Talent{data.totalItems > 1 ? 's' : ''} au total
        </p>
        <div class="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            disabled={data.currentPage <= 1}
            onclick={() => goToPage(data.currentPage - 1)}
          >
            <ChevronLeft class="h-4 w-4" />
          </Button>
          <span class="px-3 text-sm text-muted-foreground">
            {data.currentPage} / {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            disabled={data.currentPage >= data.totalPages}
            onclick={() => goToPage(data.currentPage + 1)}
          >
            <ChevronRight class="h-4 w-4" />
          </Button>
        </div>
      </div>
    {/if}
  {:else}
    <EmptyState
      icon={Users}
      title="Salle de classe vide"
      description="Aucun Talent ne correspond à cette recherche.<br/>Ils sont peut-être partis à la cafétéria ?"
    />
  {/if}
</div>
