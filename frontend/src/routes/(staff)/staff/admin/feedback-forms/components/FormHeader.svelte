<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import {
    FORM_STATUS_BADGE_CLASS,
    FORM_STATUS_LABELS,
    type FormStatusValue,
  } from '$lib/domain/feedbackForms/status';

  // The two faces of one form an admin opens: how a respondent meets it, and
  // what was answered. Writing it goes over the admin API (`write_feedback_form`),
  // so there is no editing tab.
  let {
    formId,
    title,
    status,
  }: { formId: string; title: string; status: FormStatusValue } = $props();

  const base = $derived(`/staff/admin/feedback-forms/${formId}`);
  const current = $derived(
    page.url.pathname.endsWith('/responses') ? 'responses' : 'preview',
  );

  const tabs = $derived([
    { key: 'preview', label: 'Aperçu', href: base },
    { key: 'responses', label: 'Réponses', href: `${base}/responses` },
  ]);
</script>

<div class="space-y-4">
  <a
    href={resolve('/staff/admin/feedback-forms')}
    class="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
  >
    <ArrowLeft class="h-4 w-4" /> Tous les formulaires
  </a>

  <div class="flex flex-wrap items-center gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
    <span
      class="rounded-sm px-2 py-0.5 text-xs font-medium {FORM_STATUS_BADGE_CLASS[
        status
      ]}"
    >
      {FORM_STATUS_LABELS[status]}
    </span>
  </div>

  <nav class="flex gap-6 border-b">
    {#each tabs as t (t.key)}
      <a
        href={t.href}
        data-sveltekit-noscroll
        class="-mb-px cursor-pointer border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors {current ===
        t.key
          ? 'border-epi-tomorrow text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'}"
      >
        {t.label}
      </a>
    {/each}
  </nav>
</div>
