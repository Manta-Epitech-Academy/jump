<script lang="ts">
  import { Textarea } from '$lib/components/ui/textarea';
  import FieldLabel from './FieldLabel.svelte';
  import type { FormEditor } from '../editor.svelte';

  let { editor }: { editor: FormEditor } = $props();

  // The persona that speaks the opening and closing lines. Mirrors the talent chat
  // header (ChatScreen), which defaults to Bernard when "Mascotte" is left blank.
  const persona = $derived(editor.personaName?.trim() || 'Bernard le canard');
</script>

<!-- Form heading + the two lines the bot speaks around the questions. The title is
     the document heading; the intro/outro are framed as the persona's chat bubbles
     so an author can tell a conversation message apart from the title at a glance
     (previously three unlabeled gray fields stacked with no cue which was which).
     Auto-saves on blur. -->
<div class="overflow-hidden rounded-sm border bg-card shadow-sm">
  <div class="h-2.5 bg-epi-pink"></div>

  <div class="p-5">
    <input
      value={editor.title}
      aria-label="Titre du formulaire"
      placeholder="Titre du formulaire"
      class="w-full border-b border-transparent bg-transparent pb-1 text-2xl font-semibold tracking-tight outline-none focus:border-border"
      onblur={(e) =>
        e.currentTarget.value.trim() &&
        e.currentTarget.value !== editor.title &&
        editor.patchForm({ title: e.currentTarget.value })}
    />
  </div>

  <!-- Conversation framing: the bot's first and last messages, shown as bubbles. -->
  <div class="space-y-4 border-t bg-muted/20 p-5">
    <div class="flex items-center gap-2.5">
      <img
        src="/canard.png"
        alt=""
        class="h-7 w-7 shrink-0 rounded-full object-cover"
      />
      <div class="flex min-w-0 flex-col leading-tight">
        <span class="truncate text-sm font-medium">{persona}</span>
        <span class="text-[11px] text-muted-foreground">
          Ce que le canard dit autour des questions
        </span>
      </div>
    </div>

    <div class="space-y-1.5">
      <FieldLabel
        text="Message d'accueil"
        info="Premier message du canard, avant la première question. {'{prenom}'} est remplacé par le prénom du répondant."
      />
      <div
        class="rounded-2xl rounded-bl-sm border bg-background px-4 py-2.5 shadow-sm transition focus-within:border-epi-pink/50"
      >
        <Textarea
          value={editor.intro}
          rows={2}
          aria-label="Message d'accueil"
          placeholder={'Message d’accueil, ex. « Salut {prenom} ! Prêt pour le bilan ? »'}
          class="resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          onblur={(e) =>
            e.currentTarget.value.trim() &&
            e.currentTarget.value !== editor.intro &&
            editor.patchForm({ intro: e.currentTarget.value })}
        />
      </div>
    </div>

    <div class="space-y-1.5">
      <FieldLabel
        text="Message de fin"
        info="Dernier message, une fois le bilan terminé. Laisser vide pour le message par défaut."
      />
      <div
        class="rounded-2xl rounded-bl-sm border bg-background px-4 py-2.5 shadow-sm transition focus-within:border-epi-pink/50"
      >
        <Textarea
          value={editor.outro ?? ''}
          rows={2}
          aria-label="Message de fin"
          placeholder={'Message de fin (facultatif), ex. « Merci {prenom} ! »'}
          class="resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          onblur={(e) => {
            const next = e.currentTarget.value.trim() || null;
            if (next !== (editor.outro ?? null))
              editor.patchForm({ outro: next });
          }}
        />
      </div>
    </div>
  </div>
</div>
