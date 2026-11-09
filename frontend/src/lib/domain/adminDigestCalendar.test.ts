import { describe, it, expect } from 'vitest';
import { digestMonthStart, digestWeekOf } from './adminDigestCalendar';

// The week is the key a second trigger is refused on, so a Paris Monday morning
// filed under the previous week would let that Monday's digest go out twice.
describe('admin digest calendar', () => {
  it('keys a week by its Paris Monday, whatever the UTC day', () => {
    // 00:30 on Monday in Paris is still Sunday in UTC.
    expect(digestWeekOf(new Date('2031-03-09T23:30:00.000Z'))).toEqual(
      new Date('2031-03-10T00:00:00.000Z'),
    );
    // 23:30 on Sunday in Paris belongs to the week that is ending.
    expect(digestWeekOf(new Date('2031-03-16T22:30:00.000Z'))).toEqual(
      new Date('2031-03-10T00:00:00.000Z'),
    );
    // Across the switch to summer time (Sunday 30 March 2031).
    expect(digestWeekOf(new Date('2031-03-30T22:30:00.000Z'))).toEqual(
      new Date('2031-03-31T00:00:00.000Z'),
    );
  });

  it('starts a month at Paris midnight on its first day', () => {
    expect(digestMonthStart(new Date('2031-03-31T22:30:00.000Z'))).toEqual(
      new Date('2031-03-31T22:00:00.000Z'),
    );
  });
});
