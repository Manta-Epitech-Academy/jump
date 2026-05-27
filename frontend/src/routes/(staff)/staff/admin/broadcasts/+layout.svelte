<script lang="ts">
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { BROADCAST_CHANNEL_LABELS } from '$lib/domain/broadcasts';

  let { data, children } = $props();
</script>

<div class="space-y-6">
  {#if data.armedRealSends}
    <!-- Real sends armed: bulk sends bypass the trap and reach real recipients.
         Don't show the "trapped" banner below — it would claim the opposite. -->
    <div
      class="flex items-start gap-3 rounded-md border-2 border-red-500 bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200"
      role="alert"
    >
      <TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
      <div class="space-y-2">
        <p class="font-bold tracking-tight uppercase">
          Envois réels armés — la redirection est levée
        </p>
        <p>
          Les <strong>envois groupés</strong> partiront aux
          <strong>vrais destinataires</strong> (potentiellement des mineurs),
          comme en production. Désarmez depuis le bandeau rouge en haut de page
          ou dans <strong>Mes paramètres</strong> avant d'envoyer si ce n'était pas
          voulu.
        </p>
      </div>
    </div>
  {:else if data.devRedirects.length > 0}
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
          Les <strong>envois groupés et automatiques</strong> sont piégés, jamais
          vers les vrais destinataires. Le destinataire prévu est ajouté en tête de
          chaque message pour l'identifier.
        </p>
        <p>
          Les <strong>envois de test</strong> (bouton « Tester ») atteignent l'adresse
          ou le numéro que vous saisissez — pour vous envoyer un aperçu réel.
        </p>
        <ul class="space-y-1.5">
          {#each data.devRedirects as redirect (redirect.channel)}
            <li class="text-xs">
              <span class="font-semibold"
                >{BROADCAST_CHANNEL_LABELS[redirect.channel]}</span
              >
              — envois groupés
              {#if redirect.scope === 'self'}
                vers <strong>votre boîte</strong> :
              {:else}
                vers :
              {/if}
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
