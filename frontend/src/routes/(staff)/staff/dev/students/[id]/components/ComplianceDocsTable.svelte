<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import FileSignature from '@lucide/svelte/icons/file-signature';
  import Camera from '@lucide/svelte/icons/camera';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';
  import { formatDateFr, cn } from '$lib/utils';
  import type { Component } from 'svelte';

  /**
   * Per-document compliance breakdown for the talent's most-recent active
   * stage participation. Mirrors the mockup's "4 pièces obligatoires" table
   * structure, scoped to Jump's two-doc reality (règlement intérieur + droit
   * à l'image — the PC is logistics, tracked on the per-event onboarding
   * page, not a doc to sign).
   *
   * Compliance is stage-specific by nature (non-stage events don't need
   * signed docs), so older stages' historical compliance is intentionally
   * not surfaced from this page.
   */
  type Props = {
    participation: {
      id: string;
      stageCompliance: {
        charteSigned: boolean;
        imageRightsSigned: boolean;
        updatedAt: Date | string;
      } | null;
      event: { id: string; titre: string; date: Date | string };
    };
    timezone: string;
  };

  let { participation, timezone }: Props = $props();

  type DocRow = {
    key: 'charte' | 'image';
    label: string;
    description: string;
    icon: Component<{ class?: string }>;
    signed: boolean;
  };

  const sc = $derived(participation.stageCompliance);
  const signedAt = $derived(sc?.updatedAt ?? null);

  const rows = $derived<DocRow[]>([
    {
      key: 'charte',
      label: 'Règlement intérieur',
      description: 'Charte signée en ligne par le talent.',
      icon: FileSignature,
      signed: !!sc?.charteSigned,
    },
    {
      key: 'image',
      label: "Droit à l'image",
      description: 'Autorisation parentale photos / vidéos.',
      icon: Camera,
      signed: !!sc?.imageRightsSigned,
    },
  ]);

  const ready = $derived(rows.every((r) => r.signed));
</script>

<EpiSection
  overline="Stage en cours"
  title="Pièces administratives"
  accent="blue"
>
  {#snippet meta()}
    <span
      class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
    >
      {rows.filter((r) => r.signed).length}/{rows.length}
      {#if ready}<span class="ml-2 text-epi-teal-solid">/ complet</span>{/if}
    </span>
  {/snippet}

  <p
    class="mb-3 font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
  >
    &lt; {participation.event.titre} · {formatDateFr(
      participation.event.date,
      timezone,
    )} /&gt;
  </p>

  <div class="overflow-hidden rounded-sm border">
    <table class="w-full text-sm">
      <thead class="bg-muted/40">
        <tr
          class="text-left font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          <th class="px-3 py-2">Document</th>
          <th class="hidden px-3 py-2 sm:table-cell">Description</th>
          <th class="px-3 py-2">Statut</th>
          <th class="px-3 py-2">Signé le</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.key)}
          {@const Icon = row.icon}
          <tr class="border-t">
            <td class="px-3 py-3">
              <div class="flex items-center gap-2">
                <Icon class="h-4 w-4 shrink-0 text-muted-foreground" />
                <span class="font-bold">{row.label}</span>
              </div>
            </td>
            <td
              class="hidden px-3 py-3 font-mono text-xs text-muted-foreground sm:table-cell"
            >
              {row.description}
            </td>
            <td class="px-3 py-3">
              <span
                class={cn(
                  'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-widest uppercase',
                  row.signed
                    ? 'border border-epi-teal-solid/40 bg-epi-teal-solid/10 text-epi-teal-solid'
                    : 'border border-destructive/40 bg-destructive/10 text-destructive',
                )}
              >
                {#if row.signed}
                  <Check class="h-3 w-3" />
                  Validé
                {:else}
                  <X class="h-3 w-3" />
                  Manquant
                {/if}
              </span>
            </td>
            <td class="px-3 py-3 font-mono text-xs">
              {#if row.signed && signedAt}
                {formatDateFr(signedAt, timezone)}
              {:else}
                <span class="text-muted-foreground">—</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</EpiSection>
