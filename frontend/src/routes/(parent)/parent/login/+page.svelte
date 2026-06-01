<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import EpitechLogo from '$lib/components/layout/EpitechLogo.svelte';
  import LoginBrandPanel from '$lib/components/layout/LoginBrandPanel.svelte';
  import LoginOtpStep from '$lib/components/auth/LoginOtpStep.svelte';
  import { untrack } from 'svelte';
  import { track, errReason } from '$lib/analytics';

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
          track('parent_otp_email_submitted');
          $otpForm.email = $emailForm.email.toLowerCase().trim();
          step = 'otp';
        } else if (form.message?.type === 'error') {
          track('parent_otp_email_failed', { reason: errReason(form.message) });
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
      onSubmit: () => {
        track('parent_otp_code_submitted');
      },
      onUpdated: ({ form }) => {
        if (form.message?.type === 'error') {
          track('parent_otp_code_failed', { reason: errReason(form.message) });
        }
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
  <title>Connexion — Espace Parent</title>
</svelte:head>

<div class="grid min-h-screen w-full lg:grid-cols-[1.05fr_1fr]">
  <!-- Brand panel — parent-facing baseline. -->
  <LoginBrandPanel>
    <h1 class="font-heading text-5xl leading-[0.95] xl:text-6xl">
      Suivez leur<br />parcours<span class="text-epi-teal">_</span>
    </h1>
    <p class="max-w-md font-mono text-sm text-white/70">
      &lt; Leur progression, leur assiduité et leurs réussites, en un coup
      d'œil. /&gt;
    </p>
    <p class="font-mono text-xs tracking-widest text-white/50 uppercase">
      Progression/ Stages/ Présence/ Diplômes/
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
              Espace parent — connectez-vous pour suivre le parcours de votre
              enfant.
            {:else}
              Dernière étape — saisissez le code reçu par email.
            {/if}
          </p>
        </div>
      </header>

      {#if step === 'email'}
        <div class="animate-slide-in-left">
          {#if $emailMessage && $emailMessage.type === 'error'}
            <Alert
              variant="destructive"
              class="mb-6 rounded-xl border-red-100 bg-red-50 text-red-800 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300"
            >
              <CircleAlert class="h-4 w-4" />
              <AlertDescription class="text-xs font-medium"
                >{$emailMessage.text}</AlertDescription
              >
            </Alert>
          {/if}

          <form
            method="POST"
            action="?/requestOtp"
            use:emailEnhance
            class="space-y-5"
          >
            <div class="space-y-2">
              <Label
                for="email"
                class="pl-1 text-xs font-black text-slate-500 uppercase"
                >Votre adresse email</Label
              >
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="votre@email.com"
                bind:value={$emailForm.email}
                class="h-12 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-base focus-visible:ring-epi-blue dark:border-slate-800 dark:bg-slate-950/50"
              />
              {#if $emailErrors.email}<span
                  class="pl-1 text-xs font-bold text-red-500"
                  >{$emailErrors.email}</span
                >{/if}
            </div>

            <Button
              type="submit"
              disabled={$emailDelayed}
              class="h-12 w-full rounded-xl bg-epi-blue text-base font-bold text-white shadow-md transition-all hover:bg-epi-blue/90 active:scale-[0.98]"
            >
              {#if $emailDelayed}
                <Sparkles class="mr-2 h-4 w-4 animate-spin" /> Envoi en cours...
              {:else}
                Recevoir mon code
              {/if}
            </Button>
          </form>
        </div>
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
      <p class="text-center text-xs text-muted-foreground">
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
  </main>
</div>
