<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { resolve } from '$app/paths';
  import { untrack } from 'svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';

  import EpitechLogo from '$lib/components/layout/EpitechLogo.svelte';
  import LoginBrandPanel from '$lib/components/layout/LoginBrandPanel.svelte';
  import LoginEmailStep from './components/LoginEmailStep.svelte';
  import LoginOtpStep from '$lib/components/auth/LoginOtpStep.svelte';
  import { track, errReason, secondsBetween } from '$lib/analytics';

  let { data } = $props();

  let step = $state<'email' | 'otp'>('email');
  // Track funnel timings so we can spot OTP latency or repeated retries.
  let otpEmailSentAt = $state<number | null>(null);
  let emailAttempts = $state(0);
  let codeAttempts = $state(0);

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
          otpEmailSentAt = Date.now();
          track('talent_otp_email_submitted', { attempt: ++emailAttempts });
          $otpForm.email = $emailForm.email.toLowerCase().trim();
          step = 'otp';
        } else if (form.message?.type === 'error') {
          track('talent_otp_email_failed', {
            attempt: ++emailAttempts,
            reason: errReason(form.message),
          });
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
          track('talent_otp_code_failed', {
            attempt: codeAttempts,
            reason: errReason(form.message),
            secondsSinceEmail: secondsBetween(otpEmailSentAt),
          });
        }
      },
      onSubmit: () => {
        track('talent_otp_code_submitted', {
          attempt: ++codeAttempts,
          secondsSinceEmail: secondsBetween(otpEmailSentAt),
        });
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

<div class="grid min-h-screen w-full lg:grid-cols-[1.05fr_1fr]">
  <!-- Brand panel — student-facing baseline; the gamified portal in one line. -->
  <LoginBrandPanel>
    <h1 class="font-heading text-5xl leading-[0.95] xl:text-6xl">
      Passe au niveau<br />supérieur<span class="text-epi-teal">_</span>
    </h1>
    <p class="max-w-md font-mono text-sm text-white/70">
      &lt; La plateforme qui t'accompagne lors de tes stages et coding clubs à
      Epitech. /&gt;
    </p>
    <p class="font-mono text-xs tracking-widest text-white/50 uppercase">
      Défis/ Badges/ XP/ Portfolio/
    </p>
  </LoginBrandPanel>

  <!-- Auth panel -->
  <main class="flex items-center justify-center bg-background p-6 sm:p-12">
    <div class="w-full max-w-sm space-y-8">
      <!-- Header -->
      <header class="space-y-5">
        <!-- Compact logo — mobile only (the brand panel carries it on desktop) -->
        <EpitechLogo class="h-7 w-auto lg:hidden" />
        <div class="space-y-2">
          <h2 class="font-heading text-3xl tracking-wide">
            Jump<span class="text-epi-teal">_</span>
          </h2>
          <p class="text-sm text-muted-foreground">
            {#if step === 'email'}
              Envie de découvrir la tech ?
            {:else}
              Dernière étape !
            {/if}
          </p>
        </div>
      </header>

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

      <!-- Footer -->
      <div class="space-y-3 text-center">
        <p class="text-sm text-muted-foreground">
          Vous faites partie du staff ?
          <a
            href={resolve('/staff/login')}
            class="group ml-0.5 inline-flex items-center gap-1 font-semibold text-epi-blue transition-colors hover:underline"
          >
            Espace staff
            <ArrowRight
              class="size-3.5 transition-transform group-hover:translate-x-0.5"
            />
          </a>
        </p>

        <p class="text-xs text-muted-foreground">
          Propulsé par
          <a
            href="https://www.epitech.eu"
            target="_blank"
            rel="noopener noreferrer"
            class="font-bold text-epi-blue transition-colors hover:underline"
          >
            Epitech
          </a>
        </p>
      </div>
    </div>
  </main>
</div>
