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

function zonedParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

export function formatDateTimeInTimezone(value: string | Date, timezone: string): string {
  const parts = zonedParts(typeof value === "string" ? new Date(value) : value, timezone);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function zonedDateTimeToISO(value: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new RangeError("datetime-local value is invalid");
  const [, year, month, day, hour, minute] = match.map(Number);
  const desiredWallTime = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = new Date(desiredWallTime);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = zonedParts(candidate, timezone);
    const representedWallTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    candidate = new Date(candidate.getTime() + desiredWallTime - representedWallTime);
  }
  const finalParts = zonedParts(candidate, timezone);
  if (
    finalParts.year !== year
    || finalParts.month !== month
    || finalParts.day !== day
    || finalParts.hour !== hour
    || finalParts.minute !== minute
    || finalParts.second !== 0
  ) {
    throw new RangeError("所选时间在当前时区不存在，请重新选择。");
  }
  return candidate.toISOString();
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
