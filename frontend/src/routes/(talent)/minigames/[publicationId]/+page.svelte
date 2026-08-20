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
  import TalentPageHeader from '$lib/components/talent/TalentPageHeader.svelte';
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

  // The frame sizes itself to the game's content: jump-games posts its document
  // height (`jumpgames:resize`). A generous floor keeps short content on a stable,
  // roomy canvas instead of snapping the frame tight around a small card.
  const MIN_FRAME_HEIGHT = 720;
  // Space kept clear below the frame (the TalentFooter + breathing room) so the
  // capped frame leaves the footer on-screen instead of pushing the page into
  // scrolling.
  const FRAME_BOTTOM_GAP = 100;
  let contentHeight = MIN_FRAME_HEIGHT;
  let frameHeight = $state(MIN_FRAME_HEIGHT);

  // Grow toward the content height, but cap at the space actually visible below
  // the page chrome (which includes the impersonation banner when present). A
  // tall game then scrolls *inside* the iframe — so its own sticky header (the
  // chrono) stays put — instead of growing the frame past the viewport and
  // scrolling the whole Talent page out from under it.
  function sizeFrame() {
    const desired = Math.max(MIN_FRAME_HEIGHT, contentHeight);
    if (typeof window === 'undefined' || !iframeEl) {
      frameHeight = desired;
      return;
    }
    const offsetTop = iframeEl.getBoundingClientRect().top + window.scrollY;
    const cap = Math.max(
      360,
      window.innerHeight - offsetTop - FRAME_BOTTOM_GAP,
    );
    frameHeight = Math.min(desired, cap);
  }
  let playForm = $state<HTMLFormElement>();
  let ackForm = $state<HTMLFormElement>();
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
      } else if (msg?.type === 'jumpgames:resize') {
        if (typeof msg.height === 'number' && msg.height > 0) {
          contentHeight = Math.ceil(msg.height);
          sizeFrame();
        }
      } else if (msg?.type === 'jumpgames:finished') {
        if (msg.valid) celebrate();
      }
    }
    window.addEventListener('message', onMessage);
    // The cap depends on the viewport, so re-size the frame when it changes.
    window.addEventListener('resize', sizeFrame);

    // Real visit (not a preload): mint the attempt and load the game.
    playForm?.requestSubmit();

    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('resize', sizeFrame);
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
  <TalentPageHeader title="Mission du jour" backLabel="Retour à l'accueil" />
  <div class="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
    {#if iframeSrc}
      <!-- No card chrome here: the game paints its own Talent-style page (slate
           background + white/slate-900 cards) inside the frame, so wrapping it
           in another card would double up. -->
      <div class="overflow-hidden rounded-xl border border-border">
        <iframe
          bind:this={iframeEl}
          onload={() => {
            frameLoaded = true;
            sizeFrame();
          }}
          src={iframeSrc}
          title="Entraînement"
          sandbox="allow-scripts allow-same-origin"
          referrerpolicy="no-referrer"
          allow="fullscreen"
          style="height: {frameHeight}px;"
          class="block w-full border-0"
        ></iframe>
      </div>

      <!-- Post-game navigation lives on the game's own result card (Voir le
           classement / Retour), and the "reste sur cette page" reminder now lives
           inside the frame, so there's no chrome to add out here. -->
    {:else}
      <div
        class="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-10 text-center shadow-raised"
      >
        {#if failed}
          <p class="text-sm text-muted-foreground">
            Impossible de lancer l'entraînement pour le moment.
          </p>
          <Button href={resolve('/')} variant="outline">
            <Home class="mr-2 h-4 w-4" /> Retour à l'accueil
          </Button>
        {:else}
          <Loader2 class="h-8 w-8 animate-spin text-epi-blue" />
          <p class="text-sm text-muted-foreground">
            Préparation de ton entraînement…
          </p>
        {/if}
      </div>
    {/if}
  </div>

  <TalentFooter />
</div>
