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
  import { authClient } from '$lib/auth-client';
  import EpitechLogo from '$lib/components/layout/EpitechLogo.svelte';
  import LoginBrandPanel from '$lib/components/layout/LoginBrandPanel.svelte';
  import LoginFooter from '$lib/components/layout/LoginFooter.svelte';
  import { resolve } from '$app/paths';
  import { track } from '$lib/analytics';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import CodeTag from '$lib/components/layout/CodeTag.svelte';

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
    <h1 class="font-heading text-display-xl xl:text-display-2xl">
      We power tech<TitleCursor />
    </h1>
    <p class="max-w-md font-mono text-sm text-white/70">
      <CodeTag
        >La plateforme de gestion des stages et coding clubs d'Epitech.</CodeTag
      >
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
        <!-- Compact logo: mobile only (the brand panel carries it on desktop) -->
        <EpitechLogo class="h-7 w-auto lg:hidden" />
        <div class="space-y-2">
          <h2 class="font-heading text-display-l">
            Jump<TitleCursor />
          </h2>
          <p class="text-sm text-muted-foreground">
            Espace staff : connectez-vous pour accéder à votre espace.
          </p>
        </div>
      </header>

      <!-- Error -->
      {#if data.errorMessage}
        <Alert variant="destructive" class="border-destructive/50">
          <CircleAlert class="h-4 w-4" />
          <AlertTitle class="epi-overline">Erreur d'accès</AlertTitle>
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
            <span class="bg-background px-2 epi-overline text-muted-foreground">
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
      <LoginFooter
        prompt="Élève ou parent ?"
        linkLabel="Se connecter"
        linkHref={resolve('/login')}
      />
    </div>
  </main>
</div>
