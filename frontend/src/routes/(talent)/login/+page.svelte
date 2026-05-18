<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import * as Card from '$lib/components/ui/card';
  import Rocket from '@lucide/svelte/icons/rocket';
  import { untrack } from 'svelte';

  import LoginEmailStep from './components/LoginEmailStep.svelte';
  import LoginOtpStep from './components/LoginOtpStep.svelte';
  import { track } from '$lib/analytics';

  let { data } = $props();

  let step = $state<'email' | 'otp'>('email');

  const {
    form: emailForm,
    errors: emailErrors,
    enhance: emailEnhance,
    delayed: emailDelayed,
    message: emailMessage,
  } = superForm(
    untrack(() => data.emailForm),
    {
      resetForm: false,
      onUpdated: ({ form }) => {
        if (form.valid && form.message?.type === 'success') {
          track('talent_otp_email_submitted');
          $otpForm.email = $emailForm.email.toLowerCase().trim();
          step = 'otp';
        } else if (form.message?.type === 'error') {
          track('talent_otp_email_failed');
        }
      },
    },
  );

  const {
    form: otpForm,
    errors: otpErrors,
    enhance: otpEnhance,
    delayed: otpDelayed,
    message: otpMessage,
  } = superForm(
    untrack(() => data.otpForm),
    {
      resetForm: false,
      onUpdated: ({ form }) => {
        if (form.message?.type === 'error') {
          track('talent_otp_code_failed');
        }
      },
      onSubmit: () => {
        track('talent_otp_code_submitted');
      },
    },
  );

  function goBackToEmail() {
    step = 'email';
    $otpForm.password = '';
    $otpMessage = undefined;
  }
</script>

<svelte:head>
  <title>Connexion</title>
</svelte:head>

<div
  class="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 p-4 transition-colors duration-500 dark:bg-slate-950"
>
  <!-- Visual background elements -->
  <div
    class="absolute -top-20 -right-20 h-100 w-100 rounded-full bg-epi-blue/10 blur-[100px] dark:bg-epi-blue/20"
  ></div>
  <div
    class="absolute -bottom-20 -left-20 h-100 w-100 rounded-full bg-epi-teal/10 blur-[100px] dark:bg-epi-teal/20"
  ></div>
  <div
    class="absolute inset-0 bg-[radial-gradient(var(--color-slate-200)_1px,transparent_1px)] bg-size-[32px_32px] opacity-50 dark:bg-[radial-gradient(var(--color-slate-800)_1px,transparent_1px)]"
  ></div>

  <div class="z-10 w-full max-w-md">
    <Card.Root
      class="relative w-full overflow-hidden rounded-2xl border-none bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl dark:bg-slate-900/80"
    >
      <div class="h-1.5 w-full bg-linear-to-r from-epi-blue to-epi-teal"></div>

      <Card.Header class="space-y-4 pt-8 pb-4 text-center">
        <div
          class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
        >
          <Rocket class="h-7 w-7" />
        </div>

        <div class="space-y-1">
          <Card.Title
            class="font-heading text-3xl tracking-tight text-epi-blue uppercase"
          >
            Jump
          </Card.Title>
          <Card.Description
            class="text-sm font-bold tracking-tight text-slate-500 uppercase"
          >
            {#if step === 'email'}
              Prêt pour l'aventure ?
            {:else}
              Dernière étape !
            {/if}
          </Card.Description>
        </div>
      </Card.Header>

      <Card.Content class="pb-10">
        {#if step === 'email'}
          <LoginEmailStep
            {emailForm}
            {emailErrors}
            {emailEnhance}
            {emailDelayed}
            {emailMessage}
            errorMessage={data.errorMessage}
          />
        {:else}
          <LoginOtpStep
            {otpForm}
            {otpErrors}
            {otpEnhance}
            {otpDelayed}
            {otpMessage}
            goBack={goBackToEmail}
          />
        {/if}
      </Card.Content>
    </Card.Root>

    <p
      class="mt-8 text-center text-[10px] font-bold tracking-widest text-slate-400 uppercase"
    >
      Propulsé par Epitech Academy
    </p>
  </div>
</div>

<style>
  /* Subtle background pulse animation */
  @keyframes pulse-slow {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.5;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.7;
    }
  }

  .absolute.rounded-full {
    animation: pulse-slow 15s ease-in-out infinite;
  }

  @keyframes slide-in-right {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes slide-in-left {
    from {
      opacity: 0;
      transform: translateX(-20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  :global(.animate-slide-in-right) {
    animation: slide-in-right 300ms ease-out;
  }

  :global(.animate-slide-in-left) {
    animation: slide-in-left 300ms ease-out;
  }
</style>
