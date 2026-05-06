<script lang="ts">
  import InscritCardOngoing from './InscritCardOngoing.svelte';
  import type { PastRow } from './types';

  let {
    row,
    timezone,
  }: {
    row: PastRow;
    timezone: string;
  } = $props();
</script>

<InscritCardOngoing {row} {timezone} mode="recap" />
