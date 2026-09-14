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
