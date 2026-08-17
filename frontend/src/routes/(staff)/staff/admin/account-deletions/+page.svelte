<script lang="ts">
  import { enhance } from '$app/forms';
  import { fly } from 'svelte/transition';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import ShieldOff from '@lucide/svelte/icons/shield-off';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { Badge } from '$lib/components/ui/badge';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as Card from '$lib/components/ui/card';
  import * as Table from '$lib/components/ui/table';
  import * as Alert from '$lib/components/ui/alert';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import * as Dialog from '$lib/components/ui/dialog';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import StudentAvatarItem from '$lib/components/students/StudentAvatarItem.svelte';
  import TalentName from '$lib/components/students/TalentName.svelte';
  import { formatDateTimeFr } from '$lib/utils';
  import { daysBetween } from '$lib/analytics';
  import { toast } from 'svelte-sonner';

  let { data } = $props();

  type Row = (typeof data.pending)[number];

  // Single page-level dialog per action, parameterised by the selected row —
  // mirrors the talents page pattern rather than minting a dialog per table row.
  let fulfillTarget = $state<Row | null>(null);
  let fulfilling = $state(false);
  let rejectTarget = $state<Row | null>(null);
  let rejecting = $state(false);

  const statusBadge: Record<string, string> = {
    fulfilled: 'border-destructive/30 bg-destructive/10 text-destructive',
    rejected: 'border-epi-orange/30 bg-epi-orange/10 text-epi-orange',
    cancelled: 'border-border bg-muted text-muted-foreground',
  };
  const statusLabel: Record<string, string> = {
    fulfilled: 'Supprimé',
    rejected: 'Refusé',
    cancelled: 'Annulé',
  };
</script>

<svelte:head>
  <title>Demandes de suppression</title>
</svelte:head>

