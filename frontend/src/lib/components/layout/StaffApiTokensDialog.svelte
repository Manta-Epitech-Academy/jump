<script lang="ts">
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import type { Infer } from 'sveltekit-superforms';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { createApiTokenSchema } from '$lib/validation/adminApiToken';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';

  type TokenRow = {
    id: string;
    label: string;
    createdAt: Date | string;
    lastUsedAt: Date | string | null;
    revokedAt: Date | string | null;
    callsToday: number;
  };

  type Props = {
    open?: boolean;
    form: SuperValidated<Infer<typeof createApiTokenSchema>>;
    /** Streamed from the admin layout load, so no navigation waits on it. */
    tokens: Promise<TokenRow[]>;
    dailyQuota: number;
  };

  let {
    open = $bindable(false),
    form: formData,
    tokens,
    dailyQuota,
  }: Props = $props();

  // The freshly minted secret. Held here, OUTSIDE the awaited token list, so the
  // list refreshing after the mint cannot wipe the one copy the owner will ever
  // see. Cleared when the dialog closes.
  let minted = $state<{ label: string; secret: string } | null>(null);

  $effect(() => {
    if (!open) minted = null;
  });

  // svelte-ignore state_referenced_locally
  const {
    form,
    errors,
    enhance: enhanceCreate,
    submitting,
  } = superForm(formData, {
    resetForm: true,
    // Refresh the layout load so the new token appears in the list below.
    invalidateAll: true,
    onUpdated({ form }) {
      const msg = form.message as
        | { type: 'created'; label: string; secret: string }
        | undefined;
      if (msg?.type === 'created') {
        minted = { label: msg.label, secret: msg.secret };
        toast.success('Token créé.');
      }
    },
    onError() {
      toast.error('Échec de la création du token.');
    },
  });

  const dateLabel = (value: Date | string | null) =>
    value
      ? new Date(value).toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
        })
      : null;
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-xl">
    <Dialog.Header>
      <Dialog.Title>Accès API</Dialog.Title>
      <Dialog.Description>
        Un token permet à un outil (client IA, script) de consulter les chiffres
        agrégés et l'état de configuration des événements sans passer par votre
        session. Aucune donnée personnelle de talent n'est accessible par ce
        biais : ni nom, ni email, ni téléphone.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-6">
      {#if minted}
        <div
          class="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/40"
        >
          <p
            class="text-sm font-semibold text-emerald-800 dark:text-emerald-300"
          >
            Token « {minted.label} » créé
          </p>
          <div class="flex items-center gap-2">
            <code
              class="flex-1 overflow-x-auto rounded bg-background px-2 py-1 font-mono text-xs"
              >{minted.secret}</code
            >
            <CopyButton value={minted.secret} label="Copier le token" />
          </div>
          <p class="text-xs text-emerald-900/80 dark:text-emerald-200/80">
            Copiez-le maintenant : il ne sera plus affiché. Si vous le perdez,
            révoquez ce token et créez-en un autre.
          </p>
        </div>
      {/if}

      <form
        method="POST"
        action="/staff/api-tokens?/create"
        use:enhanceCreate
        class="space-y-4"
      >
        <div class="space-y-2">
          <Label for="tokenLabel">Nom du token</Label>
          <Input
            id="tokenLabel"
            name="label"
            bind:value={$form.label}
            placeholder="Claude Desktop"
            aria-invalid={$errors.label ? 'true' : undefined}
          />
          <p class="text-xs text-muted-foreground">
            Pour le reconnaître plus tard, avant de le révoquer.
          </p>
          {#if $errors.label}
            <p class="text-sm text-destructive">{$errors.label}</p>
          {/if}
        </div>

        <div
          class="space-y-2 rounded-md border border-border p-3 text-xs text-muted-foreground"
        >
          <p class="flex items-center gap-2 font-semibold text-foreground">
            <ShieldCheck class="h-4 w-4" /> Conditions d'utilisation
          </p>
          <p>
            Ce token ne doit être utilisé qu'avec un outil validé par
            l'établissement. Chaque appel est journalisé (token, requête, date)
            et limité à {dailyQuota} appels sur 24 h.
          </p>
          <label class="flex cursor-pointer items-start gap-2 pt-1">
            <Checkbox
              name="conditionsAccepted"
              bind:checked={$form.conditionsAccepted}
              class="cursor-pointer"
            />
            <span class="text-foreground">J'accepte ces conditions.</span>
          </label>
          {#if $errors.conditionsAccepted}
            <p class="text-sm text-destructive">
              {$errors.conditionsAccepted}
            </p>
          {/if}
        </div>

        <Button type="submit" disabled={$submitting}>Créer un token</Button>
      </form>

      <div class="space-y-2">
        <h3 class="flex items-center gap-2 text-sm font-semibold">
          <KeyRound class="h-4 w-4" /> Tokens
        </h3>

        {#await tokens}
          <p class="text-xs text-muted-foreground">Chargement…</p>
        {:then rows}
          {#if rows.length === 0}
            <p class="text-xs text-muted-foreground">
              Aucun token pour le moment.
            </p>
          {:else}
            <ul class="divide-y divide-border rounded-md border border-border">
              {#each rows as token (token.id)}
                <li class="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <div class="min-w-0 flex-1">
                    <p class="truncate font-medium">
                      {token.label}
                      {#if token.revokedAt}
                        <span class="text-xs font-normal text-muted-foreground">
                          · révoqué le {dateLabel(token.revokedAt)}
                        </span>
                      {/if}
                    </p>
                    <p class="text-xs text-muted-foreground">
                      Créé le {dateLabel(token.createdAt)} ·
                      {#if token.lastUsedAt}
                        dernier appel le {dateLabel(token.lastUsedAt)} ·
                        {token.callsToday} appel{token.callsToday > 1
                          ? 's'
                          : ''} sur 24 h
                      {:else}
                        jamais utilisé
                      {/if}
                    </p>
                  </div>
                  {#if !token.revokedAt}
                    <form
                      method="POST"
                      action="/staff/api-tokens?/revoke"
                      use:enhance={() =>
                        async ({ result, update }) => {
                          if (result.type === 'failure') {
                            toast.error(
                              (result.data?.message as string | undefined) ??
                                'Échec de la révocation.',
                            );
                          } else {
                            toast.success('Token révoqué.');
                          }
                          await update();
                        }}
                    >
                      <input type="hidden" name="id" value={token.id} />
                      <Button
                        type="submit"
                        variant="outline"
                        size="sm"
                        class="cursor-pointer"
                      >
                        Révoquer
                      </Button>
                    </form>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        {/await}
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
