<script lang="ts">
  import { superForm } from 'sveltekit-superforms';
  import { resolve } from '$app/paths';
  import BrandMark from '$lib/components/layout/BrandMark.svelte';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as Card from '$lib/components/ui/card';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import Info from '@lucide/svelte/icons/info';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';

  let { data } = $props();

  // superForm intentionally seeds from the initial `data.form`; the reactive
  // read warning is a false positive for this documented pattern.
  // svelte-ignore state_referenced_locally
  const {
    form,
    errors,
    enhance,
    message: formMessage,
    submitting,
  } = superForm(data.form);

  const anyTrap = $derived(data.emailTrapActive || data.smsTrapActive);

  const armedUntilLabel = $derived(
    data.armedRealSendsUntil
      ? new Date(data.armedRealSendsUntil).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null,
  );
</script>

<div class="min-h-svh bg-muted/30">
  <header class="border-b bg-background">
    <div
      class="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3"
    >
      <BrandMark href={data.backPath} tone="auto" orientation="inline" />
      <a
        href={data.backPath}
        class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft class="h-4 w-4" /> Retour
      </a>
    </div>
  </header>

  <main class="mx-auto max-w-2xl px-4 py-8">
    <h1 class="text-xl font-semibold tracking-tight">Mes paramètres</h1>

    <Card.Root class="mt-6">
      <Card.Header>
        <Card.Title>Redirection des envois (dev)</Card.Title>
        <Card.Description>
          Sur un environnement de test, les emails et SMS qui vous sont
          attribués — vos envois, ou ceux d'un talent que vous incarnez — sont
          redirigés ici plutôt que vers la liste partagée. Ainsi chacun ne
          reçoit que son propre trafic de test. En production, ces réglages sont
          sans effet : les messages partent aux vrais destinataires.
        </Card.Description>
      </Card.Header>

      <Card.Content class="space-y-6">
        {#if !anyTrap}
          <div
            class="flex items-start gap-2 rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground"
          >
            <Info class="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Cet environnement n'est pas en mode test : aucune redirection
              n'est active. Vous pouvez tout de même préparer vos adresses ici.
            </p>
          </div>
        {/if}

        <form method="POST" use:enhance class="space-y-6">
          <div class="space-y-2">
            <Label for="devRedirectEmails">Mes emails de test</Label>
            <Textarea
              id="devRedirectEmails"
              name="devRedirectEmails"
              bind:value={$form.devRedirectEmails}
              rows={3}
              placeholder={'prenom.nom@epitech.eu\nprenom.nom+test@epitech.eu'}
              aria-invalid={$errors.devRedirectEmails ? 'true' : undefined}
            />
            <p class="text-xs text-muted-foreground">
              Une adresse par ligne. Vide → repli sur la liste
              <code>EMAIL_DEV_RECIPIENTS</code> partagée.
            </p>
            {#if $errors.devRedirectEmails}
              <p class="text-sm text-destructive">
                {$errors.devRedirectEmails}
              </p>
            {/if}
          </div>

          <div class="space-y-2">
            <Label for="devRedirectPhones">Mes numéros SMS de test</Label>
            <Textarea
              id="devRedirectPhones"
              name="devRedirectPhones"
              bind:value={$form.devRedirectPhones}
              rows={3}
              placeholder={'06 12 34 56 78\n+33 6 98 76 54 32'}
              aria-invalid={$errors.devRedirectPhones ? 'true' : undefined}
            />
            <p class="text-xs text-muted-foreground">
              Un numéro par ligne. Vide → repli sur la liste
              <code>SMS_DEV_RECIPIENTS</code> partagée (les comptes staff n'ont pas
              de téléphone, donc un SMS ne vous parvient qu'une fois votre numéro
              renseigné ici).
            </p>
            {#if $errors.devRedirectPhones}
              <p class="text-sm text-destructive">
                {$errors.devRedirectPhones}
              </p>
            {/if}
          </div>

          {#if $formMessage}
            <p
              class="flex items-center gap-2 text-sm {$formMessage.type ===
              'success'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-destructive'}"
            >
              {#if $formMessage.type !== 'success'}
                <TriangleAlert class="h-4 w-4" />
              {/if}
              {$formMessage.text}
            </p>
          {/if}

          <Button type="submit" disabled={$submitting}>Enregistrer</Button>
        </form>
      </Card.Content>
    </Card.Root>

    {#if data.canArmRealSends}
      <Card.Root class="mt-6 border-red-300 dark:border-red-900/60">
        <Card.Header>
          <Card.Title
            class="flex items-center gap-2 text-red-700 dark:text-red-400"
          >
            <ShieldAlert class="h-5 w-5" /> Envois réels (dev)
          </Card.Title>
          <Card.Description>
            Lève temporairement la redirection : vos envois (et ceux d'un talent
            que vous incarnez) partiront aux <strong>vrais destinataires</strong
            >. À utiliser pour tester un envoi en conditions réelles. Se
            désactive automatiquement, et n'affecte que votre session — jamais
            les tâches de fond (relances, cron).
          </Card.Description>
        </Card.Header>
        <Card.Content>
          {#if data.armedRealSends}
            <div
              class="flex flex-wrap items-center gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900/60 dark:bg-red-950/40"
            >
              <span class="font-semibold text-red-700 dark:text-red-300">
                Armé{armedUntilLabel
                  ? ` — se désactive à ${armedUntilLabel}`
                  : ''}.
              </span>
              <form method="POST" action="/api/dev/real-sends">
                <input type="hidden" name="action" value="disarm" />
                <Button type="submit" variant="outline" size="sm"
                  >Désarmer</Button
                >
              </form>
            </div>
          {:else}
            <form method="POST" action="/api/dev/real-sends">
              <input type="hidden" name="action" value="arm" />
              <Button type="submit" variant="destructive"
                >Activer les envois réels (15 min)</Button
              >
            </form>
          {/if}
        </Card.Content>
      </Card.Root>
    {/if}
  </main>
</div>
