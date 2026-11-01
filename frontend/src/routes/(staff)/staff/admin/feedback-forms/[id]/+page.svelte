<script lang="ts">
  import { untrack } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import Camera from '@lucide/svelte/icons/camera';
  import Loader2 from '@lucide/svelte/icons/loader-2';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import MessageSquareDashed from '@lucide/svelte/icons/message-square-dashed';
  import { Button } from '$lib/components/ui/button';
  import { InfoTooltip } from '$lib/components/ui/info-tooltip';
  import ChatScreen from '$lib/components/feedback/ChatScreen.svelte';
  import PersonaAvatar from '$lib/components/feedback/PersonaAvatar.svelte';
  import SegmentedFilter from '$lib/components/staff/SegmentedFilter.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import { DEFAULT_PERSONA } from '$lib/domain/feedbackForms/schema';
  import FormHeader from '../components/FormHeader.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  type Audience = 'authenticated' | 'public';
  const AUDIENCES: { value: Audience; label: string }[] = [
    { value: 'authenticated', label: 'Talent connecté' },
    { value: 'public', label: 'Répondant public' },
  ];

  // Opens on the experience the form actually offers: a public-only form as a
  // public respondent meets it, everything else as a connected talent.
  let audience = $state<Audience>(
    untrack(() =>
      data.form.allowsPublicAccess && !data.form.allowsAuthenticatedAccess
        ? 'public'
        : 'authenticated',
    ),
  );
  // "Recommencer" replays the conversation without leaving the page.
  let run = $state(0);

  const schema = $derived(data.schemas[audience]);
  // A connected talent is known (the copy is interpolated with it); a public
  // respondent is asked who they are in the conversation itself.
  const identity = $derived(
    audience === 'authenticated' ? { prenom: 'Marc', campus: 'Lyon' } : {},
  );
  // The preview never persists: the chat's final submit goes nowhere.
  const noop = async () => {};

  // The avatar is the one thing the admin API cannot set from a file on disk
  // (it takes an address), so its upload stays here, on the screen it shows on.
  let fileInput = $state<HTMLInputElement | null>(null);
  let iconBusy = $state(false);

  async function sendIcon(method: 'POST' | 'DELETE', file?: File) {
    iconBusy = true;
    try {
      let body: FormData | undefined;
      if (file) {
        body = new FormData();
        body.append('file', file);
      }
      const res = await fetch(
        `/api/feedback-forms/${data.form.id}/persona-icon`,
        { method, body },
      );
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        toast.error(b?.message ?? "Échec de l'enregistrement de l'icône.");
        return;
      }
      await invalidateAll();
    } catch {
      toast.error('Une erreur réseau est survenue.');
    } finally {
      iconBusy = false;
    }
  }

  function onPickIcon(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // let the same file be picked again after a reset
    if (file) sendIcon('POST', file);
  }
</script>

<svelte:head><title>Aperçu · {data.form.title}</title></svelte:head>

<div class="space-y-6 pb-16">
  <FormHeader
    formId={data.form.id}
    title={data.form.title}
    status={data.form.status}
  />

  <div class="flex flex-wrap items-center gap-3">
    <div class="mr-auto flex items-center gap-2.5">
      <button
        type="button"
        onclick={() => fileInput?.click()}
        disabled={iconBusy}
        aria-label="Changer l’icône de la mascotte"
        class="group relative block h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-full ring-1 ring-border transition hover:ring-foreground/40 disabled:cursor-wait"
      >
        <PersonaAvatar
          iconUrl={schema.personaIconUrl}
          alt={data.form.personaName ?? DEFAULT_PERSONA.name}
          class="h-full w-full"
        />
        <span
          class="absolute inset-0 flex items-center justify-center text-white transition {iconBusy
            ? 'bg-black/50 opacity-100'
            : 'bg-black/45 opacity-0 group-hover:opacity-100'}"
        >
          {#if iconBusy}
            <Loader2 class="h-4 w-4 animate-spin" />
          {:else}
            <Camera class="h-3.5 w-3.5" />
          {/if}
        </span>
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        class="hidden"
        onchange={onPickIcon}
      />
      <span class="text-sm font-medium">
        {data.form.personaName ?? DEFAULT_PERSONA.name}
      </span>
      <InfoTooltip
        label="L’icône de la mascotte"
        text="Cliquez sur l’icône pour la remplacer par une image PNG, JPEG ou WebP. Le reste du formulaire s’écrit par l’API admin (write_feedback_form)."
      />
      {#if data.form.personaIconKey}
        <Button
          variant="ghost"
          size="sm"
          class="h-7 cursor-pointer text-xs text-muted-foreground"
          disabled={iconBusy}
          onclick={() => sendIcon('DELETE')}
        >
          Rétablir l’icône par défaut
        </Button>
      {/if}
    </div>

    <SegmentedFilter
      options={AUDIENCES}
      value={audience}
      onChange={(v) => (audience = v as Audience)}
      ariaLabel="Qui répond"
    />
    <Button
      variant="outline"
      size="sm"
      class="h-8 cursor-pointer rounded-sm"
      onclick={() => run++}
      disabled={schema.questions.length === 0}
    >
      <RotateCcw class="mr-1.5 h-3.5 w-3.5" /> Recommencer
    </Button>
  </div>

  {#if schema.questions.length > 0}
    <div
      class="mx-auto h-[72vh] max-w-md overflow-hidden rounded-sm border bg-card shadow-raised"
    >
      {#key `${run}-${audience}`}
        <ChatScreen form={schema} onSubmit={noop} {identity} {audience} />
      {/key}
    </div>
  {:else}
    <ResultsNotice
      icon={MessageSquareDashed}
      title="Aucune question"
      description="Ce formulaire ne pose encore rien à ce public. Ses questions s’écrivent par l’API admin (write_feedback_form)."
    />
  {/if}
</div>
