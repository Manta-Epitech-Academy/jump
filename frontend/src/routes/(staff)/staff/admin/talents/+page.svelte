<script lang="ts">
  import Search from '@lucide/svelte/icons/search';
  import Funnel from '@lucide/svelte/icons/funnel';
  import LogIn from '@lucide/svelte/icons/log-in';
  import Users from '@lucide/svelte/icons/users';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import UserX from '@lucide/svelte/icons/user-x';
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import FilterX from '@lucide/svelte/icons/filter-x';
  import Zap from '@lucide/svelte/icons/zap';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import SegmentedFilter, {
    type SegmentOption,
  } from '$lib/components/staff/SegmentedFilter.svelte';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import * as Table from '$lib/components/ui/table';
  import * as Select from '$lib/components/ui/select';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import StudentAvatarItem from '$lib/components/students/StudentAvatarItem.svelte';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import { NIVEAUX, niveauLabel } from '$lib/domain/niveau';
  import { EVENT_TYPES, EVENT_TYPE_LABELS } from '$lib/domain/event';
  import { WELCOME_XP_BONUS } from '$lib/domain/xp';
  import { track } from '$lib/analytics';

  let { data } = $props();

  let searchQuery = $state(page.url.searchParams.get('q') || '');
  let searchTimeout: ReturnType<typeof setTimeout>;
  let impersonating = $state<string | null>(null);

  // Onboarding-reset confirm dialog — parameterised by the selected talent,
  // mirroring the users page's single-dialog pattern.
  let resetOpen = $state(false);
  let resetting = $state(false);
  let resetTarget = $state<{ id: string; name: string } | null>(null);

  function askReset(talent: { id: string; prenom: string; nom: string }) {
    resetTarget = { id: talent.id, name: `${talent.prenom} ${talent.nom}` };
    resetOpen = true;
  }

  const STATUS = {
    active: {
      label: 'Actif',
      class: 'border-epi-teal/30 bg-epi-teal/10 text-epi-teal-solid',
    },
    pending: {
      label: 'Onboarding',
      class: 'border-epi-orange/30 bg-epi-orange/10 text-epi-orange',
    },
    never: {
      label: 'Jamais connecté',
      class: 'border-border bg-muted text-muted-foreground',
    },
  } as const;

  function lastActiveLabel(date: Date | string | null): string {
    if (!date) return 'Jamais';
    const diff = Date.now() - new Date(date).getTime();
    const day = 86_400_000;
    if (diff < day) return "Aujourd'hui";
    if (diff < 2 * day) return 'Hier';
    if (diff < 7 * day) return `Il y a ${Math.floor(diff / day)} j`;
    if (diff < 30 * day) return `Il y a ${Math.floor(diff / (7 * day))} sem`;
    if (diff < 365 * day) return `Il y a ${Math.floor(diff / (30 * day))} mois`;
    const years = Math.floor(diff / (365 * day));
    return `Il y a ${years} an${years > 1 ? 's' : ''}`;
  }

  function navigateWithParams(params: Record<string, string>) {
    const url = new URL(page.url);
    url.searchParams.delete('page');
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    goto(url.toString(), { keepFocus: true });
  }

  // Overview metrics — read-only. These report the full population (not the
  // filtered result), so they're a stable "lay of the land" the admin watches;
  // narrowing the table happens in the toolbar below, never by clicking a tile.
  const overview = $derived([
    {
      label: 'Total',
      value: data.stats.total,
      sub: 'Tous les talents',
      tone: 'neutral',
      Icon: Users,
    },
    {
      label: 'Stagiaires',
      value: data.stats.stagiaires,
      sub: 'Stage de seconde · cette année',
      tone: 'pink',
      Icon: GraduationCap,
    },
    {
      label: 'Comptes actifs',
      value: data.stats.active,
      sub: 'Au moins une connexion',
      tone: 'teal',
      Icon: UserCheck,
    },
    {
      label: 'Jamais connectés',
      value: data.stats.pending,
      sub: 'Aucun compte créé',
      tone: 'orange',
      Icon: UserX,
    },
  ] as const);

  // Two independent filter dimensions, each a one-click segmented radio. They
  // compose freely (e.g. "stagiaires" + "jamais connectés") because they write
  // separate URL params — the whole point of splitting them off the tiles.
  const typeOptions: SegmentOption[] = [
    { value: 'all', label: 'Tous' },
    {
      value: EVENT_TYPES.STAGE_SECONDE,
      label: EVENT_TYPE_LABELS[EVENT_TYPES.STAGE_SECONDE],
    },
    {
      value: EVENT_TYPES.CODING_CLUB,
      label: EVENT_TYPE_LABELS[EVENT_TYPES.CODING_CLUB],
    },
  ];
  const statutOptions: SegmentOption[] = [
    { value: 'all', label: 'Tous' },
    { value: 'active', label: 'Actifs' },
    { value: 'pending', label: 'Jamais connectés' },
  ];

  // `account` defaults to 'all' server-side; the others are empty when inactive.
  const hasActiveFilters = $derived(
    Boolean(
      data.filters.q ||
      data.filters.type ||
      data.filters.niveau ||
      data.filters.campus,
    ) || data.filters.account !== 'all',
  );

  function resetFilters() {
    searchQuery = '';
    goto(page.url.pathname, { keepFocus: true });
  }

  function handleSearchInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    searchQuery = value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => navigateWithParams({ q: value }), 300);
  }

  function goToPage(p: number) {
    const url = new URL(page.url);
    if (p > 1) url.searchParams.set('page', String(p));
    else url.searchParams.delete('page');
    goto(url.toString());
  }
