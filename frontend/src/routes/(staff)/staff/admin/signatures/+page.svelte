<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Plus from '@lucide/svelte/icons/plus';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Signature from '@lucide/svelte/icons/signature';
  import Globe from '@lucide/svelte/icons/globe';
  import Building2 from '@lucide/svelte/icons/building-2';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { toast } from 'svelte-sonner';
  import ConfirmDeleteDialog from '$lib/components/admin/ConfirmDeleteDialog.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import SearchableSelect, {
    type SelectOption,
  } from '$lib/components/staff/SearchableSelect.svelte';

  type Signatory = {
    id: string;
    campusId: string | null;
    name: string;
    role: string;
    position: number;
    updatedAt: Date;
  };

  let { data } = $props();

  const GLOBAL_VALUE = '__global__';

  // Group signatories: global ones first, then one bucket per campus. A campus
  // diploma prints its own signatories plus every global one, so we surface both
  // contexts side by side.
  const globalSignatories = $derived(
    data.signatories.filter((s) => s.campusId === null),
  );
  const campusGroups = $derived(
    data.campuses.map((c) => ({
      campus: c,
      signatories: data.signatories.filter((s) => s.campusId === c.id),
    })),
  );
  const campusOptions: SelectOption[] = $derived(
    data.campuses.map((c) => ({ value: c.id, label: c.name })),
  );

  // Dialog + form state.
  let open = $state(false);
  let isEditing = $state(false);
  let submitting = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  let editId = $state('');
  let fName = $state('');
  let fRole = $state('');
  let fCampus = $state<string>(GLOBAL_VALUE);
  let fPosition = $state(0);

  let deleteDialogOpen = $state(false);
  let itemToDelete = $state<string | null>(null);

  function openCreate(campusId: string | null) {
    isEditing = false;
    editId = '';
    fName = '';
    fRole = '';
    fCampus = campusId ?? GLOBAL_VALUE;
    fPosition = 0;
    if (fileInput) fileInput.value = '';
    open = true;
  }

  function openEdit(s: Signatory) {
    isEditing = true;
    editId = s.id;
    fName = s.name;
    fRole = s.role;
    fCampus = s.campusId ?? GLOBAL_VALUE;
    fPosition = s.position;
    if (fileInput) fileInput.value = '';
    open = true;
  }

  function confirmDelete(id: string) {
    itemToDelete = id;
    deleteDialogOpen = true;
  }
</script>

<svelte:head>
  <title>Signataires</title>
</svelte:head>

