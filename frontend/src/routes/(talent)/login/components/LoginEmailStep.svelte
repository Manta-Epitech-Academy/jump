<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import { CircleAlert, Sparkles } from '@lucide/svelte';

  let {
    emailForm,
    emailErrors,
    emailEnhance,
    emailDelayed,
    emailMessage,
    goBack,
  }: {
    emailForm: any;
    emailErrors: any;
    emailEnhance: any;
    emailDelayed: any;
    emailMessage: any;
    goBack?: () => void;
  } = $props();
</script>

<div class="animate-slide-in-right">
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

  <form method="POST" action="?/requestOtp" use:emailEnhance class="space-y-5">
    <div class="space-y-2">
      <Label
        for="email"
        class="pl-1 text-xs font-black text-slate-500 uppercase"
        >Ton email Epitech</Label
      >
      <Input
        id="email"
        name="email"
        type="email"
        placeholder="nom.prenom@epitech.eu"
        bind:value={$emailForm.email}
        class="h-12 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-base focus-visible:ring-epi-blue dark:border-slate-800 dark:bg-slate-950/50"
      />
      {#if $emailErrors.email}<span class="pl-1 text-xs font-bold text-red-500"
          >{$emailErrors.email}</span
        >{/if}
    </div>

    <Button
      type="submit"
      disabled={$emailDelayed}
      class="h-12 w-full rounded-xl bg-epi-blue text-base font-bold text-white shadow-md transition-all hover:bg-epi-blue/90 active:scale-[0.98]"
    >
      {#if $emailDelayed}
        <Sparkles class="mr-2 h-4 w-4 animate-spin" /> Vérification...
      {:else}
        Recevoir mon code
      {/if}
    </Button>
  </form>

  {#if goBack}
    <Button
      variant="ghost"
      onclick={goBack}
      class="mt-4 w-full text-xs tracking-normal text-slate-400 normal-case transition-colors hover:bg-transparent hover:text-epi-blue"
    >
      Retour
    </Button>
  {/if}
</div>
