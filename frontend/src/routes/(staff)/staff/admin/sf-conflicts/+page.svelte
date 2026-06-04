<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import * as Card from '$lib/components/ui/card';
  import * as Table from '$lib/components/ui/table';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { Badge } from '$lib/components/ui/badge';
  import { Input } from '$lib/components/ui/input';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import SalesforceIcon from '$lib/components/icons/SalesforceIcon.svelte';
  import Download from '@lucide/svelte/icons/download';
  import CloudDownload from '@lucide/svelte/icons/cloud-download';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Search from '@lucide/svelte/icons/search';
  import CheckCheck from '@lucide/svelte/icons/check-check';
  import { toast } from 'svelte-sonner';
  import { civiliteLabel } from '$lib/domain/profile';
  import { salesforceContactUrl } from '$lib/domain/salesforce';
  import { FIELD_LABELS, type DiffField } from '$lib/domain/reconciliation';

  let { data } = $props();

  function displayValue(field: DiffField, value: string | null): string {
    if (!value) return '—';
    if (field === 'civilite') return civiliteLabel(value);
    return value;
  }

  // ── Search ──────────────────────────────────────────────────────────────
  // At cohort scale (~200 talents) the reviewer needs to land on one person
  // fast. One box filters both sections by name or email.
  let query = $state('');
  const needle = $derived(query.trim().toLowerCase());
  const matches = (prenom: string, nom: string, email: string | null) =>
    needle === '' ||
    `${prenom} ${nom} ${email ?? ''}`.toLowerCase().includes(needle);

  // ── Two workflows, derived from the two domain lists ──────────────────────
  // A `conflict` is a *decision*: Salesforce disagrees with a talent-confirmed
  // value, so an admin either adopts SF or leaves Jump's value standing. These
  // are the only actionable rows, flattened one-per-(talent, field).
  type ConflictRow = {
    talentId: string;
    prenom: string;
    nom: string;
    email: string | null;
    externalId: string | null;
    field: DiffField;
    jump: string;
    sf: string;
  };

  const conflicts = $derived<ConflictRow[]>(
    data.diffs.flatMap((t) =>
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
        })),
    ),
  );
  const visibleConflicts = $derived(
    conflicts.filter((c) => matches(c.prenom, c.nom, c.email)),
  );

  // Everything else Jump holds that Salesforce should receive: `missing` diffs
  // (a confirmed field SF lacks — clears itself on the next sync once pushed)
  // and parent contacts (SF has no column for them at all). The reviewer's task
  // for both is identical — export the CSV — so they merge into one block per
  // talent, each item tagged with how it will eventually clear.
  type PushItem = {
    label: string;
    value: string;
    // 'field' re-syncs away once SF carries it; 'parent' never auto-clears.
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

    for (const t of data.diffs)
      for (const d of t.diffs)
        if (d.kind === 'missing')
          ensure(t).items.push({
            label: FIELD_LABELS[d.field],
            value: displayValue(d.field, d.jump),
            origin: 'field',
          });

    for (const t of data.enrichment)
      for (const f of t.fields)
        ensure(t).items.push({
          label: f.label,
          value: f.value,
          origin: 'parent',
        });

    return [...map.values()].sort(
      (a, b) => a.nom.localeCompare(b.nom) || a.prenom.localeCompare(b.prenom),
    );
  });
  const visiblePushGroups = $derived(
    pushGroups.filter((g) => matches(g.prenom, g.nom, g.email)),
  );

  // ── Counts for the header (always reflect the full data, not the search) ──
  const conflictCount = $derived(conflicts.length);
  const pushFieldCount = $derived(
    pushGroups.reduce((n, g) => n + g.items.length, 0),
  );
  const talentCount = $derived(
    new Set([
      ...conflicts.map((c) => c.talentId),
      ...pushGroups.map((g) => g.talentId),
    ]).size,
  );
  const hasData = $derived(conflictCount > 0 || pushFieldCount > 0);

  // ── Adopt-Salesforce confirm ──────────────────────────────────────────────
  // Adopting SF overwrites a talent-confirmed value with no trivial undo, so it
  // is gated behind a confirm dialog driven by the row the reviewer clicked.
  let adoptOpen = $state(false);
  let adopting = $state(false);
  let adoptTarget = $state<ConflictRow | null>(null);

  function askAdopt(c: ConflictRow) {
    adoptTarget = c;
    adoptOpen = true;
  }
</script>

