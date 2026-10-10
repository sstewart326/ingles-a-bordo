/** Translation keys for US federal holiday display names. */
export type HolidayNameKey =
  | 'holidayNewYearsDay'
  | 'holidayMartinLutherKingJrDay'
  | 'holidayPresidentsDay'
  | 'holidayMemorialDay'
  | 'holidayJuneteenth'
  | 'holidayIndependenceDay'
  | 'holidayLaborDay'
  | 'holidayVeteransDay'
  | 'holidayThanksgiving'
  | 'holidayChristmasDay';

export interface USHoliday {
  /** Stable id for the holiday (not year-specific). */
  key: string;
  /** Local calendar date for this occurrence. */
  date: Date;
  /** Key into the Translation object for the display name. */
  nameKey: HolidayNameKey;
}

/** 0 = Sunday … 6 = Saturday (matches Date.getDay()). */
export function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: number,
  n: number
): Date {
  const first = new Date(year, monthIndex, 1);
  const firstWeekday = first.getDay();
  let day = 1 + ((weekday - firstWeekday + 7) % 7) + (n - 1) * 7;
  return new Date(year, monthIndex, day);
}

export function lastWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: number
): Date {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const last = new Date(year, monthIndex, lastDay);
  const lastWeekday = last.getDay();
  const offset = (lastWeekday - weekday + 7) % 7;
  return new Date(year, monthIndex, lastDay - offset);
}

function localDate(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day);
}

export function getUSHolidaysForYear(year: number): USHoliday[] {
  return [
    {
      key: 'new-years-day',
      date: localDate(year, 0, 1),
      nameKey: 'holidayNewYearsDay',
    },
    {
      key: 'martin-luther-king-jr-day',
      date: nthWeekdayOfMonth(year, 0, 1, 3),
      nameKey: 'holidayMartinLutherKingJrDay',
    },
    {
      key: 'presidents-day',
      date: nthWeekdayOfMonth(year, 1, 1, 3),
      nameKey: 'holidayPresidentsDay',
    },
    {
      key: 'memorial-day',
      date: lastWeekdayOfMonth(year, 4, 1),
      nameKey: 'holidayMemorialDay',
    },
    {
      key: 'juneteenth',
      date: localDate(year, 5, 19),
      nameKey: 'holidayJuneteenth',
    },
    {
      key: 'independence-day',
      date: localDate(year, 6, 4),
      nameKey: 'holidayIndependenceDay',
    },
    {
      key: 'labor-day',
      date: nthWeekdayOfMonth(year, 8, 1, 1),
      nameKey: 'holidayLaborDay',
    },
    {
      key: 'veterans-day',
      date: localDate(year, 10, 11),
      nameKey: 'holidayVeteransDay',
    },
    {
      key: 'thanksgiving',
      date: nthWeekdayOfMonth(year, 10, 4, 4),
      nameKey: 'holidayThanksgiving',
    },
    {
      key: 'christmas-day',
      date: localDate(year, 11, 25),
      nameKey: 'holidayChristmasDay',
    },
  ];
}

export function getHolidayOnDate(date: Date): USHoliday | null {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  return (
    getUSHolidaysForYear(year).find(
      (h) =>
        h.date.getFullYear() === year &&
        h.date.getMonth() === month &&
        h.date.getDate() === day
    ) ?? null
  );
}
