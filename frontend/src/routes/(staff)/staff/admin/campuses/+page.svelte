<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { Plus, Pencil, Trash2, Map } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import * as Table from '$lib/components/ui/table';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { toast } from 'svelte-sonner';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { FEATURE_FLAGS, type FlagKey } from '$lib/domain/featureFlags';

  let { data } = $props();
  const flagDefs = Object.values(FEATURE_FLAGS);
  const defaultEnabledFlags = flagDefs
    .filter((f) => f.defaultEnabled)
    .map((f) => f.key as FlagKey);

  // Form handling logic
  const { form, errors, enhance, delayed, reset } = superForm(
    untrack(() => data.form),
    {
      onResult: ({ result }) => {
        if (result.type === 'success') {
          open = false;
          toast.success(result.data?.form?.message || 'Action réussie');
        }
      },
    },
  );

  // Dialog and edit state variables
  let open = $state(false);
  let isEditing = $state(false);
  let editId = $state('');

  // Deletion confirmation state
  let deleteDialogOpen = $state(false);
  let itemToDelete = $state<string | null>(null);

  function openCreate() {
    reset();
    $form.flags = [...defaultEnabledFlags];
    isEditing = false;
    editId = '';
    open = true;
  }

  function formatUtcOffset(iana: string): string {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      timeZoneName: 'shortOffset',
    });
    const offset =
      fmt.formatToParts(new Date()).find((p) => p.type === 'timeZoneName')
        ?.value ?? '';
    // "GMT" → "UTC", "GMT+2" → "UTC+2", "GMT-4" → "UTC-4"
    return offset.replace('GMT', 'UTC').replace(/^UTC$/, 'UTC+0');
  }

  const timezoneGroups = [
    {
      label: 'Europe & Afrique',
      zones: [
        { value: 'Europe/London', cities: 'Londres, Dublin, Dakar' },
        { value: 'Europe/Paris', cities: 'Paris, Bruxelles, Berlin' },
        { value: 'Europe/Athens', cities: 'Athènes, Helsinki, Bucarest' },
        { value: 'Europe/Istanbul', cities: 'Istanbul, Mayotte' },
      ],
    },
    {
      label: 'Outre-mer & Océan Indien',
      zones: [
        { value: 'Pacific/Tahiti', cities: 'Polynésie française' },
        { value: 'America/Martinique', cities: 'Martinique, Guadeloupe' },
        { value: 'America/Cayenne', cities: 'Guyane française' },
        { value: 'Indian/Reunion', cities: 'La Réunion, Maurice' },
        { value: 'Pacific/Noumea', cities: 'Nouvelle-Calédonie' },
      ],
    },
    {
      label: 'Amériques',
      zones: [
        { value: 'America/Los_Angeles', cities: 'Los Angeles, Vancouver' },
        { value: 'America/Denver', cities: 'Denver, Phoenix' },
        { value: 'America/Chicago', cities: 'Chicago, Mexico' },
        { value: 'America/New_York', cities: 'New York, Montréal, Lima' },
        { value: 'America/Sao_Paulo', cities: 'São Paulo, Buenos Aires' },
      ],
    },
    {
      label: 'Asie & Pacifique',
      zones: [
        { value: 'Asia/Dubai', cities: 'Dubaï, Abu Dhabi' },
        { value: 'Asia/Kolkata', cities: 'Mumbai, Delhi' },
        { value: 'Asia/Singapore', cities: 'Singapour, Shanghai, Pékin' },
        { value: 'Asia/Tokyo', cities: 'Tokyo, Séoul' },
        { value: 'Australia/Sydney', cities: 'Sydney, Melbourne' },
        { value: 'Pacific/Auckland', cities: 'Auckland' },
      ],
    },
  ];

  const allTimezones = timezoneGroups.flatMap((g) =>
    g.zones.map((z) => ({
      ...z,
      label: `${formatUtcOffset(z.value)} — ${z.cities}`,
    })),
  );

  function getTimezoneLabel(value: string): string {
    return allTimezones.find((tz) => tz.value === value)?.label ?? value;
  }

  function openEdit(campus: any) {
    reset();
    $form.name = campus.name;
    $form.externalName = campus.externalName ?? '';
    $form.timezone = campus.timezone ?? 'Europe/Paris';
    $form.flags = (campus.flags ?? []) as FlagKey[];
    isEditing = true;
    editId = campus.id;
    open = true;
  }

  function confirmDelete(id: string) {
    itemToDelete = id;
    deleteDialogOpen = true;
  }
</script>

