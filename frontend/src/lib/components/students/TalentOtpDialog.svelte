<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { toast } from 'svelte-sonner';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Copy from '@lucide/svelte/icons/copy';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';

  type Props = {
    /** SvelteKit action URL, e.g. `?/generateOtp`. */
    action: string;
    /** Talent display name for the dialog title. */
    talentName: string;
    /** Disable the trigger (e.g. talent has no user account yet). */
    disabled?: boolean;
    /** Tooltip / aria-label when disabled. */
    disabledReason?: string;
    /** Subject label used in the description ("le talent" / "le stagiaire"). */
    subjectLabel?: string;
  };

  let {
    action,
    talentName,
    disabled = false,
    disabledReason,
    subjectLabel = 'le talent',
  }: Props = $props();

  let open = $state(false);
  let otp = $state<string | null>(null);
  let email = $state<string | null>(null);
  let expiresInSeconds = $state(0);
  let loading = $state(false);

  function reset() {
    otp = null;
    email = null;
    expiresInSeconds = 0;
  }

  const submit: SubmitFunction = () => {
    loading = true;
    return async ({ result, update }) => {
      loading = false;
      if (result.type === 'success' && result.data) {
        const data = result.data as {
          otp?: string;
          email?: string;
          expiresInSeconds?: number;
        };
        otp = data.otp ?? null;
        email = data.email ?? null;
        expiresInSeconds = data.expiresInSeconds ?? 0;
      } else if (result.type === 'failure') {
        const msg =
          (result.data as { message?: string } | undefined)?.message ??
          'Impossible de générer le code.';
        toast.error(msg);
      } else if (result.type === 'error') {
        toast.error(result.error.message);
      }
      // `invalidateAll: false` — nothing on the page depends on the OTP being
      // persisted; skipping the reload keeps the freshly-generated code on
      // screen instead of dropping back to the initial page state.
      await update({ reset: false, invalidateAll: false });
    };
  };

  async function copyOtp() {
    if (!otp) return;
    try {
      await navigator.clipboard.writeText(otp);
      toast.success('Code copié');
    } catch {
      toast.error(
        'Copie impossible — sélectionnez et copiez le code à la main',
      );
    }
  }
</script>

<Dialog.Root
  bind:open
  onOpenChange={(next) => {
    if (!next) reset();
  }}
>
  <Dialog.Trigger
    {disabled}
    title={disabled ? disabledReason : undefined}
    class="inline-flex items-center justify-center gap-2 rounded-sm border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
  >
    <KeyRound class="h-3.5 w-3.5" />
    Générer un code OTP
  </Dialog.Trigger>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Code de connexion — {talentName}</Dialog.Title>
      <Dialog.Description>
        Génère un code à 6 chiffres que {subjectLabel} peut saisir sur la page de
        connexion. À utiliser uniquement en présentiel.
      </Dialog.Description>
    </Dialog.Header>

    {#if otp}
      <div class="space-y-3 py-2">
        <div
          class="rounded-sm border-2 border-dashed border-epi-orange/60 bg-orange-50 p-4 text-center dark:bg-orange-950/20"
        >
          <div
            class="font-mono text-3xl font-black tracking-[0.4em] text-epi-orange"
          >
            {otp}
          </div>
        </div>
        {#if email}
          <p class="text-xs text-muted-foreground">
            À saisir sur la page de connexion avec l'email
            <span class="font-mono font-semibold">{email}</span>. Valide {Math.floor(
              expiresInSeconds / 60,
            )} minutes.
          </p>
        {/if}
      </div>

      <Dialog.Footer class="gap-2 sm:gap-2">
        <Button type="button" variant="outline" onclick={copyOtp}>
          <Copy class="mr-2 h-4 w-4" />
          Copier
        </Button>
        <form method="POST" {action} use:enhance={submit}>
          <Button type="submit" variant="outline" disabled={loading}>
            {#if loading}
              <Loader2 class="mr-2 h-4 w-4 animate-spin" />
            {:else}
              <RefreshCw class="mr-2 h-4 w-4" />
            {/if}
            Régénérer
          </Button>
        </form>
      </Dialog.Footer>
    {:else}
      <form method="POST" {action} use:enhance={submit} class="py-4">
        <Button
          type="submit"
          class="w-full bg-epi-blue text-white hover:bg-epi-blue/90"
          disabled={loading}
        >
          {#if loading}
            <Loader2 class="mr-2 h-4 w-4 animate-spin" />
            Génération…
          {:else}
            <KeyRound class="mr-2 h-4 w-4" />
            Générer le code
          {/if}
        </Button>
      </form>
    {/if}
  </Dialog.Content>
</Dialog.Root>
