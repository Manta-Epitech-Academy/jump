<script lang="ts">
  import { enhance } from '$app/forms';
  import * as Card from '$lib/components/ui/card';
  import * as Table from '$lib/components/ui/table';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { Badge } from '$lib/components/ui/badge';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import Pagination from '$lib/components/staff/datatable/Pagination.svelte';
  import SalesforceIconLink from '$lib/components/salesforce/SalesforceIconLink.svelte';
  import CloudDownload from '@lucide/svelte/icons/cloud-download';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import CheckCheck from '@lucide/svelte/icons/check-check';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Link2Off from '@lucide/svelte/icons/link-2-off';
  import Wrench from '@lucide/svelte/icons/wrench';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { toast } from 'svelte-sonner';
  import { civiliteLabel } from '$lib/domain/profile';
  import { FIELD_LABELS, type DiffField } from '$lib/domain/reconciliation';
  import {
    VERDICT_LABELS,
    ACTION_LABELS,
    actionForVerdict,
    natureLabel,
    type AuthConflict,
    type AuthAccountSummary,
    type AuthRepairAction,
  } from '$lib/domain/authIdentity';
  import type { SfConflictsData } from './types';
  import SfExportMenu from './SfExportMenu.svelte';
  import CodeTag from '$lib/components/layout/CodeTag.svelte';

  // The streamed reconciliation payload plus the shell's search box value. This
  // component owns every data-dependent projection, both tabs and the two repair
  // dialogs, so it mounts only once the scans resolve and stays the single home
  // for the heavy UI. `query` stays in the shell so the search box is usable while
  // the scans are still running.
  let {
    diffs,
    enrichment,
    authConflicts,
    query,
    lastExportAt,
  }: SfConflictsData & { query: string; lastExportAt: string | null } =
    $props();

  function displayValue(field: DiffField, value: string | null): string {
    if (!value) return '—';
    if (field === 'civilite') return civiliteLabel(value);
    return value;
  }

  // ── Search ──────────────────────────────────────────────────────────────
  // One box (owned by the shell) filters every tab's list by name or email.
  const needle = $derived(query.trim().toLowerCase());
  const matches = (prenom: string, nom: string, email: string | null) =>
    needle === '' ||
    `${prenom} ${nom} ${email ?? ''}`.toLowerCase().includes(needle);

  // ════════════════════════════════════════════════════════════════════════
  //  DATA tab — Talent ⇆ TalentSfImport field diffs (unchanged behaviour)
  // ════════════════════════════════════════════════════════════════════════
  type ConflictRow = {
    talentId: string;
    prenom: string;
    nom: string;
    email: string | null;
    externalId: string | null;
    field: DiffField;
    jump: string;
    sf: string;
    jumpKey: string | null;
    sfKey: string | null;
  };

  const conflicts = $derived<ConflictRow[]>(
    diffs.flatMap((t) =>
      t.diffs
        .filter((d) => d.kind === 'conflict')
        .map((d) => ({
          talentId: t.talentId,
          prenom: t.prenom,
          nom: t.nom,
          email: t.email,
          externalId: t.externalId,
          field: d.field,
          jump: displayValue(d.field, d.jump),
          sf: displayValue(d.field, d.sf),
          jumpKey: d.jumpKey ?? null,
          sfKey: d.sfKey ?? null,
        })),
    ),
  );
  const visibleConflicts = $derived(
    conflicts.filter((c) => matches(c.prenom, c.nom, c.email)),
  );

  type PushItem = {
    label: string;
    value: string;
    uai: string | null;
    origin: 'field' | 'parent';
  };
  type PushGroup = {
    talentId: string;
    prenom: string;
    nom: string;
    email: string | null;
    externalId: string | null;
    items: PushItem[];
  };

  const pushGroups = $derived.by<PushGroup[]>(() => {
    const map = new Map<string, PushGroup>();
    const ensure = (t: {
      talentId: string;
      prenom: string;
      nom: string;
      email: string | null;
      externalId: string | null;
    }) => {
      let g = map.get(t.talentId);
      if (!g) {
        g = { ...t, items: [] };
        map.set(t.talentId, g);
      }
      return g;
    };

    for (const t of diffs)
      for (const d of t.diffs)
        if (d.kind === 'missing')
          ensure(t).items.push({
            label: FIELD_LABELS[d.field],
            value: displayValue(d.field, d.jump),
            uai: d.jumpKey ?? null,
            origin: 'field',
          });

    for (const t of enrichment)
      for (const f of t.fields)
        ensure(t).items.push({
          label: f.label,
          value: f.value,
          uai: null,
          origin: 'parent',
        });

    return [...map.values()].sort(
      (a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom),
    );
  });
  const visiblePushGroups = $derived(
    pushGroups.filter((g) => matches(g.prenom, g.nom, g.email)),
  );

  const conflictCount = $derived(conflicts.length);
  const pushFieldCount = $derived(
    pushGroups.reduce((n, g) => n + g.items.length, 0),
  );
  const dataCount = $derived(conflictCount + pushFieldCount);
  const hasData = $derived(dataCount > 0);

  // One confirmation instant per talent who appears in the export (the most
  // recent across their diff + enrichment rows), feeding the export menu's
  // per-period counts. Built off the already-resolved scans, so the menu never
  // runs its own query and its "(N talents)" matches what the CSV carries.
  const exportTimeline = $derived.by(() => {
    const byTalent = new Map<string, string>();
    const bump = (id: string, iso: string) => {
      const cur = byTalent.get(id);
      if (!cur || iso > cur) byTalent.set(id, iso);
    };
    for (const t of diffs) bump(t.talentId, t.confirmedAt);
    for (const t of enrichment) bump(t.talentId, t.confirmedAt);
    return [...byTalent.values()].map((confirmedAt) => ({ confirmedAt }));
  });

  // ── Adopt-Salesforce confirm ──────────────────────────────────────────────
  let adoptOpen = $state(false);
  let adopting = $state(false);
  let adoptTarget = $state<ConflictRow | null>(null);

  function askAdopt(c: ConflictRow) {
    adoptTarget = c;
    adoptOpen = true;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  AUTH tab — Talent ⇆ bauth_user identity drift, with per-verdict repairs
  // ════════════════════════════════════════════════════════════════════════
  const visibleAuth = $derived(
    authConflicts.filter((c) => matches(c.prenom, c.nom, c.targetEmail)),
  );
  const authCount = $derived(authConflicts.length);
  const authExposureCount = $derived(
    authConflicts.filter((c) => c.exposureRisk).length,
  );

  // Client-side pagination. The streamed payload is whole-cohort, so all three
  // lists (conflicts to arbitrate, fields to push, identity conflicts) could each
  // run to hundreds of rows × multiple fields — rendering them all at once made
  // this the longest page in the admin space. The data is already in memory, so
  // page it here; the CSV export stays exhaustive regardless of the page shown.
  const PER_PAGE = 25;
  let conflictsPage = $state(1);
  let pushPage = $state(1);
  let authPage = $state(1);
  // A new search resets every list to its first page so a narrowed result can't
  // strand the admin on an out-of-range page.
  $effect(() => {
    void needle;
    conflictsPage = 1;
    pushPage = 1;
    authPage = 1;
  });

  const conflictsTotalPages = $derived(
    Math.ceil(visibleConflicts.length / PER_PAGE),
  );
  const pagedConflicts = $derived(
    visibleConflicts.slice(
      (conflictsPage - 1) * PER_PAGE,
      conflictsPage * PER_PAGE,
    ),
  );
  const pushTotalPages = $derived(
    Math.ceil(visiblePushGroups.length / PER_PAGE),
  );
  const pagedPushGroups = $derived(
    visiblePushGroups.slice((pushPage - 1) * PER_PAGE, pushPage * PER_PAGE),
  );
  const authTotalPages = $derived(Math.ceil(visibleAuth.length / PER_PAGE));
  const pagedAuth = $derived(
    visibleAuth.slice((authPage - 1) * PER_PAGE, authPage * PER_PAGE),
  );

  // Detail rows are revealed on demand (chevron) so the table stays light; the
  // data is already in `authConflicts`, no extra request.
  let expandedAuth = $state<Set<string>>(new Set());
  function toggleAuth(id: string) {
    const next = new Set(expandedAuth);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedAuth = next;
  }

  const fmtDate = (d: Date | string) =>
    new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(d));

  function verdictBadgeClass(c: AuthConflict): string {
    if (c.exposureRisk) return 'border-red-500/50 bg-red-500/10 text-red-600';
    switch (c.verdict) {
      case 'DEGRADED_INVERSION':
      case 'PARENT_HOLDER':
      case 'STAFF_HOLDER':
        return 'border-epi-together/40 text-epi-together';
      case 'SYMMETRIC_INVERSION':
        return 'border-epi-blue/40 text-epi-blue';
      default:
        return 'text-muted-foreground';
    }
  }

  // Confirm dialog for an auth repair.
  let authOpen = $state(false);
  let authBusy = $state(false);
  let authTarget = $state<{
    conflict: AuthConflict;
    action: AuthRepairAction;
  } | null>(null);

  function askAuth(conflict: AuthConflict, action: AuthRepairAction) {
    authTarget = { conflict, action };
    authOpen = true;
  }

  function authDescription(t: {
    conflict: AuthConflict;
    action: AuthRepairAction;
  }): string {
    const c = t.conflict;
    const who = `${c.prenom} ${c.nom}`;
    switch (t.action) {
      case 'repointDrop':
        return `Basculer ${who} sur le compte « ${c.holder?.email} » (où sont ses ${c.holder?.sessions ?? 0} sessions actives) puis supprimer l'ancien compte « ${c.linked.email} ». Les sessions vivantes sont conservées.`;
      case 'swap':
        return `Échanger les emails des deux comptes (inversion symétrique) : ${who} et le talent lié récupèrent chacun le bon email de connexion.`;
      case 'sever':
        return `Couper le lien de ${who} avec le compte « ${c.linked.email} ». La connexion est détachée immédiatement (ferme la fuite) ; ${who} se reliera au bon compte à sa prochaine connexion.`;
    }
  }
