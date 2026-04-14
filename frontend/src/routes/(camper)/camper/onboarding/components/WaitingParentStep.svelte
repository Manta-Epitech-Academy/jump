<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { Button } from '$lib/components/ui/button';
  import { Clock, Send } from '@lucide/svelte';

  let sending = $state(false);
  let sent = $state(false);
  let errorMsg = $state('');
  let pollInterval: ReturnType<typeof setInterval>;

  async function sendCode() {
    sending = true;
    errorMsg = '';
    try {
      const res = await fetch('/api/onboarding/send-parent-code', {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        errorMsg = data.message || "Erreur lors de l'envoi";
        return;
      }
      sent = true;
    } catch {
      errorMsg = "Erreur lors de l'envoi de l'email";
    } finally {
      sending = false;
    }
  }

  async function checkStatus() {
    try {
      const res = await fetch('/api/onboarding/signature-status');
      const data = await res.json();
      if (data.signed) {
        await invalidateAll();
      }
    } catch {
      // silently ignore polling errors
    }
  }

  onMount(() => {
    sendCode();
    pollInterval = setInterval(checkStatus, 10_000);
  });

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
  });
</script>

<!-- Header -->
<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <Clock class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    En attente de signature
  </h1>
  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
    Un email a été envoyé à ton parent pour signer l'autorisation de droit à
    l'image.
  </p>
</div>

<div
  class="rounded-2xl border-none bg-white/70 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl dark:bg-slate-900/80"
>
  {#if errorMsg}
    <p
      class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
    >
      {errorMsg}
    </p>
  {/if}

  <div class="flex flex-col items-center gap-4 text-center">
    <div
      class="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/30"
    >
      <Clock class="h-8 w-8 animate-pulse text-amber-500" />
    </div>

    <p class="text-sm text-slate-600 dark:text-slate-300">
      {#if sent}
        L'email a été envoyé. Cette page se mettra à jour automatiquement une
        fois le document signé.
      {:else if sending}
        Envoi de l'email en cours...
      {:else}
        Prêt à envoyer l'email au parent.
      {/if}
    </p>

    <Button
      onclick={sendCode}
      disabled={sending}
      variant="outline"
      class="mt-2 gap-2 rounded-xl"
    >
      <Send class="h-4 w-4" />
      {sent ? 'Renvoyer le code' : 'Envoyer le code'}
    </Button>
  </div>
</div>
