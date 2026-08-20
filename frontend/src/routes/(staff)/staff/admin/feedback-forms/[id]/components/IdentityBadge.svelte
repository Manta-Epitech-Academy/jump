<script lang="ts">
  import ContactRound from '@lucide/svelte/icons/contact-round';
  import {
    IDENTITY_FIELD_OPTIONS,
    type IdentityField,
  } from '$lib/domain/feedbackForms/schema';

  let { field }: { field: IdentityField } = $props();

  const label = $derived(
    IDENTITY_FIELD_OPTIONS.find((o) => o.value === field)?.label ?? field,
  );
</script>

<!-- Teal chip marking an identity-data question. Uses the solid teal token (not
     the neon `epi-tech`) so the icon and text keep contrast as a fill. -->
<span
  class="inline-flex shrink-0 items-center gap-1 rounded-sm border border-epi-tech-ink/40 bg-epi-tech-ink/10 px-1.5 py-0.5 text-xs font-medium text-epi-tech-ink"
>
  <ContactRound class="h-3.5 w-3.5" />
  Identité · {label}
</span>
