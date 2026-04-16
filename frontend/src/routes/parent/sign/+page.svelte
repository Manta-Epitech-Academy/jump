<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { KeyRound, Camera, CheckCircle } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import { marked } from 'marked';
  import droitImageBodyMd from '$lib/content/droit-image-body.md?raw';

  const droitImageBody = marked.parse(droitImageBodyMd) as string;

  let { data, form } = $props();

  let signerName = $state('');
  let relationship = $state('');
  let city = $state('');
  let accepted = $state(false);
  let submitting = $state(false);

  // OTP state
  let digitRefs = $state<HTMLInputElement[]>([]);
  let otpValue = $state('');
  let digits = $derived(otpValue.padEnd(6, ' ').slice(0, 6).split(''));
  let otpComplete = $derived(otpValue.length === 6);
  let otpFormRef = $state<HTMLFormElement>(undefined!);

  const currentStep = $derived(form?.step ?? data.step);
  const studentName = $derived(form?.studentName ?? data.studentName);
  const talentId = $derived(form?.talentId ?? data.talentId);
  const canSign = $derived(
    accepted &&
      signerName.trim().length >= 2 &&
      relationship !== '' &&
      city.trim().length >= 1 &&
      !submitting,
  );

  function handleDigitInput(index: number, e: Event) {
    const input = e.target as HTMLInputElement;
    const raw = input.value.replace(/\D/g, '');

    if (raw.length > 1) {
      const pasted = raw.slice(0, 6);
      otpValue = pasted;
      const focusIndex = Math.min(pasted.length, 5);
      digitRefs[focusIndex]?.focus();
      return;
    }

    const val = raw.slice(-1);
    const chars = otpValue.padEnd(6, ' ').slice(0, 6).split('');
    chars[index] = val || ' ';
    otpValue = chars.join('').replace(/\s/g, '');
    if (val && index < 5) {
      digitRefs[index + 1]?.focus();
    }
  }

  function handleDigitKeydown(index: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[index]?.trim() && index > 0) {
      e.preventDefault();
      const chars = otpValue.split('');
      chars[index - 1] = '';
      otpValue = chars.join('').replace(/\s/g, '');
      digitRefs[index - 1]?.focus();
    }
  }

  function handleDigitPaste(e: ClipboardEvent) {
    e.preventDefault();
    const pasted = (e.clipboardData?.getData('text') || '')
      .replace(/\D/g, '')
      .slice(0, 6);
    otpValue = pasted;
    const focusIndex = Math.min(pasted.length, 5);
    digitRefs[focusIndex]?.focus();
  }

  // Auto-submit when OTP complete
  $effect(() => {
    if (otpComplete && otpFormRef) {
      otpFormRef.requestSubmit();
    }
  });

  // Autofocus first digit on mount
  $effect(() => {
    if (currentStep === 'otp') {
      setTimeout(() => digitRefs[0]?.focus(), 100);
    }
  });
</script>

<div
  class="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 p-4 transition-colors duration-500 dark:bg-slate-950"