</script>

{#snippet accountBlock(
  title: string,
  acc: AuthAccountSummary | null,
  natureText: string,
  exposureNote: string | null,
)}
  <div class="space-y-1">
    <div
      class="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
    >
      {title}
    </div>
    {#if acc}
      <div class="font-mono text-xs break-all">{acc.email}</div>
      <div>{acc.name ?? '—'} · rôle « {acc.role} »</div>
      <div class="text-muted-foreground">
        créé le {fmtDate(acc.createdAt)} · {acc.sessions} session(s) active(s)
      </div>
      <div>Nature : <span class="font-medium">{natureText}</span></div>
      {#if exposureNote}
        <div class="font-medium text-red-600">{exposureNote}</div>
      {/if}
    {:else}
      <div class="text-muted-foreground italic">
        aucun compte ne détient cet email
      </div>
    {/if}
  </div>
{/snippet}

<Tabs.Root value={authExposureCount > 0 ? 'auth' : 'data'} class="w-full">
  <Tabs.List>
    <Tabs.Trigger value="data" class="gap-2">
      Données
      {#if dataCount > 0}
        <span class="font-mono text-xs text-muted-foreground">{dataCount}</span>
      {/if}
    </Tabs.Trigger>
    <Tabs.Trigger value="auth" class="gap-2">
      Connexion / identité
      {#if authExposureCount > 0}
        <span
          class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white"
          title="{authExposureCount} risque(s) d'exposition entre comptes"
        >
          {authCount}
        </span>
      {:else if authCount > 0}
        <span class="font-mono text-xs text-muted-foreground">{authCount}</span>
      {/if}
    </Tabs.Trigger>
  </Tabs.List>

  <!-- ════════════════════ DATA TAB ════════════════════ -->
  <Tabs.Content value="data" class="space-y-6 pt-4">
    <div class="flex items-center justify-between gap-4">
      <p class="text-sm text-muted-foreground">
        L'info confirmée par le talent fait foi. Un <strong>conflit</strong>
        demande un arbitrage ; le reste se <strong>transmet</strong> via le CSV.
      </p>
      {#if hasData}
        <SfExportMenu timeline={exportTimeline} {lastExportAt} />
      {/if}
    </div>

    {#if !hasData}
      <Card.Root>
        <Card.Content class="py-16 text-center">
          <CheckCheck class="mx-auto mb-3 h-8 w-8 text-epi-tech-ink" />
          <p class="text-sm font-medium">Aucune divergence de données.</p>
        </Card.Content>
      </Card.Root>
    {:else}
      <section class="space-y-3">
        <h2 class="font-heading text-display-s">
          Conflits à arbitrer
          <span class="ml-1 font-mono text-sm text-muted-foreground">
            {conflictCount}
          </span>
        </h2>

        {#if conflictCount === 0}
          <Card.Root>
            <Card.Content
              class="py-8 text-center text-sm text-muted-foreground"
            >
              Aucun conflit : Salesforce ne contredit aucune valeur confirmée.
            </Card.Content>
          </Card.Root>
        {:else}
          <Card.Root>
            <Card.Content class="p-0">
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>Talent</Table.Head>
                    <Table.Head>Champ</Table.Head>
                    <Table.Head>Jump (confirmé)</Table.Head>
                    <Table.Head>Salesforce</Table.Head>
                    <Table.Head class="text-right">Action</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {#each pagedConflicts as c (c.talentId + c.field)}
                    <Table.Row>
                      <Table.Cell>
                        <div class="font-medium">{c.prenom} {c.nom}</div>
                        <div
                          class="flex items-center gap-1 font-mono text-xs text-muted-foreground"
                        >
                          {c.email ?? '—'}
                          <SalesforceIconLink
                            externalId={c.externalId}
                            kind="lead"
                            label="Ouvrir le contact dans Salesforce"
                          />
                        </div>
                      </Table.Cell>
                      <Table.Cell class="font-medium">
                        {FIELD_LABELS[c.field]}
                      </Table.Cell>
                      <Table.Cell class="font-medium text-epi-blue">
                        {c.jump}
                        {#if c.jumpKey}
                          <div
                            class="font-mono text-xs font-normal text-muted-foreground"
                          >
                            UAI {c.jumpKey}
                          </div>
                        {/if}
                      </Table.Cell>
                      <Table.Cell class="text-muted-foreground">
                        {c.sf}
                        {#if c.sfKey}
                          <div class="font-mono text-xs">UAI {c.sfKey}</div>
                        {/if}
                      </Table.Cell>
                      <Table.Cell class="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          class="gap-1.5 text-muted-foreground"
                          title="Salesforce a raison : écraser la valeur du talent"
                          onclick={() => askAdopt(c)}
                        >
                          <CloudDownload class="h-3.5 w-3.5" /> Adopter Salesforce
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  {:else}
                    <Table.Row>
                      <Table.Cell
                        colspan={5}
                        class="py-8 text-center text-sm text-muted-foreground"
                      >
                        Aucun conflit pour « {query} ».
                      </Table.Cell>
                    </Table.Row>
                  {/each}
                </Table.Body>
              </Table.Root>
            </Card.Content>
          </Card.Root>
          <Pagination
            page={conflictsPage}
            totalPages={conflictsTotalPages}
            onPageChange={(p) => (conflictsPage = p)}
          />
        {/if}
      </section>

      {#if pushFieldCount > 0}
        <section class="space-y-3">
          <div>
            <h2 class="font-heading text-display-s">
              À transmettre vers Salesforce
              <span class="ml-1 font-mono text-sm text-muted-foreground">
                {pushFieldCount}
              </span>
            </h2>
            <p class="font-mono text-xs tracking-wide text-muted-foreground">
              <CodeTag>poussé via l'export CSV — aucune action ici</CodeTag>
            </p>
          </div>

          <Card.Root>
            <Card.Content class="p-0">
              {#each pagedPushGroups as g (g.talentId)}
                <div class="border-b px-5 py-4 last:border-0">
                  <div class="mb-3 flex items-center gap-2">
                    <span class="font-medium">{g.prenom} {g.nom}</span>
                    <span
                      class="flex items-center gap-1 font-mono text-xs text-muted-foreground"
                    >
                      {g.email ?? '—'}
                      <SalesforceIconLink
                        externalId={g.externalId}
                        kind="lead"
                        label="Ouvrir le contact dans Salesforce"
                      />
                    </span>
                  </div>
                  <dl class="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                    {#each g.items as item (item.label)}
                      <div class="flex items-baseline justify-between gap-3">
                        <dt
                          class="flex items-center gap-1.5 text-sm text-muted-foreground"
                        >
                          {item.label}
                          {#if item.origin === 'parent'}
                            <span
                              class="rounded-full bg-muted px-1.5 py-px text-xs font-medium text-muted-foreground"
                              title="Salesforce n'a pas de champ pour cette donnée"
                            >
                              hors SF
                            </span>
                          {/if}
                        </dt>
                        <dd class="text-right text-sm font-medium">
                          {item.value}
                          {#if item.uai}
                            <div
                              class="font-mono text-xs font-normal text-muted-foreground"
                            >
                              UAI {item.uai}
                            </div>
                          {/if}
                        </dd>
                      </div>
                    {/each}
                  </dl>
                </div>
              {:else}
                <div class="py-8 text-center text-sm text-muted-foreground">
                  Aucune donnée à transmettre pour « {query} ».
                </div>
              {/each}
            </Card.Content>
          </Card.Root>
          <Pagination
            page={pushPage}
            totalPages={pushTotalPages}
            onPageChange={(p) => (pushPage = p)}
          />
        </section>
      {/if}
    {/if}
  </Tabs.Content>

  <!-- ════════════════════ AUTH TAB ════════════════════ -->
  <Tabs.Content value="auth" class="space-y-4 pt-4">
    <p class="max-w-3xl text-sm text-muted-foreground">
      Le compte de connexion d'un talent ne porte plus l'email avec lequel il se
      connecte (changement / inversion Salesforce). Chaque ligne propose la
      <strong>seule résolution sûre pour son verdict</strong>. Une ligne en
      <span class="font-medium text-red-600">rouge</span> est un risque d'exposition
      entre comptes (RGPD) : à traiter en priorité.
    </p>

    {#if authCount === 0}
      <Card.Root>
        <Card.Content class="py-16 text-center">
          <CheckCheck class="mx-auto mb-3 h-8 w-8 text-epi-tech-ink" />
          <p class="text-sm font-medium">Aucun conflit d'identité.</p>
          <p class="text-sm text-muted-foreground">
            Chaque talent lié porte bien son email de connexion.
          </p>
        </Card.Content>
      </Card.Root>
    {:else}
      <Card.Root>
        <Card.Content class="p-0">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Talent</Table.Head>
                <Table.Head>Verdict</Table.Head>
                <Table.Head>Compte lié (obsolète)</Table.Head>
                <Table.Head>Détient l'email cible</Table.Head>
                <Table.Head class="text-right">Action</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each pagedAuth as c (c.talentId)}
                {@const primary = actionForVerdict(c.verdict)}
                <Table.Row class={c.exposureRisk ? 'bg-red-500/5' : ''}>
                  <Table.Cell>
                    <div class="flex items-start gap-2">
                      <button
                        type="button"
                        class="mt-0.5 text-muted-foreground hover:text-foreground"
                        onclick={() => toggleAuth(c.talentId)}
                        aria-label="Afficher les détails"
                        title="Détails des comptes"
                      >
                        {#if expandedAuth.has(c.talentId)}
                          <ChevronDown class="h-4 w-4" />
                        {:else}
                          <ChevronRight class="h-4 w-4" />
                        {/if}
                      </button>
                      <div>
                        <div class="font-medium">{c.prenom} {c.nom}</div>
                        <div
                          class="flex items-center gap-1 font-mono text-xs text-muted-foreground"
                        >
                          {c.targetEmail}
                          <SalesforceIconLink
                            externalId={c.externalId}
                            kind="lead"
                            label="Ouvrir le contact dans Salesforce"
                          />
                        </div>
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge variant="outline" class={verdictBadgeClass(c)}>
                      {#if c.exposureRisk}
                        <TriangleAlert class="mr-1 h-3 w-3" />
                      {/if}
                      {VERDICT_LABELS[c.verdict]}
                    </Badge>
                    {#if c.exposureRisk}
                      <div class="mt-1 text-xs text-red-600">
                        email obsolète = {c.exposureKind === 'parent'
                          ? 'un parent'
                          : c.exposureKind === 'staff'
                            ? 'un staff'
                            : 'un autre talent'}
                      </div>
                    {/if}
                  </Table.Cell>
                  <Table.Cell class="font-mono text-xs text-muted-foreground">
                    {c.linked.email}
                    <div>{c.linked.sessions} session(s)</div>
                  </Table.Cell>
                  <Table.Cell class="font-mono text-xs text-muted-foreground">
                    {#if c.holder}
                      {c.holder.email}
                      <div>{c.holder.sessions} session(s)</div>
                    {:else}
                      <span class="italic">personne</span>
                    {/if}
                  </Table.Cell>
                  <Table.Cell class="text-right">
                    <div class="flex flex-col items-end gap-1">
                      {#if primary}
                        <Button
                          variant="ghost"
                          size="sm"
                          class="gap-1.5"
                          onclick={() => askAuth(c, primary)}
                        >
                          <Wrench class="h-3.5 w-3.5" />
                          {ACTION_LABELS[primary]}
                        </Button>
                      {:else}
                        <span
                          class="text-xs text-muted-foreground"
                          title="Anomalie Salesforce : à corriger côté SF, ne pas forcer"
                        >
                          À escalader (SF)
                        </span>
                      {/if}
                      {#if c.exposureRisk}
                        <Button
                          variant="ghost"
                          size="sm"
                          class="gap-1.5 text-red-600 hover:text-red-700"
                          onclick={() => askAuth(c, 'sever')}
                        >
                          <Link2Off class="h-3.5 w-3.5" />
                          {ACTION_LABELS.sever}
                        </Button>
                      {/if}
                    </div>
                  </Table.Cell>
                </Table.Row>
                {#if expandedAuth.has(c.talentId)}
                  <Table.Row class="bg-muted/30 hover:bg-muted/30">
                    <Table.Cell colspan={5} class="p-0">
                      <div class="grid gap-6 p-4 text-sm sm:grid-cols-2">
                        {@render accountBlock(
                          'Compte de connexion actuel (obsolète)',
                          c.linked,
                          'Compte de connexion de ce talent',
                          c.staleOwner
                            ? `⚠ L'email obsolète « ${c.linked.email} » appartient à : ${natureLabel(c.staleOwner)}`
                            : null,
                        )}
                        {@render accountBlock(
                          "Compte détenant l'email cible",
                          c.holder,
                          natureLabel(c.holderNature),
                          null,
                        )}
                      </div>
                    </Table.Cell>
                  </Table.Row>
                {/if}
              {:else}
                <Table.Row>
                  <Table.Cell
                    colspan={5}
                    class="py-8 text-center text-sm text-muted-foreground"
                  >
                    Aucun conflit d'identité pour « {query} ».
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </Card.Content>
      </Card.Root>
      <Pagination
        page={authPage}
        totalPages={authTotalPages}
        onPageChange={(p) => (authPage = p)}
      />
    {/if}
  </Tabs.Content>
</Tabs.Root>

<!-- ── Adopt-Salesforce confirm (DATA tab) ─────────────────────────────────── -->
<AlertDialog.Root bind:open={adoptOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Adopter la valeur Salesforce</AlertDialog.Title>
      <AlertDialog.Description>
        La valeur
        <strong>{adoptTarget ? FIELD_LABELS[adoptTarget.field] : ''}</strong>
        confirmée par
        <strong>{adoptTarget?.prenom} {adoptTarget?.nom}</strong>
        (« {adoptTarget?.jump} »{#if adoptTarget?.jumpKey}, UAI {adoptTarget.jumpKey}{/if})
        sera remplacée par celle de Salesforce (« {adoptTarget?.sf} »{#if adoptTarget?.sfKey},
          UAI
          {adoptTarget.sfKey}{/if}). Action immédiate sur des données réelles,
        sans annulation directe.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={adopting}>Annuler</AlertDialog.Cancel>
      <form
        method="POST"
        action="?/adoptSf"
        use:enhance={() => {
          adopting = true;
          return async ({ result, update }) => {
            adopting = false;
            if (result.type === 'success') {
              adoptOpen = false;
              toast.success('Valeur Salesforce adoptée');
              await update();
            } else {
              toast.error('Échec de l’opération.');
            }
          };
        }}
      >
        <input
          type="hidden"
          name="talentId"
          value={adoptTarget?.talentId ?? ''}
        />
        <input type="hidden" name="field" value={adoptTarget?.field ?? ''} />
        <AlertDialog.Action
          type="submit"
          disabled={adopting}
          class={buttonVariants({ variant: 'default' })}
        >
          {#if adopting}
            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" /> Adoption…
          {:else}
            Adopter Salesforce
          {/if}
        </AlertDialog.Action>
      </form>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<!-- ── Auth repair confirm (AUTH tab) ──────────────────────────────────────── -->
<AlertDialog.Root bind:open={authOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>
        {authTarget ? ACTION_LABELS[authTarget.action] : ''}
      </AlertDialog.Title>
      <AlertDialog.Description>
        {authTarget ? authDescription(authTarget) : ''}
        Action immédiate sur des comptes réels, sans annulation directe.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={authBusy}>Annuler</AlertDialog.Cancel>
      <form
        method="POST"
        action="?/repairAuth"
        use:enhance={() => {
          authBusy = true;
          return async ({ result, update }) => {
            authBusy = false;
            if (result.type === 'success') {
              authOpen = false;
              toast.success('Conflit d’identité résolu');
              await update();
            } else if (result.type === 'failure') {
              toast.error(
                (result.data?.message as string) ?? 'Échec de la résolution.',
              );
            } else {
              toast.error('Échec de la résolution.');
            }
          };
        }}
      >
        <input
          type="hidden"
          name="talentId"
          value={authTarget?.conflict.talentId ?? ''}
        />
        <input type="hidden" name="action" value={authTarget?.action ?? ''} />
        <AlertDialog.Action
          type="submit"
          disabled={authBusy}
          class={buttonVariants({
            variant: authTarget?.action === 'sever' ? 'destructive' : 'default',
          })}
        >
          {#if authBusy}
            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" /> Résolution…
          {:else}
            Confirmer
          {/if}
        </AlertDialog.Action>
      </form>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
