<script lang="ts">
  import BookOpen from '@lucide/svelte/icons/book-open';
  import CheckCircle from '@lucide/svelte/icons/check-circle';
  import { renderMarkdown } from '$lib/markdown';
  import reglementMd from '$lib/content/reglement-interieur.md?raw';
  import { fly } from 'svelte/transition';
  import ParentFlowShell from '$lib/components/parent/ParentFlowShell.svelte';
  import ChildRulesForm from './ChildRulesForm.svelte';

  // Single source of truth for the règlement body — same text the talent reads
  // at the last step of their onboarding (and the PDF embeds). The .md no
  // longer carries a trailing "Fait à …" line: each signature footer (in the
  // PDF) and each per-child form (on this page) handles its own city + date.
  const reglementBody = renderMarkdown(reglementMd);

  let { data, form } = $props();
</script>

<svelte:head>
  <title>Règlement intérieur — Espace Parent</title>
</svelte:head>

<ParentFlowShell>
  <main class="relative z-10 flex-1 overflow-y-auto">
    <div class="mx-auto w-full max-w-lg px-4 py-8">
      <!-- Header -->
      <div class="mb-6 text-center">
        <div
          class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-epi-blue text-white shadow-raised"
        >
          <BookOpen class="h-7 w-7" />
        </div>
        <h1 class="font-heading text-display-m text-epi-blue">
          Règlement intérieur
        </h1>
        <p class="mt-2 text-sm text-foreground-secondary">
          En tant que représentant légal, votre signature accompagne celle de
          votre enfant.
        </p>
      </div>

      <!-- Success message -->
      {#if form?.success}
        <div
          in:fly={{ y: -10, duration: 300 }}
          class="mb-4 flex items-center gap-3 rounded-xl border border-success/60 bg-success/80 px-4 py-3"
        >
          <CheckCircle class="h-5 w-5 shrink-0 text-success" />
          <p class="text-sm text-success">
            Le règlement intérieur pour <strong>{form.success}</strong> a été signé
            avec succès.
          </p>
        </div>
      {/if}

      <!-- Global error -->
      {#if form?.error && !form?.talentId}
        <p
          class="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
        >
          {form.error}
        </p>
      {/if}

      <!-- Règlement text (shared by all children). No wrapper card on purpose,
           matching the talent's RulesStep: the body reads as the document
           itself, not a boxed widget on the page. -->
      <div class="prose prose-sm mb-6 max-w-none prose-slate dark:prose-invert">
        {@html reglementBody}
      </div>

      <!-- ═══ Sécurité des données ═══
           Mirrors the talent's last onboarding step: every page that asks the
           family to sign on the dotted line names the data it captures. The
           guardian's footprint is intentionally minimal — just what the signed
           PDF needs to identify them. -->
      <div class="mb-6">
        <h2
          class="mb-2 text-sm font-semibold tracking-wide text-foreground-secondary uppercase"
        >
          Sécurité des données
        </h2>
        <p class="text-xs leading-relaxed text-muted-foreground">
          Nous conservons votre nom, votre qualité (mère, père, tuteur légal,
          tutrice légale) et la ville où vous avez signé, uniquement pour
          produire le PDF du règlement intérieur co-signé. Ces informations sont
          rattachées au dossier de votre enfant et anonymisées selon les mêmes
          règles. Tout est stocké en France, sur un serveur géré par l'équipe
          Epitech.
        </p>
      </div>

      <!-- Per-child signature forms -->
      {#each data.children as child (child.id)}
        <ChildRulesForm
          {child}
          error={form?.talentId === child.id ? form.error : undefined}
        />
      {/each}
    </div>
  </main>
</ParentFlowShell>