</script>

<svelte:head>
  <title>Talents</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="font-heading text-3xl tracking-wide uppercase">
      Talents<span class="text-epi-pink">_</span>
    </h1>
    <p class="font-mono text-xs text-muted-foreground">
      &lt; se connecter en tant qu'un talent pour voir son espace /&gt;
    </p>
  </div>

  <!-- Overview metrics — read-only, full population. -->
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {#each overview as metric (metric.label)}
      <KpiTile
        label={metric.label}
        value={metric.value}
        sub={metric.sub}
        icon={metric.Icon}
        tone={metric.tone}
      />
    {/each}
  </div>

  <!-- Filter toolbar — the single control surface. Type and Statut are
       independent segmented radios that compose; niveau/campus stay dropdowns
       (too many options for a segmented control). -->
  <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
    <div class="relative w-full max-w-72">
      <Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder="Rechercher par nom ou email…"
        class="rounded-sm pl-9"
        value={searchQuery}
        oninput={handleSearchInput}
      />
    </div>

    <div class="flex items-center gap-2">
      <span
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Type
      </span>
      <SegmentedFilter
        ariaLabel="Filtrer par type d'événement"
        options={typeOptions}
        value={data.filters.type || 'all'}
        onChange={(v) => navigateWithParams({ type: v === 'all' ? '' : v })}
      />
    </div>

    <div class="flex items-center gap-2">
      <span
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Statut
      </span>
      <SegmentedFilter
        ariaLabel="Filtrer par statut de compte"
        options={statutOptions}
        value={data.filters.account}
        onChange={(v) => navigateWithParams({ account: v === 'all' ? '' : v })}
      />
    </div>

    <div class="w-44">
      <Select.Root
        type="single"
        value={data.filters.niveau || 'all'}
        onValueChange={(v) =>
          navigateWithParams({ niveau: v === 'all' ? '' : v })}
      >
        <Select.Trigger class="rounded-sm">
          <Funnel class="mr-2 h-4 w-4 text-muted-foreground" />
          {data.filters.niveau
            ? niveauLabel(data.filters.niveau)
            : 'Tous les niveaux'}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="all">Tous les niveaux</Select.Item>
          {#each NIVEAUX as n}
            <Select.Item value={n}>{niveauLabel(n)}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <div class="w-44">
      <Select.Root
        type="single"
        value={data.filters.campus || 'all'}
        onValueChange={(v) =>
          navigateWithParams({ campus: v === 'all' ? '' : v })}
      >
        <Select.Trigger class="rounded-sm">
          {data.campuses.find((c) => c.id === data.filters.campus)?.name ??
            'Tous les campus'}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="all">Tous les campus</Select.Item>
          {#each data.campuses as c}
            <Select.Item value={c.id}>{c.name}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    {#if hasActiveFilters}
      <Button
        variant="ghost"
        size="sm"
        onclick={resetFilters}
        class="text-muted-foreground hover:text-foreground"
      >
        <FilterX class="mr-1.5 h-4 w-4" />
        Réinitialiser
      </Button>
    {/if}
  </div>

  <!-- Filtered result count, distinct from the full-population overview above. -->
  <p class="-mt-2 text-xs text-muted-foreground">
    <span class="font-bold text-foreground">{data.totalItems}</span>
    talent{data.totalItems > 1 ? 's' : ''}
    {hasActiveFilters
      ? data.totalItems > 1
        ? 'correspondent aux filtres'
        : 'correspond aux filtres'
      : 'au total'}
  </p>

  {#if data.talents.length > 0}
    <div class="rounded-sm border bg-card shadow-sm">
      <Table.Root>
        <Table.Header class="bg-muted/50">
          <Table.Row>
            <Table.Head class="text-xs font-bold uppercase">Talent</Table.Head>
            <Table.Head class="text-xs font-bold uppercase">Niveau</Table.Head>
            <Table.Head class="text-xs font-bold uppercase">Campus</Table.Head>
            <Table.Head class="text-xs font-bold uppercase">
              Progression
            </Table.Head>
            <Table.Head class="text-xs font-bold uppercase">Statut</Table.Head>
            <Table.Head class="text-xs font-bold uppercase">
              Activité
            </Table.Head>
            <Table.Head class="text-right text-xs font-bold uppercase">
              Action
            </Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.talents as talent (talent.id)}
            <Table.Row class="hover:bg-muted/30">
              <Table.Cell>
                <StudentAvatarItem
                  student={talent}
                  subText={talent.email}
                  showBadge={false}
                />
              </Table.Cell>
              <Table.Cell>
                {#if talent.niveau}
                  <Badge
                    variant="secondary"
                    class="rounded-sm bg-epi-blue/5 px-2 py-0 text-[10px] font-bold text-epi-blue uppercase"
                  >
                    {niveauLabel(talent.niveau)}
                  </Badge>
                {:else}
                  <span class="text-sm text-muted-foreground">—</span>
                {/if}
              </Table.Cell>
              <Table.Cell>
                {#if talent.campus}
                  <span class="text-sm">{talent.campus}</span>
                {:else}
                  <span class="text-sm text-muted-foreground">—</span>
                {/if}
              </Table.Cell>
              <Table.Cell>
                <div class="flex items-center gap-2">
                  <Zap class="h-3.5 w-3.5 text-epi-pink" />
                  <span class="font-mono text-sm font-bold">{talent.xp}</span>
                  <span class="text-xs text-muted-foreground">
                    · {talent.eventsCount} évé{talent.eventsCount > 1
                      ? 'nements'
                      : 'nement'}
                  </span>
                </div>
                <span
                  class="font-mono text-[10px] tracking-widest text-muted-foreground uppercase"
                >
                  {talent.level}
                </span>
              </Table.Cell>
              <Table.Cell>
                <div class="flex flex-col items-start gap-0.5">
                  <span
                    class="inline-flex rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase {STATUS[
                      talent.status
                    ].class}"
                  >
                    {STATUS[talent.status].label}
                  </span>
                  {#if talent.onboardingStep}
                    <span class="text-[10px] text-muted-foreground">
                      {talent.onboardingStep}
                    </span>
                  {/if}
                </div>
              </Table.Cell>
              <Table.Cell class="text-sm text-muted-foreground">
                {lastActiveLabel(talent.lastActiveAt)}
              </Table.Cell>
              <Table.Cell class="text-right">
                <div class="flex items-center justify-end gap-1">
                  {#if talent.status !== 'never'}
                    <Tooltip.Provider delayDuration={300}>
                      <Tooltip.Root>
                        <Tooltip.Trigger>
                          {#snippet child({ props })}
                            <Button
                              {...props}
                              variant="ghost"
                              size="icon"
                              class="text-muted-foreground hover:text-epi-orange"
                              onclick={() => askReset(talent)}
                            >
                              <RotateCcw class="h-4 w-4" />
                            </Button>
                          {/snippet}
                        </Tooltip.Trigger>
                        <Tooltip.Content>
                          <p>Réinitialiser l'onboarding</p>
                        </Tooltip.Content>
                      </Tooltip.Root>
                    </Tooltip.Provider>
                  {/if}

                  <form
                    method="POST"
                    action="?/impersonate"
                    class="inline"
                    use:enhance={() => {
                      impersonating = talent.id;
                      return async ({ result }) => {
                        if (result.type === 'redirect') {
                          track('impersonation_started', {
                            targetRole: 'talent',
                          });
                          // Full-page nav so the new session cookie is read
                          // fresh on the next request and guards re-evaluate.
                          window.location.href = result.location;
                          return;
                        }
                        impersonating = null;
                        track('impersonation_failed');
                        if (result.type === 'failure') {
                          toast.error(
                            (result.data?.message as string) ??
                              'Impossible de se connecter en tant que ce talent.',
                          );
                        }
                      };
                    }}
                  >
                    <input type="hidden" name="talentId" value={talent.id} />
                    <Tooltip.Provider delayDuration={300}>
                      <Tooltip.Root>
                        <Tooltip.Trigger>
                          {#snippet child({ props })}
                            <Button
                              {...props}
                              type="submit"
                              variant="ghost"
                              size="sm"
                              class="gap-1.5 text-muted-foreground hover:text-epi-pink"
                              disabled={impersonating === talent.id ||
                                (!talent.email && !talent.userId)}
                            >
                              <LogIn class="h-4 w-4" />
                              <span class="text-xs font-bold uppercase">
                                Se connecter
                              </span>
                            </Button>
                          {/snippet}
                        </Tooltip.Trigger>
                        <Tooltip.Content>
                          <p>
                            {talent.email || talent.userId
                              ? talent.status === 'never'
                                ? 'Crée un compte puis ouvre sa session'
                                : 'Ouvre la session de ce talent'
                              : 'Aucun email — impossible de se connecter'}
                          </p>
                        </Tooltip.Content>
                      </Tooltip.Root>
                    </Tooltip.Provider>
                  </form>
                </div>
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>

    {#if data.totalPages > 1}
      <div class="flex items-center justify-end">
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
      title="Aucun talent"
      description="Aucun talent ne correspond à ces filtres."
    />
  {/if}
</div>

<AlertDialog.Root bind:open={resetOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title class="font-heading text-xl tracking-tight uppercase">
        Réinitialiser l'onboarding
      </AlertDialog.Title>
      <AlertDialog.Description>
        <strong>{resetTarget?.name}</strong> repassera par tout le parcours
        d'onboarding (infos, lycée, intérêts, règlement, charte) et la
        célébration d'arrivée à sa prochaine connexion. Le bonus de +{WELCOME_XP_BONUS}
        XP d'arrivée est annulé pour éviter le cumul. Action immédiate sur des données
        réelles.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={resetting}>Annuler</AlertDialog.Cancel>
      <form
        method="POST"
        action="?/resetOnboarding"
        use:enhance={() => {
          resetting = true;
          return async ({ result, update }) => {
            resetting = false;
            if (result.type === 'success') {
              resetOpen = false;
              toast.success('Onboarding réinitialisé');
              await update();
            } else {
              toast.error(
                (result.type === 'failure' &&
                  (result.data?.message as string)) ||
                  'Échec de la réinitialisation.',
              );
            }
          };
        }}
      >
        <input type="hidden" name="talentId" value={resetTarget?.id ?? ''} />
        <AlertDialog.Action
          type="submit"
          disabled={resetting}
          class={buttonVariants({ variant: 'default' })}
        >
          {#if resetting}
            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" /> Réinitialisation…
          {:else}
            Réinitialiser
          {/if}
        </AlertDialog.Action>
      </form>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
