<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { onMount, untrack } from 'svelte';
  import { mode } from 'mode-watcher';
  import { Button } from '$lib/components/ui/button';
  import { triggerConfetti, triggerSideCannons } from '$lib/actions/confetti';
  import { minigameRewardToast } from '$lib/components/talent/rewardToast';
  import { MINIGAME_XP_REWARD } from '$lib/domain/xp';
  import TalentChromeHeader from '$lib/components/talent/TalentChromeHeader.svelte';
  import TalentFooter from '$lib/components/talent/TalentFooter.svelte';
  import XpFloat from '$lib/components/talent/XpFloat.svelte';
  import Home from '@lucide/svelte/icons/home';
  import Loader2 from '@lucide/svelte/icons/loader-circle';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  // The game's own consigne screen is the single pre-game gate, so this page no
  // longer shows a redundant "ready?" CTA: it mints the attempt on mount (a real
  // visit, never a hover-preload — `load` stays read-only) and embeds the iframe
  // straight away. The theme is captured once via `untrack` so toggling the mode
  // never rewrites the src and reloads the game mid-play; live changes go over
  // postMessage instead.
  const gamesOrigin = $derived(new URL(data.jumpGamesUrl).origin);
  const iframeSrc = $derived.by(() => {
    if (!form?.token) return null;
    const base = data.jumpGamesUrl.replace(/\/$/, '');
    const theme = untrack(() => mode.current ?? 'light');
    // Pass the XP at stake so the game can show the reward up front (consigne)
    // and during play — Jump owns the amount, the game just displays it. This is
    // the anticipation/incentive layer; the actual grant still happens
    // server-to-server on finish, never from this number.
    return `${base}/?token=${encodeURIComponent(form.token)}&theme=${theme}&reward=${MINIGAME_XP_REWARD}`;
  });

  let iframeEl = $state<HTMLIFrameElement>();
  let frameLoaded = $state(false);
  let playForm = $state<HTMLFormElement>();
  let ackForm = $state<HTMLFormElement>();
  let finished = $state(false);
  let celebrated = $state(false);
  let showXpFloat = $state(false);
  let failed = $state(false);

  // Mirror Jump's live theme into the running game without reloading it. Wait
  // for the frame to finish loading the games origin — posting earlier targets a
  // still-blank, same-origin document and throws a targetOrigin mismatch (the
  // initial theme rides in the iframe src anyway).
  $effect(() => {
    const current = mode.current;
    if (!frameLoaded) return;
    iframeEl?.contentWindow?.postMessage(
      { type: 'jumpgames:theme', theme: current },
      gamesOrigin,
    );
  });

  // Fire the XP-gain celebration when the game reports a valid finish, rather
  // than waiting for the next dashboard visit. The server-to-server callback has
  // already granted the XP by the time this message arrives; the acknowledge
  // form stamps xpSeenAt so the dashboard won't replay the float.
  //
  // The beats are layered across both frames (game juice): the in-game result
  // card assembles + counts up first (inside the iframe), THEN — after a short
  // lead-in — Jump's reward layers on top: XP float pops with a confetti burst,
  // side-cannon streams follow, and the recap toast slides in last so it reads
  // as a reward, not a notification.
  const celebrationTimers: ReturnType<typeof setTimeout>[] = [];
  const LEAD_IN = 950; // let the in-game card have its solo moment first
  function celebrate() {
    if (celebrated) return;
    celebrated = true;
    ackForm?.requestSubmit();

    celebrationTimers.push(
      setTimeout(() => {
        triggerConfetti();
        showXpFloat = true;
      }, LEAD_IN),
    );
    celebrationTimers.push(
      setTimeout(() => triggerSideCannons(), LEAD_IN + 850),
    );
    celebrationTimers.push(
      setTimeout(() => minigameRewardToast(MINIGAME_XP_REWARD), LEAD_IN + 1400),
    );
    celebrationTimers.push(
      setTimeout(() => (showXpFloat = false), LEAD_IN + 2600),
    );
  }

  onMount(() => {
    // Trust messages only from our own game iframe — comparing `event.source`
    // is robust where an origin string isn't (localhost vs 127.0.0.1, a proxied
    // JUMP_GAMES_URL) and ignores unrelated posts (e.g. Vite HMR).
    function onMessage(e: MessageEvent) {
      if (!iframeEl || e.source !== iframeEl.contentWindow) return;
      const msg = e.data;
      if (msg?.type === 'jumpgames:exit') {
        goto(resolve('/'));
      } else if (msg?.type === 'jumpgames:leaderboard') {
        goto(resolve(`/minigames/${data.publication.id}/leaderboard`));
      } else if (msg?.type === 'jumpgames:finished') {
        finished = true;
        if (msg.valid) celebrate();
      }
    }
    window.addEventListener('message', onMessage);

    // Real visit (not a preload): mint the attempt and load the game.
    playForm?.requestSubmit();

    return () => {
      window.removeEventListener('message', onMessage);
      celebrationTimers.forEach(clearTimeout);
    };
  });
</script>

{#if showXpFloat}
  <XpFloat amount={MINIGAME_XP_REWARD} label="Défi relevé !" />
{/if}

<!-- Hidden: mints the attempt on mount (`?/play`); its returned token mounts the
     iframe. A failure redirects (already played → leaderboard) or sets `failed`. -->
<form
  bind:this={playForm}
  method="POST"
  action="?/play"
  use:enhance={() =>
    async ({ update, result }) => {
      if (result.type === 'failure' || result.type === 'error') failed = true;
      await update();
    }}
  class="hidden"
></form>

<!-- One-shot: stamps xpSeenAt so the dashboard doesn't replay the celebration
     the talent has already seen here. -->
<form
  bind:this={ackForm}
  method="POST"
  action="?/acknowledgeMinigameReward"
  use:enhance={() => () => {}}
  class="hidden"
></form>

<div class="flex min-h-screen flex-col">
  <div class="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
    <!-- No title here: the embedded game shows its own (consigne card + in-game
         header), so repeating it in the host chrome is redundant. -->
    <TalentChromeHeader />

    {#if iframeSrc}
      <!-- No card chrome here: the game paints its own Talent-style page (slate
           background + white/slate-900 cards) inside the frame, so wrapping it
           in another card would double up. -->
      <div
        class="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800"
      >
        <iframe
          bind:this={iframeEl}
          onload={() => (frameLoaded = true)}
          src={iframeSrc}
          title="Entraînement"
          sandbox="allow-scripts allow-same-origin"
          referrerpolicy="no-referrer"
          allow="fullscreen"
          class="block h-[720px] w-full border-0"
        ></iframe>
      </div>

      <!-- Post-game navigation lives on the game's own result card (Voir le
           classement / Retour), so there are no duplicate buttons out here. -->
      {#if !finished}
        <p class="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
          Reste sur cette page jusqu'à la fin de ta partie.
        </p>
      {/if}
    {:else}
      <div
        class="flex flex-col items-center gap-4 rounded-3xl bg-white p-10 text-center shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
      >
        {#if failed}
          <p class="text-sm text-slate-500 dark:text-slate-400">
            Impossible de lancer l'entraînement pour le moment.
          </p>
          <Button href={resolve('/')} variant="outline">
            <Home class="mr-2 h-4 w-4" /> Retour à l'accueil
          </Button>
        {:else}
          <Loader2 class="h-8 w-8 animate-spin text-epi-blue" />
          <p class="text-sm text-slate-500 dark:text-slate-400">
            Préparation de ton entraînement…
          </p>
        {/if}
      </div>
    {/if}
  </div>

  <TalentFooter />
</div>
