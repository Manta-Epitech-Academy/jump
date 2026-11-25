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
  GREETING_DELAY_MS,
  REJOICE_MS,
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
    // Said typeset: the « ! » is bound to the word before it.
    expect(mascot.bubble).toMatchObject({
      text: 'Salut Lina\u00A0!',
      mood: 'calm',
    });

    await after(BUBBLE_MS + BETWEEN_LINES_MS);
    expect(mascot.bubble).toMatchObject({
      text: 'Merci pour Coding Club\u00A0!',
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
    expect(mascot.bubble).toMatchObject({ text: 'Salut Lina\u00A0!' });
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

/**
 * On arrival he says one line (#540): the first the PO wrote one for, and none
 * at all once a celebration has stood in for it.
 */
describe('MascotController, on arrival', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  function arriving() {
    return new MascotController({
      talentId: 't1',
      asleep: false,
      voice: () => ({
        hello: ['Salut {prenom} !'],
        eventTomorrow: ['Demain, {evenement} !'],
      }),
      tokens: () => ({ prenom: 'Lina' }),
      // `streak` has no live line: he passes over it.
      arrival: [
        { moment: 'streak', tokens: { serie: '7' } },
        { moment: 'eventTomorrow', tokens: { evenement: 'Coding Club' } },
        { moment: 'hello' },
      ],
      today: '2026-11-24',
    });
  }
  const after = (ms: number) => vi.advanceTimersByTimeAsync(ms);

  it('says the first line he has, and only that one', async () => {
    const mascot = arriving();
    mascot.arrive();
    await after(GREETING_DELAY_MS);
    expect(mascot.bubble).toMatchObject({
      text: 'Demain, Coding Club\u00A0!',
    });

    await after(BUBBLE_MS + BETWEEN_LINES_MS + BUBBLE_MS);
    expect(mascot.bubble).toBeNull();
  });

  it('says nothing more when a celebration took him first', async () => {
    const mascot = arriving();
    mascot.arrive();
    mascot.enterStage();
    mascot.leaveStage();
    await after(GREETING_DELAY_MS + BUBBLE_MS);
    expect(mascot.bubble).toBeNull();

    // Nor on the next page of the visit.
    const next = arriving();
    next.arrive();
    await after(GREETING_DELAY_MS);
    expect(next.bubble).toBeNull();
  });

  it('beams without a word when he rejoices', async () => {
    const mascot = arriving();
    mascot.rejoice();
    expect(mascot.joy).not.toBeNull();
    expect(mascot.bubble).toBeNull();
    expect(mascot.facingTalent).toBe(true);

    await after(REJOICE_MS);
    expect(mascot.joy).toBeNull();
  });
});
