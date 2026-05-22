<script lang="ts">
  import type { PageData } from './$types';
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import Plus from '@lucide/svelte/icons/plus';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import Zap from '@lucide/svelte/icons/zap';
  import FlaskConical from '@lucide/svelte/icons/flask-conical';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Badge } from '$lib/components/ui/badge';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import * as Table from '$lib/components/ui/table';
  import ConfirmDeleteDialog from '$lib/components/admin/ConfirmDeleteDialog.svelte';

  let { data }: { data: PageData } = $props();

  // ── Game config form ─────────────────────────
  const {
    form: configForm,
    errors: configErrors,
    enhance: configEnhance,
    delayed: configDelayed,
    reset: configReset,
  } = superForm(
    untrack(() => data.configForm),
    {
      onResult: ({ result }) => {
        if (result.type === 'success') {
          configOpen = false;
          toast.success(result.data?.form?.message || 'Enregistré');
        }
      },
    },
  );

  let configOpen = $state(false);
  let isEditing = $state(false);
  let deleteOpen = $state(false);
  let toDelete = $state<string | null>(null);

  function openCreate() {
    configReset();
    $configForm.game = '';
    $configForm.levelCount = 0;
    $configForm.weight = 1;
    $configForm.scoringType = 'score';
    $configForm.enabled = true;
    isEditing = false;
    configOpen = true;
  }

  function openEdit(c: PageData['configs'][number]) {
    configReset();
    $configForm.game = c.game;
    $configForm.levelCount = c.levelCount;
    $configForm.weight = c.weight;
    $configForm.scoringType = c.scoringType;
    $configForm.enabled = c.enabled;
    isEditing = true;
    configOpen = true;
  }

  function confirmDelete(game: string) {
    toDelete = game;
    deleteOpen = true;
  }

  // ── Force publication form ───────────────────
  const {
    form: forceForm,
    errors: forceErrors,
    enhance: forceEnhance,
    delayed: forceDelayed,
  } = superForm(
    untrack(() => data.forceForm),
    {
      onResult: ({ result }) => {
        if (result.type === 'success') {
          toast.success(result.data?.form?.message || 'Publication forcée');
        } else if (result.type === 'failure') {
          toast.error(result.data?.form?.message || 'Erreur');
        }
      },
    },
  );

  function formatChrono(ms: number | null): string {
    if (ms === null) return '—';
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function formatScore(s: number | null): string {
    if (s === null) return '—';
    return Math.round(s).toString();
  }

  // ── Test form ────────────────────────────────
  let testGame = $state('');
  let testLevel = $state(1);
  const testHref = $derived(
    testGame
      ? `/staff/admin/minigames/test?game=${encodeURIComponent(testGame)}&level=${testLevel}`
      : '',
  );
</script>

<svelte:head>
  <title>Mini-jeux — Admin</title>
</svelte:head>

<div class="space-y-8">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        Mini-<span class="text-epi-pink">jeux</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        Configurer les jeux et publications
      </p>
    </div>
    {#if data.active}
      <div class="rounded-sm border bg-card px-4 py-2 text-right">
        <div
          class="text-[10px] font-black tracking-widest text-muted-foreground uppercase"
        >
          Publication active
        </div>
        <div class="text-sm font-bold capitalize">
          {data.active.game} · niveau {data.active.level}
        </div>
      </div>
    {:else}
      <Badge variant="outline">Aucune publication active</Badge>
    {/if}
  </div>

  <!-- ── Jeux ── -->
  <section class="space-y-3">
    <div class="flex items-center justify-between">
      <h2 class="flex items-center gap-2 text-lg font-bold uppercase">
        <Gamepad2 class="h-5 w-5" /> Jeux configurés
      </h2>
      <Button
        onclick={openCreate}
        class="bg-epi-pink text-white hover:bg-epi-pink/90"
      >
        <Plus class="mr-2 h-4 w-4" /> Ajouter un jeu
      </Button>
    </div>
    <div class="rounded-sm border bg-card shadow-sm">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Jeu</Table.Head>
            <Table.Head>Niveaux</Table.Head>
            <Table.Head>Poids</Table.Head>
            <Table.Head>Tri</Table.Head>
            <Table.Head>Statut</Table.Head>
            <Table.Head class="text-right">Actions</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.configs as c (c.game)}
            <Table.Row>
              <Table.Cell class="font-bold capitalize">{c.game}</Table.Cell>
              <Table.Cell>{c.levelCount}</Table.Cell>
              <Table.Cell>{c.weight}</Table.Cell>
              <Table.Cell class="uppercase">{c.scoringType}</Table.Cell>
              <Table.Cell>
                {#if c.enabled}
                  <Badge variant="secondary">Actif</Badge>
                {:else}
                  <Badge variant="outline">Désactivé</Badge>
                {/if}
              </Table.Cell>
              <Table.Cell class="text-right">
                <Button variant="ghost" size="icon" onclick={() => openEdit(c)}>
                  <Pencil class="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="text-destructive"
                  onclick={() => confirmDelete(c.game)}
                >
                  <Trash2 class="h-4 w-4" />
                </Button>
              </Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell
                colspan={6}
                class="py-6 text-center text-sm text-muted-foreground"
              >
                Aucun jeu configuré.
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  </section>

  <!-- ── Forcer publication ── -->
  <section class="space-y-3">
    <h2 class="flex items-center gap-2 text-lg font-bold uppercase">
      <Zap class="h-5 w-5" /> Forcer une publication
    </h2>
    <form
      method="POST"
      action="?/forcePublish"
      use:forceEnhance
      class="rounded-sm border bg-card p-4"
    >
      <div class="flex flex-wrap items-end gap-3">
        <div class="space-y-1">
          <Label>Jeu</Label>
          <input type="hidden" name="game" value={$forceForm.game} />
          <Select.Root
            type="single"
            value={$forceForm.game}
            onValueChange={(v) => ($forceForm.game = v ?? '')}
          >
            <Select.Trigger class="min-w-[200px]">
              {$forceForm.game || 'Choisir un jeu'}
            </Select.Trigger>
            <Select.Content>
              {#each data.configs.filter((c) => c.enabled && c.levelCount > 0) as c}
                <Select.Item value={c.game} label={c.game} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="space-y-1">
          <Label>Niveau</Label>
          <Input
            name="level"
            type="number"
            min="1"
            class="w-24"
            bind:value={$forceForm.level}
          />
        </div>
        <Button
          type="submit"
          disabled={$forceDelayed}
          class="bg-epi-pink text-white"
        >
          {$forceDelayed ? '...' : 'Publier'}
        </Button>
      </div>
      {#if $forceErrors.game}<p class="mt-2 text-xs text-destructive">
          {$forceErrors.game}
        </p>{/if}
      {#if $forceErrors.level}<p class="mt-2 text-xs text-destructive">
          {$forceErrors.level}
        </p>{/if}
    </form>
  </section>

  <!-- ── Tester un niveau ── -->
  <section class="space-y-3">
    <h2 class="flex items-center gap-2 text-lg font-bold uppercase">
      <FlaskConical class="h-5 w-5" /> Tester un niveau
    </h2>
    <div class="rounded-sm border bg-card p-4">
      <p class="mb-3 text-xs text-muted-foreground">
        Lance n'importe quel jeu/niveau dans une iframe sans créer de tentative.
        Aucun callback n'est enregistré.
      </p>
      <div class="flex flex-wrap items-end gap-3">
        <div class="space-y-1">
          <Label>Jeu</Label>
          <Select.Root
            type="single"
            value={testGame}
            onValueChange={(v) => (testGame = v ?? '')}
          >
            <Select.Trigger class="min-w-[200px]">
              {testGame || 'Choisir un jeu'}
            </Select.Trigger>
            <Select.Content>
              {#each data.configs as c}
                <Select.Item value={c.game} label={c.game} />
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="space-y-1">
          <Label>Niveau</Label>
          <Input type="number" min="1" class="w-24" bind:value={testLevel} />
        </div>
        <Button
          href={testHref || undefined}
          disabled={!testGame || testLevel < 1}
          class="bg-epi-pink text-white"
        >
          Tester
        </Button>
      </div>
    </div>
  </section>

  <!-- ── Historique ── -->
  <section class="space-y-3">
    <h2 class="text-lg font-bold uppercase">Historique des publications</h2>
    <div class="rounded-sm border bg-card shadow-sm">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Date</Table.Head>
            <Table.Head>Jeu</Table.Head>
            <Table.Head>Niveau</Table.Head>
            <Table.Head>Source</Table.Head>
            <Table.Head class="text-right">Parties</Table.Head>
            <Table.Head class="text-right">Score moyen</Table.Head>
            <Table.Head class="text-right">Chrono moyen</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.publications as p (p.id)}
            <Table.Row>
              <Table.Cell class="text-xs text-muted-foreground">
                {new Date(p.publishedAt).toLocaleString('fr-FR')}
              </Table.Cell>
              <Table.Cell class="font-bold capitalize">{p.game}</Table.Cell>
              <Table.Cell>{p.level}</Table.Cell>
              <Table.Cell>
                {#if p.forcedById}
                  <Badge variant="outline">Forcée</Badge>
                {:else}
                  <Badge variant="secondary">Cron</Badge>
                {/if}
              </Table.Cell>
              <Table.Cell class="text-right tabular-nums"
                >{p.attemptsCount}</Table.Cell
              >
              <Table.Cell class="text-right tabular-nums"
                >{formatScore(p.avgScore)}</Table.Cell
              >
              <Table.Cell class="text-right tabular-nums"
                >{formatChrono(p.avgChrono)}</Table.Cell
              >
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell
                colspan={7}
                class="py-6 text-center text-sm text-muted-foreground"
              >
                Aucune publication.
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  </section>

  <!-- ── Dialog jeu ── -->
  <Dialog.Root bind:open={configOpen}>
    <Dialog.Content class="sm:max-w-md">
      <Dialog.Header>
        <Dialog.Title>{isEditing ? 'Modifier' : 'Nouveau'} jeu</Dialog.Title>
      </Dialog.Header>
      <form
        method="POST"
        action="?/upsertGame"
        use:configEnhance
        class="space-y-4 py-4"
      >
        <div class="space-y-2">
          <Label>Identifiant (game)</Label>
          <Input
            name="game"
            bind:value={$configForm.game}
            readonly={isEditing}
            class={isEditing ? 'cursor-not-allowed opacity-60' : ''}
            placeholder="minesweeper"
          />
          {#if $configErrors.game}<span class="text-xs text-destructive"
              >{$configErrors.game}</span
            >{/if}
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-2">
            <Label>Nombre de niveaux</Label>
            <Input
              name="levelCount"
              type="number"
              min="0"
              bind:value={$configForm.levelCount}
            />
            {#if $configErrors.levelCount}<span class="text-xs text-destructive"
                >{$configErrors.levelCount}</span
              >{/if}
          </div>
          <div class="space-y-2">
            <Label>Poids</Label>
            <Input
              name="weight"
              type="number"
              min="1"
              bind:value={$configForm.weight}
            />
            {#if $configErrors.weight}<span class="text-xs text-destructive"
                >{$configErrors.weight}</span
              >{/if}
          </div>
        </div>
        <div class="space-y-2">
          <Label>Type de tri</Label>
          <input
            type="hidden"
            name="scoringType"
            value={$configForm.scoringType}
          />
          <Select.Root
            type="single"
            value={$configForm.scoringType}
            onValueChange={(v) =>
              ($configForm.scoringType = (v as 'score' | 'chrono') ?? 'score')}
          >
            <Select.Trigger class="w-full">
              {$configForm.scoringType === 'score'
                ? 'Score (desc)'
                : 'Chrono (asc)'}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="score" label="Score (desc)" />
              <Select.Item value="chrono" label="Chrono (asc)" />
            </Select.Content>
          </Select.Root>
        </div>
        <label
          class="flex cursor-pointer items-center gap-3 rounded-sm border bg-card p-3"
        >
          <Checkbox
            name="enabled"
            checked={$configForm.enabled}
            onCheckedChange={(v) => ($configForm.enabled = v === true)}
          />
          <span class="text-sm font-bold">Activé</span>
        </label>
        <Dialog.Footer>
          <Button
            type="submit"
            disabled={$configDelayed}
            class="bg-epi-pink text-white"
          >
            {$configDelayed ? 'Sauvegarde...' : 'Enregistrer'}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>

  <ConfirmDeleteDialog
    bind:open={deleteOpen}
    action="?/deleteGame&game={toDelete}"
    title="Supprimer ce jeu"
    description="Êtes-vous sûr ? Impossible si des publications l'utilisent."
  />
</div>
