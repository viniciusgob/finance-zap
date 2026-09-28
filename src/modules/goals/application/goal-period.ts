import { addDays, addMonths, addWeeks, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { GoalPeriod } from '../../../shared/types/prisma-enums.js';

export interface GoalPeriodRange {
  start: Date;
  endExclusive: Date;
  /** Ex.: "27/09", "21/09 a 27/09", "setembro". */
  label: string;
}

/** Intervalo (UTC) do período da meta que contém `reference`, no fuso do usuário. Semana começa na segunda. */
export function goalPeriodRange(
  reference: Date,
  timeZone: string,
  period: GoalPeriod,
): GoalPeriodRange {
  const zRef = toZonedTime(reference, timeZone);
  let localStart: Date;
  let localEnd: Date;
  if (period === 'DAILY') {
    localStart = startOfDay(zRef);
    localEnd = addDays(localStart, 1);
  } else if (period === 'WEEKLY') {
    localStart = startOfWeek(zRef, { weekStartsOn: 1 });
    localEnd = addWeeks(localStart, 1);
  } else {
    localStart = startOfMonth(zRef);
    localEnd = addMonths(localStart, 1);
  }
  const start = fromZonedTime(localStart, timeZone);
  const endExclusive = fromZonedTime(localEnd, timeZone);

  let label: string;
  if (period === 'DAILY') {
    label = formatInTimeZone(start, timeZone, 'dd/MM');
  } else if (period === 'WEEKLY') {
    const lastDay = fromZonedTime(addDays(localEnd, -1), timeZone);
    label = `${formatInTimeZone(start, timeZone, 'dd/MM')} a ${formatInTimeZone(lastDay, timeZone, 'dd/MM')}`;
  } else {
    label = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone }).format(start);
  }
  return { start, endExclusive, label };
}

export function goalPeriodAdjective(period: GoalPeriod): string {
  if (period === 'DAILY') return 'diária';
  if (period === 'WEEKLY') return 'semanal';
  return 'mensal';
}
