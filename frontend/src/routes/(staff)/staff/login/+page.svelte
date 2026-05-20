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
  <!-- Brand panel — full-bleed Epitech blue, blueprint grid + pixel overlays.
       Hidden below lg; the right column carries a compact logo on mobile. -->
  <aside
    class="relative hidden flex-col justify-between overflow-hidden bg-[#013afb] p-12 text-white lg:flex xl:p-16"
  >
    <!-- Blueprint grid texture -->
    <div
      aria-hidden="true"
      class="absolute inset-0 bg-[image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:32px_32px]"
    ></div>
    <!-- Pixel overlays — 50% squares, offset, overlapping (brand signature) -->
    <div aria-hidden="true" class="absolute inset-0">
      <div class="absolute top-[18%] right-[22%] h-16 w-24 bg-white/15"></div>
      <div class="absolute top-[24%] right-[12%] h-20 w-16 bg-white/10"></div>
      <div
        class="absolute bottom-[26%] left-[14%] h-14 w-20 bg-epi-teal/15"
      ></div>
    </div>

    <!-- Logo (recolored to white via filter from the single brand asset) -->
    <div class="relative z-10">
      <img
        src="/EPITECH-LOGO-BLEU-2025.svg"
        alt="Epitech"
        class="h-8 w-auto brightness-0 invert"
      />
    </div>

    <!-- Baseline + keywords -->
    <div class="relative z-10 space-y-6">
      <h1 class="font-heading text-5xl leading-[0.95] xl:text-6xl">
        We power tech<span class="text-epi-teal">_</span>
      </h1>
      <p class="max-w-md font-mono text-sm text-white/70">
        &lt; La plateforme de gestion des stages et coding clubs d'Epitech.
        /&gt;
      </p>
      <p class="font-mono text-xs tracking-widest text-white/50 uppercase">
        Stages/ Coding clubs/ Admissions/ Pédagogie/
      </p>
    </div>

    <!-- Signature block -->
    <div class="relative z-10 font-mono text-xs text-white/60">
      <span class="text-epi-teal">&#123;</span>
      &lt;Tech Together Tomorrow&gt;
      <span class="text-epi-teal">&#125;</span>
      <span class="ml-2 tracking-widest uppercase">Since 1999</span>
    </div>
  </aside>

  <!-- Auth panel -->
  <main class="flex items-center justify-center bg-background p-6 sm:p-12">
    <div class="w-full max-w-sm space-y-8">
      <!-- Header -->
      <header class="space-y-5">
        <!-- Compact logo — mobile only (the brand panel carries it on desktop) -->
        <img
          src="/EPITECH-LOGO-BLEU-2025.svg"
          alt="Epitech"
          class="h-7 w-auto lg:hidden dark:brightness-0 dark:invert"
        />
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
