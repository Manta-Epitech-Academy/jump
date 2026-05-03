<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from '$lib/components/ui/alert';
  import { CircleAlert, Terminal, Lock, LoaderCircle } from '@lucide/svelte';
  import { authClient } from '$lib/auth-client';
  import { resolve } from '$app/paths';

  let { data } = $props();
  let isLoading = $state(false);

  async function handleMicrosoftLogin() {
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

<!-- Outer Container with Custom Background Class -->
<div
  class="login-bg relative flex min-h-screen w-full items-center justify-center overflow-hidden p-4"
>
  <!-- 1. Technical Grid Background -->
  <div
    class="absolute inset-0 z-0 opacity-[0.08] dark:opacity-[0.15]"
    style="background-image: radial-gradient(var(--epi-blue) 1.5px, transparent 1.5px); background-size: 24px 24px;"
  ></div>

  <!-- 2. Vignette Overlay -->
  <div
    class="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.05)_100%)] dark:bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]"
  ></div>

  <!-- Login Card -->
  <div class="z-10 w-full max-w-md">
    <Card.Root
      class="relative w-full overflow-hidden border-t-4 border-t-epi-blue bg-card/95 shadow-2xl backdrop-blur-sm dark:shadow-none dark:ring-1 dark:ring-border/50"
    >
      <div
        class="absolute -top-3 -right-3 h-6 w-6 rotate-45 bg-epi-teal opacity-50 dark:opacity-80"
      ></div>

      <Card.Header class="space-y-4 pb-2 text-center">
        <!-- Logo Icon -->
        <div
          class="mx-auto flex h-12 w-12 items-center justify-center rounded-sm bg-epi-blue text-white shadow-sm"
        >
          <Terminal class="h-6 w-6" />
        </div>

        <!-- Title Section -->
        <div class="space-y-1">
          <Card.Title class="font-heading text-2xl tracking-wide uppercase">
            Jump<span class="text-epi-teal">_</span>
          </Card.Title>
          <Card.Description
            >Plateforme de gestion pédagogique Epitech</Card.Description
          >
        </div>
      </Card.Header>

      <Card.Content class="space-y-6 pt-6">
        <!-- Error Handling -->
        {#if data.errorMessage}
          <Alert
            variant="destructive"
            class="border-destructive/50 bg-destructive/5"
          >
            <CircleAlert class="h-4 w-4" />
            <AlertTitle class="text-[11px] font-bold tracking-widest uppercase"
              >Erreur d'accès</AlertTitle
            >
            <AlertDescription class="text-xs">
              {data.errorMessage}
            </AlertDescription>
          </Alert>
        {/if}

        <!-- Login Button -->
        <Button
          onclick={handleMicrosoftLogin}
          disabled={isLoading}
          variant="outline"
          size="lg"
          class="relative h-12 w-full gap-3 border-input bg-background font-bold transition-all hover:border-epi-blue hover:bg-epi-blue/5 hover:text-epi-blue"
        >
          {#if isLoading}
            <LoaderCircle class="h-5 w-5 animate-spin text-epi-blue" />
            Redirection...
          {:else}
            <!-- Microsoft Icon (Small) -->
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
          <div class="relative flex justify-center text-[10px] uppercase">
            <span
              class="bg-card px-2 font-bold tracking-wider text-muted-foreground"
            >
              Accès Sécurisé
            </span>
          </div>
        </div>

        <!-- Info Box -->
        <div
          class="flex items-start gap-3 rounded-sm bg-muted/50 p-3 text-xs text-muted-foreground"
        >
          <Lock class="mt-0.5 h-4 w-4 shrink-0 text-epi-blue" />
          <span>
            L'accès est strictement réservé aux adresses <strong
              class="text-foreground">@epitech.eu</strong
            >. Veuillez utiliser votre compte organisationnel.
          </span>
        </div>
      </Card.Content>
    </Card.Root>
  </div>
</div>

<style>
  /* Base background color */
  .login-bg {
    background-color: var(--background);
  }

  /* CRT Scanline Effect */
  .login-bg::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: linear-gradient(
      to bottom,
      transparent 50%,
      rgba(1, 58, 251, 0.05) 51%,
      transparent 51%
    );
    background-size: 100% 4px;
    pointer-events: none;
    z-index: 2;
  }
</style>
