<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Card from '$lib/components/ui/card';
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from '$lib/components/ui/alert';
  import {
    ShieldAlert,
    FingerprintPattern,
    Lock,
    Server,
  } from '@lucide/svelte';

  let { data } = $props();

  // svelte-ignore state_referenced_locally
  const { form, errors, enhance, delayed, message } = superForm(data.form, {
    resetForm: false,
  });
</script>

<!-- Outer Container with Dark/Root Background -->
<div
  class="admin-login-bg relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-950 p-4"
>
  <!-- Technical Grid Background -->
  <div
    class="absolute inset-0 z-0 opacity-10"
    style="background-image: linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px); background-size: 30px 30px;"
  ></div>

  <!-- Deep Shadow Vignette Overlay -->
  <div
    class="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)]"
  ></div>

  <!-- Login Card -->
  <div class="z-10 w-full max-w-md">
    <Card.Root
      class="relative w-full overflow-hidden border-t-4 border-t-epi-pink bg-slate-900/95 text-slate-100 shadow-2xl backdrop-blur-sm"
    >
      <div
        class="absolute -top-3 -right-3 h-6 w-6 rotate-45 bg-epi-pink opacity-80"
      ></div>

      <Card.Header class="space-y-4 pb-2 text-center">
        <!-- Root/Admin Icon -->
        <div
          class="mx-auto flex h-12 w-12 items-center justify-center rounded-sm bg-epi-pink text-white shadow-[0_0_15px_rgba(255,30,247,0.4)]"
        >
          <FingerprintPattern class="h-6 w-6" />
        </div>

        <div class="space-y-1">
          <Card.Title
            class="font-heading text-2xl tracking-wide text-white uppercase"
          >
            System Admin<span class="animate-pulse text-epi-pink">_</span>
          </Card.Title>
          <Card.Description class="text-slate-400">
            Authentification Superuser Requise
          </Card.Description>
        </div>
      </Card.Header>

      <Card.Content class="space-y-6 pt-6">
        <!-- Error Message from Superforms -->
        {#if $message}
          <Alert
            variant="destructive"
            class="border-red-500/50 bg-red-950/50 text-red-200"
          >
            <ShieldAlert class="h-4 w-4" color="#f87171" />
            <AlertTitle
              class="text-[11px] font-bold tracking-widest text-red-300 uppercase"
            >
              Alerte de sécurité
            </AlertTitle>
            <AlertDescription class="text-xs">
              {$message}
            </AlertDescription>
          </Alert>
        {/if}

        <!-- Admin Login Form -->
        <form method="POST" use:enhance class="space-y-4">
          <div class="space-y-2">
            <Label for="email" class="text-slate-300">Adresse Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="admin@example.com"
              bind:value={$form.email}
              class="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:ring-epi-pink"
            />
            {#if $errors.email}<span class="text-xs text-red-400"
                >{$errors.email}</span
              >{/if}
          </div>

          <div class="space-y-2">
            <Label for="password" class="text-slate-300">Mot de passe</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              bind:value={$form.password}
              class="border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus-visible:ring-epi-pink"
            />
            {#if $errors.password}<span class="text-xs text-red-400"
                >{$errors.password}</span
              >{/if}
          </div>

          <Button
            type="submit"
            disabled={$delayed}
            class="mt-2 w-full bg-epi-pink text-white transition-all hover:bg-epi-pink/80 hover:shadow-[0_0_15px_rgba(255,30,247,0.3)]"
          >
            {#if $delayed}
              Authentification en cours...
            {:else}
              <Lock class="mr-2 h-4 w-4" />
              Accéder au système
            {/if}
          </Button>
        </form>

        <!-- Info Box -->
        <div
          class="flex items-start gap-3 rounded-sm border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400"
        >
          <Server class="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <span>
            Cet espace est réservé à l'administration technique (Gestion des
            campus, Base de connaissances globale). L'accès y est formellement
            surveillé.
          </span>
        </div>
      </Card.Content>
    </Card.Root>
  </div>
</div>

<style>
  @keyframes scanline {
    0% {
      transform: translateY(-100%);
    }
    100% {
      transform: translateY(100vh);
    }
  }

  .admin-login-bg::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: linear-gradient(
      to bottom,
      transparent,
      rgba(255, 30, 247, 0.03),
      transparent
    );
    animation: scanline 8s linear infinite;
    pointer-events: none;
    z-index: 2;
  }
</style>
