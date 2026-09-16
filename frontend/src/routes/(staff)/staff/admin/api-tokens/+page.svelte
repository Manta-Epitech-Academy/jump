<script lang="ts">
  import { goto } from '$app/navigation';
  import { superForm } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Plug from '@lucide/svelte/icons/plug';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Copy from '@lucide/svelte/icons/copy';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import * as RadioGroup from '$lib/components/ui/radio-group';
  import * as Collapsible from '$lib/components/ui/collapsible';
  import { InfoTooltip } from '$lib/components/ui/info-tooltip';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import ConfirmDeleteDialog from '$lib/components/admin/ConfirmDeleteDialog.svelte';
  import McpConnectSnippet from '$lib/components/admin/McpConnectSnippet.svelte';
  import CommandBlock from '$lib/components/admin/CommandBlock.svelte';

  let { data, form } = $props();

  type TokenRow =
    Awaited<typeof data.tokens> extends (infer Row)[] ? Row : never;

  /**
   * The freshly minted secret, read off SvelteKit's own `form` prop rather than
   * copied anywhere.
   *
   * This is the whole point of the page (issue #357). The dialog this replaced
   * copied it into a local `$state` and rendered that copy across a portal
   * boundary, while an `invalidateAll` replaced the component's props in the
   * same tick; in production the toast fired and the secret never painted, on a
   * screen where it is shown exactly once. `page.form` is set by `applyAction`,
   * survives every load re-run, and is cleared only by a navigation, which is
   * exactly the lifetime this value should have.
   */
  const created = $derived(form?.created ?? null);

  const isMine = (token: TokenRow) => token.owner.id === data.user.id;

  let revokeDialogOpen = $state(false);
  let tokenToRevoke = $state<TokenRow | null>(null);

  // Collapsed, not hidden: the terms are what the checkbox below commits to, so
  // they stay readable on click rather than living behind a hover.
  let conditionsOpen = $state(false);

  const askRevoke = (token: TokenRow) => {
    tokenToRevoke = token;
    revokeDialogOpen = true;
  };

  // Initialised once, on purpose: superforms keeps its own store in step with
  // `page.data` afterwards, so re-creating it on every load would throw away
  // whatever the person had typed.
  // svelte-ignore state_referenced_locally
  const {
    form: formData,
    errors,
    enhance: enhanceCreate,
    submitting,
  } = superForm(data.form, {
    resetForm: true,
    onError() {
      toast.error('Échec de la création du token.');
    },
  });

  const isDirection = $derived($formData.tier === 'leadership');

  // A direction token is read-only, so switching to it clears the modification
  // box rather than leaving a ticked control that the server will refuse.
  const onTierChange = (value: string) => {
    $formData.tier = value as 'core' | 'leadership';
    if (value === 'leadership') $formData.writeEnabled = false;
  };

  // Acknowledging navigates back to the bare page, which is what drops the
  // secret: nothing clears it in place, so there is no second copy to reason
  // about.
  const acknowledge = () => goto('/staff/admin/api-tokens', { noScroll: true });

  async function copySecret(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success('Token copié.');
    } catch {
      toast.error('Impossible de copier. Sélectionnez le token à la main.');
    }
  }

  const dateLabel = (value: Date | string | null) =>
    value
      ? new Date(value).toLocaleDateString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
        })
      : null;
</script>

