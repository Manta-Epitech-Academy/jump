<script lang="ts">
  import LogIn from '@lucide/svelte/icons/log-in';
  import Users from '@lucide/svelte/icons/users';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import UsersRound from '@lucide/svelte/icons/users-round';
  import UserX from '@lucide/svelte/icons/user-x';
  import Download from '@lucide/svelte/icons/download';
  import Zap from '@lucide/svelte/icons/zap';
  import Bomb from '@lucide/svelte/icons/bomb';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Phone from '@lucide/svelte/icons/phone';
  import Pencil from '@lucide/svelte/icons/pencil';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import ActiveFilterChips from '$lib/components/staff/ActiveFilterChips.svelte';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import * as Table from '$lib/components/ui/table';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import Pagination from '$lib/components/staff/datatable/Pagination.svelte';
  import type { ColumnDef } from '$lib/components/staff/datatable/types';
  import { facetControls } from '$lib/components/staff/datatable/facetControls';
  import { offerFacets } from '$lib/domain/listFacets';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import StudentAvatarItem from '$lib/components/students/StudentAvatarItem.svelte';
  import StudentContactDialog from '$lib/components/students/StudentContactDialog.svelte';
  import EditParentEmailDialog from '../EditParentEmailDialog.svelte';
  import type { ContactPerson } from '$lib/domain/contact';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import { niveauLabel } from '$lib/domain/niveau';
  import { formatPersonName, civiliteCourtesyTitle } from '$lib/domain/profile';
  import {
    TALENT_STATUS_LABELS,
    PARENT_STATUS_LABELS,
    NO_DOSSIER_HINT,
    type TalentAccountStatus,
  } from '../labels';
  import { track } from '$lib/analytics';
  import type { TalentsCohort } from '../query';
  import {
    parseTalentFilters,
    TALENTS_SORT_DEFAULT_DIR,
    TALENTS_VIEW,
    type TalentsSortKey,
  } from '../view';
  import { nextSort } from '$lib/components/staff/datatable/sort';
  import {
    clearListFilters,
    goToListPage,
    setListParams,
  } from '$lib/components/staff/datatable/urlList';
  import { createUrlSearch } from '$lib/components/staff/datatable/urlSearch.svelte';
  import { lastActiveLabel } from '$lib/components/staff/lastActive';

  // The streamed cohort payload. This component owns every data-dependent
  // surface (KPI tiles, toolbar, table, pagination and the row dialogs), so it
  // mounts only once the cohort resolves behind the page shell.
  let { talents, facetCounts, totalItems, totalPages, stats }: TalentsCohort =
    $props();

  // The view lives in the address (`../view`); read here, the sort, the page
  // and the ticked values answer the click before the server does. The counts
  // come with the cohort, over the whole directory, and go through the rules
  // the server applied to them (`offerFacets`).
  const view = $derived(parseTalentFilters(page.url.searchParams));
  const search = createUrlSearch();
  const facets = $derived(offerFacets(facetCounts, view.facets));
  const controls = $derived(
    facetControls(facets, (facet, values) =>
      setListParams(TALENTS_VIEW.facetParams(facet, values)),
    ),
  );
  let impersonating = $state<string | null>(null);

  // Log in as a talent through the shared admin endpoint: the same one the
  // users page drives for staff, so both paths bootstrap the account + forward
  // the session cookie identically.
  async function impersonate(talentId: string) {
    if (impersonating) return;
    impersonating = talentId;
    try {
      const res = await fetch(resolve('/staff/admin/impersonate'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'talent',
          id: talentId,
          reason: 'person',
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        track('impersonation_failed');
        toast.error(
          body?.message ?? 'Impossible de se connecter en tant que ce talent.',
        );
        return;
      }
      const { redirect } = (await res.json()) as { redirect: string };
      track('impersonation_started', { targetRole: 'talent' });
      // Full-page nav so the new session cookie is read fresh and guards
      // re-evaluate.
      window.location.href = redirect;
    } catch (err) {
      console.error(err);
      track('impersonation_failed');
      toast.error('Impossible de se connecter en tant que ce talent.');
    } finally {
      impersonating = null;
    }
  }

  // Factory-reset (back to worker-import state) confirm dialog. Gated behind
  // typing the talent's name: it irreversibly wipes real prod data (XP,
  // minigames, files, the login history, event history), so it gets a heavier
  // guard than an ordinary confirmation.
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

  // Contact dialog: full coordinates (élève + responsables) live behind a
  // per-row button so the table rows stay one line tall.
  let contactOpen = $state(false);
  let contactTarget = $state<{
    student: ContactPerson;
    guardians: ContactPerson[];
  } | null>(null);

  function openContact(talent: {
    prenom: string | null;
    nom: string | null;
    civilite: string | null;
    email: string | null;
    phone: string | null;
    guardians: ContactPerson[];
  }) {
    contactTarget = {
      student: {
        civilite: talent.civilite,
        prenom: talent.prenom,
        nom: talent.nom,
        email: talent.email,
        phone: talent.phone,
      },
      guardians: talent.guardians,
    };
    contactOpen = true;
  }

  // Edit-parent-1-email dialog. Opened from the Parent column so an admin can
  // fix a wrong address the parent was locked out by; the action keeps the
  // parent's login account in sync.
  let editParentOpen = $state(false);
  let editParentTarget = $state<{
    id: string;
    parentEmail: string | null;
    parentName: string | null;
  } | null>(null);

  function openEditParent(talent: {
    id: string;
    parentEmail: string | null;
    parentPrenom: string | null;
    parentNom: string | null;
  }) {
    editParentTarget = {
      id: talent.id,
      parentEmail: talent.parentEmail,
      parentName:
        [talent.parentPrenom, talent.parentNom].filter(Boolean).join(' ') ||
        null,
    };
    editParentOpen = true;
  }

  // Status chip tints (labels are single-sourced in ./labels so the table and
  // the XLSX export read the same words). `active` = onboarding complete.
  // `no_dossier` is deliberately the quietest of the four: it is not a state
  // anyone chases, unlike "Jamais connecté", and tinting it would put visual
  // urgency on a row that needs none.
  const STATUS_CLASS: Record<TalentAccountStatus, string> = {
    active: 'border-epi-tech/30 bg-epi-tech/10 text-epi-tech-ink',
    pending: 'border-epi-together/30 bg-epi-together/10 text-epi-together',
    never: 'border-border bg-muted text-muted-foreground',
    no_dossier: 'border-dashed border-border text-muted-foreground',
  };

  // Parent completion chip (règlement co-signature + droit à l'image), tinted
  // like the account-status chip: complete reads calm (teal), en attente flags
  // a parent still to chase (orange).
  const PARENT_STATUS_CLASS = {
    complete: 'border-epi-tech/30 bg-epi-tech/10 text-epi-tech-ink',
    pending: 'border-epi-together/30 bg-epi-together/10 text-epi-together',
  } as const;

  // KPI tiles report the *scoped* population (campus multiselect + type + niveau
  // + search), so the admin can read onboarding progress for a chosen set of
  // campuses; the status/parent breakdown filters narrow the table, not the
  // tiles. `pct` guards the empty-scope divide-by-zero.
  const pct = (value: number, total: number) =>
    total > 0 ? Math.round((value * 100) / total) : 0;

  // Whether the "jamais connectés" tile's filter is active (it drills into
  // Statut=Jamais connecté), so the tile renders pressed.
  const neverConnectedActive = $derived(
    view.facets.statut.length === 1 && view.facets.statut[0] === 'never',
  );

  // Current filter querystring, forwarded to the export endpoint so the
  // download honours exactly what's on screen. `page` is harmless (export
  // ignores pagination). Built off the absolute pathname, not a `./export`
  // relative href: the route has no trailing slash, so `./` would resolve
  // against /staff/admin/ and 404.
  const exportHref = $derived(
    `${page.url.pathname}/export?${page.url.searchParams.toString()}`,
  );

  const hasActiveFilters = $derived(
    controls.chips.length > 0 || search.value.trim().length > 0,
  );

  // Clears the filters and the search, keeps the sort.
  function resetFilters() {
    clearListFilters(TALENTS_VIEW.clearedFacetParams(), search);
  }

  // One control per column: the name, the XP and the last activity sort, the
  // niveau, the campus, the parent and the account state filter.
  const columns = $derived.by<ColumnDef[]>(() => {
    const sortable = (key: TalentsSortKey) => ({
      key,
      sortable: true,
      defaultSortDir: TALENTS_SORT_DEFAULT_DIR[key],
    });
    return [
      { ...sortable('nom'), label: 'Talent' },
      { key: 'niveau', label: 'Niveau', filter: controls.filterOf('niveau') },
      { key: 'campus', label: 'Campus', filter: controls.filterOf('campus') },
      { key: 'parent', label: 'Parent', filter: controls.filterOf('parent') },
      { ...sortable('xp'), label: 'Progression' },
      { key: 'statut', label: 'Statut', filter: controls.filterOf('statut') },
      { ...sortable('activite'), label: 'Activité' },
      { key: 'action', label: 'Action', align: 'right' },
    ];
  });

  // Server-side sort: clicking a header swaps `?sort=&dir=` and reloads. The
  // baseline (no `sort` param) is the most-recently-active-first ordering.
  function toggleSort(key: string) {
    const next = nextSort<TalentsSortKey>(
      columns,
      { key: view.sort, dir: view.dir },
      key,
    );
    setListParams(TALENTS_VIEW.sortParams(next.key, next.dir));
  }
</script>

<div class="space-y-6">
  <!-- Onboarding KPIs, scoped to the active campus/type/niveau/search filters
       so the admin reads progress for the chosen cohort. -->
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <KpiTile
      label="Total"
      value={stats.scopedTotal}
      sub="Dans le périmètre filtré"
      tone="neutral"
      icon={Users}
    />
    <KpiTile
      label="Talents onboardés"
      value={stats.onboarded}
      total={stats.scopedTotal}
      progress={pct(stats.onboarded, stats.scopedTotal)}
      sub="Parcours talent terminé"
      helpText="Onboarding plateforme bouclé : profil rempli, règlement et charte signés."
      tone="teal"
      icon={UserCheck}
    />
    <KpiTile
      label="Parents complets"
      value={stats.parentsComplete}
      total={stats.withParent}
      progress={pct(stats.parentsComplete, stats.withParent)}
      sub="Parmi les talents avec un parent"
      helpText="Parent ayant co-signé le règlement et tranché le droit à l'image."
      tone="teal"
      icon={UsersRound}
    />
    <KpiTile
      label="Jamais connectés"
      value={stats.neverConnected}
      sub="Aucun compte créé"
      helpText="Talent importé sans compte de connexion : jamais venu sur la plateforme. Cliquez pour filtrer."
      tone="orange"
      icon={UserX}
      onclick={() =>
        setListParams({
          ...TALENTS_VIEW.facetParams('statut', ['never']),
          ...TALENTS_VIEW.facetParams('parent', []),
        })}
      pressed={neverConnectedActive}
    />
  </div>

  <!-- Search + filtered count on the shared DataTableToolbar; the filters sit
       in the headers of the columns they filter. -->
  <DataTableToolbar
    searchValue={search.value}
    onSearchInput={(v) => (search.value = v)}
    searchPlaceholder="Rechercher par nom ou email…"
    count={totalItems}
    countNoun="talent"
    filtersApplied={hasActiveFilters}
  >
    {#snippet actions()}
      <!-- Re-derives the filter set server-side and exports every matching row
           (the table only holds the current page of 50). -->
      <a
        href={exportHref}
        data-sveltekit-preload-data="off"
        class={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        <Download class="mr-1.5 h-4 w-4" />
        Exporter (XLSX)
      </a>
    {/snippet}
  </DataTableToolbar>

  <ActiveFilterChips chips={controls.chips} {search} onReset={resetFilters} />

  <SortableTable
    {columns}
    rows={talents}
    sortKey={view.sort}
    sortDir={view.dir}
    onSort={toggleSort}
    rowKey={(t) => t.id}
    onResetFilters={hasActiveFilters ? resetFilters : undefined}
  >
    {#snippet row(talent)}
      <Table.Cell>
        <div class="flex items-center justify-between gap-2">
          <StudentAvatarItem
            student={talent}
            subText={talent.email}
            courtesyTitle={civiliteCourtesyTitle(talent.civilite)}
          />
          <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8 shrink-0 rounded-sm text-muted-foreground hover:bg-epi-blue/10 hover:text-epi-blue"
                    onclick={() => openContact(talent)}
                    aria-label={`Coordonnées de ${formatPersonName(talent.prenom, talent.nom)}`}
                  >
                    <Phone class="h-4 w-4" />
                  </Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content>
                <p>Coordonnées</p>
              </Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>
      </Table.Cell>
      <Table.Cell>
        {#if talent.niveau}
          <Badge
            variant="secondary"
            class="rounded-sm bg-epi-blue/5 px-2 py-0 epi-chip text-epi-blue"
          >
            {niveauLabel(talent.niveau)}
          </Badge>
        {:else}
          <span class="text-sm text-muted-foreground">-</span>
        {/if}
      </Table.Cell>
      <Table.Cell>
        {#if talent.campus}
          <span class="text-sm">{talent.campus}</span>
        {:else}
          <span class="text-sm text-muted-foreground">-</span>
        {/if}
      </Table.Cell>
      <Table.Cell>
        <div class="flex items-center gap-1.5">
          {#if talent.parentStatus}
            <span
              class="inline-flex w-fit rounded-sm border px-2 py-0.5 epi-chip {PARENT_STATUS_CLASS[
                talent.parentStatus
              ]}"
            >
              {PARENT_STATUS_LABELS[talent.parentStatus]}
            </span>
          {:else if talent.guardians.length > 0}
            <span class="text-sm text-muted-foreground">-</span>
          {:else}
            <span class="text-sm text-muted-foreground">Aucun parent</span>
          {/if}
          <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7 shrink-0 rounded-sm text-muted-foreground hover:bg-epi-blue/10 hover:text-epi-blue"
                    onclick={() => openEditParent(talent)}
                    aria-label="Modifier l'email du parent"
                  >
                    <Pencil class="h-3.5 w-3.5" />
                  </Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content>
                <p>Modifier l'email de connexion du parent</p>
              </Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>
      </Table.Cell>
      <Table.Cell>
        <div class="flex items-center gap-2">
          <Zap class="h-3.5 w-3.5 text-epi-tomorrow" />
          <span class="text-sm font-bold">{talent.xp}</span>
          <span class="text-xs text-muted-foreground">
            · {talent.eventsCount} évé{talent.eventsCount > 1
              ? 'nements'
              : 'nement'}
          </span>
        </div>
        <span class="epi-chip text-muted-foreground">
          {talent.level}
        </span>
      </Table.Cell>
      <Table.Cell>
        <div class="flex flex-col items-start gap-0.5">
          {#if talent.status === 'no_dossier'}
            <Tooltip.Provider delayDuration={300}>
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <span
                      {...props}
                      class="inline-flex rounded-sm border px-2 py-0.5 epi-chip {STATUS_CLASS[
                        talent.status
                      ]}"
                    >
                      {TALENT_STATUS_LABELS[talent.status]}
                    </span>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content>{NO_DOSSIER_HINT}</Tooltip.Content>
              </Tooltip.Root>
            </Tooltip.Provider>
          {:else}
            <span
              class="inline-flex rounded-sm border px-2 py-0.5 epi-chip {STATUS_CLASS[
                talent.status
              ]}"
            >
              {TALENT_STATUS_LABELS[talent.status]}
            </span>
          {/if}
          {#if talent.onboardingStep}
            <span class="text-xs text-muted-foreground">
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
                    aria-label="Réinitialiser {talent.prenom} {talent.nom} à l'état import"
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

          <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="ghost"
                    size="sm"
                    class="gap-1.5 text-muted-foreground hover:text-epi-tomorrow"
                    disabled={impersonating === talent.id ||
                      (!talent.email && !talent.userId)}
                    onclick={() => impersonate(talent.id)}
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
                    : 'Aucun email : impossible de se connecter'}
                </p>
              </Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>
      </Table.Cell>
    {/snippet}
  </SortableTable>

  <Pagination page={view.page} {totalPages} onPageChange={goToListPage} />
</div>

<StudentContactDialog
  bind:open={contactOpen}
  student={contactTarget?.student ?? null}
  guardians={contactTarget?.guardians ?? []}
/>

<EditParentEmailDialog bind:open={editParentOpen} talent={editParentTarget} />

<AlertDialog.Root bind:open={wipeOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Réinitialiser complètement</AlertDialog.Title>
      <AlertDialog.Description>
        <strong>{wipeTarget?.name}</strong> revient à l'état d'un import
        Salesforce. Tout ce qui a été accumulé depuis est
        <strong>supprimé définitivement</strong> : XP, entraînements, activités en
        ligne, présences, onboarding et PDF signés, responsables légaux et leurs décisions
        (règlement, droit à l'image), centres d'intérêt, bilans et closings. Sont
        conservés : l'identité Salesforce (nom, téléphone, niveau et lycée, réalignés
        sur Salesforce), les participations, les notes de l'équipe, les demandes de
        suppression et le compte de connexion, dont les sessions sont fermées. Le
        compte d'un parent créé pendant les tests est supprimé s'il ne sert à aucun
        autre talent. Action immédiate et irréversible sur des données réelles.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <div class="space-y-2">
      <label for="wipe-confirm" class="text-sm text-muted-foreground">
        Tapez <strong class="text-foreground">{wipeTarget?.name}</strong> pour confirmer.
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
