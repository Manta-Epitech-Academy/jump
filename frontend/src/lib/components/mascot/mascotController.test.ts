/**
 * The sleep button is optimistic: the duck dives before the server answers,
 * and goes back to where he was if it refuses. Pinned here: going back also
 * puts him back on his way, so a refusal in the middle of a sulk or a way up
 * never leaves him stranded between two phases, frozen until a reload.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const putMascotToSleep = vi.fn();
const saveMascotLook = vi.fn();
vi.mock('./mascot.remote', () => ({
  putMascotToSleep: (args: unknown) => putMascotToSleep(args),
  saveMascotLook: (args: unknown) => saveMascotLook(args),
}));
const toastError = vi.fn();
vi.mock('svelte-sonner', () => ({ toast: { error: toastError } }));

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

/** A duck nobody dressed, as the server holds him. */
const UNDRESSED = {
  name: '',
  glasses: 'none',
  scarf: 'none',
  hair: 'tuft',
} as const;

function duck() {
  return new MascotController({
    talentId: 't1',
    asleep: false,
    choice: UNDRESSED,
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
 * Pressed quickly, the sleep button is saved in the order it was pressed
 * (#552): two presses sent at once could be stored in either order and wake
 * him on the next page.
 */
describe('MascotController, sleep and wake pressed in a row', () => {
  function heldSleeps() {
    const answers: { ok: () => void; refuse: () => void }[] = [];
    putMascotToSleep.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          answers.push({ ok: resolve, refuse: () => reject(new Error('no')) });
        }),
    );
    return answers;
  }
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    putMascotToSleep.mockReset();
  });

  it('sends the second press only once the first is stored', async () => {
    const answers = heldSleeps();
    const mascot = duck();
    mascot.setAsleep(true);
    mascot.setAsleep(false);
    expect(putMascotToSleep).toHaveBeenCalledOnce();
    expect(putMascotToSleep).toHaveBeenLastCalledWith({ asleep: true });

    answers[0].ok();
    await settle();
    expect(putMascotToSleep).toHaveBeenCalledTimes(2);
    expect(putMascotToSleep).toHaveBeenLastCalledWith({ asleep: false });
    expect(mascot.asleep).toBe(false);
  });

  it('sends nothing more, and says nothing, when the presses come back to what is stored', async () => {
    const answers = heldSleeps();
    toastError.mockClear();
    const mascot = duck();
    mascot.setAsleep(true);
    mascot.setAsleep(false);
    mascot.setAsleep(true);

    answers[0].ok();
    await settle();
    expect(putMascotToSleep).toHaveBeenCalledOnce();
    expect(toastError).not.toHaveBeenCalled();
    expect(mascot.asleep).toBe(true);
  });

  it('goes back to sleep when the wake that followed a stored sleep is refused', async () => {
    const answers = heldSleeps();
    const mascot = duck();
    mascot.setAsleep(true);
    answers[0].ok();
    await vi.advanceTimersByTimeAsync(DIVE_MS);
    expect(mascot.state).toEqual({ phase: 'under', reason: 'sleep' });

    mascot.setAsleep(false);
    answers[1].refuse();
    await settle();
    expect(mascot.state).toEqual({ phase: 'under', reason: 'sleep' });
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
      choice: UNDRESSED,
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
    const leave = mascot.enterStage();
    mascot.react({ moment: 'hello' });
    await after(BUBBLE_MS);
    expect(mascot.bubble).toBeNull();

    leave();
    expect(mascot.onStage).toBe(false);
    expect(mascot.bubble).toMatchObject({ text: 'Salut Lina\u00A0!' });
  });

  it('stays on the stage that holds him when the one before lets go', () => {
    // The talent left a page mid-celebration onto one with its own: the page
    // left behind letting go must not bring the header's duck back, nor its
    // queued lines, in the middle of the next page's scene.
    const mascot = talkative();
    const leftBehind = mascot.enterStage();
    const next = mascot.enterStage();
    mascot.react({ moment: 'hello' });

    leftBehind();
    expect(mascot.onStage).toBe(true);
    expect(mascot.bubble).toBeNull();

    next();
    expect(mascot.onStage).toBe(false);
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
    // The tab's own storage, fresh for each test. Node only defines it from
    // v25 on, so a test reading the runtime's would pass on one machine and
    // fail on CI's.
    const tab = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => tab.get(key) ?? null,
      setItem: (key: string, value: string) => void tab.set(key, value),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function arriving() {
    return new MascotController({
      talentId: 't1',
      asleep: false,
      choice: UNDRESSED,
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
    mascot.enterStage()();
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

/**
 * How the talent dressed him (#552): worn at once, saved in the order it was
 * chosen, and back to what the server stored if it refuses. Sent one request
 * per click, a burst of choices once came back in another order and rolled the
 * duck back to an older look.
 */
describe('MascotController, the look the talent chooses', () => {
  /** Holds every save until the test answers it. */
  function heldSaves() {
    const answers: { ok: () => void; refuse: () => void }[] = [];
    saveMascotLook.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          answers.push({ ok: resolve, refuse: () => reject(new Error('no')) });
        }),
    );
    return answers;
  }
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  afterEach(() => {
    saveMascotLook.mockReset();
    toastError.mockReset();
  });

  it('wears a choice at once, with his own name until he is given one', () => {
    heldSaves();
    const mascot = duck();
    mascot.choose({ hair: 'beanie' });
    expect(mascot.look).toEqual({
      name: 'EpiDuck',
      glasses: 'none',
      scarf: 'none',
      hair: 'beanie',
    });
    expect(mascot.savingLook).toBe(true);
  });

  it('saves a burst of choices in order, ending on the last one', async () => {
    const answers = heldSaves();
    const mascot = duck();
    mascot.choose({ scarf: 'pink' });
    mascot.choose({ scarf: 'green' });
    mascot.choose({ hair: 'beanie' });
    expect(saveMascotLook).toHaveBeenCalledOnce();

    answers[0].ok();
    await flush();
    expect(saveMascotLook).toHaveBeenCalledTimes(2);
    expect(saveMascotLook).toHaveBeenLastCalledWith({
      ...UNDRESSED,
      scarf: 'green',
      hair: 'beanie',
    });

    answers[1].ok();
    await flush();
    expect(mascot.savingLook).toBe(false);
    expect(mascot.choice).toEqual({
      ...UNDRESSED,
      scarf: 'green',
      hair: 'beanie',
    });
  });

  it('sends nothing for the choice he already wears', () => {
    heldSaves();
    duck().choose({ hair: 'tuft' });
    expect(saveMascotLook).not.toHaveBeenCalled();
  });

  it('goes back to the last look stored when the server refuses', async () => {
    const answers = heldSaves();
    const mascot = duck();
    mascot.choose({ glasses: 'sun' });
    answers[0].ok();
    await flush();
    mascot.choose({ glasses: 'geek' });
    answers[1].refuse();
    await flush();

    expect(mascot.choice).toEqual({ ...UNDRESSED, glasses: 'sun' });
    expect(toastError).toHaveBeenCalledOnce();
  });

  it('answers to the name the talent gave him', () => {
    heldSaves();
    const mascot = new MascotController({
      talentId: 't1',
      asleep: false,
      choice: UNDRESSED,
      voice: () => ({ poke: ['Coin, je suis {canard} !'] }),
      tokens: () => ({}),
      arrival: [],
      today: '2026-11-24',
    });
    mascot.choose({ name: 'Gaston' });
    mascot.poke();
    expect(mascot.bubble?.text).toBe('Coin, je suis Gaston\u00A0!');
  });
});