{#snippet signatoryCard(s: Signatory)}
  <div class="flex items-center gap-4 rounded-sm border bg-card p-3 shadow-sm">
    <div
      class="flex h-16 w-28 shrink-0 items-center justify-center rounded-sm border bg-white"
    >
      <img
        src="/api/signatures/{s.id}?v={s.updatedAt.getTime()}"
        alt="Signature de {s.name}"
        class="max-h-14 max-w-24 object-contain"
      />
    </div>
    <div class="min-w-0 flex-1">
      <p class="truncate font-bold">{s.name}</p>
      <p class="truncate text-sm text-muted-foreground">{s.role}</p>
    </div>
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon"
              onclick={() => openEdit(s)}
            >
              <Pencil class="h-4 w-4" />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content><p>Modifier</p></Tooltip.Content>
      </Tooltip.Root>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon"
              class="text-destructive hover:text-destructive"
              onclick={() => confirmDelete(s.id)}
            >
              <Trash2 class="h-4 w-4" />
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content><p>Supprimer</p></Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  </div>
{/snippet}

<div class="space-y-8">
  <PageHeader
    title="Signataires"
    accent="Diplômes"
    subtitle="Signatures imprimées sur les certificats de stage"
  >
    {#snippet actions()}
      <Button onclick={() => openCreate(null)}>
        <Plus class="mr-2 h-4 w-4" /> Ajouter
      </Button>
    {/snippet}
  </PageHeader>

  <!-- Signataires globaux -->
  <section class="space-y-3">
    <div class="flex items-center gap-2">
      <Globe class="h-5 w-5 text-epi-tomorrow" />
      <h2 class="font-heading text-display-s">Globaux</h2>
      <span class="text-xs text-muted-foreground">
        Appliqués à tous les campus
      </span>
    </div>
    {#if globalSignatories.length === 0}
      <p
        class="rounded-sm border border-dashed bg-muted/10 p-6 text-center text-sm text-muted-foreground"
      >
        Aucun signataire global. Ajoutez par exemple la Direction Générale.
      </p>
    {:else}
      <div class="grid gap-3 md:grid-cols-2">
        {#each globalSignatories as s (s.id)}
          {@render signatoryCard(s)}
        {/each}
      </div>
    {/if}
  </section>

  <!-- Par campus -->
  {#each campusGroups as group (group.campus.id)}
    <section class="space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Building2 class="h-5 w-5 text-muted-foreground" />
          <h2 class="font-heading text-display-s">
            {group.campus.name}
          </h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onclick={() => openCreate(group.campus.id)}
        >
          <Plus class="mr-1.5 h-4 w-4" /> Ajouter
        </Button>
      </div>
      {#if group.signatories.length === 0}
        <p
          class="rounded-sm border border-dashed bg-muted/10 p-4 text-center text-xs text-muted-foreground"
        >
          Aucun signataire local. Seuls les signataires globaux apparaîtront.
        </p>
      {:else}
        <div class="grid gap-3 md:grid-cols-2">
          {#each group.signatories as s (s.id)}
            {@render signatoryCard(s)}
          {/each}
        </div>
      {/if}
    </section>
  {/each}

  <!-- Create / edit dialog -->
  <Dialog.Root bind:open>
    <Dialog.Content class="sm:max-w-lg">
      <Dialog.Header>
        <Dialog.Title>
          {isEditing ? 'Modifier' : 'Nouveau'} signataire
        </Dialog.Title>
      </Dialog.Header>
      <form
        method="POST"
        action={isEditing ? '?/update' : '?/create'}
        enctype="multipart/form-data"
        use:enhance={() => {
          submitting = true;
          return async ({ result }) => {
            submitting = false;
            if (result.type === 'success') {
              open = false;
              toast.success('Signataire enregistré.');
              await invalidateAll();
            } else if (result.type === 'failure') {
              toast.error(
                (result.data as { message?: string })?.message ||
                  'Erreur lors de l’enregistrement.',
              );
            }
          };
        }}
        class="space-y-4 py-2"
      >
        {#if isEditing}<input type="hidden" name="id" value={editId} />{/if}
        <input
          type="hidden"
          name="campusId"
          value={fCampus === GLOBAL_VALUE ? '' : fCampus}
        />

        <div class="space-y-2">
          <Label>Périmètre</Label>
          <SearchableSelect
            options={campusOptions}
            value={fCampus === GLOBAL_VALUE ? 'all' : fCampus}
            onChange={(v) => (fCampus = v === 'all' ? GLOBAL_VALUE : v)}
            allLabel="Global (tous les campus)"
            placeholder="Global (tous les campus)"
            searchPlaceholder="Rechercher un campus…"
            emptyLabel="Aucun campus."
            triggerClass="w-full"
          />
        </div>

        <div class="space-y-2">
          <Label>Nom (Prénom Nom)</Label>
          <Input
            name="name"
            bind:value={fName}
            placeholder="Ex: Marie Dupont"
          />
        </div>

        <div class="space-y-2">
          <Label>Fonction</Label>
          <Input
            name="role"
            bind:value={fRole}
            placeholder="Ex: Directrice Générale"
          />
        </div>

        <div class="space-y-2">
          <Label>Ordre d’affichage</Label>
          <Input type="number" name="position" bind:value={fPosition} min="0" />
          <p class="text-xs text-muted-foreground">
            Plus petit = affiché en premier sur le diplôme.
          </p>
        </div>

        <div class="space-y-2">
          <Label>Image de signature (PNG, JPEG ou WebP, 5 Mo max)</Label>
          <input
            bind:this={fileInput}
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/webp"
            class="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-sm file:border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          {#if isEditing}
            <p class="text-xs text-muted-foreground">
              Laissez vide pour conserver l’image actuelle.
            </p>
          {/if}
        </div>

        <Dialog.Footer class="mt-4">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <ConfirmDeleteDialog
    bind:open={deleteDialogOpen}
    action="?/delete&id={itemToDelete}"
    title="Supprimer le signataire"
    description="Êtes-vous sûr ? La signature sera définitivement supprimée."
  />
</div>