<svelte:head>
  <title>Campus</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        Réseau <span class="text-epi-pink">Campus</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        Gérer les villes d'implantation
      </p>
    </div>
    <Button
      onclick={openCreate}
      class="bg-epi-pink text-white hover:bg-epi-pink/90"
    >
      <Plus class="mr-2 h-4 w-4" /> Ajouter
    </Button>
  </div>

  <div class="rounded-sm border bg-card shadow-sm">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head class="w-12"></Table.Head>
          <Table.Head>Nom du Campus</Table.Head>
          <Table.Head>Nom externe</Table.Head>
          <Table.Head>Fuseau horaire</Table.Head>
          <Table.Head>Fonctionnalités</Table.Head>
          <Table.Head class="text-right">Actions</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each data.campuses as campus}
          <Table.Row>
            <Table.Cell
              ><Map class="h-4 w-4 text-muted-foreground" /></Table.Cell
            >
            <Table.Cell class="font-bold">{campus.name}</Table.Cell>
            <Table.Cell class="text-muted-foreground"
              >{campus.externalName ?? '—'}</Table.Cell
            >
            <Table.Cell class="text-xs text-muted-foreground"
              >{getTimezoneLabel(campus.timezone ?? 'Europe/Paris')}</Table.Cell
            >
            <Table.Cell>
              <div class="flex flex-wrap gap-1">
                {#each campus.flags as key}
                  <Badge variant="secondary" class="text-[10px]"
                    >{FEATURE_FLAGS[key as FlagKey]?.label ?? key}</Badge
                  >
                {:else}
                  <span class="text-xs text-muted-foreground">—</span>
                {/each}
              </div>
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
                        onclick={() => openEdit(campus)}
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
                        onclick={() => confirmDelete(campus.id)}
                      >
                        <Trash2 class="h-4 w-4" />
                      </Button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content><p>Supprimer</p></Tooltip.Content>
                </Tooltip.Root>
              </Tooltip.Provider>
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>

  <Dialog.Root bind:open>
    <Dialog.Content class="sm:max-w-md">
      <Dialog.Header>
        <Dialog.Title>{isEditing ? 'Modifier' : 'Nouveau'} Campus</Dialog.Title>
      </Dialog.Header>
      <form
        method="POST"
        action={isEditing ? '?/update' : '?/create'}
        use:enhance
        class="space-y-4 py-4"
      >
        {#if isEditing}<input type="hidden" name="id" value={editId} />{/if}
        <div class="space-y-2">
          <Label>Nom de la ville / campus</Label>
          <Input name="name" bind:value={$form.name} placeholder="Ex: Paris" />
          {#if $errors.name}<span class="text-xs text-destructive"
              >{$errors.name}</span
            >{/if}
        </div>
        <div class="space-y-2">
          <Label>Nom externe (synchronisation)</Label>
          <Input
            name="externalName"
            bind:value={$form.externalName}
            placeholder="Ex: paris"
          />
          {#if $errors.externalName}<span class="text-xs text-destructive"
              >{$errors.externalName}</span
            >{/if}
        </div>
        <div class="space-y-2">
          <Label>Fuseau horaire</Label>
          <input type="hidden" name="timezone" value={$form.timezone} />
          <Select.Root
            type="single"
            value={$form.timezone}
            onValueChange={(v) => ($form.timezone = v)}
          >
            <Select.Trigger class="w-full">
              {getTimezoneLabel($form.timezone)}
            </Select.Trigger>
            <Select.Content class="max-h-72">
              {#each timezoneGroups as group}
                <Select.Group>
                  <Select.GroupHeading>{group.label}</Select.GroupHeading>
                  {#each group.zones as tz}
                    <Select.Item
                      value={tz.value}
                      label="{formatUtcOffset(tz.value)} — {tz.cities}"
                    />
                  {/each}
                </Select.Group>
                <Select.Separator />
              {/each}
            </Select.Content>
          </Select.Root>
          {#if $errors.timezone}<span class="text-xs text-destructive"
              >{$errors.timezone}</span
            >{/if}
        </div>
        <fieldset class="space-y-2">
          <legend class="text-sm font-bold uppercase">
            Fonctionnalités activées
          </legend>
          <div class="space-y-2">
            {#each flagDefs as flag}
              <label
                class="flex cursor-pointer items-start gap-3 rounded-sm border bg-card p-3 hover:border-epi-pink/40"
              >
                <Checkbox
                  name="flags"
                  value={flag.key}
                  checked={$form.flags.includes(flag.key as FlagKey)}
                  onCheckedChange={(v) => {
                    const key = flag.key as FlagKey;
                    if (v === true) {
                      if (!$form.flags.includes(key))
                        $form.flags = [...$form.flags, key];
                    } else {
                      $form.flags = $form.flags.filter((k) => k !== key);
                    }
                  }}
                  class="mt-1"
                />
                <div class="flex-1 space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-bold">{flag.label}</span>
                    <Badge
                      variant={flag.kind === 'rollout'
                        ? 'outline'
                        : 'secondary'}
                      class="text-[10px] uppercase"
                    >
                      {flag.kind}
                    </Badge>
                  </div>
                  <p class="text-xs text-muted-foreground">
                    {flag.description}
                  </p>
                  {#if flag.removeBy && flag.removeBy < new Date()}
                    <p class="text-xs text-destructive">
                      Flag à supprimer du code (expiré le {flag.removeBy.toLocaleDateString()}).
                    </p>
                  {/if}
                </div>
              </label>
            {/each}
          </div>
        </fieldset>
        <Dialog.Footer>
          <Button
            type="submit"
            disabled={$delayed}
            class="bg-epi-pink text-white"
          >
            {$delayed ? 'Sauvegarde...' : 'Enregistrer'}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <ConfirmDeleteDialog
    bind:open={deleteDialogOpen}
    action="?/delete&id={itemToDelete}"
    title="Supprimer le campus"
    description="Êtes-vous sûr ? Impossible si des données y sont attachées."
  />
</div>
