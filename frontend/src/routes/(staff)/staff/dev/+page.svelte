<script lang="ts">
  import Inbox from '@lucide/svelte/icons/inbox';

  let { data } = $props();
</script>

<svelte:head>
  <title>Espace dev</title>
</svelte:head>

<div
  class="mx-auto mt-12 max-w-xl rounded-sm border border-dashed bg-card px-8 py-12 text-center shadow-sm dark:shadow-none"
>
  <Inbox class="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
  <h1 class="mb-2 font-heading text-2xl tracking-wide uppercase">
    Aucun événement pour l'instant
  </h1>
  <p class="text-sm leading-relaxed text-muted-foreground">
    Dès qu'un événement est importé et configuré pour {data.campusName}, il
    s'affichera ici et vous y atterrirez directement. En attendant, rien à faire
    de ce côté.
  </p>
</div>
