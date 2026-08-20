<script lang="ts">
  import MailCheck from '@lucide/svelte/icons/mail-check';

  // `until` arrives from the server as a Date but is serialized to a string
  // across the load boundary — accept both. `to` is the predicted destination.
  let { until, to }: { until: Date | string | null; to: readonly string[] } =
    $props();

  const untilLabel = $derived(
    until
      ? new Date(until).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null,
  );

  const toLabel = $derived(to.length > 0 ? to.join(', ') : 'votre adresse');
</script>

<div
  class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warning px-4 py-2 text-center text-sm font-semibold text-warning"
  role="status"
>
  <span class="inline-flex items-center gap-2">
    <MailCheck class="h-4 w-4 shrink-0" />
    Redirection de connexion active : les emails de connexion vous sont envoyés ({toLabel}).
  </span>
  {#if untilLabel}
    <span class="font-normal text-warning">Se désactive à {untilLabel}.</span>
  {/if}
  <form method="POST" action="/api/dev/redirect-pin" class="inline">
    <input type="hidden" name="action" value="disarm" />
    <button
      type="submit"
      class="rounded-sm bg-warning/15 px-2 py-0.5 font-semibold underline-offset-2 hover:bg-warning/25 hover:underline"
    >
      Désactiver
    </button>
  </form>
</div>
