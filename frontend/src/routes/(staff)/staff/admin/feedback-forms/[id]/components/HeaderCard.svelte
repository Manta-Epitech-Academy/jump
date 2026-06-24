<script lang="ts">
  import Camera from '@lucide/svelte/icons/camera';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import X from '@lucide/svelte/icons/x';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import {
    DEFAULT_PERSONA,
    DEFAULT_INTRO,
    DEFAULT_OUTRO,
  } from '$lib/domain/feedbackForms/schema';
  import FieldLabel from './FieldLabel.svelte';
  import { createAutosave } from '../autosave';
  import { editableInline } from '../editableField';
  import type { FormEditor } from '../editor.svelte';

  let { editor }: { editor: FormEditor } = $props();

  // The title is required: an empty entry is never persisted, and on blur the
  // field snaps back to the saved title. The raw value is kept while typing so
  // the caret never jumps; the persona/intro/outro fields normalise empties to
  // null and trim only on blur, once focus has left.
  const titleField = createAutosave({
    registry: () => editor,
    commit: (value, { final }) => {
      if (!value.trim()) return final ? editor.title : undefined;
      if (value !== editor.title) editor.patchForm({ title: value });
    },
  });
  const personaField = createAutosave({
    registry: () => editor,
    commit: (value, { final }) => {
      const next = (final ? value.trim() : value) || null;
      if (next !== editor.personaName) editor.patchForm({ personaName: next });
    },
  });
  const introField = createAutosave({
    registry: () => editor,
    commit: (value, { final }) => {
      const next = (final ? value.trim() : value) || null;
      if (next !== (editor.intro ?? null)) editor.patchForm({ intro: next });
    },
  });
  const outroField = createAutosave({
    registry: () => editor,
    commit: (value, { final }) => {
      const next = (final ? value.trim() : value) || null;
      if (next !== (editor.outro ?? null)) editor.patchForm({ outro: next });
    },
  });

  // The persona that speaks the opening and closing lines. Mirrors the talent chat
  // header (ChatScreen), falling back to the default mascot when left blank.
  const persona = $derived(editor.personaName?.trim() || DEFAULT_PERSONA.name);
  const personaIcon = $derived(
    editor.personaIconUrl ?? DEFAULT_PERSONA.iconUrl,
  );

  let fileInput = $state<HTMLInputElement | null>(null);

  function onPickIcon(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // let the same file be re-picked after a reset
    if (file) editor.uploadPersonaIcon(file);
  }
</script>

<!-- Form heading + the two lines the bot speaks around the questions. The title is
     the document heading; the intro/outro are framed as the persona's chat bubbles
     so an author can tell a conversation message apart from the title at a glance
     (previously three unlabeled gray fields stacked with no cue which was which).
     Auto-saves live while typing, flushing on blur. -->
<div class="overflow-hidden rounded-sm border bg-card shadow-sm">
  <div class="h-2.5 bg-epi-pink"></div>

  <div class="p-5">
    <input
      value={editor.title}
      aria-label="Titre du formulaire"
      placeholder="Titre du formulaire"
      class={editableInline(
        'w-full pb-1 text-2xl font-semibold tracking-tight',
      )}
      oninput={titleField.oninput}
      onblur={titleField.onblur}
    />
  </div>

  <!-- Conversation framing: the bot's first and last messages, shown as bubbles. -->
  <div class="space-y-4 border-t bg-muted/20 p-5">
    <div class="flex items-center gap-2.5">
      <!-- Persona avatar doubles as the upload control: click to replace it (the
           hidden file input), with a default mascot until one is set. A custom
           icon gets a corner remove badge that reverts to the default art. -->
      <div class="relative shrink-0">
        <button
          type="button"
          onclick={() => fileInput?.click()}
          disabled={editor.uploadingIcon}
          aria-label="Changer l’icône de la mascotte"
          class="group relative block h-9 w-9 cursor-pointer overflow-hidden rounded-full ring-1 ring-border transition hover:ring-foreground/40 disabled:cursor-wait"
        >
          <img
            src={personaIcon}
            alt={persona}
            class="h-full w-full object-cover"
          />
          <span
            class="absolute inset-0 flex items-center justify-center text-white transition {editor.uploadingIcon
              ? 'bg-black/50 opacity-100'
              : 'bg-black/45 opacity-0 group-hover:opacity-100'}"
          >
            {#if editor.uploadingIcon}
              <Loader2 class="h-4 w-4 animate-spin" />
            {:else}
              <Camera class="h-3.5 w-3.5" />
            {/if}
          </span>
        </button>

        {#if editor.personaIconKey}
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  onclick={() => editor.removePersonaIcon()}
                  aria-label="Rétablir l’icône par défaut"
                  class="absolute -top-1.5 -right-1.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-background bg-foreground text-background shadow-sm transition hover:bg-foreground/80"
                >
                  <X class="h-2.5 w-2.5" />
                </button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>Rétablir l’icône par défaut</Tooltip.Content>
          </Tooltip.Root>
        {/if}
      </div>
      <input
        bind:this={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        class="hidden"
        onchange={onPickIcon}
      />

      <div class="flex min-w-0 flex-1 flex-col leading-tight">
        <!-- Mascotte name, edited inline (the old Paramètres "Mascotte" field).
             The bot speaks the intro/outro below under this name. -->
        <input
          value={editor.personaName ?? ''}
          aria-label="Nom de la mascotte"
          placeholder={DEFAULT_PERSONA.name}
          class={editableInline('w-full text-sm font-medium')}
          oninput={personaField.oninput}
          onblur={personaField.onblur}
        />
        <span class="text-[11px] text-muted-foreground">
          La mascotte qui dit le mot d’accueil et le mot de fin
        </span>
      </div>
    </div>

    <div class="space-y-1.5">
      <FieldLabel
        text="Message d'accueil"
        info={`Premier message de la mascotte, avant la première question. Il y en a toujours un : laissé vide, c’est « ${DEFAULT_INTRO} ». Vous pouvez écrire {prenom}, remplacé par le prénom du répondant.`}
      />
      <div
        class="rounded-2xl rounded-bl-sm border border-dashed border-muted-foreground/30 bg-background px-4 py-2.5 shadow-sm transition focus-within:border-solid focus-within:border-epi-pink/50 hover:border-muted-foreground/50"
      >
        <Textarea
          value={editor.intro ?? ''}
          rows={2}
          aria-label="Message d'accueil"
          placeholder={'Message d’accueil (facultatif), ex. « Salut {prenom} ! Prêt pour le bilan ? »'}
          class="cursor-text resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          oninput={introField.oninput}
          onblur={introField.onblur}
        />
      </div>
    </div>

    <div class="space-y-1.5">
      <FieldLabel
        text="Message de fin"
        info={`Dernier message de la mascotte, une fois le bilan terminé. Il y en a toujours un : laissé vide, c’est « ${DEFAULT_OUTRO} ». Vous pouvez écrire {prenom}, remplacé par le prénom du répondant.`}
      />
      <div
        class="rounded-2xl rounded-bl-sm border border-dashed border-muted-foreground/30 bg-background px-4 py-2.5 shadow-sm transition focus-within:border-solid focus-within:border-epi-pink/50 hover:border-muted-foreground/50"
      >
        <Textarea
          value={editor.outro ?? ''}
          rows={2}
          aria-label="Message de fin"
          placeholder={'Message de fin (facultatif), ex. « Merci {prenom} ! »'}
          class="cursor-text resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          oninput={outroField.oninput}
          onblur={outroField.onblur}
        />
      </div>
    </div>
  </div>
</div>
