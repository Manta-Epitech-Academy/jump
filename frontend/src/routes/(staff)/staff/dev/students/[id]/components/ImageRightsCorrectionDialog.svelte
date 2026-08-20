<script lang="ts">
  import { untrack } from 'svelte';
  import {
    superForm,
    type Infer,
    type SuperValidated,
  } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Separator } from '$lib/components/ui/separator';
  import { cn, formatDateFr } from '$lib/utils';
  import { IMAGE_RIGHTS_STATUS_LABELS } from '$lib/domain/imageRights';
  import type { ImageRightsCorrectionSchema } from '$lib/validation/imageRights';

  // History row as projected by the page load (staff name flattened).
  type RecordVM = {
    id: string;
    decision: 'accepted' | 'refused';
    decidedAt: Date | string;
    signerPrenom: string | null;
    signerNom: string | null;
    source: 'parent_portal' | 'staff_correction';
    note: string | null;
    recordedByName: string | null;
  };

  let {
    open = $bindable(false),
    form: formData,
    records,
    studentName,
  }: {
    open?: boolean;
    form: SuperValidated<Infer<ImageRightsCorrectionSchema>>;
    records: RecordVM[];
    studentName: string;
  } = $props();

  const { form, errors, enhance, delayed } = superForm(
    untrack(() => formData),
    {
      id: 'imageRights',
      // The dialog stays mounted after a correction, so the default reset would
      // snap the fields back to the page-load decision and a second correction
      // in the same visit would start from stale prefill. Keep the submitted
      // (newest) values instead, like every other superForm in the app.
      resetForm: false,
      onResult: ({ result }) => {
        if (result.type === 'success') {
          open = false;
          toast.success(result.data?.form?.message ?? 'Décision mise à jour');
        } else if (result.type === 'failure' && result.data?.form?.message) {
          toast.error(result.data.form.message);
        }
      },
    },
  );

  function signerLine(r: RecordVM): string {
    const name = [r.signerPrenom, r.signerNom].filter(Boolean).join(' ').trim();
    return name || 'Responsable légal';
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="max-h-[90svh] max-w-md gap-0 overflow-y-auto rounded-sm p-0"
  >
    <Dialog.Header class="border-b px-5 py-4">
      <Dialog.Title
        class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
      >
        Corriger le droit à l'image
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        Enregistrez la décision du responsable légal de {studentName} transmise hors
        ligne. La décision reste la sienne : vous la consignez pour lui, et la correction
        est tracée à votre nom.
      </Dialog.Description>
    </Dialog.Header>

    <form
      method="POST"
      action="?/correctImageRights"
      use:enhance
      class="space-y-4 px-5 py-4"
    >
      <!-- Decision: the one thing being changed -->
      <div class="space-y-1.5">
        <Label class="text-[11px] font-bold tracking-widest uppercase">
          Décision
        </Label>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            onclick={() => ($form.decision = 'accepted')}
            class={cn(
              'flex cursor-pointer items-center justify-center gap-1.5 rounded-sm border px-3 py-2 text-sm font-bold transition-colors',
              $form.decision === 'accepted'
                ? 'border-epi-tech/50 bg-epi-tech/10 text-epi-tech-ink'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/50',
            )}
          >
            <Check class="h-4 w-4" />
            Autoriser
          </button>
          <button
            type="button"
            onclick={() => ($form.decision = 'refused')}
            class={cn(
              'flex cursor-pointer items-center justify-center gap-1.5 rounded-sm border px-3 py-2 text-sm font-bold transition-colors',
              $form.decision === 'refused'
                ? 'border-epi-together/50 bg-epi-together/10 text-epi-together'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/50',
            )}
          >
            <X class="h-4 w-4" />
            Refuser
          </button>
        </div>
        <input type="hidden" name="decision" value={$form.decision ?? ''} />
        {#if $errors.decision}
          <p class="text-xs text-destructive">{$errors.decision}</p>
        {/if}
      </div>

      <!-- Guardian on file: pre-filled, edited only if the name is wrong -->
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1.5">
          <Label
            for="ir-prenom"
            class="text-[11px] font-bold tracking-widest uppercase"
          >
            Prénom du responsable
          </Label>
          <Input
            id="ir-prenom"
            name="signerPrenom"
            bind:value={$form.signerPrenom}
            class="rounded-sm"
          />
          {#if $errors.signerPrenom}
            <p class="text-xs text-destructive">{$errors.signerPrenom}</p>
          {/if}
        </div>
        <div class="space-y-1.5">
          <Label
            for="ir-nom"
            class="text-[11px] font-bold tracking-widest uppercase"
          >
            Nom du responsable
          </Label>
          <Input
            id="ir-nom"
            name="signerNom"
            bind:value={$form.signerNom}
            class="rounded-sm"
          />
          {#if $errors.signerNom}
            <p class="text-xs text-destructive">{$errors.signerNom}</p>
          {/if}
        </div>
      </div>

      <!-- Mandatory reason: staff stands in for the guardian, must say why -->
      <div class="space-y-1.5">
        <Label
          for="ir-note"
          class="text-[11px] font-bold tracking-widest uppercase"
        >
          Motif de la correction
        </Label>
        <Textarea
          id="ir-note"
          name="note"
          rows={2}
          placeholder="Ex. : la mère a appelé pour autoriser finalement."
          bind:value={$form.note}
          class="rounded-sm"
        />
        {#if $errors.note}
          <p class="text-xs text-destructive">{$errors.note}</p>
        {/if}
      </div>

      <div class="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="rounded-sm"
          onclick={() => (open = false)}
        >
          Annuler
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={$delayed}
          class="rounded-sm bg-epi-blue text-white hover:bg-epi-blue/90"
        >
          {$delayed ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </form>

    {#if records.length > 0}
      <Separator />
      <div class="px-5 py-4">
        <h4
          class="mb-2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          Historique des décisions
        </h4>
        <!-- `ImageRightsDecisionRecord` is append-only and every staff
             correction adds one, so this log only ever grows: it scrolls in its
             own box rather than pushing the form off the dialog. -->
        <ul class="max-h-[40svh] space-y-2.5 overflow-y-auto pr-1">
          {#each records as r (r.id)}
            <li class="flex gap-2 text-xs">
              {#if r.decision === 'accepted'}
                <Check class="mt-0.5 h-3.5 w-3.5 shrink-0 text-epi-tech-ink" />
              {:else}
                <X class="mt-0.5 h-3.5 w-3.5 shrink-0 text-epi-together" />
              {/if}
              <div class="min-w-0">
                <p class="font-bold">
                  {IMAGE_RIGHTS_STATUS_LABELS[r.decision]}
                  <span class="font-normal text-muted-foreground">
                    · {formatDateFr(r.decidedAt)}
                  </span>
                </p>
                <p class="text-muted-foreground">
                  {#if r.source === 'staff_correction'}
                    Correction staff{r.recordedByName
                      ? ` · ${r.recordedByName}`
                      : ''} · {signerLine(r)}
                  {:else}
                    Responsable légal · {signerLine(r)}
                  {/if}
                </p>
                {#if r.note}
                  <p class="mt-0.5 text-muted-foreground italic">
                    « {r.note} »
                  </p>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
