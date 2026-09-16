export function businessDate(timezone: string, value = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

export function businessDateDaysAgo(timezone: string, days: number): string {
  return businessDate(timezone, new Date(Date.now() - days * 86400000));
}

export type BusinessRangePreset =
  | "week"
  | "month"
  | "calendarYear"
  | "fiscalYear";

export type ReviewPeriodType = "DAILY" | "WEEKLY" | "MONTHLY";

function calendarDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function isoCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addCalendarDays(value: string, days: number): string {
  const date = calendarDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoCalendarDate(date);
}

export function reviewPeriodStart(
  timezone: string,
  type: ReviewPeriodType,
  value = new Date(),
): string {
  const current = calendarDate(businessDate(timezone, value));
  if (type === "WEEKLY") {
    const mondayOffset = (current.getUTCDay() + 6) % 7;
    current.setUTCDate(current.getUTCDate() - mondayOffset);
  }
  if (type === "MONTHLY") current.setUTCDate(1);
  return isoCalendarDate(current);
}

export function reviewPeriodEnd(
  periodStart: string,
  type: ReviewPeriodType,
): string {
  if (type === "DAILY") return periodStart;
  if (type === "WEEKLY") return addCalendarDays(periodStart, 6);
  const start = calendarDate(periodStart);
  start.setUTCMonth(start.getUTCMonth() + 1, 0);
  return isoCalendarDate(start);
}

export function businessRange(
  timezone: string,
  preset: BusinessRangePreset,
  value = new Date(),
): { from: string; to: string; granularity: "day" | "month" } {
  const current = calendarDate(businessDate(timezone, value));
  let from: Date;
  let to: Date;
  let granularity: "day" | "month" = "day";

  if (preset === "week") {
    const mondayOffset = (current.getUTCDay() + 6) % 7;
    from = new Date(current);
    from.setUTCDate(from.getUTCDate() - mondayOffset);
    to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 6);
  } else if (preset === "month") {
    from = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1, 12));
    to = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0, 12));
  } else if (preset === "calendarYear") {
    from = new Date(Date.UTC(current.getUTCFullYear(), 0, 1, 12));
    to = new Date(Date.UTC(current.getUTCFullYear(), 11, 31, 12));
    granularity = "month";
  } else {
    const fiscalStartYear = current.getUTCMonth() >= 8
      ? current.getUTCFullYear()
      : current.getUTCFullYear() - 1;
    from = new Date(Date.UTC(fiscalStartYear, 8, 1, 12));
    to = new Date(Date.UTC(fiscalStartYear + 1, 7, 31, 12));
    granularity = "month";
  }

  return { from: isoCalendarDate(from), to: isoCalendarDate(to), granularity };
}
