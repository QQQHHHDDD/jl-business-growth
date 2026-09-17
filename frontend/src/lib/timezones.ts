const fallbackTimezones = [
  "UTC", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Taipei", "Asia/Tokyo", "Asia/Singapore",
  "Asia/Bangkok", "Asia/Dubai", "Europe/London", "Europe/Paris", "America/New_York",
  "America/Chicago", "America/Denver", "America/Los_Angeles", "Australia/Sydney",
];

type IntlWithSupportedValues = typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };

export const commonTimezones = [
  { id: "Asia/Shanghai", label: "中国大陆（上海）", aliases: "China Shanghai 中国 上海" },
  { id: "Asia/Hong_Kong", label: "中国香港", aliases: "Hong Kong 香港" },
  { id: "Asia/Taipei", label: "中国台湾（台北）", aliases: "Taiwan Taipei 台湾 台北" },
  { id: "Asia/Tokyo", label: "日本（东京）", aliases: "Japan Tokyo 日本 东京" },
  { id: "Asia/Singapore", label: "新加坡", aliases: "Singapore 新加坡" },
  { id: "Europe/London", label: "英国（伦敦）", aliases: "United Kingdom London 英国 伦敦" },
  { id: "America/New_York", label: "美国东部（纽约）", aliases: "US Eastern New York 美国东部 纽约" },
  { id: "America/Chicago", label: "美国中部（芝加哥）", aliases: "US Central Chicago 美国中部 芝加哥" },
  { id: "America/Denver", label: "美国山地（丹佛）", aliases: "US Mountain Denver 美国山地 丹佛" },
  { id: "America/Los_Angeles", label: "美国西部（洛杉矶）", aliases: "US Pacific Los Angeles 美国西部 洛杉矶" },
] as const;

export function supportedTimezones(current?: string): string[] {
  const nativeValues = (Intl as IntlWithSupportedValues).supportedValuesOf?.("timeZone") ?? fallbackTimezones;
  return Array.from(new Set([...(current ? [current] : []), "UTC", ...nativeValues])).sort((left, right) => left.localeCompare(right));
}

export function isSupportedTimezone(value: string, current?: string): boolean {
  return supportedTimezones(current).includes(value);
}

export function deviceTimezone(): string {
  const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isSupportedTimezone(value, value) ? value : "UTC";
}

export function formatTimezoneOffset(timezone: string, date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" }).formatToParts(date).find((item) => item.type === "timeZoneName")?.value ?? "GMT";
    if (part === "GMT") return "UTC";
    const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(part);
    if (!match) return part.replace("GMT", "UTC");
    return `UTC${match[1]}${Number(match[2])}${match[3] === "00" ? "" : `:${match[3]}`}`;
  } catch {
    return "UTC";
  }
}

export function timezoneLabel(timezone: string): string {
  const common = commonTimezones.find((item) => item.id === timezone);
  if (common) return common.label;
  const city = timezone.split("/").at(-1)?.replaceAll("_", " ") ?? timezone;
  return city === "UTC" ? "协调世界时" : city;
}

export function searchTimezones(query: string, current?: string, date = new Date()): string[] {
  const normalized = query.trim().toLowerCase();
  const values = supportedTimezones(current);
  if (!normalized) return values;
  return values.filter((timezone) => {
    const common = commonTimezones.find((item) => item.id === timezone);
    const haystack = [timezone, timezone.replaceAll("_", " "), timezoneLabel(timezone), common?.aliases ?? "", formatTimezoneOffset(timezone, date)].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });
}
