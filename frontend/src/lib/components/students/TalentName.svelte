<script lang="ts">
  import { formatGivenName } from '$lib/domain/profile';

  // Surname uppercased (French civil convention), mirrored at display scale by
  // the talent profile hero. `order` flips the reading order without touching
  // the casing: 'surname-first' ("DUPONT Marie") suits scannable tables, where
  // the eye tracks the family name down a column; 'given-first' ("Marie DUPONT")
  // reads as natural civil identity on a profile. Size, weight and colour
  // cascade from the parent, so the same component serves a bold table cell and
  // a muted contact line alike. For string-only sinks (document titles,
  // breadcrumb labels) use `formatPersonName` in `$lib/domain/profile`, which
  // applies the same rule without markup.
  let {
    talent,
    order = 'surname-first',
  }: {
    talent: { nom?: string | null; prenom?: string | null };
    order?: 'surname-first' | 'given-first';
  } = $props();

  const prenom = $derived(formatGivenName(talent.prenom));
  const nom = $derived(talent.nom ?? '');
</script>

{#if order === 'given-first'}{#if prenom}<span>{prenom}</span
    >{/if}{#if prenom && nom}{' '}{/if}{#if nom}<span class="uppercase"
      >{nom}</span
    >{/if}{:else}{#if nom}<span class="uppercase">{nom}</span
    >{/if}{#if nom && prenom}{' '}{/if}{#if prenom}<span>{prenom}</span
    >{/if}{/if}
