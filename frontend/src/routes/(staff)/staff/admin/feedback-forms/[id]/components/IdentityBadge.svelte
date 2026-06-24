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
     the neon `epi-teal`) so the icon and text keep contrast as a fill. -->
<span
  class="inline-flex shrink-0 items-center gap-1 rounded-sm border border-epi-teal-solid/40 bg-epi-teal-solid/10 px-1.5 py-0.5 text-[11px] font-medium text-epi-teal-solid"
>
  <ContactRound class="h-3.5 w-3.5" />
  Identité · {label}
</span>
