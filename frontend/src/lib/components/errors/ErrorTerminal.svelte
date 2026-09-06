<script lang="ts">
  import { page } from '$app/state';
  import SearchX from '@lucide/svelte/icons/search-x';
  import ServerCrash from '@lucide/svelte/icons/server-crash';
  import Terminal from '@lucide/svelte/icons/terminal';
  import House from '@lucide/svelte/icons/house';

  // The branded "system log" error screen, shared by the root and staff error
  // boundaries so every unstyled status (404 / 500 / …) reads the same. The
  // caller passes the home link because the destination differs by audience
  // (talent dashboard vs the acting staff member's workspace).
  let {
    homeHref,
    homeLabel = "Retour à l'accueil",
  }: {
    homeHref: string;
    homeLabel?: string;
  } = $props();

  const is404 = $derived(page.status === 404);
  const message = $derived(page.error?.message);
  // A custom 404 message (e.g. "Stagiaire introuvable") is worth surfacing; the
  // segfault gag is only the fallback for a bare unmatched-route 404 ("Not
  // Found"), which carries no useful detail.
  const genericNotFound = $derived(!message || message === 'Not Found');
</script>

<div class="error-container">
  <!-- Decorative Background Watermark -->
  <div class="watermark" aria-hidden="true">
    {page.status}
  </div>

  <!-- Main Content Container -->
  <div class="content">
    <!-- Icon with Glow -->
    <div class="icon-container">
      <div class="glow" class:glow-404={is404} class:glow-error={!is404}></div>
      <div
        class="icon-circle"
        class:border-404={is404}
        class:border-error={!is404}
      >
        {#if is404}
          <SearchX color="var(--epi-together)" size={48} />
        {:else}
          <ServerCrash color="var(--error-color)" size={48} />
        {/if}
      </div>
    </div>

    <!-- Error Code -->
    <h1 class="error-title">
      {#if is404}
        <span class="text-blue">4</span>0<span class="text-orange">4</span>
      {:else}
        <span class="text-error">{page.status}</span>
      {/if}
    </h1>

    <!-- Error Message -->
    <h2 class="error-subtitle">
      {#if is404}
        Page introuvable<span class="text-teal">_</span>
      {:else}
        Erreur Système<span class="text-error">_</span>
      {/if}
    </h2>

    <!-- Terminal / Log Box -->
    <div class="terminal">
      <div class="terminal-header">
        <Terminal size={14} />
        <span>System Log</span>
      </div>
      <div class="terminal-body">
        <div class="log-line">
          <span
            class="log-prompt"
            class:text-blue={is404}
            class:text-error={!is404}
          >
            &gt; error:
          </span>
          <span>
            {#if is404 && genericNotFound}
              Segmentation fault (core dumped). L'URL demandée pointe vers une
              zone mémoire non allouée.
            {:else}
              {message || 'Exception non gérée survenue lors du traitement.'}
            {/if}
          </span>
        </div>
        {#if !is404}
          <div class="log-line hint">
            <span class="log-prompt">&gt; hint:</span>
            <span>Veuillez contacter l'administrateur système.</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- Action Button -->
    <a href={homeHref} class="btn-home">
      <House size={18} />
      {homeLabel}
    </a>
  </div>
</div>

<style>
  /* Anton and IBM Plex Sans are already self-hosted app-wide (`+layout.svelte`
     imports them from @fontsource), so this screen needs no font import of its
     own. It used to @import them from Google, which was both redundant and the
     last remote font fetch left in the app. */

  /* Map the screen's local palette onto the app's theme tokens so it resolves
     correctly and follows light/dark, instead of the never-defined custom
     names it used to reference. */
  .error-container {
    --bg-color: var(--background);
    --text-color: var(--foreground);
    --error-color: var(--destructive);
    --card-bg: var(--card);
    --muted-bg: var(--muted);
    --muted-text: var(--muted-foreground);
    --border-color: var(--border);

    position: relative;
    display: flex;
    min-height: 100vh;
    width: 100vw;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background-color: var(--bg-color);
    padding: 1rem;
    box-sizing: border-box;
  }

  .watermark {
    pointer-events: none;
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.03;
    font-family: 'Anton', sans-serif;
    font-size: clamp(12rem, 30vw, 25rem);
    line-height: 1;
    user-select: none;
    color: var(--text-color);
  }

  .content {
    z-index: 10;
    display: flex;
    width: 100%;
    max-width: 32rem;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .icon-container {
    position: relative;
    margin-bottom: 1.5rem;
  }

  .glow {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    filter: blur(24px);
    opacity: 0.2;
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.2;
    }
    50% {
      opacity: 0.4;
    }
  }

  .glow-404 {
    background-color: var(--epi-together);
  }
  .glow-error {
    background-color: var(--error-color);
  }

  .icon-circle {
    position: relative;
    display: flex;
    height: 6rem;
    width: 6rem;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 4px solid;
    background-color: var(--card-bg);
    box-shadow:
      0 20px 25px -5px rgb(0 0 0 / 0.1),
      0 8px 10px -6px rgb(0 0 0 / 0.1);
    transition: transform 0.2s;
  }

  .icon-circle:hover {
    transform: scale(1.05);
  }

  .border-404 {
    border-color: var(--epi-together);
  }
  .border-error {
    border-color: var(--error-color);
  }

  .error-title {
    margin: 0 0 0.5rem 0;
    font-family: 'Anton', sans-serif;
    font-size: clamp(3.75rem, 10vw, 6rem);
    font-weight: 400;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-color);
  }

  .text-blue {
    color: var(--epi-blue);
  }
  .text-orange {
    color: var(--epi-together);
  }
  .text-teal {
    color: var(--epi-tech);
  }
  .text-error {
    color: var(--error-color);
  }

  .error-subtitle {
    margin: 0 0 2rem 0;
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-color);
  }

  @media (min-width: 768px) {
    .error-subtitle {
      font-size: 1.5rem;
    }
  }

  .terminal {
    margin-bottom: 2rem;
    width: 100%;
    overflow: hidden;
    border-radius: 0.25rem;
    border: 1px solid var(--border-color);
    background-color: var(--card-bg);
    text-align: left;
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  }

  .terminal-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-bottom: 1px solid var(--border-color);
    background-color: var(--muted-bg);
    padding: 0.5rem 0.75rem;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted-text);
  }

  .terminal-body {
    background-color: color-mix(in srgb, var(--muted-bg) 50%, transparent);
    padding: 1rem;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
      'Courier New', monospace;
    font-size: 0.75rem;
    color: var(--muted-text);
  }

  .log-line {
    display: flex;
    gap: 0.5rem;
  }

  .hint {
    margin-top: 0.5rem;
    color: var(--error-color);
    opacity: 0.8;
  }

  .log-prompt {
    flex-shrink: 0;
    font-weight: 700;
  }

  .btn-home {
    display: inline-flex;
    height: 3rem;
    min-width: 10rem;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border-radius: 0.25rem;
    background-color: var(--epi-blue);
    padding: 0 2rem;
    font-size: 0.875rem;
    font-weight: 700;
    color: #ffffff;
    text-decoration: none;
    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
    transition: all 0.2s;
    border: none;
    cursor: pointer;
  }

  .btn-home:hover {
    background-color: color-mix(in srgb, var(--epi-blue) 90%, transparent);
    transform: translateY(-2px);
  }
</style>
