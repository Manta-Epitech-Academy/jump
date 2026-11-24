/**
 * The sleep button is optimistic: the duck dives before the server answers,
 * and goes back to where he was if it refuses. Pinned here: going back also
 * puts him back on his way, so a refusal in the middle of a sulk or a way up
 * never leaves him stranded between two phases, frozen until a reload.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const putMascotToSleep = vi.fn();
vi.mock('./mascot.remote', () => ({
  putMascotToSleep: (args: unknown) => putMascotToSleep(args),
}));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }));

const { MascotController, DIVE_MS, EMERGE_MS, SULK_MS } =
  await import('./mascotController.svelte.ts');
const { SULK_POKES } = await import('./mascotPhase');

function duck() {
  return new MascotController({
    talentId: 't1',
    asleep: false,
    voice: () => ({}),
    tokens: () => ({}),
    greeting: null,
    today: '2026-11-24',
  });
}

/** Lets the refused request's catch run. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe('MascotController, when the server refuses a sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    putMascotToSleep.mockRejectedValue(new Error('refused'));
  });
  afterEach(() => {
    vi.useRealTimers();
    putMascotToSleep.mockReset();
  });

  it('ends the sulk he was in, and comes back up', async () => {
    const mascot = duck();
    for (let i = 0; i < SULK_POKES; i++) mascot.poke(i);
    await vi.advanceTimersByTimeAsync(DIVE_MS);
    expect(mascot.state).toEqual({ phase: 'under', reason: 'sulk' });

    void mascot.setAsleep(true);
    await settle();
    expect(mascot.state).toEqual({ phase: 'under', reason: 'sulk' });

    await vi.advanceTimersByTimeAsync(SULK_MS + EMERGE_MS);
    expect(mascot.state).toEqual({ phase: 'awake' });
  });

  it('finishes the way up he was on', async () => {
    const mascot = duck();
    for (let i = 0; i < SULK_POKES; i++) mascot.poke(i);
    await vi.advanceTimersByTimeAsync(DIVE_MS + SULK_MS);
    expect(mascot.state).toEqual({ phase: 'emerging' });

    void mascot.setAsleep(true);
    await settle();
    expect(mascot.state).toEqual({ phase: 'emerging' });

    await vi.advanceTimersByTimeAsync(EMERGE_MS);
    expect(mascot.state).toEqual({ phase: 'awake' });
  });

  it('stays on the water when he was on it', async () => {
    const mascot = duck();
    void mascot.setAsleep(true);
    await settle();
    expect(mascot.state).toEqual({ phase: 'awake' });
    expect(mascot.asleep).toBe(false);

    // The dive the refusal interrupted never lands him under.
    await vi.advanceTimersByTimeAsync(DIVE_MS);
    expect(mascot.state).toEqual({ phase: 'awake' });
  });
});
