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

const {
  MascotController,
  BETWEEN_LINES_MS,
  BUBBLE_MS,
  DIVE_MS,
  EMERGE_MS,
  SULK_MS,
} = await import('./mascotController.svelte.ts');
const { SULK_POKES } = await import('./mascotPhase');

function duck() {
  return new MascotController({
    talentId: 't1',
    asleep: false,
    voice: () => ({}),
    tokens: () => ({}),
    arrival: [],
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

/**
 * What he has to say waits its turn (#540): a reaction never cuts a greeting
 * short, a moment with no line is skipped rather than shown empty, and a
 * celebration holds the queue until he is back in the header.
 */
describe('MascotController, the lines that wait their turn', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function talkative() {
    return new MascotController({
      talentId: 't1',
      asleep: false,
      voice: () => ({
        hello: ['Salut {prenom} !'],
        feedbackDone: ['Merci pour {evenement} !'],
        checkIn: [],
      }),
      tokens: () => ({ prenom: 'Lina' }),
      arrival: [],
      today: '2026-11-24',
    });
  }
  const after = (ms: number) => vi.advanceTimersByTimeAsync(ms);

  it('says each line in turn, in order, with its mood', async () => {
    const mascot = talkative();
    mascot.react({ moment: 'hello' });
    mascot.react({ moment: 'checkIn' });
    mascot.react({
      moment: 'feedbackDone',
      tokens: { evenement: 'Coding Club' },
    });
    expect(mascot.bubble).toMatchObject({ text: 'Salut Lina !', mood: 'calm' });

    await after(BUBBLE_MS + BETWEEN_LINES_MS);
    expect(mascot.bubble).toMatchObject({
      text: 'Merci pour Coding Club !',
      mood: 'joy',
    });

    await after(BUBBLE_MS);
    expect(mascot.bubble).toBeNull();
  });

  it('keeps the queue while he is on stage, and resumes it after', async () => {
    const mascot = talkative();
    mascot.enterStage();
    mascot.react({ moment: 'hello' });
    await after(BUBBLE_MS);
    expect(mascot.bubble).toBeNull();

    mascot.leaveStage();
    expect(mascot.bubble).toMatchObject({ text: 'Salut Lina !' });
  });

  it('says nothing asleep, and keeps nothing for when he wakes', async () => {
    const mascot = talkative();
    putMascotToSleep.mockResolvedValue(undefined);
    void mascot.setAsleep(true);
    await after(DIVE_MS);
    mascot.react({ moment: 'hello' });

    void mascot.setAsleep(false);
    await after(EMERGE_MS + BUBBLE_MS + BETWEEN_LINES_MS);
    expect(mascot.bubble).toBeNull();
    putMascotToSleep.mockReset();
  });
});