<svelte:head>
  <title>Divergences Salesforce</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div class="space-y-1">
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        Divergences Salesforce<span class="text-epi-teal">_</span>
      </h1>
      <p
        class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
      >
        <span class="font-mono text-xs">
          {talentCount}
          {talentCount > 1 ? 'talents' : 'talent'} concerné{talentCount > 1
            ? 's'
            : ''}
        </span>
        {#if conflictCount > 0}
          <Badge variant="outline" class="border-epi-orange/40 text-epi-orange">
            {conflictCount}
            {conflictCount > 1 ? 'conflits' : 'conflit'}
          </Badge>
        {/if}
        {#if pushFieldCount > 0}
          <Badge variant="secondary">
            {pushFieldCount}
            {pushFieldCount > 1 ? 'champs' : 'champ'} à transmettre
          </Badge>
        {/if}
      </p>
    </div>
    {#if hasData}
      <a
        href={resolve('/staff/admin/sf-conflicts/export')}
        class={buttonVariants({ variant: 'outline' })}
        download
      >
        <Download class="mr-2 h-4 w-4" /> Exporter CSV
      </a>
    {/if}
  </div>

  <p class="max-w-3xl text-sm text-muted-foreground">
    L'info confirmée par le talent fait foi. Un <strong>conflit</strong> demande
    un arbitrage : adopter Salesforce ou laisser la valeur du talent (par
    défaut). Le reste se <strong>transmet</strong> à Salesforce via le CSV ; chaque
    écart reste listé jusqu'à ce que Salesforce porte la valeur — le prochain sync
    le solde tout seul.
  </p>

  {#if !hasData}
    <Card.Root>
      <Card.Content class="py-16 text-center">
        <CheckCheck class="mx-auto mb-3 h-8 w-8 text-epi-teal-solid" />
        <p class="text-sm font-medium">Aucune divergence.</p>
        <p class="text-sm text-muted-foreground">
          Tout ce que les talents ont confirmé concorde avec Salesforce.
        </p>
      </Card.Content>
    </Card.Root>
  {:else}
    <div class="relative max-w-sm">
      <Search
        class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        bind:value={query}
        placeholder="Rechercher un talent (nom, email)…"
        class="pl-9"
      />
    </div>

    <!-- ── Conflicts: the actionable section ─────────────────────────────── -->
    <section class="space-y-3">
      <h2 class="font-heading text-lg tracking-wide uppercase">
        Conflits à arbitrer
        <span class="ml-1 font-mono text-sm text-muted-foreground">
          {conflictCount}
        </span>
      </h2>

      {#if conflictCount === 0}
        <Card.Root>
          <Card.Content class="py-8 text-center text-sm text-muted-foreground">
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
                {#each visibleConflicts as c (c.talentId + c.field)}
                  <Table.Row>
                    <Table.Cell>
                      <div class="font-medium">{c.prenom} {c.nom}</div>
                      <div
                        class="flex items-center gap-1 font-mono text-xs text-muted-foreground"
                      >
                        {c.email ?? '—'}
                        {#if c.externalId}
                          <a
                            href={salesforceContactUrl(c.externalId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Ouvrir dans Salesforce"
                            aria-label="Ouvrir le contact dans Salesforce"
                            class="transition-opacity hover:opacity-70"
                          >
                            <SalesforceIcon class="h-3.5 w-3.5" />
                          </a>
                        {/if}
                      </div>
                    </Table.Cell>
                    <Table.Cell class="font-medium">
                      {FIELD_LABELS[c.field]}
                    </Table.Cell>
                    <Table.Cell class="font-medium text-epi-blue">
                      {c.jump}
                    </Table.Cell>
                    <Table.Cell class="text-muted-foreground">
                      {c.sf}
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
      {/if}
    </section>

    <!-- ── To push: read-only, rides the CSV ─────────────────────────────── -->
    {#if pushFieldCount > 0}
      <section class="space-y-3">
        <div>
          <h2 class="font-heading text-lg tracking-wide uppercase">
            À transmettre vers Salesforce
            <span class="ml-1 font-mono text-sm text-muted-foreground">
              {pushFieldCount}
            </span>
          </h2>
          <p class="font-mono text-xs tracking-wide text-muted-foreground">
            &lt; poussé via l'export CSV — aucune action ici /&gt;
          </p>
        </div>

        <Card.Root>
          <Card.Content class="p-0">
            {#each visiblePushGroups as g (g.talentId)}
              <div class="border-b px-5 py-4 last:border-0">
                <div class="mb-3 flex items-center gap-2">
                  <span class="font-medium">{g.prenom} {g.nom}</span>
                  <span
                    class="flex items-center gap-1 font-mono text-xs text-muted-foreground"
                  >
                    {g.email ?? '—'}
                    {#if g.externalId}
                      <a
                        href={salesforceContactUrl(g.externalId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ouvrir dans Salesforce"
                        aria-label="Ouvrir le contact dans Salesforce"
                        class="transition-opacity hover:opacity-70"
                      >
                        <SalesforceIcon class="h-3.5 w-3.5" />
                      </a>
                    {/if}
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
                            class="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground"
                            title="Salesforce n'a pas de champ pour cette donnée"
                          >
                            hors SF
                          </span>
                        {/if}
                      </dt>
                      <dd class="text-right text-sm font-medium">
                        {item.value}
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
      </section>
    {/if}
  {/if}
</div>

<AlertDialog.Root bind:open={adoptOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title class="font-heading text-xl tracking-tight uppercase">
        Adopter la valeur Salesforce
      </AlertDialog.Title>
      <AlertDialog.Description>
        La valeur
        <strong>{adoptTarget ? FIELD_LABELS[adoptTarget.field] : ''}</strong>
        confirmée par
        <strong>{adoptTarget?.prenom} {adoptTarget?.nom}</strong>
        (« {adoptTarget?.jump} ») sera remplacée par celle de Salesforce (« {adoptTarget?.sf}
        »). Action immédiate sur des données réelles, sans annulation directe.
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
