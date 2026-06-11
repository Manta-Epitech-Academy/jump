<script lang="ts">
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import type { Infer } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import { staffDevRedirectSchema } from '$lib/validation/staffSettings';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as Dialog from '$lib/components/ui/dialog';
  import Info from '@lucide/svelte/icons/info';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import MailCheck from '@lucide/svelte/icons/mail-check';

  type Props = {
    open?: boolean;
    form: SuperValidated<Infer<typeof staffDevRedirectSchema>>;
    outboundTrapped: boolean;
    canArmRealSends: boolean;
    armedRealSends: boolean;
    // Serialized to a string across the load boundary; accept the raw shapes too.
    armedRealSendsUntil: Date | string | number | null;
    // An active login-redirect pin (normally null while logged in), and where a
    // pin would route login mail (computed server-side from saved settings).
    devRedirectPin: { until: Date | string | number; to: string[] } | null;
    devRedirectPinTo: string[];
  };

  let {
    open = $bindable(false),
    form: formData,
    outboundTrapped,
    canArmRealSends,
    armedRealSends,
    armedRealSendsUntil,
    devRedirectPin,
    devRedirectPinTo,
  }: Props = $props();

  // superForm intentionally seeds from the initial form; the reactive-read
  // warning is a false positive for this documented pattern. Post to the
  // dedicated /staff/settings action route (this dialog has no page of its own).
  // svelte-ignore state_referenced_locally
  const { form, errors, enhance, submitting } = superForm(formData, {
    // Keep the typed values in the fields after a save — the default
    // `resetForm: true` clears them, which reads as "my input vanished".
    resetForm: false,
    // Refresh the layout load so `staffProfile`-derived data reflects the save.
    invalidateAll: true,
    onUpdated({ form }) {
      const msg = form.message as
        | { type: 'success' | 'error'; text: string }
        | undefined;
      if (!msg) return;
      if (msg.type === 'success') {
        toast.success(msg.text);
        open = false;
      } else {
        toast.error(msg.text);
      }
    },
    onError() {
      toast.error("Échec de l'enregistrement.");
    },
  });

  const armedUntilLabel = $derived(
    armedRealSendsUntil
      ? new Date(armedRealSendsUntil).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null,
  );

  const pinUntilLabel = $derived(
    devRedirectPin
      ? new Date(devRedirectPin.until).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null,
  );

  const pinToLabel = $derived(
    devRedirectPinTo.length > 0
      ? devRedirectPinTo.join(', ')
      : 'votre email de connexion',
  );
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90svh] overflow-y-auto sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Mes paramètres</Dialog.Title>
      <Dialog.Description>
        Sur un environnement de test, les emails et SMS qui vous sont attribués
        — vos envois, ou ceux d'un talent que vous incarnez — sont redirigés
        vers vos adresses plutôt que vers la liste partagée. Ainsi chacun ne
        reçoit que son propre trafic de test. En production, ces réglages sont
        sans effet : les messages partent aux vrais destinataires.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-6">
      {#if !outboundTrapped}
        <div
          class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <Info class="mt-0.5 h-4 w-4 shrink-0" />
          <div class="space-y-1">
            <p>
              <strong
                >Cet environnement envoie pour de vrai (OUTBOUND_MODE=real).</strong
              >
              Aucun réglage de cette fenêtre n'a d'effet ici : ni la redirection des
              emails et SMS, ni les outils de test (qui sont d'ailleurs masqués).
              Tout cela ne s'active que sur un environnement de test (dev/staging).
            </p>
            <p>
              Vous pouvez tout de même préparer vos adresses : elles
              s'appliqueront là-bas.
            </p>
          </div>
        </div>
      {/if}

      <form
        method="POST"
        action="/staff/settings"
        use:enhance
        class="space-y-6"
      >
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
            Une adresse par ligne. Si vous n'en renseignez aucune, les emails de
            test qui vous sont attribués partent vers une boîte de test partagée
            par défaut.
          </p>
          {#if $errors.devRedirectEmails}
            <p class="text-sm text-destructive">{$errors.devRedirectEmails}</p>
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
            Un numéro par ligne. Renseignez le vôtre pour recevoir vous-même les
            SMS de test : sans cela, ils partent vers un numéro de test partagé
            par défaut.
          </p>
          {#if $errors.devRedirectPhones}
            <p class="text-sm text-destructive">{$errors.devRedirectPhones}</p>
          {/if}
        </div>

        <Button type="submit" disabled={$submitting}>Enregistrer</Button>
      </form>

      {#if canArmRealSends}
        <div
          class="space-y-3 rounded-md border border-red-300 p-4 dark:border-red-900/60"
        >
          <div>
            <h3
              class="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400"
            >
              <ShieldAlert class="h-4 w-4" /> Envois réels (dev)
            </h3>
            <p class="mt-1 text-xs text-muted-foreground">
              Lève temporairement la redirection : vos envois (et ceux d'un
              talent que vous incarnez) partiront aux <strong
                >vrais destinataires</strong
              >. Se désactive automatiquement, et n'affecte que votre session —
              jamais les tâches de fond (relances, cron).
            </p>
          </div>

          {#if armedRealSends}
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
        </div>

        <div
          class="space-y-3 rounded-md border border-amber-300 p-4 dark:border-amber-900/60"
        >
          <div>
            <h3
              class="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400"
            >
              <MailCheck class="h-4 w-4" /> Tester la connexion (OTP)
            </h3>
            <p class="mt-1 text-xs text-muted-foreground">
              Pour tester la vraie connexion d'un talent ou d'un parent : armez
              la redirection, déconnectez-vous, puis demandez un code. L'email
              de connexion vous sera redirigé (<strong>{pinToLabel}</strong>) au
              lieu de la liste partagée. Sans danger : le message reste piégé,
              jamais envoyé au vrai destinataire.
            </p>
          </div>

          {#if devRedirectPin}
            <div
              class="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/40"
            >
              <span class="font-semibold text-amber-700 dark:text-amber-300">
                Active{pinUntilLabel
                  ? ` (se désactive à ${pinUntilLabel})`
                  : ''}.
              </span>
              <form method="POST" action="/api/dev/redirect-pin">
                <input type="hidden" name="action" value="disarm" />
                <Button type="submit" variant="outline" size="sm"
                  >Désactiver</Button
                >
              </form>
            </div>
          {:else}
            <form method="POST" action="/api/dev/redirect-pin">
              <input type="hidden" name="action" value="arm" />
              <Button type="submit" variant="outline"
                >Activer la redirection de connexion (30 min)</Button
              >
            </form>
          {/if}
        </div>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
