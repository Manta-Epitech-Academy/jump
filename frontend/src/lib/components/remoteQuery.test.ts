import { describe, it, expect } from 'vitest';
import { settledAnswer } from './remoteQuery.svelte.ts';

/**
 * What an irreversible act may read off a remote query. The broadcast composer
 * states its count in the confirmation and sends on it, so each way a query can
 * still be `ready` on an answer that is not the one on screen is pinned here.
 */

const roster = { total: 3 };

type QueryState = {
  ready: boolean;
  loading: boolean;
  error: unknown;
  current: typeof roster | undefined;
};

function query(over: Partial<QueryState>): QueryState {
  return {
    ready: true,
    loading: false,
    error: undefined,
    current: roster,
    ...over,
  };
}

const onTheSameTargeting = { asked: 'campus-a', onScreen: 'campus-a' };

describe('settledAnswer', () => {
  it('reads the answer once it is settled for the argument on screen', () => {
    expect(settledAnswer(query({}), onTheSameTargeting)).toBe(roster);
  });

  it('reads nothing while the edit on screen has not been asked yet', () => {
    expect(
      settledAnswer(query({}), { asked: 'campus-a', onScreen: 'campus-b' }),
    ).toBeNull();
    expect(
      settledAnswer(query({}), { asked: null, onScreen: 'campus-a' }),
    ).toBeNull();
  });

  it('reads nothing while the query is asked again', () => {
    expect(
      settledAnswer(query({ loading: true }), onTheSameTargeting),
    ).toBeNull();
  });

  it('reads nothing after asking again failed, though kit keeps the answer', () => {
    expect(
      settledAnswer(query({ error: new Error('500') }), onTheSameTargeting),
    ).toBeNull();
  });

  it('reads nothing before the first answer, or without a query', () => {
    expect(
      settledAnswer(
        query({ ready: false, loading: true, current: undefined }),
        onTheSameTargeting,
      ),
    ).toBeNull();
    expect(settledAnswer(null, onTheSameTargeting)).toBeNull();
  });
});
