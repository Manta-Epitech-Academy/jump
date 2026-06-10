<script lang="ts">
  import Funnel from '@lucide/svelte/icons/funnel';
  import LogIn from '@lucide/svelte/icons/log-in';
  import Users from '@lucide/svelte/icons/users';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import UserX from '@lucide/svelte/icons/user-x';
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import FilterX from '@lucide/svelte/icons/filter-x';
  import Zap from '@lucide/svelte/icons/zap';
  import Bomb from '@lucide/svelte/icons/bomb';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Mail from '@lucide/svelte/icons/mail';
  import Phone from '@lucide/svelte/icons/phone';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import SegmentedFilter, {
    type SegmentOption,
  } from '$lib/components/staff/SegmentedFilter.svelte';
  import SearchableSelect, {
    type SelectOption,
  } from '$lib/components/staff/SearchableSelect.svelte';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import * as Table from '$lib/components/ui/table';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import type { ColumnDef } from '$lib/components/staff/datatable/types';
  import * as Select from '$lib/components/ui/select';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import StudentAvatarItem from '$lib/components/students/StudentAvatarItem.svelte';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import { NIVEAUX, niveauLabel } from '$lib/domain/niveau';
  import { EVENT_TYPES, EVENT_TYPE_LABELS } from '$lib/domain/event';
  import { formatPersonName } from '$lib/domain/profile';
  import { track } from '$lib/analytics';

  let { data } = $props();

  let searchQuery = $state(page.url.searchParams.get('q') || '');
  let searchTimeout: ReturnType<typeof setTimeout>;
  let impersonating = $state<string | null>(null);

  // Factory-reset (back to worker-import state) confirm dialog. Gated behind
  // typing the talent's name: it irreversibly wipes real prod data (XP,
  // minigames, files, account, event history), so it gets a heavier guard than
  // the onboarding reset above.
  let wipeOpen = $state(false);
  let wiping = $state(false);
  let wipeTarget = $state<{ id: string; name: string } | null>(null);
  let wipeConfirm = $state('');
  const wipeConfirmed = $derived(
    wipeTarget !== null && wipeConfirm.trim() === wipeTarget.name,
  );

  function askWipe(talent: { id: string; prenom: string; nom: string }) {
    wipeTarget = { id: talent.id, name: `${talent.prenom} ${talent.nom}` };
    wipeConfirm = '';
    wipeOpen = true;
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

  // Parent completion chip (règlement co-signature + droit à l'image), tinted
  // like the account-status chip: complete reads calm (teal), en attente flags
  // a parent still to chase (orange).
  const PARENT_STATUS = {
    complete: {
      label: 'Complet',
      class: 'border-epi-teal/30 bg-epi-teal/10 text-epi-teal-solid',
    },
    pending: {
      label: 'En attente',
      class: 'border-epi-orange/30 bg-epi-orange/10 text-epi-orange',
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
  // Mirrors the three states of the table's Statut column, so filtering and the
  // badge speak the same language: complete onboarding, mid-onboarding, no account.
  const statutOptions: SegmentOption[] = [
    { value: 'all', label: 'Tous' },
    { value: 'active', label: 'Actifs' },
    { value: 'onboarding', label: 'Onboarding' },
    { value: 'never', label: 'Jamais connectés' },
  ];
  // Parent completion status: "En attente" = règlement not co-signed or
  // image-rights not decided (the blocked parents the SMS relance targets);
  // "Complet" = both done. Filtering to "En attente" + the toolbar count is the
  // before/after-relance stat. Only talents with a parent on file land in either
  // bucket. Mirrors the server `parentStatus` filter.
  const parentStatusOptions: SegmentOption[] = [
    { value: 'all', label: 'Tous' },
    { value: 'pending', label: 'En attente' },
    { value: 'complete', label: 'Complet' },
  ];

  // `status` defaults to 'all' server-side; the others are empty when inactive.
  const hasActiveFilters = $derived(
    Boolean(
      data.filters.q ||
      data.filters.type ||
      data.filters.niveau ||
      data.filters.campus ||
      data.filters.parentStatus,
    ) || data.filters.status !== 'all',
  );

  function resetFilters() {
    searchQuery = '';
    goto(page.url.pathname, { keepFocus: true });
  }

  function onSearchInput(value: string) {
    searchQuery = value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => navigateWithParams({ q: value }), 300);
  }

  const columns: ColumnDef[] = [
    { key: 'nom', label: 'Talent', sortable: true },
    { key: 'niveau', label: 'Niveau', sortable: true },
    { key: 'campus', label: 'Campus' },
    { key: 'parent', label: 'Responsable' },
    { key: 'xp', label: 'Progression', sortable: true },
    { key: 'statut', label: 'Statut' },
    { key: 'activite', label: 'Activité', sortable: true },
    { key: 'action', label: 'Action', align: 'right' },
  ];

  // Server-side sort: clicking a header swaps `?sort=&dir=` and reloads. The
  // baseline (no `sort` param) keeps the most-recently-active-first ordering.
  function toggleSort(key: string) {
    const nextDir =
      data.filters.sort === key && data.filters.dir === 'asc' ? 'desc' : 'asc';
    navigateWithParams({ sort: key, dir: nextDir });
  }

  const countSuffix = $derived(
    hasActiveFilters
      ? data.totalItems > 1
        ? 'correspondent aux filtres'
        : 'correspond aux filtres'
      : 'au total',
  );

  // Campus list can be long, so it gets a searchable select.
  const campusOptions = $derived<SelectOption[]>(
    data.campuses.map((c) => ({ value: c.id, label: c.name })),
  );

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

  <!-- Filter toolbar — search + filtered count on the shared DataTableToolbar,
       with the admin-specific composing filters dropped into its snippet. Type
       and Statut are independent segmented radios; niveau/campus stay dropdowns
       (too many options for a segmented control). -->
  <DataTableToolbar
    searchValue={searchQuery}
    {onSearchInput}
    searchPlaceholder="Rechercher par nom ou email…"
    count={data.totalItems}
    countNoun="talent"
    {countSuffix}
  >
    {#snippet filters()}
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
          value={data.filters.status}
          onChange={(v) => navigateWithParams({ status: v === 'all' ? '' : v })}
        />
      </div>

      <div class="flex items-center gap-2">
        <span
          class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          Parent
        </span>
        <SegmentedFilter
          ariaLabel="Filtrer par statut du parent"
          options={parentStatusOptions}
          value={data.filters.parentStatus || 'all'}
          onChange={(v) =>
            navigateWithParams({ parentStatus: v === 'all' ? '' : v })}
        />
      </div>

      <div class="w-52">
        <Select.Root
          type="single"
          value={data.filters.niveau || 'all'}
          onValueChange={(v) =>
            navigateWithParams({ niveau: v === 'all' ? '' : v })}
        >
          <Select.Trigger class="w-full rounded-sm">
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

      <div class="w-52">
        <SearchableSelect
          options={campusOptions}
          value={data.filters.campus || 'all'}
          onChange={(v) => navigateWithParams({ campus: v === 'all' ? '' : v })}
          allLabel="Tous les campus"
          placeholder="Tous les campus"
          searchPlaceholder="Rechercher un campus…"
          emptyLabel="Aucun campus."
          triggerClass="w-full"
        >
          {#snippet icon()}
            <Funnel class="h-4 w-4 text-muted-foreground" />
          {/snippet}
        </SearchableSelect>
      </div>
    {/snippet}

    {#snippet countActions()}
      {#if hasActiveFilters}
        <Button
          variant="ghost"
          size="sm"
          onclick={resetFilters}
          class="h-7 px-2 text-muted-foreground hover:text-foreground"
        >
          <FilterX class="mr-1.5 h-4 w-4" />
          Réinitialiser
        </Button>
      {/if}
    {/snippet}
  </DataTableToolbar>

  <SortableTable
    {columns}
    rows={data.talents}
    sortKey={data.filters.sort || null}
    sortDir={data.filters.dir}
    onSort={toggleSort}
    rowKey={(t) => t.id}
  >
    {#snippet row(talent)}
      <Table.Cell>
        <StudentAvatarItem student={talent} subText={talent.email} />
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
        {#if talent.parent}
          <div class="flex flex-col items-start gap-0.5">
            <span class="text-sm">
              {formatPersonName(talent.parent.prenom, talent.parent.nom) || '—'}
            </span>
            {#if talent.parent.email}
              <div class="flex items-center gap-1">
                <a
                  href={`mailto:${talent.parent.email}`}
                  class="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-epi-blue"
                >
                  <Mail class="h-3 w-3 shrink-0" />
                  <span class="max-w-[13rem] truncate"
                    >{talent.parent.email}</span
                  >
                </a>
                <CopyButton
                  value={talent.parent.email}
                  label="Copier l'email du responsable"
                />
              </div>
            {/if}
            {#if talent.parent.phone}
              <a
                href={`tel:${talent.parent.phone.replace(/\s+/g, '')}`}
                class="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-epi-blue"
              >
                <Phone class="h-3 w-3 shrink-0" />
                <span>{talent.parent.phone}</span>
              </a>
            {/if}
            {#if talent.parentStatus}
              <span
                class="mt-0.5 inline-flex w-fit rounded-sm border px-1.5 py-0 text-[10px] font-bold uppercase {PARENT_STATUS[
                  talent.parentStatus
                ].class}"
              >
                {PARENT_STATUS[talent.parentStatus].label}
              </span>
            {/if}
          </div>
        {:else}
          <span class="text-sm text-muted-foreground">Aucun parent</span>
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
          <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="ghost"
                    size="icon"
                    class="text-muted-foreground hover:text-destructive"
                    onclick={() => askWipe(talent)}
                  >
                    <Bomb class="h-4 w-4" />
                  </Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content>
                <p>Réinitialiser complètement (état import)</p>
              </Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>

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
    {/snippet}

    {#snippet empty()}
      <EmptyState
        icon={Users}
        title="Aucun talent"
        description="Aucun talent ne correspond à ces filtres."
      />
    {/snippet}
  </SortableTable>

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
</div>

<AlertDialog.Root bind:open={wipeOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title class="font-heading text-xl tracking-tight uppercase">
        Réinitialiser complètement
      </AlertDialog.Title>
      <AlertDialog.Description>
        <strong>{wipeTarget?.name}</strong> revient à l'état exact d'un import
        Salesforce. Tout ce qui a été accumulé après l'import est
        <strong>supprimé définitivement</strong> : XP, minigames, fichiers et PDF
        signés, onboarding, contacts d'urgence, droits à l'image, règlement, historique
        d'événements, et le compte de connexion (ainsi que celui d'un parent créé
        pendant les tests). Sont conservés : l'identité Salesforce (nom, email, niveau,
        lycée, ré-alignés sur le miroir SF) et les participations aux événements.
        Action immédiate et irréversible sur des données réelles.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <div class="space-y-2">
      <label for="wipe-confirm" class="text-sm text-muted-foreground">
        Tape <strong class="text-foreground">{wipeTarget?.name}</strong> pour confirmer.
      </label>
      <Input
        id="wipe-confirm"
        bind:value={wipeConfirm}
        autocomplete="off"
        placeholder={wipeTarget?.name ?? ''}
        class="rounded-sm"
      />
    </div>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={wiping}>Annuler</AlertDialog.Cancel>
      <form
        method="POST"
        action="?/resetToImport"
        use:enhance={() => {
          wiping = true;
          return async ({ result, update }) => {
            wiping = false;
            if (result.type === 'success') {
              wipeOpen = false;
              toast.success("Talent réinitialisé à l'état import");
              await update();
            } else {
              toast.error(
                (result.type === 'failure' &&
                  (result.data?.message as string)) ||
                  'Échec de la réinitialisation complète.',
              );
            }
          };
        }}
      >
        <input type="hidden" name="talentId" value={wipeTarget?.id ?? ''} />
        <AlertDialog.Action
          type="submit"
          disabled={wiping || !wipeConfirmed}
          class={buttonVariants({ variant: 'destructive' })}
        >
          {#if wiping}
            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" /> Réinitialisation…
          {:else}
            Tout réinitialiser
          {/if}
        </AlertDialog.Action>
      </form>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
