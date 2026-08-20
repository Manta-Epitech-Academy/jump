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
  import * as Collapsible from '$lib/components/ui/collapsible';
  import { InfoTooltip } from '$lib/components/ui/info-tooltip';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import ConfirmDeleteDialog from '$lib/components/admin/ConfirmDeleteDialog.svelte';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';

  type TokenRow = {
    id: string;
    label: string;
    tier: 'core' | 'leadership';
    writeEnabled: boolean;
    createdAt: Date | string;
    lastUsedAt: Date | string | null;
    revokedAt: Date | string | null;
    owner: { id: string; name: string };
    callsToday: number;
  };

  type Props = {
    open?: boolean;
    form: SuperValidated<Infer<typeof createApiTokenSchema>>;
    /** Streamed from the admin layout load, so no navigation waits on it. */
    tokens: Promise<TokenRow[]>;
    /** Whose tokens are "mine": the list covers every admin's. */
    currentUserId: string;
    dailyQuota: number;
    writeQuota: number;
  };

  let {
    open = $bindable(false),
    form: formData,
    tokens,
    currentUserId,
    dailyQuota,
    writeQuota,
  }: Props = $props();

  const isMine = (token: TokenRow) => token.owner.id === currentUserId;

  // The freshly minted secret. Held here, OUTSIDE the awaited token list, so the
  // list refreshing after the mint cannot wipe the one copy the owner will ever
  // see. Cleared when the dialog closes.
  let minted = $state<{ label: string; secret: string } | null>(null);

  $effect(() => {
    if (!open) minted = null;
  });

  let revokeDialogOpen = $state(false);
  let tokenToRevoke = $state<TokenRow | null>(null);

  // Collapsed, not hidden: the terms are what the checkbox below commits to, so
  // they stay readable on click rather than living behind a hover.
  let conditionsOpen = $state(false);

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
        passer par votre session.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-6">
      {#if minted}
        <div
          class="space-y-2 rounded-md border border-success/30 bg-success/10 p-3"
        >
          <p class="text-sm font-semibold text-success">
            Token « {minted.label} » créé
          </p>
          <div class="flex items-center gap-2">
            <code
              class="flex-1 overflow-x-auto rounded bg-background px-2 py-1 font-mono text-xs"
              >{minted.secret}</code
            >
            <CopyButton value={minted.secret} label="Copier le token" />
          </div>
          <p class="text-xs text-success/80">
            Copiez-le maintenant : il ne sera plus affiché.
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
          <div class="flex items-center gap-1.5">
            <Label for="tokenLabel">Nom du token</Label>
            <InfoTooltip
              text="Sert à le reconnaître plus tard, avant de le révoquer. Pour un accès direction, nommez la personne qui l'utilisera : elle n'a pas de compte Jump, ce nom est la seule trace de son identité dans le journal."
            />
          </div>
          <Input
            id="tokenLabel"
            name="label"
            bind:value={$form.label}
            placeholder={isDirection
              ? 'Direction - Claire Martin'
              : 'Claude Desktop'}
            aria-invalid={$errors.label ? 'true' : undefined}
          />
          {#if $errors.label}
            <p class="text-sm text-destructive">{$errors.label}</p>
          {/if}
        </div>

        <fieldset class="space-y-2">
          <legend class="flex items-center gap-1.5 pb-2 text-sm font-medium">
            Ce que le token voit
            <InfoTooltip
              text="Aucun nom, email ni téléphone de talent n'est accessible par ce biais. Certaines réponses reprennent des phrases écrites par des élèves sur un événement, sans jamais indiquer qui les a écrites."
            />
          </legend>
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
                  Tout : chiffres, configuration des événements, files à
                  traiter.
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
                  Chiffres de pilotage seulement, en lecture.
                </span>
              </span>
            </Label>
          </RadioGroup.Root>
        </fieldset>

        {#if !isDirection}
          <div class="space-y-1.5">
            <div class="flex items-center gap-1.5">
              <label class="flex cursor-pointer items-center gap-2">
                <Checkbox
                  name="writeEnabled"
                  bind:checked={$form.writeEnabled}
                  class="cursor-pointer"
                />
                <span class="text-sm font-medium">
                  Autoriser les modifications
                </span>
              </label>
              <InfoTooltip
                text="Configuration d'un événement, relance d'un document, résolution d'erreurs de synchronisation. Chaque modification est journalisée avec son avant/après, et limitée à {writeQuota} sur 24 h."
              />
            </div>
            <p class="pl-6 text-xs text-muted-foreground">
              Choix définitif : un token créé en lecture seule le reste.
            </p>
            {#if $errors.writeEnabled}
              <p class="text-sm text-destructive">{$errors.writeEnabled}</p>
            {/if}
          </div>
        {/if}

        <div class="space-y-1.5">
          <label class="flex cursor-pointer items-center gap-2">
            <Checkbox
              name="conditionsAccepted"
              bind:checked={$form.conditionsAccepted}
              class="cursor-pointer"
            />
            <span class="text-sm font-medium">
              J'accepte les conditions d'utilisation.
            </span>
          </label>
          <Collapsible.Root
            open={conditionsOpen}
            onOpenChange={(o) => (conditionsOpen = o)}
          >
            <Collapsible.Trigger
              class="flex cursor-pointer items-center gap-1 pl-6 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronRight
                class="h-3 w-3 transition-transform {conditionsOpen
                  ? 'rotate-90'
                  : ''}"
              />
              {conditionsOpen ? 'Masquer' : 'Lire'} les conditions
            </Collapsible.Trigger>
            <Collapsible.Content
              class="pt-1.5 pl-6 text-xs text-muted-foreground"
            >
              Ce token ne doit être utilisé qu'avec un outil validé par
              l'établissement. Chaque appel est journalisé (token, requête,
              date) et limité à {dailyQuota} appels sur 24 h. Vous restez responsable
              de son usage, y compris lorsque vous le confiez à quelqu'un d'autre.
            </Collapsible.Content>
          </Collapsible.Root>
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
          <InfoTooltip
            text="La liste couvre les tokens créés par toute l'équipe admin, et vous pouvez révoquer n'importe lequel. Un token confié à une direction ne peut être coupé que d'ici : la personne qui l'utilise n'a pas de compte Jump."
          />
        </h3>

        {#await tokens}
          <p class="text-xs text-muted-foreground">Chargement…</p>
        {:then rows}
          {#if rows.length === 0}
            <p class="text-xs text-muted-foreground">
              Aucun token pour le moment.
            </p>
          {:else}
            <!-- Revoked tokens are kept for the trail, so this list only ever
                 grows. It scrolls in its own box rather than stretching the
                 dialog, which keeps the creation form on screen. -->
            <ul
              class="max-h-[40svh] divide-y divide-border overflow-y-auto rounded-md border border-border"
            >
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
                      Créé le {dateLabel(token.createdAt)}{isMine(token)
                        ? ''
                        : ` par ${token.owner.name}`} ·
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
    ? `Le token « ${tokenToRevoke.label} »${
        isMine(tokenToRevoke) ? '' : `, créé par ${tokenToRevoke.owner.name},`
      } cessera immédiatement de fonctionner. Un outil qui l'utilise encore perdra l'accès sur-le-champ ; cette action est irréversible.`
    : ''}
  buttonText="Révoquer"
  onSuccess={() => (tokenToRevoke = null)}
/>
