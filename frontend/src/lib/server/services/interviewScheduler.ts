import { CalendarDate, CalendarDateTime } from '@internationalized/date';

export interface SchedulerParams {
  stageStart: Date;
  stageEnd: Date;
  devIds: string[];
  interviewsPerDevPerDay: number;
  slotDurationMinutes: number;
  dayStartHour: number;
  dayEndHour: number;
  lunchStartHour: number;
  lunchEndHour: number;
  participationIds: string[];
  timezone: string;
}

export interface ProposedSlot {
  participationId: string;
  staffId: string;
  date: Date;
}

export interface ScheduleResult {
  slots: ProposedSlot[];
  unscheduled: string[];
  capacity: number;
}

export function generateSchedule(params: SchedulerParams): ScheduleResult {
  const {
    stageStart,
    stageEnd,
    devIds,
    interviewsPerDevPerDay,
    slotDurationMinutes,
    dayStartHour,
    dayEndHour,
    lunchStartHour,
    lunchEndHour,
    participationIds,
    timezone,
  } = params;

  if (devIds.length === 0 || participationIds.length === 0) {
    return { slots: [], unscheduled: [...participationIds], capacity: 0 };
  }

  const slotMinutesPerDay = enumerateSlotMinutes({
    slotDurationMinutes,
    dayStartHour,
    dayEndHour,
    lunchStartHour,
    lunchEndHour,
    maxPerDay: interviewsPerDevPerDay,
  });

  const days = enumerateWorkingDays(stageStart, stageEnd, timezone);
  const capacity = days.length * devIds.length * slotMinutesPerDay.length;

  const allSlots: { staffId: string; date: Date }[] = [];
  for (const day of days) {
    for (const minuteOfDay of slotMinutesPerDay) {
      const hour = Math.floor(minuteOfDay / 60);
      const minute = minuteOfDay % 60;
      for (const staffId of devIds) {
        const cdt = new CalendarDateTime(
          day.year,
          day.month,
          day.day,
          hour,
          minute,
        );
        allSlots.push({ staffId, date: cdt.toDate(timezone) });
      }
    }
  }

  const limit = Math.min(allSlots.length, participationIds.length);
  const slots: ProposedSlot[] = [];
  for (let i = 0; i < limit; i++) {
    slots.push({
      participationId: participationIds[i],
      staffId: allSlots[i].staffId,
      date: allSlots[i].date,
    });
  }

  return {
    slots,
    unscheduled: participationIds.slice(limit),
    capacity,
  };
}

function enumerateSlotMinutes(opts: {
  slotDurationMinutes: number;
  dayStartHour: number;
  dayEndHour: number;
  lunchStartHour: number;
  lunchEndHour: number;
  maxPerDay: number;
}): number[] {
  const {
    slotDurationMinutes,
    dayStartHour,
    dayEndHour,
    lunchStartHour,
    lunchEndHour,
    maxPerDay,
  } = opts;
  const out: number[] = [];
  const dayStartMin = dayStartHour * 60;
  const dayEndMin = dayEndHour * 60;
  const lunchStartMin = lunchStartHour * 60;
  const lunchEndMin = lunchEndHour * 60;
  for (
    let m = dayStartMin;
    m + slotDurationMinutes <= dayEndMin && out.length < maxPerDay;
    m += slotDurationMinutes
  ) {
    const slotEnd = m + slotDurationMinutes;
    const overlapsLunch =
      lunchEndMin > lunchStartMin && m < lunchEndMin && slotEnd > lunchStartMin;
    if (!overlapsLunch) out.push(m);
  }
  return out;
}

function enumerateWorkingDays(
  start: Date,
  end: Date,
  timezone: string,
): CalendarDate[] {
  const startCal = dateToCalendarDate(start, timezone);
  const endCal = dateToCalendarDate(end, timezone);
  const days: CalendarDate[] = [];
  let cur = startCal;
  while (compareCalendar(cur, endCal) <= 0) {
    if (isWeekday(cur)) days.push(cur);
    cur = cur.add({ days: 1 });
  }
  return days;
}

function dateToCalendarDate(d: Date, timezone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const lookup = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  return new CalendarDate(lookup('year'), lookup('month'), lookup('day'));
}

function compareCalendar(a: CalendarDate, b: CalendarDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

function isWeekday(d: CalendarDate): boolean {
  const dow = new Date(Date.UTC(d.year, d.month - 1, d.day, 12)).getUTCDay();
  return dow >= 1 && dow <= 5;
}