<div class="space-y-8">
  <PageHeader
    title="Accès"
    accent="API"
    subtitle="Tokens et connexion d'un outil à Jump"
  />

  {#if created}
    <!--
      The reveal replaces the creation form rather than sitting above it, and
      that is deliberate. A second token cannot be minted over a secret nobody
      has acknowledged, and the one value on this page that cannot be fetched
      again is the only thing to read.
    -->
    <section
      class="space-y-4 rounded-sm border border-success/40 bg-success/10 p-4"
    >
      <div>
        <h2 class="font-heading text-display-s text-success">
          Token « {created.label} » créé
        </h2>
        <p class="text-sm text-success/90">
          Copiez-le maintenant : Jump ne le stocke pas en clair et ne pourra
          jamais vous le réafficher.
        </p>
      </div>

      <CommandBlock label="Votre token" value={created.secret} />

      <Button class="w-full" onclick={() => copySecret(created.secret)}>
        <Copy class="mr-2 h-4 w-4" /> Copier le token
      </Button>

      <div class="space-y-2 border-t border-success/30 pt-4">
        <div class="flex items-center gap-1.5">
          <h3 class="text-sm font-bold">Connecter votre outil</h3>
          <InfoTooltip
            text="La commande ci-dessous contient déjà votre token et l'adresse de cet environnement. Collez-la telle quelle, sans rien remplacer."
          />
        </div>
        <McpConnectSnippet origin={data.origin} token={created.secret} />
      </div>

      <Button variant="outline" class="w-full" onclick={acknowledge}>
        J'ai copié le token
      </Button>
    </section>
  {:else}
    <section class="space-y-4 rounded-sm border bg-card p-4 shadow-raised">
      <h2 class="font-heading text-display-s">Créer un token</h2>

      <form method="POST" action="?/create" use:enhanceCreate class="space-y-4">
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
            bind:value={$formData.label}
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
            value={$formData.tier}
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
                  bind:checked={$formData.writeEnabled}
                  class="cursor-pointer"
                />
                <span class="text-sm font-medium">
                  Autoriser les modifications
                </span>
              </label>
              <InfoTooltip
                text="Configuration d'un événement, relance d'un document, résolution d'erreurs de synchronisation. Chaque modification est journalisée avec son avant/après."
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
              bind:checked={$formData.conditionsAccepted}
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
              date). Vous restez responsable de son usage, y compris lorsque
              vous le confiez à quelqu'un d'autre.
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
    </section>

    <section class="space-y-4 rounded-sm border bg-card p-4 shadow-raised">
      <div class="flex items-center gap-2">
        <Plug class="h-5 w-5 text-accent-space" />
        <h2 class="font-heading text-display-s">Connecter un outil</h2>
      </div>
      <p class="text-sm text-muted-foreground">
        Remplacez <code class="font-mono text-xs">votre-token</code> par le token
        que Jump vous affiche à sa création.
      </p>
      <McpConnectSnippet origin={data.origin} />
    </section>
  {/if}

  <section class="space-y-3">
    <h2 class="flex items-center gap-2 font-heading text-display-s">
      <KeyRound class="h-5 w-5 text-accent-space" /> Tokens
      <InfoTooltip
        text="La liste couvre les tokens créés par toute l'équipe admin, et vous pouvez révoquer n'importe lequel. Un token confié à une direction ne peut être coupé que d'ici : la personne qui l'utilise n'a pas de compte Jump."
      />
    </h2>

    {#await data.tokens}
      <p class="text-xs text-muted-foreground">Chargement…</p>
    {:then rows}
      {#if rows.length === 0}
        <p class="text-xs text-muted-foreground">Aucun token pour le moment.</p>
      {:else}
        <!-- Revoked tokens are kept for the trail, so this list only ever
             grows. It scrolls in its own box rather than stretching the page. -->
        <ul
          class="max-h-[40svh] divide-y divide-border overflow-y-auto rounded-sm border border-border bg-card"
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
                    {token.callsToday} appel{token.callsToday > 1 ? 's' : ''} sur
                    24 h
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
  </section>
</div>

<ConfirmDeleteDialog
  bind:open={revokeDialogOpen}
  action="?/revoke&id={tokenToRevoke?.id}"
  title="Révoquer ce token ?"
  description={tokenToRevoke
    ? `Le token « ${tokenToRevoke.label} »${
        isMine(tokenToRevoke) ? '' : `, créé par ${tokenToRevoke.owner.name},`
      } cessera immédiatement de fonctionner. Un outil qui l'utilise encore perdra l'accès sur-le-champ ; cette action est irréversible.`
    : ''}
  buttonText="Révoquer"
  onSuccess={() => (tokenToRevoke = null)}
/>
