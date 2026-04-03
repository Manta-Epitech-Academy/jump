<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import { CircleAlert, Lock, ArrowLeft } from '@lucide/svelte';
  import { fly } from 'svelte/transition';
  import { cn } from '$lib/utils';

  let { otpForm, otpErrors, otpEnhance, otpDelayed, otpMessage, goBack } =
    $props();

  let digitRefs = $state<HTMLInputElement[]>([]);
  let digits = $derived($otpForm.password.padEnd(6, ' ').slice(0, 6).split(''));
  let otpComplete = $derived($otpForm.password.length === 6);
  let otpFormRef = $state<HTMLFormElement>(undefined!);

  function handleDigitInput(index: number, e: Event) {
    const input = e.target as HTMLInputElement;
    const raw = input.value.replace(/\D/g, '');

    // Handle autofill / pasted multi-char
    if (raw.length > 1) {
      const pasted = raw.slice(0, 6);
      $otpForm.password = pasted;
      const focusIndex = Math.min(pasted.length, 5);
      digitRefs[focusIndex]?.focus();
      return;
    }

    const val = raw.slice(-1);
    const chars = $otpForm.password.padEnd(6, ' ').slice(0, 6).split('');
    chars[index] = val || ' ';
    $otpForm.password = chars.join('').replace(/\s/g, '');
    if (val && index < 5) {
      digitRefs[index + 1]?.focus();
    }
  }

  function handleDigitKeydown(index: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[index]?.trim() && index > 0) {
      e.preventDefault();
      const chars = $otpForm.password.split('');
      chars[index - 1] = '';
      $otpForm.password = chars.join('').replace(/\s/g, '');
      digitRefs[index - 1]?.focus();
    }
  }

  function handleDigitPaste(e: ClipboardEvent) {
    e.preventDefault();
    const pasted = (e.clipboardData?.getData('text') || '')
      .replace(/\D/g, '')
      .slice(0, 6);
    $otpForm.password = pasted;
    const focusIndex = Math.min(pasted.length, 5);
    digitRefs[focusIndex]?.focus();
  }

  // Auto-submit when complete
  $effect(() => {
    if (otpComplete && otpFormRef && !$otpDelayed) {
      otpFormRef.requestSubmit();
    }
  });

  // Autofocus the first digit on mount
  $effect(() => {
    setTimeout(() => digitRefs[0]?.focus(), 100);
  });
</script>

<div in:fly={{ x: 20, duration: 300 }}>
  {#if $otpMessage}
    <Alert
      variant="destructive"
      class="mb-6 rounded-xl border-red-100 bg-red-50 text-red-800 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300"
    >
      <CircleAlert class="h-4 w-4" />
      <AlertDescription class="text-xs font-medium"
        >{$otpMessage.text}</AlertDescription
      >
    </Alert>
  {/if}

  <div class="mb-6 rounded-xl bg-slate-50 p-4 text-center dark:bg-slate-950">
    <p class="text-xs font-bold text-slate-500 uppercase">Code envoyé à</p>
    <p class="font-bold text-epi-blue">{$otpForm.email}</p>
  </div>

  <form
    bind:this={otpFormRef}
    method="POST"
    action="?/verifyOtp"
    use:otpEnhance
    class="space-y-6"
  >
    <input type="hidden" name="otpId" bind:value={$otpForm.otpId} />
    <input type="hidden" name="email" bind:value={$otpForm.email} />

    <div class="space-y-3">
      <Label for="otp-digit-0" class="sr-only">Code à 6 chiffres</Label>
      <input type="hidden" name="password" bind:value={$otpForm.password} />

      <div class="flex justify-center gap-2.5">
        {#each { length: 6 } as _, i}
          <input
            bind:this={digitRefs[i]}
            id="otp-digit-{i}"
            type="text"
            inputmode="numeric"
            autocomplete={i === 0 ? 'one-time-code' : 'off'}
            maxlength={1}
            placeholder=" "
            value={digits[i]?.trim() || ''}
            oninput={(e) => handleDigitInput(i, e)}
            onkeydown={(e) => handleDigitKeydown(i, e)}
            onpaste={handleDigitPaste}
            class={cn(
              'otp-digit h-14 w-12 rounded-xl border-2 bg-white text-center font-mono text-2xl font-black text-slate-900 shadow-sm transition-all duration-200 outline-none dark:bg-slate-950 dark:text-white',
              digits[i]?.trim()
                ? 'border-epi-teal shadow-epi-teal/10'
                : 'border-slate-200 dark:border-slate-800',
              'focus:border-epi-blue focus:ring-2 focus:ring-epi-blue/20',
            )}
          />
        {/each}
      </div>

      {#if $otpErrors.password}<span
          class="block text-center text-xs font-bold text-red-500"
          >{$otpErrors.password}</span
        >{/if}
    </div>

    <div class="space-y-3">
      <Button
        type="submit"
        disabled={$otpDelayed || !otpComplete}
        class="h-12 w-full rounded-xl bg-epi-teal text-base font-bold text-slate-950 shadow-md transition-all hover:bg-epi-teal/90 active:scale-[0.98] disabled:opacity-50"
      >
        {#if $otpDelayed}
          Lancement...
        {:else}
          <Lock class="mr-2 h-4 w-4" /> Entrer dans le Cockpit
        {/if}
      </Button>

      <Button
        type="button"
        variant="ghost"
        class="h-10 w-full rounded-xl text-xs font-bold text-slate-400 uppercase hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        onclick={goBack}
        disabled={$otpDelayed}
      >
        <ArrowLeft class="mr-1.5 h-3.5 w-3.5" /> Changer d'email
      </Button>
    </div>
  </form>
</div>

<style>
  @keyframes digit-pop {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.08);
    }
    100% {
      transform: scale(1);
    }
  }

  :global(.otp-digit:not(:placeholder-shown):not(:focus)) {
    animation: digit-pop 0.2s ease-out;
  }
</style>
