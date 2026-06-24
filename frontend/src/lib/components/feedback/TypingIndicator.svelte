<div
  class="flex max-w-[85%] self-start rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"
>
  <div class="flex items-center gap-1">
    <span class="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400"></span>
    <span
      class="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400"
      style="animation-delay:0.15s"
    ></span>
    <span
      class="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400"
      style="animation-delay:0.3s"
    ></span>
  </div>
</div>

<style>
  @media (prefers-reduced-motion: no-preference) {
    .typing-dot {
      animation: bounce-dot 1.2s ease-in-out infinite;
    }
  }
  @keyframes bounce-dot {
    0%,
    60%,
    100% {
      transform: translateY(0);
    }
    30% {
      transform: translateY(-4px);
    }
  }
</style>
