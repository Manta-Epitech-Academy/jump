<script lang="ts">
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

  // `until` arrives from the server as a Date but is serialized to a string
  // across the load boundary — accept both.
  let { until }: { until: Date | string | null } = $props();

  const untilLabel = $derived(
    until
      ? new Date(until).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null,
  );
</script>

<div
  class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-destructive px-4 py-2 text-center text-sm font-semibold text-white"
  role="alert"
>
  <span class="inline-flex items-center gap-2">
    <TriangleAlert class="h-4 w-4 shrink-0" />
    ENVOIS RÉELS ACTIVÉS — emails et SMS partent aux vrais destinataires.
  </span>
  {#if untilLabel}
    <span class="font-normal text-destructive"
      >Se désactive à {untilLabel}.</span
    >
  {/if}
  <form method="POST" action="/api/dev/real-sends" class="inline">
    <input type="hidden" name="action" value="disarm" />
    <button
      type="submit"
      class="rounded-sm bg-white/20 px-2 py-0.5 font-semibold underline-offset-2 hover:bg-white/30 hover:underline"
    >
      Désarmer
    </button>
  </form>
</div>
