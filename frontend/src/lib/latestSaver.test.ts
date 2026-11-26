/**
 * The saver behind every control that applies at once (#552): the server ends
 * on the last value chosen, whatever the clicks and the answers' order.
 */
import { describe, it, expect, vi } from 'vitest';
import { LatestSaver } from './latestSaver.svelte.ts';

/** A save the test answers by hand, one request at a time. */
function server() {
  const calls: { value: string; ok: () => void; refuse: () => void }[] = [];
  const save = vi.fn(
    (value: string) =>
      new Promise<void>((resolve, reject) => {
        calls.push({
          value,
          ok: resolve,
          refuse: () => reject(new Error('refused')),
        });
      }),
  );
  return { calls, save };
}

/** Lets the saver react to an answer. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('LatestSaver', () => {
  it('sends one value at a time, then only the last one chosen meanwhile', async () => {
    const { calls, save } = server();
    const saver = new LatestSaver<string>('a', save, vi.fn());

    saver.push('b');
    saver.push('c');
    saver.push('d');
    expect(calls.map((c) => c.value)).toEqual(['b']);

    calls[0].ok();
    await flush();
    expect(calls.map((c) => c.value)).toEqual(['b', 'd']);

    calls[1].ok();
    await flush();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('is busy from the first push until the last answer', async () => {
    const { calls, save } = server();
    const saver = new LatestSaver<string>('a', save, vi.fn());
    expect(saver.busy).toBe(false);

    saver.push('b');
    saver.push('c');
    expect(saver.busy).toBe(true);
    calls[0].ok();
    await flush();
    expect(saver.busy).toBe(true);
    calls[1].ok();
    await flush();
    expect(saver.busy).toBe(false);
  });

  it('hands back the last value stored when the last save is refused', async () => {
    const { calls, save } = server();
    const onFailed = vi.fn();
    const saver = new LatestSaver<string>('a', save, onFailed);

    saver.push('b');
    saver.push('c');
    calls[0].ok();
    await flush();
    calls[1].refuse();
    await flush();

    expect(onFailed).toHaveBeenCalledOnce();
    expect(onFailed).toHaveBeenCalledWith('b');
    expect(saver.busy).toBe(false);
  });

  it('hands back what the server held before, when nothing went through', async () => {
    const { calls, save } = server();
    const onFailed = vi.fn();
    const saver = new LatestSaver<string>('a', save, onFailed);

    saver.push('b');
    calls[0].refuse();
    await flush();

    expect(onFailed).toHaveBeenCalledWith('a');
  });

  it('says nothing of a refusal a later save made up for', async () => {
    const { calls, save } = server();
    const onFailed = vi.fn();
    const saver = new LatestSaver<string>('a', save, onFailed);

    saver.push('b');
    saver.push('c');
    calls[0].refuse();
    await flush();
    calls[1].ok();
    await flush();

    expect(onFailed).not.toHaveBeenCalled();
  });

  it('starts a new burst from what the last one stored', async () => {
    const { calls, save } = server();
    const onFailed = vi.fn();
    const saver = new LatestSaver<string>('a', save, onFailed);

    saver.push('b');
    calls[0].ok();
    await flush();
    saver.push('c');
    calls[1].refuse();
    await flush();

    expect(onFailed).toHaveBeenCalledWith('b');
  });
});
