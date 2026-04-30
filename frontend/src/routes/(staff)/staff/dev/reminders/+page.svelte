<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { superForm } from 'sveltekit-superforms';
  import * as Table from '$lib/components/ui/table';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Button } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import Check from '@lucide/svelte/icons/check';
  import Clock from '@lucide/svelte/icons/clock';
  import Send from '@lucide/svelte/icons/send';
  import { toast } from 'svelte-sonner';

  let { data } = $props();

  const { enhance } = superForm(
    untrack(() => data.form),
    {
      resetForm: false,
      onResult: ({ result }) => {
        if (result.type === 'success') {
          toast.success(result.data?.form?.message || 'Relances envoyées');
          selectedIds = new Set();
        } else if (result.type === 'failure' && result.data?.form?.message) {
          toast.error(result.data.form.message);
        }
      },
    },
  );

  let selectedIds = $state<Set<string>>(new Set());
  let sendType = $state<'student' | 'parent'>('student');
  let showConfirm = $state(false);

  const filteredTalents = $derived(() => {
    if (data.filter === 'student') {
      return data.talents.filter((t) => !t.infoValidatedAt || !t.rulesSignedAt);
    }
    if (data.filter === 'parent') {
      return data.talents.filter(
        (t) => !t.imageRightsSignedAt && t.parentEmail,
      );
    }
    return data.talents;
  });

  function toggleAll() {
    const talents = filteredTalents();
    if (selectedIds.size === talents.length) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(talents.map((t) => t.id));
    }
  }

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  function lastReminderLabel(
    reminders: { sentAt: Date; type: string }[],
  ): string {
    if (reminders.length === 0) return 'Jamais';
    const d = new Date(reminders[0].sentAt);
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
    });
  }

  function prepareSend(type: 'student' | 'parent') {
    sendType = type;
    showConfirm = true;
  }
</script>

<div class="space-y-6 p-6">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold">Relances onboarding</h1>
      <p class="text-sm text-muted-foreground">
        Envoyez des rappels aux familles dont l'onboarding est incomplet.
      </p>
    </div>
  </div>

  <!-- Filters -->
  <div class="flex gap-2">
    {#each [{ value: 'all', label: 'Tous' }, { value: 'student', label: 'Étudiant incomplet' }, { value: 'parent', label: "Droit à l'image manquant" }] as f}
      <Button
        variant={data.filter === f.value ? 'default' : 'outline'}
        size="sm"
        onclick={() => goto(`?filter=${f.value}`)}
      >
        {f.label}
      </Button>
    {/each}
  </div>

  <!-- Actions -->
  <div class="flex items-center gap-3">
    <span class="text-sm text-muted-foreground">
      {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
    </span>
    {#if data.filter !== 'parent'}
      <Button
        size="sm"
        disabled={selectedIds.size === 0}
        onclick={() => prepareSend('student')}
      >
        <Send class="mr-2 h-4 w-4" />
        Relancer étudiants
      </Button>
    {/if}
    {#if data.filter !== 'student'}
      <Button
        size="sm"
        disabled={selectedIds.size === 0}
        onclick={() => prepareSend('parent')}
      >
        <Send class="mr-2 h-4 w-4" />
        Relancer parents
      </Button>
    {/if}
  </div>

  <!-- Table -->
  <Table.Root>
    <Table.Header>
      <Table.Row>
        <Table.Head class="w-10">
          <Checkbox
            checked={selectedIds.size === filteredTalents().length &&
              filteredTalents().length > 0}
            indeterminate={selectedIds.size > 0 &&
              selectedIds.size < filteredTalents().length}
            onCheckedChange={toggleAll}
          />
        </Table.Head>
        <Table.Head>Nom</Table.Head>
        <Table.Head>Info</Table.Head>
        <Table.Head>Règlement</Table.Head>
        <Table.Head>Droit image</Table.Head>
        <Table.Head>Email parent</Table.Head>
        <Table.Head>Dernière relance</Table.Head>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each filteredTalents() as talent (talent.id)}
        <Table.Row>
          <Table.Cell>
            <Checkbox
              checked={selectedIds.has(talent.id)}
              onCheckedChange={() => toggle(talent.id)}
            />
          </Table.Cell>
          <Table.Cell class="font-medium">
            {talent.prenom}
            {talent.nom}
          </Table.Cell>
          <Table.Cell>
            {#if talent.infoValidatedAt}
              <Check class="h-4 w-4 text-green-600" />
            {:else}
              <Clock class="h-4 w-4 text-amber-500" />
            {/if}
          </Table.Cell>
          <Table.Cell>
            {#if talent.rulesSignedAt}
              <Check class="h-4 w-4 text-green-600" />
            {:else}
              <Clock class="h-4 w-4 text-amber-500" />
            {/if}
          </Table.Cell>
          <Table.Cell>
            {#if talent.imageRightsSignedAt}
              <Check class="h-4 w-4 text-green-600" />
            {:else}
              <Clock class="h-4 w-4 text-amber-500" />
            {/if}
          </Table.Cell>
          <Table.Cell class="text-sm text-muted-foreground">
            {talent.parentEmail || '—'}
          </Table.Cell>
          <Table.Cell class="text-sm text-muted-foreground">
            {lastReminderLabel(talent.reminders)}
          </Table.Cell>
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>

  {#if filteredTalents().length === 0}
    <p class="py-8 text-center text-sm text-muted-foreground">
      Aucun onboarding incomplet trouvé.
    </p>
  {/if}
</div>

<!-- Confirm dialog -->
<AlertDialog.Root bind:open={showConfirm}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Confirmer l'envoi</AlertDialog.Title>
      <AlertDialog.Description>
        Envoyer une relance {sendType === 'student' ? 'étudiant' : 'parent'} à
        <strong>{selectedIds.size}</strong>
        destinataire{selectedIds.size > 1 ? 's' : ''} ? Les relances envoyées il y
        a moins de 3 jours seront ignorées.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Annuler</AlertDialog.Cancel>
      <form method="POST" action="?/send" use:enhance>
        {#each [...selectedIds] as id}
          <input type="hidden" name="talentIds" value={id} />
        {/each}
        <input type="hidden" name="type" value={sendType} />
        <Button type="submit" onclick={() => (showConfirm = false)}>
          Envoyer
        </Button>
      </form>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