>
  <div
    class="absolute -top-20 -right-20 h-100 w-100 rounded-full bg-epi-blue/10 blur-[100px] dark:bg-epi-blue/20"
  ></div>
  <div
    class="absolute -bottom-20 -left-20 h-100 w-100 rounded-full bg-epi-teal/10 blur-[100px] dark:bg-epi-teal/20"
  ></div>
  <div
    class="absolute inset-0 bg-[radial-gradient(var(--color-slate-200)_1px,transparent_1px)] bg-size-[32px_32px] opacity-50 dark:bg-[radial-gradient(var(--color-slate-800)_1px,transparent_1px)]"
  ></div>

  <div class="z-10 w-full max-w-lg">
    {#if currentStep === 'otp'}
      <!-- Step: Enter OTP code -->
      <div class="mb-6 text-center">
        <div
          class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
        >
          <KeyRound class="h-7 w-7" />
        </div>
        <h1
          class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
        >
          Autorisation parentale
        </h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Entrez le code à 6 chiffres reçu par email.
        </p>
      </div>

      {#if data.parentEmail}
        <div
          class="mb-6 rounded-xl bg-slate-50 p-4 text-center dark:bg-slate-950"
        >
          <p class="text-xs font-bold text-slate-500 uppercase">
            Code envoyé à
          </p>
          <p class="font-bold text-epi-blue">{data.parentEmail}</p>
        </div>
      {/if}

      <form
        bind:this={otpFormRef}
        method="POST"
        action="?/verifyOtp"
        use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            await update();
            submitting = false;
          };
        }}
      >
        <input type="hidden" name="talentId" value={talentId} />
        <input type="hidden" name="email" value={data.parentEmail ?? ''} />
        <input type="hidden" name="otp" bind:value={otpValue} />

        {#if form?.error && currentStep === 'otp'}
          <p
            class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
          >
            {form.error}
          </p>
        {/if}

        {#if form?.resent}
          <p
            class="mb-3 rounded-lg bg-green-50 px-3 py-2 text-center text-sm text-green-600 dark:bg-green-900/30 dark:text-green-400"
          >
            Un nouveau code a été envoyé.
          </p>
        {/if}

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

        <Button
          type="submit"
          disabled={submitting || !otpComplete}
          class="mt-6 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110 disabled:opacity-50"
        >
          {#if submitting}
            Vérification...
          {:else}
            Vérifier le code
          {/if}
        </Button>
      </form>

      <form method="POST" action="?/resendOtp" use:enhance class="mt-3">
        <input type="hidden" name="email" value={data.parentEmail ?? ''} />
        <input type="hidden" name="talentId" value={talentId} />
        <Button
          type="submit"
          variant="ghost"
          class="h-10 w-full rounded-xl text-xs font-bold text-slate-400 uppercase hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          Renvoyer le code
        </Button>
      </form>
    {:else if currentStep === 'sign'}
      <!-- Step: Sign document -->
      <div class="mb-6 text-center">
        <div
          class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
        >
          <Camera class="h-7 w-7" />
        </div>
        <h1
          class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
        >
          Droit à l'image
        </h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Document concernant <strong>{studentName}</strong>
        </p>
      </div>

      <form
        method="POST"
        action="?/sign"
        use:enhance={() => {
          submitting = true;
          return async ({ update }) => {
            await update();
            submitting = false;
          };
        }}
      >
        <input type="hidden" name="talentId" value={talentId} />

        {#if form?.error && currentStep === 'sign'}
          <p
            class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
          >
            {form.error}
          </p>
        {/if}

        <div
          class="max-h-[50vh] overflow-y-auto rounded-2xl border-none bg-white/70 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl dark:bg-slate-900/80"
        >
          <div class="markdown-content max-w-none text-sm">
            <p>
              Je soussign&eacute;(e), Mme/Mr
              <input
                name="signerName"
                type="text"
                bind:value={signerName}
                placeholder="___________________"
                required
                class="inline-block w-44 border-0 border-b border-slate-300 bg-transparent px-1 text-center text-sm font-semibold text-slate-900 placeholder:text-slate-300 focus:border-epi-blue focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
              />
              agissant en qualit&eacute; de
              <select
                name="relationship"
                bind:value={relationship}
                required
                class="inline-block w-auto border-0 border-b border-slate-300 bg-transparent px-1 text-center text-sm font-semibold text-slate-900 focus:border-epi-blue focus:ring-0 dark:text-white [&>option]:bg-white [&>option]:text-slate-900 dark:[&>option]:bg-slate-800 dark:[&>option]:text-white"
              >
                <option value="" disabled class="text-slate-400"
                  >(choisir)</option
                >
                <option value="mère">mère</option>
                <option value="père">père</option>
                <option value="tuteur légal">tuteur légal</option>
                <option value="tutrice légale">tutrice légale</option>
              </select>, autorise <strong>Epitech</strong> à utiliser l'image de
              mon enfant <strong>{studentName}</strong> dans le cadre du stage de
              seconde.
            </p>
            {@html droitImageBody}

            <p class="mt-6">
              <strong>Fait &agrave;</strong>
              <input
                name="city"
                type="text"
                bind:value={city}
                placeholder="__________________"
                required
                class="inline-block w-40 border-0 border-b border-slate-300 bg-transparent px-1 text-center text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
              /><strong
                >, le {new Date().toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}</strong
              >
            </p>
          </div>
        </div>

        <div class="mt-6">
          <label
            class="flex cursor-pointer items-center gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
          >
            <input
              type="checkbox"
              bind:checked={accepted}
              class="h-5 w-5 shrink-0 rounded border-slate-300 text-epi-teal accent-epi-teal focus:ring-epi-teal"
            />
            <span class="text-sm text-slate-700 dark:text-slate-300">
              En tant que représentant légal, j'autorise l'utilisation de
              l'image de mon enfant
            </span>
          </label>

          <Button
            type="submit"
            disabled={!canSign}
            class="mt-4 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
          >
            {#if submitting}
              Signature en cours...
            {:else}
              Signer
            {/if}
          </Button>
        </div>
      </form>
    {:else if currentStep === 'done'}
      <!-- Step: Confirmation -->
      <div class="text-center">
        <div
          class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500 text-white shadow-lg shadow-green-500/20"
        >
          <CheckCircle class="h-7 w-7" />
        </div>
        <h1
          class="font-heading text-2xl tracking-tight text-green-600 uppercase dark:text-green-400"
        >
          Merci !
        </h1>
        <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
          L'autorisation de droit &agrave; l'image pour <strong
            >{studentName}</strong
          > a &eacute;t&eacute; sign&eacute;e avec succ&egrave;s. Merci pour votre
          confiance.
        </p>
      </div>
    {/if}

    <p
      class="mt-8 text-center text-[10px] font-bold tracking-widest text-slate-400 uppercase"
    >
      Propulsé par Epitech Academy
    </p>
  </div>
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
