<script lang="ts">
  import { capitalize } from '$lib/utils';

  let {
    talent,
  }: {
    talent: { nom?: string | null; prenom?: string | null };
  } = $props();
</script>

<span class="uppercase">{talent.nom ?? ''}</span>
{capitalize(talent.prenom)}
