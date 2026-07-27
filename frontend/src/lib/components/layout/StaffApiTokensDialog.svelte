<script lang="ts">
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import type { Infer } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import { createApiTokenSchema } from '$lib/validation/adminApiToken';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import * as RadioGroup from '$lib/components/ui/radio-group';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import ConfirmDeleteDialog from '$lib/components/admin/ConfirmDeleteDialog.svelte';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';

  type TokenRow = {
    id: string;
    label: string;
    tier: 'core' | 'leadership';
    writeEnabled: boolean;
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
    writeQuota: number;
  };

  let {
    open = $bindable(false),
    form: formData,
    tokens,
    dailyQuota,
    writeQuota,
  }: Props = $props();

  // The freshly minted secret. Held here, OUTSIDE the awaited token list, so the
  // list refreshing after the mint cannot wipe the one copy the owner will ever
  // see. Cleared when the dialog closes.
  let minted = $state<{ label: string; secret: string } | null>(null);

  $effect(() => {
    if (!open) minted = null;
  });

  let revokeDialogOpen = $state(false);
  let tokenToRevoke = $state<TokenRow | null>(null);

  const askRevoke = (token: TokenRow) => {
    tokenToRevoke = token;
    revokeDialogOpen = true;
  };

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

  const isDirection = $derived($form.tier === 'leadership');

  // A direction token is read-only, so switching to it clears the modification
  // box rather than leaving a ticked control that the server will refuse.
  const onTierChange = (value: string) => {
    $form.tier = value as 'core' | 'leadership';
    if (value === 'leadership') $form.writeEnabled = false;
  };

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
        Un token permet à un outil (client IA, script) d'interroger Jump sans
        passer par votre session. Aucun nom, email ni téléphone de talent n'est
        accessible par ce biais. Certaines réponses reprennent des phrases
        écrites par des élèves sur un événement, sans jamais indiquer qui les a
        écrites.
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
            placeholder={isDirection
              ? 'Direction - Claire Martin'
              : 'Claude Desktop'}
            aria-invalid={$errors.label ? 'true' : undefined}
          />
          <p class="text-xs text-muted-foreground">
            {#if isDirection}
              Nommez la personne qui l'utilisera : elle n'a pas de compte Jump,
              ce nom est la seule trace de son identité dans le journal.
            {:else}
              Pour le reconnaître plus tard, avant de le révoquer.
            {/if}
          </p>
          {#if $errors.label}
            <p class="text-sm text-destructive">{$errors.label}</p>
          {/if}
        </div>

        <fieldset class="space-y-2">
          <legend class="pb-2 text-sm font-medium">Ce que le token voit</legend>
          <RadioGroup.Root
            name="tier"
            value={$form.tier}
            onValueChange={onTierChange}
            class="gap-2"
          >
            <Label
              class="cursor-pointer items-start gap-3 rounded-sm border p-3 font-normal hover:bg-accent"
            >
              <RadioGroup.Item value="core" class="mt-0.5 cursor-pointer" />
              <span class="space-y-1">
                <span class="block font-medium">Équipe Academy</span>
                <span class="block text-xs text-muted-foreground">
                  Tout : chiffres, état de configuration des événements, files
                  d'attente et erreurs à traiter.
                </span>
              </span>
            </Label>
            <Label
              class="cursor-pointer items-start gap-3 rounded-sm border p-3 font-normal hover:bg-accent"
            >
              <RadioGroup.Item
                value="leadership"
                class="mt-0.5 cursor-pointer"
              />
              <span class="space-y-1">
                <span class="block font-medium">Direction</span>
                <span class="block text-xs text-muted-foreground">
                  Chiffres de pilotage seulement, en lecture : cohortes, lycées
                  d'origine, présence réelle, retours des élèves. Rien
                  d'opérationnel.
                </span>
              </span>
            </Label>
          </RadioGroup.Root>
        </fieldset>

        {#if !isDirection}
          <div class="space-y-2 rounded-md border border-border p-3">
            <label class="flex cursor-pointer items-start gap-2">
              <Checkbox
                name="writeEnabled"
                bind:checked={$form.writeEnabled}
                class="mt-0.5 cursor-pointer"
              />
              <span class="text-sm font-medium">
                Autoriser les modifications
              </span>
            </label>
            <p class="text-xs text-muted-foreground">
              Configuration d'un événement, relance d'un document, résolution
              d'erreurs de synchronisation. Chaque modification est journalisée
              avec son avant/après, et limitée à {writeQuota} sur 24 h. Ce choix est
              définitif : un token créé en lecture seule le reste.
            </p>
            {#if $errors.writeEnabled}
              <p class="text-sm text-destructive">{$errors.writeEnabled}</p>
            {/if}
          </div>
        {/if}

        <div
          class="space-y-2 rounded-md border border-border p-3 text-xs text-muted-foreground"
        >
          <p class="flex items-center gap-2 font-semibold text-foreground">
            <ShieldCheck class="h-4 w-4" /> Conditions d'utilisation
          </p>
          <p>
            Ce token ne doit être utilisé qu'avec un outil validé par
            l'établissement. Chaque appel est journalisé (token, requête, date)
            et limité à {dailyQuota} appels sur 24 h. Vous restez responsable de son
            usage, y compris lorsque vous le confiez à quelqu'un d'autre.
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
                    <p class="flex flex-wrap items-center gap-2">
                      <span class="truncate font-medium">{token.label}</span>
                      {#if token.tier === 'leadership'}
                        <Badge variant="secondary">Direction</Badge>
                      {/if}
                      {#if token.writeEnabled}
                        <Badge variant="outline">Modifications</Badge>
                      {/if}
                      {#if token.revokedAt}
                        <span class="text-xs font-normal text-muted-foreground">
                          révoqué le {dateLabel(token.revokedAt)}
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      class="cursor-pointer"
                      onclick={() => askRevoke(token)}
                    >
                      Révoquer
                    </Button>
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

<ConfirmDeleteDialog
  bind:open={revokeDialogOpen}
  action="/staff/api-tokens?/revoke&id={tokenToRevoke?.id}"
  title="Révoquer ce token ?"
  description={tokenToRevoke
    ? `Le token « ${tokenToRevoke.label} » cessera immédiatement de fonctionner. Un outil qui l'utilise encore perdra l'accès sur-le-champ ; cette action est irréversible.`
    : ''}
  buttonText="Révoquer"
  onSuccess={() => (tokenToRevoke = null)}
/>
