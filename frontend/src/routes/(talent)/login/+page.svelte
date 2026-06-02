<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { resolve } from '$app/paths';
  import { untrack } from 'svelte';

  import EpitechLogo from '$lib/components/layout/EpitechLogo.svelte';
  import LoginBrandPanel from '$lib/components/layout/LoginBrandPanel.svelte';
  import LoginFooter from '$lib/components/layout/LoginFooter.svelte';
  import LoginEmailStep from './components/LoginEmailStep.svelte';
  import LoginOtpStep from '$lib/components/auth/LoginOtpStep.svelte';
  import { track, errReason, secondsBetween } from '$lib/analytics';

  let { data } = $props();

  let step = $state<'email' | 'otp'>('email');
  let userKind = $state<'talent' | 'parent' | null>(null);
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
          userKind = form.message.userKind ?? 'talent';
          track(`${userKind}_otp_email_submitted`, {
            attempt: ++emailAttempts,
          });
          $otpForm.email = $emailForm.email.toLowerCase().trim();
          step = 'otp';
        } else if (form.message?.type === 'error') {
          track('otp_email_failed', {
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
          track(`${userKind ?? 'talent'}_otp_code_failed`, {
            attempt: codeAttempts,
            reason: errReason(form.message),
            secondsSinceEmail: secondsBetween(otpEmailSentAt),
          });
        }
      },
      onSubmit: () => {
        track(`${userKind ?? 'talent'}_otp_code_submitted`, {
          attempt: ++codeAttempts,
          secondsSinceEmail: secondsBetween(otpEmailSentAt),
        });
      },
    },
  );

  function goBackToEmail() {
    step = 'email';
    userKind = null;
    $otpForm.password = '';
    $otpMessage = undefined;
  }
</script>

<svelte:head>
  <title>Connexion</title>
</svelte:head>

<div class="grid min-h-screen w-full lg:grid-cols-[1.05fr_1fr]">
  <LoginBrandPanel>
    <h1 class="font-heading text-5xl leading-[0.95] xl:text-6xl">
      {#if userKind === 'parent'}
        Suivez leur<br />parcours<span class="text-epi-teal">_</span>
      {:else}
        Passe au niveau<br />supérieur<span class="text-epi-teal">_</span>
      {/if}
    </h1>
    <p class="max-w-md font-mono text-sm text-white/70">
      {#if userKind === 'parent'}
        &lt; Leur progression, leur assiduité et leurs réussites, en un coup
        d'œil. /&gt;
      {:else}
        &lt; La plateforme qui t'accompagne lors de tes stages et coding clubs à
        Epitech. /&gt;
      {/if}
    </p>
    <p class="font-mono text-xs tracking-widest text-white/50 uppercase">
      {#if userKind === 'parent'}
        Progression/ Stages/ Présence/ Diplômes/
      {:else}
        Défis/ Badges/ XP/ Portfolio/
      {/if}
    </p>
  </LoginBrandPanel>

  <main class="flex items-center justify-center bg-background p-6 sm:p-12">
    <div class="w-full max-w-sm space-y-8">
      <header class="space-y-5">
        <EpitechLogo class="h-7 w-auto lg:hidden" />
        <div class="space-y-2">
          <h2 class="font-heading text-3xl tracking-wide">
            Jump<span class="text-epi-teal">_</span>
          </h2>
          <p class="text-sm text-muted-foreground">
            {#if step === 'otp'}
              Dernière étape !
            {:else}
              Élève ou parent, connectez-vous avec votre email.
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

      <LoginFooter
        prompt="Vous faites partie du staff ?"
        linkLabel="Espace staff"
        linkHref={resolve('/staff/login')}
      />
    </div>
  </main>
</div>
