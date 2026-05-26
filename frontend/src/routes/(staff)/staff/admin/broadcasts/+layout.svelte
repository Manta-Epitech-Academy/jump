<script lang="ts">
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { BROADCAST_CHANNEL_LABELS } from '$lib/domain/broadcasts';

  let { data, children } = $props();
</script>

<div class="space-y-6">
  {#if data.devRedirects.length > 0}
    <div
      class="flex items-start gap-3 rounded-md border-2 border-amber-500 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      role="alert"
    >
      <TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div class="space-y-2">
        <p class="font-bold tracking-tight uppercase">
          Mode dev — envois redirigés
        </p>
        <p>
          <strong>Tous les envois iront vers les destinataires de test</strong>,
          jamais aux destinataires réels. Le destinataire prévu est ajouté en
          tête de chaque message pour l'identifier.
        </p>
        <ul class="space-y-1.5">
          {#each data.devRedirects as redirect (redirect.channel)}
            <li class="text-xs">
              <span class="font-semibold"
                >{BROADCAST_CHANNEL_LABELS[redirect.channel]}</span
              >
              —
              <code
                class="rounded bg-amber-200/60 px-1 font-mono dark:bg-amber-900/60"
                >{redirect.envVar}</code
              >
              :
              <span class="font-mono">{redirect.recipients.join(', ')}</span>
              (préfixe
              <code
                class="rounded bg-amber-200/60 px-1 font-mono dark:bg-amber-900/60"
                >{redirect.prefixExample}</code
              >)
            </li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}

  {@render children()}
</div>
