<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import { Rocket, CircleAlert, Mail } from '@lucide/svelte';
  import { untrack } from 'svelte';

  import LoginEmailStep from './components/LoginEmailStep.svelte';
  import LoginOtpStep from './components/LoginOtpStep.svelte';
  import { authClient } from '$lib/auth-client';
  import { resolve } from '$app/paths';

  let { data } = $props();
  let isOAuthLoading = $state(false);

  async function handleMicrosoftLogin() {
    isOAuthLoading = true;
    await authClient.signIn.social({
      provider: 'microsoft',
      callbackURL: resolve('/oauth/callback'),
    });
  }

  // 'oauth' = default view, 'email' = email step, 'otp' = OTP step
  let step = $state<'oauth' | 'email' | 'otp'>('oauth');

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
          $otpForm.email = $emailForm.email.toLowerCase().trim();
          step = 'otp';
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
    },
  );

  function goBackToEmail() {
    step = 'email';
    $otpForm.password = '';
    $otpMessage = undefined;
  }

  function goBackToOAuth() {
    step = 'oauth';
    $emailMessage = undefined;
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
            {#if step === 'oauth'}
              Prêt pour l'aventure ?
            {:else if step === 'email'}
              Connexion par email
            {:else}
              Dernière étape !
            {/if}
          </Card.Description>
        </div>
      </Card.Header>

      <Card.Content class="pb-10">
        {#if step === 'oauth'}
          <div class="animate-slide-in-left">
            {#if data.errorMessage}
              <Alert
                variant="destructive"
                class="mb-6 rounded-xl border-red-100 bg-red-50 text-red-800 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300"
              >
                <CircleAlert class="h-4 w-4" />
                <AlertDescription class="text-xs font-medium">
                  {data.errorMessage}
                </AlertDescription>
              </Alert>
            {/if}

            <div class="space-y-4">
              <Button
                onclick={handleMicrosoftLogin}
                disabled={isOAuthLoading}
                size="lg"
                class="relative h-12 w-full gap-3 rounded-xl bg-epi-blue text-base font-bold text-white shadow-md transition-all hover:bg-epi-blue/90 active:scale-[0.98]"
              >
                <svg
                  viewBox="0 0 23 23"
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                >
                  <path fill="#f3f3f3" d="M0 0h23v23H0z" />
                  <path fill="#f35325" d="M1 1h10v10H1z" />
                  <path fill="#81bc06" d="M12 1h10v10H12z" />
                  <path fill="#05a6f0" d="M1 12h10v10H1z" />
                  <path fill="#ffba08" d="M12 12h10v10H12z" />
                </svg>
                {isOAuthLoading
                  ? 'Redirection...'
                  : 'Se connecter avec Office 365'}
              </Button>

              <div class="relative">
                <div class="absolute inset-0 flex items-center">
                  <span
                    class="w-full border-t border-slate-200 dark:border-slate-800"
                  ></span>
                </div>
                <div class="relative flex justify-center text-[10px] uppercase">
                  <span
                    class="bg-white/70 px-2 font-bold tracking-wider text-slate-400 dark:bg-slate-900/80"
                  >
                    ou
                  </span>
                </div>
              </div>

              <Button
                variant="outline"
                size="lg"
                class="h-12 w-full gap-3 rounded-xl border-slate-200 text-base font-bold transition-all hover:border-epi-blue hover:bg-epi-blue/5 hover:text-epi-blue dark:border-slate-800"
                onclick={() => (step = 'email')}
              >
                <Mail class="h-5 w-5" />
                Se connecter par email
              </Button>
            </div>
          </div>
        {:else if step === 'email'}
          <LoginEmailStep
            {emailForm}
            {emailErrors}
            {emailEnhance}
            {emailDelayed}
            {emailMessage}
            goBack={goBackToOAuth}
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