<div class="space-y-6">
  <div in:fly={{ y: -12, duration: 300 }}>
    <h1 class="font-heading text-3xl tracking-wide uppercase">
      Demandes de <span class="text-epi-pink">suppression</span><span
        class="text-epi-pink">_</span
      >
    </h1>
    <p class="font-mono text-xs tracking-wide text-muted-foreground">
      &lt;DROIT À L'EFFACEMENT / RGPD / FULFILMENT SOUS 1 MOIS&gt;
    </p>
  </div>

  {#if data.overdueCount > 0}
    <div in:fly={{ y: 12, duration: 300 }}>
      <Alert.Root variant="destructive">
        <ShieldAlert class="animate-pulse" />
        <Alert.Title class="font-heading tracking-wide uppercase">
          {data.overdueCount} demande{data.overdueCount > 1 ? 's' : ''} en retard
        </Alert.Title>
        <Alert.Description>
          En attente depuis plus de 21 jours — à traiter pour rester conforme au
          droit à l'effacement.
        </Alert.Description>
      </Alert.Root>
    </div>
  {/if}

  <!-- Pending queue -->
  <div in:fly={{ y: 12, duration: 300, delay: 60 }}>
    <Card.Root>
      <Card.Header>
        <Card.Title class="font-heading tracking-wide uppercase">
          En attente
          <span class="font-mono text-sm text-muted-foreground"
            >[{data.pending.length}]</span
          >
        </Card.Title>
      </Card.Header>
      <Card.Content class="p-0">
        {#if data.pending.length === 0}
          <div class="p-6">
            <EmptyState
              icon={ShieldCheck}
              title="Tout est traité"
              description="Aucune demande de suppression en attente. Tu es à jour — le pipeline est serein."
            />
          </div>
        {:else}
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Talent</Table.Head>
                <Table.Head>Campus</Table.Head>
                <Table.Head>Activité</Table.Head>
                <Table.Head>Demandé le</Table.Head>
                <Table.Head class="text-right">Action</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each data.pending as req, i (req.id)}
                <Table.Row
                  class={`animate-in duration-300 fill-mode-both fade-in slide-in-from-bottom-1 ${
                    req.overdue ? 'bg-destructive/5' : ''
                  }`}
                  style={`animation-delay: ${Math.min(i * 40, 320)}ms`}
                >
                  <Table.Cell>
                    <StudentAvatarItem
                      student={req.talent}
                      subText={req.talent.email}
                    />
                    {#if req.reason}
                      <div
                        class="mt-1 pl-11 text-xs text-muted-foreground italic"
                      >
                        &laquo; {req.reason} &raquo;
                      </div>
                    {/if}
                  </Table.Cell>
                  <Table.Cell class="text-epi-pink">
                    {req.talent.campus ?? '—'}
                  </Table.Cell>
                  <Table.Cell class="font-mono text-xs text-muted-foreground">
                    {req.talent.eventsCount} évén. / {req.talent.xp} XP
                  </Table.Cell>
                  <Table.Cell>
                    <div class="font-mono text-xs">
                      {formatDateTimeFr(req.requestedAt)}
                    </div>
                    {#if req.overdue}
                      <Badge
                        variant="outline"
                        class="mt-1 border-destructive/30 bg-destructive/10 text-destructive"
                      >
                        En retard
                      </Badge>
                    {:else}
                      <span class="font-mono text-xs text-muted-foreground">
                        il y a {daysBetween(req.requestedAt) ?? 0} j
                      </span>
                    {/if}
                  </Table.Cell>
                  <Table.Cell class="text-right">
                    <div class="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        class="gap-1"
                        onclick={() => (rejectTarget = req)}
                      >
                        <ShieldOff class="h-3 w-3" />
                        Refuser
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        class="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onclick={() => (fulfillTarget = req)}
                      >
                        <Trash2 class="h-3 w-3" />
                        Supprimer
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>

  <!-- Resolved history -->
  {#if data.resolved.length > 0}
    <div in:fly={{ y: 12, duration: 300, delay: 120 }}>
      <Card.Root>
        <Card.Header>
          <Card.Title class="font-heading tracking-wide uppercase">
            Historique
          </Card.Title>
        </Card.Header>
        <Card.Content class="p-0">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Talent</Table.Head>
                <Table.Head>Statut</Table.Head>
                <Table.Head>Demandé le</Table.Head>
                <Table.Head>Traité le</Table.Head>
                <Table.Head>Note</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each data.resolved as req (req.id)}
                <Table.Row class="opacity-80">
                  <Table.Cell>
                    <StudentAvatarItem
                      student={req.talent}
                      subText={req.talent.email}
                      size="sm"
                    />
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      variant="outline"
                      class={statusBadge[req.status] ?? ''}
                    >
                      {statusLabel[req.status] ?? req.status}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell class="font-mono text-xs text-muted-foreground">
                    {formatDateTimeFr(req.requestedAt)}
                  </Table.Cell>
                  <Table.Cell class="font-mono text-xs text-muted-foreground">
                    {req.resolvedAt ? formatDateTimeFr(req.resolvedAt) : '—'}
                  </Table.Cell>
                  <Table.Cell class="max-w-xs text-xs text-muted-foreground">
                    {req.resolutionNote ?? '—'}
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        </Card.Content>
      </Card.Root>
    </div>
  {/if}
</div>

<!-- Fulfil = irreversible erasure: a hard confirm. -->
<AlertDialog.Root
  open={fulfillTarget !== null}
  onOpenChange={(o) => {
    if (!o) fulfillTarget = null;
  }}
>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Supprimer le compte</AlertDialog.Title>
      <AlertDialog.Description>
        Le compte de <strong
          >{#if fulfillTarget}<TalentName
              talent={fulfillTarget.talent}
            />{/if}</strong
        >
        sera <strong>anonymisé de manière irréversible</strong> : données personnelles
        effacées, sessions révoquées. Les statistiques agrégées (XP, présence) sont
        conservées. Cette action honore le droit à l'effacement (RGPD).
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={fulfilling}>Annuler</AlertDialog.Cancel>
      <form
        method="POST"
        action="?/fulfill"
        use:enhance={() => {
          fulfilling = true;
          return async ({ result, update }) => {
            fulfilling = false;
            if (result.type === 'success') {
              fulfillTarget = null;
              toast.success('Compte anonymisé.');
              await update();
            } else {
              toast.error(
                (result.type === 'failure' &&
                  (result.data?.message as string)) ||
                  'Une erreur est survenue.',
              );
            }
          };
        }}
      >
        <input type="hidden" name="id" value={fulfillTarget?.id ?? ''} />
        <AlertDialog.Action
          type="submit"
          disabled={fulfilling}
          class={buttonVariants({ variant: 'destructive' })}
        >
          {#if fulfilling}
            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" /> Suppression…
          {:else}
            Supprimer définitivement
          {/if}
        </AlertDialog.Action>
      </form>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<!-- Reject = keep the account; capture an optional reason for the audit trail. -->
<Dialog.Root
  open={rejectTarget !== null}
  onOpenChange={(o) => {
    if (!o) rejectTarget = null;
  }}
>
  <Dialog.Content>
    <form
      method="POST"
      action="?/reject"
      use:enhance={() => {
        rejecting = true;
        return async ({ result, update }) => {
          rejecting = false;
          if (result.type === 'success') {
            rejectTarget = null;
            toast.success('Demande refusée.');
            await update();
          } else {
            toast.error(
              (result.type === 'failure' && (result.data?.message as string)) ||
                'Une erreur est survenue.',
            );
          }
        };
      }}
    >
      <Dialog.Header>
        <Dialog.Title>Refuser la demande</Dialog.Title>
        <Dialog.Description>
          Le compte de <strong
            >{#if rejectTarget}<TalentName
                talent={rejectTarget.talent}
              />{/if}</strong
          > est conservé. Le talent pourra refaire une demande plus tard.
        </Dialog.Description>
      </Dialog.Header>
      <input type="hidden" name="id" value={rejectTarget?.id ?? ''} />
      <div class="space-y-1.5 py-2">
        <Textarea
          name="note"
          rows={3}
          placeholder="Ex. Ton compte reste nécessaire pour le stage de seconde en cours."
        />
        <p class="font-mono text-xs text-muted-foreground">
          &lt;Ce motif est affiché au talent comme raison du refus/&gt;
        </p>
      </div>
      <Dialog.Footer>
        <Button
          type="button"
          variant="outline"
          disabled={rejecting}
          onclick={() => (rejectTarget = null)}
        >
          Annuler
        </Button>
        <Button type="submit" disabled={rejecting}>
          {#if rejecting}
            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" /> Refus…
          {:else}
            Refuser la demande
          {/if}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
