<script lang="ts">
  import { page } from '$app/state';

  // Google-Forms-style tab bar, shared between the editor (Questions) and the
  // Réponses route. Form behaviour (statut, mascotte, relance) and diffusion no
  // longer have a Paramètres tab: statut + access live in the header "Diffusion"
  // control, the persona is edited inline in the header card, the relance toggle
  // sits with diffusion.
  let { formId }: { formId: string } = $props();

  const base = $derived(`/staff/admin/feedback-forms/${formId}`);
  const current = $derived(
    page.url.pathname.endsWith('/responses') ? 'responses' : 'questions',
  );

  const tabs = $derived([
    { key: 'questions', label: 'Questions', href: base },
    { key: 'responses', label: 'Réponses', href: `${base}/responses` },
  ]);
</script>

<nav class="flex gap-6 border-b">
  {#each tabs as t (t.key)}
    <a
      href={t.href}
      data-sveltekit-noscroll
      class="-mb-px border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors {current ===
      t.key
        ? 'border-epi-tomorrow text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground'}"
    >
      {t.label}
    </a>
  {/each}
</nav>
