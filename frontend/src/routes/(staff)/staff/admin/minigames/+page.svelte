<script lang="ts">
  import type { PageData } from './$types';
  import type { AdminGame } from './+page.server';
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { superForm } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import Zap from '@lucide/svelte/icons/zap';
  import FlaskConical from '@lucide/svelte/icons/flask-conical';
  import Dices from '@lucide/svelte/icons/dices';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Trophy from '@lucide/svelte/icons/trophy';
  import Timer from '@lucide/svelte/icons/timer';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Switch } from '$lib/components/ui/switch';
  import { Badge } from '$lib/components/ui/badge';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Table from '$lib/components/ui/table';
  import SearchableSelect, {
    type SelectOption,
  } from '$lib/components/staff/SearchableSelect.svelte';
  import { cn } from '$lib/utils';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';

  let { data }: { data: PageData } = $props();

  const DIFFICULTY: Record<
    AdminGame['difficulty'],
    { label: string; class: string }
  > = {
    easy: {
      label: 'Facile',
      class: 'bg-success/10 text-success',
    },
    medium: {
      label: 'Moyen',
      class: 'bg-warning/10 text-warning',
    },
    hard: {
      label: 'Difficile',
      class: 'bg-destructive/10 text-destructive',
    },
  };

  // ── Game config dialog (rotation + weight for one catalogue game) ──
  const {
    form: configForm,
    enhance: configEnhance,
    delayed: configDelayed,
  } = superForm(
    untrack(() => data.configForm),
    {
      onResult: ({ result }) => {
        if (result.type === 'success') {
          configOpen = false;
          toast.success(result.data?.form?.message || 'Enregistré');
        } else if (result.type === 'failure') {
          toast.error(result.data?.form?.message || 'Erreur');
        }
      },
    },
  );

  let configOpen = $state(false);
  let editing = $state<AdminGame | null>(null);

  function openConfig(g: AdminGame) {
    editing = g;
    $configForm.game = g.name;
    $configForm.weight = g.weight;
    $configForm.enabled = g.enabled;
    configOpen = true;
  }

  // ── Force publication ──
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

  const publishable = $derived(data.games.filter((g) => g.levelCount > 0));
  const publishableOptions: SelectOption[] = $derived(
    publishable.map((g) => ({ value: g.name, label: g.displayName })),
  );
  const forceGame = $derived(
    publishable.find((g) => g.name === $forceForm.game) ?? null,
  );

  function onForceGameChange(name: string) {
    $forceForm.game = name;
    $forceForm.level = 1; // reset into the new game's valid range
  }
  function randomForceLevel() {
    if (forceGame)
      $forceForm.level = Math.floor(Math.random() * forceGame.levelCount) + 1;
  }

  // ── Test a level ──
  let testGame = $state('');
  let testLevel = $state(1);
  const gameOptions: SelectOption[] = $derived(
    data.games.map((g) => ({ value: g.name, label: g.displayName })),
  );
  const testMeta = $derived(
    data.games.find((g) => g.name === testGame) ?? null,
  );
  const testHref = $derived(
    testGame &&
      testLevel >= 1 &&
      (!testMeta || testLevel <= testMeta.levelCount)
      ? `/staff/admin/minigames/test?game=${encodeURIComponent(testGame)}&level=${testLevel}`
      : '',
  );

  function formatChrono(ms: number | null): string {
    return ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`;
  }
  function formatScore(s: number | null): string {
    return s === null ? '—' : Math.round(s).toString();
  }
</script>

<svelte:head>
  <title>Mini-jeux — Admin</title>
</svelte:head>

<div class="space-y-8">
  <PageHeader
    title="Mini-"
    accent="jeux"
    subtitle="Rotation et publications du jeu du jour"
  >
    {#snippet actions()}
      {#if data.active}
        <div class="rounded-sm border bg-card px-4 py-2 text-right">
          <div class="epi-overline font-bold text-muted-foreground">
            Publication active
          </div>
          <div class="text-sm font-bold">
            {data.active.gameName} · niveau {data.active.level}
          </div>
        </div>
      {:else}
        <Badge variant="outline">Aucune publication active</Badge>
      {/if}
    {/snippet}
  </PageHeader>

  {#if !data.catalogAvailable}
    <div
      class="flex items-start gap-3 rounded-sm border border-warning/30 bg-warning/10 p-4 text-sm"
    >
      <TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-warning" />
      <div>
        <p class="font-bold">Catalogue des jeux indisponible</p>
        <p class="text-muted-foreground">
          Impossible de joindre <code>jump-games</code> (vérifie
          <code>JUMP_GAMES_URL</code>). La rotation et les publications sont en
          pause tant que le catalogue n'est pas accessible.
        </p>
      </div>
    </div>
  {/if}

  <!-- ── Catalogue ── -->
  <section class="space-y-3">
    <h2 class="flex items-center gap-2 text-lg font-bold uppercase">
      <Gamepad2 class="h-5 w-5" /> Catalogue
    </h2>
    {#if data.games.length === 0}
      <div
        class="rounded-sm border bg-card p-6 text-center text-sm text-muted-foreground"
      >
        Aucun jeu dans le catalogue.
      </div>
    {:else}
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each data.games as g (g.name)}
          <div
            class={cn(
              'flex flex-col gap-3 rounded-sm border bg-card p-4 transition-colors',
              g.enabled ? 'border-epi-tomorrow/40' : 'opacity-80',
            )}
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="truncate text-base font-bold">{g.displayName}</div>
                <div class="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span
                    class={cn(
                      'rounded-full px-2 py-0.5 epi-overline font-bold',
                      DIFFICULTY[g.difficulty].class,
                    )}
                  >
                    {DIFFICULTY[g.difficulty].label}
                  </span>
                  <Badge variant="outline" class="gap-1 text-xs">
                    {#if g.scoringType === 'score'}
                      <Trophy class="h-3 w-3" /> Score
                    {:else}
                      <Timer class="h-3 w-3" /> Chrono
                    {/if}
                  </Badge>
                </div>
              </div>
              {#if g.enabled}
                <Badge variant="secondary" class="shrink-0">En rotation</Badge>
              {:else}
                <Badge variant="outline" class="shrink-0">Hors rotation</Badge>
              {/if}
            </div>

            <p class="line-clamp-2 text-xs text-muted-foreground">
              {g.description}
            </p>

            <div
              class="mt-auto flex items-center justify-between border-t pt-3 text-xs"
            >
              <div class="flex gap-3 text-muted-foreground">
                <span
                  ><strong class="text-foreground">{g.levelCount}</strong> niveaux</span
                >
                {#if g.enabled}
                  <span
                    >poids <strong class="text-foreground">×{g.weight}</strong
                    ></span
                  >
                {/if}
              </div>
              <Button variant="ghost" size="sm" onclick={() => openConfig(g)}>
                <Pencil class="mr-1.5 h-3.5 w-3.5" /> Configurer
              </Button>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if data.orphans.length > 0}
      <div class="rounded-sm border border-warning/30 bg-warning/60 p-4">
        <p class="mb-2 flex items-center gap-2 text-sm font-bold">
          <TriangleAlert class="h-4 w-4 text-warning" /> Jeux absents du catalogue
        </p>
        <p class="mb-3 text-xs text-muted-foreground">
          Ces réglages pointent vers des jeux qui ne sont plus exposés par
          <code>jump-games</code>. Ils ne peuvent plus tourner — tu peux les
          retirer.
        </p>
        <div class="space-y-2">
          {#each data.orphans as o (o.game)}
            <div
              class="flex items-center justify-between rounded-sm border bg-card px-3 py-2 text-sm"
            >
              <span class="font-mono">{o.game}</span>
              <form
                method="POST"
                action="?/removeGame&game={o.game}"
                use:enhance={() =>
                  async ({ result, update }) => {
                    await update();
                    if (result.type === 'success') toast.success('Jeu retiré.');
                  }}
              >
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  class="text-destructive"
                  aria-label="Retirer ce jeu de la rotation"
                >
                  <Trash2 class="h-4 w-4" />
                </Button>
              </form>
            </div>
          {/each}
        </div>
      </div>
    {/if}
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
          <SearchableSelect
            clearable={false}
            options={publishableOptions}
            value={$forceForm.game}
            onChange={(v) => onForceGameChange(v ?? '')}
            placeholder="Choisir un jeu"
            searchPlaceholder="Rechercher un jeu…"
            emptyLabel="Aucun jeu."
            triggerClass="min-w-[220px]"
          />
        </div>
        <div class="space-y-1">
          <Label>Niveau</Label>
          <div class="flex items-center gap-2">
            <Input
              name="level"
              type="number"
              min="1"
              max={forceGame?.levelCount}
              class="w-24"
              bind:value={$forceForm.level}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Niveau aléatoire"
              disabled={!forceGame}
              onclick={randomForceLevel}
            >
              <Dices class="h-4 w-4" />
            </Button>
          </div>
          {#if forceGame}
            <p class="text-xs text-muted-foreground">
              1–{forceGame.levelCount}
            </p>
          {/if}
        </div>
        <Button type="submit" disabled={$forceDelayed || !forceGame}>
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
          <SearchableSelect
            clearable={false}
            options={gameOptions}
            value={testGame}
            onChange={(v) => {
              testGame = v ?? '';
              testLevel = 1;
            }}
            placeholder="Choisir un jeu"
            searchPlaceholder="Rechercher un jeu…"
            emptyLabel="Aucun jeu."
            triggerClass="min-w-[220px]"
          />
        </div>
        <div class="space-y-1">
          <Label>Niveau</Label>
          <Input
            type="number"
            min="1"
            max={testMeta?.levelCount}
            class="w-24"
            bind:value={testLevel}
          />
          {#if testMeta}
            <p class="text-xs text-muted-foreground">
              1–{testMeta.levelCount}
            </p>
          {/if}
        </div>
        <Button href={testHref || undefined} disabled={!testHref}>
          Tester
        </Button>
      </div>
    </div>
  </section>

  <!-- ── Historique ── -->
  <section class="space-y-3">
    <h2 class="text-lg font-bold uppercase">Historique des publications</h2>
    <div class="rounded-sm border bg-card shadow-raised">
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
              <Table.Cell class="font-bold">{p.gameName}</Table.Cell>
              <Table.Cell>{p.level}</Table.Cell>
              <Table.Cell>
                {#if p.forcedById}
                  <Badge variant="outline">Forcée</Badge>
                {:else}
                  <Badge variant="secondary">Cron</Badge>
                {/if}
              </Table.Cell>
              <Table.Cell class="text-right">{p.attemptsCount}</Table.Cell>
              <Table.Cell class="text-right">
                {p.scoringType === 'score' ? formatScore(p.avgScore) : '—'}
              </Table.Cell>
              <Table.Cell class="text-right"
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

  <!-- ── Dialog config ── -->
  <Dialog.Root bind:open={configOpen}>
    <Dialog.Content class="sm:max-w-md">
      <Dialog.Header>
        <Dialog.Title>{editing?.displayName ?? 'Jeu'}</Dialog.Title>
        <Dialog.Description>
          {editing?.levelCount} niveaux ·
          {editing?.scoringType === 'score'
            ? 'classement au score'
            : 'classement au chrono'}
        </Dialog.Description>
      </Dialog.Header>
      <form
        method="POST"
        action="?/saveGame"
        use:configEnhance
        class="space-y-4 py-2"
      >
        <input type="hidden" name="game" value={$configForm.game} />

        <label
          class="flex cursor-pointer items-center justify-between rounded-sm border bg-card p-3"
        >
          <div>
            <span class="text-sm font-bold">En rotation</span>
            <p class="text-xs text-muted-foreground">
              Inclure ce jeu dans le tirage quotidien.
            </p>
          </div>
          <Switch name="enabled" bind:checked={$configForm.enabled} />
        </label>

        <div class="space-y-2">
          <Label>Poids du tirage</Label>
          <Input
            name="weight"
            type="number"
            min="1"
            bind:value={$configForm.weight}
          />
          <p class="text-xs text-muted-foreground">
            Plus le poids est élevé, plus le jeu sort souvent.
          </p>
        </div>

        <Dialog.Footer>
          <Button type="submit" disabled={$configDelayed}>
            {$configDelayed ? 'Sauvegarde...' : 'Enregistrer'}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>
</div>
