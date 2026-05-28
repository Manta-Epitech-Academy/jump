<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from '$lib/components/ui/alert';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import Lock from '@lucide/svelte/icons/lock';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { authClient } from '$lib/auth-client';
  import EpitechLogo from '$lib/components/layout/EpitechLogo.svelte';
  import LoginBrandPanel from '$lib/components/layout/LoginBrandPanel.svelte';
  import { resolve } from '$app/paths';
  import { track } from '$lib/analytics';

  let { data } = $props();
  let isLoading = $state(false);

  async function handleMicrosoftLogin() {
    track('staff_login_microsoft_clicked');
    isLoading = true;
    await authClient.signIn.social({
      provider: 'microsoft',
      callbackURL: resolve('/staff/oauth/callback'),
    });
  }
</script>

<svelte:head>
  <title>Connexion staff</title>
</svelte:head>

<div class="grid min-h-screen w-full lg:grid-cols-[1.05fr_1fr]">
  <LoginBrandPanel>
    <h1 class="font-heading text-5xl leading-[0.95] xl:text-6xl">
      We power tech<span class="text-epi-teal">_</span>
    </h1>
    <p class="max-w-md font-mono text-sm text-white/70">
      &lt; La plateforme de gestion des stages et coding clubs d'Epitech. /&gt;
    </p>
    <p class="font-mono text-xs tracking-widest text-white/50 uppercase">
      Stages/ Coding clubs/ Admissions/ Pédagogie/
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
            Espace staff — connectez-vous pour accéder à votre espace.
          </p>
        </div>
      </header>

      <!-- Error -->
      {#if data.errorMessage}
        <Alert variant="destructive" class="border-destructive/50">
          <CircleAlert class="h-4 w-4" />
          <AlertTitle class="text-[11px] font-bold tracking-widest uppercase">
            Erreur d'accès
          </AlertTitle>
          <AlertDescription class="text-xs">
            {data.errorMessage}
          </AlertDescription>
        </Alert>
      {/if}

      <!-- Login -->
      <div class="space-y-5">
        <Button
          onclick={handleMicrosoftLogin}
          disabled={isLoading}
          variant="outline"
          size="lg"
          class="h-12 w-full gap-3 transition-colors hover:border-epi-blue hover:text-epi-blue"
        >
          {#if isLoading}
            <LoaderCircle class="h-5 w-5 animate-spin text-epi-blue" />
            Redirection...
          {:else}
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
            Se connecter avec Office 365
          {/if}
        </Button>

        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <span class="w-full border-t border-border"></span>
          </div>
          <div class="relative flex justify-center">
            <span
              class="bg-background px-2 font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
            >
              Accès sécurisé
            </span>
          </div>
        </div>

        <div
          class="flex items-start gap-3 border border-border bg-muted/40 p-3 text-xs text-muted-foreground"
        >
          <Lock class="mt-0.5 h-4 w-4 shrink-0 text-epi-blue" />
          <span>
            L'accès est strictement réservé aux adresses
            <strong class="text-foreground">@epitech.eu</strong>. Veuillez
            utiliser votre compte organisationnel.
          </span>
        </div>
      </div>

      <!-- Footer -->
      <div class="space-y-3 text-center">
        <p class="text-sm text-muted-foreground">
          Vous êtes étudiant ?
          <a
            href={resolve('/login')}
            class="group ml-0.5 inline-flex items-center gap-1 font-semibold text-epi-blue transition-colors hover:underline"
          >
            Espace talent
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
